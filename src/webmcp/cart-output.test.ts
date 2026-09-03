import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useClearDoseActions } from '../services/cleardose.actions'
import { useCartStore } from '../stores/cart.store'
import { useCatalogStore } from '../stores/catalog.store'
import { useOrderStore } from '../stores/order.store'
import type { Medication } from '../types/demo-db'
import { createClearDoseToolDefinitions, webMcpContractBudgets } from './definitions'
import { nativeToolDefinition } from './schema-budget'
import type { JsonValue } from './types'

interface CartPage {
  itemCount: number
  resolvedItemCount: number
  offset: number
  returned: number
  nextOffset: number | null
  truncated: boolean
  items: Array<{ cartItemId: string; deliveryOptions: Array<{ deliveryOptionId: string }> }>
  readyForCheckout: boolean
  totalsComplete: boolean
  totalsNotice?: string
  checkoutIssueCount: number
  checkoutIssues: Array<{ cartItemId: string; reason: string; message: string }>
  hasMoreIssues: boolean
  nextAction: string
  displayDetailsTruncated?: boolean
  displayDetailsNotice?: string
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

const publicMedication = (suffix: string, long = false): Medication => ({
  id: `med-public-${suffix}`, slug: `public-${suffix}`, genericName: long ? `${suffix} ${'public medication '.repeat(28)}` : suffix,
  brandNames: [], category: 'other-medications', categorySource: 'fallback',
  rxRequired: false, publicOnly: true, publicSource: 'openfda-ndc', displaySummary: 'Public reference record.',
  forms: ['TABLET'], strengths: ['10 mg'], quantityOptions: [], searchTerms: [suffix],
})

const nativeCall = async (name: string, input: Record<string, JsonValue> = {}): Promise<JsonValue> => {
  const definition = createClearDoseToolDefinitions(useClearDoseActions()).find(tool => tool.name === name)!
  const result = await nativeToolDefinition(definition).execute(input)
  expect(JSON.stringify(result).length).toBeLessThanOrEqual(webMcpContractBudgets.output)
  return result
}

const readCart = async (offset = 0, limit = 5): Promise<CartPage> =>
  await nativeCall('view_cart', { offset, limit }) as unknown as CartPage

const addPublicItems = (count: number, long = false): string[] => {
  const catalog = useCatalogStore()
  catalog.dataMode = 'live'
  const records = Array.from({ length: count }, (_, index) => publicMedication(`cart-output-${index}`, long))
  catalog.mergePublicMedications(records)
  return records.map(record => {
    const sku = catalog.skusForMedication(record.id)[0]!
    const offer = catalog.offers.find(item => item.skuId === sku.id && item.available)!
    return useCartStore().addItem(offer.id, offer.deliveryOptions[0]!.id).id
  })
}

const addUnresolvedItems = (count: number): string[] => {
  const cart = useCartStore()
  const ids = Array.from({ length: count }, (_, index) => `cart-unresolved-${index}`)
  cart.items.push(...ids.map(id => ({
    id, skuId: `sku-${id}`, offerId: `offer-${id}`, deliveryOptionId: 'standard', addedAt: '2026-09-03T12:00:00.000Z',
  })))
  cart.persist()
  return ids
}

describe('bounded cart tool output', () => {
  it('pages every normal public cart item within the output limit', async () => {
    const ids = addPublicItems(4)
    const readIds: string[] = []
    let offset = 0
    do {
      const result = await readCart(offset)
      expect(result).toMatchObject({ itemCount: 4, resolvedItemCount: 4, readyForCheckout: true,
        totalsComplete: true, checkoutIssueCount: 0, checkoutIssues: [], hasMoreIssues: false })
      expect(result.returned).toBe(result.items.length)
      expect(result.returned).toBeGreaterThan(0)
      expect(result.truncated).toBe(result.nextOffset !== null)
      if (result.nextOffset !== null) expect(result.nextOffset).toBe(offset + result.returned)
      result.items.forEach(item => {
        expect(item.deliveryOptions.length).toBeGreaterThan(0)
        expect(item.deliveryOptions.every(option => Boolean(option.deliveryOptionId))).toBe(true)
      })
      readIds.push(...result.items.map(item => item.cartItemId))
      if (result.nextOffset === null) break
      offset = result.nextOffset
      expect(offset).toBeLessThan(ids.length)
    } while (true)
    expect(readIds).toEqual(ids)
  })

  it('uses only resolved items for offsets and keeps long-label cart recovery visible', async () => {
    const ids = addPublicItems(3, true)
    addUnresolvedItems(4)
    const before = JSON.stringify(useCartStore().items)
    const readIds: string[] = []
    let offset = 0
    do {
      const result = await readCart(offset)
      expect(result.itemCount).toBe(7)
      expect(result.resolvedItemCount).toBe(3)
      expect(result.readyForCheckout).toBe(false)
      expect(result.totalsComplete).toBe(false)
      expect(result.totalsNotice).toContain('not the complete cart')
      expect(result.checkoutIssueCount).toBe(4)
      expect(result.checkoutIssues.length).toBeGreaterThan(0)
      expect(result.hasMoreIssues).toBe(result.checkoutIssues.length < 4)
      expect(result.nextAction).toContain('remove_cart_item')
      expect(result.nextAction).toContain('Do not check out')
      expect(result.returned).toBeGreaterThan(0)
      if (result.displayDetailsTruncated) expect(result.displayDetailsNotice).toContain('visible in the cart')
      readIds.push(...result.items.map(item => item.cartItemId))
      if (result.nextOffset === null) break
      expect(result.nextOffset).toBe(offset + result.returned)
      expect(result.nextOffset).toBeLessThan(result.resolvedItemCount)
      offset = result.nextOffset
    } while (true)
    expect(readIds).toEqual(ids)
    expect(JSON.stringify(useCartStore().items)).toBe(before)
    expect(useOrderStore().orders).toEqual([])
    await expect(readCart(4)).rejects.toThrow('resolved cart items')
  })

  it('exposes every unresolved item through repeated reviewed recovery without fake item pages', async () => {
    const ids = addUnresolvedItems(6)
    const removed: string[] = []
    while (useCartStore().itemCount) {
      const before = JSON.stringify(useCartStore().items)
      const result = await readCart()
      expect(result).toMatchObject({ resolvedItemCount: 0, returned: 0, nextOffset: null, truncated: false,
        items: [], readyForCheckout: false, totalsComplete: false })
      expect(result.checkoutIssueCount).toBe(ids.length - removed.length)
      expect(result.checkoutIssues.length).toBeGreaterThan(0)
      expect(result.hasMoreIssues).toBe(result.checkoutIssueCount > result.checkoutIssues.length)
      expect(result.checkoutIssues.every(issue => issue.reason === 'sku-unavailable' && issue.message)).toBe(true)
      expect(result.nextAction).toContain('Then call view_cart again')
      expect(JSON.stringify(useCartStore().items)).toBe(before)
      for (const issue of result.checkoutIssues) {
        await nativeCall('remove_cart_item', { cartItemId: issue.cartItemId })
        removed.push(issue.cartItemId)
      }
    }
    expect(removed).toEqual(ids)
    expect(await readCart()).toMatchObject({ itemCount: 0, resolvedItemCount: 0, checkoutIssueCount: 0,
      hasMoreIssues: false, totalsComplete: true, readyForCheckout: false, nextOffset: null })
  })
})
