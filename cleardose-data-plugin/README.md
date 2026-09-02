# ClearDose Data Plugin

A small encapsulated data boundary for the ClearDose Vue/Pinia/WebMCP app.

It replaces direct imports of demo medication JSON with one service:

```ts
clearDose.search('omeprazole')
clearDose.getDrug('omeprazole', { quantity: 30 })
clearDose.getPrices('omeprazole', 30)
clearDose.compare(['omeprazole', 'famotidine'])
```

## Providers

| Provider | Mode | Purpose |
|---|---|---|
| RxNorm / RxNav | live | normalize a drug name to RxCUI |
| openFDA NDC | live | product identity, dosage forms, routes, NDC/package identifiers |
| openFDA labeling | live | indications, warnings, contraindications, adverse reactions, label interaction text |
| openFDA FAERS | optional live | reported adverse-event counts; not incidence or causality |
| CMS Medicaid NADAC | live query + cache | public pharmacy acquisition-cost benchmark |
| CMS Medicare Part D | optional local index | plan-level public-use unit-cost context |

**NADAC is not a cash price or insured copay.** The canonical model keeps it as `kind: 'nadac-benchmark'` so UI/WebMCP consumers cannot accidentally treat every number as the same kind of price.

## Drop into the current Vue app

Copy `src/` into e.g. `src/plugins/cleardose-data/`, or keep it as a workspace package.

```ts
import { createClearDoseDataPlugin } from '@/plugins/cleardose-data';

export const clearDosePlugin = createClearDoseDataPlugin({
  openFda: {
    apiKey: import.meta.env.VITE_OPENFDA_API_KEY ?? ''
  },
  nadac: {
    datasetId: 'auto'
  }
});

app.use(clearDosePlugin as any);
```

Then your stores call `clearDosePlugin.data` rather than importing the demo DB.

```ts
const drugs = await clearDosePlugin.data.search('metformin');
const drug = await clearDosePlugin.data.getDrug('metformin', { quantity: 60 });
```

## WebMCP

Current WebMCP imperative tools are registered on `document.modelContext` and use AbortSignal-driven unregistration.

```ts
const registration = clearDosePlugin.registerWebMCP();

// when the tool-owning page/scope unmounts:
registration.unregister();
```

Registered tools:

- `cleardose_search_drugs`
- `cleardose_get_drug`
- `cleardose_get_drug_prices`
- `cleardose_get_drug_interactions`
- `cleardose_get_drug_side_effects`
- `cleardose_get_drug_warnings`
- `cleardose_get_drug_indications`
- `cleardose_get_reported_adverse_events`
- `cleardose_compare_drugs`
- `cleardose_data_sources`

All are read-only and call the exact same service as the human UI.

## Compatibility with the existing demo DB

`src/legacy/` deliberately mirrors the existing top-level ClearDose JSON shape:

```text
medications -> skus -> offers -> pharmacies
```

Use it as a migration bridge:

```ts
import { createLegacyCatalogAdapter } from '@/plugins/cleardose-data/legacy';

const db = await createLegacyCatalogAdapter(clearDosePlugin.data).buildDatabase([
  { drug: 'atorvastatin', category: 'cholesterol' },
  { drug: 'metformin', category: 'diabetes' }
]);

catalogStore.replaceDatabase(db);
```

The generated medication records contain a `publicData` field with the full canonical object. Existing components can keep reading `genericName`, `forms`, `strengths`, etc. while new panels move to the richer normalized data.

### Existing offers are not replaceable with a free live cash-price API

The old JSON has fictional pharmacy offers. Public NADAC data cannot truthfully replace them as retail offers. Therefore `includeBenchmarkOffers` defaults to false.

If you temporarily need the old offer-card rendering path:

```ts
const db = await adapter.buildDatabase(seed, {
  includeBenchmarkOffers: true
});
```

This creates a **non-purchasable** synthetic `NADAC Public Benchmark` source with `priceKind: 'nadac-benchmark'` and an explicit disclaimer. Update the card label before enabling it.


## Optional pricing providers

The service has an extension point for future retail/cash-price APIs, PBM data, plan-specific APIs, or your own backend. Add a provider without changing Vue, Pinia, the normalized model, or WebMCP tools:

```ts
const clearDose = createClearDoseDataPlugin(config, {
  priceProviders: [myCashPriceProvider]
});
```

During migration you can keep your existing fictional ClearDose offer data beside the real FDA/NADAC data, explicitly labeled as demo:

```ts
import demoDb from '@/data/cleardose-demo-db.json';
import { LegacyDemoCashPriceProvider } from '@/plugins/cleardose-data';

const clearDose = createClearDoseDataPlugin(config, {
  priceProviders: [new LegacyDemoCashPriceProvider(demoDb)]
});
```

Remove that provider when you no longer want demo price quotes.

## Caching

The package uses native IndexedDB in a browser and falls back to memory elsewhere. No cache dependency is required. You can inject your own cache adapter if your app already has one.

```ts
const plugin = createClearDoseDataPlugin(config, { cache: myExistingCacheAdapter });
```

The adapter only needs:

```ts
interface ClearDoseCache {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}
```

## NADAC dataset rollover

Do not permanently hard-code a yearly distribution id. `NadacProvider` discovers the current calendar-year dataset from the Medicaid metastore. You can override it if necessary.

```ts
nadac: {
  datasetId: 'auto',
  year: 2026
}
```

Run:

```bash
node scripts/discover-data-sources.mjs
```

to inspect current public-source metadata.

## Medicare Part D

The quarterly Medicare plan pricing public-use file is deliberately **not downloaded in the browser**. It is large and consists of multiple pipe-delimited files. Preprocess the subset you need into:

```text
/public/data/cleardose/medicare-prices.json
```

The plugin will load that compact local index when:

```ts
medicare: {
  enabled: true,
  localIndexUrl: '/data/cleardose/medicare-prices.json'
}
```

The expected format is shown in `public/data/cleardose/medicare-prices.example.json`.

## Recommended migration

1. Add this module without deleting demo JSON.
2. Switch **search** to `data.search()`.
3. Switch **drug detail** to `data.getDrug()`.
4. Add a pricing-card discriminator (`price.kind`).
5. Show `nadac-benchmark` in a benchmark card, not as a cash pharmacy offer.
6. Switch compare to `data.compare()`.
7. Register WebMCP tools from the same service.
8. Delete the old drug demo catalog after all screens use the service.
9. Keep fictional cash-price fixtures only as explicitly marked demo fixtures until a licensed/current retail-price provider is available.

## Medical-data UI rules

- Label FDA label information as source/reference data, not personalized medical advice.
- Label FAERS counts as reported events, not incidence and not proof of causation.
- Label NADAC as a pharmacy acquisition-cost benchmark.
- Do not call CMS gross spending or plan unit-cost data a guaranteed patient copay.
