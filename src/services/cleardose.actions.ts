import { findExactSku } from '../domain/catalog'
import {
  calculateCartSavingsTotals,
  findLowestTotalComparison,
  roundCurrency,
} from '../domain/pricing'
import type {
  DemoAddress,
  PriceComparison,
  PrescriptionStatus,
} from '../types/demo-db'
import { useAgentActivityStore } from '../stores/agentActivity.store'
import { useCartStore } from '../stores/cart.store'
import { useCatalogStore } from '../stores/catalog.store'
import { useOrderStore } from '../stores/order.store'
import { usePrescriptionStore } from '../stores/prescription.store'
import { usePricingStore } from '../stores/pricing.store'
import { useSelectionStore } from '../stores/selection.store'
import { captureWebMcpContext } from './webmcp.context'

export interface SearchMedicationInput {
  query: string
  form?: string
  strength?: string
  offset?: number
  limit?: number
}

export interface ExactMedicationInput {
  medicationId: string
  form: string
  strength: string
  quantity: number
}

export interface CompareOptionsInput extends Partial<ExactMedicationInput> {
  maxDeliveryDays?: number
  offset?: number
  maxResults?: number
}

export interface SelectOptionInput {
  offerId: string
  deliveryOptionId: string
}

export interface CreatePrescriptionCardInput extends SelectOptionInput {
  patientName?: string
  dateOfBirth?: string
  prescriberName?: string
  practice?: string
}

export interface CheckoutDemoOrderInput {
  fullName: string
  address: DemoAddress
  prescriptionStatus: PrescriptionStatus
}

export interface ClearDoseActionsOptions {
  navigate?: (path: string) => unknown | Promise<unknown>
}

const requireString = (value: string, field: string): string => {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} is required.`)
  return trimmed
}

export const useClearDoseActions = (options: ClearDoseActionsOptions = {}) => {
  const catalog = useCatalogStore()
  const selection = useSelectionStore()
  const pricing = usePricingStore()
  const prescriptions = usePrescriptionStore()
  const cart = useCartStore()
  const orders = useOrderStore()

  const optionByIds = (offerId: string, deliveryOptionId: string): PriceComparison => {
    const offer = catalog.offers.find((candidate) => candidate.id === offerId)
    if (!offer?.available) {
      throw new Error(
        'That fulfillment offer is unavailable. Call compare_fulfillment_options to get current offerId and deliveryOptionId values.',
      )
    }
    const sku = catalog.skuById(offer.skuId)
    if (!sku) {
      throw new Error(
        'That medication configuration is unavailable. Call compare_fulfillment_options to get a current exact option.',
      )
    }
    const option = pricing
      .comparisonsForSku(sku)
      .find(
        (candidate) =>
          candidate.offerId === offerId && candidate.deliveryOptionId === deliveryOptionId,
      )
    if (!option) {
      throw new Error(
        'That delivery option is unavailable for this offer. Call compare_fulfillment_options to get current deliveryOptionId values.',
      )
    }
    return option
  }

  const searchMedications = async (input: SearchMedicationInput) => {
    const query = input.query.trim()
    const results = await catalog.search(query, {
      form: input.form,
      strength: input.strength,
    })
    const offset = input.offset ?? 0
    const limit = input.limit ?? results.length
    const output = {
      query,
      count: results.length,
      offset,
      returned: Math.min(Math.max(0, results.length - offset), limit),
      results: results.slice(offset, offset + limit).map((medication) => ({
        medicationId: medication.id,
        slug: medication.slug,
        genericName: medication.genericName,
        brandNames: medication.brandNames,
        category: medication.category,
        forms: medication.forms,
        strengths: medication.strengths,
        rxRequired: medication.publicOnly ? null : medication.rxRequired,
        source: medication.publicSource ?? 'demo',
      })),
      route: '/medications',
      nextAction:
        results.length > 0
          ? 'Call get_medication_details with a returned medicationId.'
          : 'Try search_medications again with a broader generic name, brand, category, form, or strength.',
    }
    await options.navigate?.('/medications')
    return output
  }

  const getMedicationDetails = async (input: { medicationId: string }) => {
    const medication = catalog.medicationById(requireString(input.medicationId, 'Medication ID'))
    if (!medication) {
      throw new Error('Medication was not found. Call search_medications to get a current medicationId.')
    }
    await catalog.loadMedication(medication.id)
    const record = catalog.publicRecords[medication.id]
    const configurations = catalog.skusForMedication(medication.id)
    return {
      medicationId: medication.id,
      genericName: medication.genericName,
      brandNames: medication.brandNames,
      forms: medication.forms,
      strengths: medication.strengths,
      quantities: medication.quantityOptions,
      prescriptionRequired: medication.publicOnly ? null : medication.rxRequired,
      availableSkuCount: configurations.length,
      shopConfigurations: configurations.map(({ form, strength, quantity, unit }) => ({ form, strength, quantity, unit })),
      shopConfigurationCount: configurations.length,
      pricingNotice: 'Shop prices and quantities are fictional demo offers, not API prices or dosing advice.',
      dataStatus: record?.status ?? 'unavailable',
      sources: record?.drug?.sources.map(source => source.source) ?? [],
      clinicalSections: record?.drug?.clinical ? Object.keys(record.drug.clinical) : [],
      nextAction: 'Use an exact shopConfigurations entry with compare_fulfillment_options for the mock cart. Use compare_medications for paged public facts. Benchmarks are not checkout offers.',
    }
  }

  const resolveExactMedication = (input: CompareOptionsInput): ExactMedicationInput => {
    const exactValues = [input.medicationId, input.form, input.strength, input.quantity]
    const suppliedCount = exactValues.filter((value) => value !== undefined).length
    if (suppliedCount === 0) {
      if (
        !selection.medicationId ||
        !selection.form ||
        !selection.strength ||
        selection.quantity === null
      ) {
        throw new Error(
          'No current medication is configured. Call search_medications, then compare_fulfillment_options with medicationId, form, strength, and quantity.',
        )
      }
      return {
        medicationId: selection.medicationId,
        form: selection.form,
        strength: selection.strength,
        quantity: selection.quantity,
      }
    }
    if (suppliedCount !== exactValues.length) {
      throw new Error(
        'Provide medicationId, form, strength, and quantity together, or omit all four to reuse the current selection.',
      )
    }
    return {
      medicationId: requireString(input.medicationId as string, 'Medication ID'),
      form: requireString(input.form as string, 'Form'),
      strength: requireString(input.strength as string, 'Strength'),
      quantity: input.quantity as number,
    }
  }

  const compareFulfillmentOptions = async (input: CompareOptionsInput) => {
    const exact = resolveExactMedication(input)
    const medication = catalog.medicationById(exact.medicationId)
    if (!medication) {
      throw new Error('Medication was not found. Call search_medications to get a current medicationId.')
    }
    if (!Number.isFinite(exact.quantity) || exact.quantity <= 0) {
      throw new Error('Quantity must be a positive number.')
    }
    if (
      input.maxDeliveryDays !== undefined &&
      (!Number.isFinite(input.maxDeliveryDays) || input.maxDeliveryDays < 0)
    ) {
      throw new Error('Maximum delivery days must be zero or greater.')
    }
    const sku = findExactSku(catalog.skus, exact)
    if (!sku) {
      throw new Error(
        'That exact medication configuration is unavailable. Call get_medication_details and use an exact shopConfigurations entry.',
      )
    }

    selection.setConfiguration(exact)
    const comparisons = pricing.comparisonsForSku(sku, input.maxDeliveryDays)
    if (comparisons.length === 0) {
      throw new Error(
        input.maxDeliveryDays === undefined
          ? 'No fulfillment options are available for that exact configuration. Call get_medication_details to confirm the current configuration.'
          : 'No fulfillment options match that delivery window. Retry compare_fulfillment_options with a larger maxDeliveryDays or omit maxDeliveryDays.',
      )
    }
    const lowest = findLowestTotalComparison(comparisons)
    const fastest = comparisons.find((option) => option.isFastest)
    const output = {
      medication: {
        id: medication.id,
        genericName: medication.genericName,
        activeIngredient: medication.genericName,
        form: sku.form,
        strength: sku.strength,
        quantity: sku.quantity,
      },
      options: comparisons.map((option) => ({
        optionId: option.optionId,
        offerId: option.offerId,
        deliveryOptionId: option.deliveryOptionId,
        pharmacy: option.pharmacyName,
        medicationSubtotal: option.medicationSubtotal,
        deliveryMethod: option.deliveryLabel,
        deliveryPrice: option.deliveryPrice,
        estimatedMinDays: option.estimatedMinDays,
        estimatedMaxDays: option.estimatedMaxDays,
        total: option.total,
        labels: [
          ...(option.isLowestTotal ? ['lowest-total'] : []),
          ...(option.isFastest ? ['fastest'] : []),
          ...(option.deliveryType === 'pickup' ? ['pickup-available'] : []),
        ],
      })),
      lowestTotalOptionId: lowest?.optionId ?? null,
      fastestOptionId: fastest?.optionId ?? null,
      selectedOptionId:
        selection.offerId && selection.deliveryOptionId
          ? `${selection.offerId}:${selection.deliveryOptionId}`
          : null,
      selectedOptionIsLowest:
        Boolean(selection.offerId && selection.deliveryOptionId) &&
        lowest?.offerId === selection.offerId &&
        lowest?.deliveryOptionId === selection.deliveryOptionId,
      pricingScenario: pricing.scenarioLabel,
      pricingNotice: 'Fictional demo offers only. These are not API retail prices, pharmacy inventory, or dosing advice.',
      route: '/compare',
      nextAction: 'Call select_medication_option with an offerId and deliveryOptionId from these results.',
    }
    await options.navigate?.('/compare')
    return output
  }

  const selectMedicationOption = async (input: SelectOptionInput) => {
    const option = optionByIds(input.offerId, input.deliveryOptionId)
    selection.selectOption(input.offerId, input.deliveryOptionId)
    const output = {
      selectedOption: option,
      total: option.total,
      route: '/compare',
    }
    await options.navigate?.('/compare')
    return output
  }

  const createPrescriptionRequestCard = async (input: CreatePrescriptionCardInput) => {
    const option = optionByIds(input.offerId, input.deliveryOptionId)
    selection.selectOption(input.offerId, input.deliveryOptionId)
    const sku = catalog.skuById(option.skuId)
    if (!sku) {
      throw new Error(
        'The selected offer no longer has a valid medication configuration. Call compare_fulfillment_options again.',
      )
    }
    const request = prescriptions.createRequest({
      ...input,
      medicationId: sku.medicationId,
      form: sku.form,
      strength: sku.strength,
      quantity: sku.quantity,
    })
    const medication = catalog.medicationById(request.medicationId)
    const selectedSku = catalog.skuById(request.skuId)
    const pharmacy = catalog.pharmacies.find(
      (candidate) => candidate.id === request.pharmacyId,
    )
    await options.navigate?.('/prescription-card')
    return {
      requestId: request.id,
      medicationSummary: `${medication?.genericName ?? 'Medication'} ${selectedSku?.strength ?? ''} ${selectedSku?.form ?? ''}, quantity ${selectedSku?.quantity ?? ''}`.trim(),
      preferredFulfillment: pharmacy?.name ?? option.pharmacyName,
      estimatedTotal: request.estimatedTotal,
      route: '/prescription-card',
      notice: 'This is a prescription request summary, not a prescription.',
    }
  }

  const addToCart = (input: SelectOptionInput) => {
    const option = optionByIds(input.offerId, input.deliveryOptionId)
    selection.selectOption(input.offerId, input.deliveryOptionId)
    const existing = cart.items.find(
      (candidate) => candidate.skuId === option.skuId && candidate.offerId === input.offerId,
    )
    const previousDeliveryOptionId = existing?.deliveryOptionId
    const item = cart.addItem(input.offerId, input.deliveryOptionId)
    const outcome = !existing
      ? 'added'
      : previousDeliveryOptionId === input.deliveryOptionId
        ? 'already-present'
        : 'delivery-updated'
    return {
      cartItem: item,
      cartItemId: item.id,
      outcome,
      message: cart.feedbackMessage,
      cartCount: cart.itemCount,
      subtotal: cart.medicationSubtotal,
      delivery: cart.deliveryTotal,
      total: cart.grandTotal,
      selectedOptionTotal: option.total,
    }
  }

  const viewCart = () => {
    cart.openDrawer()
    return {
    itemCount: cart.itemCount,
    items: cart.detailedItems.map((line) => ({
      cartItemId: line.item.id,
      medication: line.medication.genericName,
      form: line.sku.form,
      strength: line.sku.strength,
      quantity: line.sku.quantity,
      pharmacy: line.pharmacy.name,
      selectedDelivery: line.delivery.label,
      deliveryOptions: line.offer.deliveryOptions.map((delivery) => ({
        deliveryOptionId: delivery.id,
        label: delivery.label,
        price: delivery.price,
        estimatedMinDays: delivery.estimatedMinDays,
        estimatedMaxDays: delivery.estimatedMaxDays,
        itemTotal: roundCurrency(line.pricing.medicationSubtotal + delivery.price),
      })),
      subtotal: line.pricing.medicationSubtotal,
      delivery: line.delivery.price,
      total: line.total,
    })),
    selectedDelivery: cart.detailedItems.map((line) => line.delivery.label),
    subtotal: cart.medicationSubtotal,
    deliveryTotal: cart.deliveryTotal,
    grandTotal: cart.grandTotal,
    readyForCheckout: cart.itemCount > 0,
    checkoutRoute: '/checkout',
    checkoutRequirements: {
      requiredFields: ['fullName', 'address.line1', 'address.city', 'address.state', 'address.postalCode', 'prescriptionStatus'],
      prescriptionStatusValues: ['provider-will-send', 'request-prepared'],
      hasPreparedRequest: Boolean(prescriptions.latestRequest),
    },
    nextAction:
      cart.itemCount > 0
        ? 'Call checkout_demo_order when the user wants to create the local demo order.'
        : 'Call add_to_cart with an offerId and deliveryOptionId from compare_fulfillment_options.',
    }
  }

  const compareCartSavings = () => {
    if (cart.itemCount === 0) {
      throw new Error('The cart is empty. Call add_to_cart before compare_cart_savings.')
    }

    const items = cart.detailedItems.map((line) => {
      const bestAvailable = findLowestTotalComparison(pricing.comparisonsForSku(line.sku))
      const savings = roundCurrency(
        Math.max(0, line.total - (bestAvailable?.total ?? line.total)),
      )
      const recommendedAction = savings === 0 || !bestAvailable
        ? { type: 'none' as const }
        : bestAvailable.offerId === line.offer.id
          ? {
              type: 'set_delivery_option' as const,
              cartItemId: line.item.id,
              deliveryOptionId: bestAvailable.deliveryOptionId,
            }
          : {
              type: 'replace_offer' as const,
              addFirst: {
                offerId: bestAvailable.offerId,
                deliveryOptionId: bestAvailable.deliveryOptionId,
              },
              removeAfterAddSucceeds: line.item.id,
            }

      return {
        cartItemId: line.item.id,
        medication: line.medication.genericName,
        skuId: line.sku.id,
        form: line.sku.form,
        strength: line.sku.strength,
        quantity: line.sku.quantity,
        currentTotal: line.total,
        bestAvailableTotal: bestAvailable?.total ?? null,
        savings,
        comparisonAvailable: Boolean(bestAvailable),
        isLowestAvailable: bestAvailable ? savings === 0 : null,
        recommendedAction,
        current: {
          offerId: line.offer.id,
          deliveryOptionId: line.delivery.id,
          pharmacy: line.pharmacy.name,
        },
        replacement: bestAvailable
          ? {
              offerId: bestAvailable.offerId,
              deliveryOptionId: bestAvailable.deliveryOptionId,
              pharmacy: bestAvailable.pharmacyName,
              estimatedMinDays: bestAvailable.estimatedMinDays,
              estimatedMaxDays: bestAvailable.estimatedMaxDays,
            }
          : null,
      }
    })
    const totals = calculateCartSavingsTotals(items)

    return {
      itemCount: items.length,
      ...totals,
      pricingScenario: pricing.scenarioLabel,
      effectiveAt: pricing.effectiveAt,
      basis:
        'Current demo offers for each exact medication SKU, including its selected delivery cost. These are not retail or insurance savings.',
      items,
      nextAction:
        totals.potentialSavings > 0
          ? 'Follow each item recommendedAction. For set_delivery_option, call set_delivery_option with its cartItemId and deliveryOptionId. For replace_offer, call add_to_cart with addFirst, confirm success, then call remove_cart_item with removeAfterAddSucceeds.'
          : 'Each cart item already uses its lowest-total current demo option.',
    }
  }

  const removeCartItem = (input: { cartItemId: string }) => {
    if (!cart.items.some((item) => item.id === input.cartItemId)) {
      throw new Error('Cart item was not found. Call view_cart to get a current cartItemId.')
    }
    cart.removeItem(input.cartItemId)
    cart.openDrawer()
    return {
      removedCartItemId: input.cartItemId,
      cartCount: cart.itemCount,
      subtotal: cart.medicationSubtotal,
      deliveryTotal: cart.deliveryTotal,
      grandTotal: cart.grandTotal,
      nextAction:
        cart.itemCount > 0
          ? 'Call view_cart to review the remaining items.'
          : 'The cart is empty. Call compare_fulfillment_options before adding another item.',
    }
  }

  const setDeliveryOption = (input: {
    cartItemId: string
    deliveryOptionId: string
  }, presentation: { revealCart?: boolean } = {}) => {
    const cartItem = cart.items.find((candidate) => candidate.id === input.cartItemId)
    if (!cartItem) {
      throw new Error('Cart item was not found. Call view_cart to get a current cartItemId.')
    }
    const offer = catalog.offers.find((candidate) => candidate.id === cartItem.offerId)
    if (!offer?.deliveryOptions.some((candidate) => candidate.id === input.deliveryOptionId)) {
      throw new Error(
        'That delivery option is unavailable for this cart item. Call view_cart to get current deliveryOptionId values.',
      )
    }
    cart.setDelivery(input.cartItemId, input.deliveryOptionId)
    if (presentation.revealCart !== false) cart.openDrawer()
    const line = cart.detailedItems.find((candidate) => candidate.item.id === input.cartItemId)
    if (!line) throw new Error('Cart item was not found after updating delivery.')
    return {
      cartItemId: line.item.id,
      deliveryOptionId: line.delivery.id,
      delivery: line.delivery.label,
      itemTotal: line.total,
      grandTotal: cart.grandTotal,
    }
  }

  const checkoutDemoOrder = async (input: CheckoutDemoOrderInput) => {
    if (cart.itemCount === 0) {
      throw new Error('The cart is empty. Call add_to_cart before checkout_demo_order.')
    }
    if (input.prescriptionStatus === 'request-prepared') {
      const request = prescriptions.latestRequest
      const prescriptionItems = cart.items.filter(
        (item) => catalog.skuById(item.skuId)?.rxRequired,
      )
      const matchesCart = request && prescriptionItems.length === 1
        ? prescriptionItems.every(
            (item) =>
              item.offerId === request.offerId &&
              item.deliveryOptionId === request.deliveryOptionId,
          )
        : false
      if (!matchesCart) {
        throw new Error(
          'The prepared prescription request does not cover every prescription item in this cart. For a single prescription item, call create_prescription_request_card for its selected offer. For a multi-item cart, use provider-will-send.',
        )
      }
    }
    const order = orders.createOrder(input)
    const route = `/orders/${order.id}`
    await options.navigate?.(route)
    return {
      orderId: order.id,
      route,
      total: order.total,
      status: order.status,
      notice: 'Demo order only. No payment or prescription was transmitted.',
    }
  }

  const getOrderStatus = async (input: { orderId?: string }) => {
    const orderId = input.orderId ? requireString(input.orderId, 'Order ID') : orders.currentOrderId
    if (!orderId) {
      throw new Error('No demo order exists yet. Call checkout_demo_order after adding an item to the cart.')
    }
    const order = orders.orderById(orderId)
    if (!order) {
      throw new Error('Demo order was not found. Omit orderId to read the current local demo order.')
    }
    const output = {
      orderId: order.id,
      createdAt: order.createdAt,
      status: order.status,
      prescriptionStatus: order.prescriptionStatus,
      total: order.total,
      items: order.items.flatMap((item) => {
        const sku = catalog.skuById(item.skuId)
        const medication = sku ? catalog.medicationById(sku.medicationId) : undefined
        if (!sku || !medication) return []
        return [{
          medication: medication.genericName,
          form: sku.form,
          strength: sku.strength,
          quantity: sku.quantity,
          offerId: item.offerId,
          deliveryOptionId: item.deliveryOptionId,
        }]
      }),
      notice: 'Local demo status only. No pharmacy or prescriber system was contacted.',
    }
    await options.navigate?.(`/orders/${order.id}`)
    return output
  }

  return {
    searchMedications,
    getMedicationDetails,
    compareFulfillmentOptions,
    selectMedicationOption,
    createPrescriptionRequestCard,
    addToCart,
    viewCart,
    compareCartSavings,
    removeCartItem,
    setDeliveryOption,
    checkoutDemoOrder,
    getOrderStatus,
  }
}

export type ClearDoseActions = ReturnType<typeof useClearDoseActions>
export type ClearDoseActionName = keyof ClearDoseActions

export const executeWithActivity = async <T>(input: {
  toolName: string
  source: 'agent' | 'demo'
  args: unknown
  journeyId?: string
  journeyTitle?: string
  run: () => T | Promise<T>
}): Promise<T> => {
  const activity = useAgentActivityStore()
  const event = activity.start(input.toolName, input.source, input.args, {
    journeyId: input.journeyId,
    journeyTitle: input.journeyTitle,
    contextBefore: captureWebMcpContext(),
  })
  const startedAt = performance.now()
  try {
    const output = await input.run()
    activity.succeed(
      event.id,
      output,
      Math.max(0, Math.round(performance.now() - startedAt)),
      captureWebMcpContext(),
    )
    return output
  } catch (error) {
    activity.fail(
      event.id,
      error,
      Math.max(0, Math.round(performance.now() - startedAt)),
      captureWebMcpContext(),
    )
    throw error
  }
}
