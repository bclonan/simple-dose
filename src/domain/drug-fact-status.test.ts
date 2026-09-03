import { describe, expect, it } from 'vitest'
import type { ClearDoseDrug } from '../../cleardose-data-plugin/src/types'
import { drugFactStatus } from './drug-fact-status'

const record = (clinical?: ClearDoseDrug['clinical']) => ({
  status: 'cache' as const,
  drug: {
    identity: { id: 'rxcui-1', slug: 'metformin', genericName: 'Metformin', brandNames: [], ndcs: [], productNdcs: [], applicationNumbers: [], splSetIds: [] },
    variants: [], forms: ['TABLET'], strengths: [], routes: [], activeIngredients: [], manufacturers: [], pharmacologicClasses: [], clinical,
    prices: [], sources: [{ source: 'openfda-ndc', retrievedAt: '2026-09-02' }],
  } satisfies ClearDoseDrug,
})
const clinical = (): NonNullable<ClearDoseDrug['clinical']> => ({ indications: [], contraindications: [], warnings: [], boxedWarnings: [], adverseReactions: [], drugInteractions: [], clinicalPharmacology: [], pregnancy: [], pediatricUse: [], geriatricUse: [], dosageAndAdministration: [] })

describe('requested public fact availability', () => {
  it('does not mistake cached product data for a successfully loaded FDA label', () => {
    const input = record()
    const outcome = drugFactStatus({ ...input, drug: { ...input.drug, warnings: [{ source: 'openfda-label', code: 'network', message: 'Label request failed.' }] } }, 'side-effects')
    expect(outcome).toMatchObject({ availability: 'provider-failed', source: 'openfda-label' })
    expect(outcome.message).toContain('FDA label could not load')
    expect(outcome.message).not.toContain('loaded FDA label')
  })
  it('distinguishes an absent field in a loaded label from no matching label', () => {
    expect(drugFactStatus(record(clinical()), 'side-effects').availability).toBe('field-absent')
    expect(drugFactStatus(record(), 'side-effects').availability).toBe('source-unavailable')
  })
  it('marks retained clinical content partial when its source refresh failed', () => {
    const input = record({ ...clinical(), adverseReactions: ['Saved FDA adverse reactions.'] })
    const result = drugFactStatus({ ...input, status: 'stale-cache', drug: { ...input.drug, warnings: [{ source: 'openfda-label', code: 'unavailable', message: 'Label refresh failed.' }] } }, 'side-effects')
    expect(result.availability).toBe('partial')
    expect(result.message).toContain('remains available')
  })
  it('does not apply a pricing outage to an available FDA fact', () => {
    const input = record({ ...clinical(), drugInteractions: ['Individual FDA label text.'] })
    expect(drugFactStatus({ ...input, drug: { ...input.drug, warnings: [{ source: 'nadac', code: 'network', message: 'Price request failed.' }] } }, 'interactions')).toMatchObject({ availability: 'available', warnings: [] })
  })
  it('retains partial-coverage notices without treating a valid quote as a provider failure', () => {
    const input = record()
    const result = drugFactStatus({ ...input, drug: { ...input.drug,
      prices: [{ id: 'nadac', kind: 'nadac-benchmark', amount: 3, currency: 'USD', basis: 'prescription', label: 'Public benchmark', consumerMeaning: 'Not retail', source: { source: 'nadac', retrievedAt: '2026-09-02' } }],
      warnings: [{ source: 'nadac', code: 'partial', message: 'Only a bounded package subset was checked.' }],
    } }, 'pricing')
    expect(result).toMatchObject({ availability: 'available', warnings: [{ source: 'nadac', code: 'partial' }] })
  })
  it('does not count a fictional quote as public pricing availability', () => {
    const input = record()
    const result = drugFactStatus({ ...input, drug: { ...input.drug, prices: [{ id: 'demo', kind: 'demo', amount: 5, currency: 'USD', basis: 'prescription', label: 'Fictional quote', consumerMeaning: 'Demo only', source: { source: 'demo', retrievedAt: '2026-09-02' } }] } }, 'pricing')
    expect(result.availability).toBe('source-unavailable')
    expect(result.message).toContain('Demo quotes are not public pricing')
  })
  it('keeps loading and demo states separate from provider failures', () => {
    expect(drugFactStatus(undefined, 'side-effects', true).availability).toBe('loading')
    expect(drugFactStatus(undefined, 'side-effects', false, true).availability).toBe('demo')
    expect(drugFactStatus(undefined, 'side-effects').availability).toBe('not-loaded')
  })
})
