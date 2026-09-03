import { describe, expect, it } from 'vitest'
import { compactMedicationLabels, medicationBrandLabels, medicationCategoryLabel, medicationFormLabel, medicationNameLabel, uniqueMedicationLabels } from './medication-presentation'

describe('medication display labels', () => {
  it('normalizes source casing without removing identity qualifiers', () => {
    expect(medicationNameLabel('  ATORVASTATIN   CALCIUM, FILM COATED ')).toBe('Atorvastatin Calcium, Film Coated')
    expect(medicationNameLabel('metformin hcl er')).toBe('Metformin HCl ER')
    expect(medicationFormLabel('TABLET, FILM COATED')).toBe('Tablet, film coated')
  })

  it('deduplicates brands and does not repeat the generic name as a brand', () => {
    expect(medicationBrandLabels('Atorvastatin Calcium', ['Atorvastatin Calcium', 'ATORVASTATIN CALCIUM', 'Lipitor', ' LIPITOR '])).toEqual(['Lipitor'])
  })

  it('keeps missing data explicit and bounds compact lists', () => {
    expect(medicationCategoryLabel('uncategorized')).toBe('Other medications')
    expect(medicationCategoryLabel('other-medications')).toBe('Other medications')
    expect(medicationCategoryLabel('')).toBe('Other medications')
    expect(medicationNameLabel('')).toBe('Medication name unavailable')
    expect(uniqueMedicationLabels(['', '10 mg/1', ' 10 mg/1 ', '20 mg/1'])).toEqual(['10 mg/1', '20 mg/1'])
    expect(compactMedicationLabels(['10 mg', '20 mg', '40 mg', '80 mg'], 3)).toBe('10 mg · 20 mg · 40 mg · +1 more')
  })
})
