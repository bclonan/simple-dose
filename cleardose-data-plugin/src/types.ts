export type DataSourceId =
  | 'rxnorm'
  | 'openfda-ndc'
  | 'openfda-label'
  | 'openfda-event'
  | 'nadac'
  | 'cms-part-d'
  | 'demo'
  | string;

export interface SourceStamp {
  source: DataSourceId;
  url?: string;
  retrievedAt: string;
  effectiveAt?: string;
  datasetVersion?: string;
  disclaimer?: string;
}

export type ProviderWarningCode = 'network' | 'rate-limit' | 'unavailable' | 'malformed-response' | 'not-found' | 'cache-unavailable' | 'partial' | 'ambiguous';

export interface ProviderWarning {
  source: DataSourceId;
  code: ProviderWarningCode;
  message: string;
}

export interface DataMeta {
  origin: 'live' | 'cache' | 'stale-cache';
  retrievedAt: string;
  expiresAt?: string;
  stale: boolean;
}

export class DataProviderError extends Error {
  constructor(public readonly source: DataSourceId, public readonly code: ProviderWarningCode, message: string) {
    super(message);
    this.name = 'DataProviderError';
  }
}

export interface DrugIdentity {
  id: string;
  slug: string;
  rxcui?: string;
  genericName: string;
  brandNames: string[];
  ndcs: string[];
  productNdcs: string[];
  applicationNumbers: string[];
  splSetIds: string[];
}

export interface DrugProductVariant {
  productNdc?: string;
  packageNdcs: string[];
  brandName?: string;
  genericName?: string;
  dosageForm?: string;
  route: string[];
  activeIngredients: Array<{ name: string; strength?: string }>;
  labelerName?: string;
  marketingCategory?: string;
}

export interface DrugClinical {
  indications: string[];
  contraindications: string[];
  warnings: string[];
  boxedWarnings: string[];
  adverseReactions: string[];
  drugInteractions: string[];
  clinicalPharmacology: string[];
  pregnancy: string[];
  pediatricUse: string[];
  geriatricUse: string[];
  dosageAndAdministration: string[];
}

export type DrugPriceKind =
  | 'nadac-benchmark'
  | 'medicare-part-d-gross'
  | 'medicare-plan-unit-cost'
  | 'cash'
  | 'discount'
  | 'demo';

export interface DrugPriceQuote {
  id: string;
  kind: DrugPriceKind;
  ndc?: string;
  amount: number;
  currency: 'USD';
  basis: 'unit' | 'prescription' | 'claim' | 'month';
  quantity?: number;
  unit?: string;
  unitAmount?: number;
  product?: { form?: string; strength?: string; skuId?: string };
  effectiveDate?: string;
  asOfDate?: string;
  plan?: {
    contractId?: string;
    planId?: string;
    segmentId?: string;
    planName?: string;
    daysSupply?: number;
  };
  pharmacy?: {
    name?: string;
    npi?: string;
  };
  label: string;
  consumerMeaning: string;
  source: SourceStamp;
}

export interface AdverseEventReaction {
  reaction: string;
  reports: number;
}

export interface ClearDoseDrug {
  identity: DrugIdentity;
  variants: DrugProductVariant[];
  forms: string[];
  strengths: string[];
  routes: string[];
  activeIngredients: string[];
  manufacturers: string[];
  pharmacologicClasses: string[];
  clinical?: DrugClinical;
  prices: DrugPriceQuote[];
  reportedAdverseEvents?: AdverseEventReaction[];
  sources: SourceStamp[];
  warnings?: ProviderWarning[];
  dataMeta?: DataMeta;
}

export interface DrugSearchHit {
  id: string;
  slug: string;
  genericName: string;
  brandNames: string[];
  forms: string[];
  strengths: string[];
  rxcui?: string;
  ndcs: string[];
  source: DataSourceId;
  warnings?: ProviderWarning[];
  dataMeta?: DataMeta;
}

export interface SearchOptions {
  limit?: number;
  includeClinical?: boolean;
  includePrices?: boolean;
  quantity?: number;
}

export interface GetDrugOptions {
  includeClinical?: boolean;
  includePrices?: boolean;
  includeAdverseEventSummary?: boolean;
  quantity?: number;
}

export interface CompareResult {
  drugs: ClearDoseDrug[];
  generatedAt: string;
  unavailable?: Array<{ query: string; warning: ProviderWarning }>;
}
