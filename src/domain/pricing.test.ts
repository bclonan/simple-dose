import { describe, expect, it } from 'vitest'

import demoDatabaseJson from '../data/cleardose-demo-db.json'
import type { DemoDatabase, MedicationOffer, PricingScenario } from '../types/demo-db'
import {
  applyPricingScenario,
  calculateDeliveredTotal,
  calculateMedicationSubtotal,
  compareFulfillmentOptions,
  findLowestTotalComparison,
} from './pricing'

const demoDatabase = demoDatabaseJson as unknown as DemoDatabase

function requireOffer(offerId: string): MedicationOffer {
  const offer = demoDatabase.offers.find((candidate) => candidate.id === offerId)
  if (!offer) {
    throw new Error(`Missing test offer ${offerId}.`)
  }
  return offer
}

function requireMarketScenario(): PricingScenario {
  const scenario = demoDatabase.pricingScenarios.find(
    (candidate) => candidate.id === 'market-update',
  )
  if (!scenario) {
    throw new Error('Missing market-update test scenario.')
  }
  return scenario
}

describe('pricing arithmetic', () => {
  it('calculates the medication subtotal from its three components', () => {
    expect(
      calculateMedicationSubtotal({
        medicationCost: 7.6,
        fulfillmentFee: 4,
        markup: 1.2,
      }),
    ).toBe(12.8)
  })

  it('calculates delivered totals without storing a separate total', () => {
    const offer = requireOffer('offer-atorvastatin-20-90-cleardose')
    const standard = offer.deliveryOptions.find((option) => option.id === 'standard')
    expect(standard).toBeDefined()
    expect(calculateDeliveredTotal(offer.pricing, standard?.price ?? 0)).toBe(17.8)
  })

  it('recomputes the subtotal for a pricing scenario override', () => {
    const offer = requireOffer('offer-atorvastatin-20-90-cleardose')
    const updated = applyPricingScenario(offer, requireMarketScenario())

    expect(updated.pricing).toEqual({
      medicationCost: 7.1,
      fulfillmentFee: 3.8,
      markup: 1,
      medicationSubtotal: 11.9,
    })
    expect(offer.pricing.medicationSubtotal).toBe(12.8)
  })
})

describe('exact-SKU comparisons', () => {
  const sku = demoDatabase.skus.find(
    (candidate) => candidate.id === 'sku-atorvastatin-tablet-20mg-90',
  )
  if (!sku) {
    throw new Error('Missing flagship atorvastatin SKU.')
  }

  it('ignores offers for every other SKU', () => {
    const comparisons = compareFulfillmentOptions({
      sku,
      offers: demoDatabase.offers,
      pharmacies: demoDatabase.pharmacies,
    })

    expect(comparisons).toHaveLength(5)
    expect(new Set(comparisons.map((comparison) => comparison.skuId))).toEqual(
      new Set([sku.id]),
    )
  })

  it('filters options by their maximum delivery estimate', () => {
    const sameDay = compareFulfillmentOptions({
      sku,
      offers: demoDatabase.offers,
      pharmacies: demoDatabase.pharmacies,
      maxDeliveryDays: 0,
    })

    expect(sameDay).toHaveLength(1)
    expect(sameDay[0]?.deliveryType).toBe('pickup')
    expect(sameDay[0]?.pharmacyId).toBe('pharmacy-communityrx')
  })

  it('marks the lowest total and fastest options', () => {
    const comparisons = compareFulfillmentOptions({
      sku,
      offers: demoDatabase.offers,
      pharmacies: demoDatabase.pharmacies,
      maxDeliveryDays: 5,
    })
    const lowest = findLowestTotalComparison(comparisons)
    const fastest = comparisons.filter((comparison) => comparison.isFastest)

    expect(lowest?.optionId).toBe('offer-atorvastatin-20-90-cleardose:standard')
    expect(lowest?.total).toBe(17.8)
    expect(fastest).toHaveLength(1)
    expect(fastest[0]?.deliveryType).toBe('pickup')
  })

  it('recomputes the winner after the market update', () => {
    const comparisons = compareFulfillmentOptions({
      sku,
      offers: demoDatabase.offers,
      pharmacies: demoDatabase.pharmacies,
      scenario: requireMarketScenario(),
      maxDeliveryDays: 5,
    })

    expect(findLowestTotalComparison(comparisons)?.optionId).toBe(
      'offer-atorvastatin-20-90-healthhub:standard',
    )
    expect(findLowestTotalComparison(comparisons)?.total).toBe(16.15)
  })
})

describe('demo database pricing integrity', () => {
  it('contains the promised catalog coverage', () => {
    expect(demoDatabase.medications).toHaveLength(12)
    expect(demoDatabase.pharmacies).toHaveLength(4)
    expect(demoDatabase.skus.length).toBeGreaterThanOrEqual(50)
    expect(demoDatabase.skus.length).toBeLessThanOrEqual(100)

    for (const medication of demoDatabase.medications) {
      const medicationSkus = demoDatabase.skus.filter(
        (candidate) => candidate.medicationId === medication.id,
      )
      expect(new Set(medicationSkus.map((candidate) => candidate.strength)).size).toBeGreaterThan(1)
      expect(new Set(medicationSkus.map((candidate) => candidate.quantity)).size).toBeGreaterThan(1)
    }
  })

  it('keeps every stored subtotal equal to its component sum', () => {
    for (const offer of demoDatabase.offers) {
      expect(offer.pricing.medicationSubtotal, offer.id).toBe(
        calculateMedicationSubtotal(offer.pricing),
      )
    }
  })

  it('provides all four pharmacy offers for every SKU', () => {
    for (const sku of demoDatabase.skus) {
      const offers = demoDatabase.offers.filter((candidate) => candidate.skuId === sku.id)
      expect(new Set(offers.map((offer) => offer.pharmacyId)).size, sku.id).toBe(4)
    }
  })

  it('only overrides offers that exist', () => {
    const offerIds = new Set(demoDatabase.offers.map((offer) => offer.id))
    for (const scenario of demoDatabase.pricingScenarios) {
      for (const override of scenario.offerOverrides) {
        expect(offerIds.has(override.offerId), override.offerId).toBe(true)
      }
    }
  })
})
