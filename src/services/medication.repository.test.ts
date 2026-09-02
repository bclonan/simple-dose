import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DataProviderError, type ClearDoseDrug, type DrugSearchHit } from '../../cleardose-data-plugin/src/types'
import { MedicationRepository, medicationRepository } from './medication.repository'
import { useCatalogStore } from '../stores/catalog.store'
import { useClearDoseActions } from './cleardose.actions'
import { redactSensitive } from '../utils/redact'
import { searchMedications } from '../domain/catalog'

const hit: DrugSearchHit = { id: 'rxcui-1', slug: 'example', genericName: 'Example', brandNames: ['Example Brand'], forms: ['SOLUTION'], strengths: ['1 mg/mL'], ndcs: ['00000000001'], source: 'openfda-ndc' }
const drug: ClearDoseDrug = {
  identity: { id: hit.id, slug: hit.slug, genericName: hit.genericName, brandNames: hit.brandNames, ndcs: hit.ndcs, productNdcs: [], applicationNumbers: [], splSetIds: [] },
  variants: [], forms: hit.forms, strengths: hit.strengths, routes: ['ORAL'], activeIngredients: ['Example'], manufacturers: [], pharmacologicClasses: [],
  prices: [{ id: 'benchmark-1', kind: 'nadac-benchmark', amount: 3, unitAmount: .1, quantity: 30, currency: 'USD', basis: 'prescription', label: 'NADAC benchmark', consumerMeaning: 'Not retail', source: { source: 'nadac', retrievedAt: '2026-09-02' } }],
  sources: [{ source: 'openfda-ndc', retrievedAt: '2026-09-02' }],
}
const setup = () => {
  const data = { search: vi.fn().mockResolvedValue([hit]), getDrug: vi.fn().mockResolvedValue(drug) }
  return { data, repo: new MedicationRepository(data) }
}

describe('shared medication repository', () => {
  it('filters the same public attributes shown on cards without changing exact demo configurations', () => {
    const { repo } = setup()
    const seed = repo.fallback.medications[0]!
    const enriched = { ...seed, publicSummary: { brandNames: ['Public Brand'], forms: ['SOLUTION'], strengths: ['1 mg/mL'] } }
    expect(searchMedications([enriched], 'Public Brand', { form: 'solution', strength: '1 mg/mL' })).toHaveLength(1)
    expect(searchMedications([enriched], '', { form: 'tablet' })).toHaveLength(0)
    expect(searchMedications([enriched], '', { form: 'tablet' }, false)).toHaveLength(1)
    expect(enriched.forms).toEqual(seed.forms)
  })
  it('invalidates a delayed detail when data mode switches away and back', async () => {
    setActivePinia(createPinia())
    const catalog = useCatalogStore()
    catalog.dataMode = 'hybrid'
    const search = vi.spyOn(catalog, 'search').mockResolvedValue([])
    let finish!: (record: { status: 'live'; drug: ClearDoseDrug }) => void
    const fetch = vi.spyOn(medicationRepository, 'getMedication').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = catalog.loadMedication('med-metformin')
    catalog.setDataMode('demo')
    catalog.setDataMode('hybrid')
    finish({ status: 'live', drug })
    await pending
    expect(catalog.publicRecords['med-metformin']).toBeUndefined()
    expect(catalog.dataEpoch).toBe(2)
    search.mockRestore(); fetch.mockRestore()
  })
  it('distinguishes an ambiguous public identity from a network outage', async () => {
    const { repo, data } = setup()
    data.getDrug.mockRejectedValue(new DataProviderError('openfda-ndc', 'ambiguous', 'Several groups matched.'))
    expect(await repo.getMedication(repo.fallback.medications[0]!, 'hybrid')).toMatchObject({ status: 'demo', message: expect.stringContaining('more specific generic or brand name') })
  })
  it('loads lightweight public matches without generating purchasable SKU combinations', async () => {
    const { repo, data } = setup()
    const result = await repo.search('Example Brand', 'hybrid', repo.initialMedications())
    expect(data.search).toHaveBeenCalledWith('Example Brand', { limit: 20 })
    expect(data.getDrug).not.toHaveBeenCalled()
    expect(result.medications[0]).toMatchObject({ id: 'med-public-example', publicOnly: true, quantityOptions: [], forms: ['SOLUTION'] })
    expect(repo.fallback.skus.some(sku => sku.medicationId === 'med-public-example')).toBe(false)
  })
  it('preserves seed IDs and taxonomy when exact generic public identity matches', async () => {
    const { repo, data } = setup()
    data.search.mockResolvedValue([{ ...hit, genericName: 'Atorvastatin' }])
    const result = await repo.search('atorvastatin', 'hybrid', repo.initialMedications())
    expect(result.medications[0]).toMatchObject({ id: 'med-atorvastatin', slug: 'atorvastatin', category: 'cholesterol' })
    expect(result.medications[0]?.publicSummary).toEqual({ brandNames: hit.brandNames, forms: hit.forms, strengths: hit.strengths })
    expect(result.medications[0]?.forms).toEqual(repo.fallback.medications[0]?.forms)
  })
  it('enriches ClearDose categories with lightweight exact public identities, not arbitrary provider classes', async () => {
    const { repo, data } = setup()
    data.search.mockImplementation(async name => [{ ...hit, genericName: name }, { ...hit, genericName: 'Unrelated' }])
    const result = await repo.search('cholesterol', 'live', repo.initialMedications())
    expect(result.medications.map(item => item.id)).toEqual(['med-atorvastatin', 'med-rosuvastatin'])
    expect(data.search).toHaveBeenCalledTimes(2)
    expect(data.getDrug).not.toHaveBeenCalled()
  })
  it('requests only selected public sections and retains earlier requested sections on later loads', async () => {
    setActivePinia(createPinia())
    const catalog = useCatalogStore()
    catalog.dataMode = 'hybrid'
    const clinical = { indications: [], contraindications: [], warnings: [], boxedWarnings: [], adverseReactions: [], drugInteractions: [], clinicalPharmacology: [], pregnancy: [], pediatricUse: [], geriatricUse: [], dosageAndAdministration: [] }
    const fetch = vi.spyOn(medicationRepository, 'getMedication').mockResolvedValue({ status: 'live', drug: { ...drug, clinical } })
    await catalog.loadMedication('med-metformin', 30, { includeClinical: true, includePrices: false })
    await catalog.loadMedication('med-metformin', 30, { includeClinical: false, includePrices: false })
    expect(fetch).toHaveBeenCalledTimes(1)
    await catalog.loadMedication('med-metformin', 30, { includeClinical: false, includePrices: true })
    expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'med-metformin' }), 'hybrid', 30, { includeClinical: true, includePrices: true, includeAdverseEventSummary: false, quantity: 30 })
    await catalog.loadMedication('med-metformin', 90, { includePrices: true })
    expect(fetch).toHaveBeenCalledTimes(3)
    fetch.mockRestore()
  })
  it('retains distinct public salt names within the requested ClearDose category', async () => {
    const { repo, data } = setup()
    data.search.mockResolvedValue([{ ...hit, genericName: 'Metformin HCl' }, { ...hit, genericName: 'Metformin Hydrochloride' }])
    const result = await repo.search('diabetes', 'live', repo.initialMedications())
    expect(result.medications.map(item => item.genericName)).toEqual(['Metformin HCl', 'Metformin Hydrochloride'])
    expect(result.medications.every(item => item.category === 'diabetes' && item.publicOnly)).toBe(true)
    expect(result.medications.some(item => item.id === 'med-metformin')).toBe(false)
  })
  it('restores validated public search metadata without overwriting demo dimensions', async () => {
    const { repo, data } = setup()
    data.search.mockResolvedValue([{ ...hit, genericName: 'Atorvastatin' }])
    repo.persistIdentities((await repo.search('atorvastatin', 'hybrid', repo.initialMedications())).medications)
    const restored = repo.initialMedications().find(item => item.id === 'med-atorvastatin')!
    expect(restored.publicSummary?.forms).toEqual(['SOLUTION'])
    expect(restored.forms).toEqual(repo.fallback.medications[0]!.forms)
  })
  it('rechecks expired or partially failed public details on the next requested load', async () => {
    setActivePinia(createPinia())
    const catalog = useCatalogStore()
    catalog.dataMode = 'hybrid'
    const fetch = vi.spyOn(medicationRepository, 'getMedication').mockResolvedValue({ status: 'live', drug: { ...drug, warnings: [{ source: 'nadac', code: 'network', message: 'Unavailable' }] } })
    await catalog.loadMedication('med-metformin', 30, { includePrices: true })
    await catalog.loadMedication('med-metformin', 30, { includePrices: true })
    expect(fetch).toHaveBeenCalledTimes(2)
    fetch.mockResolvedValue({ status: 'cache', drug: { ...drug, dataMeta: { origin: 'cache', stale: false, retrievedAt: '2020-01-01', expiresAt: '2020-01-02' } } })
    await catalog.loadMedication('med-metformin', 30, { includePrices: true })
    await catalog.loadMedication('med-metformin', 30, { includePrices: true })
    expect(fetch).toHaveBeenCalledTimes(4)
    fetch.mockRestore()
  })
  it('isolates network failure with explicit hybrid fallback and no live demo leakage', async () => {
    const { repo, data } = setup()
    data.search.mockRejectedValue(new Error('offline'))
    expect((await repo.search('atorvastatin', 'hybrid', repo.initialMedications())).medications).toHaveLength(1)
    expect((await repo.search('atorvastatin', 'live', repo.initialMedications())).medications).toHaveLength(0)
  })
  it('never fetches in deterministic demo mode', async () => {
    const { repo, data } = setup()
    await repo.search('atorvastatin', 'demo', repo.initialMedications())
    expect(await repo.getMedication(repo.fallback.medications[0]!, 'demo')).toMatchObject({ status: 'demo' })
    expect(data.search).not.toHaveBeenCalled()
    expect(data.getDrug).not.toHaveBeenCalled()
  })
  it('persists only validated lightweight public identity records', async () => {
    const { repo } = setup()
    const result = await repo.search('example', 'live', [])
    repo.persistIdentities(result.medications)
    expect(repo.initialMedications().at(-1)?.id).toBe('med-public-example')
    window.localStorage.setItem('cleardose:public-identities-v1', '{"bad":true}')
    expect(repo.initialMedications()).toHaveLength(12)
  })
  it('keeps benchmark semantics and public source metadata', async () => {
    const { repo } = setup()
    const record = await repo.getMedication(repo.fallback.medications[0]!, 'hybrid', 30)
    expect(record.drug?.prices[0]).toMatchObject({ kind: 'nadac-benchmark', amount: 3, quantity: 30 })
    expect(repo.fallback.offers.some(offer => offer.id === 'benchmark-1')).toBe(false)
    expect(record.drug?.sources[0]?.source).toBe('openfda-ndc')
  })
  it('gives related-match reasons without prescribing substitution', () => {
    const { repo } = setup()
    const reference = repo.fallback.medications[0]!
    const result = repo.related(reference, repo.fallback.medications, {})
    expect(result.matches.every(match => match.medicationId !== reference.id && match.reasons.length)).toBe(true)
    expect(result.notice).toContain('not therapeutic interchangeability')
  })
  it('guards existing commerce tools in live mode without clearing saved items', async () => {
    setActivePinia(createPinia())
    const catalog = useCatalogStore()
    catalog.dataMode = 'live'
    const actions = useClearDoseActions()
    await expect(actions.compareFulfillmentOptions({})).rejects.toThrow('Live retail pricing')
  })
  it('retains public drug names in logs and still redacts personal names', () => {
    expect(redactSensitive({ genericName: 'Atorvastatin', brandNames: ['Lipitor'], fullName: 'Private Person', address: { city: 'Private' } })).toEqual({ genericName: 'Atorvastatin', brandNames: ['Lipitor'], fullName: '[redacted]', address: '[redacted]' })
  })
  it.each(['live', 'demo', 'hybrid'] as const)('uses %s catalog eligibility before related-match scope', async mode => {
    setActivePinia(createPinia())
    const catalog = useCatalogStore()
    const seed = catalog.medications[0]!
    catalog.medications = [
      { ...seed, id: 'med-reference', publicSource: 'openfda-ndc' },
      { ...seed, id: 'med-demo-only', publicSource: undefined },
      { ...seed, id: 'med-public-example', publicOnly: true, publicSource: 'openfda-ndc', quantityOptions: [] },
    ]
    catalog.dataMode = mode
    const expected = mode === 'live' ? ['med-public-example'] : mode === 'demo' ? ['med-demo-only'] : ['med-demo-only', 'med-public-example']
    const scope = catalog.medications.map(item => item.id)
    for (const scopeIds of [undefined, scope]) {
      const result = await catalog.findRelated('med-reference', scopeIds, 'category')
      expect(result.matches.map(item => item.medicationId).sort()).toEqual(expected)
      expect(result.coverage.candidateCount).toBe(expected.length)
    }
    if (mode !== 'hybrid') {
      await expect(catalog.findRelated(mode === 'live' ? 'med-demo-only' : 'med-public-example')).rejects.toThrow('current medication ID')
    }
  })

  it('caps deep-link public identities at 100 with the same oldest-first eviction as search', async () => {
    setActivePinia(createPinia())
    const catalog = useCatalogStore()
    const seeds = catalog.medications.filter(item => !item.publicOnly)
    const makePublic = (index: number) => ({ ...seeds[0]!, id: `med-public-example-${index}`, slug: `public-example-${index}`, genericName: `Example ${index}`, publicOnly: true, publicSource: 'openfda-ndc', quantityOptions: [] })
    catalog.medications = [...seeds, ...Array.from({ length: 100 }, (_, index) => makePublic(index))]
    catalog.dataMode = 'live'
    const search = vi.spyOn(medicationRepository, 'search').mockResolvedValue({ medications: [makePublic(100)], status: 'public', message: 'Public match.' })
    try {
      await catalog.loadBySlug('public-example-100')
      expect(catalog.medications.filter(item => item.publicOnly)).toHaveLength(100)
      expect(catalog.medicationById('med-public-example-0')).toBeUndefined()
      expect(catalog.medicationById('med-public-example-1')).toBeDefined()
      expect(catalog.medicationById('med-public-example-100')).toBeDefined()
      expect(catalog.medications.filter(item => !item.publicOnly).map(item => item.id)).toEqual(seeds.map(item => item.id))
      expect(medicationRepository.initialMedications().filter(item => item.publicOnly)).toHaveLength(100)
    } finally {
      search.mockRestore()
    }
  })
})
