export interface LegacyMedication {
  id: string;
  slug: string;
  genericName: string;
  brandNames: string[];
  category: string;
  rxRequired: boolean;
  displaySummary: string;
  forms: string[];
  strengths: string[];
  quantityOptions: number[];
  searchTerms: string[];
  publicData?: unknown;
}

export interface LegacySku {
  id: string;
  medicationId: string;
  form: string;
  strength: string;
  quantity: number;
  unit: string;
  rxRequired: boolean;
}

export interface LegacyPharmacy {
  id: string;
  name: string;
  shortName: string;
  type: string;
  description: string;
  fulfillmentTypes: string[];
  demo: boolean;
  demoPharmacyId?: string;
  priceKind?: string;
}

export interface LegacyOffer {
  id: string;
  skuId: string;
  pharmacyId: string;
  available: boolean;
  inventoryLabel: string;
  pricing: {
    medicationCost: number;
    fulfillmentFee: number;
    markup: number;
    medicationSubtotal: number;
  };
  deliveryOptions: Array<{
    id: string;
    type: string;
    label: string;
    price: number;
    estimatedMinDays: number;
    estimatedMaxDays: number;
  }>;
  effectiveAt: string;
  priceKind?: string;
  purchasable?: boolean;
  sourceDisclaimer?: string;
}

export interface LegacyDatabase {
  schemaVersion: string;
  metadata: Record<string, unknown>;
  medications: LegacyMedication[];
  pharmacies: LegacyPharmacy[];
  skus: LegacySku[];
  offers: LegacyOffer[];
  pricingScenarios: unknown[];
}
