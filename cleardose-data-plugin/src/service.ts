import type { ClearDoseCache } from './cache/cache';
import { DisabledCache, MemoryCache, ResilientCache } from './cache/cache';
import { IndexedDbCache } from './cache/indexeddb';
import type { ClearDosePluginConfig, ResolvedClearDosePluginConfig } from './config';
import { resolveConfig } from './config';
import { LocalMedicareProvider } from './providers/local-medicare';
import { NadacProvider } from './providers/nadac';
import { OpenFdaProvider, type OpenFdaNdcRow } from './providers/openfda';
import { RxNormProvider } from './providers/rxnorm';
import type { DrugPriceProvider } from './providers/types';
import { DataProviderError, type ClearDoseDrug, type CompareResult, type DataMeta, type DataSourceId, type DrugClinical, type DrugPriceQuote, type DrugSearchHit, type GetDrugOptions, type ProviderWarning, type SearchOptions, type SourceStamp } from './types';
import { HttpError } from './utils/http';
import { normalizeNdc11 } from './utils/ndc';
import { slugify, stableId, uniq } from './utils/text';

interface CachedRecord<T> { value: T; retrievedAt: string; expiresAt: string; }
interface CachedResult<T> { value: T; meta: DataMeta; warnings: ProviderWarning[]; }

function providerWarning(source: DataSourceId, error: unknown): ProviderWarning {
  if (error instanceof DataProviderError) return { source: error.source, code: error.code, message: error.message };
  if (error instanceof HttpError) {
    const code = error.status === 429 ? 'rate-limit' : error.status === 404 ? 'not-found' : 'unavailable';
    return { source, code, message: code === 'rate-limit' ? `${source} is rate limited. Retry later or use cached data.` : `${source} is unavailable. Other sources may still work.` };
  }
  return { source, code: error instanceof SyntaxError || error instanceof TypeError && !String(error.message).toLowerCase().includes('fetch') ? 'malformed-response' : 'network', message: `${source} could not load valid data. Cached data may be available.` };
}

function uniqueWarnings(values: ProviderWarning[]): ProviderWarning[] {
  return [...new Map(values.map(value => [`${value.source}:${value.code}:${value.message}`, value])).values()];
}

export class ClearDoseDataService {
  readonly config: ResolvedClearDosePluginConfig;
  readonly openFda?: OpenFdaProvider;
  readonly rxNorm?: RxNormProvider;
  readonly nadac?: NadacProvider;
  readonly medicare?: LocalMedicareProvider;
  readonly cache: ClearDoseCache;
  readonly extraPriceProviders: DrugPriceProvider[];
  private readonly inFlight = new Map<string, Promise<CachedResult<unknown>>>();
  private readonly drugInFlight = new Map<string, Promise<ClearDoseDrug>>();
  private readonly namespace: string;

  constructor(config: ClearDosePluginConfig = {}, cache?: ClearDoseCache, extraPriceProviders: DrugPriceProvider[] = []) {
    this.config = resolveConfig(config);
    this.extraPriceProviders = extraPriceProviders;
    const http = this.config.request;
    if (this.config.openFda.enabled) this.openFda = new OpenFdaProvider(this.config.openFda.baseUrl, this.config.openFda.apiKey, http);
    if (this.config.rxNorm.enabled) this.rxNorm = new RxNormProvider(this.config.rxNorm.baseUrl, http);
    if (this.config.nadac.enabled) this.nadac = new NadacProvider(this.config.nadac.baseUrl, this.config.nadac.datasetId, this.config.nadac.year, http);
    if (this.config.medicare.enabled) this.medicare = new LocalMedicareProvider(this.config.medicare.localIndexUrl, http);
    const ttl = this.config.cache.defaultTtlMs;
    const primary = cache ?? (typeof indexedDB !== 'undefined' ? new IndexedDbCache(this.config.cache.databaseName, ttl) : new MemoryCache(ttl));
    this.cache = this.config.cache.enabled ? new ResilientCache(primary, ttl) : new DisabledCache();
    this.namespace = stableId('cleardose-v5', JSON.stringify({
      openFda: [this.config.openFda.enabled, this.config.openFda.baseUrl], rxNorm: this.config.rxNorm,
      nadac: this.config.nadac, medicare: this.config.medicare, freshness: this.config.cache, providers: extraPriceProviders.map(provider => provider.id)
    }));
  }

  private cacheWarnings(): ProviderWarning[] {
    return this.cache instanceof ResilientCache && this.cache.degraded
      ? [{ source: 'cache', code: 'cache-unavailable', message: 'Persistent cache is unavailable. This session is using memory.' }]
      : [];
  }

  private async cached<T>(key: string, source: DataSourceId, ttlMs: number, load: () => Promise<T>): Promise<CachedResult<T>> {
    const fullKey = `${this.namespace}:${key}`;
    const existing = this.inFlight.get(fullKey);
    if (existing) return existing as Promise<CachedResult<T>>;
    const pending = (async (): Promise<CachedResult<T>> => {
      const fresh = await this.cache.get<CachedRecord<T>>(fullKey);
      if (fresh) return { value: structuredClone(fresh.value), meta: { origin: 'cache', retrievedAt: fresh.retrievedAt, expiresAt: fresh.expiresAt, stale: false }, warnings: this.cacheWarnings() };
      try {
        const value = await load();
        const now = Date.now();
        const record = { value: structuredClone(value), retrievedAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlMs).toISOString() };
        const records = Array.isArray(value) ? value : [value];
        const transient = records.some(item => typeof item === 'object' && item !== null && 'warnings' in item && Array.isArray(item.warnings)
          && item.warnings.some((warning: unknown) => typeof warning === 'object' && warning !== null && 'code' in warning
            && typeof warning.code === 'string' && !['not-found', 'partial'].includes(warning.code)));
        if (!transient) await this.cache.set(fullKey, record, ttlMs);
        return { value, meta: { origin: 'live', retrievedAt: record.retrievedAt, expiresAt: record.expiresAt, stale: false }, warnings: this.cacheWarnings() };
      } catch (error) {
        const stale = await this.cache.getStale?.<CachedRecord<T>>(fullKey);
        const warning = providerWarning(source, error);
        if (stale) return { value: structuredClone(stale.value), meta: { origin: 'stale-cache', retrievedAt: stale.retrievedAt, expiresAt: stale.expiresAt, stale: true }, warnings: uniqueWarnings([warning, ...this.cacheWarnings()]) };
        throw new DataProviderError(warning.source, warning.code, warning.message);
      }
    })();
    this.inFlight.set(fullKey, pending as Promise<CachedResult<unknown>>);
    try { return await pending; } finally { if (this.inFlight.get(fullKey) === pending) this.inFlight.delete(fullKey); }
  }

  private resolveIdentity(term: string) {
    return this.cached(`rxnorm:${term.toLowerCase()}`, 'rxnorm', this.config.cache.identityTtlMs, async () => {
      if (/^\d+$/.test(term) && term.length !== 11) return term;
      return this.rxNorm?.findRxCui(term);
    });
  }

  async search(query: string, options: SearchOptions = {}): Promise<DrugSearchHit[]> {
    const term = query.trim();
    if (!term) return [];
    const limit = options.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DataProviderError('search', 'unavailable', 'Search limit must be an integer from 1 to 100.');
    const result = await this.cached(`search-finished-v2:${term.toLowerCase()}:${limit}`, 'openfda-ndc', this.config.cache.searchTtlMs, async () => {
      const warnings: ProviderWarning[] = [];
      let rows: OpenFdaNdcRow[] = [];
      if (this.openFda) {
        try { rows = await this.openFda.searchNdc(term, limit); } catch (error) { warnings.push(providerWarning('openfda-ndc', error)); }
      }
      if (rows.length && this.openFda) return this.openFda.toSearchHit(rows).slice(0, limit);
      if (this.rxNorm) {
        try {
          const identity = await this.resolveIdentity(term);
          warnings.push(...identity.warnings);
          let rxcui = identity.value;
          let name: string | undefined;
          if (!rxcui) {
            const approximate = await this.cached(`approximate:${term.toLowerCase()}`, 'rxnorm', this.config.cache.identityTtlMs, () => this.rxNorm!.approximate(term, 1));
            warnings.push(...approximate.warnings);
            rxcui = approximate.value[0]?.rxcui;
            name = approximate.value[0]?.name;
          }
          if (rxcui) {
            if (!name) {
              const named = await this.cached(`rxnorm-name:${rxcui}`, 'rxnorm', this.config.cache.identityTtlMs, () => this.rxNorm!.getName(rxcui!));
              name = named.value;
              warnings.push(...named.warnings);
            }
            if (name) return [{ id: `rxcui-${rxcui}`, slug: slugify(name), genericName: name, brandNames: [], forms: [], strengths: [], ndcs: [], rxcui, source: 'rxnorm', warnings } satisfies DrugSearchHit];
          }
        } catch (error) { warnings.push(providerWarning('rxnorm', error)); }
      }
      if (warnings.length) {
        const failure = warnings[0]!;
        throw new DataProviderError(failure.source, failure.code, failure.message);
      }
      if (!this.openFda && !this.rxNorm) throw new DataProviderError('search', 'unavailable', 'Public search providers are disabled.');
      return [];
    });
    return result.value.map(hit => ({ ...hit, dataMeta: result.meta, warnings: uniqueWarnings([...(hit.warnings ?? []), ...result.warnings]) }));
  }

  async getDrug(query: string, options: GetDrugOptions = {}): Promise<ClearDoseDrug> {
    const term = query.trim().replace(/^rxcui-/i, '');
    if (!term) throw new DataProviderError('openfda-ndc', 'not-found', 'A drug name or RxCUI is required.');
    const quantity = options.quantity ?? 30;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new DataProviderError('pricing', 'unavailable', 'Quantity must be an integer from 1 to 1000.');
    const key = `drug:${term.toLowerCase()}:clinical=${options.includeClinical !== false}:prices=${options.includePrices !== false}:q=${quantity}:ae=${Boolean(options.includeAdverseEventSummary)}`;
    const existing = this.drugInFlight.get(key);
    if (existing) return existing;
    // Cache source records, not an assembled partial response. Retry can recover
    // failed optional sources immediately while reusing the successful sources.
    const pending = this.loadDrug(term, options, quantity);
    this.drugInFlight.set(key, pending);
    try { return await pending; } finally { if (this.drugInFlight.get(key) === pending) this.drugInFlight.delete(key); }
  }

  private async loadDrug(term: string, options: GetDrugOptions, quantity: number): Promise<ClearDoseDrug> {
    if (!this.openFda) throw new DataProviderError('openfda-ndc', 'unavailable', 'FDA product data is disabled.');
    const warnings: ProviderWarning[] = [];
    const sources: SourceStamp[] = [];
    const stages: DataMeta[] = [];
    let rxcui: string | undefined;
    const ndc = normalizeNdc11(term);
    if (!ndc) {
      try {
        const identity = await this.resolveIdentity(term);
        rxcui = identity.value;
        warnings.push(...identity.warnings);
        if (rxcui) {
          stages.push(identity.meta);
          sources.push({ source: 'rxnorm', url: `${this.config.rxNorm.baseUrl}/rxcui/${rxcui}/properties.json`, retrievedAt: identity.meta.retrievedAt });
        }
      } catch (error) { warnings.push(providerWarning('rxnorm', error)); }
    }
    const products = await this.cached(`products:${ndc ?? rxcui ?? 'name'}:${term.toLowerCase()}`, 'openfda-ndc', this.config.cache.productTtlMs, async () => {
      let rows: OpenFdaNdcRow[] = [];
      let primaryError: unknown;
      if (ndc || rxcui) {
        try { rows = ndc ? await this.openFda!.productsByNdc(ndc) : await this.openFda!.productsByRxCui(rxcui!); }
        catch (error) { primaryError = error; }
      }
      if (!rows.length && !ndc && !/^\d+$/.test(term)) {
        try { rows = await this.openFda!.searchNdc(term, 100); }
        catch (error) { throw primaryError ?? error; }
      }
      if (!rows.length) {
        if (primaryError) throw primaryError;
        throw new DataProviderError('openfda-ndc', 'not-found', `No FDA product records matched "${term}". Try an exact generic or brand name.`);
      }
      const selected = this.openFda!.selectIdentityRows(rows, term, rxcui);
      const warnings: ProviderWarning[] = selected.length < this.openFda!.finishedProducts(rows).length ? [{
        source: 'openfda-ndc', code: 'partial',
        message: 'Showing one matching finished-product ingredient group. Other formulations may exist; this does not imply interchangeability.'
      }] : [];
      return { rows: selected, warnings };
    });
    warnings.push(...products.warnings, ...products.value.warnings);
    stages.push(products.meta);
    const rows = products.value.rows;
    const product = this.openFda.normalizeProducts(rows);
    product.source.retrievedAt = products.meta.retrievedAt;
    sources.push(product.source);
    const genericName = rows[0]?.generic_name ?? rows[0]?.openfda?.generic_name?.[0] ?? term;
    const resolvedRxCui = rxcui ?? product.rxcui;

    let clinical: DrugClinical | undefined;
    if (options.includeClinical !== false) {
      try {
        const labels = await this.cached(`labels:${genericName.toLowerCase()}`, 'openfda-label', this.config.cache.clinicalTtlMs, () => this.openFda!.labelsByName(genericName));
        warnings.push(...labels.warnings);
        stages.push(labels.meta);
        const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
        const label = labels.value.find(candidate => {
          const identity = candidate?.openfda;
          return identity && (
            Array.isArray(identity.product_ndc) && identity.product_ndc.some((id: string) => product.productNdcs.includes(id)) ||
            Array.isArray(identity.rxcui) && resolvedRxCui && identity.rxcui.includes(resolvedRxCui) ||
            Array.isArray(identity.generic_name) && identity.generic_name.some((name: string) => typeof name === 'string' && normalizeName(name) === normalizeName(genericName))
          );
        });
        if (label) {
          clinical = this.openFda.normalizeLabel(label);
          const labelUrl = new URL(`${this.config.openFda.baseUrl}/drug/label.json`);
          labelUrl.searchParams.set('search', typeof label.set_id === 'string' ? `set_id:"${label.set_id}"` : `openfda.generic_name:"${genericName}"`);
          sources.push({ source: 'openfda-label', url: labelUrl.href, retrievedAt: labels.meta.retrievedAt, effectiveAt: typeof label.effective_time === 'string' ? label.effective_time : undefined, disclaimer: 'FDA label source text, not individualized medical advice or a complete pairwise interaction check.' });
        } else warnings.push({ source: 'openfda-label', code: 'not-found', message: 'FDA label information is unavailable for this product. Missing text does not imply safety.' });
      } catch (error) { warnings.push(providerWarning('openfda-label', error)); }
    }

    const drug: ClearDoseDrug = {
      identity: { id: resolvedRxCui ? `rxcui-${resolvedRxCui}` : `med-${slugify(genericName)}`, slug: slugify(genericName), rxcui: resolvedRxCui, genericName, brandNames: product.brandNames, ndcs: product.ndcs, productNdcs: product.productNdcs, applicationNumbers: product.applicationNumbers, splSetIds: product.splSetIds },
      variants: product.variants, forms: product.forms, strengths: product.strengths, routes: product.routes,
      activeIngredients: product.activeIngredients, manufacturers: product.manufacturers, pharmacologicClasses: product.pharmacologicClasses,
      clinical, prices: [], sources, warnings
    };
    if (options.includePrices !== false) {
      const tasks: Array<Promise<void>> = [];
      if (this.nadac) tasks.push((async () => {
        try {
          const result = await this.cached(`nadac:${product.ndcs.slice().sort().join(',')}:${quantity}`, 'nadac', this.config.cache.priceTtlMs, () => this.nadac!.getQuotesWithWarnings({ ndcs: product.ndcs, quantity }));
          drug.prices.push(...result.value.quotes); warnings.push(...result.warnings, ...result.value.warnings); stages.push(result.meta);
          if (!result.value.quotes.length) warnings.push({ source: 'nadac', code: 'not-found', message: 'No NADAC benchmark is available for the checked package NDCs. No retail price is implied.' });
        } catch (error) { warnings.push(providerWarning('nadac', error)); }
      })());
      if (this.medicare) tasks.push((async () => {
        try {
          const result = await this.cached(`medicare:${product.ndcs.slice().sort().join(',')}:${quantity}`, 'cms-part-d', this.config.cache.priceTtlMs, () => this.medicare!.getQuotes(product.ndcs, quantity));
          drug.prices.push(...result.value); warnings.push(...result.warnings); stages.push(result.meta);
        } catch (error) { warnings.push(providerWarning('cms-part-d', error)); }
      })());
      for (const provider of this.extraPriceProviders) tasks.push((async () => {
        try {
          const quotes = await provider.getQuotes({ drug: { ...drug, prices: [] }, quantity });
          if (!Array.isArray(quotes) || quotes.some(quote => !quote || !Number.isFinite(quote.amount) || quote.amount < 0 || !quote.source?.source || !quote.source.retrievedAt)) {
            throw new DataProviderError(provider.id, 'malformed-response', 'An optional price provider returned invalid quotes. Those quotes were omitted.');
          }
          drug.prices.push(...quotes);
        }
        catch (error) { warnings.push(providerWarning(provider.id, error)); }
      })());
      await Promise.all(tasks);
      drug.prices.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
      for (const quote of drug.prices) if (!sources.some(source => source.source === quote.source.source && source.url === quote.source.url && source.effectiveAt === quote.source.effectiveAt)) sources.push(quote.source);
    }
    if (options.includeAdverseEventSummary && resolvedRxCui) {
      try {
        const events = await this.cached(`events:${resolvedRxCui}`, 'openfda-event', this.config.cache.productTtlMs, () => this.openFda!.adverseEventSummary(resolvedRxCui));
        drug.reportedAdverseEvents = events.value; warnings.push(...events.warnings); stages.push(events.meta);
        sources.push({ source: 'openfda-event', url: `${this.config.openFda.baseUrl}/drug/event.json`, retrievedAt: events.meta.retrievedAt, disclaimer: 'FAERS counts are reports, not incidence rates or proof of causation.' });
      } catch (error) { warnings.push(providerWarning('openfda-event', error)); }
    }
    const aggregateMeta = stages.find(stage => stage.stale) ?? stages.find(stage => stage.origin === 'live') ?? products.meta;
    const expirations = stages.map(stage => Date.parse(stage.expiresAt ?? '')).filter(Number.isFinite);
    drug.dataMeta = {
      ...aggregateMeta,
      ...(expirations.length ? { expiresAt: new Date(Math.min(...expirations)).toISOString() } : {})
    };
    drug.warnings = uniqueWarnings([...warnings, ...this.cacheWarnings()]);
    return drug;
  }

  async getInteractions(query: string): Promise<string[]> {
    return (await this.getDrug(query, { includeClinical: true, includePrices: false })).clinical?.drugInteractions ?? [];
  }
  async getSideEffects(query: string): Promise<string[]> {
    return (await this.getDrug(query, { includeClinical: true, includePrices: false })).clinical?.adverseReactions ?? [];
  }
  async getWarnings(query: string): Promise<{ boxedWarnings: string[]; warnings: string[]; contraindications: string[] }> {
    const clinical = (await this.getDrug(query, { includeClinical: true, includePrices: false })).clinical;
    return { boxedWarnings: clinical?.boxedWarnings ?? [], warnings: clinical?.warnings ?? [], contraindications: clinical?.contraindications ?? [] };
  }
  async getIndications(query: string): Promise<string[]> {
    return (await this.getDrug(query, { includeClinical: true, includePrices: false })).clinical?.indications ?? [];
  }
  async getReportedAdverseEvents(query: string) {
    return (await this.getDrug(query, { includeClinical: false, includePrices: false, includeAdverseEventSummary: true })).reportedAdverseEvents ?? [];
  }
  async getPrices(query: string, quantity = 30): Promise<DrugPriceQuote[]> {
    return (await this.getDrug(query, { includeClinical: false, includePrices: true, quantity })).prices;
  }
  async compare(queries: string[], options: GetDrugOptions = {}): Promise<CompareResult> {
    const uniqueQueries = uniq(queries);
    const results = await Promise.allSettled(uniqueQueries.map(query => this.getDrug(query, options)));
    return {
      drugs: results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []),
      unavailable: results.flatMap((result, index) => result.status === 'rejected' ? [{ query: uniqueQueries[index]!, warning: providerWarning('openfda-ndc', result.reason) }] : []),
      generatedAt: new Date().toISOString()
    };
  }
  async sourceStatus() {
    return {
      rxnorm: { enabled: Boolean(this.rxNorm), mode: 'live' as const },
      openfda: { enabled: Boolean(this.openFda), mode: 'live' as const },
      nadac: { enabled: Boolean(this.nadac), mode: 'live-query' as const, datasetId: this.nadac ? await this.nadac.discoverDatasetId().catch(() => undefined) : undefined },
      medicare: { enabled: Boolean(this.medicare), mode: 'local-index' as const },
      cache: { enabled: this.config.cache.enabled, degraded: this.cache instanceof ResilientCache && this.cache.degraded }
    };
  }
}
