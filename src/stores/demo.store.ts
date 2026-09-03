import { defineStore } from 'pinia'
import { clearClearDoseStorage } from '../utils/storage'
import { useAgentActivityStore } from './agentActivity.store'
import { useCartStore } from './cart.store'
import { useCheckoutStore } from './checkout.store'
import { useCatalogStore } from './catalog.store'
import { useOrderStore } from './order.store'
import { usePrescriptionStore } from './prescription.store'
import { usePricingStore } from './pricing.store'
import { useSelectionStore } from './selection.store'

export const useDemoStore = defineStore('demo', {
  state: () => ({ resetCount: 0 }),
  actions: {
    resetAll(): void {
      clearClearDoseStorage()
      useCatalogStore().reset()
      useSelectionStore().reset()
      usePricingStore().reset()
      usePrescriptionStore().reset()
      useCartStore().clear()
      useCheckoutStore().reset()
      useOrderStore().reset()
      useAgentActivityStore().clear()
      this.resetCount += 1
    },
  },
})
