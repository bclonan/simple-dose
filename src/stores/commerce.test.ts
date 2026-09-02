import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useClearDoseActions } from '../services/cleardose.actions'
import { useCartStore } from './cart.store'
import { useOrderStore } from './order.store'
import { usePrescriptionStore } from './prescription.store'
import { usePricingStore } from './pricing.store'
import { useSelectionStore } from './selection.store'

const flagshipOption = {
  offerId: 'offer-atorvastatin-20-90-cleardose',
  deliveryOptionId: 'standard',
}

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-31T16:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cart pricing', () => {
  it('adds an exact offer and derives each cart total', () => {
    const actions = useClearDoseActions()
    const cart = useCartStore()

    const result = actions.addToCart(flagshipOption)

    expect(result.cartCount).toBe(1)
    expect(result).toMatchObject({
      outcome: 'added',
      message: 'Medication added to your cart.',
      subtotal: 12.8,
      delivery: 5,
      total: 17.8,
    })
    expect(cart.detailedItems[0]).toMatchObject({
      medication: { genericName: 'Atorvastatin' },
      sku: { strength: '20 mg', quantity: 90 },
      delivery: { id: 'standard' },
      total: 17.8,
    })
    expect(cart.drawerOpen).toBe(true)
    expect(cart.feedbackMessage).toBe('Medication added to your cart.')
  })

  it('recalculates delivery and grand totals when fulfillment changes', () => {
    const actions = useClearDoseActions()
    const added = actions.addToCart(flagshipOption)

    const result = actions.setDeliveryOption({
      cartItemId: added.cartItem.id,
      deliveryOptionId: 'express',
    })

    expect(result).toMatchObject({
      deliveryOptionId: 'express',
      itemTotal: 21.8,
      grandTotal: 21.8,
    })
    expect(actions.viewCart()).toMatchObject({
      subtotal: 12.8,
      deliveryTotal: 9,
      grandTotal: 21.8,
    })
  })

  it('removes an item through the shared cart action and keeps totals in sync', () => {
    const actions = useClearDoseActions()
    const added = actions.addToCart(flagshipOption)

    expect(actions.removeCartItem({ cartItemId: added.cartItem.id })).toMatchObject({
      removedCartItemId: added.cartItem.id,
      cartCount: 0,
      grandTotal: 0,
    })
    expect(actions.viewCart()).toMatchObject({ itemCount: 0, grandTotal: 0 })
  })

  it('keeps distinct medication SKUs as separate lines with correct totals', () => {
    const actions = useClearDoseActions()

    actions.addToCart({
      offerId: 'offer-atorvastatin-10-30-partnerrx',
      deliveryOptionId: 'express',
    })
    actions.addToCart({
      offerId: 'offer-metformin-500-30-communityrx',
      deliveryOptionId: 'pickup',
    })

    expect(actions.viewCart()).toMatchObject({
      itemCount: 2,
      subtotal: 23.75,
      deliveryTotal: 8,
      grandTotal: 31.75,
      items: [
        { medication: 'Atorvastatin', total: 18.15 },
        { medication: 'Metformin', total: 13.6 },
      ],
    })
  })

  it('keeps one line for the same SKU and offer, updating delivery when requested', () => {
    const actions = useClearDoseActions()
    const first = actions.addToCart({
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'standard',
    })
    const merged = actions.addToCart({
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'express',
    })
    const repeated = actions.addToCart({
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'express',
    })

    expect(merged.cartItemId).toBe(first.cartItemId)
    expect(merged).toMatchObject({
      outcome: 'delivery-updated',
      message: 'This medication offer is already in your cart. Delivery was updated.',
    })
    expect(repeated).toMatchObject({
      cartItemId: first.cartItemId,
      outcome: 'already-present',
      message: 'This medication offer is already in your cart.',
    })
    expect(actions.viewCart()).toMatchObject({
      itemCount: 1,
      deliveryTotal: 9,
      grandTotal: 21.8,
      items: [{ delivery: 9, total: 21.8 }],
    })
    expect(useCartStore().feedbackMessage).toBe('This medication offer is already in your cart.')
  })

  it('migrates previously stored duplicate offer lines into one stable cart item', () => {
    window.localStorage.setItem('cleardose:cart', JSON.stringify({
      updatedAt: '2026-08-31T15:00:00.000Z',
      items: [
        {
          id: 'cart-original',
          skuId: 'sku-atorvastatin-tablet-20mg-90',
          offerId: 'offer-atorvastatin-20-90-cleardose',
          deliveryOptionId: 'standard',
          addedAt: '2026-08-31T14:00:00.000Z',
        },
        {
          id: 'cart-duplicate',
          skuId: 'sku-atorvastatin-tablet-20mg-90',
          offerId: 'offer-atorvastatin-20-90-cleardose',
          deliveryOptionId: 'express',
          addedAt: '2026-08-31T15:00:00.000Z',
        },
      ],
    }))

    const cart = useCartStore()

    expect(cart.items).toEqual([{
      id: 'cart-original',
      skuId: 'sku-atorvastatin-tablet-20mg-90',
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'express',
      addedAt: '2026-08-31T14:00:00.000Z',
    }])
    expect(JSON.parse(window.localStorage.getItem('cleardose:cart') ?? '{}').items).toHaveLength(1)
  })

  it('compares each cart line against the lowest current offer for the same exact SKU', () => {
    const actions = useClearDoseActions()

    actions.addToCart({
      offerId: 'offer-atorvastatin-10-30-partnerrx',
      deliveryOptionId: 'express',
    })
    actions.addToCart({
      offerId: 'offer-metformin-500-30-communityrx',
      deliveryOptionId: 'pickup',
    })

    expect(actions.compareCartSavings()).toEqual({
      itemCount: 2,
      currentTotal: 31.75,
      optimizedTotal: 25.75,
      potentialSavings: 6,
      itemsWithSavings: 2,
      pricingScenario: 'Current prices',
      effectiveAt: '2026-08-31T12:00:00-04:00',
      basis:
        'Current demo offers for each exact medication SKU, including its selected delivery cost. These are not retail or insurance savings.',
      items: [
        {
          cartItemId: expect.stringMatching(/^cart-/),
          medication: 'Atorvastatin',
          skuId: 'sku-atorvastatin-tablet-10mg-30',
          form: 'tablet',
          strength: '10 mg',
          quantity: 30,
          currentTotal: 18.15,
          bestAvailableTotal: 12.75,
          savings: 5.4,
          comparisonAvailable: true,
          isLowestAvailable: false,
          recommendedAction: {
            type: 'replace_offer',
            addFirst: {
              offerId: 'offer-atorvastatin-10-30-cleardose',
              deliveryOptionId: 'standard',
            },
            removeAfterAddSucceeds: expect.stringMatching(/^cart-/),
          },
          current: {
            offerId: 'offer-atorvastatin-10-30-partnerrx',
            deliveryOptionId: 'express',
            pharmacy: 'PartnerRx Express',
          },
          replacement: {
            offerId: 'offer-atorvastatin-10-30-cleardose',
            deliveryOptionId: 'standard',
            pharmacy: 'ClearDose Direct',
            estimatedMinDays: 3,
            estimatedMaxDays: 5,
          },
        },
        {
          cartItemId: expect.stringMatching(/^cart-/),
          medication: 'Metformin',
          skuId: 'sku-metformin-tablet-500mg-30',
          form: 'tablet',
          strength: '500 mg',
          quantity: 30,
          currentTotal: 13.6,
          bestAvailableTotal: 13,
          savings: 0.6,
          comparisonAvailable: true,
          isLowestAvailable: false,
          recommendedAction: {
            type: 'replace_offer',
            addFirst: {
              offerId: 'offer-metformin-500-30-cleardose',
              deliveryOptionId: 'standard',
            },
            removeAfterAddSucceeds: expect.stringMatching(/^cart-/),
          },
          current: {
            offerId: 'offer-metformin-500-30-communityrx',
            deliveryOptionId: 'pickup',
            pharmacy: 'CommunityRx',
          },
          replacement: {
            offerId: 'offer-metformin-500-30-cleardose',
            deliveryOptionId: 'standard',
            pharmacy: 'ClearDose Direct',
            estimatedMinDays: 3,
            estimatedMaxDays: 5,
          },
        },
      ],
      nextAction:
        'Follow each item recommendedAction. For set_delivery_option, call set_delivery_option with its cartItemId and deliveryOptionId. For replace_offer, call add_to_cart with addFirst, confirm success, then call remove_cart_item with removeAfterAddSucceeds.',
    })
  })

  it('rejects a savings comparison when the cart is empty', () => {
    expect(() => useClearDoseActions().compareCartSavings()).toThrow(
      'The cart is empty. Call add_to_cart before compare_cart_savings.',
    )
  })

  it('compares savings against the active pricing scenario and timestamp', () => {
    const actions = useClearDoseActions()
    actions.addToCart(flagshipOption)
    usePricingStore().setScenario('market-update')

    expect(actions.compareCartSavings()).toMatchObject({
      currentTotal: 16.9,
      optimizedTotal: 16.15,
      potentialSavings: 0.75,
      pricingScenario: 'Market update',
      effectiveAt: '2026-08-31T18:00:00-04:00',
      items: [{
        bestAvailableTotal: 16.15,
        replacement: {
          offerId: 'offer-atorvastatin-20-90-healthhub',
          deliveryOptionId: 'standard',
        },
      }],
    })
  })

  it('changes delivery without removing the line when the lowest option uses the same offer', () => {
    const actions = useClearDoseActions()
    const added = actions.addToCart({
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'express',
    })

    expect(actions.compareCartSavings()).toMatchObject({
      currentTotal: 21.8,
      optimizedTotal: 17.8,
      potentialSavings: 4,
      items: [{
        cartItemId: added.cartItemId,
        current: {
          offerId: 'offer-atorvastatin-20-90-cleardose',
          deliveryOptionId: 'express',
        },
        replacement: {
          offerId: 'offer-atorvastatin-20-90-cleardose',
          deliveryOptionId: 'standard',
        },
        recommendedAction: {
          type: 'set_delivery_option',
          cartItemId: added.cartItemId,
          deliveryOptionId: 'standard',
        },
      }],
    })
  })

  it('does not recommend a change when the selected line is already lowest', () => {
    const actions = useClearDoseActions()
    actions.addToCart(flagshipOption)

    expect(actions.compareCartSavings()).toMatchObject({
      potentialSavings: 0,
      items: [{
        comparisonAvailable: true,
        isLowestAvailable: true,
        recommendedAction: { type: 'none' },
      }],
    })
  })
})

describe('state-aware comparison', () => {
  it('reuses the exact current selection when prices change', async () => {
    const navigate = vi.fn(async () => undefined)
    const actions = useClearDoseActions({ navigate })
    const pricing = usePricingStore()
    const selection = useSelectionStore()

    await actions.compareFulfillmentOptions({
      medicationId: 'med-atorvastatin',
      form: 'tablet',
      strength: '20 mg',
      quantity: 90,
      maxDeliveryDays: 5,
    })
    await actions.selectMedicationOption(flagshipOption)
    pricing.setScenario('market-update')

    const refreshed = await actions.compareFulfillmentOptions({ maxDeliveryDays: 5 })

    expect(selection).toMatchObject({
      skuId: 'sku-atorvastatin-tablet-20mg-90',
      offerId: flagshipOption.offerId,
      deliveryOptionId: flagshipOption.deliveryOptionId,
    })
    expect(refreshed).toMatchObject({
      medication: {
        id: 'med-atorvastatin',
        form: 'tablet',
        strength: '20 mg',
        quantity: 90,
      },
      selectedOptionId: 'offer-atorvastatin-20-90-cleardose:standard',
      selectedOptionIsLowest: false,
      lowestTotalOptionId: 'offer-atorvastatin-20-90-healthhub:standard',
      pricingScenario: 'Market update',
    })
    expect(navigate).toHaveBeenLastCalledWith('/compare')
  })
})

describe('prescription request generation', () => {
  it('persists a request for the same exact SKU, offer, and delivery option', async () => {
    const actions = useClearDoseActions()
    const prescriptions = usePrescriptionStore()

    const result = await actions.createPrescriptionRequestCard({
      ...flagshipOption,
      patientName: '  Demo Patient  ',
      prescriberName: '  Demo Prescriber  ',
    })

    expect(result).toMatchObject({
      requestId: 'PR-2026-0001',
      medicationSummary: 'Atorvastatin 20 mg tablet, quantity 90',
      preferredFulfillment: 'ClearDose Direct',
      estimatedTotal: 17.8,
      route: '/prescription-card',
    })
    expect(prescriptions.latestRequest).toMatchObject({
      id: 'PR-2026-0001',
      skuId: 'sku-atorvastatin-tablet-20mg-90',
      offerId: flagshipOption.offerId,
      deliveryOptionId: 'standard',
      estimatedTotal: 17.8,
      patientName: 'Demo Patient',
      prescriberName: 'Demo Prescriber',
      status: 'prepared',
    })
  })
})

describe('demo order creation', () => {
  it('copies the cart into a local order, captures its total, then empties the cart', async () => {
    const actions = useClearDoseActions()
    const cart = useCartStore()
    const orders = useOrderStore()
    actions.addToCart(flagshipOption)

    const result = await actions.checkoutDemoOrder({
      fullName: '  Demo User  ',
      address: {
        line1: '100 Demo Street',
        city: 'Baltimore',
        state: 'MD',
        postalCode: '21201',
      },
      prescriptionStatus: 'provider-will-send',
    })

    expect(result).toEqual({
      orderId: 'CD-2026-0001',
      route: '/orders/CD-2026-0001',
      total: 17.8,
      status: 'demo-order-created',
      notice: 'Demo order only. No payment or prescription was transmitted.',
    })
    expect(orders.currentOrder).toMatchObject({
      id: 'CD-2026-0001',
      fullName: 'Demo User',
      total: 17.8,
      prescriptionStatus: 'provider-will-send',
      items: [{
        skuId: 'sku-atorvastatin-tablet-20mg-90',
        offerId: flagshipOption.offerId,
        deliveryOptionId: 'standard',
      }],
    })
    expect(cart.itemCount).toBe(0)
  })

  it('rejects a prepared-request claim when the request does not match the cart', async () => {
    const actions = useClearDoseActions()
    await actions.createPrescriptionRequestCard(flagshipOption)
    actions.addToCart({
      offerId: 'offer-atorvastatin-20-90-healthhub',
      deliveryOptionId: 'standard',
    })

    await expect(actions.checkoutDemoOrder({
      fullName: 'Demo User',
      address: {
        line1: '100 Demo Street',
        city: 'Baltimore',
        state: 'MD',
        postalCode: '21201',
      },
      prescriptionStatus: 'request-prepared',
    })).rejects.toThrow(
      'The prepared prescription request does not cover every prescription item in this cart. For a single prescription item, call create_prescription_request_card for its selected offer. For a multi-item cart, use provider-will-send.',
    )
    expect(useOrderStore().orders).toHaveLength(0)
  })

  it('rejects a prepared-request claim when a second prescription item is uncovered', async () => {
    const actions = useClearDoseActions()
    await actions.createPrescriptionRequestCard(flagshipOption)
    actions.addToCart(flagshipOption)
    actions.addToCart({
      offerId: 'offer-metformin-500-30-cleardose',
      deliveryOptionId: 'standard',
    })

    await expect(actions.checkoutDemoOrder({
      fullName: 'Demo User',
      address: {
        line1: '100 Demo Street',
        city: 'Baltimore',
        state: 'MD',
        postalCode: '21201',
      },
      prescriptionStatus: 'request-prepared',
    })).rejects.toThrow('For a multi-item cart, use provider-will-send.')
    expect(useOrderStore().orders).toHaveLength(0)
    expect(useCartStore().itemCount).toBe(2)
  })
})
