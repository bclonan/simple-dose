import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCatalogStore } from '../stores/catalog.store'
import { useDrugExplorerStore } from '../stores/drugExplorer.store'
import { medicationRepository } from '../services/medication.repository'
import type { Medication } from '../types/demo-db'
import { useExplorerRoute } from './useExplorerRoute'

const empagliflozin: Medication = {
  id: 'med-public-empagliflozin', slug: 'public-empagliflozin', genericName: 'Empagliflozin',
  brandNames: ['Jardiance'], category: 'uncategorized', rxRequired: false, publicOnly: true,
  publicSource: 'openfda-ndc', displaySummary: 'Public drug information.', forms: ['TABLET'],
  strengths: ['10 mg'], quantityOptions: [], searchTerms: ['Empagliflozin', 'Jardiance'],
}

const wrappers: Array<ReturnType<typeof mount>> = []
beforeEach(() => { setActivePinia(createPinia()); vi.restoreAllMocks() })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

const bindRoute = async (path: string) => {
  const routeComponent = defineComponent({ template: '<div />' })
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/drugs/explore', component: routeComponent }, { path: '/medications', component: routeComponent },
  ] })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(defineComponent({ setup() { useExplorerRoute(); return {} }, template: '<div />' }), { global: { plugins: [router] } })
  wrappers.push(wrapper)
  await flushPromises()
  return router
}

describe('Explorer public deep-link recovery', () => {
  it('resolves a fresh public slug exactly and rejects combination-only results', async () => {
    const catalog = useCatalogStore()
    catalog.dataMode = 'hybrid'
    expect(catalog.medicationById(empagliflozin.id)).toBeUndefined()
    const combo = { ...empagliflozin, id: 'med-public-empagliflozin-and-metformin', slug: 'public-empagliflozin-and-metformin', genericName: 'Empagliflozin and metformin hydrochloride', brandNames: ['Synjardy'] }
    const search = vi.spyOn(medicationRepository, 'search').mockResolvedValue({ medications: [combo], status: 'public', message: 'Public matches.' })
    await expect(catalog.resolveMedication('public-empagliflozin')).rejects.toThrow('No exact match')
    expect(catalog.medicationById(empagliflozin.id)).toBeUndefined()
    search.mockResolvedValue({ medications: [combo, empagliflozin], status: 'public', message: 'Public matches.' })
    await expect(catalog.resolveMedication('public-empagliflozin')).resolves.toMatchObject({ id: empagliflozin.id, genericName: 'Empagliflozin' })
    expect(search).toHaveBeenLastCalledWith('empagliflozin', 'hybrid', expect.any(Array))
    expect(catalog.medicationById(combo.id)).toBeUndefined()
    expect(catalog.medicationById(empagliflozin.id)).toMatchObject(empagliflozin)
  })

  it('retries an unresolved public URL after Demo changes to Hybrid without a reload', async () => {
    const catalog = useCatalogStore()
    catalog.dataMode = 'demo'
    vi.spyOn(medicationRepository, 'search').mockImplementation(async (query, mode) => ({
      medications: mode !== 'demo' && query === 'empagliflozin' ? [empagliflozin] : [], status: 'public', message: 'Fixture matches.',
    }))
    vi.spyOn(medicationRepository, 'getMedication').mockResolvedValue({ status: 'unavailable', message: 'Fixture clinical section unavailable.' })
    const router = await bindRoute('/drugs/explore?drugs=metformin,public-empagliflozin&facts=side-effects,pricing')
    const explorer = useDrugExplorerStore()
    expect(explorer.selectedDrugIds).toEqual([])
    expect(explorer.message).toContain('No exact match for "public-empagliflozin"')
    expect(router.currentRoute.value.query.drugs).toBe('metformin,public-empagliflozin')

    catalog.setDataMode('hybrid')
    await flushPromises()
    expect(explorer.selectedDrugIds).toEqual(['med-metformin', empagliflozin.id])
    expect(explorer.cards.map(card => card.factType)).toEqual(['side-effects', 'pricing'])
    expect(explorer.message).toBe('')
    expect(router.currentRoute.value.query).toEqual({ drugs: 'metformin,public-empagliflozin', facts: 'side-effects,pricing' })
  })

  it('reloads facts without rehydrating or recreating an already matched workspace on mode change', async () => {
    const catalog = useCatalogStore()
    catalog.dataMode = 'demo'
    vi.spyOn(medicationRepository, 'search').mockResolvedValue({ medications: [], status: 'public', message: 'Fixture matches.' })
    vi.spyOn(medicationRepository, 'getMedication').mockResolvedValue({ status: 'unavailable', message: 'Fixture clinical section unavailable.' })
    await bindRoute('/drugs/explore?drugs=metformin&facts=uses,warnings')
    const explorer = useDrugExplorerStore()
    const ids = explorer.cards.map(card => card.id)
    const hydrate = vi.spyOn(explorer, 'hydrateFromRoute')
    const load = vi.spyOn(explorer, 'loadSelected')
    catalog.setDataMode('hybrid')
    await flushPromises()
    expect(hydrate).not.toHaveBeenCalled()
    expect(load).toHaveBeenCalledOnce()
    expect(explorer.cards.map(card => card.id)).toEqual(ids)
    expect(explorer.selectedDrugIds).toEqual(['med-metformin'])
  })
})
