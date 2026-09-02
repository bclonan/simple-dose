import type { ClearDoseCache } from './cache/cache';
import type { DrugPriceProvider } from './providers/types';
import type { ClearDosePluginConfig } from './config';
import { ClearDoseDataService } from './service';
import { registerClearDoseWebMcpTools } from './webmcp';

export const CLEARDoseKey = Symbol.for('cleardose:data');

export interface VueLikeApp {
  provide(key: symbol, value: unknown): void;
  config?: { globalProperties?: Record<string, unknown> };
}

export interface ClearDoseRuntimeOptions {
  cache?: ClearDoseCache;
  priceProviders?: DrugPriceProvider[];
}

export function createClearDoseDataPlugin(config: ClearDosePluginConfig = {}, runtime: ClearDoseRuntimeOptions = {}) {
  const data = new ClearDoseDataService(config, runtime.cache, runtime.priceProviders ?? []);

  return {
    data,
    install(app: VueLikeApp) {
      app.provide(CLEARDoseKey, data);
      if (app.config?.globalProperties) app.config.globalProperties.$clearDose = data;
    },
    registerWebMCP(options?: { prefix?: string }) {
      return registerClearDoseWebMcpTools(data, options);
    }
  };
}
