import { defineStore } from 'pinia'
import { demoDatabase } from '../data'
import { searchMedications, type MedicationSearchFilters } from '../domain/catalog'
import type { Medication, MedicationSku } from '../types/demo-db'
import { readStorage, storageKeys, writeStorage } from '../utils/storage'

type RxFilter = 'all' | 'required' | 'not-required'

interface CatalogPersistedState {
  searchQuery: string
  formFilter: string
  strengthFilter: string
  rxFilter: RxFilter
}

const defaultState: CatalogPersistedState = {
  searchQuery: '',
  formFilter: '',
  strengthFilter: '',
  rxFilter: 'all',
}

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    ...readStorage<CatalogPersistedState>(storageKeys.catalog, defaultState),
    medications: demoDatabase.medications,
    skus: demoDatabase.skus,
    pharmacies: demoDatabase.pharmacies,
    offers: demoDatabase.offers,
  }),
  getters: {
    filteredMedications(state): Medication[] {
      const rxRequired =
        state.rxFilter === 'all' ? undefined : state.rxFilter === 'required'
      return searchMedications(state.medications, state.searchQuery, {
        form: state.formFilter || undefined,
        strength: state.strengthFilter || undefined,
        rxRequired,
      })
    },
    medicationById: (state) => (id: string): Medication | undefined =>
      state.medications.find((medication) => medication.id === id),
    medicationBySlug: (state) => (slug: string): Medication | undefined =>
      state.medications.find((medication) => medication.slug === slug),
    skuById: (state) => (id: string): MedicationSku | undefined =>
      state.skus.find((sku) => sku.id === id),
    skusForMedication: (state) => (medicationId: string): MedicationSku[] =>
      state.skus.filter((sku) => sku.medicationId === medicationId),
  },
  actions: {
    search(query: string, filters: MedicationSearchFilters = {}): Medication[] {
      this.searchQuery = query
      this.formFilter = filters.form ?? ''
      this.strengthFilter = filters.strength ?? ''
      this.rxFilter =
        filters.rxRequired === undefined
          ? 'all'
          : filters.rxRequired
            ? 'required'
            : 'not-required'
      this.persist()
      return this.filteredMedications
    },
    setFilters(form: string, strength: string, rxFilter: RxFilter): void {
      this.formFilter = form
      this.strengthFilter = strength
      this.rxFilter = rxFilter
      this.persist()
    },
    clearFilters(): void {
      this.formFilter = ''
      this.strengthFilter = ''
      this.rxFilter = 'all'
      this.persist()
    },
    reset(): void {
      Object.assign(this, defaultState)
      this.persist()
    },
    persist(): void {
      writeStorage(storageKeys.catalog, {
        searchQuery: this.searchQuery,
        formFilter: this.formFilter,
        strengthFilter: this.strengthFilter,
        rxFilter: this.rxFilter,
      } satisfies CatalogPersistedState)
    },
  },
})
