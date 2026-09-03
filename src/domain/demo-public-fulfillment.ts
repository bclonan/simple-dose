import type { Medication, MedicationOffer, MedicationSku, Pharmacy } from '../types/demo-db'
import { normalizePriceBreakdown } from './pricing'

const version = 'public-demo-v1'
const effectiveAt = '2026-09-02T00:00:00Z'
const quantities = [30, 60, 90]
const validText = (value: unknown, maximum: number): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= maximum

/** Stable pseudo-random values. Never derived from clinical data or public benchmarks. */
const hash = (value: string): number => {
  let result = 2166136261
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619)
  return result >>> 0
}
const stableId = (value: string): string => `${hash(value).toString(36)}${hash(`second:${value}`).toString(36)}`
const cents = (key: string, minimum: number, span: number): number => (minimum + hash(key) % span) / 100

export function validDemoConfiguration(value: unknown): value is NonNullable<Medication['demoConfiguration']> {
  if (!value || typeof value !== 'object') return false
  const configuration = value as NonNullable<Medication['demoConfiguration']>
  return validText(configuration.form, 80) && validText(configuration.strength, 120) && ['source-listed', 'synthetic'].includes(configuration.configuration)
}

export interface PublicDemoFulfillment {
  configuration?: Medication['demoConfiguration']
  skus: MedicationSku[]
  offers: MedicationOffer[]
}

/** Public facts stay untouched. These exact configurations and prices exist only for the mock cart. */
export function createPublicDemoFulfillment(
  medication: Medication,
  pharmacies: readonly Pharmacy[],
  offerTemplates: readonly MedicationOffer[],
): PublicDemoFulfillment {
  if (!medication.publicOnly) return { skus: [], offers: [] }
  const form = (medication.publicSummary?.forms ?? medication.forms).filter(value => validText(value, 80)).slice().sort()[0]
  const strength = (medication.publicSummary?.strengths ?? medication.strengths).filter(value => validText(value, 120)).slice().sort()[0]
  const configuration = validDemoConfiguration(medication.demoConfiguration) ? { ...medication.demoConfiguration } : {
    form: form ?? 'Demo form, see full public record',
    strength: strength ?? 'Demo strength, see full public record',
    configuration: form && strength ? 'source-listed' as const : 'synthetic' as const,
  }
  const notice = configuration.configuration === 'source-listed'
    ? 'Fictional demo offer. Form and strength labels came from public metadata; this generated combination, quantity, price and availability are not verified. Not dosing instructions.'
    : 'Fictional demo offer with a synthetic configuration where source attributes are missing. Price, quantity and availability are invented for the mock cart. Not dosing instructions.'
  const unit = /^tablet\b/i.test(configuration.form) ? 'tablet' : /^capsule\b/i.test(configuration.form) ? 'capsule' : 'demo unit'
  const key = `${version}:${medication.id}:${configuration.form}:${configuration.strength}`
  const skus: MedicationSku[] = quantities.map(quantity => ({
    id: `sku-public-demo-${stableId(`${key}:${quantity}`)}`,
    medicationId: medication.id, form: configuration.form, strength: configuration.strength, quantity, unit,
    // Only the fictional prescription workflow uses this flag. Public status is still unverified.
    rxRequired: true,
    demoProvenance: { kind: 'generated-demo', configuration: configuration.configuration, notice },
  }))
  const offers: MedicationOffer[] = skus.flatMap(sku => pharmacies.flatMap(pharmacy => {
    const template = offerTemplates.find(offer => offer.pharmacyId === pharmacy.id && offer.deliveryOptions.length)
    if (!template) return []
    const offerKey = `${version}:${sku.id}:${pharmacy.id}`
    const pricing = normalizePriceBreakdown({
      medicationCost: cents(`${key}:base`, 400, 2600) * sku.quantity / 30,
      fulfillmentFee: cents(`${offerKey}:fee`, 0, 250),
      markup: cents(`${offerKey}:markup`, 0, 650),
    })
    return [{
      id: `offer-public-demo-${stableId(offerKey)}`, skuId: sku.id, pharmacyId: pharmacy.id,
      available: true, inventoryLabel: 'Fictional demo availability', pricing,
      deliveryOptions: template.deliveryOptions.map(delivery => ({ ...delivery })), effectiveAt,
    }]
  }))
  return { configuration, skus, offers }
}
