import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { ClearDoseDrug } from '../../../cleardose-data-plugin/src/types'
import PublicDrugPanel from './PublicDrugPanel.vue'

const publicDrug = (): ClearDoseDrug => ({
  identity: {
    id: 'rxnorm-123', slug: 'example', genericName: 'Example medication',
    brandNames: ['Example brand'], ndcs: [], productNdcs: [],
    applicationNumbers: [], splSetIds: [], rxcui: '123',
  },
  variants: [], forms: ['tablet'], strengths: ['20 mg'], routes: ['ORAL'],
  activeIngredients: ['example ingredient'], manufacturers: ['Example labeler'],
  pharmacologicClasses: [], prices: [], sources: [],
})

describe('public medication reference panel', () => {
  it('keeps missing clinical fields unavailable and explains the limits', () => {
    const wrapper = mount(PublicDrugPanel, {
      props: { record: { status: 'live', drug: publicDrug() } },
    })
    expect(wrapper.get('[data-testid="public-data-status"]').text()).toBe('Public data loaded')
    expect(wrapper.text()).toContain('Missing warnings or label sections do not mean a medication is safe for you')
    expect(wrapper.get('[data-testid="public-clinical-sections"]').findAll('details')).toHaveLength(11)
    expect(wrapper.text()).toContain('not a complete pairwise interaction check')
    expect(wrapper.text()).toContain('do not prove that a medicine caused an event')
  })

  it('keeps benchmark prices separate from cash and preserves sub-cent unit precision', () => {
    const drug = publicDrug()
    drug.prices.push({
      id: 'nadac-example', kind: 'nadac-benchmark', amount: 0.3,
      currency: 'USD', basis: 'prescription', quantity: 30, unit: 'tablet',
      unitAmount: 0.009876, label: 'Public acquisition benchmark',
      consumerMeaning: 'Not a retail price',
      source: { source: 'nadac', retrievedAt: '2026-09-02T00:00:00Z' },
    })
    const wrapper = mount(PublicDrugPanel, { props: { record: { status: 'cache', drug } } })
    const benchmark = wrapper.get('[data-price-kind="nadac-benchmark"]')
    expect(benchmark.text()).toContain('$0.30')
    expect(benchmark.text()).toContain('$0.009876')
    expect(benchmark.text()).toContain('not a retail cash price')
    expect(wrapper.get('[data-price-kind="cash"]').text()).toContain('No provider cash price data is available')
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.get('button').text()).toBe('Retry public data')
  })

  it('renders source text safely and links only HTTPS sources', () => {
    const drug = publicDrug()
    drug.sources = [
      { source: 'openfda-label', url: 'https://open.fda.gov/', retrievedAt: '2026-09-02T00:00:00Z' },
      { source: 'untrusted', url: 'javascript:alert(1)', retrievedAt: 'not-a-date', disclaimer: '<script>alert(1)</script>' },
    ]
    const wrapper = mount(PublicDrugPanel, { props: { record: { status: 'stale-cache', drug } } })
    expect(wrapper.get('[data-testid="public-sources"]').findAll('a')).toHaveLength(1)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain('Date unavailable')
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
  })

  it('shows provider notices and exposes an explicit retry action', async () => {
    const drug = publicDrug()
    drug.warnings = [{ source: 'nadac', code: 'network', message: 'The acquisition benchmark could not refresh.' }]
    const wrapper = mount(PublicDrugPanel, { props: { record: { status: 'live', drug } } })
    expect(wrapper.get('[data-testid="provider-warnings"]').text()).toContain('network')
    expect(wrapper.get('[data-testid="provider-warnings"]').text()).toContain('could not refresh')
    await wrapper.get('[data-testid="retry-public-data"]').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
