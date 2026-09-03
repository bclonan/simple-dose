import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useClearDoseActions } from '../../src/services/cleardose.actions'
import { useAgentActivityStore } from '../../src/stores/agentActivity.store'
import { useCartStore } from '../../src/stores/cart.store'
import { useOrderStore } from '../../src/stores/order.store'
import {
  clearDoseToolCatalog,
  createClearDoseToolDefinitions,
  webMcpContractBudgets,
} from '../../src/webmcp/definitions'
import type { JsonValue } from '../../src/webmcp/types'

const checkoutIdentity = {
  fullName: 'Demo User',
  address: {
    line1: '100 Demo Street',
    city: 'Baltimore',
    state: 'MD',
    postalCode: '21201',
  },
} as const

const atorvastatin = {
  offerId: 'offer-atorvastatin-20-90-cleardose',
  deliveryOptionId: 'standard',
} as const

const metformin = {
  offerId: 'offer-metformin-500-30-cleardose',
  deliveryOptionId: 'standard',
} as const

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-31T16:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

const objectResult = (value: JsonValue | undefined): Record<string, JsonValue> => {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Expected a WebMCP object result.')
  }
  return value
}

const arrayResult = (value: JsonValue | undefined): JsonValue[] => {
  if (!Array.isArray(value)) throw new Error('Expected a WebMCP array result.')
  return value
}

describe('multi-item prescription checkout acceptance', () => {
  it('does not let one prepared request cover a second prescription medication', async () => {
    const actions = useClearDoseActions()

    await actions.createPrescriptionRequestCard(atorvastatin)
    actions.addToCart(atorvastatin)
    actions.addToCart(metformin)

    await expect(
      actions.checkoutDemoOrder({
        ...checkoutIdentity,
        prescriptionStatus: 'request-prepared',
      }),
    ).rejects.toThrow(/multiple|one medication|provider-will-send/i)

    expect(useOrderStore().orders).toHaveLength(0)
    expect(useCartStore().itemCount).toBe(2)
  })

  it('keeps both medications in the demo order when the provider-will-send path is used', async () => {
    const actions = useClearDoseActions()
    actions.addToCart(atorvastatin)
    actions.addToCart(metformin)

    const cartTotal = useCartStore().grandTotal
    const result = await actions.checkoutDemoOrder({
      ...checkoutIdentity,
      prescriptionStatus: 'provider-will-send',
    })

    expect(result.total).toBe(cartTotal)
    expect(useOrderStore().currentOrder).toMatchObject({
      prescriptionStatus: 'provider-will-send',
      total: cartTotal,
      items: [
        { skuId: 'sku-atorvastatin-tablet-20mg-90' },
        { skuId: 'sku-metformin-tablet-500mg-30' },
      ],
    })
    expect(useCartStore().itemCount).toBe(0)
  })
})

describe('cart-savings WebMCP ordering acceptance', () => {
  it('is read-only, paged, and preserves aggregate savings outside the item page', async () => {
    const actions = useClearDoseActions()
    actions.addToCart({
      offerId: 'offer-atorvastatin-10-30-partnerrx',
      deliveryOptionId: 'express',
    })
    actions.addToCart({
      offerId: 'offer-metformin-500-30-communityrx',
      deliveryOptionId: 'pickup',
    })

    const descriptor = clearDoseToolCatalog.find(
      (tool) => tool.name === 'compare_cart_savings',
    )
    const definition = createClearDoseToolDefinitions(actions, 'demo').find(
      (tool) => tool.name === 'compare_cart_savings',
    )
    expect(descriptor?.annotations).toMatchObject({
      readOnlyHint: true,
      untrustedContentHint: true,
    })
    if (!definition) throw new Error('Missing compare_cart_savings definition.')

    const result = objectResult(await definition.execute({ offset: 0, limit: 1 }))
    expect(result).toMatchObject({
      itemCount: 2,
      returned: 1,
      truncated: true,
      nextOffset: 1,
      currentTotal: 31.75,
      optimizedTotal: 25.75,
      potentialSavings: 6,
      itemsWithSavings: 2,
    })
    expect(objectResult(arrayResult(result.items)[0]!)).toMatchObject({
      comparisonAvailable: true,
      isLowestAvailable: false,
    })
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(webMcpContractBudgets.output)
  })

  it('updates delivery in place when the cheaper option uses the same offer', async () => {
    const actions = useClearDoseActions()
    const definitions = new Map(
      createClearDoseToolDefinitions(actions, 'demo').map((tool) => [tool.name, tool]),
    )
    const add = definitions.get('add_to_cart')
    const compare = definitions.get('compare_cart_savings')
    const setDelivery = definitions.get('set_delivery_option')
    if (!add || !compare || !setDelivery) {
      throw new Error('Missing same-offer savings WebMCP tools.')
    }

    const added = objectResult(
      await add.execute({
        offerId: 'offer-atorvastatin-20-90-cleardose',
        deliveryOptionId: 'express',
      }),
    )
    const comparison = objectResult(await compare.execute({}))
    const row = objectResult(arrayResult(comparison.items)[0]!)

    expect(row.recommendedAction).toEqual({
      type: 'set_delivery_option',
      cartItemId: added.cartItemId,
      deliveryOptionId: 'standard',
    })

    const deliveryAction = objectResult(row.recommendedAction ?? null)
    await setDelivery.execute({
      cartItemId: deliveryAction.cartItemId,
      deliveryOptionId: deliveryAction.deliveryOptionId,
    })
    expect(useCartStore()).toMatchObject({ itemCount: 1, grandTotal: 17.8 })

    const optimized = objectResult(await compare.execute({}))
    const optimizedRow = objectResult(arrayResult(optimized.items)[0]!)
    expect(optimized).toMatchObject({ potentialSavings: 0 })
    expect(optimizedRow.recommendedAction).toEqual({ type: 'none' })
  })

  it('adds a cheaper replacement before removing the original cart line', async () => {
    const actions = useClearDoseActions()
    const definitions = new Map(
      createClearDoseToolDefinitions(actions, 'demo').map((tool) => [tool.name, tool]),
    )
    const add = definitions.get('add_to_cart')
    const compare = definitions.get('compare_cart_savings')
    const remove = definitions.get('remove_cart_item')
    if (!add || !compare || !remove) throw new Error('Missing cart-savings WebMCP tools.')

    const expensive = objectResult(
      await add.execute({
        offerId: 'offer-atorvastatin-10-30-partnerrx',
        deliveryOptionId: 'express',
      }),
    )
    const originalCartItemId = String(expensive.cartItemId)

    const comparison = objectResult(await compare.execute({}))
    expect(comparison).toMatchObject({
      itemCount: 1,
      currentTotal: 18.15,
      optimizedTotal: 12.75,
      potentialSavings: 5.4,
    })
    expect(String(comparison.nextAction)).toMatch(
      /add_to_cart.*succe(?:ed|ss).*remove_cart_item/i,
    )
    const comparisonRow = objectResult(arrayResult(comparison.items)[0]!)
    expect(comparisonRow.recommendedAction).toEqual({
      type: 'replace_offer',
      addFirst: {
        offerId: 'offer-atorvastatin-10-30-cleardose',
        deliveryOptionId: 'standard',
      },
      removeAfterAddSucceeds: originalCartItemId,
    })

    await add.execute({
      offerId: 'offer-atorvastatin-10-30-cleardose',
      deliveryOptionId: 'standard',
    })
    expect(useCartStore().itemCount).toBe(2)

    await remove.execute({ cartItemId: originalCartItemId })
    expect(useCartStore()).toMatchObject({ itemCount: 1, grandTotal: 12.75 })

    const optimized = objectResult(await compare.execute({}))
    expect(optimized).toMatchObject({
      itemCount: 1,
      currentTotal: 12.75,
      optimizedTotal: 12.75,
      potentialSavings: 0,
    })
    expect(
      [...useAgentActivityStore().entries].reverse().map((activity) => activity.toolName),
    ).toEqual([
      'add_to_cart',
      'compare_cart_savings',
      'add_to_cart',
      'remove_cart_item',
      'compare_cart_savings',
    ])
  })
})
