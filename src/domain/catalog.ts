import type { Medication, MedicationSku } from '../types/demo-db'

export interface MedicationSearchFilters {
  form?: string
  strength?: string
  rxRequired?: boolean
}

const normalize = (value: string): string => value.trim().toLocaleLowerCase()

export const searchMedications = (
  medications: readonly Medication[],
  query: string,
  filters: MedicationSearchFilters = {},
): Medication[] => {
  const normalizedQuery = normalize(query)

  return medications.filter((medication) => {
    const searchable = [
      medication.genericName,
      ...medication.brandNames,
      medication.category,
      ...medication.forms,
      ...medication.strengths,
      ...medication.searchTerms,
    ]
      .join(' ')
      .toLocaleLowerCase()

    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery)
    const matchesForm = !filters.form || medication.forms.includes(filters.form as never)
    const matchesStrength = !filters.strength || medication.strengths.includes(filters.strength)
    const matchesRx =
      filters.rxRequired === undefined || medication.rxRequired === filters.rxRequired

    return matchesQuery && matchesForm && matchesStrength && matchesRx
  })
}

export interface ExactSkuInput {
  medicationId: string
  form: string
  strength: string
  quantity: number
}

export const findExactSku = (
  skus: readonly MedicationSku[],
  input: ExactSkuInput,
): MedicationSku | undefined =>
  skus.find(
    (sku) =>
      sku.medicationId === input.medicationId &&
      sku.form === input.form &&
      sku.strength === input.strength &&
      sku.quantity === input.quantity,
  )
