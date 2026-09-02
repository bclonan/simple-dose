import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCatalogStore } from './catalog.store'
import { useDrugExplorerStore } from './drugExplorer.store'
import { medicationRepository } from '../services/medication.repository'
import { drugFactTypes } from '../domain/drug-facts'

beforeEach(() => { setActivePinia(createPinia()); vi.restoreAllMocks() })
const publicEmpagliflozin = () => {
  const catalog = useCatalogStore()
  catalog.dataMode = 'hybrid'
  const medication = { id: 'med-public-empagliflozin', slug: 'public-empagliflozin', genericName: 'Empagliflozin', brandNames: ['Jardiance'], category: 'uncategorized', rxRequired: false, forms: ['TABLET'], strengths: [], quantityOptions: [], searchTerms: [], publicOnly: true, publicSource: 'openfda-ndc', displaySummary: 'Public drug information.' }
  vi.spyOn(medicationRepository, 'search').mockResolvedValue({ medications: [medication], message: 'Public match', status: 'public' })
  vi.spyOn(medicationRepository, 'getMedication').mockResolvedValue({ status: 'unavailable', message: 'Fixture has no clinical section.' })
}

describe('shared drug explorer workspace', () => {
  it('resolves generic and brand names and evolves existing cards for every selected drug', async () => {
    publicEmpagliflozin()
    const store = useDrugExplorerStore()
    await store.selectDrugs(['Metformin'])
    await store.setFacts(['side-effects', 'pricing'])
    const cards = store.cards.map(card => card.id)
    await store.selectDrugs(['Jardiance'], 'add')
    expect(store.selectedDrugIds).toEqual(['med-metformin', 'med-public-empagliflozin'])
    expect(store.cards.map(card => card.id)).toEqual(cards)
    expect(store.cards.every(card => card.drugIds.join() === store.selectedDrugIds.join())).toBe(true)
    await store.setFacts(['interactions'], 'replace')
    expect(store.cards.map(card => card.factType)).toEqual(['interactions'])
    store.changeFactCard(store.cards[0]!.id, 'ingredients')
    expect(store.cards[0]?.factType).toBe('ingredients')
    store.removeDrug('med-metformin')
    expect(store.cards[0]?.drugIds).toEqual(['med-public-empagliflozin'])
  })
  it('reuses duplicate facts and merges a change into an existing card', async () => {
    const store = useDrugExplorerStore()
    await store.setFacts(['uses', 'warnings'])
    const uses = store.cards[0]!.id
    await store.addFactCard('uses')
    expect(store.cards).toHaveLength(2)
    expect(store.focusedCardId).toBe(uses)
    store.changeFactCard(store.cards[1]!.id, 'uses')
    expect(store.cards).toHaveLength(1)
    expect(store.focusedCardId).toBe(uses)
    store.removeFactCard(uses)
    expect(store.cards).toEqual([])
  })
  it('hydrates aliases into a deterministic shareable URL, including an intentionally empty card list', async () => {
    publicEmpagliflozin()
    const store = useDrugExplorerStore()
    expect(await store.hydrateFromRoute({ drugs: 'metformin,empagliflozin', facts: 'uses,prices,uses' })).toBe(true)
    expect(store.routeQuery()).toEqual({ drugs: 'metformin,public-empagliflozin', facts: 'uses,pricing' })
    await store.hydrateFromRoute({ drugs: 'atorvastatin', facts: '' })
    expect(store.cards).toEqual([])
    await store.hydrateFromRoute({ drugs: 'atorvastatin' })
    expect(store.cards.map(card => card.factType)).toEqual(['uses', 'warnings'])
  })
  it('rejects unknown names and over-cap selections without partly changing the workspace', async () => {
    const store = useDrugExplorerStore()
    await store.configureWorkspace({ drugs: ['atorvastatin'], facts: ['uses'] })
    await expect(store.configureWorkspace({ drugs: ['Metformin', 'unknown-drug-xyz'], facts: ['pricing'] })).rejects.toThrow('No exact match')
    expect(store.selectedDrugIds).toEqual(['med-atorvastatin'])
    expect(store.cards[0]?.factType).toBe('uses')
    await expect(store.selectDrugs(['metformin', 'lisinopril', 'sertraline', 'rosuvastatin'], 'add')).rejects.toThrow('up to four')
    expect(store.selectedDrugIds).toEqual(['med-atorvastatin'])
  })
  it('validates a guarded agent commit after resolving names', async () => {
    const store = useDrugExplorerStore()
    await expect(store.configureWorkspace({ drugs: ['metformin'], facts: ['pricing'], beforeCommit: () => { throw new Error('stale') } })).rejects.toThrow('stale')
    expect(store.selectedDrugIds).toEqual([])
    expect(store.cards).toEqual([])
  })
  it('allows removal but not a new generic-name selection of a public-only identity in demo mode', async () => {
    publicEmpagliflozin()
    const catalog = useCatalogStore()
    const store = useDrugExplorerStore()
    await store.selectDrugs(['Jardiance'])
    catalog.dataMode = 'demo'
    await expect(store.selectDrugs(['Empagliflozin'])).rejects.toThrow('public-only')
    await store.configureWorkspace({ drugs: ['med-public-empagliflozin'], mode: 'remove' })
    expect(store.selectedDrugIds).toEqual([])
  })
  it('rejects a delayed selection after a human clears the workspace', async () => {
    const catalog = useCatalogStore()
    const store = useDrugExplorerStore()
    let resolve!: (value: ReturnType<typeof catalog.medicationById>) => void
    vi.spyOn(catalog, 'resolveMedication').mockImplementation(() => new Promise(done => { resolve = done as typeof resolve }))
    const pending = store.selectDrugs(['metformin'])
    store.clearWorkspace()
    resolve(catalog.medicationById('med-metformin'))
    await expect(pending).rejects.toThrow('workspace changed')
    expect(store.selectedDrugIds).toEqual([])
  })
  it('only requests selected facts and adds adverse-event loading on demand', async () => {
    const catalog = useCatalogStore()
    const load = vi.spyOn(catalog, 'loadMedication').mockResolvedValue()
    const store = useDrugExplorerStore()
    await store.configureWorkspace({ drugs: ['metformin'], facts: ['ingredients'] })
    expect(load).toHaveBeenLastCalledWith('med-metformin', 30, { includeClinical: false, includePrices: false, includeAdverseEventSummary: false }, false)
    await store.setFacts(['pricing', 'adverse-events'])
    expect(load).toHaveBeenLastCalledWith('med-metformin', 30, { includeClinical: false, includePrices: true, includeAdverseEventSummary: true }, false)
    expect(store.cards.map(card => card.factType)).toEqual(['pricing', 'adverse-events'])
  })
  it('keeps available records and cards when a selected optional fetch fails', async () => {
    const catalog = useCatalogStore()
    vi.spyOn(catalog, 'loadMedication').mockImplementation(async id => { if (id === 'med-metformin') throw new Error('offline') })
    const store = useDrugExplorerStore()
    await store.configureWorkspace({ drugs: ['metformin', 'atorvastatin'], facts: ['pricing'] })
    expect(store.selectedDrugIds).toHaveLength(2)
    expect(store.cards).toHaveLength(1)
    expect(store.message).toContain('Some public details')
  })
  it('preserves every supported fact and does not mutate demo offers', async () => {
    const catalog = useCatalogStore()
    const offers = JSON.stringify(catalog.offers)
    const store = useDrugExplorerStore()
    await store.configureWorkspace({ drugs: ['metformin'], facts: [...drugFactTypes] })
    expect(store.cards).toHaveLength(14)
    expect(JSON.stringify(catalog.offers)).toBe(offers)
    const fetch = vi.spyOn(medicationRepository, 'getMedication')
    await store.loadSelected()
    expect(fetch).not.toHaveBeenCalled()
  })
})
