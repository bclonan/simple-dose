import { defineStore } from 'pinia'
import { drugFactTypes, factLoadOptions, type DrugFactCard, type DrugFactType } from '../domain/drug-facts'
import { drugFactStatus, type DrugFactResult } from '../domain/drug-fact-status'
import { useCatalogStore } from './catalog.store'
import type { Medication } from '../types/demo-db'

export const MAX_EXPLORER_DRUGS = 4
const session = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : String(Date.now())
const isFact = (value: string): value is DrugFactType => drugFactTypes.includes(value as DrugFactType)
const queryList = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? [...new Set(raw.slice(0, 2000).split(',').map(item => item.trim()).filter(Boolean))] : []
}
export interface ConfigureExplorerInput {
  drugs?: string[]
  mode?: 'replace' | 'add' | 'remove'
  facts?: DrugFactType[]
  factMode?: 'replace' | 'add'
  beforeCommit?: () => void
  focus?: boolean
}

export const useDrugExplorerStore = defineStore('drugExplorer', {
  state: () => ({
    selectedDrugIds: [] as string[],
    cards: [] as DrugFactCard[],
    loading: false,
    message: '',
    focusedCardId: null as string | null,
    revisionNumber: 0,
    operationVersion: 0,
    loadVersion: 0,
    cardSequence: 0,
  }),
  getters: {
    revision: state => `explorer-${session}-${state.revisionNumber}`,
    selectedMedications(state): Medication[] {
      const catalog = useCatalogStore()
      return state.selectedDrugIds.flatMap(id => catalog.medicationById(id) ?? [])
    },
    factResults(state): DrugFactResult[] {
      const catalog = useCatalogStore()
      return state.cards.flatMap(card => card.drugIds.map(drugId => ({
        cardId: card.id, drugId, factType: card.factType,
        ...drugFactStatus(catalog.publicRecords[drugId], card.factType, Boolean(catalog.detailLoading[drugId]), catalog.dataMode === 'demo'),
      })))
    },
  },
  actions: {
    async configureWorkspace(input: ConfigureExplorerInput): Promise<void> {
      if (input.drugs && (input.drugs.length > MAX_EXPLORER_DRUGS || input.drugs.some(term => typeof term !== 'string' || !term.trim() || term.length > 120))) throw new Error('Choose up to four medication IDs, generic names, or brand names.')
      if (input.facts && (input.facts.length > drugFactTypes.length || input.facts.some(fact => !isFact(fact)))) throw new Error('Choose supported medication facts.')
      const version = ++this.operationVersion
      const revision = this.revisionNumber
      let committedRevision: number | undefined
      this.message = ''
      this.loading = true
      try {
        const catalog = useCatalogStore()
        const epoch = catalog.dataEpoch
        const resolved = input.drugs ? await Promise.all(input.drugs.map(term => catalog.resolveMedication(term))) : undefined
        if (version !== this.operationVersion || revision !== this.revisionNumber || epoch !== catalog.dataEpoch) throw new Error('The workspace changed while medications loaded. Review the current selection and try again.')
        input.beforeCommit?.()
        if (input.mode !== 'remove' && catalog.dataMode === 'demo' && resolved?.some(item => item.publicOnly)) throw new Error('This medication is a public-only record. Switch to hybrid or public data mode to select it.')
        const ids = resolved?.map(item => item.id)
        const nextIds = ids === undefined ? this.selectedDrugIds : input.mode === 'add'
          ? [...new Set([...this.selectedDrugIds, ...ids])]
          : input.mode === 'remove' ? this.selectedDrugIds.filter(id => !ids.includes(id)) : [...new Set(ids)]
        if (nextIds.length > MAX_EXPLORER_DRUGS) throw new Error('Compare up to four medications. Remove one before adding another.')
        this.selectedDrugIds = nextIds
        if (input.facts) this.applyFacts(input.facts, input.factMode ?? 'replace')
        if (input.focus === false) this.focusedCardId = null
        this.cards.forEach(card => { card.drugIds = [...nextIds] })
        committedRevision = ++this.revisionNumber
        await this.loadSelected()
        if (version !== this.operationVersion || committedRevision !== this.revisionNumber || epoch !== catalog.dataEpoch) {
          throw new Error('This edit was superseded after it was applied. Review the current workspace before trying again.')
        }
      } catch (error) {
        if (version === this.operationVersion && (committedRevision === undefined || committedRevision === this.revisionNumber)) {
          this.message = error instanceof Error ? error.message : 'The workspace could not update. Your previous selection is unchanged.'
        }
        throw error
      } finally {
        if (version === this.operationVersion) this.loading = false
      }
    },
    selectDrugs(drugs: string[], mode: 'replace' | 'add' = 'replace') {
      return this.configureWorkspace({ drugs, mode })
    },
    setFacts(facts: DrugFactType[], mode: 'replace' | 'add' = 'replace') {
      return this.configureWorkspace({ facts, factMode: mode })
    },
    applyFacts(facts: DrugFactType[], mode: 'replace' | 'add'): void {
      const unique = [...new Set(facts)]
      const previous = this.cards
      const requested = unique.map(factType => previous.find(card => card.factType === factType) ?? {
        id: `fact-${++this.cardSequence}`, factType, drugIds: [...this.selectedDrugIds],
      })
      this.cards = mode === 'replace' ? requested : [...previous, ...requested.filter(card => !previous.some(item => item.factType === card.factType))]
      this.focusedCardId = requested.at(-1)?.id ?? null
    },
    async addFactCard(fact: DrugFactType): Promise<void> {
      const existing = this.cards.find(card => card.factType === fact)
      if (existing) {
        // Clear first so repeated clicks still request keyboard focus.
        this.focusedCardId = null
        await Promise.resolve()
        this.focusedCardId = existing.id
        return
      }
      await this.setFacts([fact], 'add')
    },
    changeFactCard(id: string, fact: DrugFactType): void {
      if (!isFact(fact)) throw new Error('Choose a supported medication fact.')
      const current = this.cards.find(card => card.id === id)
      if (!current) throw new Error('That card is no longer in the workspace.')
      const duplicate = this.cards.find(card => card.factType === fact && card.id !== id)
      if (duplicate) {
        this.cards = this.cards.filter(card => card.id !== id)
        this.focusedCardId = duplicate.id
      } else {
        current.factType = fact
        this.focusedCardId = id
      }
      this.revisionNumber++
      void this.loadSelected()
    },
    removeFactCard(id: string): void {
      if (!this.cards.some(card => card.id === id)) throw new Error('That card is no longer in the workspace.')
      this.cards = this.cards.filter(card => card.id !== id)
      this.focusedCardId = this.cards.at(-1)?.id ?? null
      this.revisionNumber++
    },
    removeDrug(id: string): void {
      this.operationVersion++
      this.loading = false
      this.selectedDrugIds = this.selectedDrugIds.filter(item => item !== id)
      this.cards.forEach(card => { card.drugIds = [...this.selectedDrugIds] })
      this.revisionNumber++
    },
    clearWorkspace(): void {
      this.operationVersion++
      this.loadVersion++
      this.selectedDrugIds = []
      this.cards = []
      this.focusedCardId = null
      this.message = ''
      this.loading = false
      this.revisionNumber++
    },
    async loadSelected(force = false): Promise<void> {
      const catalog = useCatalogStore()
      const version = ++this.loadVersion
      const revision = this.revisionNumber
      const epoch = catalog.dataEpoch
      const options = factLoadOptions(this.cards.map(card => card.factType))
      const results = await Promise.allSettled(this.selectedDrugIds.map(id => catalog.loadMedication(id, 30, options, force)))
      if (version !== this.loadVersion || revision !== this.revisionNumber || epoch !== catalog.dataEpoch) return
      const outcomes = this.factResults
      const failed = results.some(result => result.status === 'rejected') || outcomes.some(result => ['provider-failed', 'partial'].includes(result.availability))
      const missing = outcomes.some(result => ['field-absent', 'source-unavailable', 'not-loaded'].includes(result.availability))
      this.message = failed ? 'Some requested public facts could not load. Available facts remain visible. Retry public data to try again.'
        : missing ? 'Some requested public facts are unavailable. Missing information is not a safety finding.' : ''
    },
    async hydrateFromRoute(query: Record<string, unknown>): Promise<boolean> {
      const drugs = queryList(query.drugs)
      const requestedFacts = queryList(query.facts).map(fact => fact === 'prices' ? 'pricing' : fact)
      const facts = requestedFacts.filter(isFact)
      const notices: string[] = []
      if (drugs.length > MAX_EXPLORER_DRUGS) notices.push('This link contains more than four medications. Showing the first four.')
      if (facts.length !== requestedFacts.length) notices.push('Unsupported fact names were omitted from this link.')
      try {
        await this.configureWorkspace({ drugs: drugs.slice(0, MAX_EXPLORER_DRUGS), facts: requestedFacts.length || query.facts !== undefined ? facts : drugs.length ? ['uses', 'warnings'] : [], focus: false })
        this.focusedCardId = null
        this.message = [this.message, ...notices].filter(Boolean).join(' ')
        return true
      } catch {
        // Keep the requested URL and previous workspace, with the resolution error visible.
        return false
      }
    },
    routeQuery(): { drugs: string; facts: string } {
      const catalog = useCatalogStore()
      return {
        drugs: this.selectedDrugIds.map(id => catalog.medicationById(id)?.slug ?? id).join(','),
        facts: this.cards.map(card => card.factType).join(','),
      }
    },
  },
})
