import {
  executeWithActivity,
  type CheckoutDemoOrderInput,
  type ClearDoseActions,
  type CompareOptionsInput,
  type CreatePrescriptionCardInput,
  type SearchMedicationInput,
  type SelectOptionInput,
} from '../services/cleardose.actions'
import type { PrescriptionStatus } from '../types/demo-db'
import type {
  ClearDoseToolDefinition,
  ClearDoseToolDescriptor,
  JsonSchema,
  JsonValue,
  WebMcpExecutionOptions,
} from './types'

const objectSchema = (
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

const idSchema = (label: string, pattern: string): JsonSchema => ({
  type: 'string',
  description: label,
  pattern,
  minLength: 1,
  maxLength: 128,
})

const medicationIdSchema = idSchema(
  'ClearDose medication ID returned by search_medications.',
  '^med-[a-z0-9-]+$',
)

const offerIdSchema = idSchema(
  'Exact offer ID returned by compare_fulfillment_options.',
  '^offer-[a-z0-9-]+$',
)

const deliveryOptionIdSchema = idSchema(
  'Delivery option ID attached to the selected offer.',
  '^[a-z0-9-]+$',
)

const exactMedicationProperties: Record<string, JsonSchema> = {
  medicationId: medicationIdSchema,
  form: {
    type: 'string',
    description: 'Exact medication form.',
    enum: ['tablet', 'capsule'],
  },
  strength: {
    type: 'string',
    description: 'Exact displayed strength, including its unit, such as 20 mg.',
    minLength: 1,
    maxLength: 40,
  },
  quantity: {
    type: 'integer',
    description: 'Exact package quantity.',
    enum: [30, 60, 90],
  },
}

const exactSelectionProperties: Record<string, JsonSchema> = {
  offerId: offerIdSchema,
  deliveryOptionId: deliveryOptionIdSchema,
}

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  untrustedContentHint: false,
} as const
const stateChanging = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
  untrustedContentHint: false,
} as const
const idempotentStateChange = {
  ...stateChanging,
  idempotentHint: true,
} as const
const destructiveStateChange = {
  ...stateChanging,
  destructiveHint: true,
  idempotentHint: true,
} as const
const destructiveNonIdempotentStateChange = {
  ...stateChanging,
  destructiveHint: true,
} as const

export const webMcpContractBudgets = {
  toolDescription: 500,
  parameterDescription: 150,
  toolOrParameterName: 30,
  output: 1_500,
} as const

export const webMcpNameBudgetExceptions: Record<string, string> = {
  create_prescription_request_card:
    'Kept for compatibility with the original public challenge contract.',
}

export const clearDoseToolCatalog: ClearDoseToolDescriptor[] = [
  {
    name: 'search_medications',
    title: 'Search medications',
    description:
      'Search the fictional catalog by generic name, brand, category, strength, or form. Use this first when the user names a medication or treatment category. The visible medication results update with the same matches.',
    category: 'discovery',
    inputSchema: objectSchema(
      {
        query: {
          type: 'string',
          description: 'Catalog search text, such as atorvastatin or cholesterol.',
          minLength: 1,
          maxLength: 120,
        },
        form: {
          type: 'string',
          description: 'Optional exact form filter.',
          enum: ['tablet', 'capsule'],
        },
        strength: {
          type: 'string',
          description: 'Optional exact displayed strength filter, such as 20 mg.',
          minLength: 1,
          maxLength: 40,
        },
        offset: {
          type: 'integer',
          description: 'Zero-based result offset. Defaults to 0.',
          minimum: 0,
          maximum: 100,
          default: 0,
        },
        limit: {
          type: 'integer',
          description: 'Maximum matches to return. Defaults to 5. The visible page still shows every match.',
          minimum: 1,
          maximum: 10,
          default: 5,
        },
      },
      ['query'],
    ),
    annotations: idempotentStateChange,
    exampleInput: { query: 'atorvastatin', form: 'tablet', strength: '20 mg' },
  },
  {
    name: 'get_medication_details',
    title: 'Get medication details',
    description:
      'Read valid forms, strengths, quantities, prescription requirement, and SKU count for one medicationId from search_medications. Use this before comparing an unfamiliar medication configuration.',
    category: 'discovery',
    inputSchema: objectSchema({ medicationId: medicationIdSchema }, ['medicationId']),
    annotations: readOnly,
    exampleInput: { medicationId: 'med-atorvastatin' },
  },
  {
    name: 'compare_fulfillment_options',
    title: 'Compare exact fulfillment options',
    description:
      'Compare current pharmacy, delivery, arrival, and total price for one exact SKU. Supply medicationId, form, strength, and quantity together for a new comparison, or omit all four to recompare the current selection.',
    category: 'pricing',
    inputSchema: objectSchema(
      {
        ...exactMedicationProperties,
        maxDeliveryDays: {
          type: 'integer',
          description: 'Optional maximum estimated delivery days. Use 0 to require pickup today.',
          minimum: 0,
          maximum: 30,
        },
        offset: {
          type: 'integer',
          description: 'Zero-based ranked-option offset. Defaults to 0.',
          minimum: 0,
          maximum: 100,
          default: 0,
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum ranked options to return. Defaults to 5 and never changes the visible comparison.',
          minimum: 1,
          maximum: 8,
          default: 5,
        },
      },
      [],
    ),
    annotations: idempotentStateChange,
    exampleInput: {
      medicationId: 'med-atorvastatin',
      form: 'tablet',
      strength: '20 mg',
      quantity: 90,
      maxDeliveryDays: 5,
    },
  },
  {
    name: 'select_medication_option',
    title: 'Select a fulfillment option',
    description:
      'Select one exact offer and its delivery method in the shared ClearDose selection state. Use IDs returned by compare_fulfillment_options.',
    category: 'pricing',
    inputSchema: objectSchema(
      { ...exactSelectionProperties },
      ['offerId', 'deliveryOptionId'],
    ),
    annotations: idempotentStateChange,
    exampleInput: {
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'standard',
    },
  },
  {
    name: 'create_prescription_request_card',
    title: 'Prepare a prescription request card',
    description:
      'Prepare and display a local request card for one offerId and deliveryOptionId from compare_fulfillment_options. The tool derives the exact SKU and never issues or transmits a prescription.',
    category: 'prescription',
    inputSchema: objectSchema(
      {
        ...exactSelectionProperties,
        patientName: {
          type: 'string',
          description: 'Optional demo patient name.',
          minLength: 1,
          maxLength: 100,
        },
        dateOfBirth: {
          type: 'string',
          description: 'Optional demo date of birth in YYYY-MM-DD format.',
          format: 'date',
          maxLength: 10,
        },
        prescriberName: {
          type: 'string',
          description: 'Optional demo prescriber name.',
          minLength: 1,
          maxLength: 100,
        },
        practice: {
          type: 'string',
          description: 'Optional demo practice name.',
          minLength: 1,
          maxLength: 120,
        },
      },
      ['offerId', 'deliveryOptionId'],
    ),
    annotations: stateChanging,
    exampleInput: {
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'standard',
      patientName: 'Optional Demo Patient',
      prescriberName: 'Optional Demo Prescriber',
    },
  },
  {
    name: 'add_to_cart',
    title: 'Add medication to cart',
    description:
      'Add one offerId and deliveryOptionId from compare_fulfillment_options to the local demo cart. Use this after the user chooses an option. The visible cart opens and updates.',
    category: 'commerce',
    inputSchema: objectSchema(
      { ...exactSelectionProperties },
      ['offerId', 'deliveryOptionId'],
    ),
    annotations: stateChanging,
    exampleInput: {
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'standard',
    },
  },
  {
    name: 'view_cart',
    title: 'View cart',
    description:
      'Read the local demo cart, delivery alternatives, totals, and checkout readiness. Use this before changing delivery, removing an item, or creating a demo order.',
    category: 'commerce',
    inputSchema: objectSchema({
      offset: {
        type: 'integer',
        description: 'Zero-based cart item offset. Defaults to 0.',
        minimum: 0,
        maximum: 100,
        default: 0,
      },
      limit: {
        type: 'integer',
        description: 'Maximum cart items to return. Defaults to 3.',
        minimum: 1,
        maximum: 5,
        default: 3,
      },
    }),
    annotations: readOnly,
    exampleInput: {},
  },
  {
    name: 'compare_cart_savings',
    title: 'Compare cart savings',
    description:
      'Compare each current cart line with the lowest delivered total for the same exact SKU. Use after adding one or more medications. Returns current demo-price savings and exact replacement IDs without changing the cart.',
    category: 'pricing',
    inputSchema: objectSchema({
      offset: {
        type: 'integer',
        description: 'Zero-based cart-line offset. Defaults to 0.',
        minimum: 0,
        maximum: 100,
        default: 0,
      },
      limit: {
        type: 'integer',
        description: 'Maximum savings rows to return. Defaults to 5.',
        minimum: 1,
        maximum: 5,
        default: 5,
      },
    }),
    annotations: readOnly,
    exampleInput: {},
  },
  {
    name: 'remove_cart_item',
    title: 'Remove cart item',
    description:
      'Remove one local demo cart item by a cartItemId returned by add_to_cart or view_cart. Use this to correct an unwanted or mistaken addition. The visible cart and totals update.',
    category: 'commerce',
    inputSchema: objectSchema(
      {
        cartItemId: idSchema(
          'Cart item ID returned by add_to_cart or view_cart.',
          '^cart-[A-Za-z0-9-]+$',
        ),
      },
      ['cartItemId'],
    ),
    annotations: destructiveStateChange,
    exampleInput: { cartItemId: 'cart-item-id-from-view-cart' },
  },
  {
    name: 'set_delivery_option',
    title: 'Set cart delivery option',
    description:
      'Change the delivery method for one cart item and immediately recalculate its total and the shared cart grand total.',
    category: 'commerce',
    inputSchema: objectSchema(
      {
        cartItemId: idSchema(
          'Cart item ID returned by add_to_cart or view_cart.',
          '^cart-[A-Za-z0-9-]+$',
        ),
        deliveryOptionId: deliveryOptionIdSchema,
      },
      ['cartItemId', 'deliveryOptionId'],
    ),
    annotations: idempotentStateChange,
    exampleInput: {
      cartItemId: 'cart-item-id-from-view-cart',
      deliveryOptionId: 'express',
    },
  },
  {
    name: 'checkout_demo_order',
    title: 'Place a demo order',
    description:
      'Create a simulated local order from the current cart after the user asks to finish demo checkout. The confirmation route opens. No payment, prescription, or pharmacy request is transmitted.',
    category: 'commerce',
    inputSchema: objectSchema(
      {
        fullName: {
          type: 'string',
          description: 'Demo recipient name.',
          minLength: 1,
          maxLength: 100,
        },
        address: objectSchema(
          {
            line1: {
              type: 'string',
              description: 'Demo street address.',
              minLength: 1,
              maxLength: 120,
            },
            line2: {
              type: 'string',
              description: 'Optional demo apartment or unit.',
              minLength: 1,
              maxLength: 120,
            },
            city: {
              type: 'string',
              description: 'Demo city.',
              minLength: 1,
              maxLength: 80,
            },
            state: {
              type: 'string',
              description: 'Two-letter US state code.',
              pattern: '^[A-Za-z]{2}$',
              minLength: 2,
              maxLength: 2,
            },
            postalCode: {
              type: 'string',
              description: 'Five-digit or ZIP+4 demo postal code.',
              pattern: '^[0-9]{5}(?:-[0-9]{4})?$',
              minLength: 5,
              maxLength: 10,
            },
          },
          ['line1', 'city', 'state', 'postalCode'],
        ),
        prescriptionStatus: {
          type: 'string',
          description: 'How the demo prescription requirement will be handled.',
          enum: ['provider-will-send', 'request-prepared'],
        },
      },
      ['fullName', 'address', 'prescriptionStatus'],
    ),
    annotations: destructiveNonIdempotentStateChange,
    exampleInput: {
      fullName: 'Demo User',
      address: {
        line1: '100 Demo Street',
        city: 'Baltimore',
        state: 'MD',
        postalCode: '21201',
      },
      prescriptionStatus: 'provider-will-send',
    },
  },
  {
    name: 'get_order_status',
    title: 'Get demo order status',
    description:
      'Read a sanitized local demo order status. Supply an orderId from checkout_demo_order, or omit it to inspect the current order. No recipient name or address is returned.',
    category: 'commerce',
    inputSchema: objectSchema(
      {
        orderId: idSchema(
          'Demo order ID returned by checkout_demo_order.',
          '^CD-[0-9]{4}-[0-9]{4}$',
        ),
        itemOffset: {
          type: 'integer',
          description: 'Zero-based order item offset. Defaults to 0.',
          minimum: 0,
          maximum: 100,
          default: 0,
        },
        itemLimit: {
          type: 'integer',
          description: 'Maximum order items to return. Defaults to 5.',
          minimum: 1,
          maximum: 5,
          default: 5,
        },
      },
      [],
    ),
    annotations: readOnly,
    exampleInput: {},
  },
]

export const clearDoseToolNames = clearDoseToolCatalog.map((tool) => tool.name)

type InputRecord = Record<string, unknown>

const asObject = (value: unknown, label = 'Tool input'): InputRecord => {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as InputRecord
}

const assertOnlyKeys = (input: InputRecord, allowed: readonly string[]): void => {
  const unexpected = Object.keys(input).find((key) => !allowed.includes(key))
  if (unexpected) throw new Error(`Unexpected input field: ${unexpected}.`)
}

const requiredString = (input: InputRecord, key: string, maxLength = 128): string => {
  const value = input[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required.`)
  const trimmed = value.trim()
  if (trimmed.length > maxLength) throw new Error(`${key} is too long.`)
  return trimmed
}

const optionalString = (
  input: InputRecord,
  key: string,
  maxLength = 128,
): string | undefined => {
  if (input[key] === undefined) return undefined
  return requiredString(input, key, maxLength)
}

const requiredInteger = (input: InputRecord, key: string): number => {
  const value = input[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${key} must be an integer.`)
  }
  return value
}

const optionalInteger = (input: InputRecord, key: string): number | undefined =>
  input[key] === undefined ? undefined : requiredInteger(input, key)

const assertPattern = (value: string, key: string, pattern: RegExp, format: string): string => {
  if (!pattern.test(value)) throw new Error(`${key} must ${format}.`)
  return value
}

const assertOneOf = <T extends string>(value: string, key: string, allowed: readonly T[]): T => {
  if (!allowed.includes(value as T)) {
    throw new Error(`${key} must be one of: ${allowed.join(', ')}.`)
  }
  return value as T
}

const assertIntegerRange = (
  value: number | undefined,
  key: string,
  minimum: number,
  maximum: number,
): number | undefined => {
  if (value === undefined) return undefined
  if (value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer from ${minimum} to ${maximum}.`)
  }
  return value
}

const medicationId = (value: string): string =>
  assertPattern(value, 'medicationId', /^med-[a-z0-9-]+$/, 'match med-[a-z0-9-]+')

const offerId = (value: string): string =>
  assertPattern(value, 'offerId', /^offer-[a-z0-9-]+$/, 'match offer-[a-z0-9-]+')

const deliveryOptionId = (value: string): string =>
  assertPattern(value, 'deliveryOptionId', /^[a-z0-9-]+$/, 'contain lowercase letters, numbers, or hyphens')

const cartItemId = (value: string): string =>
  assertPattern(value, 'cartItemId', /^cart-[A-Za-z0-9-]+$/, 'match cart-[A-Za-z0-9-]+')

const parseSearchInput = (value: unknown): SearchMedicationInput => {
  const input = asObject(value)
  assertOnlyKeys(input, ['query', 'form', 'strength', 'offset', 'limit'])
  const form = optionalString(input, 'form', 40)
  return {
    query: requiredString(input, 'query', 120),
    form: form ? assertOneOf(form, 'form', ['tablet', 'capsule']) : undefined,
    strength: optionalString(input, 'strength', 40),
    offset: assertIntegerRange(optionalInteger(input, 'offset'), 'offset', 0, 100) ?? 0,
    limit: assertIntegerRange(optionalInteger(input, 'limit'), 'limit', 1, 10) ?? 5,
  }
}

const parseMedicationIdInput = (value: unknown): { medicationId: string } => {
  const input = asObject(value)
  assertOnlyKeys(input, ['medicationId'])
  return { medicationId: medicationId(requiredString(input, 'medicationId')) }
}

const parseCompareInput = (value: unknown): CompareOptionsInput => {
  const input = asObject(value)
  assertOnlyKeys(input, [
    'medicationId',
    'form',
    'strength',
    'quantity',
    'maxDeliveryDays',
    'offset',
    'maxResults',
  ])
  const parsedForm = optionalString(input, 'form', 40)
  const parsedMedicationId = optionalString(input, 'medicationId')
  const quantity = optionalInteger(input, 'quantity')
  if (quantity !== undefined && ![30, 60, 90].includes(quantity)) {
    throw new Error('quantity must be one of: 30, 60, 90.')
  }
  return {
    medicationId: parsedMedicationId ? medicationId(parsedMedicationId) : undefined,
    form: parsedForm ? assertOneOf(parsedForm, 'form', ['tablet', 'capsule']) : undefined,
    strength: optionalString(input, 'strength', 40),
    quantity,
    maxDeliveryDays: assertIntegerRange(
      optionalInteger(input, 'maxDeliveryDays'),
      'maxDeliveryDays',
      0,
      30,
    ),
    offset: assertIntegerRange(optionalInteger(input, 'offset'), 'offset', 0, 100) ?? 0,
    maxResults:
      assertIntegerRange(optionalInteger(input, 'maxResults'), 'maxResults', 1, 8) ?? 5,
  }
}

const parseSelectionInput = (value: unknown): SelectOptionInput => {
  const input = asObject(value)
  assertOnlyKeys(input, ['offerId', 'deliveryOptionId'])
  return {
    offerId: offerId(requiredString(input, 'offerId')),
    deliveryOptionId: deliveryOptionId(requiredString(input, 'deliveryOptionId')),
  }
}

const parsePrescriptionInput = (value: unknown): CreatePrescriptionCardInput => {
  const input = asObject(value)
  assertOnlyKeys(input, [
    'offerId',
    'deliveryOptionId',
    'patientName',
    'dateOfBirth',
    'prescriberName',
    'practice',
  ])
  const dateOfBirth = optionalString(input, 'dateOfBirth', 10)
  if (dateOfBirth) {
    assertPattern(dateOfBirth, 'dateOfBirth', /^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD format')
    const parsedDate = new Date(`${dateOfBirth}T00:00:00.000Z`)
    if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== dateOfBirth) {
      throw new Error('dateOfBirth must be a real calendar date in YYYY-MM-DD format.')
    }
  }
  return {
    offerId: offerId(requiredString(input, 'offerId')),
    deliveryOptionId: deliveryOptionId(requiredString(input, 'deliveryOptionId')),
    patientName: optionalString(input, 'patientName', 100),
    dateOfBirth,
    prescriberName: optionalString(input, 'prescriberName', 100),
    practice: optionalString(input, 'practice', 120),
  }
}

const parseSetDeliveryInput = (
  value: unknown,
): { cartItemId: string; deliveryOptionId: string } => {
  const input = asObject(value)
  assertOnlyKeys(input, ['cartItemId', 'deliveryOptionId'])
  return {
    cartItemId: cartItemId(requiredString(input, 'cartItemId')),
    deliveryOptionId: deliveryOptionId(requiredString(input, 'deliveryOptionId')),
  }
}

const parseRemoveCartItemInput = (value: unknown): { cartItemId: string } => {
  const input = asObject(value)
  assertOnlyKeys(input, ['cartItemId'])
  return { cartItemId: cartItemId(requiredString(input, 'cartItemId')) }
}

interface PageInput {
  offset: number
  limit: number
}

const parsePageInput = (value: unknown): PageInput => {
  const input = asObject(value)
  assertOnlyKeys(input, ['offset', 'limit'])
  return {
    offset: assertIntegerRange(optionalInteger(input, 'offset'), 'offset', 0, 100) ?? 0,
    limit: assertIntegerRange(optionalInteger(input, 'limit'), 'limit', 1, 5) ?? 3,
  }
}

const parseCheckoutInput = (value: unknown): CheckoutDemoOrderInput => {
  const input = asObject(value)
  assertOnlyKeys(input, ['fullName', 'address', 'prescriptionStatus'])
  const address = asObject(input.address, 'address')
  assertOnlyKeys(address, ['line1', 'line2', 'city', 'state', 'postalCode'])
  const prescriptionStatus = requiredString(input, 'prescriptionStatus')
  if (!['provider-will-send', 'request-prepared'].includes(prescriptionStatus)) {
    throw new Error('prescriptionStatus must be provider-will-send or request-prepared.')
  }
  const state = assertPattern(
    requiredString(address, 'state', 2).toUpperCase(),
    'state',
    /^[A-Z]{2}$/,
    'be a two-letter US state code',
  )
  const postalCode = assertPattern(
    requiredString(address, 'postalCode', 10),
    'postalCode',
    /^[0-9]{5}(?:-[0-9]{4})?$/,
    'be a five-digit ZIP code or ZIP+4',
  )
  return {
    fullName: requiredString(input, 'fullName', 100),
    address: {
      line1: requiredString(address, 'line1', 120),
      line2: optionalString(address, 'line2', 120),
      city: requiredString(address, 'city', 80),
      state,
      postalCode,
    },
    prescriptionStatus: prescriptionStatus as PrescriptionStatus,
  }
}

interface OrderStatusInput {
  orderId?: string
  itemOffset: number
  itemLimit: number
}

const parseOrderIdInput = (value: unknown): OrderStatusInput => {
  const input = asObject(value)
  assertOnlyKeys(input, ['orderId', 'itemOffset', 'itemLimit'])
  const parsedOrderId = optionalString(input, 'orderId')
  return {
    orderId: parsedOrderId
      ? assertPattern(parsedOrderId, 'orderId', /^CD-[0-9]{4}-[0-9]{4}$/, 'match CD-YYYY-NNNN')
      : undefined,
    itemOffset:
      assertIntegerRange(optionalInteger(input, 'itemOffset'), 'itemOffset', 0, 100) ?? 0,
    itemLimit:
      assertIntegerRange(optionalInteger(input, 'itemLimit'), 'itemLimit', 1, 5) ?? 5,
  }
}

const toJsonValue = (value: unknown): JsonValue => {
  const serialized = JSON.stringify(value)
  return serialized === undefined ? null : (JSON.parse(serialized) as JsonValue)
}

const jsonObject = (value: JsonValue): Record<string, JsonValue> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}

const jsonArray = (value: JsonValue | undefined): JsonValue[] =>
  Array.isArray(value) ? value : []

const compactOption = (value: JsonValue): JsonValue => {
  const option = jsonObject(value)
  return {
    offerId: option.offerId ?? null,
    deliveryOptionId: option.deliveryOptionId ?? null,
    pharmacy: option.pharmacy ?? null,
    medicationSubtotal: option.medicationSubtotal ?? null,
    deliveryMethod: option.deliveryMethod ?? null,
    deliveryPrice: option.deliveryPrice ?? null,
    estimatedDays: [option.estimatedMinDays ?? null, option.estimatedMaxDays ?? null],
    total: option.total ?? null,
    labels: option.labels ?? [],
  }
}

const compactCartItem = (value: JsonValue): JsonValue => {
  const item = jsonObject(value)
  return {
    cartItemId: item.cartItemId ?? null,
    medication: item.medication ?? null,
    form: item.form ?? null,
    strength: item.strength ?? null,
    quantity: item.quantity ?? null,
    pharmacy: item.pharmacy ?? null,
    selectedDelivery: item.selectedDelivery ?? null,
    deliveryOptions: jsonArray(item.deliveryOptions).map((entry) => {
      const delivery = jsonObject(entry)
      return {
        deliveryOptionId: delivery.deliveryOptionId ?? null,
        label: delivery.label ?? null,
        price: delivery.price ?? null,
        estimatedDays: [delivery.estimatedMinDays ?? null, delivery.estimatedMaxDays ?? null],
        itemTotal: delivery.itemTotal ?? null,
      }
    }),
    total: item.total ?? null,
  }
}

const compactSavingsItem = (value: JsonValue): JsonValue => {
  const item = jsonObject(value)
  const current = jsonObject(item.current ?? null)
  const replacement = jsonObject(item.replacement ?? null)
  return {
    cartItemId: item.cartItemId ?? null,
    medication: item.medication ?? null,
    sku: {
      form: item.form ?? null,
      strength: item.strength ?? null,
      quantity: item.quantity ?? null,
    },
    currentTotal: item.currentTotal ?? null,
    bestAvailableTotal: item.bestAvailableTotal ?? null,
    potentialSavings: item.savings ?? 0,
    comparisonAvailable: item.comparisonAvailable ?? false,
    isLowestAvailable: item.isLowestAvailable ?? null,
    recommendedAction: item.recommendedAction ?? null,
    current: {
      offerId: current.offerId ?? null,
      deliveryOptionId: current.deliveryOptionId ?? null,
      pharmacy: current.pharmacy ?? null,
    },
    replacement: item.replacement === null
      ? null
      : {
          offerId: replacement.offerId ?? null,
          deliveryOptionId: replacement.deliveryOptionId ?? null,
          pharmacy: replacement.pharmacy ?? null,
          estimatedDays: [
            replacement.estimatedMinDays ?? null,
            replacement.estimatedMaxDays ?? null,
          ],
        },
  }
}

const page = (items: JsonValue[], offset: number, limit: number) => ({
  returned: Math.min(Math.max(0, items.length - offset), limit),
  truncated: offset + limit < items.length,
  nextOffset: offset + limit < items.length ? offset + limit : null,
  items: items.slice(offset, offset + limit),
})

const compactToolOutput = (toolName: string, args: unknown, value: unknown): JsonValue => {
  const output = jsonObject(toJsonValue(value))
  const input = asObject(args)

  if (toolName === 'search_medications') {
    const total = typeof output.count === 'number' ? output.count : 0
    const offset = typeof output.offset === 'number' ? output.offset : 0
    const results = jsonArray(output.results)
    return {
      ...output,
      truncated: offset + results.length < total,
      nextOffset: offset + results.length < total ? offset + results.length : null,
    }
  }

  if (toolName === 'compare_fulfillment_options') {
    const options = jsonArray(output.options)
    const offset = typeof input.offset === 'number' ? input.offset : 0
    const limit = typeof input.maxResults === 'number' ? input.maxResults : 5
    const resultPage = page(options.map(compactOption), offset, limit)
    return {
      medication: output.medication ?? null,
      totalOptions: options.length,
      offset,
      returned: resultPage.returned,
      truncated: resultPage.truncated,
      nextOffset: resultPage.nextOffset,
      options: resultPage.items,
      lowestTotalOptionId: output.lowestTotalOptionId ?? null,
      fastestOptionId: output.fastestOptionId ?? null,
      selectedOptionId: output.selectedOptionId ?? null,
      selectedOptionIsLowest: output.selectedOptionIsLowest ?? false,
      pricingScenario: output.pricingScenario ?? null,
      route: output.route ?? '/compare',
      nextAction: output.nextAction ?? null,
    }
  }

  if (toolName === 'view_cart') {
    const items = jsonArray(output.items)
    const offset = typeof input.offset === 'number' ? input.offset : 0
    const limit = typeof input.limit === 'number' ? input.limit : 3
    const resultPage = page(items.map(compactCartItem), offset, limit)
    return {
      itemCount: output.itemCount ?? items.length,
      offset,
      returned: resultPage.returned,
      truncated: resultPage.truncated,
      nextOffset: resultPage.nextOffset,
      items: resultPage.items,
      subtotal: output.subtotal ?? 0,
      deliveryTotal: output.deliveryTotal ?? 0,
      grandTotal: output.grandTotal ?? 0,
      readyForCheckout: output.readyForCheckout ?? false,
      checkoutRoute: output.checkoutRoute ?? '/checkout',
      checkoutRequirements: output.checkoutRequirements ?? null,
      nextAction: output.nextAction ?? null,
    }
  }

  if (toolName === 'compare_cart_savings') {
    const items = jsonArray(output.items)
    const offset = typeof input.offset === 'number' ? input.offset : 0
    const limit = typeof input.limit === 'number' ? input.limit : 5
    const resultPage = page(items.map(compactSavingsItem), offset, limit)
    return {
      itemCount: output.itemCount ?? items.length,
      offset,
      returned: resultPage.returned,
      truncated: resultPage.truncated,
      nextOffset: resultPage.nextOffset,
      items: resultPage.items,
      currentTotal: output.currentTotal ?? 0,
      optimizedTotal: output.optimizedTotal ?? 0,
      potentialSavings: output.potentialSavings ?? 0,
      itemsWithSavings: output.itemsWithSavings ?? 0,
      pricingScenario: output.pricingScenario ?? null,
      effectiveAt: output.effectiveAt ?? null,
      basis: output.basis ?? null,
      nextAction: output.nextAction ?? null,
    }
  }

  if (toolName === 'get_order_status') {
    const items = jsonArray(output.items)
    const offset = typeof input.itemOffset === 'number' ? input.itemOffset : 0
    const limit = typeof input.itemLimit === 'number' ? input.itemLimit : 5
    const resultPage = page(items, offset, limit)
    return {
      orderId: output.orderId ?? null,
      createdAt: output.createdAt ?? null,
      status: output.status ?? null,
      prescriptionStatus: output.prescriptionStatus ?? null,
      total: output.total ?? null,
      itemCount: items.length,
      itemOffset: offset,
      returned: resultPage.returned,
      truncated: resultPage.truncated,
      nextItemOffset: resultPage.nextOffset,
      items: resultPage.items,
      notice: output.notice ?? null,
    }
  }

  return output
}

const enforceOutputBudget = (toolName: string, value: JsonValue): JsonValue => {
  const serialized = JSON.stringify(value)
  if (serialized.length <= webMcpContractBudgets.output) return value

  const output = jsonObject(value)
  for (const key of ['results', 'options', 'items']) {
    const entries = jsonArray(output[key])
    while (entries.length > 1 && JSON.stringify(output).length > webMcpContractBudgets.output) {
      entries.pop()
      output[key] = entries
    }
    if (output[key] === entries) {
      const offsetKey = key === 'items' && 'itemOffset' in output ? 'itemOffset' : 'offset'
      const nextOffsetKey = key === 'items' && 'nextItemOffset' in output
        ? 'nextItemOffset'
        : 'nextOffset'
      const totalKey = key === 'results'
        ? 'count'
        : key === 'options'
          ? 'totalOptions'
          : 'itemCount'
      const offset = typeof output[offsetKey] === 'number' ? output[offsetKey] : 0
      const total = typeof output[totalKey] === 'number' ? output[totalKey] : entries.length
      const hasMore = offset + entries.length < total
      output.returned = entries.length
      output.truncated = hasMore
      output[nextOffsetKey] = hasMore ? offset + entries.length : null
    }
  }
  if (JSON.stringify(output).length <= webMcpContractBudgets.output) return output

  return {
    truncated: true,
    message: `${toolName} produced more detail than the WebMCP output budget allows.`,
    nextAction: `Run ${toolName} again with a smaller limit or a more specific query.`,
  }
}

interface ParsedToolExecution {
  args: unknown
  output: unknown | Promise<unknown>
}

const execute = async (
  toolName: string,
  source: 'agent' | 'demo',
  rawArgs: unknown,
  options: WebMcpExecutionOptions | undefined,
  run: () => ParsedToolExecution | Promise<ParsedToolExecution>,
): Promise<JsonValue> => {
  return executeWithActivity({
    toolName,
    source,
    args: rawArgs,
    run: async () => {
      options?.signal?.throwIfAborted()
      const parsed = await run()
      return enforceOutputBudget(
        toolName,
        compactToolOutput(toolName, parsed.args, await parsed.output),
      )
    },
  })
}

export const createClearDoseToolDefinitions = (
  actions: ClearDoseActions,
  source: 'agent' | 'demo' = 'agent',
): ClearDoseToolDefinition[] =>
  clearDoseToolCatalog.map((descriptor) => ({
    ...descriptor,
    execute: (input: unknown, options?: WebMcpExecutionOptions): Promise<JsonValue> => {
      switch (descriptor.name) {
        case 'search_medications': {
          return execute(descriptor.name, source, input, options, () => {
            const args = parseSearchInput(input)
            return { args, output: actions.searchMedications(args) }
          })
        }
        case 'get_medication_details': {
          return execute(descriptor.name, source, input, options, () => {
            const args = parseMedicationIdInput(input)
            return { args, output: actions.getMedicationDetails(args) }
          })
        }
        case 'compare_fulfillment_options': {
          return execute(descriptor.name, source, input, options, () => {
            const args = parseCompareInput(input)
            return { args, output: actions.compareFulfillmentOptions(args) }
          })
        }
        case 'select_medication_option': {
          return execute(descriptor.name, source, input, options, () => {
            const args = parseSelectionInput(input)
            return { args, output: actions.selectMedicationOption(args) }
          })
        }
        case 'create_prescription_request_card': {
          return execute(descriptor.name, source, input, options, () => {
            const args = parsePrescriptionInput(input)
            return { args, output: actions.createPrescriptionRequestCard(args) }
          })
        }
        case 'add_to_cart': {
          return execute(descriptor.name, source, input, options, () => {
            const args = parseSelectionInput(input)
            return { args, output: actions.addToCart(args) }
          })
        }
        case 'view_cart': {
          return execute(descriptor.name, source, input, options, () => {
            const args = parsePageInput(input)
            return { args, output: actions.viewCart() }
          })
        }
        case 'compare_cart_savings': {
          return execute(descriptor.name, source, input, options, () => {
            const args = parsePageInput(input)
            return { args, output: actions.compareCartSavings() }
          })
        }
        case 'remove_cart_item': {
          return execute(descriptor.name, source, input, options, () => {
            const args = parseRemoveCartItemInput(input)
            return { args, output: actions.removeCartItem(args) }
          })
        }
        case 'set_delivery_option': {
          return execute(descriptor.name, source, input, options, () => {
            const args = parseSetDeliveryInput(input)
            return { args, output: actions.setDeliveryOption(args) }
          })
        }
        case 'checkout_demo_order': {
          return execute(descriptor.name, source, input, options, () => {
            const args = parseCheckoutInput(input)
            return { args, output: actions.checkoutDemoOrder(args) }
          })
        }
        case 'get_order_status': {
          return execute(descriptor.name, source, input, options, () => {
            const args = parseOrderIdInput(input)
            return { args, output: actions.getOrderStatus(args) }
          })
        }
        default:
          throw new Error(`Unknown ClearDose tool: ${descriptor.name}.`)
      }
    },
  }))
