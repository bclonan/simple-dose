import type { Medication, MedicationSku } from '../types/demo-db'

export interface MedicationSearchFilters {
  form?: string
  strength?: string
  rxRequired?: boolean
}

const normalize = (value: string): string => value.trim().toLocaleLowerCase()
export const discoveryAttributes = (medication: Medication, publicMetadata = true) => publicMetadata && medication.publicSummary ? medication.publicSummary : medication

export const searchMedications = (
  medications: readonly Medication[],
  query: string,
  filters: MedicationSearchFilters = {},
  publicMetadata = true,
): Medication[] => {
  const normalizedQuery = normalize(query)

  return medications.filter((medication) => {
    const attributes = discoveryAttributes(medication, publicMetadata)
    const searchable = [
      medication.genericName,
      ...attributes.brandNames,
      medication.category,
      ...attributes.forms,
      ...attributes.strengths,
      ...medication.searchTerms,
    ]
      .join(' ')
      .toLocaleLowerCase()

    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery)
    const matchesForm = !filters.form || attributes.forms.some(form => normalize(form) === normalize(filters.form!))
    const matchesStrength = !filters.strength || attributes.strengths.includes(filters.strength)
    const matchesRx =
      filters.rxRequired === undefined || (!medication.publicOnly && medication.rxRequired === filters.rxRequired)

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
