import type { DrugPriceProvider, DrugPriceProviderContext } from './types';
import type { DrugPriceQuote } from '../types';
import { stableId } from '../utils/text';

interface LegacyDemoDb {
  medications: Array<{ id: string; slug: string; genericName: string; brandNames?: string[] }>;
  skus: Array<{ id: string; medicationId: string; quantity: number; unit?: string; form?: string; strength?: string }>;
  offers: Array<{
    id: string;
    skuId: string;
    pharmacyId: string;
    available?: boolean;
    pricing: { medicationCost: number; fulfillmentFee?: number; markup?: number; medicationSubtotal?: number };
    effectiveAt?: string;
  }>;
  pharmacies: Array<{ id: string; name: string }>;
}

/** Migration-only provider that keeps existing fictional ClearDose cash offers visible beside real public data. */
export class LegacyDemoCashPriceProvider implements DrugPriceProvider {
  readonly id = 'legacy-demo-cash';
  constructor(private readonly db: LegacyDemoDb) {}

  async getQuotes({ drug, quantity }: DrugPriceProviderContext): Promise<DrugPriceQuote[]> {
    const names = new Set([
      drug.identity.slug.toLowerCase(),
      drug.identity.genericName.toLowerCase(),
      ...drug.identity.brandNames.map(x => x.toLowerCase())
    ]);
    const medication = this.db.medications.find(m =>
      names.has(m.slug.toLowerCase()) ||
      names.has(m.genericName.toLowerCase()) ||
      (m.brandNames ?? []).some(b => names.has(b.toLowerCase()))
    );
    if (!medication) return [];

    const skus = this.db.skus.filter(s => s.medicationId === medication.id && s.quantity === quantity);
    const skuIds = new Set(skus.map(s => s.id));
    const pharmacies = new Map(this.db.pharmacies.map(p => [p.id, p.name]));

    return this.db.offers
      .filter(o => skuIds.has(o.skuId) && o.available !== false)
      .map(o => {
        const sku = skus.find(s => s.id === o.skuId);
        const amount = o.pricing.medicationSubtotal ?? (
          o.pricing.medicationCost + (o.pricing.fulfillmentFee ?? 0) + (o.pricing.markup ?? 0)
        );
        return {
          id: stableId('price-demo', o.id),
          kind: 'demo',
          amount,
          currency: 'USD',
          basis: 'prescription',
          quantity,
          unit: sku?.unit,
          product: { form: sku?.form, strength: sku?.strength, skuId: sku?.id },
          pharmacy: { name: pharmacies.get(o.pharmacyId) },
          effectiveDate: o.effectiveAt,
          label: `Demo cash offer: ${[sku?.strength, sku?.form, `${quantity} ${sku?.unit ?? 'units'}`].filter(Boolean).join(', ')}`,
          consumerMeaning: 'Fictional ClearDose demo price. Not a live retail quote.',
          source: {
            source: 'demo',
            retrievedAt: new Date().toISOString(),
            effectiveAt: o.effectiveAt,
            disclaimer: 'Demo data only. Price and pharmacy information are fictional.'
          }
        } satisfies DrugPriceQuote;
      });
  }
}
