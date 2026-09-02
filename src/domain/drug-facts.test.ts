import { describe, expect, it } from 'vitest'
import type { ClearDoseDrug } from '../../cleardose-data-plugin/src/types'
import { drugFactRegistry, drugFactTypes, factDate, factLoadOptions, hasFactContent, hasLongFactContent, isDrugFactType, quickDrugFacts, selectDrugFact, selectFactSource } from './drug-facts'

const drug = (): ClearDoseDrug => ({
  identity: { id: 'public-1', slug: 'example', genericName: 'Example medication', brandNames: ['Example brand'], ndcs: ['12345678901'], productNdcs: ['12345-6789'], applicationNumbers: ['NDA000001'], splSetIds: ['label-1'], rxcui: '123' },
  variants: [], forms: ['TABLET'], strengths: ['20 mg'], routes: ['ORAL'], activeIngredients: ['EXAMPLE INGREDIENT'], manufacturers: ['Example labeler'], pharmacologicClasses: ['Example class [EPC]'], prices: [],
  clinical: { indications: ['Uses source text'], contraindications: ['Contraindication source text'], warnings: ['Warning source text'], boxedWarnings: ['Boxed source text'], adverseReactions: ['Reaction source text'], drugInteractions: ['Interaction source text'], clinicalPharmacology: ['Pharmacology source text'], pregnancy: ['Pregnancy source text'], pediatricUse: ['Pediatric source text'], geriatricUse: ['Geriatric source text'], dosageAndAdministration: ['Dosage source text'] },
  reportedAdverseEvents: [{ reaction: 'HEADACHE', reports: 12345 }],
  sources: [{ source: 'openfda-ndc', retrievedAt: '2026-09-02T00:00:00Z' }, { source: 'openfda-label', url: 'https://api.fda.gov/drug/label.json', retrievedAt: '2026-09-02T00:00:00Z' }, { source: 'openfda-event', retrievedAt: '2026-09-02T00:00:00Z' }],
})

describe('central drug fact registry', () => {
  it('owns all 14 fact names, labels and quick choices', () => {
    expect(drugFactTypes).toHaveLength(14)
    expect(new Set(drugFactTypes).size).toBe(14)
    expect(quickDrugFacts).toEqual(['uses', 'side-effects', 'warnings', 'boxed-warnings', 'interactions', 'ingredients', 'pricing'])
    expect(drugFactTypes.every(fact => drugFactRegistry[fact].label && typeof drugFactRegistry[fact].selector === 'function')).toBe(true)
    expect(isDrugFactType('warnings')).toBe(true)
    expect(isDrugFactType('toString')).toBe(false)
    expect(isDrugFactType('invented-fact')).toBe(false)
  })
  it('requests only the provider categories needed for chosen facts', () => {
    expect(factLoadOptions(['identity', 'ingredients', 'strengths'])).toEqual({ includeClinical: false, includePrices: false, includeAdverseEventSummary: false })
    expect(factLoadOptions(['warnings', 'pregnancy'])).toEqual({ includeClinical: true, includePrices: false, includeAdverseEventSummary: false })
    expect(factLoadOptions(['pricing'])).toEqual({ includeClinical: false, includePrices: true, includeAdverseEventSummary: false })
    expect(factLoadOptions(['adverse-events'])).toEqual({ includeClinical: false, includePrices: false, includeAdverseEventSummary: true })
    expect(factLoadOptions(drugFactTypes)).toEqual({ includeClinical: true, includePrices: true, includeAdverseEventSummary: true })
  })
  it('projects clinical fields without changing or shortening source text', () => {
    const record = drug()
    const before = structuredClone(record)
    expect(selectDrugFact(record, 'uses').items).toEqual(['Uses source text'])
    expect(selectDrugFact(record, 'side-effects').items).toEqual(['Reaction source text'])
    expect(selectDrugFact(record, 'boxed-warnings').items).toEqual(['Boxed source text'])
    expect(selectDrugFact(record, 'interactions').items).toEqual(['Interaction source text'])
    expect(selectDrugFact(record, 'pregnancy').items).toEqual(['Pregnancy source text'])
    expect(selectDrugFact(record, 'pediatric').items).toEqual(['Pediatric source text'])
    expect(selectDrugFact(record, 'geriatric').items).toEqual(['Geriatric source text'])
    expect(selectDrugFact(record, 'clinical-pharmacology').items).toEqual(['Pharmacology source text'])
    expect(record).toEqual(before)
  })
  it('keeps contraindications labeled separately within warnings', () => {
    expect(selectDrugFact(drug(), 'warnings')).toMatchObject({ items: ['Warning source text'], values: [{ label: 'Contraindication', value: 'Contraindication source text' }] })
  })
  it('preserves identifiers, class labels and exact product attributes', () => {
    const record = drug()
    expect(selectDrugFact(record, 'identity').values).toContainEqual({ label: 'Package NDCs', value: '12345678901' })
    expect(selectDrugFact(record, 'ingredients')).toMatchObject({ items: ['EXAMPLE INGREDIENT'], values: [{ label: 'Pharmacologic classes', value: 'Example class [EPC]' }] })
    expect(selectDrugFact(record, 'strengths').values).toContainEqual({ label: 'Strengths', value: '20 mg' })
  })
  it('marks missing facts empty without inventing a negative safety finding', () => {
    const record = drug(); record.clinical = undefined
    const fact = selectDrugFact(record, 'pregnancy')
    expect(hasFactContent(fact)).toBe(false)
    expect(drugFactRegistry.pregnancy.emptyMessage).toContain('Absence is not a safety finding')
    expect(fact.sources[0]?.label).toBe('FDA drug label')
  })
  it('keeps price kinds, exact dimensions and sub-cent unit precision', () => {
    const record = drug()
    record.prices = [
      { id: 'benchmark', kind: 'nadac-benchmark', amount: .3, unitAmount: .009876, currency: 'USD', basis: 'prescription', quantity: 30, unit: 'tablet', ndc: '12345678901', label: 'NADAC record', consumerMeaning: 'Not retail', source: { source: 'nadac', retrievedAt: '2026-09-02', effectiveAt: '2026-09-01' } },
      { id: 'demo', kind: 'demo', amount: 8.4, currency: 'USD', basis: 'prescription', quantity: 30, unit: 'tablets', product: { form: 'tablet', strength: '20 mg' }, label: 'Demo record', consumerMeaning: 'Fictional', source: { source: 'demo', retrievedAt: '2026-09-02' } },
    ]
    const fact = selectDrugFact(record, 'pricing')
    expect(fact.priceGroups.map(group => group.kind)).toEqual(['nadac-benchmark', 'demo'])
    expect(fact.priceGroups[0]?.notice).toContain('not a retail cash price')
    expect(fact.priceGroups[0]?.quotes[0]).toMatchObject({ amount: '$0.30', unitAmount: '$0.009876', ndc: '12345678901' })
    expect(fact.priceGroups[1]?.quotes[0]?.dimensions).toBe('20 mg, tablet, 30 tablets')
    expect(fact.priceGroups[1]?.notice).toContain('not a live pharmacy quote')
  })
  it('retains report counts and never calls FAERS counts incidence rates', () => {
    expect(selectDrugFact(drug(), 'adverse-events').events).toEqual([{ reaction: 'HEADACHE', reports: '12,345' }])
    expect(drugFactRegistry['adverse-events'].notice).toContain('not incidence rates')
    expect(drugFactRegistry.interactions.notice).toContain('not a complete pairwise interaction check')
  })
  it('permits only credential-free HTTPS source links and formats dates safely', () => {
    expect(selectFactSource({ source: 'untrusted', url: 'javascript:alert(1)', retrievedAt: 'bad' })).toMatchObject({ url: undefined, retrieved: 'Date unavailable' })
    expect(selectFactSource({ source: 'untrusted', url: 'https://user:password@example.org/', retrievedAt: '20260902' }).url).toBeUndefined()
    expect(factDate('20260902')).toBe('Sep 2, 2026')
    expect(factDate('2026-09-02T23:59:00Z')).toBe('Sep 2, 2026')
  })
  it('detects long content while retaining every source paragraph', () => {
    const record = drug(); record.clinical!.warnings = ['x'.repeat(1000), 'Second paragraph', 'Third paragraph']
    const fact = selectDrugFact(record, 'warnings')
    expect(hasLongFactContent(fact)).toBe(true)
    expect(fact.items[0]).toHaveLength(1000)
    expect(fact.items[2]).toBe('Third paragraph')
  })
})
