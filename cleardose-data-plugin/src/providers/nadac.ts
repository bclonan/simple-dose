import { DataProviderError, type DrugPriceQuote, type ProviderWarning, type SourceStamp } from '../types';
import { getJson, HttpError, type HttpOptions } from '../utils/http';
import { normalizeManyNdcs, normalizeNdc11 } from '../utils/ndc';
import { stableId } from '../utils/text';

interface DkanDatasetMeta { identifier?: string; title?: string; modified?: string; }
interface DkanQueryResponse<T> { results?: T[]; total?: number; }

interface NadacRow {
  ndc_description?: string;
  ndc?: string;
  nadac_per_unit?: string | number;
  effective_date?: string;
  pricing_unit?: string;
  classification_for_rate_setting?: string;
  corresponding_generic_drug_nadac_per_unit?: string | number;
  corresponding_generic_drug_effective_date?: string;
  as_of_date?: string;
  // Some exports/transformers retain display labels; accept both shapes.
  'NDC Description'?: string;
  'NDC'?: string;
  'NADAC Per Unit'?: string | number;
  'Effective Date'?: string;
  'Pricing Unit'?: string;
  'Classification for Rate Setting'?: string;
  'Corresponding Generic Drug NADAC Per Unit'?: string | number;
  'Corresponding Generic Drug Effective Date'?: string;
  'As of Date'?: string;
}

function f<T = string>(row: NadacRow, apiKey: keyof NadacRow, displayKey: keyof NadacRow): T | undefined {
  return (row[apiKey] ?? row[displayKey]) as T | undefined;
}

export class NadacProvider {
  private resolvedDatasetId?: string;
  private discovering?: Promise<string>;

  constructor(
    private readonly baseUrl: string,
    private readonly datasetId: string | 'auto',
    private readonly year: number,
    private readonly http: HttpOptions = {}
  ) {}

  async discoverDatasetId(): Promise<string> {
    if (this.datasetId !== 'auto') return this.datasetId;
    if (this.resolvedDatasetId) return this.resolvedDatasetId;

    if (this.discovering) return this.discovering;
    this.discovering = this.discover().finally(() => { this.discovering = undefined; });
    return this.discovering;
  }

  private async discover(): Promise<string> {
    const items = await getJson<DkanDatasetMeta[]>(
      `${this.baseUrl}/api/1/metastore/schemas/dataset/items`,
      {},
      this.http
    );
    if (!Array.isArray(items)) throw new DataProviderError('nadac', 'malformed-response', 'Medicaid returned an invalid dataset list.');
    const expected = `NADAC (National Average Drug Acquisition Cost) ${this.year}`.toLowerCase();
    const match = items.find(item => item.title?.toLowerCase() === expected)
      ?? items.find(item => item.title?.toLowerCase().includes('nadac') && item.title?.includes(String(this.year)));
    if (!match?.identifier) throw new DataProviderError('nadac', 'unavailable', `The NADAC dataset for ${this.year} is unavailable. Configure a verified dataset ID.`);
    this.resolvedDatasetId = match.identifier;
    return match.identifier;
  }

  private async query(conditions: Array<{ property: string; value: string; operator?: string }>, limit = 100, signal?: AbortSignal): Promise<NadacRow[]> {
    signal?.throwIfAborted();
    const datasetId = await this.discoverDatasetId();
    signal?.throwIfAborted();
    const url = new URL(`${this.baseUrl}/api/1/datastore/query/${datasetId}/0`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('sorts[0][property]', 'as_of_date');
    url.searchParams.set('sorts[0][order]', 'desc');
    url.searchParams.set('sorts[1][property]', 'effective_date');
    url.searchParams.set('sorts[1][order]', 'desc');
    conditions.forEach((c, index) => {
      url.searchParams.set(`conditions[${index}][property]`, c.property);
      url.searchParams.set(`conditions[${index}][value]`, c.value);
      url.searchParams.set(`conditions[${index}][operator]`, c.operator ?? '=');
    });
    const data = await getJson<DkanQueryResponse<NadacRow>>(url.toString(), {}, { ...this.http, signal });
    if (!Array.isArray(data?.results) || data.results.some(row => !row || typeof row !== 'object')) {
      throw new DataProviderError('nadac', 'malformed-response', 'Medicaid returned an invalid NADAC row list.');
    }
    return data.results ?? [];
  }

  async byNdc(ndc: string, signal?: AbortSignal): Promise<NadacRow[]> {
    const normalized = normalizeManyNdcs([ndc])[0];
    if (!normalized) return [];
    return this.query([{ property: 'ndc', value: normalized, operator: '=' }], 1, signal);
  }

  async byName(name: string, limit = 100): Promise<NadacRow[]> {
    return this.query([{ property: 'ndc_description', value: name.toUpperCase(), operator: 'contains' }], limit);
  }

  async getQuotes(input: { ndcs?: string[]; name?: string; quantity?: number }): Promise<DrugPriceQuote[]> {
    return (await this.getQuotesWithWarnings(input)).quotes;
  }

  async getQuotesWithWarnings(input: { ndcs?: string[]; name?: string; quantity?: number }): Promise<{ quotes: DrugPriceQuote[]; warnings: ProviderWarning[] }> {
    const quantity = input.quantity ?? 30;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new DataProviderError('nadac', 'unavailable', 'Quantity must be an integer from 1 to 1000.');
    const ndcs = normalizeManyNdcs(input.ndcs ?? []);
    if (!ndcs.length) return { quotes: [], warnings: [] };
    const collected: NadacRow[] = [];
    const warnings: ProviderWarning[] = [];
    const wanted = new Set(ndcs.slice(0, 4));
    let successful = 0;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.http.timeoutMs ?? 12_000);
    try {
      await Promise.all([...wanted].map(async ndc => {
        try { collected.push(...await this.byNdc(ndc, controller.signal)); successful++; }
        catch (error) {
          warnings.push({ source: 'nadac', code: error instanceof DataProviderError ? error.code : error instanceof HttpError && error.status === 429 ? 'rate-limit' : 'network', message: 'NADAC could not load one or more exact package NDCs.' });
        }
      }));
    } finally { clearTimeout(timer); }
    if (!successful) throw new DataProviderError('nadac', warnings[0]?.code ?? 'unavailable', 'NADAC is unavailable. Other drug data is still usable.');
    if (ndcs.length > 4) warnings.push({ source: 'nadac', code: 'partial', message: 'Benchmarks cover the first 4 package NDCs, not every product variant.' });

    // The yearly dataset contains historical weekly rows. Keep the latest row per NDC.
    const latest = new Map<string, NadacRow>();
    const dateValue = (row: NadacRow) => Date.parse(f<string>(row, 'as_of_date', 'As of Date') ?? f<string>(row, 'effective_date', 'Effective Date') ?? '') || 0;
    for (const row of collected) {
      const ndc = normalizeNdc11(String(f<string>(row, 'ndc', 'NDC') ?? ''));
      if (!ndc || !wanted.has(ndc)) continue;
      const prev = latest.get(ndc);
      if (!prev || dateValue(row) >= dateValue(prev)) latest.set(ndc, row);
    }

    const source: SourceStamp = {
      source: 'nadac',
      url: `${this.baseUrl}/dataset/${await this.discoverDatasetId()}`,
      retrievedAt: new Date().toISOString(),
      datasetVersion: String(this.year),
      disclaimer: 'NADAC is a pharmacy acquisition-cost benchmark, not a retail cash price, insured copay, or negotiated patient price.'
    };

    const quotes = [...latest.values()].flatMap(row => {
      const rawAmount = f<string | number>(row, 'nadac_per_unit', 'NADAC Per Unit');
      const unitAmount = rawAmount === undefined || rawAmount === '' ? NaN : Number(rawAmount);
      if (!Number.isFinite(unitAmount) || unitAmount < 0) {
        warnings.push({ source: 'nadac', code: 'malformed-response', message: 'A NADAC row contained an invalid amount and was omitted.' });
        return [];
      }
      const ndc = normalizeNdc11(String(f<string>(row, 'ndc', 'NDC') ?? ''));
      const unit = String(f<string>(row, 'pricing_unit', 'Pricing Unit') ?? 'unit').trim();
      return [{
        id: stableId('price-nadac', `${ndc}:${f<string>(row, 'effective_date', 'Effective Date')}:${quantity}`),
        kind: 'nadac-benchmark' as const,
        ndc,
        amount: Math.round(unitAmount * quantity * 100) / 100,
        currency: 'USD' as const,
        basis: 'prescription' as const,
        quantity,
        unit,
        unitAmount,
        effectiveDate: f<string>(row, 'effective_date', 'Effective Date'),
        asOfDate: f<string>(row, 'as_of_date', 'As of Date'),
        label: `NADAC benchmark for ${quantity} ${unit}`,
        consumerMeaning: 'Estimated pharmacy acquisition benchmark; this is not the price a patient pays.',
        source
      }];
    });
    return { quotes, warnings };
  }
}
