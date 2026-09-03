import type { AdverseEventReaction, DrugClinical, DrugProductVariant, DrugSearchHit, SourceStamp } from '../types';
import { getJson, HttpError, type HttpOptions } from '../utils/http';
import { asStringArray, slugify, uniq } from '../utils/text';
import { normalizeManyNdcs } from '../utils/ndc';
import { DataProviderError } from '../types';

interface FdaResponse<T> { results?: T[] }

export interface OpenFdaLabel {
  set_id?: string;
  effective_time?: string;
  openfda?: { generic_name?: string[]; brand_name?: string[]; product_ndc?: string[]; rxcui?: string[] };
  [key: string]: unknown;
}

const clinicalFields = ['indications_and_usage', 'contraindications', 'warnings', 'warnings_and_cautions', 'boxed_warning',
  'adverse_reactions', 'drug_interactions', 'clinical_pharmacology', 'pregnancy', 'pediatric_use', 'geriatric_use', 'dosage_and_administration'];
const escapeSearch = (value: string) => value.replace(/([\\"])/g, '\\$1');
export const labelSetLimit = 12;
export const validLabelSetIds = (ids: string[]): string[] => uniq(ids).filter(id => /^[a-zA-Z0-9-]{1,128}$/.test(id)).sort();

export interface OpenFdaNdcRow {
  product_ndc?: string;
  brand_name?: string;
  generic_name?: string;
  dosage_form?: string;
  route?: string[];
  active_ingredients?: Array<{ name?: string; strength?: string }>;
  labeler_name?: string;
  marketing_category?: string;
  product_type?: string;
  pharm_class?: string[];
  application_number?: string;
  packaging?: Array<{ package_ndc?: string }>;
  openfda?: {
    rxcui?: string[];
    spl_set_id?: string[];
    pharm_class_epc?: string[];
    route?: string[];
    brand_name?: string[];
    generic_name?: string[];
  };
}

export class OpenFdaProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey = '',
    private readonly http: HttpOptions = {}
  ) {}

  private auth() { return this.apiKey ? { api_key: this.apiKey } : {}; }

  private async query<T>(endpoint: string, params: Record<string, string | number | boolean | undefined>) {
    try {
      const response = await getJson<FdaResponse<T>>(`${this.baseUrl}${endpoint}`, { ...this.auth(), ...params }, this.http);
      if (!response || !Array.isArray(response.results)) throw new DataProviderError(endpoint.includes('/label') ? 'openfda-label' : 'openfda-ndc', 'malformed-response', 'openFDA returned an invalid record list.');
      return response;
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return { results: [] } as FdaResponse<T>;
      throw error;
    }
  }

  async searchNdc(term: string, limit = 20): Promise<OpenFdaNdcRow[]> {
    const escaped = term.replace(/([\\"])/g, '\\$1');
    const prefix = term.replace(/[^\p{L}\p{N} -]/gu, ' ').trim().replace(/\s+/g, ' ');
    if (!prefix) return [];
    const wildcard = prefix.split(' ').map(word => word.replace(/-/g, '\\-')).join(' AND ');
    const names = `(brand_name:"${escaped}") OR (generic_name:"${escaped}") OR (brand_name:(${wildcard}*)) OR (generic_name:(${wildcard}*))`;
    // Exclude raw ingredients before pagination, so they cannot crowd finished
    // products out of the first result page. Keep the client filter as a guard.
    const finished = ['product_type', 'marketing_category'].flatMap(field => [
      `NOT ${field}:"BULK INGREDIENT"`, `NOT ${field}:"FOR FURTHER PROCESSING"`
    ]).join(' AND ');
    const search = `(${names}) AND ${finished}`;
    const data = await this.query<OpenFdaNdcRow>('/drug/ndc.json', { search, limit: Math.min(limit, 100) });
    const normalizeName = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const wanted = normalizeName(term);
    return this.finishedProducts(this.validProducts(data.results ?? [])).filter(row =>
      [row.generic_name, row.brand_name, ...(row.openfda?.generic_name ?? []), ...(row.openfda?.brand_name ?? [])]
        .some(name => name && normalizeName(name).startsWith(wanted)));
  }

  async productsByRxCui(rxcui: string, limit = 100): Promise<OpenFdaNdcRow[]> {
    const data = await this.query<OpenFdaNdcRow>('/drug/ndc.json', {
      search: `openfda.rxcui:"${rxcui}"`,
      limit: Math.min(limit, 100)
    });
    return this.validProducts(data.results ?? []);
  }

  async labelsBySetIds(setIds: string[]): Promise<OpenFdaLabel[]> {
    const ids = validLabelSetIds(setIds).slice(0, labelSetLimit);
    if (!ids.length) return [];
    const data = await this.query<OpenFdaLabel>('/drug/label.json', {
      search: ids.map(id => `set_id:"${id}"`).join(' OR '), sort: 'effective_time:desc', limit: 1
    });
    return this.validLabels(data.results ?? []);
  }

  async labelsByName(name: string, limit = 1): Promise<OpenFdaLabel[]> {
    // The .exact fields are case-sensitive. Try the source spelling and common
    // harmonized cases without admitting combination names containing this drug.
    const names = uniq([name.trim(), name.trim().toUpperCase(), name.trim().toLowerCase()]);
    const search = names.flatMap(value => ['generic_name', 'brand_name'].map(field => `openfda.${field}.exact:"${escapeSearch(value)}"`)).join(' OR ');
    const data = await this.query<OpenFdaLabel>('/drug/label.json', {
      search, sort: 'effective_time:desc', limit: Math.min(5, Math.max(1, limit))
    });
    return this.validLabels(data.results ?? []);
  }

  private validLabels(rows: OpenFdaLabel[]): OpenFdaLabel[] {
    const stringList = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string');
    if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row) ||
      (row.set_id !== undefined && (typeof row.set_id !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(row.set_id))) ||
      (row.effective_time !== undefined && (typeof row.effective_time !== 'string' || !/^\d{8}$/.test(row.effective_time))) ||
      (row.openfda !== undefined && (!row.openfda || typeof row.openfda !== 'object' || Array.isArray(row.openfda) ||
        ['generic_name', 'brand_name', 'product_ndc', 'rxcui'].some(field => row.openfda?.[field as keyof NonNullable<OpenFdaLabel['openfda']>] !== undefined && !stringList(row.openfda[field as keyof NonNullable<OpenFdaLabel['openfda']>])))) ||
      clinicalFields.some(field => row[field] !== undefined && typeof row[field] !== 'string' && !stringList(row[field])))) {
      throw new DataProviderError('openfda-label', 'malformed-response', 'FDA returned an invalid label record or clinical section. No text was inferred.');
    }
    return rows.slice().sort((left, right) => (right.effective_time ?? '').localeCompare(left.effective_time ?? '') || (left.set_id ?? '').localeCompare(right.set_id ?? ''));
  }

  async productsByNdc(ndc: string): Promise<OpenFdaNdcRow[]> {
    const digits = ndc.replace(/\D/g, '');
    if (!/^\d{11}$/.test(digits)) return [];
    const packages = [
      `${digits.slice(0, 5)}-${digits.slice(5, 9)}-${digits.slice(9)}`,
      ...(digits[0] === '0' ? [`${digits.slice(1, 5)}-${digits.slice(5, 9)}-${digits.slice(9)}`] : []),
      ...(digits[5] === '0' ? [`${digits.slice(0, 5)}-${digits.slice(6, 9)}-${digits.slice(9)}`] : []),
      ...(digits[9] === '0' ? [`${digits.slice(0, 5)}-${digits.slice(5, 9)}-${digits.slice(10)}`] : [])
    ];
    const data = await this.query<OpenFdaNdcRow>('/drug/ndc.json', {
      search: packages.map(value => `packaging.package_ndc:"${value}"`).join(' OR '), limit: 100
    });
    return this.validProducts(data.results ?? []);
  }

  async adverseEventSummary(rxcui: string, limit = 20): Promise<AdverseEventReaction[]> {
    try {
      const target = new URL(`${this.baseUrl}/drug/event.json`);
      if (this.apiKey) target.searchParams.set('api_key', this.apiKey);
      target.searchParams.set('search', `patient.drug.openfda.rxcui:"${rxcui}"`);
      target.searchParams.set('count', 'patient.reaction.reactionmeddrapt.exact');
      target.searchParams.set('limit', String(limit));
      const data = await getJson<{ results?: Array<{ term: string; count: number }> }>(target.toString(), {}, this.http);
      if (!Array.isArray(data?.results) || data.results.some(x => typeof x?.term !== 'string' || typeof x?.count !== 'number')) {
        throw new DataProviderError('openfda-event', 'malformed-response', 'openFDA returned an invalid adverse-event summary.');
      }
      return (data.results ?? []).map(x => ({ reaction: x.term, reports: x.count }));
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return [];
      throw error;
    }
  }

  private validProducts(rows: OpenFdaNdcRow[]): OpenFdaNdcRow[] {
    if (rows.some(row => !row || typeof row !== 'object' ||
      (row.generic_name !== undefined && typeof row.generic_name !== 'string') ||
      (row.brand_name !== undefined && typeof row.brand_name !== 'string') ||
      (row.active_ingredients !== undefined && !Array.isArray(row.active_ingredients)) ||
      (row.packaging !== undefined && !Array.isArray(row.packaging)))) {
      throw new DataProviderError('openfda-ndc', 'malformed-response', 'openFDA returned an invalid product record.');
    }
    return rows;
  }

  /** Bulk ingredient and further-processing entries are not finished medicines. */
  finishedProducts(rows: OpenFdaNdcRow[]): OpenFdaNdcRow[] {
    return rows.filter(row => !/BULK INGREDIENT|FOR FURTHER PROCESSING/i.test(`${row.marketing_category ?? ''} ${row.product_type ?? ''}`));
  }

  /** Keep one generic/ingredient identity, never merge unrelated search matches. */
  selectIdentityRows(rows: OpenFdaNdcRow[], term: string, rxcui?: string): OpenFdaNdcRow[] {
    const normalized = (value: string) => value.trim().toLowerCase().replace(/\bhcl\b/g, 'hydrochloride').replace(/\s+/g, ' ');
    const groups = new Map<string, OpenFdaNdcRow[]>();
    const finished = this.finishedProducts(rows);
    if (rows.length && !finished.length) throw new DataProviderError('openfda-ndc', 'unavailable', 'Only bulk ingredient records matched. Finished medication product information is unavailable.');
    for (const row of finished) {
      const generic = normalized(row.generic_name ?? row.openfda?.generic_name?.[0] ?? row.brand_name ?? '');
      const ingredients = uniq((row.active_ingredients ?? []).map(i => i.name ? normalized(i.name) : undefined)).sort().join('|');
      const key = `${generic}::${ingredients}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    if (groups.size <= 1) return [...groups.values()][0] ?? [];
    const name = normalized(term);
    const candidates = [...groups.values()];
    const byName = candidates.filter(group => group.some(row =>
      [row.generic_name, row.brand_name].some(value => value && normalized(value) === name)));
    const byIngredient = [...groups.values()].filter(group => group.some(row => {
      const generic = normalized(row.generic_name ?? row.openfda?.generic_name?.[0] ?? '');
      const ingredient = row.active_ingredients?.length === 1 ? row.active_ingredients[0]?.name : undefined;
      return generic.startsWith(name) && ingredient && normalized(ingredient) === generic;
    }));
    const exactIngredient = byIngredient.filter(group => group.some(row => normalized(row.generic_name ?? '') === name));
    if (exactIngredient.length === 1) return exactIngredient[0] ?? [];
    if (byIngredient.length === 1) return byIngredient[0] ?? [];
    if (byName.length === 1) return byName[0] ?? [];
    // Select a representative source group, not a merged chemical identity.
    // A unique largest group of matching finished products is deterministic;
    // tied identities remain ambiguous and the service reports omitted groups.
    const byPrefix = candidates.filter(group => group.some(row => {
      const generic = normalized(row.generic_name ?? '');
      return generic === name || generic.startsWith(`${name} `);
    }));
    const ranked = (byName.length ? byName : byPrefix).slice().sort((a, b) => b.length - a.length);
    if (ranked[0] && (!ranked[1] || ranked[0].length > ranked[1].length)) return ranked[0];
    const byIdentity = rxcui ? [...groups.values()].filter(group => group.some(row => row.openfda?.rxcui?.includes(rxcui))) : [];
    if (byIdentity.length === 1) return byIdentity[0] ?? [];
    throw new DataProviderError('openfda-ndc', 'ambiguous', 'Several different finished-product ingredient groups matched. Search a more specific generic or brand name before opening drug details.');
  }

  toSearchHit(rows: OpenFdaNdcRow[]): DrugSearchHit[] {
    const groups = new Map<string, OpenFdaNdcRow[]>();
    for (const row of rows) {
      const generic = row.generic_name ?? row.openfda?.generic_name?.[0] ?? row.brand_name ?? 'Unknown drug';
      const key = generic.toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.values()].map(group => {
      const first = group[0];
      if (!first) throw new DataProviderError('openfda-ndc', 'malformed-response', 'An empty FDA product group was returned.');
      const genericName = first.generic_name ?? first.openfda?.generic_name?.[0] ?? first.brand_name ?? 'Unknown drug';
      const ndcs = normalizeManyNdcs(group.flatMap(row => row.packaging?.map(p => p.package_ndc ?? '') ?? []));
      const strengths = uniq(group.flatMap(row => row.active_ingredients?.map(i => i.strength) ?? []));
      return {
        id: first.openfda?.rxcui?.[0] ? `rxcui-${first.openfda.rxcui[0]}` : `med-${slugify(genericName)}`,
        slug: slugify(genericName),
        genericName,
        brandNames: uniq(group.flatMap(row => [row.brand_name, ...(row.openfda?.brand_name ?? [])])),
        forms: uniq(group.map(row => row.dosage_form)),
        strengths,
        rxcui: first.openfda?.rxcui?.[0],
        ndcs,
        source: 'openfda-ndc'
      };
    });
  }

  normalizeProducts(rows: OpenFdaNdcRow[]) {
    const variants: DrugProductVariant[] = rows.map(row => ({
      productNdc: row.product_ndc,
      packageNdcs: normalizeManyNdcs(row.packaging?.map(p => p.package_ndc ?? '') ?? []),
      brandName: row.brand_name,
      genericName: row.generic_name,
      dosageForm: row.dosage_form,
      route: uniq([...(row.route ?? []), ...(row.openfda?.route ?? [])]),
      activeIngredients: (row.active_ingredients ?? []).map(i => ({ name: i.name ?? '', strength: i.strength })).filter(i => i.name),
      labelerName: row.labeler_name,
      marketingCategory: row.marketing_category
    }));

    const source: SourceStamp = {
      source: 'openfda-ndc',
      url: `${this.baseUrl}/drug/ndc.json`,
      retrievedAt: new Date().toISOString(),
      disclaimer: 'NDC listing does not itself indicate FDA approval or reimbursement eligibility.'
    };

    return {
      variants,
      forms: uniq(rows.map(r => r.dosage_form)),
      strengths: uniq(rows.flatMap(r => r.active_ingredients?.map(i => i.strength) ?? [])),
      routes: uniq(rows.flatMap(r => [...(r.route ?? []), ...(r.openfda?.route ?? [])])),
      activeIngredients: uniq(rows.flatMap(r => r.active_ingredients?.map(i => i.name) ?? [])),
      manufacturers: uniq(rows.map(r => r.labeler_name)),
      pharmacologicClasses: uniq(rows.flatMap(r => [...(r.pharm_class ?? []), ...(r.openfda?.pharm_class_epc ?? [])])),
      brandNames: uniq(rows.flatMap(r => [r.brand_name, ...(r.openfda?.brand_name ?? [])])),
      productNdcs: uniq(rows.map(r => r.product_ndc)),
      ndcs: normalizeManyNdcs(rows.flatMap(r => r.packaging?.map(p => p.package_ndc ?? '') ?? [])),
      applicationNumbers: uniq(rows.map(r => r.application_number)),
      splSetIds: uniq(rows.flatMap(r => r.openfda?.spl_set_id ?? [])),
      rxcui: rows.flatMap(r => r.openfda?.rxcui ?? [])[0],
      source
    };
  }

  normalizeLabel(label: OpenFdaLabel): DrugClinical {
    return {
      indications: asStringArray(label?.indications_and_usage),
      contraindications: asStringArray(label?.contraindications),
      warnings: uniq([...asStringArray(label?.warnings), ...asStringArray(label?.warnings_and_cautions)]),
      boxedWarnings: asStringArray(label?.boxed_warning),
      adverseReactions: asStringArray(label?.adverse_reactions),
      drugInteractions: asStringArray(label?.drug_interactions),
      clinicalPharmacology: asStringArray(label?.clinical_pharmacology),
      pregnancy: asStringArray(label?.pregnancy),
      pediatricUse: asStringArray(label?.pediatric_use),
      geriatricUse: asStringArray(label?.geriatric_use),
      dosageAndAdministration: asStringArray(label?.dosage_and_administration)
    };
  }
}
