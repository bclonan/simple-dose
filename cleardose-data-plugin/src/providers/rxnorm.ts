import { getJson, type HttpOptions } from '../utils/http';
import { DataProviderError } from '../types';

interface RxCuiResponse { idGroup?: { rxnormId?: string[] } }
interface ApproxResponse { approximateGroup?: { candidate?: Array<{ rxcui?: string; score?: string; rank?: string; name?: string }> } }

export class RxNormProvider {
  constructor(private readonly baseUrl: string, private readonly http: HttpOptions = {}) {}

  async findRxCui(name: string): Promise<string | undefined> {
    const data = await getJson<RxCuiResponse>(`${this.baseUrl}/rxcui.json`, { name, search: 2 }, this.http);
    if (!data || typeof data !== 'object' || (data.idGroup?.rxnormId !== undefined && !Array.isArray(data.idGroup.rxnormId))) {
      throw new DataProviderError('rxnorm', 'malformed-response', 'RxNorm returned an invalid identity response.');
    }
    return data.idGroup?.rxnormId?.[0];
  }

  async getName(rxcui: string): Promise<string | undefined> {
    const data = await getJson<{ properties?: { name?: string } }>(`${this.baseUrl}/rxcui/${encodeURIComponent(rxcui)}/properties.json`, {}, this.http);
    const name = data?.properties?.name;
    if (name !== undefined && typeof name !== 'string') throw new DataProviderError('rxnorm', 'malformed-response', 'RxNorm returned an invalid concept name.');
    return name;
  }

  async approximate(term: string, maxEntries = 8) {
    const data = await getJson<ApproxResponse>(`${this.baseUrl}/approximateTerm.json`, {
      term,
      maxEntries,
      option: 1
    }, this.http);
    if (!data || typeof data !== 'object' || (data.approximateGroup?.candidate !== undefined && !Array.isArray(data.approximateGroup.candidate))) {
      throw new DataProviderError('rxnorm', 'malformed-response', 'RxNorm returned an invalid approximate-match response.');
    }
    return data.approximateGroup?.candidate ?? [];
  }
}
