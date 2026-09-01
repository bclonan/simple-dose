import { defineStore } from 'pinia'
import { calculateDeliveredTotal } from '../domain/pricing'
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

interface CartState extends Cart {
  drawerOpen: boolean
  lastAddedItemId: string | null
  feedbackMessage: string
}

const emptyCart = (): Cart => ({ items: [], updatedAt: null })

export const useCartStore = defineStore('cart', {
  state: (): CartState => ({
    ...readStorage<Cart>(storageKeys.cart, emptyCart()),
    drawerOpen: false,
    lastAddedItemId: null,
    feedbackMessage: '',
  }),
  getters: {
    itemCount: (state): number => state.items.length,
    detailedItems(state): CartLine[] {
      const catalog = useCatalogStore()
      const pricingStore = usePricingStore()

      return state.items.flatMap((item) => {
        const sku = catalog.skuById(item.skuId)
        const medication = sku ? catalog.medicationById(sku.medicationId) : undefined
        const offer = catalog.offers.find((candidate) => candidate.id === item.offerId)
        const pharmacy = offer
          ? catalog.pharmacies.find((candidate) => candidate.id === offer.pharmacyId)
          : undefined
        const delivery = offer?.deliveryOptions.find(
          (candidate) => candidate.id === item.deliveryOptionId,
        )
        if (!sku || !medication || !offer || !pharmacy || !delivery) return []
        const pricing = pricingStore.pricingForOffer(offer)
        return [
          {
            item,
            medication,
            sku,
            offer,
            pharmacy,
            delivery,
            pricing,
            total: calculateDeliveredTotal(pricing, delivery),
          },
        ]
      })
    },
    medicationSubtotal(): number {
      return this.detailedItems.reduce((sum, line) => sum + line.pricing.medicationSubtotal, 0)
    },
    deliveryTotal(): number {
      return this.detailedItems.reduce((sum, line) => sum + line.delivery.price, 0)
    },
    grandTotal(): number {
      return this.detailedItems.reduce((sum, line) => sum + line.total, 0)
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
        (item) => item.offerId === offerId && item.deliveryOptionId === deliveryOptionId,
      )
      if (duplicate) {
        this.lastAddedItemId = duplicate.id
        this.feedbackMessage = 'This medication is already in your cart.'
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
