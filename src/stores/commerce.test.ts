import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useClearDoseActions } from '../services/cleardose.actions'
import { useCartStore } from './cart.store'
import { useOrderStore } from './order.store'
import { usePrescriptionStore } from './prescription.store'
import { usePricingStore } from './pricing.store'
import { useSelectionStore } from './selection.store'

const flagshipOption = {
  offerId: 'offer-atorvastatin-20-90-cleardose',
  deliveryOptionId: 'standard',
}

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-31T16:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cart pricing', () => {
  it('adds an exact offer and derives each cart total', () => {
    const actions = useClearDoseActions()
    const cart = useCartStore()

    const result = actions.addToCart(flagshipOption)

    expect(result.cartCount).toBe(1)
    expect(result).toMatchObject({ subtotal: 12.8, delivery: 5, total: 17.8 })
    expect(cart.detailedItems[0]).toMatchObject({
      medication: { genericName: 'Atorvastatin' },
      sku: { strength: '20 mg', quantity: 90 },
      delivery: { id: 'standard' },
      total: 17.8,
    })
    expect(cart.drawerOpen).toBe(true)
    expect(cart.feedbackMessage).toBe('Medication added to your cart.')
  })

  it('recalculates delivery and grand totals when fulfillment changes', () => {
    const actions = useClearDoseActions()
    const added = actions.addToCart(flagshipOption)

    const result = actions.setDeliveryOption({
      cartItemId: added.cartItem.id,
      deliveryOptionId: 'express',
    })

    expect(result).toMatchObject({
      deliveryOptionId: 'express',
      itemTotal: 21.8,
      grandTotal: 21.8,
    })
    expect(actions.viewCart()).toMatchObject({
      subtotal: 12.8,
      deliveryTotal: 9,
      grandTotal: 21.8,
    })
  })

  it('removes an item through the shared cart action and keeps totals in sync', () => {
    const actions = useClearDoseActions()
    const added = actions.addToCart(flagshipOption)

    expect(actions.removeCartItem({ cartItemId: added.cartItem.id })).toMatchObject({
      removedCartItemId: added.cartItem.id,
      cartCount: 0,
      grandTotal: 0,
    })
    expect(actions.viewCart()).toMatchObject({ itemCount: 0, grandTotal: 0 })
  })
})

describe('state-aware comparison', () => {
  it('reuses the exact current selection when prices change', async () => {
    const navigate = vi.fn(async () => undefined)
    const actions = useClearDoseActions({ navigate })
    const pricing = usePricingStore()
    const selection = useSelectionStore()

    await actions.compareFulfillmentOptions({
      medicationId: 'med-atorvastatin',
      form: 'tablet',
      strength: '20 mg',
      quantity: 90,
      maxDeliveryDays: 5,
    })
    await actions.selectMedicationOption(flagshipOption)
    pricing.setScenario('market-update')

    const refreshed = await actions.compareFulfillmentOptions({ maxDeliveryDays: 5 })

    expect(selection).toMatchObject({
      skuId: 'sku-atorvastatin-tablet-20mg-90',
      offerId: flagshipOption.offerId,
      deliveryOptionId: flagshipOption.deliveryOptionId,
    })
    expect(refreshed).toMatchObject({
      medication: {
        id: 'med-atorvastatin',
        form: 'tablet',
        strength: '20 mg',
        quantity: 90,
      },
      selectedOptionId: 'offer-atorvastatin-20-90-cleardose:standard',
      selectedOptionIsLowest: false,
      lowestTotalOptionId: 'offer-atorvastatin-20-90-healthhub:standard',
      pricingScenario: 'Market update',
    })
    expect(navigate).toHaveBeenLastCalledWith('/compare')
  })
})

describe('prescription request generation', () => {
  it('persists a request for the same exact SKU, offer, and delivery option', async () => {
    const actions = useClearDoseActions()
    const prescriptions = usePrescriptionStore()

    const result = await actions.createPrescriptionRequestCard({
      ...flagshipOption,
      patientName: '  Demo Patient  ',
      prescriberName: '  Demo Prescriber  ',
    })

    expect(result).toMatchObject({
      requestId: 'PR-2026-0001',
      medicationSummary: 'Atorvastatin 20 mg tablet, quantity 90',
      preferredFulfillment: 'ClearDose Direct',
      estimatedTotal: 17.8,
      route: '/prescription-card',
    })
    expect(prescriptions.latestRequest).toMatchObject({
      id: 'PR-2026-0001',
      skuId: 'sku-atorvastatin-tablet-20mg-90',
      offerId: flagshipOption.offerId,
      deliveryOptionId: 'standard',
      estimatedTotal: 17.8,
      patientName: 'Demo Patient',
      prescriberName: 'Demo Prescriber',
      status: 'prepared',
    })
  })
})

describe('demo order creation', () => {
  it('copies the cart into a local order, captures its total, then empties the cart', async () => {
    const actions = useClearDoseActions()
    const cart = useCartStore()
    const orders = useOrderStore()
    actions.addToCart(flagshipOption)

    const result = await actions.checkoutDemoOrder({
      fullName: '  Demo User  ',
      address: {
        line1: '100 Demo Street',
        city: 'Baltimore',
        state: 'MD',
        postalCode: '21201',
      },
      prescriptionStatus: 'provider-will-send',
    })

    expect(result).toEqual({
      orderId: 'CD-2026-0001',
      route: '/orders/CD-2026-0001',
      total: 17.8,
      status: 'demo-order-created',
      notice: 'Demo order only. No payment or prescription was transmitted.',
    })
    expect(orders.currentOrder).toMatchObject({
      id: 'CD-2026-0001',
      fullName: 'Demo User',
      total: 17.8,
      prescriptionStatus: 'provider-will-send',
      items: [{
        skuId: 'sku-atorvastatin-tablet-20mg-90',
        offerId: flagshipOption.offerId,
        deliveryOptionId: 'standard',
      }],
    })
    expect(cart.itemCount).toBe(0)
  })

  it('rejects a prepared-request claim when the request does not match the cart', async () => {
    const actions = useClearDoseActions()
    await actions.createPrescriptionRequestCard(flagshipOption)
    actions.addToCart({
      offerId: 'offer-atorvastatin-20-90-healthhub',
      deliveryOptionId: 'standard',
    })

    await expect(actions.checkoutDemoOrder({
      fullName: 'Demo User',
      address: {
        line1: '100 Demo Street',
        city: 'Baltimore',
        state: 'MD',
        postalCode: '21201',
      },
      prescriptionStatus: 'request-prepared',
    })).rejects.toThrow(
      'No prepared prescription request matches this cart. Call create_prescription_request_card for the selected offer, or use provider-will-send.',
    )
    expect(useOrderStore().orders).toHaveLength(0)
  })
})
