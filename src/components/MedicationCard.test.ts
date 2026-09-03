import { createPinia, setActivePinia } from 'pinia'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCatalogStore } from '../stores/catalog.store'
import type { Medication } from '../types/demo-db'
import MedicationCard from './MedicationCard.vue'

const publicMedication = (overrides: Partial<Medication> = {}): Medication => ({
  id: 'med-public-atorvastatin-calcium', slug: 'public-atorvastatin-calcium',
  genericName: 'atorvastatin calcium, film coated',
  brandNames: ['atorvastatin calcium, film coated', 'ATORVASTATIN CALCIUM, FILM COATED', 'Lipitor', 'LIPITOR'],
  category: 'uncategorized', rxRequired: false, displaySummary: '', publicOnly: true, publicSource: 'openfda-ndc',
  forms: ['TABLET, FILM COATED', 'TABLET', 'tablet'], strengths: ['10 mg/1', '20 mg/1', '40 mg/1', '80 mg/1'],
  quantityOptions: [], searchTerms: [], ...overrides,
})

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  useCatalogStore().dataMode = 'hybrid'
})

const render = (medication = publicMedication(), startingPrice?: number) => mount(MedicationCard, {
  props: { medication, startingPrice }, global: { stubs: { RouterLink: RouterLinkStub } },
})

describe('medication cards', () => {
  it('uses a separate public-data badge and readable, deduplicated source labels', () => {
    const wrapper = render()
    expect(wrapper.get('h3').text()).toBe('Atorvastatin Calcium, Film Coated')
    expect(wrapper.get('.medication-card__category').text()).toBe('Other medications')
    expect(wrapper.get('.medication-card__reference').text()).toBe('Public data')
    expect(wrapper.find('.medication-card__rx').exists()).toBe(false)
    expect(wrapper.get('.medication-card__brand').text()).toBe('Listed brands: Lipitor')
    expect(wrapper.get('.medication-card__details').text()).toContain('Tablet, film coated · Tablet')
    expect(wrapper.get('.medication-card__details').text()).toContain('10 mg/1 · 20 mg/1 · 40 mg/1 · +1 more')
    expect(wrapper.getComponent(RouterLinkStub).props('to')).toBe('/medications/public-atorvastatin-calcium')
  })

  it('labels a live-data medication price as demo shopping, not public retail evidence', () => {
    useCatalogStore().dataMode = 'live'
    const wrapper = render(publicMedication(), 7.25)
    expect(wrapper.get('.medication-card__price').text()).toContain('Demo price from')
    expect(wrapper.get('.medication-card__price').text()).toContain('$7.25')
    expect(wrapper.get('.medication-card__price').text()).toContain('Simulated fulfillment')
    expect(wrapper.getComponent(RouterLinkStub).text()).toContain('View medication')
    expect(wrapper.text()).not.toContain('Retail price')
  })

  it('renders long names as text and handles missing factual data without inventing options', () => {
    const name = 'acetaminophen / dextromethorphan hydrobromide / doxylamine succinate <script>alert(1)</script>'
    const wrapper = render(publicMedication({ genericName: name, brandNames: [], forms: [], strengths: [], category: '' }))
    expect(wrapper.get('h3').text()).toContain('Dextromethorphan Hydrobromide')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.findAll('dd').map(item => item.text())).toEqual(['Not listed in source', 'Not listed in source'])
    expect(wrapper.get('.medication-card__brand').text()).toBe('No distinct brand names listed')
    expect(wrapper.get('.medication-card__price-note').text()).toBe('Demo price unavailable')
  })
})
