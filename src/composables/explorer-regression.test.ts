import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCatalogStore } from '../stores/catalog.store'
import { useDrugExplorerStore } from '../stores/drugExplorer.store'
import { useExplorerRoute } from './useExplorerRoute'

const wrappers: Array<ReturnType<typeof mount>> = []

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
  const catalog = useCatalogStore()
  catalog.dataMode = 'demo'
  vi.spyOn(catalog, 'loadMedication').mockResolvedValue()
})

afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

const bindRoute = async (initialPath: string) => {
  const view = defineComponent({ template: '<div />' })
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/drugs/explore', component: view },
    { path: '/medications', component: view },
  ] })
  await router.push(initialPath)
  await router.isReady()
  wrappers.push(mount(defineComponent({
    setup() { useExplorerRoute(); return {} },
    template: '<div />',
  }), { global: { plugins: [router] } }))
  await flushPromises()
  return router
}

describe('Explorer workspace return navigation', () => {
  it('keeps a built comparison when the user returns through the bare navigation link', async () => {
    const router = await bindRoute('/drugs/explore?drugs=metformin,atorvastatin&facts=side-effects,pricing')
    const explorer = useDrugExplorerStore()
    const selectedIds = [...explorer.selectedDrugIds]
    const cards = explorer.cards.map(card => ({ ...card, drugIds: [...card.drugIds] }))
    const revision = explorer.revisionNumber

    await router.push('/medications')
    await router.push('/drugs/explore')
    await flushPromises()

    expect(explorer.selectedDrugIds).toEqual(selectedIds)
    expect(explorer.cards).toEqual(cards)
    expect(explorer.revisionNumber).toBe(revision)
    expect(router.currentRoute.value.query).toEqual({ drugs: 'metformin,atorvastatin', facts: 'side-effects,pricing' })
  })

  it('still honors an explicit empty workspace URL after a comparison', async () => {
    const router = await bindRoute('/drugs/explore?drugs=metformin&facts=uses')
    const explorer = useDrugExplorerStore()
    await router.push('/medications')
    await router.push('/drugs/explore?drugs=&facts=')
    await flushPromises()
    expect(explorer.selectedDrugIds).toEqual([])
    expect(explorer.cards).toEqual([])
  })

  it('treats a fresh bare load as an empty workspace instead of restoring unrelated prior state', async () => {
    const explorer = useDrugExplorerStore()
    await explorer.configureWorkspace({ drugs: ['metformin'], facts: ['uses'] })
    const router = await bindRoute('/drugs/explore')
    expect(explorer.selectedDrugIds).toEqual([])
    expect(explorer.cards).toEqual([])
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('preserves a report when the active Explorer navigation link is clicked again', async () => {
    const router = await bindRoute('/drugs/explore?drugs=metformin&facts=pricing')
    const explorer = useDrugExplorerStore()
    const revision = explorer.revisionNumber
    const cardId = explorer.cards[0]!.id
    await router.push('/drugs/explore')
    await flushPromises()
    expect(explorer.selectedDrugIds).toEqual(['med-metformin'])
    expect(explorer.cards).toEqual([{ id: cardId, factType: 'pricing', drugIds: ['med-metformin'] }])
    expect(explorer.revisionNumber).toBe(revision)
    expect(router.currentRoute.value.query).toEqual({ drugs: 'metformin', facts: 'pricing' })
  })
})
