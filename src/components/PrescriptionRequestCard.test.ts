import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCatalogStore } from '../stores/catalog.store'
import { usePrescriptionStore } from '../stores/prescription.store'
import { formatCurrency } from '../utils/format'
import PrescriptionCardView from '../views/PrescriptionCardView.vue'
import PrescriptionRequestCard from './PrescriptionRequestCard.vue'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

function prepareRequest(generated: boolean) {
  const catalog = useCatalogStore()
  if (generated) catalog.mergePublicMedications([{
    id: 'med-public-cetirizine', slug: 'public-cetirizine', genericName: 'Cetirizine', brandNames: [], category: 'allergy',
    rxRequired: false, publicOnly: true, publicSource: 'openfda-ndc', displaySummary: '',
    forms: ['TABLET'], strengths: ['10 mg'], quantityOptions: [], searchTerms: [],
  }])
  const sku = generated ? catalog.skusForMedication('med-public-cetirizine')[0]! : catalog.skus[0]!
  const offer = catalog.offers.find(item => item.skuId === sku.id)!
  const request = usePrescriptionStore().createRequest({
    medicationId: sku.medicationId, form: sku.form, strength: sku.strength, quantity: sku.quantity,
    offerId: offer.id, deliveryOptionId: offer.deliveryOptions[0]!.id,
  })
  return { sku, request }
}

describe('prescription request demo disclosures', () => {
  for (const generated of [false, true]) {
    it(`keeps fictional terms in the printable ${generated ? 'generated public' : 'seeded demo'} card`, () => {
      const { sku, request } = prepareRequest(generated)
      const wrapper = mount(PrescriptionRequestCard, { props: { request } })
      expect(wrapper.text()).toContain('Demo prescription request')
      expect(wrapper.text()).toContain('Demo estimate')
      expect(wrapper.text()).toContain('simulated delivered total')
      expect(wrapper.text()).not.toContain('Estimated patient price')
      expect(wrapper.text()).not.toContain('Send the prescription to')
      const notice = wrapper.get('[data-testid="prescription-demo-notice"]')
      expect(notice.text()).toBe(sku.demoProvenance?.notice ?? 'Fictional demo only. Configuration, quantity, price, and fulfillment are for a mock shopping workflow, not dosing guidance, a pharmacy quote, or verified availability.')
      expect(notice.classes()).not.toContain('no-print')
      expect(wrapper.text()).toContain('not a prescription')
      wrapper.unmount()
    })

    it(`keeps fictional terms in copied ${generated ? 'generated public' : 'seeded demo'} request text`, async () => {
      const { sku, request } = prepareRequest(generated)
      const writeText = vi.fn().mockResolvedValue(undefined)
      const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
      const router = createRouter({ history: createMemoryHistory(), routes: [
        { path: '/prescription-card', component: PrescriptionCardView },
        { path: '/medications', component: { template: '<div />' } },
      ] })
      await router.push('/prescription-card')
      await router.isReady()
      const wrapper = mount(PrescriptionCardView, { global: { plugins: [router] } })
      try {
        await wrapper.findAll('button').find(button => button.text() === 'Copy request')!.trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledOnce()
        const copied = String(writeText.mock.calls[0]?.[0])
        expect(copied).toContain('CLEARDOSE DEMO PRESCRIPTION REQUEST')
        expect(copied).toContain(`Demo estimate: ${formatCurrency(request.estimatedTotal)} simulated delivered total`)
        expect(copied).toContain(sku.demoProvenance?.notice ?? 'Fictional demo only.')
        expect(copied).toContain('not a prescription')
      } finally {
        wrapper.unmount()
        if (original) Object.defineProperty(navigator, 'clipboard', original)
        else Reflect.deleteProperty(navigator, 'clipboard')
      }
    })
  }
})
