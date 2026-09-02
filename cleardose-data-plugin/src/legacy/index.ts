import type { ClearDoseDataService } from '../service';
import type { ClearDoseDrug } from '../types';
import { slugify, uniq } from '../utils/text';
import type { LegacyDatabase, LegacyMedication, LegacyOffer, LegacyPharmacy, LegacySku } from './types';
export * from './types';

const benchmarkPharmacy: LegacyPharmacy = {
  id: 'pharmacy-public-nadac',
  name: 'NADAC Public Benchmark',
  shortName: 'NADAC',
  type: 'public-benchmark',
  description: 'CMS Medicaid National Average Drug Acquisition Cost benchmark. Not a retail pharmacy or patient cash price.',
  fulfillmentTypes: [],
  demo: false,
  priceKind: 'nadac-benchmark'
};

export function createLegacyCatalogAdapter(data: ClearDoseDataService) {
  function medicationFromDrug(drug: ClearDoseDrug, category = 'uncategorized', quantities = [30, 60, 90]): LegacyMedication {
    const { identity } = drug;
    return {
      id: `med-${identity.slug}`,
      slug: identity.slug,
      genericName: identity.genericName,
      brandNames: identity.brandNames,
      category,
      rxRequired: true,
      displaySummary: drug.clinical?.indications?.[0] ?? `Public FDA product data for ${identity.genericName}.`,
      forms: drug.forms,
      strengths: drug.strengths,
      quantityOptions: quantities,
      searchTerms: uniq([identity.genericName, ...identity.brandNames, category, ...drug.pharmacologicClasses]),
      publicData: drug
    };
  }

  function skusFromDrug(drug: ClearDoseDrug, quantities = [30, 60, 90]): LegacySku[] {
    const medId = `med-${drug.identity.slug}`;
    const pairs = new Map<string, { form: string; strength: string }>();
    for (const variant of drug.variants) {
      const form = (variant.dosageForm ?? drug.forms[0] ?? 'unit').toLowerCase();
      for (const ingredient of variant.activeIngredients) {
        const strength = ingredient.strength ?? drug.strengths[0];
        if (strength) pairs.set(`${form}|${strength}`, { form, strength });
      }
    }
    if (!pairs.size) {
      for (const form of drug.forms.length ? drug.forms : ['unit']) {
        for (const strength of drug.strengths.length ? drug.strengths : ['unspecified']) pairs.set(`${form}|${strength}`, { form: form.toLowerCase(), strength });
      }
    }

    return [...pairs.values()].flatMap(({ form, strength }) => quantities.map(quantity => ({
      id: `sku-${drug.identity.slug}-${slugify(form)}-${slugify(strength)}-${quantity}`,
      medicationId: medId,
      form,
      strength,
      quantity,
      unit: form.includes('tablet') ? 'tablet' : form.includes('capsule') ? 'capsule' : 'unit',
      rxRequired: true
    })));
  }

  function benchmarkOffers(drug: ClearDoseDrug, skus: LegacySku[]): LegacyOffer[] {
    const nadac = drug.prices.filter(p => p.kind === 'nadac-benchmark');
    if (!nadac.length) return [];
    return skus.flatMap(sku => {
      const quote = nadac.find(q => q.quantity === sku.quantity) ?? nadac[0];
      if (!quote?.unitAmount) return [];
      const amount = Math.round(quote.unitAmount * sku.quantity * 100) / 100;
      return [{
        id: `offer-${sku.id}-nadac`,
        skuId: sku.id,
        pharmacyId: benchmarkPharmacy.id,
        available: true,
        inventoryLabel: 'Public acquisition benchmark — not retail availability',
        pricing: { medicationCost: amount, fulfillmentFee: 0, markup: 0, medicationSubtotal: amount },
        deliveryOptions: [],
        effectiveAt: quote.effectiveDate ?? quote.source.retrievedAt,
        priceKind: 'nadac-benchmark',
        purchasable: false,
        sourceDisclaimer: quote.consumerMeaning
      }];
    });
  }

  return {
    /** Build the same top-level shape as the existing cleardose-demo-db.json. */
    async buildDatabase(input: Array<{ drug: string; category?: string }>, options: { quantities?: number[]; includeBenchmarkOffers?: boolean } = {}): Promise<LegacyDatabase> {
      const quantities = options.quantities ?? [30, 60, 90];
      const drugs = await Promise.all(input.map(x => data.getDrug(x.drug, { quantity: quantities[0] }).then(drug => ({ drug, category: x.category ?? 'uncategorized' }))));
      const medications: LegacyMedication[] = [];
      const skus: LegacySku[] = [];
      const offers: LegacyOffer[] = [];
      for (const item of drugs) {
        const medication = medicationFromDrug(item.drug, item.category, quantities);
        const drugSkus = skusFromDrug(item.drug, quantities);
        medications.push(medication);
        skus.push(...drugSkus);
        if (options.includeBenchmarkOffers) offers.push(...benchmarkOffers(item.drug, drugSkus));
      }
      return {
        schemaVersion: '2.0.0-public',
        metadata: {
          name: 'ClearDose Public Data Catalog',
          description: 'Normalized public drug data. NADAC values, when included, are acquisition-cost benchmarks and are not cash prices.',
          currency: 'USD',
          locale: 'en-US',
          updatedAt: new Date().toISOString()
        },
        medications,
        pharmacies: options.includeBenchmarkOffers ? [benchmarkPharmacy] : [],
        skus,
        offers,
        pricingScenarios: []
      };
    },
    medicationFromDrug,
    skusFromDrug,
    benchmarkOffers
  };
}
