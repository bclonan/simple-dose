import { describe, expect, it } from 'vitest'
import { demoDatabase } from '../data'
import type { Medication } from '../types/demo-db'
import { createPublicDemoFulfillment, validDemoConfiguration } from './demo-public-fulfillment'

const medication: Medication = {
  id: 'med-public-example', slug: 'public-example', genericName: 'Example', brandNames: [], category: 'other-medications',
  publicOnly: true, publicSource: 'openfda-ndc', rxRequired: false, displaySummary: 'Public source record',
  forms: ['SOLUTION'], strengths: ['1 mg/mL'], quantityOptions: [], searchTerms: ['Example'],
}
const make = (item = medication) => createPublicDemoFulfillment(item, demoDatabase.pharmacies, demoDatabase.offers)

describe('generated public-medication demo fulfillment', () => {
  it('makes stable exact mock SKUs and seeded prices without changing source attributes', () => {
    const before = structuredClone(medication)
    const generated = make()
    expect(generated).toEqual(make(structuredClone(medication)))
    expect(medication).toEqual(before)
    expect(generated.skus.map(sku => sku.quantity)).toEqual([30, 60, 90])
    expect(generated.skus.every(sku => sku.form === 'SOLUTION' && sku.strength === '1 mg/mL')).toBe(true)
    expect(generated.offers).toHaveLength(3 * demoDatabase.pharmacies.length)
    expect(new Set(generated.offers.map(offer => offer.pricing.medicationSubtotal)).size).toBeGreaterThan(3)
    expect(generated.offers.every(offer => offer.id.startsWith('offer-public-demo-') && offer.inventoryLabel.includes('Fictional'))).toBe(true)
    expect(generated.skus[0]?.demoProvenance).toMatchObject({ kind: 'generated-demo', configuration: 'source-listed', notice: expect.stringContaining('not verified') })
  })
  it('labels missing or overlong dimensions as synthetic without truncating public facts', () => {
    const source = { ...medication, forms: ['x'.repeat(81)], strengths: ['y'.repeat(121)] }
    const generated = make(source)
    expect(generated.configuration).toMatchObject({ form: 'Demo form, see full public record', strength: 'Demo strength, see full public record', configuration: 'synthetic' })
    expect(source.forms[0]).toHaveLength(81)
    expect(source.strengths[0]).toHaveLength(121)
    expect(make({ ...medication, forms: [], strengths: [] }).skus[0]?.demoProvenance?.configuration).toBe('synthetic')
    expect(validDemoConfiguration({ form: 'a'.repeat(81), strength: '1 mg', configuration: 'source-listed' })).toBe(false)
  })
  it('keeps previous configurations and prices when provider dimensions change or reorder', () => {
    const first = make()
    const changed = make({ ...medication, demoConfiguration: first.configuration, forms: ['TABLET'], strengths: ['200 mg'] })
    expect(changed).toEqual(first)
    expect(make({ ...medication, forms: ['TABLET', 'SOLUTION'], strengths: ['2 mg/mL', '1 mg/mL'] })).toEqual(make({ ...medication, forms: ['SOLUTION', 'TABLET'], strengths: ['1 mg/mL', '2 mg/mL'] }))
  })
  it('does not mutate pharmacies or templates and leaves original seed fixtures alone', () => {
    const before = structuredClone(demoDatabase)
    const generated = make()
    generated.offers[0]!.deliveryOptions[0]!.price = 999
    expect(demoDatabase).toEqual(before)
    expect(make(demoDatabase.medications[0]!)).toEqual({ skus: [], offers: [] })
  })
})
