# Migration from `cleardose-demo-db.json`

Your current catalog shape is already a reasonable UI DTO. Keep it temporarily and replace its source behind the store.

## Current fields preserved

Medication:

```ts
id
slug
genericName
brandNames
category
rxRequired
displaySummary
forms
strengths
quantityOptions
searchTerms
```

SKU:

```ts
id
medicationId
form
strength
quantity
unit
rxRequired
```

The compatibility adapter emits those same fields and adds `publicData` to the medication. Unknown extra fields are safe for existing components to ignore.

## Recommended store change

Before:

```ts
import db from '@/data/cleardose-demo-db.json';

state: () => ({
  medications: db.medications,
  skus: db.skus,
  offers: db.offers,
  pharmacies: db.pharmacies
})
```

After:

```ts
import { clearDosePlugin } from '@/plugins/cleardose';
import { createLegacyCatalogAdapter } from '@/plugins/cleardose-data/legacy';

const adapter = createLegacyCatalogAdapter(clearDosePlugin.data);

state: () => ({
  medications: [],
  skus: [],
  offers: [],
  pharmacies: [],
  hydrated: false
}),

actions: {
  async hydratePublicCatalog() {
    const db = await adapter.buildDatabase([
      { drug: 'atorvastatin', category: 'cholesterol' },
      { drug: 'metformin', category: 'diabetes' },
      { drug: 'lisinopril', category: 'blood-pressure' },
      { drug: 'amlodipine', category: 'blood-pressure' },
      { drug: 'sertraline', category: 'mental-health' },
      { drug: 'omeprazole', category: 'acid-reflux' }
    ]);

    this.medications = db.medications;
    this.skus = db.skus;
    this.offers = db.offers;
    this.pharmacies = db.pharmacies;
    this.hydrated = true;
  }
}
```

For typeahead and the medication search page, do not hydrate the whole U.S. drug catalog. Query `clearDosePlugin.data.search(term)` and cache results.

## Pricing migration

Do not mechanically replace fictional `offers[].pricing.medicationCost` with NADAC. They mean different things.

Preferred UI model:

```ts
drug.prices.filter(p => p.kind === 'nadac-benchmark')
```

Render it as:

```text
Public acquisition benchmark
$X.XX for 30 units
NADAC · effective DATE
Not a patient cash price or copay.
```

When you later add a true cash-price provider, it can return `kind: 'cash'` and your UI does not change structurally.
