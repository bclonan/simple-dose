import { describe, expect, it } from 'vitest'
import { compactSummary, formatActivityJson, redactSensitive } from './redact'

describe('activity receipt redaction', () => {
  it('renders all stored field rows and bounded catalog IDs in the expanded receipt', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ path: `/drugs/0/product/strengths/${i}`, value: `${i} mg` }))
    const catalogMedicationIds = Array.from({ length: 112 }, (_, i) => `med-public-${'a'.repeat(80)}-${i}`)
    const formatted = formatActivityJson({ rows, catalogMedicationIds, patientName: 'Private person' })
    expect(JSON.parse(formatted)).toEqual({ rows, catalogMedicationIds, patientName: '[redacted]' })
    expect(formatActivityJson('x'.repeat(20_000))).toContain('[bounded at 16,000 characters]')
  })
  it('retains bounded contextual field rows, pagination, and safety notices', () => {
    const page = { contextRevision: 'catalog-current', scope: 'catalog', dataMode: 'hybrid', section: 'identity', route: '/medications', offset: 0, returned: 1, totalRows: 2, nextOffset: 1, format: 'JSON Pointer field rows. Join string parts in order.', notice: 'Similarity is not substitution.', rows: [{ path: '/drugs/0/identity/genericName', value: 'Metformin' }] }
    expect(compactSummary(page)).toEqual(page)
  })

  it('keeps the bounded catalog ID list while redacting personal context', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `med-${i}`)
    expect(redactSensitive({ catalogMedicationIds: ids, patientName: 'Private person' })).toEqual({ catalogMedicationIds: ids, patientName: '[redacted]' })
    expect((redactSensitive({ catalogMedicationIds: Array(200).fill('med-1') }) as { catalogMedicationIds: string[] }).catalogMedicationIds).toHaveLength(112)
  })
})
