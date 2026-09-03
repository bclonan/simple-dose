import { defineStore } from 'pinia'
import { calculateDeliveredTotal, roundCurrency } from '../domain/pricing'
import type {
  Cart,
  CartItem,
  DeliveryOption,
  Medication,
  MedicationOffer,
  MedicationSku,
  Pharmacy,
  PriceBreakdown,
} from '../types/demo-db'
import { createId } from '../utils/ids'
import { readStorage, storageKeys, writeStorage } from '../utils/storage'
import { useCatalogStore } from './catalog.store'
import { usePricingStore } from './pricing.store'

export interface CartLine {
  item: CartItem
  medication: Medication
  sku: MedicationSku
  offer: MedicationOffer
  pharmacy: Pharmacy
  delivery: DeliveryOption
  pricing: PriceBreakdown
  total: number
}

export interface CartCheckoutIssue {
  cartItemId: string
  reason: 'sku-unavailable' | 'medication-unavailable' | 'offer-unavailable' | 'pharmacy-unavailable' | 'delivery-unavailable'
  message: string
}

type CartItemResolution =
  | { line: Omit<CartLine, 'pricing' | 'total'>; issue?: never }
  | { line?: never; issue: CartCheckoutIssue }

const resolveCartItem = (
  item: CartItem,
  catalog: ReturnType<typeof useCatalogStore>,
): CartItemResolution => {
  const unavailable = (reason: CartCheckoutIssue['reason'], message: string): CartItemResolution => ({
    issue: { cartItemId: item.id, reason, message },
  })
  const sku = catalog.skuById(item.skuId)
  if (!sku) return unavailable('sku-unavailable', 'This saved medication configuration could not be restored.')
  const medication = catalog.medicationById(sku.medicationId)
  if (!medication) return unavailable('medication-unavailable', 'This saved medication record could not be restored.')
  const offer = catalog.offers.find(candidate => candidate.id === item.offerId)
  if (!offer?.available) return unavailable('offer-unavailable', 'This saved demo pharmacy offer is unavailable.')
  if (offer.skuId !== item.skuId) return unavailable('offer-unavailable', 'This saved offer no longer matches its medication configuration.')
  const pharmacy = catalog.pharmacies.find(candidate => candidate.id === offer.pharmacyId)
  if (!pharmacy) return unavailable('pharmacy-unavailable', 'This saved demo pharmacy could not be restored.')
  const delivery = offer.deliveryOptions.find(candidate => candidate.id === item.deliveryOptionId)
  if (!delivery) return unavailable('delivery-unavailable', 'This saved delivery option is unavailable.')
  return { line: { item, medication, sku, offer, pharmacy, delivery } }
}

interface CartState extends Cart {
  drawerOpen: boolean
  lastAddedItemId: string | null
  feedbackMessage: string
}

const emptyCart = (): Cart => ({ items: [], updatedAt: null })

const readCart = (): Cart => {
  const stored = readStorage<Cart>(storageKeys.cart, emptyCart())
  const mergedItems: CartItem[] = []
  const itemIndexByOffer = new Map<string, number>()

  for (const item of stored.items) {
    const key = `${item.skuId}:${item.offerId}`
    const existingIndex = itemIndexByOffer.get(key)
    if (existingIndex === undefined) {
      itemIndexByOffer.set(key, mergedItems.length)
      mergedItems.push({ ...item })
      continue
    }

    const existing = mergedItems[existingIndex]
    if (existing) {
      mergedItems[existingIndex] = {
        ...item,
        id: existing.id,
        addedAt: existing.addedAt,
      }
    }
  }

  const normalized = { items: mergedItems, updatedAt: stored.updatedAt }
  if (mergedItems.length !== stored.items.length) {
    writeStorage(storageKeys.cart, normalized)
  }
  return normalized
}

export const useCartStore = defineStore('cart', {
  state: (): CartState => ({
    ...readCart(),
    drawerOpen: false,
    lastAddedItemId: null,
    feedbackMessage: '',
  }),
  getters: {
    itemCount: (state): number => state.items.length,
    checkoutIssues(state): CartCheckoutIssue[] {
      const catalog = useCatalogStore()
      return state.items.flatMap(item => resolveCartItem(item, catalog).issue ?? [])
    },
    readyForCheckout(): boolean {
      return this.itemCount > 0 && this.checkoutIssues.length === 0
    },
    checkoutIssueMessage(): string {
      if (!this.itemCount) return 'Your cart is empty.'
      const count = this.checkoutIssues.length
      if (!count) return ''
      return `${count} saved cart ${count === 1 ? 'item needs' : 'items need'} review before checkout. Your items have been kept. Restore an available demo option or remove the affected item.`
    },
    detailedItems(state): CartLine[] {
      const catalog = useCatalogStore()
      const pricingStore = usePricingStore()

      return state.items.flatMap((item) => {
        const resolved = resolveCartItem(item, catalog)
        if (resolved.issue) return []
        const pricing = pricingStore.pricingForOffer(resolved.line.offer)
        return [
          {
            ...resolved.line,
            pricing,
            total: calculateDeliveredTotal(pricing, resolved.line.delivery),
          },
        ]
      })
    },
    medicationSubtotal(): number {
      return roundCurrency(this.detailedItems.reduce((sum, line) => sum + line.pricing.medicationSubtotal, 0))
    },
    deliveryTotal(): number {
      return roundCurrency(this.detailedItems.reduce((sum, line) => sum + line.delivery.price, 0))
    },
    grandTotal(): number {
      return roundCurrency(this.detailedItems.reduce((sum, line) => sum + line.total, 0))
    },
  },
  actions: {
    addItem(offerId: string, deliveryOptionId: string): CartItem {
      const catalog = useCatalogStore()
      const offer = catalog.offers.find((candidate) => candidate.id === offerId)
      if (!offer?.available) throw new Error('That fulfillment offer is unavailable.')
      const delivery = offer.deliveryOptions.find((candidate) => candidate.id === deliveryOptionId)
      if (!delivery) throw new Error('That delivery option is unavailable for this offer.')

      const duplicate = this.items.find(
        (item) => item.skuId === offer.skuId && item.offerId === offerId,
      )
      if (duplicate) {
        const deliveryChanged = duplicate.deliveryOptionId !== deliveryOptionId
        if (deliveryChanged) {
          duplicate.deliveryOptionId = deliveryOptionId
          this.updatedAt = new Date().toISOString()
          this.persist()
        }
        this.lastAddedItemId = duplicate.id
        this.feedbackMessage = deliveryChanged
          ? 'This medication offer is already in your cart. Delivery was updated.'
          : 'This medication offer is already in your cart.'
        this.drawerOpen = true
        return duplicate
      }

      const item: CartItem = {
        id: createId('cart'),
        skuId: offer.skuId,
        offerId,
        deliveryOptionId,
        addedAt: new Date().toISOString(),
      }
      this.items.push(item)
      this.updatedAt = new Date().toISOString()
      this.lastAddedItemId = item.id
      this.feedbackMessage = 'Medication added to your cart.'
      this.drawerOpen = true
      this.persist()
      return item
    },
    setDelivery(itemId: string, deliveryOptionId: string): CartItem {
      const catalog = useCatalogStore()
      const item = this.items.find((candidate) => candidate.id === itemId)
      if (!item) throw new Error('Cart item was not found.')
      const offer = catalog.offers.find((candidate) => candidate.id === item.offerId)
      if (!offer?.deliveryOptions.some((candidate) => candidate.id === deliveryOptionId)) {
        throw new Error('That delivery option is unavailable for this item.')
      }
      item.deliveryOptionId = deliveryOptionId
      this.updatedAt = new Date().toISOString()
      this.feedbackMessage = 'Delivery option updated.'
      this.persist()
      return item
    },
    removeItem(itemId: string): void {
      this.items = this.items.filter((item) => item.id !== itemId)
      this.updatedAt = new Date().toISOString()
      this.feedbackMessage = 'Item removed from your cart.'
      this.persist()
    },
    openDrawer(): void {
      this.drawerOpen = true
    },
    closeDrawer(): void {
      this.drawerOpen = false
    },
    clear(): void {
      Object.assign(this, emptyCart())
      this.lastAddedItemId = null
      this.feedbackMessage = ''
      this.drawerOpen = false
      this.persist()
    },
    persist(): void {
      writeStorage(storageKeys.cart, { items: this.items, updatedAt: this.updatedAt })
    },
  },
})
