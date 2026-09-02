export type CurrencyCode = 'USD'

export type MedicationForm = 'tablet' | 'capsule'
export type MedicationUnit = 'tablet' | 'capsule'
export type PharmacyType = 'mail-order' | 'community' | 'express' | 'hybrid'
export type FulfillmentType =
  | 'standard-delivery'
  | 'express-delivery'
  | 'local-pickup'
export type DeliveryType = 'delivery' | 'pickup'

export interface DemoDatabaseMetadata {
  name: string
  description: string
  currency: CurrencyCode
  locale: string
  generatedFor: string
  disclaimer: string
  updatedAt: string
}

export interface Medication {
  id: string
  slug: string
  genericName: string
  brandNames: string[]
  category: string
  rxRequired: boolean
  displaySummary: string
  forms: string[]
  strengths: string[]
  quantityOptions: number[]
  searchTerms: string[]
  publicOnly?: boolean
  publicSource?: string
  publicSummary?: { brandNames: string[]; forms: string[]; strengths: string[] }
}

export interface MedicationSku {
  id: string
  medicationId: string
  form: MedicationForm
  strength: string
  quantity: number
  unit: MedicationUnit
  rxRequired: boolean
}

export interface Pharmacy {
  id: string
  name: string
  shortName: string
  type: PharmacyType
  description: string
  fulfillmentTypes: FulfillmentType[]
  demo: true
  demoPharmacyId: string
}

export interface PriceComponents {
  medicationCost: number
  fulfillmentFee: number
  markup: number
}

export interface PriceBreakdown extends PriceComponents {
  medicationSubtotal: number
}

export interface DeliveryOption {
  id: string
  type: DeliveryType
  label: string
  price: number
  estimatedMinDays: number
  estimatedMaxDays: number
}

export interface MedicationOffer {
  id: string
  skuId: string
  pharmacyId: string
  available: boolean
  inventoryLabel: string
  pricing: PriceBreakdown
  deliveryOptions: DeliveryOption[]
  effectiveAt: string
}

export interface OfferPricingOverride {
  offerId: string
  pricing: PriceComponents
}

export interface PricingScenario {
  id: string
  label: string
  effectiveAt: string
  description: string
  offerOverrides: OfferPricingOverride[]
}

export interface DemoDatabase {
  schemaVersion: '1.0.0'
  metadata: DemoDatabaseMetadata
  medications: Medication[]
  pharmacies: Pharmacy[]
  skus: MedicationSku[]
  offers: MedicationOffer[]
  pricingScenarios: PricingScenario[]
}

export interface MedicationSelection {
  medicationId: string
  skuId: string
  offerId: string
  deliveryOptionId: string
}

export interface PriceComparison {
  optionId: string
  medicationId: string
  skuId: string
  offerId: string
  pharmacyId: string
  pharmacyName: string
  pharmacyShortName: string
  deliveryOptionId: string
  deliveryType: DeliveryType
  deliveryLabel: string
  medicationSubtotal: number
  deliveryPrice: number
  total: number
  estimatedMinDays: number
  estimatedMaxDays: number
  pricing: PriceBreakdown
  isLowestTotal: boolean
  isFastest: boolean
}

export interface PrescriptionRequest {
  id: string
  createdAt: string
  medicationId: string
  skuId: string
  offerId: string
  deliveryOptionId: string
  pharmacyId: string
  estimatedTotal: number
  patientName?: string
  dateOfBirth?: string
  prescriberName?: string
  practice?: string
  status: 'prepared'
}

export interface CartItem {
  id: string
  skuId: string
  offerId: string
  deliveryOptionId: string
  addedAt: string
}

export interface Cart {
  items: CartItem[]
  updatedAt: string | null
}

export interface DemoAddress {
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
}

export type PrescriptionStatus = 'provider-will-send' | 'request-prepared'

export type DemoOrderStatus =
  | 'demo-order-created'
  | 'prescription-awaiting-provider'
  | 'pharmacy-review'
  | 'prepared'
  | 'shipped'

export interface DemoOrder {
  id: string
  createdAt: string
  status: DemoOrderStatus
  items: CartItem[]
  fullName: string
  address: DemoAddress
  prescriptionStatus: PrescriptionStatus
  total: number
}

export interface AgentActivityContext {
  explorer?: {
    revision: string
    selectedDrugIds: string[]
    cards: Array<{ id: string; factType: string; drugIds: string[] }>
  }
  dataMode?: 'live' | 'hybrid' | 'demo'
  catalogMedicationIds?: string[]
  route: string
  pricingScenario: {
    id: string
    label: string
    effectiveAt: string
  }
  selection: {
    medicationId: string | null
    skuId: string | null
    offerId: string | null
    deliveryOptionId: string | null
    form: string | null
    strength: string | null
    quantity: number | null
  }
  cart: {
    itemCount: number
    itemIds: string[]
    offerIds: string[]
    medicationSubtotal: number
    deliveryTotal: number
    grandTotal: number
  }
  currentOrder: {
    orderId: string
    status: DemoOrderStatus
    itemCount: number
    total: number
  } | null
}

export interface AgentActivity {
  id: string
  journeyId: string
  journeyTitle: string
  timestamp: string
  source: 'agent' | 'human' | 'demo'
  type: 'tool'
  toolName: string
  status: 'started' | 'success' | 'error'
  input?: unknown
  outputSummary?: unknown
  contextBefore?: AgentActivityContext
  contextAfter?: AgentActivityContext
  durationMs?: number
  error?: string
}
