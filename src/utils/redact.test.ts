import { describe, expect, it } from 'vitest'
import { compactSummary } from './redact'

describe('bounded Explorer mutation receipts', () => {
  it('retains fact availability and continuation metadata while redacting personal fields', () => {
    const output = {
      status: 'updated', workspaceRevision: 'explorer-1', selectedDrugIds: ['med-metformin'], cardCount: 2, workspacePath: '/drugs/explore', route: '/drugs/explore',
      data: { availability: 'partial', requested: 2, providerFailed: 1 },
      factResults: [{ drugId: 'med-metformin', factType: 'side-effects', availability: 'provider-failed', warnings: [{ source: 'openfda-label', code: 'network' }] }],
      factResultsTotal: 2, factResultsTruncated: true, nextAction: 'Read all fact-data rows.', patientName: 'Private name', address: 'Private address',
    }
    expect(JSON.stringify(output).length).toBeLessThan(1500)
    expect(compactSummary(output)).toEqual({ ...output, patientName: '[redacted]', address: '[redacted]' })
  })
})
