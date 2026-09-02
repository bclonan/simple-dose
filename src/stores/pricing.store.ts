import { defineStore } from 'pinia'
import { demoCatalog as demoDatabase } from '../plugins/cleardose'
import { compareFulfillmentOptions, resolveOfferPricing } from '../domain/pricing'
import type { MedicationOffer, MedicationSku, PriceComparison } from '../types/demo-db'
import { readStorage, storageKeys, writeStorage } from '../utils/storage'
import { useCatalogStore } from './catalog.store'

interface PricingPersistedState {
  scenarioId: 'current' | string
}

export const usePricingStore = defineStore('pricing', {
  state: (): PricingPersistedState =>
    readStorage<PricingPersistedState>(storageKeys.pricing, { scenarioId: 'current' }),
  getters: {
    currentScenario(state) {
      return state.scenarioId === 'current'
        ? null
        : demoDatabase.pricingScenarios.find((scenario) => scenario.id === state.scenarioId) ?? null
    },
    scenarioLabel(): string {
      return this.currentScenario?.label ?? 'Current prices'
    },
    effectiveAt(): string {
      return this.currentScenario?.effectiveAt ?? demoDatabase.metadata.updatedAt
    },
  },
  actions: {
    setScenario(scenarioId: string): void {
      if (
        scenarioId !== 'current' &&
        !demoDatabase.pricingScenarios.some((scenario) => scenario.id === scenarioId)
      ) {
        throw new Error('Pricing scenario was not found.')
      }
      this.scenarioId = scenarioId
      writeStorage(storageKeys.pricing, { scenarioId })
    },
    pricingForOffer(offer: MedicationOffer) {
      return resolveOfferPricing(offer, this.currentScenario)
    },
    comparisonsForSku(sku: MedicationSku, maxDeliveryDays?: number): PriceComparison[] {
      const catalog = useCatalogStore()
      if (catalog.dataMode === 'live') return []
      return compareFulfillmentOptions({
        sku,
        offers: catalog.offers,
        pharmacies: catalog.pharmacies,
        scenario: this.currentScenario,
        maxDeliveryDays,
      })
    },
    reset(): void {
      this.setScenario('current')
    },
  },
})
