import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useClearDoseActions } from '../../src/services/cleardose.actions'
import { useAgentActivityStore } from '../../src/stores/agentActivity.store'
import { useCartStore } from '../../src/stores/cart.store'
import { useOrderStore } from '../../src/stores/order.store'
import { usePrescriptionStore } from '../../src/stores/prescription.store'
import { useSelectionStore } from '../../src/stores/selection.store'
import type { JsonSchema, JsonValue } from '../../src/webmcp/types'
import {
  clearDoseToolCatalog,
  clearDoseToolNames,
  createClearDoseToolDefinitions,
} from '../../src/webmcp/definitions'
import evalDatasetJson from './cleardose-evals.json'

type EvalCategory = 'direct' | 'ambiguous' | 'wrong-order' | 'multi-step' | 'recovery'

interface EvalMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ExpectedCall {
  functionName: string
  arguments: Record<string, JsonValue>
  expectedError?: string
}

interface OrderingRule {
  before: string
  after: string
}

interface ClearDoseEvalCase {
  id: string
  category: EvalCategory
  messages: EvalMessage[]
  expectedCall: ExpectedCall[]
  orderingRules?: OrderingRule[]
  counterexampleCallOrder?: string[]
}

interface ClearDoseEvalDataset {
  schemaVersion: string
  name: string
  source: {
    title: string
    url: string
    reviewedAt: string
  }
  availableTools: string[]
  bindings: Record<string, string>
  cases: ClearDoseEvalCase[]
}

interface ExecutedCall {
  functionName: string
  status: 'success' | 'error'
  arguments: Record<string, JsonValue>
  output?: JsonValue
  error?: string
}

const dataset = evalDatasetJson as ClearDoseEvalDataset

const isRecord = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function expectSchemaMatch(value: unknown, schema: JsonSchema, path: string): void {
  if (schema.enum) expect(schema.enum, `${path} must use a declared enum value`).toContain(value)

  switch (schema.type) {
    case 'object': {
      expect(isRecord(value), `${path} must be an object`).toBe(true)
      if (!isRecord(value)) return
      const properties = schema.properties ?? {}
      for (const required of schema.required ?? []) {
        expect(
          Object.prototype.hasOwnProperty.call(value, required),
          `${path}.${required} is required`,
        ).toBe(true)
      }
      if (schema.additionalProperties === false) {
        expect(
          Object.keys(value).filter((key) => !Object.prototype.hasOwnProperty.call(properties, key)),
          `${path} has unexpected fields`,
        ).toEqual([])
      }
      for (const [key, childValue] of Object.entries(value)) {
        const childSchema = properties[key]
        expect(childSchema, `${path}.${key} must exist in the current tool schema`).toBeDefined()
        if (childSchema) expectSchemaMatch(childValue, childSchema, `${path}.${key}`)
      }
      return
    }
    case 'array': {
      expect(Array.isArray(value), `${path} must be an array`).toBe(true)
      if (Array.isArray(value) && schema.items) {
        value.forEach((item, index) => expectSchemaMatch(item, schema.items as JsonSchema, `${path}[${index}]`))
      }
      return
    }
    case 'string': {
      expect(typeof value, `${path} must be a string`).toBe('string')
      if (typeof value !== 'string') return
      if (schema.minLength !== undefined) expect(value.length).toBeGreaterThanOrEqual(schema.minLength)
      if (schema.maxLength !== undefined) expect(value.length).toBeLessThanOrEqual(schema.maxLength)
      if (schema.pattern) expect(value).toMatch(new RegExp(schema.pattern))
      return
    }
    case 'integer':
      expect(Number.isInteger(value), `${path} must be an integer`).toBe(true)
      if (typeof value === 'number' && schema.minimum !== undefined) {
        expect(value).toBeGreaterThanOrEqual(schema.minimum)
      }
      if (typeof value === 'number' && schema.maximum !== undefined) {
        expect(value).toBeLessThanOrEqual(schema.maximum)
      }
      return
    case 'number':
      expect(typeof value, `${path} must be a number`).toBe('number')
      return
    case 'boolean':
      expect(typeof value, `${path} must be a boolean`).toBe('boolean')
      return
  }
}

function findEval(id: string): ClearDoseEvalCase {
  const evalCase = dataset.cases.find((candidate) => candidate.id === id)
  if (!evalCase) throw new Error(`Missing ClearDose eval case ${id}.`)
  return evalCase
}

function respectsOrdering(sequence: readonly string[], rules: readonly OrderingRule[]): boolean {
  return rules.every((rule) => {
    const before = sequence.indexOf(rule.before)
    const after = sequence.indexOf(rule.after)
    return before >= 0 && after >= 0 && before < after
  })
}

function resolveBindings(value: JsonValue, bindings: ReadonlyMap<string, JsonValue>): JsonValue {
  if (typeof value === 'string') return bindings.get(value) ?? value
  if (Array.isArray(value)) return value.map((item) => resolveBindings(item, bindings))
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, childValue]) => [key, resolveBindings(childValue, bindings)]),
  )
}

async function executeEval(evalCase: ClearDoseEvalCase): Promise<ExecutedCall[]> {
  const definitions = new Map(
    createClearDoseToolDefinitions(useClearDoseActions(), 'demo').map((definition) => [
      definition.name,
      definition,
    ]),
  )
  const runtimeBindings = new Map<string, JsonValue>()
  const calls: ExecutedCall[] = []
  const cartBinding = Object.entries(dataset.bindings).find(
    ([, source]) => source === 'add_to_cart.cartItemId',
  )?.[0]

  for (const expected of evalCase.expectedCall) {
    const definition = definitions.get(expected.functionName)
    if (!definition) throw new Error(`Unknown eval tool ${expected.functionName}.`)
    const resolved = resolveBindings(expected.arguments, runtimeBindings)
    if (!isRecord(resolved)) throw new Error('Expected tool arguments to remain an object.')

    if (expected.expectedError) {
      let thrown: unknown
      try {
        await definition.execute(resolved)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(Error)
      const message = thrown instanceof Error ? thrown.message : ''
      expect(message).toBe(expected.expectedError)
      calls.push({
        functionName: expected.functionName,
        status: 'error',
        arguments: resolved,
        error: message,
      })
      continue
    }

    const output = await definition.execute(resolved)
    calls.push({
      functionName: expected.functionName,
      status: 'success',
      arguments: resolved,
      output,
    })

    if (expected.functionName === 'add_to_cart' && cartBinding && isRecord(output)) {
      if (typeof output.cartItemId === 'string') {
        runtimeBindings.set(cartBinding, output.cartItemId)
      }
    }
  }

  return calls
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

describe('Chrome-style ClearDose WebMCP eval dataset', () => {
  it('uses the complete current tool list and covers every tool in expected calls', () => {
    expect(dataset.source).toEqual({
      title: 'Evals for WebMCP',
      url: 'https://developer.chrome.com/docs/ai/webmcp/evals',
      reviewedAt: '2026-08-31',
    })
    expect(dataset.availableTools).toEqual(clearDoseToolNames)
    expect(clearDoseToolCatalog.map((tool) => tool.name)).toEqual(dataset.availableTools)

    const coveredTools = new Set(
      dataset.cases.flatMap((evalCase) =>
        evalCase.expectedCall.map((expected) => expected.functionName),
      ),
    )
    expect([...coveredTools].sort()).toEqual([...clearDoseToolNames].sort())
    expect(new Set(dataset.cases.map((evalCase) => evalCase.category))).toEqual(
      new Set<EvalCategory>(['direct', 'ambiguous', 'wrong-order', 'multi-step', 'recovery']),
    )
  })

  it('keeps user messages, expected tool names, and arguments valid against current schemas', () => {
    const toolByName = new Map(clearDoseToolCatalog.map((tool) => [tool.name, tool]))

    for (const tool of clearDoseToolCatalog) {
      expectSchemaMatch(tool.exampleInput, tool.inputSchema, `${tool.name}.exampleInput`)
    }

    for (const evalCase of dataset.cases) {
      expect(evalCase.messages.length, `${evalCase.id} must include a message`).toBeGreaterThan(0)
      expect(
        evalCase.messages.some((message) => message.role === 'user' && message.content.trim()),
        `${evalCase.id} must include a user message`,
      ).toBe(true)
      expect(evalCase.expectedCall.length, `${evalCase.id} must expect a call`).toBeGreaterThan(0)

      for (const expected of evalCase.expectedCall) {
        const tool = toolByName.get(expected.functionName)
        expect(tool, `${evalCase.id} references an unknown tool`).toBeDefined()
        if (tool) {
          expectSchemaMatch(
            expected.arguments,
            tool.inputSchema,
            `${evalCase.id}.${expected.functionName}.arguments`,
          )
        }
      }
    }

    expect(findEval('direct-search-by-generic').expectedCall).toEqual([
      {
        functionName: 'search_medications',
        arguments: { query: 'atorvastatin', form: 'tablet', strength: '20 mg' },
      },
    ])
    expect(
      findEval('ambiguous-lowest-five-day-total').expectedCall.map(
        (expected) => expected.functionName,
      ),
    ).toEqual(['search_medications', 'compare_fulfillment_options'])
  })

  it('accepts the correct checkout order and rejects checkout before add-to-cart', () => {
    const evalCase = findEval('wrong-order-checkout-before-cart')
    const rules = evalCase.orderingRules ?? []
    const expectedOrder = evalCase.expectedCall.map((expected) => expected.functionName)

    expect(rules.length).toBeGreaterThan(0)
    expect(respectsOrdering(expectedOrder, rules)).toBe(true)
    expect(respectsOrdering(evalCase.counterexampleCallOrder ?? [], rules)).toBe(false)
    expect(expectedOrder).toEqual([
      'search_medications',
      'compare_fulfillment_options',
      'select_medication_option',
      'add_to_cart',
      'set_delivery_option',
      'checkout_demo_order',
      'get_order_status',
    ])
  })

  it('executes the ambiguous search-to-comparison chain through current definitions', async () => {
    const calls = await executeEval(findEval('ambiguous-lowest-five-day-total'))

    expect(calls.map((call) => [call.functionName, call.status])).toEqual([
      ['search_medications', 'success'],
      ['compare_fulfillment_options', 'success'],
    ])
    expect(useSelectionStore()).toMatchObject({
      medicationId: 'med-atorvastatin',
      skuId: 'sku-atorvastatin-tablet-20mg-90',
      offerId: null,
    })
    expect(calls[1]?.output).toMatchObject({
      lowestTotalOptionId: 'offer-atorvastatin-20-90-cleardose:standard',
      pricingScenario: 'Current prices',
    })
  })

  it('recompares the current exact selection without repeating its identifiers', async () => {
    const calls = await executeEval(findEval('ambiguous-recompare-current-selection'))

    expect(calls.map((call) => call.functionName)).toEqual([
      'compare_fulfillment_options',
      'select_medication_option',
      'compare_fulfillment_options',
    ])
    expect(calls.at(-1)?.arguments).toEqual({ maxDeliveryDays: 5 })
    expect(calls.at(-1)?.output).toMatchObject({
      selectedOptionId: 'offer-atorvastatin-20-90-cleardose:standard',
      selectedOptionIsLowest: true,
    })
  })

  it('executes the prescription journey and leaves shared request and cart state', async () => {
    const evalCase = findEval('multi-step-prescription-and-cart')
    const calls = await executeEval(evalCase)

    expect(calls.map((call) => call.functionName)).toEqual(
      evalCase.expectedCall.map((expected) => expected.functionName),
    )
    expect(calls.every((call) => call.status === 'success')).toBe(true)
    expect(usePrescriptionStore().latestRequest).toMatchObject({
      medicationId: 'med-atorvastatin',
      skuId: 'sku-atorvastatin-tablet-20mg-90',
      patientName: 'Demo Patient',
      estimatedTotal: 17.8,
      status: 'prepared',
    })
    expect(useCartStore()).toMatchObject({
      itemCount: 1,
      medicationSubtotal: 12.8,
      deliveryTotal: 5,
      grandTotal: 17.8,
    })
    expect(
      [...useAgentActivityStore().entries].reverse().map((entry) => entry.toolName),
    ).toEqual(evalCase.expectedCall.map((expected) => expected.functionName))
  })

  it('executes the valid commerce chain with a cart ID bound from the prior result', async () => {
    const evalCase = findEval('wrong-order-checkout-before-cart')
    const calls = await executeEval(evalCase)
    const deliveryCall = calls.find((call) => call.functionName === 'set_delivery_option')

    expect(deliveryCall?.arguments.cartItemId).toMatch(/^cart-/)
    expect(deliveryCall?.arguments.cartItemId).not.toBe('cart-result')
    expect(useOrderStore().currentOrder).toMatchObject({
      id: 'CD-2026-0001',
      total: 21.8,
      status: 'demo-order-created',
      items: [{ deliveryOptionId: 'express' }],
    })
    expect(useCartStore().itemCount).toBe(0)
    expect(calls.at(-1)?.output).toMatchObject({
      orderId: 'CD-2026-0001',
      total: 21.8,
      status: 'demo-order-created',
    })
  })

  it('executes the direct remove-item correction through its current definition', async () => {
    const actions = useClearDoseActions()
    const added = actions.addToCart({
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'standard',
    })
    const definition = createClearDoseToolDefinitions(actions, 'demo').find(
      (candidate) => candidate.name === 'remove_cart_item',
    )
    const expected = findEval('direct-remove-cart-item').expectedCall[0]

    expect(definition).toBeDefined()
    if (!definition) throw new Error('Missing remove_cart_item definition.')
    expect(expected).toMatchObject({
      functionName: 'remove_cart_item',
      arguments: { cartItemId: 'cart-result' },
    })
    await expect(
      definition.execute({ cartItemId: added.cartItem.id }),
    ).resolves.toMatchObject({
      removedCartItemId: added.cartItem.id,
      cartCount: 0,
      grandTotal: 0,
    })
    expect(useCartStore().itemCount).toBe(0)
  })

  it('records a mid-chain failure, inspects valid choices, and recovers on the retry', async () => {
    const evalCase = findEval('mid-chain-unavailable-strength-recovery')
    const calls = await executeEval(evalCase)

    expect(calls.map((call) => call.status)).toEqual([
      'success',
      'error',
      'success',
      'success',
      'success',
    ])
    expect(calls[1]).toMatchObject({
      functionName: 'compare_fulfillment_options',
      error:
        'That exact medication configuration is unavailable. Call get_medication_details to read valid forms, strengths, and quantities.',
    })
    expect(calls.slice(2).map((call) => call.functionName)).toEqual([
      'get_medication_details',
      'compare_fulfillment_options',
      'select_medication_option',
    ])
    expect(useSelectionStore()).toMatchObject({
      skuId: 'sku-atorvastatin-tablet-20mg-90',
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'standard',
    })
    expect(
      [...useAgentActivityStore().entries].reverse().map((entry) => entry.status),
    ).toEqual(['success', 'error', 'success', 'success', 'success'])
  })
})
