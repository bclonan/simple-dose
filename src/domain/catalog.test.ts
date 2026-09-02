import { describe, expect, it } from 'vitest'

import demoDatabaseJson from '../data/cleardose-demo-db.json'
import type { DemoDatabase } from '../types/demo-db'
import { findExactSku, searchMedications } from './catalog'

const demoDatabase = demoDatabaseJson as unknown as DemoDatabase

describe('medication search', () => {
  it('matches public form casing without treating different dosage forms as equivalent', () => {
    const records = [{ ...demoDatabase.medications[0]!, forms: ['TABLET'] }]
    expect(searchMedications(records, '', { form: 'tablet' })).toHaveLength(1)
    expect(searchMedications(records, '', { form: 'tablet, extended release' })).toHaveLength(0)
  })
  it.each([
    ['generic name', 'atorvastatin', ['Atorvastatin']],
    ['brand name', 'Lipitor', ['Atorvastatin']],
    ['category', 'thyroid', ['Levothyroxine']],
    ['strength', '100 mcg', ['Levothyroxine']],
  ])('finds catalog entries by %s', (_field, query, expectedNames) => {
    expect(
      searchMedications(demoDatabase.medications, query).map(
        (medication) => medication.genericName,
      ),
    ).toEqual(expectedNames)
  })

  it('normalizes whitespace and case before searching', () => {
    const results = searchMedications(demoDatabase.medications, '  lIpItOr  ')

    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe('med-atorvastatin')
  })

  it('combines the query with exact form and strength filters', () => {
    const results = searchMedications(demoDatabase.medications, 'mental-health', {
      form: 'capsule',
      strength: '20 mg',
      rxRequired: true,
    })

    expect(results.map((medication) => medication.genericName)).toEqual(['Fluoxetine'])
  })
})

describe('exact SKU resolution', () => {
  it('resolves all four medication dimensions to one SKU', () => {
    const sku = findExactSku(demoDatabase.skus, {
      medicationId: 'med-atorvastatin',
      form: 'tablet',
      strength: '20 mg',
      quantity: 90,
    })

    expect(sku?.id).toBe('sku-atorvastatin-tablet-20mg-90')
    expect(sku).toMatchObject({
      medicationId: 'med-atorvastatin',
      form: 'tablet',
      strength: '20 mg',
      quantity: 90,
    })
  })

  it('does not fall back to a neighboring strength or quantity', () => {
    expect(
      findExactSku(demoDatabase.skus, {
        medicationId: 'med-atorvastatin',
        form: 'tablet',
        strength: '25 mg',
        quantity: 90,
      }),
    ).toBeUndefined()
  })
})
