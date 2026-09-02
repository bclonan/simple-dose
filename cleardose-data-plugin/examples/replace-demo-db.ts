import { createLegacyCatalogAdapter } from '@cleardose/data-plugin/legacy';
import { clearDosePlugin } from './vue-main';

const adapter = createLegacyCatalogAdapter(clearDosePlugin.data);

// Same high-level arrays as the existing demo DB: medications, pharmacies, skus, offers.
export const publicDb = await adapter.buildDatabase([
  { drug: 'atorvastatin', category: 'cholesterol' },
  { drug: 'metformin', category: 'diabetes' },
  { drug: 'lisinopril', category: 'blood-pressure' },
  { drug: 'amlodipine', category: 'blood-pressure' },
  { drug: 'sertraline', category: 'mental-health' },
  { drug: 'omeprazole', category: 'acid-reflux' }
], {
  quantities: [30, 60, 90],

  // Turn this on only after your old offer card is relabeled to say
  // "NADAC acquisition benchmark" rather than "cash price" or "pharmacy price".
  includeBenchmarkOffers: false
});
