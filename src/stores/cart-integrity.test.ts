import { createPinia, setActivePinia } from 'pinia'
import { toRaw } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CartItem } from '../types/demo-db'
import { storageKeys } from '../utils/storage'
import { useCartStore } from './cart.store'
import { useCatalogStore } from './catalog.store'
import { useOrderStore, type CheckoutInput } from './order.store'

const option = { offerId: 'offer-atorvastatin-20-90-cleardose', deliveryOptionId: 'standard' }
const checkout: CheckoutInput = {
  fullName: 'Fictional Cart Test',
  address: { line1: '100 Demo Street', city: 'Baltimore', state: 'MD', postalCode: '21201' },
  prescriptionStatus: 'provider-will-send',
}
const savedItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: 'cart-saved-item', skuId: 'sku-atorvastatin-tablet-20mg-90',
  ...option, addedAt: '2026-09-03T12:00:00.000Z', ...overrides,
})

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  // The catalog reuses immutable seed objects. Corrupt isolated copies only.
  const catalog = useCatalogStore()
  catalog.skus = structuredClone(toRaw(catalog.skus))
  catalog.offers = structuredClone(toRaw(catalog.offers))
})

describe('restored cart integrity', () => {
  it('blocks checkout for unresolved persisted rows without deleting or rewriting them', () => {
    const items = [savedItem({ skuId: 'sku-missing' }), savedItem({ id: 'cart-missing-offer', offerId: 'offer-missing' })]
    const persisted = JSON.stringify({ items, updatedAt: '2026-09-03T12:00:00.000Z' })
    localStorage.setItem(storageKeys.cart, persisted)
    const cart = useCartStore()
    const orders = useOrderStore()

    expect(cart.itemCount).toBe(2)
    expect(cart.detailedItems).toEqual([])
    expect(cart.checkoutIssues).toMatchObject([
      { cartItemId: 'cart-saved-item', reason: 'sku-unavailable' },
      { cartItemId: 'cart-missing-offer', reason: 'offer-unavailable' },
    ])
    expect(cart.readyForCheckout).toBe(false)
    expect(cart.checkoutIssueMessage).toContain('2 saved cart items need review')
    expect(() => orders.createOrder(checkout)).toThrow(cart.checkoutIssueMessage)
    expect(orders.orders).toEqual([])
    expect(orders.currentOrderId).toBeNull()
    expect(cart.items).toEqual(items)
    expect(localStorage.getItem(storageKeys.cart)).toBe(persisted)
    expect(localStorage.getItem(storageKeys.orders)).toBeNull()
  })

  it('never creates a partial order when only one of the saved lines resolves', () => {
    const cart = useCartStore()
    cart.addItem(option.offerId, option.deliveryOptionId)
    cart.items.push(savedItem({ id: 'cart-unrestored', skuId: 'sku-unrestored' }))
    cart.persist()
    const persisted = localStorage.getItem(storageKeys.cart)
    const validTotal = cart.grandTotal

    expect(cart.detailedItems).toHaveLength(1)
    expect(validTotal).toBeGreaterThan(0)
    expect(cart.readyForCheckout).toBe(false)
    expect(() => useOrderStore().createOrder(checkout)).toThrow('1 saved cart item needs review')
    expect(cart.items).toHaveLength(2)
    expect(localStorage.getItem(storageKeys.cart)).toBe(persisted)
    expect(useOrderStore().orders).toEqual([])

    cart.removeItem('cart-unrestored')
    expect(cart.checkoutIssues).toEqual([])
    expect(cart.readyForCheckout).toBe(true)
    const order = useOrderStore().createOrder(checkout)
    expect(order.items).toHaveLength(1)
    expect(order.total).toBe(validTotal)
    expect(cart.items).toEqual([])
    expect(cart.readyForCheckout).toBe(false)
  })

  it('rechecks availability without changing the saved cart when an offer returns', () => {
    const catalog = useCatalogStore()
    const cart = useCartStore()
    cart.addItem(option.offerId, option.deliveryOptionId)
    const persisted = localStorage.getItem(storageKeys.cart)
    const offer = catalog.offers.find(item => item.id === option.offerId)!
    offer.available = false

    expect(cart.checkoutIssues[0]?.reason).toBe('offer-unavailable')
    expect(cart.readyForCheckout).toBe(false)
    expect(cart.detailedItems).toEqual([])
    expect(() => useOrderStore().createOrder(checkout)).toThrow('needs review')

    offer.available = true
    expect(cart.readyForCheckout).toBe(true)
    expect(cart.checkoutIssueMessage).toBe('')
    expect(cart.detailedItems).toHaveLength(1)
    expect(localStorage.getItem(storageKeys.cart)).toBe(persisted)
  })

  it('rejects an offer that references a different medication configuration', () => {
    const catalog = useCatalogStore()
    const cart = useCartStore()
    cart.items = [savedItem()]
    catalog.offers.find(item => item.id === option.offerId)!.skuId = catalog.skus.find(sku => sku.medicationId === 'med-metformin')!.id

    expect(cart.checkoutIssues).toMatchObject([{ reason: 'offer-unavailable', message: expect.stringContaining('no longer matches') }])
    expect(cart.readyForCheckout).toBe(false)
    expect(cart.detailedItems).toEqual([])
    expect(() => useOrderStore().createOrder(checkout)).toThrow('needs review')
    expect(cart.items).toEqual([savedItem()])
  })

  it.each(['medication', 'pharmacy', 'delivery'] as const)('reports an unavailable %s reference', reference => {
    const catalog = useCatalogStore()
    const cart = useCartStore()
    cart.items = [savedItem()]
    const offer = catalog.offers.find(item => item.id === option.offerId)!
    if (reference === 'medication') catalog.skus.find(sku => sku.id === cart.items[0]!.skuId)!.medicationId = 'med-missing'
    if (reference === 'pharmacy') offer.pharmacyId = 'pharmacy-missing'
    if (reference === 'delivery') offer.deliveryOptions = []

    expect(cart.checkoutIssues).toMatchObject([{ cartItemId: 'cart-saved-item', reason: `${reference}-unavailable` }])
    expect(cart.readyForCheckout).toBe(false)
    expect(cart.detailedItems).toEqual([])
    expect(() => useOrderStore().createOrder(checkout)).toThrow('needs review')
  })

  it('distinguishes an empty cart from a valid complete cart', () => {
    const cart = useCartStore()
    expect(cart.readyForCheckout).toBe(false)
    expect(cart.checkoutIssues).toEqual([])
    expect(cart.checkoutIssueMessage).toBe('Your cart is empty.')
    expect(() => useOrderStore().createOrder(checkout)).toThrow('Your cart is empty.')

    cart.addItem(option.offerId, option.deliveryOptionId)
    expect(cart.readyForCheckout).toBe(true)
    expect(cart.checkoutIssues).toEqual([])
    expect(cart.checkoutIssueMessage).toBe('')
  })

  it('uses the shared checkout validator before storing normalized recipient fields', () => {
    const cart = useCartStore()
    cart.addItem(option.offerId, option.deliveryOptionId)
    const orders = useOrderStore()
    expect(() => orders.createOrder({ ...checkout, address: { ...checkout.address, state: '1!' } })).toThrow('two-letter state code')
    expect(cart.itemCount).toBe(1)
    expect(orders.orders).toEqual([])

    const order = orders.createOrder({
      ...checkout, fullName: '  Fictional Cart Test  ',
      address: { line1: '  100 Demo Street  ', line2: '  ', city: '  Baltimore  ', state: 'md', postalCode: ' 21201 ' },
    })
    expect(order.fullName).toBe('Fictional Cart Test')
    expect(order.address).toEqual({ line1: '100 Demo Street', line2: undefined, city: 'Baltimore', state: 'MD', postalCode: '21201' })
  })
})
