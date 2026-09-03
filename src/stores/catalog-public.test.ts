import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MedicationRepository, medicationRepository, publicCatalogQueries } from '../services/medication.repository'
import type { ClearDoseDrug, DrugSearchHit } from '../../cleardose-data-plugin/src/types'
import type { Medication } from '../types/demo-db'
import { useCatalogStore } from './catalog.store'
import { useCartStore } from './cart.store'
import { useDrugExplorerStore } from './drugExplorer.store'

const makePublic = (index: number): Medication => ({
  id: `med-public-example-${index}`, slug: `public-example-${index}`, genericName: `Example ${index}`,
  brandNames: [], category: 'other-medications', categorySource: 'fallback', publicOnly: true, publicSource: 'openfda-ndc',
  forms: ['SOLUTION'], strengths: ['1 mg/mL'], quantityOptions: [], rxRequired: false, displaySummary: 'Public identity', searchTerms: [`Example ${index}`],
})
const makeHit = (genericName: string): DrugSearchHit => ({
  id: `public-${genericName}`, slug: genericName.toLowerCase(), genericName, brandNames: [], forms: ['TABLET'], strengths: ['10 mg'], ndcs: [], source: 'openfda-ndc',
})
const result = (medications: Medication[] = [], failedQueries = 0) => ({ medications, failedQueries, cachedQueries: 0, cancelled: false })
const setup = () => { setActivePinia(createPinia()); return useCatalogStore() }
afterEach(() => { vi.restoreAllMocks() })

describe('public catalog startup', () => {
  it('loads 24 diverse searches with at most three concurrent requests and no detail fan-out', async () => {
    let active = 0; let maximum = 0
    const data = {
      search: vi.fn(async (name: string) => {
        active++; maximum = Math.max(maximum, active)
        await Promise.resolve(); active--
        if (name === 'Empagliflozin') throw new Error('temporary outage')
        return [makeHit(name)]
      }),
      getDrug: vi.fn(),
    }
    const repo = new MedicationRepository(data)
    const batches = vi.fn()
    const loaded = await repo.preloadPublicCatalog(repo.initialMedications(), batches)
    expect(publicCatalogQueries).toHaveLength(24)
    expect(data.search).toHaveBeenCalledTimes(24)
    expect(data.search.mock.calls.every(call => (call as unknown[])[1] && ((call as unknown[])[1] as { limit: number }).limit === 4)).toBe(true)
    expect(maximum).toBe(3)
    expect(loaded.failedQueries).toBe(1)
    expect(loaded.medications).toHaveLength(23)
    expect(batches).toHaveBeenCalledTimes(23)
    expect(data.getDrug).not.toHaveBeenCalled()
    expect(new Set(loaded.medications.map(item => item.category)).size).toBeGreaterThan(6)
  })
  it('publishes usable public rows while loading and deduplicates concurrent boot requests', async () => {
    const catalog = setup(); catalog.dataMode = 'hybrid'
    let finish!: () => void
    const gate = new Promise<void>(resolve => { finish = resolve })
    const preload = vi.spyOn(medicationRepository, 'preloadPublicCatalog').mockImplementation(async (_existing, onBatch) => {
      onBatch?.([makePublic(1)])
      await gate
      onBatch?.([makePublic(2)])
      return result([makePublic(1), makePublic(2)])
    })
    const first = catalog.bootstrapPublicCatalog()
    const second = catalog.bootstrapPublicCatalog()
    expect(catalog.bootstrapLoading).toBe(true)
    expect(catalog.skusForMedication(makePublic(1).id)).toHaveLength(3)
    expect(catalog.filteredMedications.map(item => item.id)).toEqual([makePublic(1).id])
    catalog.searchQuery = 'A search typed while startup is running'
    finish(); await Promise.all([first, second])
    expect(preload).toHaveBeenCalledTimes(1)
    expect(catalog.searchQuery).toBe('A search typed while startup is running')
    expect(catalog.bootstrapComplete).toBe(true)
    expect(catalog.bootstrapLoading).toBe(false)
    await catalog.bootstrapPublicCatalog()
    expect(preload).toHaveBeenCalledTimes(1)
  })
  it('retains the fixture fallback on failure and never starts public preload in demo mode', async () => {
    const catalog = setup()
    const preload = vi.spyOn(medicationRepository, 'preloadPublicCatalog').mockResolvedValue(result([], 24))
    await catalog.bootstrapPublicCatalog()
    expect(preload).not.toHaveBeenCalled()
    catalog.dataMode = 'hybrid'
    await catalog.bootstrapPublicCatalog()
    expect(catalog.filteredMedications).toHaveLength(12)
    expect(catalog.bootstrapLoading).toBe(false)
    expect(catalog.bootstrapMessage).toContain('labeled demo catalog')
    expect(catalog.publicRecords).toEqual({})
  })
  it('clears the initial empty-search message as public startup results arrive', async () => {
    const catalog = setup(); catalog.dataMode = 'hybrid'
    await catalog.search('')
    expect(catalog.searchMessage).toContain('Public names have not loaded yet')
    vi.spyOn(medicationRepository, 'preloadPublicCatalog').mockImplementation(async (_existing, onBatch) => {
      onBatch?.([makePublic(1)])
      return result([makePublic(1)])
    })
    await catalog.bootstrapPublicCatalog()
    expect(catalog.filteredMedications.map(item => item.id)).toEqual([makePublic(1).id])
    expect(catalog.bootstrapMessage).toContain('1 public medication records ready')
    expect(catalog.searchMessage).toBe('')
  })
  it('does not restore an obsolete empty-search message when that search finishes after startup', async () => {
    const catalog = setup(); catalog.dataMode = 'hybrid'
    const staleResult = await medicationRepository.search('', 'hybrid', catalog.medications)
    let finish!: (value: typeof staleResult) => void
    vi.spyOn(medicationRepository, 'search').mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    vi.spyOn(medicationRepository, 'preloadPublicCatalog').mockImplementation(async (_existing, onBatch) => {
      onBatch?.([makePublic(1)])
      return result([makePublic(1)])
    })
    const pending = catalog.search('')
    await catalog.bootstrapPublicCatalog()
    finish(staleResult)
    await pending
    expect(catalog.filteredMedications.map(item => item.id)).toEqual([makePublic(1).id])
    expect(catalog.searchMessage).toBe('')
    expect(catalog.searchLoading).toBe(false)
  })
  it('keeps a typed query and its provider message while startup publishes other records', async () => {
    const catalog = setup(); catalog.dataMode = 'hybrid'
    catalog.searchQuery = 'Specific medication'
    catalog.searchMessage = 'Public search is unavailable. Showing loaded matches.'
    catalog.searchResultIds = []
    vi.spyOn(medicationRepository, 'preloadPublicCatalog').mockImplementation(async (_existing, onBatch) => {
      onBatch?.([makePublic(1)])
      return result([makePublic(1)])
    })
    await catalog.bootstrapPublicCatalog()
    expect(catalog.searchQuery).toBe('Specific medication')
    expect(catalog.searchMessage).toBe('Public search is unavailable. Showing loaded matches.')
    expect(catalog.searchResultIds).toEqual([])
  })
  it('starts on a mode switch and refuses batches from the old mode epoch', async () => {
    const catalog = setup(); catalog.dataMode = 'hybrid'
    let finish!: () => void
    const gate = new Promise<void>(resolve => { finish = resolve })
    const preload = vi.spyOn(medicationRepository, 'preloadPublicCatalog')
      .mockImplementationOnce(async (_existing, onBatch) => { await gate; onBatch?.([makePublic(1)]); return result([makePublic(1)]) })
      .mockImplementationOnce(async (_existing, onBatch) => { onBatch?.([makePublic(2)]); return result([makePublic(2)]) })
    const old = catalog.bootstrapPublicCatalog()
    catalog.setDataMode('demo')
    catalog.setDataMode('hybrid')
    await catalog.bootstrapPublicCatalog()
    finish(); await old
    expect(preload).toHaveBeenCalledTimes(2)
    expect(catalog.medicationById(makePublic(1).id)).toBeUndefined()
    expect(catalog.medicationById(makePublic(2).id)).toBeDefined()
    expect(catalog.bootstrapLoading).toBe(false)
  })
  it('keeps public rows as the empty-query default with fixtures only as fallback', async () => {
    const repo = new MedicationRepository({ search: vi.fn(), getDrug: vi.fn() })
    const stored = [...repo.initialMedications(), makePublic(1)]
    expect((await repo.search('', 'hybrid', stored)).medications.map(item => item.id)).toEqual([makePublic(1).id])
    expect((await repo.search('', 'demo', stored)).medications).toHaveLength(12)
    expect((await repo.search('', 'hybrid', repo.initialMedications())).medications).toHaveLength(12)
  })
  it('uses loaded public category membership in both public data modes without a drug-name request', async () => {
    const search = vi.fn()
    const repo = new MedicationRepository({ search, getDrug: vi.fn() })
    const medications = [
      { ...makePublic(1), genericName: 'Cetirizine', category: 'allergy' },
      { ...makePublic(2), genericName: 'Albuterol', category: 'respiratory' },
      makePublic(3),
    ]
    for (const mode of ['live', 'hybrid'] as const) {
      for (const medication of medications) {
        const found = await repo.search(medication.category, mode, [...repo.initialMedications(), ...medications])
        expect(found.medications.map(item => item.id)).toEqual([medication.id])
        expect(found.status).toBe('catalog')
      }
    }
    expect(search).not.toHaveBeenCalled()
  })
})

describe('public mock cart persistence and source separation', () => {
  it('makes every public identity buyable through existing exact mock cart records, including missing dimensions', () => {
    const catalog = setup(); catalog.dataMode = 'hybrid'
    catalog.mergePublicMedications([makePublic(1), { ...makePublic(2), forms: [], strengths: [] }])
    const cart = useCartStore()
    for (const medication of [makePublic(1), makePublic(2)]) {
      const sku = catalog.skusForMedication(medication.id)[0]!
      const offer = catalog.offers.find(item => item.skuId === sku.id)!
      cart.addItem(offer.id, offer.deliveryOptions[0]!.id)
    }
    expect(cart.detailedItems).toHaveLength(2)
    expect(cart.grandTotal).toBeGreaterThan(0)
    expect(cart.detailedItems[1]?.sku.demoProvenance?.configuration).toBe('synthetic')
    expect(catalog.medicationById(makePublic(1).id)?.publicOnly).toBe(true)
    expect(catalog.medicationById(makePublic(2).id)?.forms).toEqual([])
    expect(catalog.medicationById(makePublic(2).id)?.quantityOptions).toEqual([])
    expect(catalog.publicRecords).toEqual({})
  })
  it('restores the same cart configuration and prices after detail enrichment and reload', async () => {
    const catalog = setup(); catalog.dataMode = 'hybrid'
    const medication = makePublic(1)
    catalog.mergePublicMedications([medication])
    const sku = catalog.skusForMedication(medication.id)[0]!
    const offer = catalog.offers.find(item => item.skuId === sku.id)!
    const cart = useCartStore(); cart.addItem(offer.id, offer.deliveryOptions[0]!.id)
    const before = cart.grandTotal
    const publicDrug: ClearDoseDrug = {
      identity: { id: 'public-source', slug: 'example', genericName: medication.genericName, brandNames: [], ndcs: [], productNdcs: [], applicationNumbers: [], splSetIds: [] },
      variants: [], forms: ['TABLET'], strengths: ['200 mg'], routes: [], activeIngredients: ['Example'], manufacturers: [], pharmacologicClasses: [],
      prices: [{ id: 'nadac-source', kind: 'nadac-benchmark', amount: 123, quantity: 30, currency: 'USD', basis: 'prescription', label: 'Source benchmark', consumerMeaning: 'Not retail', source: { source: 'nadac', retrievedAt: '2026-09-02' } }],
      sources: [{ source: 'openfda-ndc', retrievedAt: '2026-09-02' }],
    }
    vi.spyOn(medicationRepository, 'getMedication').mockResolvedValue({ status: 'live', drug: publicDrug })
    await catalog.loadMedication(medication.id)
    expect(catalog.publicRecords[medication.id]?.drug).toEqual(publicDrug)
    expect(catalog.offers.some(item => item.id === 'nadac-source')).toBe(false)
    expect(catalog.skuById(sku.id)?.form).toBe('SOLUTION')
    expect(catalog.medicationById(medication.id)?.publicSummary?.forms).toEqual(['TABLET'])
    catalog.mergePublicMedications([{ ...medication, forms: ['CAPSULE'], strengths: ['5 mg'] }])
    expect(catalog.medicationById(medication.id)?.publicSummary?.forms).toEqual(['TABLET'])
    expect(catalog.skuById(sku.id)?.form).toBe('SOLUTION')
    setActivePinia(createPinia())
    const restored = useCatalogStore(); const restoredCart = useCartStore()
    expect(restored.skuById(sku.id)).toEqual(sku)
    expect(restoredCart.detailedItems).toHaveLength(1)
    expect(restoredCart.grandTotal).toBe(before)
    expect(restored.publicRecords).toEqual({})
  })
  it('retains cart-referenced identities outside the bounded active catalog and across reload', () => {
    const catalog = setup()
    catalog.mergePublicMedications([makePublic(0)])
    const sku = catalog.skusForMedication(makePublic(0).id)[0]!
    const offer = catalog.offers.find(item => item.skuId === sku.id)!
    const cart = useCartStore(); cart.addItem(offer.id, offer.deliveryOptions[0]!.id)
    catalog.mergePublicMedications(Array.from({ length: 101 }, (_, index) => makePublic(index + 1)))
    expect(catalog.medications.filter(item => item.publicOnly)).toHaveLength(100)
    expect(catalog.medications.some(item => item.id === makePublic(0).id)).toBe(false)
    expect(catalog.medicationById(makePublic(0).id)).toBeDefined()
    expect(catalog.medicationById(makePublic(1).id)).toBeUndefined()
    expect(cart.detailedItems).toHaveLength(1)
    setActivePinia(createPinia())
    expect(useCatalogStore().medicationById(makePublic(0).id)).toBeDefined()
    expect(useCartStore().detailedItems).toHaveLength(1)
  })
  it('pins the four Explorer medications in the active catalog and restores them from the route after reload', async () => {
    const catalog = setup(); catalog.dataMode = 'hybrid'
    const selected = Array.from({ length: 4 }, (_, index) => makePublic(index))
    catalog.mergePublicMedications(selected)
    const explorer = useDrugExplorerStore()
    explorer.selectedDrugIds = selected.map(item => item.id)
    explorer.cards = [{ id: 'fact-1', factType: 'strengths', drugIds: [...explorer.selectedDrugIds] }]
    const query = explorer.routeQuery()
    catalog.mergePublicMedications(Array.from({ length: 101 }, (_, index) => makePublic(index + 4)))
    expect(catalog.medications).toHaveLength(112)
    expect(catalog.medications.filter(item => selected.some(value => value.id === item.id))).toHaveLength(4)
    setActivePinia(createPinia())
    const restored = useCatalogStore(); restored.dataMode = 'hybrid'
    vi.spyOn(medicationRepository, 'getMedication').mockResolvedValue({ status: 'unavailable' })
    const search = vi.spyOn(medicationRepository, 'search')
    const restoredExplorer = useDrugExplorerStore()
    expect(await restoredExplorer.hydrateFromRoute(query)).toBe(true)
    expect(restoredExplorer.selectedDrugIds).toEqual(selected.map(item => item.id))
    expect(search).not.toHaveBeenCalled()
    expect(restored.medications).toHaveLength(112)
  })
  it('uses source classes or known mappings, without treating Other medications as a similarity category', () => {
    const repo = new MedicationRepository({ search: vi.fn(), getDrug: vi.fn() })
    expect(repo.categoryForMedication({ genericName: 'Empagliflozin', category: '' })).toMatchObject({ category: 'diabetes', categorySource: 'catalog-mapping' })
    expect(repo.categoryForMedication({ genericName: 'Unknown compound', category: '' })).toMatchObject({ category: 'other-medications', categorySource: 'fallback' })
    expect(repo.categoryForMedication({ genericName: 'Unknown compound', category: '' }, { pharmacologicClasses: ['Biguanide [EPC]'] } as ClearDoseDrug)).toMatchObject({ category: 'diabetes', categorySource: 'source-class' })
    expect(repo.related(makePublic(1), [makePublic(1), makePublic(2)], {}, 'category').matches).toEqual([])
  })
  it('prefers known mappings and does not assign broad adrenergic classes to a treatment category', () => {
    const repo = new MedicationRepository({ search: vi.fn(), getDrug: vi.fn() })
    expect(repo.categoryForMedication({ genericName: 'Tamsulosin Hydrochloride', category: '' }, { pharmacologicClasses: ['Alpha-Adrenergic Blocker [EPC]'] } as ClearDoseDrug)).toMatchObject({ category: 'urology', categorySource: 'catalog-mapping' })
    expect(repo.categoryForMedication({ genericName: 'Unknown alpha blocker', category: '' }, { pharmacologicClasses: ['Alpha-Adrenergic Blocker [EPC]'] } as ClearDoseDrug)).toMatchObject({ category: 'other-medications', categorySource: 'fallback' })
    expect(repo.categoryForMedication({ genericName: 'Unknown alpha agonist', category: '' }, { pharmacologicClasses: ['Alpha-Adrenergic Agonist [EPC]'] } as ClearDoseDrug)).toMatchObject({ category: 'other-medications', categorySource: 'fallback' })
  })
})
