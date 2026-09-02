import type { DrugPriceQuote } from '../types';
import { normalizeManyNdcs, normalizeNdc11 } from '../utils/ndc';
import { getJson, type HttpOptions } from '../utils/http';
import { DataProviderError } from '../types';

export interface MedicarePriceIndex {
  generatedAt: string;
  release?: string;
  prices: Array<{
    ndc: string;
    contractId?: string;
    planId?: string;
    segmentId?: string;
    planName?: string;
    daysSupply?: number;
    unitCost: number;
  }>;
}

export class LocalMedicareProvider {
  private loading?: Promise<MedicarePriceIndex>;
  constructor(private readonly indexUrl: string, private readonly http: HttpOptions = {}) {}

  private async load(): Promise<MedicarePriceIndex> {
    if (!this.loading) {
      const absoluteUrl = new URL(this.indexUrl, typeof location === 'undefined' ? 'http://localhost' : location.href).href;
      this.loading = getJson<MedicarePriceIndex>(absoluteUrl, {}, this.http).then(index => {
        if (!index || !Array.isArray(index.prices) || index.prices.some(row =>
          typeof row?.ndc !== 'string' || !Number.isFinite(row.unitCost) || row.unitCost < 0)) {
          throw new DataProviderError('cms-part-d', 'malformed-response', 'The configured Medicare price index has invalid rows.');
        }
        return index;
      }).catch(error => { this.loading = undefined; throw error; });
    }
    return this.loading;
  }

  async getQuotes(ndcs: string[], quantity = 30): Promise<DrugPriceQuote[]> {
    const wanted = new Set(normalizeManyNdcs(ndcs));
    if (!wanted.size) return [];
    const index = await this.load();
    return index.prices
      .filter(row => wanted.has(normalizeNdc11(row.ndc) ?? ''))
      .slice(0, 100)
      .map((row, i) => ({
        id: `price-cms-${row.contractId ?? 'x'}-${row.planId ?? 'x'}-${row.ndc}-${i}`,
        kind: 'medicare-plan-unit-cost',
        ndc: normalizeNdc11(row.ndc),
        amount: Math.round(row.unitCost * quantity * 100) / 100,
        currency: 'USD',
        basis: 'prescription',
        quantity,
        unitAmount: row.unitCost,
        plan: {
          contractId: row.contractId,
          planId: row.planId,
          segmentId: row.segmentId,
          planName: row.planName,
          daysSupply: row.daysSupply
        },
        label: 'CMS Part D plan-level unit-cost data',
        consumerMeaning: 'Plan-level published pricing context; not a guaranteed beneficiary copay or point-of-sale price.',
        source: {
          source: 'cms-part-d',
          url: this.indexUrl,
          retrievedAt: new Date().toISOString(),
          datasetVersion: index.release,
          disclaimer: 'CMS quarterly Part D public-use pricing data; not a personalized coverage quote.'
        }
      }));
  }
}
