import { defineStore } from 'pinia'
import { medicationRepository, initialDataMode, saveDataMode, similarityNotice, type DataMode, type PublicMedicationRecord } from '../services/medication.repository'
import { searchMedications, type MedicationSearchFilters } from '../domain/catalog'
import { createPublicDemoFulfillment } from '../domain/demo-public-fulfillment'
import type { Medication, MedicationSku } from '../types/demo-db'
import { readStorage, storageKeys, writeStorage } from '../utils/storage'
import type { GetDrugOptions } from '../../cleardose-data-plugin/src/types'
import { useCartStore } from './cart.store'
import { useDrugExplorerStore } from './drugExplorer.store'

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

const retainMedicationIdentities = (medications: Medication[], selectedIds: Set<string>): Medication[] => {
  const publicMedications = medications.filter(item => item.publicOnly)
  const selected = publicMedications.filter(item => selectedIds.has(item.id)).slice(0, 4)
  return [
    ...medications.filter(item => !item.publicOnly),
    ...selected,
    ...publicMedications.filter(item => !selectedIds.has(item.id)).slice(-(100 - selected.length)),
  ]
}

const buildFulfillment = (medications: Medication[]) => {
  const generated = medications.map(medication => {
    const result = createPublicDemoFulfillment(medication, medicationRepository.fallback.pharmacies, medicationRepository.fallback.offers)
    if (result.configuration) medication.demoConfiguration = result.configuration
    return result
  })
  return {
    skus: [...medicationRepository.fallback.skus, ...generated.flatMap(result => result.skus)],
    offers: [...medicationRepository.fallback.offers, ...generated.flatMap(result => result.offers)],
  }
}
const bootstrapJobs = new WeakMap<object, { epoch: number; promise: Promise<void> }>()

const referencedMedicationIds = (skus: MedicationSku[]): Set<string> => {
  const cartItems = useCartStore().items
  const savedOrders = readStorage<{ orders?: Array<{ items?: Array<{ skuId?: string }> }> }>(storageKeys.orders, {})
  const selected = readStorage<{ medicationId?: string }>(storageKeys.selection, {})
  const prescription = readStorage<{ latestRequest?: { medicationId?: string } }>(storageKeys.prescription, {})
  const orderItems = Array.isArray(savedOrders?.orders) ? savedOrders.orders.flatMap(order => Array.isArray(order?.items) ? order.items : []) : []
  const skuIds = new Set([...cartItems, ...orderItems].map(item => item?.skuId))
  return new Set([
    ...skus.filter(sku => skuIds.has(sku.id)).map(sku => sku.medicationId),
    selected?.medicationId, prescription?.latestRequest?.medicationId,
  ].filter((id): id is string => typeof id === 'string'))
}

export const useCatalogStore = defineStore('catalog', {
  state: () => {
    const medications = medicationRepository.initialMedications()
    const retainedMedications = medicationRepository.initialRetainedMedications().filter(item => !medications.some(active => active.id === item.id))
    return {
    ...readStorage<CatalogPersistedState>(storageKeys.catalog, defaultState),
    medications,
    retainedMedications,
    ...buildFulfillment([...medications, ...retainedMedications]),
    pharmacies: medicationRepository.fallback.pharmacies,
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
    bootstrapLoading: false,
    bootstrapComplete: false,
    bootstrapMessage: '',
    bootstrapLoadedCount: 0,
  } },
  getters: {
    filteredMedications(state): Medication[] {
      const rxRequired =
        state.rxFilter === 'all' ? undefined : state.rxFilter === 'required'
      let candidates = state.searchResultIds === null ? state.medications : state.medications.filter(item => state.searchResultIds?.includes(item.id))
      if (state.searchResultIds === null && state.dataMode === 'hybrid' && candidates.some(item => item.publicSource)) candidates = candidates.filter(item => item.publicSource)
      return searchMedications(eligibleMedications(candidates, state.dataMode), state.searchResultIds === null ? state.searchQuery : '', {
        form: state.formFilter || undefined,
        strength: state.strengthFilter || undefined,
        rxRequired,
      }, state.dataMode !== 'demo')
    },
    medicationById: (state) => (id: string): Medication | undefined =>
      state.medications.find((medication) => medication.id === id) ?? state.retainedMedications.find(medication => medication.id === id),
    medicationBySlug: (state) => (slug: string): Medication | undefined =>
      state.medications.find((medication) => medication.slug === slug) ?? state.retainedMedications.find(medication => medication.slug === slug),
    skuById: (state) => (id: string): MedicationSku | undefined =>
      state.skus.find((sku) => sku.id === id),
    skusForMedication: (state) => (medicationId: string): MedicationSku[] =>
      state.skus.filter((sku) => sku.medicationId === medicationId),
  },
  actions: {
    mergePublicMedications(incoming: Medication[]): void {
      const existing = new Map([...this.medications, ...this.retainedMedications].map(item => [item.id, item]))
      const merged = new Map(this.medications.map(item => [item.id, item]))
      const explorer = useDrugExplorerStore()
      const selectedIds = new Set([...new Set([...explorer.selectedDrugIds, ...explorer.cards.flatMap(card => card.drugIds)])].slice(0, 4))
      this.retainedMedications.filter(item => selectedIds.has(item.id)).forEach(item => merged.set(item.id, item))
      incoming.forEach(item => {
        const previous = existing.get(item.id)
        const configuration = previous?.demoConfiguration ?? item.demoConfiguration
        merged.set(item.id, {
          ...item,
          ...(previous?.publicSummary ? { publicSummary: previous.publicSummary } : {}),
          ...(previous?.categorySource === 'source-class' ? { category: previous.category, categorySource: previous.categorySource, categoryDetail: previous.categoryDetail } : {}),
          ...(configuration ? { demoConfiguration: { ...configuration } } : {}),
        })
      })
      const all = [...merged.values()]
      const active = retainMedicationIdentities(all, selectedIds)
      const activeIds = new Set(active.map(item => item.id))
      const protectedIds = referencedMedicationIds(this.skus)
      const archived = new Map([...this.retainedMedications, ...all.filter(item => !activeIds.has(item.id))].map(item => [item.id, item]))
      this.retainedMedications = [...archived.values()].filter(item => item.publicOnly && !activeIds.has(item.id) && protectedIds.has(item.id))
      this.medications = active
      const fulfillment = buildFulfillment([...this.medications, ...this.retainedMedications])
      this.skus = fulfillment.skus
      this.offers = fulfillment.offers
      medicationRepository.persistIdentities(this.medications, this.retainedMedications)
    },
    async bootstrapPublicCatalog(force = false): Promise<void> {
      if (this.dataMode === 'demo') {
        this.bootstrapMessage = 'Deterministic demo catalog. Public preload is disabled in demo mode.'
        return
      }
      const epoch = this.dataEpoch
      const currentJob = bootstrapJobs.get(this)
      if (currentJob?.epoch === epoch) return currentJob.promise
      if (this.bootstrapComplete && !force) return
      this.bootstrapLoading = true
      this.bootstrapMessage = 'Loading public medication names. You can browse, search and use the mock cart while they load.'
      const current = () => this.dataEpoch === epoch && this.dataMode !== 'demo'
      const pending = (async () => {
        try {
          const result = await medicationRepository.preloadPublicCatalog(this.medications, batch => {
            if (!current()) return
            this.mergePublicMedications(batch)
            this.bootstrapLoadedCount = this.medications.filter(item => item.publicSource).length
            if (!this.searchQuery.trim()) {
              this.searchResultIds = null
              this.searchMessage = ''
            }
            this.bootstrapMessage = `${this.bootstrapLoadedCount} public medication records loaded. More names are loading; demo prices are fictional.`
          }, current)
          if (!current() || result.cancelled) return
          this.bootstrapComplete = true
          this.bootstrapLoadedCount = this.medications.filter(item => item.publicSource).length
          this.bootstrapMessage = this.bootstrapLoadedCount
            ? `${this.bootstrapLoadedCount} public medication records ready.${result.failedQueries ? ` ${result.failedQueries} startup searches could not load; other records remain usable.` : ''} Public facts and fictional demo prices are separate.`
            : 'Public sources could not provide startup records. The labeled demo catalog is still usable. Retry public loading when connected.'
        } catch {
          if (current()) this.bootstrapMessage = 'Public startup loading failed. Existing records and the demo cart remain usable. Retry when connected.'
        } finally {
          if (current()) this.bootstrapLoading = false
          if (bootstrapJobs.get(this)?.epoch === epoch) bootstrapJobs.delete(this)
        }
      })()
      bootstrapJobs.set(this, { epoch, promise: pending })
      return pending
    },
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
        this.mergePublicMedications(result.medications)
        this.searchResultIds = query.trim() ? result.medications.map(item => item.id) : null
        this.searchMessage = !query.trim() && this.dataMode !== 'demo' && this.medications.some(item => item.publicSource)
          ? ''
          : result.message
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
      this.mergePublicMedications([medication])
      return this.medicationById(medication.id) ?? medication
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
          const currentMedication = this.medicationById(id)
          if (record.drug && currentMedication) {
            currentMedication.publicSource = record.drug.sources.find(source => source.source !== 'demo')?.source ?? 'public'
            if (currentMedication.publicOnly) {
              Object.assign(currentMedication, medicationRepository.categoryForMedication(currentMedication, record.drug))
              currentMedication.publicSummary = { brandNames: [...record.drug.identity.brandNames], forms: [...record.drug.forms], strengths: [...record.drug.strengths] }
            }
            medicationRepository.persistIdentities(this.medications, this.retainedMedications)
          }
          if (record.searchTerms && currentMedication) currentMedication.searchTerms = [...new Set([...currentMedication.searchTerms, ...record.searchTerms])]
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
        this.mergePublicMedications([found])
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
      this.bootstrapLoading = false
      this.bootstrapComplete = false
      this.bootstrapMessage = ''
      void this.search(this.searchQuery)
      if (mode !== 'demo') void this.bootstrapPublicCatalog()
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
