# Drop-in checklist for the existing ClearDose app

## 1. Copy the module

Copy this repo's `src/` folder into:

```text
src/plugins/cleardose-data/
```

No runtime package is required.

## 2. Create one app singleton

```ts
// src/plugins/cleardose.ts
import { createClearDoseDataPlugin } from './cleardose-data';

export const clearDose = createClearDoseDataPlugin({
  openFda: {
    apiKey: import.meta.env.VITE_OPENFDA_API_KEY ?? ''
  },
  nadac: {
    datasetId: 'auto'
  }
});
```

## 3. Install it with Vue

```ts
// src/main.ts
import { clearDose } from '@/plugins/cleardose';

app.use(clearDose as any);
```

## 4. Replace the demo catalog import

Before:

```ts
import db from '@/data/cleardose-demo-db.json';
```

Bridge version:

```ts
import { createLegacyCatalogAdapter } from '@/plugins/cleardose-data';
import { clearDose } from '@/plugins/cleardose';

const catalog = createLegacyCatalogAdapter(clearDose.data);

const db = await catalog.buildDatabase([
  { drug: 'atorvastatin', category: 'cholesterol' },
  { drug: 'metformin', category: 'diabetes' },
  { drug: 'lisinopril', category: 'blood-pressure' },
  { drug: 'amlodipine', category: 'blood-pressure' },
  { drug: 'sertraline', category: 'mental-health' },
  { drug: 'omeprazole', category: 'acid-reflux' }
]);
```

This keeps the same `medications`, `skus`, `offers`, and `pharmacies` top-level arrays while you migrate components.

## 5. Switch search to live query

```ts
const results = await clearDose.data.search(searchText, { limit: 25 });
```

Do not pre-download the entire FDA catalog into the browser.

## 6. Drug details

```ts
const drug = await clearDose.data.getDrug('omeprazole', {
  quantity: 30,
  includeClinical: true,
  includePrices: true,
  includeAdverseEventSummary: true
});
```

## 7. Register WebMCP tools

```ts
// register only while the owning app/page is active
const registration = clearDose.registerWebMCP();

// on teardown
registration.unregister();
```

The tools call the same data service used by Vue/Pinia, so there is no duplicate agent-only implementation.

## 8. Pricing UI

Render by discriminator:

```ts
switch (price.kind) {
  case 'nadac-benchmark':
    // label: Public acquisition benchmark
    break;
  case 'medicare-plan-unit-cost':
    // label: Medicare plan-level public pricing context
    break;
  case 'cash':
    // only use when a real retail/cash provider is connected
    break;
}
```

Never label `nadac-benchmark` as `cash price`.
