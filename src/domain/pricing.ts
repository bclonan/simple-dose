import type {
  CurrencyCode,
  DeliveryOption,
  MedicationOffer,
  MedicationSku,
  Pharmacy,
  PriceBreakdown,
  PriceComparison,
  PriceComponents,
  PricingScenario,
} from '../types/demo-db'

const CENTS_PER_DOLLAR = 100

export interface CartSavingsAmount {
  currentTotal: number
  bestAvailableTotal: number | null
}

export interface CartSavingsTotals {
  currentTotal: number
  optimizedTotal: number
  potentialSavings: number
  itemsWithSavings: number
}

export function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * CENTS_PER_DOLLAR) / CENTS_PER_DOLLAR
}

export function calculateCartSavingsTotals(
  amounts: readonly CartSavingsAmount[],
): CartSavingsTotals {
  const currentTotal = roundCurrency(
    amounts.reduce((sum, amount) => sum + amount.currentTotal, 0),
  )
  const lineSavings = amounts.map((amount) =>
    roundCurrency(
      Math.max(0, amount.currentTotal - (amount.bestAvailableTotal ?? amount.currentTotal)),
    ),
  )
  const potentialSavings = roundCurrency(
    lineSavings.reduce((sum, savings) => sum + savings, 0),
  )

  return {
    currentTotal,
    optimizedTotal: roundCurrency(currentTotal - potentialSavings),
    potentialSavings,
    itemsWithSavings: lineSavings.filter((savings) => savings > 0).length,
  }
}

export function calculateMedicationSubtotal(pricing: PriceComponents): number {
  return roundCurrency(pricing.medicationCost + pricing.fulfillmentFee + pricing.markup)
}

export function normalizePriceBreakdown(pricing: PriceComponents): PriceBreakdown {
  return {
    medicationCost: roundCurrency(pricing.medicationCost),
    fulfillmentFee: roundCurrency(pricing.fulfillmentFee),
    markup: roundCurrency(pricing.markup),
    medicationSubtotal: calculateMedicationSubtotal(pricing),
  }
}

export function calculateDeliveredTotal(
  pricing: PriceComponents,
  delivery: Pick<DeliveryOption, 'price'> | number,
): number {
  const deliveryPrice = typeof delivery === 'number' ? delivery : delivery.price
  return roundCurrency(calculateMedicationSubtotal(pricing) + deliveryPrice)
}

export function resolveOfferPricing(
  offer: MedicationOffer,
  scenario?: PricingScenario | null,
): PriceBreakdown {
  const override = scenario?.offerOverrides.find((candidate) => candidate.offerId === offer.id)
  return normalizePriceBreakdown(override?.pricing ?? offer.pricing)
}

export function applyPricingScenario(
  offer: MedicationOffer,
  scenario?: PricingScenario | null,
): MedicationOffer {
  return {
    ...offer,
    pricing: resolveOfferPricing(offer, scenario),
    deliveryOptions: offer.deliveryOptions.map((delivery) => ({ ...delivery })),
  }
}

export interface CompareFulfillmentOptionsInput {
  sku: MedicationSku
  offers: readonly MedicationOffer[]
  pharmacies: readonly Pharmacy[]
  scenario?: PricingScenario | null
  maxDeliveryDays?: number
}

function comparisonOrder(left: PriceComparison, right: PriceComparison): number {
  return (
    left.total - right.total ||
    left.estimatedMaxDays - right.estimatedMaxDays ||
    left.estimatedMinDays - right.estimatedMinDays ||
    left.pharmacyName.localeCompare(right.pharmacyName) ||
    left.deliveryLabel.localeCompare(right.deliveryLabel)
  )
}

export function compareFulfillmentOptions({
  sku,
  offers,
  pharmacies,
  scenario,
  maxDeliveryDays,
}: CompareFulfillmentOptionsInput): PriceComparison[] {
  const pharmacyById = new Map(pharmacies.map((pharmacy) => [pharmacy.id, pharmacy]))
  const comparisons: PriceComparison[] = []

  for (const sourceOffer of offers) {
    if (!sourceOffer.available || sourceOffer.skuId !== sku.id) {
      continue
    }

    const pharmacy = pharmacyById.get(sourceOffer.pharmacyId)
    if (!pharmacy) {
      throw new Error(`Offer ${sourceOffer.id} references unknown pharmacy ${sourceOffer.pharmacyId}.`)
    }

    const offer = applyPricingScenario(sourceOffer, scenario)
    for (const delivery of offer.deliveryOptions) {
      if (maxDeliveryDays !== undefined && delivery.estimatedMaxDays > maxDeliveryDays) {
        continue
      }

      comparisons.push({
        optionId: `${offer.id}:${delivery.id}`,
        medicationId: sku.medicationId,
        skuId: sku.id,
        offerId: offer.id,
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.name,
        pharmacyShortName: pharmacy.shortName,
        deliveryOptionId: delivery.id,
        deliveryType: delivery.type,
        deliveryLabel: delivery.label,
        medicationSubtotal: offer.pricing.medicationSubtotal,
        deliveryPrice: delivery.price,
        total: calculateDeliveredTotal(offer.pricing, delivery),
        estimatedMinDays: delivery.estimatedMinDays,
        estimatedMaxDays: delivery.estimatedMaxDays,
        pricing: offer.pricing,
        isLowestTotal: false,
        isFastest: false,
      })
    }
  }

  comparisons.sort(comparisonOrder)
  const lowestTotal = comparisons[0]?.total
  const fastestMaxDays = comparisons.reduce(
    (fastest, option) => Math.min(fastest, option.estimatedMaxDays),
    Number.POSITIVE_INFINITY,
  )
  const fastestMinDays = comparisons.reduce(
    (fastest, option) =>
      option.estimatedMaxDays === fastestMaxDays
        ? Math.min(fastest, option.estimatedMinDays)
        : fastest,
    Number.POSITIVE_INFINITY,
  )

  return comparisons.map((option) => ({
    ...option,
    isLowestTotal: option.total === lowestTotal,
    isFastest:
      option.estimatedMaxDays === fastestMaxDays && option.estimatedMinDays === fastestMinDays,
  }))
}

export const buildPriceComparisons = compareFulfillmentOptions

export function findLowestTotalComparison(
  comparisons: readonly PriceComparison[],
): PriceComparison | undefined {
  return comparisons.reduce<PriceComparison | undefined>((lowest, candidate) => {
    if (!lowest || comparisonOrder(candidate, lowest) < 0) {
      return candidate
    }
    return lowest
  }, undefined)
}

export const findLowestTotalOption = findLowestTotalComparison

export function formatCurrency(
  amount: number,
  locale = 'en-US',
  currency: CurrencyCode = 'USD',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
