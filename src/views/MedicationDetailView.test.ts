import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCatalogStore } from '../stores/catalog.store'
import { useCartStore } from '../stores/cart.store'
import { useSelectionStore } from '../stores/selection.store'
import type { Medication } from '../types/demo-db'
import MedicationDetailView from './MedicationDetailView.vue'

const publicMedication = (overrides: Partial<Medication> = {}): Medication => ({
  id: 'med-public-cetirizine', slug: 'public-cetirizine', genericName: 'CETIRIZINE',
  brandNames: ['Cetirizine', 'Zyrtec', 'ZYRTEC'], category: 'other-medications',
  rxRequired: false, displaySummary: '', publicOnly: true, publicSource: 'openfda-ndc',
  forms: ['TABLET'], strengths: ['10 mg'], quantityOptions: [], searchTerms: [], ...overrides,
})

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})
afterEach(() => vi.restoreAllMocks())

async function renderDetail(medication: Medication, mode: 'hybrid' | 'live' = 'hybrid') {
  const catalog = useCatalogStore()
  catalog.dataMode = mode
  catalog.mergePublicMedications([medication])
  vi.spyOn(catalog, 'loadMedication').mockResolvedValue()
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/medications/:slug', component: MedicationDetailView },
    { path: '/compare', component: { template: '<div />' } },
    { path: '/drugs/explore', component: { template: '<div />' } },
  ] })
  await router.push('/medications/' + medication.slug)
  await router.isReady()
  const wrapper = mount(MedicationDetailView, { global: {
    plugins: [router],
    stubs: { PublicDrugPanel: true, RelatedMedications: true, DrugInfoCard: true },
  } })
  await flushPromises()
  return { wrapper, catalog }
}

describe('public medication demo shopping', () => {
  for (const mode of ['hybrid', 'live'] as const) {
    it(`lets a public-source medication use an exact generated SKU in ${mode} mode`, async () => {
      const medication = publicMedication()
      const { wrapper, catalog } = await renderDetail(medication, mode)
      const selection = useSelectionStore()
      expect(wrapper.get('h1').text()).toBe('Cetirizine')
      expect(wrapper.get('.generic-for').text()).toBe('Listed brands: Zyrtec')
      expect(wrapper.get('.detail-badges').text()).toContain('Public reference data')
      expect(wrapper.get('.detail-badges').text()).toContain('Prescription status unavailable')
      expect(wrapper.get('[data-testid="medication-selector"]').text()).toContain('Demo configuration')
      expect(wrapper.get('[data-testid="medication-selector"]').text()).toContain('generated combination')
      expect(wrapper.get('[data-testid="demo-fulfillment-notice"]').text()).toContain('not real pharmacy quotes or inventory')
      expect(wrapper.find('[data-testid="public-only-fulfillment"]').exists()).toBe(false)
      expect(catalog.medicationById(medication.id)?.quantityOptions).toEqual([])
      expect(selection.skuId).toBeTruthy()

      await wrapper.get('[data-testid="quantity-30"]').trigger('click')
      await flushPromises()
      expect(selection.quantity).toBe(30)
      const selectedSku = catalog.skuById(selection.skuId!)
      expect(selectedSku?.medicationId).toBe(medication.id)
      expect(selectedSku?.demoProvenance?.kind).toBe('generated-demo')
      await wrapper.get('[data-testid="add-selected-to-cart"]').trigger('click')
      expect(useCartStore().detailedItems).toHaveLength(1)
      expect(useCartStore().detailedItems[0]?.sku.id).toBe(selectedSku?.id)
      expect(useCartStore().drawerOpen).toBe(true)
      wrapper.unmount()
    })
  }

  it('labels a synthetic demo configuration without filling in missing medication facts', async () => {
    const medication = publicMedication({ forms: [], strengths: [], brandNames: [] })
    const { wrapper, catalog } = await renderDetail(medication)
    const selector = wrapper.get('[data-testid="medication-selector"]')
    expect(selector.text()).toContain('synthetic configuration where source attributes are missing')
    expect(selector.text()).toContain('Demo form, see full public record')
    expect(selector.text()).toContain('Demo strength, see full public record')
    expect(wrapper.find('.generic-for').exists()).toBe(false)
    expect(catalog.medicationById(medication.id)?.forms).toEqual([])
    expect(catalog.medicationById(medication.id)?.strengths).toEqual([])
    expect(wrapper.find('[data-testid="add-selected-to-cart"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('offers no cart action when a record has no exact demo SKU', async () => {
    const medication = publicMedication({ id: 'med-no-configuration', publicOnly: false, forms: [], strengths: [], publicSource: undefined })
    const { wrapper } = await renderDetail(medication)
    expect(wrapper.find('[data-testid="medication-selector"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="add-selected-to-cart"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="public-only-fulfillment"]').text()).toContain('Demo shopping is not available')
    expect(wrapper.text()).toContain('Prescription status unavailable')
    wrapper.unmount()
  })
})
