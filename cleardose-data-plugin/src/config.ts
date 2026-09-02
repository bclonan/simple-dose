export interface ClearDosePluginConfig {
  openFda?: {
    enabled?: boolean;
    apiKey?: string;
    baseUrl?: string;
  };
  rxNorm?: {
    enabled?: boolean;
    baseUrl?: string;
  };
  nadac?: {
    enabled?: boolean;
    baseUrl?: string;
    datasetId?: string | 'auto';
    year?: number;
  };
  medicare?: {
    enabled?: boolean;
    localIndexUrl?: string;
  };
  cache?: {
    enabled?: boolean;
    databaseName?: string;
    defaultTtlMs?: number;
    searchTtlMs?: number;
    productTtlMs?: number;
    identityTtlMs?: number;
    clinicalTtlMs?: number;
    priceTtlMs?: number;
  };
  request?: {
    timeoutMs?: number;
    retries?: number;
  };
}

export interface ResolvedClearDosePluginConfig {
  openFda: Required<NonNullable<ClearDosePluginConfig['openFda']>>;
  rxNorm: Required<NonNullable<ClearDosePluginConfig['rxNorm']>>;
  nadac: Required<NonNullable<ClearDosePluginConfig['nadac']>>;
  medicare: Required<NonNullable<ClearDosePluginConfig['medicare']>>;
  cache: Required<NonNullable<ClearDosePluginConfig['cache']>>;
  request: Required<NonNullable<ClearDosePluginConfig['request']>>;
}

export const defaultConfig: ResolvedClearDosePluginConfig = {
  openFda: {
    enabled: true,
    apiKey: '',
    baseUrl: 'https://api.fda.gov'
  },
  rxNorm: {
    enabled: true,
    baseUrl: 'https://rxnav.nlm.nih.gov/REST'
  },
  nadac: {
    enabled: true,
    baseUrl: 'https://data.medicaid.gov',
    datasetId: 'auto',
    year: new Date().getFullYear()
  },
  medicare: {
    enabled: false,
    localIndexUrl: '/data/cleardose/medicare-prices.json'
  },
  cache: {
    enabled: true,
    databaseName: 'cleardose-data-cache',
    defaultTtlMs: 24 * 60 * 60 * 1000,
    searchTtlMs: 24 * 60 * 60 * 1000,
    productTtlMs: 24 * 60 * 60 * 1000,
    identityTtlMs: 30 * 24 * 60 * 60 * 1000,
    clinicalTtlMs: 7 * 24 * 60 * 60 * 1000,
    priceTtlMs: 7 * 24 * 60 * 60 * 1000
  },
  request: {
    timeoutMs: 12_000,
    retries: 1
  }
};

export function resolveConfig(input: ClearDosePluginConfig = {}): ResolvedClearDosePluginConfig {
  const ttlOverride = input.cache?.defaultTtlMs;
  return {
    openFda: { ...defaultConfig.openFda, ...input.openFda },
    rxNorm: { ...defaultConfig.rxNorm, ...input.rxNorm },
    nadac: { ...defaultConfig.nadac, ...input.nadac },
    medicare: { ...defaultConfig.medicare, ...input.medicare },
    cache: {
      ...defaultConfig.cache,
      ...(ttlOverride === undefined ? {} : {
        searchTtlMs: ttlOverride, productTtlMs: ttlOverride, identityTtlMs: ttlOverride,
        clinicalTtlMs: ttlOverride, priceTtlMs: ttlOverride
      }),
      ...input.cache
    },
    request: { ...defaultConfig.request, ...input.request }
  };
}
