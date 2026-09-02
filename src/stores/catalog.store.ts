import { defineStore } from 'pinia'
import { medicationRepository, initialDataMode, saveDataMode, similarityNotice, type DataMode, type PublicMedicationRecord } from '../services/medication.repository'
import { searchMedications, type MedicationSearchFilters } from '../domain/catalog'
import type { Medication, MedicationSku } from '../types/demo-db'
import { readStorage, storageKeys, writeStorage } from '../utils/storage'
import type { GetDrugOptions } from '../../cleardose-data-plugin/src/types'

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

const eligibleMedications = (medications: Medication[], mode: DataMode): Medication[] =>
  medications.filter(item => mode === 'demo' ? !item.publicOnly : mode === 'live' ? Boolean(item.publicSource) : true)

const retainMedicationIdentities = (medications: Medication[]): Medication[] => [
  ...medications.filter(item => !item.publicOnly),
  ...medications.filter(item => item.publicOnly).slice(-100),
]

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    ...readStorage<CatalogPersistedState>(storageKeys.catalog, defaultState),
    medications: medicationRepository.initialMedications(),
    skus: medicationRepository.fallback.skus,
    pharmacies: medicationRepository.fallback.pharmacies,
    offers: medicationRepository.fallback.offers,
    dataMode: initialDataMode(),
    dataEpoch: 0,
    publicRecords: {} as Record<string, PublicMedicationRecord>,
    detailLoading: {} as Record<string, boolean>,
    detailVersions: {} as Record<string, number>,
    detailOptions: {} as Record<string, GetDrugOptions>,
    loadedOptions: {} as Record<string, GetDrugOptions>,
    detailLoadedAt: {} as Record<string, number>,
    searchLoading: false,
    searchMessage: '',
    searchResultIds: null as string[] | null,
    searchVersion: 0,
  }),
  getters: {
    filteredMedications(state): Medication[] {
      const rxRequired =
        state.rxFilter === 'all' ? undefined : state.rxFilter === 'required'
      const candidates = state.searchResultIds === null ? state.medications : state.medications.filter(item => state.searchResultIds?.includes(item.id))
      return searchMedications(eligibleMedications(candidates, state.dataMode), state.searchResultIds === null ? state.searchQuery : '', {
        form: state.formFilter || undefined,
        strength: state.strengthFilter || undefined,
        rxRequired,
      }, state.dataMode !== 'demo')
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
    async search(query: string, filters: MedicationSearchFilters = {}): Promise<Medication[]> {
      const version = ++this.searchVersion
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
      this.searchLoading = true
      try {
        const result = await medicationRepository.search(query, this.dataMode, this.medications)
        if (version !== this.searchVersion) return []
        const merged = new Map(this.medications.map(item => [item.id, item]))
        result.medications.forEach(item => merged.set(item.id, item))
        this.medications = retainMedicationIdentities([...merged.values()])
        this.searchResultIds = result.medications.map(item => item.id)
        this.searchMessage = result.message
        medicationRepository.persistIdentities(this.medications)
      } finally {
        if (version === this.searchVersion) this.searchLoading = false
      }
      return this.filteredMedications
    },
    async resolveMedication(term: string): Promise<Medication> {
      const normalized = term.trim().toLowerCase()
      if (!normalized || normalized.length > 120) throw new Error('Use a medication ID, generic name, or brand name up to 120 characters.')
      const matches = (items: Medication[]) => items.filter(item => [item.id, item.slug, item.genericName, ...item.brandNames].some(value => value.toLowerCase() === normalized))
      const known = matches(this.medications)
      if (known.length === 1) return known[0]!
      const mode = this.dataMode
      const epoch = this.dataEpoch
      const query = /^public-[a-z0-9-]+$/.test(normalized) ? normalized.slice(7).replaceAll('-', ' ') : term
      const result = await medicationRepository.search(query, mode, this.medications)
      if (mode !== this.dataMode || epoch !== this.dataEpoch) throw new Error('Data mode changed. Search again in the current mode.')
      const found = matches(result.medications)
      if (found.length !== 1) throw new Error(found.length > 1 ? `Several medications match "${term}". Choose a specific result from search.` : `No exact match for "${term}". Search by generic or brand name and choose a result.`)
      const medication = found[0]!
      const merged = new Map(this.medications.map(item => [item.id, item]))
      merged.set(medication.id, medication)
      this.medications = retainMedicationIdentities([...merged.values()])
      medicationRepository.persistIdentities(this.medications)
      return medication
    },
    async loadMedication(id: string, quantity = 30, options: GetDrugOptions = { includeClinical: true, includePrices: true }, force = false): Promise<void> {
      const medication = this.medicationById(id)
      if (!medication) return
      const mode = this.dataMode
      const epoch = this.dataEpoch
      const previous = this.detailOptions[id]
      const requested: GetDrugOptions = {
        includeClinical: Boolean(previous?.includeClinical || options.includeClinical),
        includePrices: Boolean(previous?.includePrices || options.includePrices),
        includeAdverseEventSummary: Boolean(previous?.includeAdverseEventSummary || options.includeAdverseEventSummary),
        quantity,
      }
      const loaded = this.loadedOptions[id]
      const cached = this.publicRecords[id]
      const expiresAt = cached?.drug?.dataMeta?.expiresAt
      const fresh = mode === 'demo' || Boolean(cached?.drug && !cached.drug.dataMeta?.stale && cached.status !== 'stale-cache' &&
        (expiresAt ? Date.parse(expiresAt) > Date.now() : Date.now() - (this.detailLoadedAt[id] ?? 0) < 60_000))
      if (!force && fresh && cached && loaded && loaded.quantity === quantity &&
        (!requested.includeClinical || loaded.includeClinical) && (!requested.includePrices || loaded.includePrices) &&
        (!requested.includeAdverseEventSummary || loaded.includeAdverseEventSummary)) return
      this.detailOptions[id] = requested
      const version = (this.detailVersions[id] ?? 0) + 1
      this.detailVersions[id] = version
      this.detailLoading[id] = true
      try {
        const record = await medicationRepository.getMedication(medication, mode, quantity, requested)
        if (mode === this.dataMode && epoch === this.dataEpoch && version === this.detailVersions[id]) {
          this.publicRecords[id] = record
          this.detailLoadedAt[id] = Date.now()
          const transient = record.drug?.warnings?.filter(warning => ['network', 'rate-limit', 'unavailable', 'malformed-response'].includes(warning.code)) ?? []
          this.loadedOptions[id] = mode === 'demo' ? requested : record.drug ? {
            ...requested,
            includeClinical: requested.includeClinical && Boolean(record.drug.clinical) && !transient.some(warning => warning.source === 'openfda-label'),
            includePrices: requested.includePrices && !transient.some(warning => !['rxnorm', 'openfda-ndc', 'openfda-label', 'openfda-event'].includes(warning.source)),
            includeAdverseEventSummary: requested.includeAdverseEventSummary && record.drug.reportedAdverseEvents !== undefined && !transient.some(warning => warning.source === 'openfda-event'),
          } : {}
          if (record.drug) {
            medication.publicSource = record.drug.sources.find(source => source.source !== 'demo')?.source ?? 'public'
            medicationRepository.persistIdentities(this.medications)
          }
          if (record.searchTerms) medication.searchTerms = [...new Set([...medication.searchTerms, ...record.searchTerms])]
        }
      } finally {
        if (version === this.detailVersions[id]) this.detailLoading[id] = false
      }
    },
    async loadBySlug(slug: string): Promise<void> {
      if (this.medicationBySlug(slug) || !slug.startsWith('public-') || slug.length > 110 || !/^[a-z0-9-]+$/.test(slug)) return
      const epoch = this.dataEpoch
      const result = await medicationRepository.search(slug.slice(7).replaceAll('-', ' '), this.dataMode, this.medications)
      if (epoch !== this.dataEpoch) return
      const found = result.medications.find(item => item.slug === slug)
      if (found && !this.medicationById(found.id)) {
        this.medications = retainMedicationIdentities([...this.medications, found])
        medicationRepository.persistIdentities(this.medications)
      }
    },
    async compareMedications(ids: string[], section?: string) {
      const epoch = this.dataEpoch
      if (ids.length < 1 || ids.length > 4 || new Set(ids).size !== ids.length) throw new Error('Choose one to four distinct medications.')
      if (ids.some(id => !this.medicationById(id))) throw new Error('Refresh the catalog and choose current medication IDs.')
      await Promise.all(ids.map(id => this.loadMedication(id, 30, {
        includeClinical: !section || section === 'clinical',
        includePrices: !section || section === 'prices',
      })))
      if (epoch !== this.dataEpoch) throw new Error('Data mode changed while comparing. Run the comparison again in the current mode.')
      return { drugs: ids.map(id => ({ medicationId: id, name: this.medicationById(id)!.genericName, ...this.publicRecords[id] })), notice: similarityNotice }
    },
    async findRelated(id: string, scopeIds?: string[], basis?: string) {
      const eligible = eligibleMedications(this.medications, this.dataMode)
      const reference = eligible.find(item => item.id === id)
      if (!reference) throw new Error('Refresh the catalog and choose a current medication ID.')
      const candidates = scopeIds ? eligible.filter(item => scopeIds.includes(item.id)) : eligible
      return medicationRepository.related(reference, candidates, this.publicRecords, basis, this.dataMode)
    },
    setDataMode(mode: DataMode): void {
      if (!['live', 'hybrid', 'demo'].includes(mode)) return
      this.dataEpoch++
      this.dataMode = mode
      saveDataMode(mode)
      this.searchVersion++
      this.searchLoading = false
      this.searchResultIds = null
      this.publicRecords = {}
      this.detailLoading = {}
      this.detailOptions = {}
      this.loadedOptions = {}
      this.detailLoadedAt = {}
      void this.search(this.searchQuery)
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
      this.searchResultIds = null
      this.searchMessage = ''
      this.searchVersion++
      this.searchLoading = false
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
