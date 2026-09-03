import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'
import { useCatalogStore } from './stores/catalog.store'
import { useDrugExplorerStore } from './stores/drugExplorer.store'
import { useWebMcpStore } from './stores/webmcp.store'

const { register, dispose } = vi.hoisted(() => ({ register: vi.fn(), dispose: vi.fn() }))
vi.mock('./webmcp/register', () => ({ registerClearDoseTools: register }))

const wrappers: Array<ReturnType<typeof mount>> = []
const page = defineComponent({ template: '<div>Explorer route</div>' })
beforeEach(() => {
  vi.restoreAllMocks()
  register.mockReset().mockResolvedValue({ supported: true, registeredToolNames: [], registrationError: null, dispose })
  dispose.mockReset()
  setActivePinia(createPinia())
  vi.spyOn(useCatalogStore(), 'bootstrapPublicCatalog').mockResolvedValue()
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

const start = (path: string, component: Component | (() => Promise<Component>) = page, failReady = false) => {
  const history = createMemoryHistory()
  history.replace(path)
  const router = createRouter({ history, routes: [
    { path: '/', component: page }, { path: '/drugs/explore', component },
  ] })
  if (failReady) vi.spyOn(router, 'isReady').mockRejectedValue(new Error('Initial route failed.'))
  const wrapper = mount(App, { global: {
    plugins: [router],
    stubs: { AppHeader: true, AppDisclaimer: true, CartDrawer: true, WebMCPBadge: true, WebMCPDrawer: true, RouterView: true },
  } })
  wrappers.push(wrapper)
  return { wrapper, router }
}

describe('native tools wait for the incoming Explorer workspace', () => {
  it('starts catalog loading but does not register tools before the initial lazy route resolves', async () => {
    let release!: (component: Component) => void
    const initialView = new Promise<Component>(resolve => { release = resolve })
    const { router } = start('/drugs/explore', () => initialView)
    await flushPromises()
    expect(useCatalogStore().bootstrapPublicCatalog).toHaveBeenCalledOnce()
    expect(register).not.toHaveBeenCalled()
    release(page)
    await router.isReady()
    await flushPromises()
    expect(useDrugExplorerStore().revisionNumber).toBe(1)
    expect(register).toHaveBeenCalledOnce()
  })

  it('waits for deep-link medication resolution and requested fact loading before registration', async () => {
    const catalog = useCatalogStore()
    let release!: () => void
    const facts = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(catalog, 'loadMedication').mockImplementation(async () => { await facts })
    const { router } = start('/drugs/explore?drugs=metformin,atorvastatin&facts=warnings,uses')
    await router.isReady()
    await flushPromises()
    const explorer = useDrugExplorerStore()
    expect(explorer.selectedDrugIds).toEqual(['med-metformin', 'med-atorvastatin'])
    expect(explorer.cards.map(card => card.factType)).toEqual(['warnings', 'uses'])
    expect(catalog.loadMedication).toHaveBeenCalledTimes(2)
    expect(register).not.toHaveBeenCalled()
    release()
    await flushPromises()
    expect(register).toHaveBeenCalledOnce()
    expect(explorer.selectedDrugIds).toEqual(['med-metformin', 'med-atorvastatin'])
    expect(explorer.cards.map(card => card.factType)).toEqual(['warnings', 'uses'])
  })

  it('does not register late tools after unmount during initial hydration', async () => {
    let release!: () => void
    const facts = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(useCatalogStore(), 'loadMedication').mockImplementation(async () => { await facts })
    const { wrapper, router } = start('/drugs/explore?drugs=metformin&facts=uses')
    await router.isReady()
    await flushPromises()
    wrapper.unmount()
    release()
    await flushPromises()
    expect(register).not.toHaveBeenCalled()
    expect(dispose).not.toHaveBeenCalled()
  })

  it('reports initial route failure without installing a partial native registry', async () => {
    start('/', page, true)
    await flushPromises()
    expect(register).not.toHaveBeenCalled()
    expect(useWebMcpStore().registrationError).toBe('Initial route failed.')
  })
})
