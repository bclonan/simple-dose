import { createClearDoseDataPlugin } from '../../cleardose-data-plugin/src/plugin'
import { LegacyDemoCashPriceProvider } from '../../cleardose-data-plugin/src/providers/demo-cash'
import { demoDatabase } from '../data'

// One application instance. Public endpoints require no embedded credentials.
export const clearDose = createClearDoseDataPlugin({
  openFda: { enabled: true },
  rxNorm: { enabled: true },
  nadac: { enabled: true },
  medicare: { enabled: false },
  request: { timeoutMs: 6500, retries: 0 },
  cache: { enabled: true, databaseName: 'cleardose-public-v1' },
}, { priceProviders: [new LegacyDemoCashPriceProvider(demoDatabase)] })

// Exact fixture IDs are a compatibility contract for saved carts and demos.
export const demoCatalog = demoDatabase
