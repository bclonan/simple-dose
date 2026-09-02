import type { ClearDoseDrug, DrugPriceQuote } from '../types';

export interface DrugPriceProviderContext {
  drug: ClearDoseDrug;
  quantity: number;
}

export interface DrugPriceProvider {
  readonly id: string;
  getQuotes(context: DrugPriceProviderContext): Promise<DrugPriceQuote[]>;
}
