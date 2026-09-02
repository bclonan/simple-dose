import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { ClearDoseDrug } from '../../../cleardose-data-plugin/src/types'
import { useCatalogStore } from '../../stores/catalog.store'
import { useDrugFacts } from '../../composables/useDrugFacts'
import DrugInfoCard from './DrugInfoCard.vue'

const drug = (name = 'Atorvastatin'): ClearDoseDrug => ({
  identity: { id: `public-${name}`, slug: name.toLowerCase(), genericName: name, brandNames: [], ndcs: [], productNdcs: [], applicationNumbers: [], splSetIds: [] },
  variants: [], forms: ['TABLET'], strengths: ['20 mg'], routes: ['ORAL'], activeIngredients: [`${name} ingredient`], manufacturers: [], pharmacologicClasses: [], prices: [],
  clinical: { indications: ['Source uses text'], warnings: ['Source warning text'], contraindications: [], boxedWarnings: [], adverseReactions: ['Source reaction text'], drugInteractions: ['Individual drug interaction section'], clinicalPharmacology: [], pregnancy: [], pediatricUse: [], geriatricUse: [], dosageAndAdministration: [] },
  sources: [{ source: 'openfda-label', url: 'https://api.fda.gov/drug/label.json', retrievedAt: '2026-09-02T00:00:00Z' }],
})
function setup() {
  const pinia = createPinia(); setActivePinia(pinia)
  const catalog = useCatalogStore(); catalog.dataMode = 'hybrid'
  catalog.publicRecords['med-atorvastatin'] = { status: 'live', drug: drug() }
  return { pinia, catalog }
}

describe('shared drug fact card', () => {
  it('evolves from one drug to a comparison through shared catalog state without fetching', async () => {
    const { pinia, catalog } = setup()
    const load = vi.spyOn(catalog, 'loadMedication')
    const wrapper = mount(DrugInfoCard, { props: { card: { id: 'fact-1', factType: 'warnings', drugIds: ['med-atorvastatin'] } }, global: { plugins: [pinia] } })
    expect(wrapper.findAll('[data-drug-id]')).toHaveLength(1)
    catalog.publicRecords['med-metformin'] = { status: 'cache', drug: drug('Metformin') }
    await wrapper.setProps({ card: { id: 'fact-1', factType: 'warnings', drugIds: ['med-atorvastatin', 'med-metformin'] } })
    expect(wrapper.findAll('[data-drug-id]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Metformin')
    expect(wrapper.text()).toContain('Cached public data')
    expect(load).not.toHaveBeenCalled()
  })
  it('uses the central fact choices and emits simple change/remove actions', async () => {
    const { pinia } = setup()
    const wrapper = mount(DrugInfoCard, { props: { card: { id: 'fact-1', factType: 'warnings', drugIds: ['med-atorvastatin'] } }, global: { plugins: [pinia] } })
    expect(wrapper.get('select').findAll('option')).toHaveLength(14)
    await wrapper.get('select').setValue('side-effects')
    expect(wrapper.emitted('change')).toEqual([['side-effects']])
    await wrapper.get('button[aria-label="Remove Warnings card"]').trigger('click')
    expect(wrapper.emitted('remove')).toHaveLength(1)
    await wrapper.setProps({ editable: false })
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Remove Warnings card"]').exists()).toBe(false)
  })
  it('reveals all long source text and additional paragraphs on Show more', async () => {
    const { pinia, catalog } = setup()
    catalog.publicRecords['med-atorvastatin']!.drug!.clinical!.warnings = ['Source text '.repeat(100), 'Second source paragraph', 'Third complete source paragraph']
    const wrapper = mount(DrugInfoCard, { props: { card: { id: 'fact-long', factType: 'warnings', drugIds: ['med-atorvastatin'] } }, global: { plugins: [pinia] } })
    expect(wrapper.text()).not.toContain('Third complete source paragraph')
    const expand = wrapper.get('button[aria-expanded="false"]')
    await expand.trigger('click')
    expect(wrapper.get('button[aria-expanded="true"]').text()).toContain('Show less')
    expect(wrapper.text()).toContain('Third complete source paragraph')
    expect(wrapper.find('.drug-info-card__body--preview').exists()).toBe(false)
  })
  it('renders provider text safely and preserves source metadata', () => {
    const { pinia, catalog } = setup()
    const record = catalog.publicRecords['med-atorvastatin']!.drug!
    record.clinical!.warnings = ['<script>alert(1)</script>']
    record.sources.push({ source: 'openfda-label', url: 'javascript:alert(1)', retrievedAt: 'bad' })
    const wrapper = mount(DrugInfoCard, { props: { card: { id: 'fact-1', factType: 'warnings', drugIds: ['med-atorvastatin'] } }, global: { plugins: [pinia] } })
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
    expect(wrapper.findAll('a')).toHaveLength(1)
    expect(wrapper.text()).toContain('Sep 2, 2026')
    expect(wrapper.text()).toContain('Date unavailable')
  })
  it('distinguishes explicit demo mode from a hybrid provider fallback', async () => {
    const { pinia, catalog } = setup()
    catalog.publicRecords['med-atorvastatin'] = { status: 'demo', message: 'The public provider is unavailable.' }
    const wrapper = mount(DrugInfoCard, { props: { card: { id: 'fact-1', factType: 'warnings', drugIds: ['med-atorvastatin'] } }, global: { plugins: [pinia] } })
    expect(wrapper.text()).toContain('Demo fallback, public facts unavailable')
    expect(wrapper.text()).not.toContain('Switch to hybrid')
    catalog.dataMode = 'demo'; await nextTick()
    expect(wrapper.text()).toContain('Switch to hybrid or live data')
  })
  it('announces loading, then missing facts without a negative safety claim', async () => {
    const { pinia, catalog } = setup()
    catalog.detailLoading['med-atorvastatin'] = true
    const wrapper = mount(DrugInfoCard, { props: { card: { id: 'fact-1', factType: 'pregnancy', drugIds: ['med-atorvastatin'] } }, global: { plugins: [pinia] } })
    expect(wrapper.get('[data-drug-id]').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('Loading requested facts')
    catalog.detailLoading['med-atorvastatin'] = false; await nextTick()
    expect(wrapper.text()).toContain('Absence is not a safety finding')
    expect(wrapper.text()).toContain('Sources and freshness')
  })
  it('keeps pricing types separate inside the same card', () => {
    const { pinia, catalog } = setup()
    catalog.publicRecords['med-atorvastatin']!.drug!.prices = [
      { id: 'nadac', kind: 'nadac-benchmark', amount: 2, currency: 'USD', basis: 'prescription', quantity: 30, unit: 'tablet', label: 'Benchmark record', consumerMeaning: 'Not retail', source: { source: 'nadac', retrievedAt: '2026-09-02' } },
      { id: 'demo', kind: 'demo', amount: 8, currency: 'USD', basis: 'prescription', label: 'Demo record', consumerMeaning: 'Fictional', source: { source: 'demo', retrievedAt: '2026-09-02' } },
    ]
    const wrapper = mount(DrugInfoCard, { props: { card: { id: 'fact-1', factType: 'pricing', drugIds: ['med-atorvastatin'] } }, global: { plugins: [pinia] } })
    expect(wrapper.get('[data-price-kind="nadac-benchmark"]').text()).toContain('not a retail cash price')
    expect(wrapper.get('[data-price-kind="demo"]').text()).toContain('not a live pharmacy quote')
    expect(wrapper.text()).toContain('$2.00')
    expect(wrapper.text()).toContain('$8.00')
  })
  it('uses individual interaction sections and honest FAERS report wording', async () => {
    const { pinia, catalog } = setup()
    const wrapper = mount(DrugInfoCard, { props: { card: { id: 'fact-1', factType: 'interactions', drugIds: ['med-atorvastatin'] } }, global: { plugins: [pinia] } })
    expect(wrapper.text()).toContain('not a complete pairwise interaction check')
    catalog.publicRecords['med-atorvastatin']!.drug!.reportedAdverseEvents = [{ reaction: 'HEADACHE', reports: 1234 }]
    await wrapper.setProps({ card: { id: 'fact-1', factType: 'adverse-events', drugIds: ['med-atorvastatin'] } })
    expect(wrapper.text()).toContain('1,234 reports')
    expect(wrapper.text()).toContain('not incidence rates')
  })
  it('projects available facts from existing shared records only', () => {
    setup()
    const facts = useDrugFacts()
    expect(facts.availableFacts(['med-atorvastatin'])).toContain('warnings')
    expect(facts.availableFacts(['med-atorvastatin'])).not.toContain('pregnancy')
    expect(facts.getFacts(['med-atorvastatin'], ['uses', 'ingredients']).map(item => item.type)).toEqual(['uses', 'ingredients'])
  })
})
