import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import type { ClearDoseDrug, DrugPriceQuote } from '../../../cleardose-data-plugin/src/types'
import { useDrugFacts } from '../../composables/useDrugFacts'
import type { DrugFactType } from '../../domain/drug-facts'
import { useCatalogStore } from '../../stores/catalog.store'
import ComparisonFactCell from './ComparisonFactCell.vue'

const source = { source: 'openfda-label' as const, url: 'https://api.fda.gov/drug/label.json', retrievedAt: '2026-09-02', effectiveAt: '2026-08-04' }
const record = (): ClearDoseDrug => ({
  identity: { id: 'public-metformin', slug: 'metformin', genericName: 'Metformin', brandNames: [], ndcs: [], productNdcs: [], applicationNumbers: [], splSetIds: [] },
  variants: [], forms: ['TABLET'], strengths: ['500 mg'], routes: ['ORAL'], activeIngredients: ['Metformin'], manufacturers: [], pharmacologicClasses: [], prices: [],
  clinical: { indications: [], warnings: [], contraindications: [], boxedWarnings: [], adverseReactions: ['First exact FDA source paragraph. '.repeat(40), 'Second exact FDA paragraph.'], drugInteractions: ['Exact individual FDA interaction text.'], clinicalPharmacology: [], pregnancy: [], pediatricUse: [], geriatricUse: [], dosageAndAdministration: [] },
  sources: [source],
})
const quote = (id: string, kind: DrugPriceQuote['kind'] = 'nadac-benchmark'): DrugPriceQuote => ({
  id, kind, amount: id === 'second' ? 1 : 2, currency: 'USD', basis: 'prescription', quantity: 30, unit: 'tablet', ndc: '00000000001',
  label: `Source record ${id}`, consumerMeaning: 'This is not a retail price.', effectiveDate: '2026-09-02', unitAmount: 0.066,
  source: { source: kind === 'demo' ? 'demo' : 'nadac', retrievedAt: '2026-09-02', datasetVersion: '2026-09', url: 'https://data.medicaid.gov/' },
})
function setup(factType: DrugFactType = 'side-effects', drug = record(), expanded = false) {
  setActivePinia(createPinia())
  const catalog = useCatalogStore()
  catalog.dataMode = 'live'
  catalog.publicRecords['med-metformin'] = { status: 'live', drug }
  const facts = useDrugFacts()
  const fact = () => facts.getFact(['med-metformin'], factType).drugs[0]!
  const wrapper = mount(ComparisonFactCell, { props: { drug: fact(), factType, cellId: 'cell-side-effects-metformin', expanded } })
  return { wrapper, catalog, fact }
}

describe('comparison report fact cell', () => {
  it('shows an exact, explicitly shortened excerpt with an accessible local expansion', async () => {
    const { wrapper } = setup()
    const section = wrapper.get('section')
    expect(section.attributes('data-drug-id')).toBe('med-metformin')
    expect(section.attributes('data-availability')).toBe('available')
    expect(section.attributes('aria-label')).toBe('Metformin')
    expect(wrapper.findAll('h3')).toHaveLength(0)
    expect(wrapper.get('[role="status"]').text()).toBe('Public data')
    const preview = wrapper.get('.comparison-fact-cell__screen .drug-info-card__text').text()
    expect(record().clinical!.adverseReactions[0]!.startsWith(preview)).toBe(true)
    expect(preview.length).toBeLessThanOrEqual(480)
    expect(wrapper.get('.comparison-fact-cell__screen').text()).toContain('FDA label excerpt')
    expect(wrapper.get('.comparison-fact-cell__screen').text()).not.toContain('Second exact FDA paragraph.')
    expect(wrapper.get('.comparison-fact-cell__omitted').text()).toContain('Excerpt only')
    const button = wrapper.get('button')
    expect(button.text()).toBe('Show more for Metformin')
    expect(button.attributes('aria-controls')).toBe('cell-side-effects-metformin-body')
    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.comparison-fact-cell__screen').text()).toContain('Second exact FDA paragraph.')
    expect(wrapper.get('.comparison-fact-cell__screen .drug-info-card__text').text()).toBe(record().clinical!.adverseReactions[0]!.trim())
  })

  it('supports expand all without disabling individual controls, and resets on a fact change', async () => {
    const { wrapper } = setup()
    await wrapper.setProps({ expanded: true })
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
    await wrapper.setProps({ factType: 'warnings' })
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
    await wrapper.setProps({ expanded: false })
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
  })

  it('keeps the first source quote for every kind, without selecting the cheapest or blending types', async () => {
    const drug = record()
    drug.prices = [quote('first'), quote('second'), quote('demo', 'demo')]
    const { wrapper } = setup('pricing', drug)
    const screen = wrapper.get('.comparison-fact-cell__screen')
    expect(screen.findAll('[data-price-kind]')).toHaveLength(2)
    expect(screen.findAll('[data-quote-id]')).toHaveLength(2)
    expect(screen.find('[data-quote-id="second"]').exists()).toBe(false)
    expect(screen.get('[data-price-kind="nadac-benchmark"]').text()).toContain('$2.00')
    expect(screen.get('[data-price-kind="nadac-benchmark"]').text()).toContain('not a retail cash price')
    expect(screen.get('[data-price-kind="demo"]').text()).toContain('Fictional demo cash price')
    expect(screen.text()).toContain('Not a lowest-price selection')
    expect(screen.text()).toContain('30 tablet')
    expect(screen.text()).toContain('00000000001')
    expect(screen.text()).toContain('Sep 2, 2026')
    await wrapper.get('button').trigger('click')
    expect(screen.findAll('[data-quote-id]')).toHaveLength(3)
    expect(screen.text()).toContain('Per unit')
    expect(screen.text()).toContain('Dataset 2026-09')
    expect(wrapper.get('.comparison-fact-cell__sources').attributes()).toHaveProperty('open')
  })

  it('preserves missing-source explanations and loading without any risk ranking', async () => {
    const { wrapper, catalog, fact } = setup()
    catalog.publicRecords['med-metformin'] = { status: 'cache', drug: { ...record(), clinical: undefined, warnings: [{ source: 'openfda-label', code: 'unavailable', message: 'FDA source request failed.' }] } }
    await wrapper.setProps({ drug: fact() })
    expect(wrapper.get('section').attributes('data-availability')).toBe('provider-failed')
    expect(wrapper.get('[role="status"]').text()).toBe('FDA label failed to load')
    expect(wrapper.get('[role="status"]').classes()).toContain('comparison-fact-cell__status--unavailable')
    expect(wrapper.text()).toContain('Missing text is not a safety finding')
    expect(wrapper.text()).toContain('FDA source request failed')
    expect(wrapper.find('button').exists()).toBe(false)
    catalog.detailLoading['med-metformin'] = true
    await wrapper.setProps({ drug: fact() })
    expect(wrapper.get('section').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('[role="status"]').text()).toContain('Loading requested facts')
  })

  it('escapes source text and keeps source links, dates and source notices', () => {
    const drug = record()
    drug.clinical!.adverseReactions = ['<script>alert(1)</script> Exact source text.']
    drug.sources.push({ source: 'openfda-label', url: 'javascript:alert(1)', retrievedAt: 'bad' })
    drug.warnings = [{ source: 'openfda-label', code: 'partial', message: 'Only the checked label subset is included.' }]
    const { wrapper } = setup('side-effects', drug)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
    expect(wrapper.findAll('a')).toHaveLength(1)
    expect(wrapper.get('a').attributes('href')).toBe('https://api.fda.gov/drug/label.json')
    expect(wrapper.text()).toContain('Effective Aug 4, 2026')
    expect(wrapper.text()).toContain('Date unavailable')
    expect(wrapper.text()).toContain('Only the checked label subset is included')
  })

  it('prints a bounded exact excerpt even when the screen is expanded', () => {
    const { wrapper } = setup('side-effects', record(), true)
    expect(wrapper.get('.comparison-fact-cell__screen').text()).toContain('Second exact FDA paragraph.')
    const printed = wrapper.get('.comparison-fact-cell__print')
    expect(printed.text()).not.toContain('Second exact FDA paragraph.')
    expect(printed.text()).toContain('Additional text or records are omitted from this report')
    expect(printed.get('.comparison-fact-cell__text').text().length).toBeLessThanOrEqual(480)
    expect(printed.findAll('button')).toHaveLength(0)
  })
})
