import type { ProviderWarning } from '../../cleardose-data-plugin/src/types'
import type { PublicMedicationRecord } from '../services/medication.repository'
import { drugFactRegistry, hasFactContent, selectDrugFact, type DrugFactType } from './drug-facts'

export const factAvailabilityValues = ['available', 'partial', 'provider-failed', 'field-absent', 'source-unavailable', 'not-loaded', 'loading', 'demo'] as const
export type FactAvailability = typeof factAvailabilityValues[number]
export interface DrugFactStatus {
  availability: FactAvailability
  source: string
  message: string
  warnings: ProviderWarning[]
}
export interface DrugFactResult extends DrugFactStatus {
  cardId: string
  drugId: string
  factType: DrugFactType
}

export const isTransientProviderFailure = (warning: Pick<ProviderWarning, 'code'>): boolean =>
  ['network', 'rate-limit', 'unavailable', 'malformed-response'].includes(warning.code)

export const warningsForFactLoad = (warnings: readonly ProviderWarning[], load: 'product' | 'clinical' | 'pricing' | 'adverse-events'): ProviderWarning[] =>
  warnings.filter(warning => load === 'clinical' ? warning.source === 'openfda-label'
    : load === 'adverse-events' ? warning.source === 'openfda-event'
      : load === 'product' ? ['openfda-ndc', 'rxnorm'].includes(warning.source)
        : !['rxnorm', 'openfda-ndc', 'openfda-label', 'openfda-event', 'demo', 'cache'].includes(warning.source))

/** Availability belongs to the requested fact, not the aggregate record's cache origin. */
export function drugFactStatus(record: PublicMedicationRecord | undefined, factType: DrugFactType, loading = false, demoMode = false): DrugFactStatus {
  const definition = drugFactRegistry[factType]
  const source = definition.load === 'clinical' ? 'openfda-label' : definition.load === 'pricing' ? 'public-pricing'
    : definition.load === 'adverse-events' ? 'openfda-event' : 'public-product'
  const warnings = warningsForFactLoad(record?.drug?.warnings ?? [], definition.load)
  const result = (availability: FactAvailability, message: string): DrugFactStatus => ({ availability, source, message, warnings })
  if (loading) return result('loading', 'Loading the requested public fact.')
  if (demoMode || record?.status === 'demo') return result('demo', 'Fictional demo data does not provide public clinical facts.')
  if (!record) return result('not-loaded', 'This public fact has not loaded. Retry public data to request it.')
  if (!record.drug) return result('provider-failed', 'Public data could not load. Retry public data when connected. Missing facts are not a safety finding.')
  const content = selectDrugFact(record.drug, factType)
  const hasPublicContent = definition.load === 'pricing'
    ? content.priceGroups.some(group => group.kind !== 'demo' && group.quotes.length > 0)
    : hasFactContent(content)
  const failed = warnings.some(isTransientProviderFailure)
  if (hasPublicContent) return result(failed ? 'partial' : 'available', failed
    ? 'Some public data remains available, but a source refresh failed. Retry public data; review the source notices.' : '')
  if (failed) return result('provider-failed', definition.load === 'clinical'
    ? 'FDA label could not load. Retry public data when connected. Missing text is not a safety finding.'
    : 'The requested public source could not load. Retry public data; no missing result should be treated as a finding.')
  if (definition.load === 'clinical' && !record.drug.clinical) return result('source-unavailable', 'No matching FDA label was available. This does not establish that the requested risk is absent.')
  if (definition.load === 'pricing') return result('source-unavailable', 'No public price or benchmark matched the requested provider data. Demo quotes are not public pricing.')
  if (definition.load === 'adverse-events' && record.drug.reportedAdverseEvents === undefined) return result('source-unavailable', 'A public adverse-event summary was unavailable. Missing reports are not a safety finding.')
  return result('field-absent', definition.emptyMessage)
}
