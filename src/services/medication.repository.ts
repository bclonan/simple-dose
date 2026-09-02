import { createLegacyCatalogAdapter } from '../../cleardose-data-plugin/src/legacy'
import type { ClearDoseDataService } from '../../cleardose-data-plugin/src/service'
import { DataProviderError, type ClearDoseDrug, type DrugSearchHit, type GetDrugOptions } from '../../cleardose-data-plugin/src/types'
import { clearDose, demoCatalog } from '../plugins/cleardose'
import { discoveryAttributes, searchMedications } from '../domain/catalog'
import type { Medication } from '../types/demo-db'
import { readStorage, writeStorage } from '../utils/storage'

export type DataMode = 'live' | 'hybrid' | 'demo'
export interface PublicMedicationRecord {
  drug?: ClearDoseDrug
  status: 'live' | 'cache' | 'stale-cache' | 'demo' | 'unavailable'
  message?: string
  searchTerms?: string[]
}
export const similarityNotice = 'Catalog similarity is not therapeutic interchangeability, dosing equivalence, or advice about suitability. FDA interaction sections are not a pairwise interaction check.'
const identityKey = 'cleardose:public-identities-v1'
const modeKey = 'cleardose:data-mode'
const normalize = (value: string) => value.trim().toLowerCase()
const slug = (value: string) => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 95)
export const initialDataMode = (): DataMode => {
  const fallback = import.meta.env.MODE === 'test' || import.meta.env.VITE_CLEARDose_DATA_MODE === 'demo' ? 'demo' : 'hybrid'
  const value = readStorage<unknown>(modeKey, fallback)
  return value === 'live' || value === 'demo' || value === 'hybrid' ? value : fallback
}
export const saveDataMode = (mode: DataMode) => writeStorage(modeKey, mode)

export class MedicationRepository {
  readonly fallback = demoCatalog
  private readonly adapter
  constructor(private readonly data: Pick<ClearDoseDataService, 'search' | 'getDrug'> = clearDose.data) {
    this.adapter = createLegacyCatalogAdapter(data as ClearDoseDataService)
  }

  initialMedications(): Medication[] {
    const stored = readStorage<unknown>(identityKey, [])
    const valid = Array.isArray(stored) ? stored.filter((item): item is Medication => {
      if (!item || typeof item !== 'object') return false
      const value = item as Medication
      return /^med-public-[a-z0-9-]+$/.test(value.id) && typeof value.slug === 'string' &&
        typeof value.genericName === 'string' && value.genericName.length <= 250 &&
        [value.brandNames, value.forms, value.strengths, value.searchTerms].every(list => Array.isArray(list) && list.every(x => typeof x === 'string')) &&
        value.publicOnly === true && Array.isArray(value.quantityOptions) && value.quantityOptions.length === 0
    }).slice(-100) : []
    return [...this.fallback.medications.map(item => {
      const saved = Array.isArray(stored) ? stored.find(value => value && value.id === item.id && value.slug === item.slug && value.genericName === item.genericName && typeof value.publicSource === 'string') : undefined
      const summary = saved?.publicSummary
      const validSummary = summary && [summary.brandNames, summary.forms, summary.strengths].every(list => Array.isArray(list) && list.length <= 500 && list.every(value => typeof value === 'string' && value.length <= 500))
      return { ...item, ...(saved ? { publicSource: saved.publicSource, ...(validSummary ? { publicSummary: summary } : {}) } : {}) }
    }), ...valid]
  }

  persistIdentities(medications: Medication[]) {
    writeStorage(identityKey, medications.filter(item => item.publicSource).slice(-112))
  }

  private medicationFromHit(hit: DrugSearchHit, existing: Medication[], category?: string): Medication {
    const known = existing.find(med => normalize(med.genericName) === normalize(hit.genericName))
    if (known && !known.publicOnly) return { ...known, publicSource: hit.source, publicSummary: { brandNames: hit.brandNames, forms: hit.forms, strengths: hit.strengths } }
    const publicSlug = `public-${slug(hit.genericName) || slug(hit.id)}`
    return {
      id: known?.id ?? `med-${publicSlug}`, slug: known?.slug ?? publicSlug,
      genericName: hit.genericName, brandNames: hit.brandNames, category: category ?? known?.category ?? 'uncategorized',
      rxRequired: false, publicOnly: true, publicSource: hit.source,
      displaySummary: 'Public drug information. Retail availability and prescription status have not been verified.',
      forms: hit.forms, strengths: hit.strengths, quantityOptions: [],
      searchTerms: [hit.genericName, ...hit.brandNames],
    }
  }

  async search(query: string, mode: DataMode, existing: Medication[]) {
    const local = searchMedications(existing, query, {}, mode !== 'demo')
    if (mode === 'demo') return { medications: searchMedications(this.fallback.medications, query), message: 'Deterministic demo catalog.', status: 'demo' }
    if (!query.trim()) {
      return { medications: mode === 'live' ? local.filter(item => item.publicSource) : local, message: 'Browse the loaded catalog. Search a drug or brand name to query public sources.', status: 'catalog' }
    }
    try {
      const categoryMembers = this.fallback.medications.filter(item => item.category === query.trim())
      let hits: DrugSearchHit[]
      if (categoryMembers.length) {
        // ClearDose owns category membership. Providers only enrich those exact identities.
        const results = await Promise.allSettled(categoryMembers.map(item => this.data.search(item.genericName, { limit: 5 })))
        hits = results.flatMap((result, index) => result.status === 'fulfilled' ? result.value.filter(hit => {
          const name = normalize(hit.genericName)
          const requested = normalize(categoryMembers[index]!.genericName)
          return name === requested || name.startsWith(`${requested} `)
        }) : [])
        if (!hits.length && results.some(result => result.status === 'rejected')) throw new DataProviderError('public', 'unavailable', 'Category search providers unavailable.')
        if (results.some(result => result.status === 'rejected')) hits = hits.map(hit => ({ ...hit, warnings: [...(hit.warnings ?? []), { source: 'public', code: 'partial' as const, message: 'Some category medication searches could not load.' }] }))
      } else hits = await this.data.search(query, { limit: 20 })
      const publicResults = [...new Map(hits.map(hit => {
        const medication = this.medicationFromHit(hit, existing, categoryMembers.length ? query.trim() : undefined)
        return [medication.id, medication] as const
      })).values()]
      const medications = mode === 'hybrid'
        ? [...publicResults, ...local.filter(item => !publicResults.some(hit => hit.id === item.id))]
        : publicResults
      const older = hits.some(hit => hit.dataMeta?.stale)
      const cached = hits.length > 0 && hits.every(hit => hit.dataMeta?.origin === 'cache')
      const warnings = hits.flatMap(hit => hit.warnings ?? [])
      const message = older ? 'Using older cached public matches because a provider is unavailable.' : cached ? 'Cached public source matches.' : hits.length ? 'Public source matches. Demo fulfillment is available only for the original catalog.' : mode === 'hybrid' && local.length ? 'No public match. Showing labeled local catalog results.' : 'No matching public medication records.'
      return { medications, status: older ? 'stale-cache' : cached ? 'cache' : hits.length ? 'public' : 'empty', message: warnings.length ? `${message} ${warnings[0]?.message}` : message }
    } catch (error) {
      const reason = error instanceof DataProviderError && error.code === 'rate-limit' ? 'Public search is rate limited.' : 'Public search is unavailable.'
      return { medications: mode === 'hybrid' ? local : local.filter(item => item.publicSource), status: 'fallback', message: mode === 'hybrid' ? `${reason} Showing loaded and demo matches; try again later.` : `${reason} Showing previously loaded public identities only.` }
    }
  }

  async getMedication(medication: Medication, mode: DataMode, quantity = 30, options: GetDrugOptions = { includeClinical: true, includePrices: true }): Promise<PublicMedicationRecord> {
    if (mode === 'demo') return { status: 'demo', message: 'Demo mode. No public clinical data is requested.' }
    try {
      const drug = await this.data.getDrug(medication.genericName, { ...options, quantity })
      // Keep app IDs and exact demo SKU dimensions. This adapter never generates purchasable offers.
      const adapted = this.adapter.medicationFromDrug(drug, medication.category, [])
      return { drug: mode === 'live' ? { ...drug, prices: drug.prices.filter(price => price.kind !== 'demo'), sources: drug.sources.filter(source => source.source !== 'demo') } : drug, searchTerms: adapted.searchTerms, status: drug.dataMeta?.origin ?? 'live' }
    } catch (error) {
      if (error instanceof DataProviderError && error.code === 'ambiguous') {
        return { status: mode === 'hybrid' && !medication.publicOnly ? 'demo' : 'unavailable', message: 'Several public product groups matched. Try a more specific generic or brand name. No clinical data was inferred.' }
      }
      return { status: mode === 'hybrid' && !medication.publicOnly ? 'demo' : 'unavailable', message: error instanceof DataProviderError && error.code === 'not-found' ? 'No matching public product record. Clinical information is unavailable.' : 'Public drug data is unavailable. Retry when connected; no missing clinical section should be treated as a safety finding.' }
    }
  }

  related(reference: Medication, candidates: Medication[], records: Record<string, PublicMedicationRecord>, basis?: string, mode: DataMode = 'hybrid') {
    const source = records[reference.id]?.drug
    const same = (left: string[], right: string[]) => left.some(item => right.map(normalize).includes(normalize(item)))
    const matches = candidates.filter(item => item.id !== reference.id).map(item => {
      const target = records[item.id]?.drug
      const reasons: string[] = []
      if ((!basis || basis === 'ingredient') && source && target && same(source.activeIngredients, target.activeIngredients)) reasons.push('Shared public active ingredient')
      if ((!basis || basis === 'class') && source && target && same(source.pharmacologicClasses, target.pharmacologicClasses)) reasons.push('Shared public pharmacologic class')
      if ((!basis || basis === 'category') && item.category === reference.category && item.category !== 'uncategorized') reasons.push(`Same catalog category: ${item.category}`)
      if ((!basis || basis === 'form') && same(discoveryAttributes(item, mode !== 'demo').forms, discoveryAttributes(reference, mode !== 'demo').forms)) reasons.push('Shared listed dosage form')
      return { medicationId: item.id, name: item.genericName, reasons }
    }).filter(item => item.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name))
    return { matches, coverage: { candidateCount: candidates.filter(item => item.id !== reference.id).length, publicRecordsLoaded: candidates.filter(item => records[item.id]?.drug).length, basis: basis ?? 'available catalog fields', note: 'Ingredient and class matching use already loaded public details. Missing public data is not evidence that no match exists.' }, notice: similarityNotice }
  }
}

export const medicationRepository = new MedicationRepository()
