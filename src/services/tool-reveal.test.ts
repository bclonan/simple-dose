import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExplorerRoute } from '../composables/useExplorerRoute'
import { useCartStore } from '../stores/cart.store'
import { useCatalogStore } from '../stores/catalog.store'
import { useDrugExplorerStore } from '../stores/drugExplorer.store'
import { createClearDoseToolDefinitions } from '../webmcp/definitions'
import { createExplorerTools, type ExplorerToolDependencies } from '../webmcp/explorer'
import { useExplorerToolDependencies } from '../webmcp/explorer-context'
import { nativeToolDefinition } from '../webmcp/schema-budget'
import type { JsonValue } from '../webmcp/types'
import { useClearDoseActions } from './cleardose.actions'

const option = { offerId: 'offer-atorvastatin-20-90-cleardose', deliveryOptionId: 'standard' }
const wrappers: Array<ReturnType<typeof mount>> = []

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  useCatalogStore().dataMode = 'demo'
  vi.spyOn(useCatalogStore(), 'loadMedication').mockResolvedValue()
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks()
})

describe('tool navigation reveals its page without discarding the cart', () => {
  it.each([
    ['search_medications', '/medications'],
    ['compare_fulfillment_options', '/compare'],
    ['create_prescription_request_card', '/prescription-card'],
  ])('closes the cart before %s navigates', async (toolName, destination) => {
    const catalog = useCatalogStore()
    const cart = useCartStore()
    cart.addItem(option.offerId, option.deliveryOptionId)
    const before = JSON.stringify(cart.items)
    const initialTotal = cart.grandTotal
    const navigate = vi.fn(async () => {
      expect(cart.drawerOpen).toBe(false)
      expect(JSON.stringify(cart.items)).toBe(before)
    })
    vi.spyOn(catalog, 'search').mockResolvedValue([catalog.medicationById('med-metformin')!])
    const sku = catalog.skusForMedication('med-metformin')[0]!
    const input: Record<string, JsonValue> = toolName === 'search_medications'
      ? { query: 'metformin' }
      : toolName === 'compare_fulfillment_options'
        ? { medicationId: sku.medicationId, form: sku.form, strength: sku.strength, quantity: sku.quantity }
        : option
    const definition = createClearDoseToolDefinitions(useClearDoseActions({ navigate }))
      .find(tool => tool.name === toolName)!

    expect(cart.drawerOpen).toBe(true)
    await nativeToolDefinition(definition).execute(input)

    expect(navigate).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith(destination)
    expect(cart.drawerOpen).toBe(false)
    expect(JSON.stringify(cart.items)).toBe(before)
    expect(cart.grandTotal).toBe(initialTotal)
  })

  it('closes the cart when an Explorer tool reveals the shared workspace', async () => {
    const routePage = defineComponent({ template: '<div />' })
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/medications', component: routePage }, { path: '/drugs/explore', component: routePage },
    ] })
    await router.push('/medications')
    await router.isReady()
    let dependencies!: ExplorerToolDependencies
    const wrapper = mount(defineComponent({
      setup() {
        const explorerRoute = useExplorerRoute()
        dependencies = useExplorerToolDependencies(explorerRoute.reveal)
        return {}
      },
      template: '<div />',
    }), { global: { plugins: [router] } })
    wrappers.push(wrapper)
    await flushPromises()
    const cart = useCartStore()
    cart.addItem(option.offerId, option.deliveryOptionId)
    const before = JSON.stringify(cart.items)
    const initialTotal = cart.grandTotal
    const definition = createExplorerTools(dependencies).find(tool => tool.name === 'cleardose_select_drugs')!

    await nativeToolDefinition(definition).execute({ workspaceRevision: dependencies.snapshot().revision, drugs: ['metformin'], mode: 'replace' })
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/drugs/explore')
    expect(useDrugExplorerStore().selectedDrugIds).toEqual(['med-metformin'])
    expect(cart.drawerOpen).toBe(false)
    expect(JSON.stringify(cart.items)).toBe(before)
    expect(cart.grandTotal).toBe(initialTotal)
  })

  it('keeps the drawer open for an inline action that does not navigate', async () => {
    const cart = useCartStore()
    cart.addItem(option.offerId, option.deliveryOptionId)
    const before = JSON.stringify(cart.items)

    await useClearDoseActions().selectMedicationOption(option)

    expect(cart.drawerOpen).toBe(true)
    expect(JSON.stringify(cart.items)).toBe(before)
  })
})
