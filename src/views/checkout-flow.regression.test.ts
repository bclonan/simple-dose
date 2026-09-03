import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { useClearDoseActions } from '../services/cleardose.actions'
import { useCatalogStore } from '../stores/catalog.store'
import { useCartStore } from '../stores/cart.store'
import { usePricingStore } from '../stores/pricing.store'
import { usePrescriptionStore } from '../stores/prescription.store'
import { useSelectionStore } from '../stores/selection.store'
import { createClearDoseToolDefinitions } from '../webmcp/definitions'
import PrescriptionCardView from './PrescriptionCardView.vue'
import MedicationDetailView from './MedicationDetailView.vue'
import CompareView from './CompareView.vue'
import type { Medication } from '../types/demo-db'

enableAutoUnmount(afterEach)

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
  useCatalogStore().dataMode = 'demo'
})

afterEach(() => vi.restoreAllMocks())

describe('WebMCP form and checkout continuity', () => {
  it('preserves the tool-selected medication while leaving another medication detail page', async () => {
    const catalog = useCatalogStore()
    vi.spyOn(catalog, 'loadMedication').mockResolvedValue()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/medications/:slug', component: MedicationDetailView },
        { path: '/compare', component: CompareView },
        { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
      ],
    })
    await router.push('/medications/atorvastatin')
    await router.isReady()
    const wrapper = mount(RouterView, { global: { plugins: [router], stubs: { PublicDrugPanel: true, DrugInfoCard: true, RelatedMedications: true } } })
    await flushPromises()
    expect(useSelectionStore().medicationId).toBe('med-atorvastatin')

    const tool = createClearDoseToolDefinitions(useClearDoseActions({ navigate: path => router.push(path) })).find(item => item.name === 'compare_fulfillment_options')!
    await tool.execute({ medicationId: 'med-metformin', form: 'tablet', strength: '500 mg', quantity: 30 })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/compare')
    expect(useSelectionStore().medicationId).toBe('med-metformin')
    expect(wrapper.get('.comparison-identity').text()).toContain('Metformin')
    wrapper.unmount()
  })

  it('updates prescription form fields when a tool replaces the request on the current page', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/prescription-card', component: PrescriptionCardView }],
    })
    await router.push('/prescription-card')
    await router.isReady()
    const actions = useClearDoseActions({ navigate: path => router.push(path) })
    const tool = createClearDoseToolDefinitions(actions).find(item => item.name === 'create_prescription_request_card')!
    const offer = { offerId: 'offer-atorvastatin-20-90-cleardose', deliveryOptionId: 'standard' }
    await tool.execute({ ...offer, patientName: 'First Demo Patient', prescriberName: 'First Demo Prescriber' })
    const wrapper = mount(PrescriptionCardView, { global: { plugins: [router] } })
    const field = (label: string) => wrapper.findAll('label').find(item => item.find('span').text() === label)!.get('input')
    expect((field('Patient name').element as HTMLInputElement).value).toBe('First Demo Patient')

    await tool.execute({ ...offer, patientName: 'Second Demo Patient', dateOfBirth: '1990-01-02', prescriberName: 'Second Demo Prescriber', practice: 'Demo Practice' })
    await flushPromises()
    expect(usePrescriptionStore().latestRequest?.patientName).toBe('Second Demo Patient')
    expect((field('Patient name').element as HTMLInputElement).value).toBe('Second Demo Patient')
    expect((field('Date of birth').element as HTMLInputElement).value).toBe('1990-01-02')
    expect((field('Prescriber name').element as HTMLInputElement).value).toBe('Second Demo Prescriber')
    expect((field('Practice').element as HTMLInputElement).value).toBe('Demo Practice')

    await field('Patient name').setValue('Unsaved local edit')
    expect(usePrescriptionStore().latestRequest?.patientName).toBe('Second Demo Patient')
    const previousId = usePrescriptionStore().latestRequest?.id
    await tool.execute({ ...offer, patientName: 'Third Demo Patient' })
    await flushPromises()
    expect(usePrescriptionStore().latestRequest?.id).toBe(previousId)
    expect((field('Patient name').element as HTMLInputElement).value).toBe('Third Demo Patient')
    expect((field('Date of birth').element as HTMLInputElement).value).toBe('')
    expect((field('Prescriber name').element as HTMLInputElement).value).toBe('')
    expect((field('Practice').element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })

  it('adds a selected public medication from the comparison page without requiring a prescription card', async () => {
    const medication: Medication = {
      id: 'med-public-test-medication', slug: 'public-test-medication', genericName: 'Test medication',
      brandNames: [], category: 'other-medications', rxRequired: false, publicOnly: true,
      publicSource: 'openfda-ndc', displaySummary: 'Test public identity', forms: ['TABLET'],
      strengths: ['5 mg'], quantityOptions: [], searchTerms: ['test medication'],
    }
    const catalog = useCatalogStore()
    catalog.mergePublicMedications([medication])
    const sku = catalog.skusForMedication(medication.id)[0]!
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/compare', component: CompareView }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push('/compare')
    await router.isReady()
    const actions = useClearDoseActions({ navigate: path => router.push(path) })
    await actions.compareFulfillmentOptions({ medicationId: medication.id, form: sku.form, strength: sku.strength, quantity: sku.quantity })
    const wrapper = mount(CompareView, { global: { plugins: [router] } })
    const add = wrapper.get('[data-testid="comparison-add-cart"]')
    expect(add.attributes('disabled')).toBeDefined()
    expect(wrapper.find('a[href="/prescription-card"]').exists()).toBe(false)
    expect(wrapper.findAll('button').find(button => button.text() === 'Prepare prescription request')!.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Select a fulfillment option above')
    const chosen = usePricingStore().comparisonsForSku(sku)[0]!
    await wrapper.get(`[data-testid="comparison-${chosen.optionId}"] button`).trigger('click')
    await flushPromises()
    expect(add.attributes('disabled')).toBeUndefined()
    expect(wrapper.get('a[href="/prescription-card"]').text()).toBe('Prepare prescription request')
    await add.trigger('click')
    const cart = useCartStore()
    expect(cart.detailedItems).toHaveLength(1)
    expect(cart.detailedItems[0]).toMatchObject({ medication: { id: medication.id }, sku: { id: sku.id }, offer: { id: chosen.offerId }, delivery: { id: chosen.deliveryOptionId } })
    expect(cart.drawerOpen).toBe(true)
    expect(usePrescriptionStore().latestRequest).toBeNull()
  })

  it('shows add-to-cart failures on the medication page without losing the selection', async () => {
    vi.spyOn(useCatalogStore(), 'loadMedication').mockResolvedValue()
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/medications/:slug', component: MedicationDetailView }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push('/medications/atorvastatin')
    await router.isReady()
    const wrapper = mount(MedicationDetailView, { global: { plugins: [router], stubs: { PublicDrugPanel: true, DrugInfoCard: true, RelatedMedications: true } } })
    await flushPromises()
    vi.spyOn(useCartStore(), 'addItem').mockImplementation(() => { throw new Error('That fulfillment offer is unavailable.') })
    await wrapper.get('[data-testid="add-selected-to-cart"]').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toBe('That fulfillment offer is unavailable.')
    expect(useCartStore().itemCount).toBe(0)
    expect(useSelectionStore().medicationId).toBe('med-atorvastatin')
  })

  it('renders the tool delivery limit and lets the patient change the same filter', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/compare', component: CompareView }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push('/compare')
    await router.isReady()
    const tool = createClearDoseToolDefinitions(useClearDoseActions({ navigate: path => router.push(path) })).find(item => item.name === 'compare_fulfillment_options')!
    await tool.execute({ medicationId: 'med-atorvastatin', form: 'tablet', strength: '20 mg', quantity: 90, maxDeliveryDays: 4 })
    const wrapper = mount(CompareView, { global: { plugins: [router] } })
    const filter = wrapper.get('.comparison-delivery-filter select')
    expect((filter.element as HTMLSelectElement).value).toBe('4')
    expect(wrapper.get('option[value="4"]').text()).toBe('Within 4 days')
    const catalog = useCatalogStore()
    const sku = catalog.skuById(useSelectionStore().skuId!)!
    const matching = usePricingStore().comparisonsForSku(sku, 4)
    expect(wrapper.findAll('tbody tr')).toHaveLength(matching.length)
    for (const option of matching) expect(wrapper.find(`[data-testid="comparison-${option.optionId}"]`).exists()).toBe(true)
    await filter.setValue('0')
    expect(useSelectionStore().maxDeliveryDays).toBe(0)
    expect(wrapper.findAll('tbody tr')).toHaveLength(usePricingStore().comparisonsForSku(sku, 0).length)
    await filter.setValue('')
    expect(useSelectionStore().maxDeliveryDays).toBeNull()
    expect(wrapper.findAll('tbody tr')).toHaveLength(usePricingStore().comparisonsForSku(sku).length)
    const laterOption = usePricingStore().comparisonsForSku(sku).find(option => option.estimatedMaxDays > 0)!
    await wrapper.get(`[data-testid="comparison-${laterOption.optionId}"] button`).trigger('click')
    expect(wrapper.find('a[href="/prescription-card"]').exists()).toBe(true)
    await filter.setValue('0')
    expect(wrapper.find('a[href="/prescription-card"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="comparison-add-cart"]').attributes('disabled')).toBeDefined()
  })

  it('restores legacy selections without a delivery limit and persists the new filter', () => {
    const selection = useSelectionStore()
    selection.initializeMedication('med-atorvastatin')
    const stored = JSON.parse(window.localStorage.getItem('cleardose:selection')!)
    delete stored.maxDeliveryDays
    window.localStorage.setItem('cleardose:selection', JSON.stringify(stored))
    setActivePinia(createPinia())
    expect(useSelectionStore().maxDeliveryDays).toBeNull()
    useSelectionStore().setDeliveryLimit(4)
    setActivePinia(createPinia())
    expect(useSelectionStore().maxDeliveryDays).toBe(4)
    useSelectionStore().initializeMedication('med-metformin')
    expect(useSelectionStore().maxDeliveryDays).toBeNull()
    expect(() => useSelectionStore().setDeliveryLimit(-1)).toThrow('Maximum delivery days')
    expect(() => useSelectionStore().setDeliveryLimit(31)).toThrow('Maximum delivery days')
  })
})
