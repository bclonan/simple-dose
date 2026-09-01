import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAgentActivityStore } from '../stores/agentActivity.store'
import { useCartStore } from '../stores/cart.store'
import { useCatalogStore } from '../stores/catalog.store'
import { useWebMcpStore } from '../stores/webmcp.store'
import {
  clearDoseToolCatalog,
  clearDoseToolNames,
  webMcpContractBudgets,
  webMcpNameBudgetExceptions,
} from './definitions'
import { registerClearDoseTools } from './register'
import { executeTool } from './support'
import type {
  JsonValue,
  RegisteredWebMcpTool,
  WebMcpDocumentLike,
  WebMcpExecutionOptions,
  WebMcpModelContext,
  WebMcpRegistrationOptions,
  WebMcpToolDefinition,
} from './types'

const expectedNames = [
  'search_medications',
  'get_medication_details',
  'compare_fulfillment_options',
  'select_medication_option',
  'create_prescription_request_card',
  'add_to_cart',
  'view_cart',
  'remove_cart_item',
  'set_delivery_option',
  'checkout_demo_order',
  'get_order_status',
]

const readOnlyNames = new Set([
  'get_medication_details',
  'view_cart',
  'get_order_status',
])
const destructiveNames = new Set(['remove_cart_item', 'checkout_demo_order'])

const expectSchemaBudgets = (schema: WebMcpToolDefinition['inputSchema']): void => {
  if (schema.description) {
    expect(schema.description.length).toBeLessThanOrEqual(
      webMcpContractBudgets.parameterDescription,
    )
  }
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    expect(name.length).toBeLessThanOrEqual(webMcpContractBudgets.toolOrParameterName)
    expectSchemaBudgets(child)
  }
  if (schema.items) expectSchemaBudgets(schema.items)
}

interface FakeWebMcp {
  context: WebMcpModelContext
  documentRef: WebMcpDocumentLike
  definitions: Map<string, WebMcpToolDefinition>
  signals: AbortSignal[]
  executedInputs: string[]
  remove(name: string): void
}

const createFakeWebMcp = (): FakeWebMcp => {
  const definitions = new Map<string, WebMcpToolDefinition>()
  const signals: AbortSignal[] = []
  const executedInputs: string[] = []
  const events = new EventTarget()

  const registeredTools = (): RegisteredWebMcpTool[] =>
    [...definitions.values()].map((definition) => ({
      name: definition.name,
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: definition.annotations,
    }))

  const context: WebMcpModelContext = {
    async registerTool(
      definition: WebMcpToolDefinition,
      options: WebMcpRegistrationOptions,
    ): Promise<void> {
      definitions.set(definition.name, definition)
      signals.push(options.signal)
      options.signal.addEventListener(
        'abort',
        () => {
          definitions.delete(definition.name)
          events.dispatchEvent(new Event('toolchange'))
        },
        { once: true },
      )
    },
    getTools: async () => registeredTools(),
    executeTool: async (
      tool: RegisteredWebMcpTool,
      input = '{}',
      options?: WebMcpExecutionOptions,
    ): Promise<string> => {
      const definition = definitions.get(tool.name)
      if (!definition) throw new Error('Tool not found.')
      if (typeof input !== 'string') throw new Error('Native executeTool input must be JSON text.')
      executedInputs.push(input)
      const parsed = JSON.parse(input) as unknown
      return JSON.stringify(await definition.execute(parsed, options))
    },
    addEventListener: (type, listener) => events.addEventListener(type, listener),
    removeEventListener: (type, listener) => events.removeEventListener(type, listener),
  }

  return {
    context,
    documentRef: { modelContext: context },
    definitions,
    signals,
    executedInputs,
    remove(name: string): void {
      definitions.delete(name)
      events.dispatchEvent(new Event('toolchange'))
    },
  }
}

describe('ClearDose WebMCP registration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defines eleven focused tools with strict schemas and accurate annotations', () => {
    expect(clearDoseToolNames).toEqual(expectedNames)
    expect(clearDoseToolCatalog).toHaveLength(11)

    for (const tool of clearDoseToolCatalog) {
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.inputSchema.properties).toBeDefined()
      expect(tool.inputSchema.additionalProperties).toBe(false)
      expect(tool.annotations).toMatchObject({
        readOnlyHint: readOnlyNames.has(tool.name),
        destructiveHint: destructiveNames.has(tool.name),
        openWorldHint: false,
        untrustedContentHint: false,
      })
      expect(tool.title).not.toBe('')
      expect(tool.description.length).toBeGreaterThan(30)
      expect(tool.description.length).toBeLessThanOrEqual(webMcpContractBudgets.toolDescription)
      if (!webMcpNameBudgetExceptions[tool.name]) {
        expect(tool.name.length).toBeLessThanOrEqual(webMcpContractBudgets.toolOrParameterName)
      }
      expectSchemaBudgets(tool.inputSchema)
      expect(tool.exampleInput).toBeDefined()
    }

    expect(
      clearDoseToolCatalog.find((tool) => tool.name === 'search_medications')?.inputSchema
        .required,
    ).toEqual(['query'])
    expect(
      clearDoseToolCatalog.find((tool) => tool.name === 'compare_fulfillment_options')
        ?.inputSchema.required,
    ).toEqual([])
    expect(
      clearDoseToolCatalog.find((tool) => tool.name === 'view_cart')?.inputSchema.required,
    ).toEqual([])
    expect(
      clearDoseToolCatalog.find((tool) => tool.name === 'create_prescription_request_card')
        ?.inputSchema.required,
    ).toEqual(['offerId', 'deliveryOptionId'])
    expect(
      clearDoseToolCatalog.find((tool) => tool.name === 'remove_cart_item')?.annotations,
    ).toMatchObject({ destructiveHint: true, idempotentHint: true })
    expect(
      clearDoseToolCatalog.find((tool) => tool.name === 'checkout_demo_order')?.annotations,
    ).toMatchObject({ destructiveHint: true, idempotentHint: false })

    const checkout = clearDoseToolCatalog.find(
      (tool) => tool.name === 'checkout_demo_order',
    )
    expect(checkout?.inputSchema.required).toEqual([
      'fullName',
      'address',
      'prescriptionStatus',
    ])
    const addressSchema = checkout?.inputSchema.properties?.address
    expect(addressSchema).toBeDefined()
    expect(addressSchema?.additionalProperties).toBe(false)
    expect(addressSchema?.required).toEqual([
      'line1',
      'city',
      'state',
      'postalCode',
    ])
  })

  it('registers all tools with one abort-owned lifecycle and verifies discovery', async () => {
    const fake = createFakeWebMcp()
    const registration = await registerClearDoseTools({ documentRef: fake.documentRef })
    const status = useWebMcpStore()

    expect([...fake.definitions.keys()]).toEqual(expectedNames)
    expect(fake.signals).toHaveLength(11)
    expect(new Set(fake.signals).size).toBe(1)
    expect(fake.signals.every((signal) => !signal.aborted)).toBe(true)
    expect(
      [...fake.definitions.values()].every(
        (definition) =>
          JSON.stringify(Object.keys(definition.annotations).sort()) ===
          JSON.stringify(['readOnlyHint', 'untrustedContentHint']),
      ),
    ).toBe(true)
    expect(status.status).toBe('ready')
    expect(status.registeredToolCount).toBe(11)
    expect(registration.registeredToolNames).toEqual([...expectedNames].sort())

    registration.dispose()

    expect(fake.signals.every((signal) => signal.aborted)).toBe(true)
    expect(fake.definitions.size).toBe(0)
    expect(status.status).toBe('idle')
  })

  it('reports registration as unverified when getTools is unavailable', async () => {
    const definitions = new Map<string, WebMcpToolDefinition>()
    const context: WebMcpModelContext = {
      async registerTool(
        definition: WebMcpToolDefinition,
        _options: WebMcpRegistrationOptions,
      ): Promise<void> {
        definitions.set(definition.name, definition)
      },
    }

    const registration = await registerClearDoseTools({ documentRef: { modelContext: context } })

    expect(definitions.size).toBe(11)
    expect(useWebMcpStore()).toMatchObject({
      supported: true,
      status: 'ready-unverified',
      registeredToolCount: 11,
    })
    registration.dispose()
  })

  it('routes execution through shared actions and logs one completed activity', async () => {
    const fake = createFakeWebMcp()
    const registration = await registerClearDoseTools({ documentRef: fake.documentRef })
    useCatalogStore().setFilters('capsule', '500 mg', 'not-required')

    const output = await fake.definitions.get('search_medications')?.execute({
      query: 'atorvastatin',
    })

    expect(output).toMatchObject({ query: 'atorvastatin', count: 1 })
    expect(useCatalogStore()).toMatchObject({
      searchQuery: 'atorvastatin',
      formFilter: '',
      strengthFilter: '',
      rxFilter: 'all',
    })
    expect(useAgentActivityStore().entries).toHaveLength(1)
    expect(useAgentActivityStore().entries[0]).toMatchObject({
      source: 'agent',
      toolName: 'search_medications',
      status: 'success',
    })

    registration.dispose()
  })

  it('does not resolve a tool until its visible navigation has settled', async () => {
    const fake = createFakeWebMcp()
    let releaseNavigation: (() => void) | undefined
    const navigation = new Promise<void>((resolve) => {
      releaseNavigation = resolve
    })
    const registration = await registerClearDoseTools({
      documentRef: fake.documentRef,
      navigate: () => navigation,
    })
    const execution = fake.definitions.get('search_medications')?.execute({
      query: 'atorvastatin',
    })
    if (!execution) throw new Error('Missing search_medications definition.')
    const executionPromise = Promise.resolve(execution)
    let settled = false
    void executionPromise.then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)
    releaseNavigation?.()
    await expect(executionPromise).resolves.toMatchObject({ query: 'atorvastatin' })
    expect(settled).toBe(true)

    registration.dispose()
  })

  it('uses discovered tool dictionaries for local executeTool calls', async () => {
    const fake = createFakeWebMcp()
    const registration = await registerClearDoseTools({ documentRef: fake.documentRef })

    await expect(
      executeTool(
        'get_medication_details',
        { medicationId: 'med-atorvastatin' },
        fake.documentRef,
      ),
    ).resolves.toMatchObject({ medicationId: 'med-atorvastatin', genericName: 'Atorvastatin' })
    expect(fake.executedInputs.at(-1)).toBe('{"medicationId":"med-atorvastatin"}')

    registration.dispose()
  })

  it('retries the older object-input preview only after an explicit input mismatch', async () => {
    const inputs: unknown[] = []
    const context: WebMcpModelContext = {
      async registerTool(): Promise<void> {
        return undefined
      },
      getTools: async () => [{
        name: 'get_medication_details',
        description: 'Demo details tool.',
      }],
      executeTool: (async (_tool: RegisteredWebMcpTool, input: unknown) => {
        inputs.push(input)
        if (typeof input === 'string') {
          throw new Error('WebMCP executeTool requires an object input.')
        }
        return JSON.stringify({ medicationId: 'med-atorvastatin' })
      }) as WebMcpModelContext['executeTool'],
    }

    await expect(
      executeTool(
        'get_medication_details',
        { medicationId: 'med-atorvastatin' },
        { modelContext: context },
      ),
    ).resolves.toEqual({ medicationId: 'med-atorvastatin' })
    expect(inputs).toEqual([
      '{"medicationId":"med-atorvastatin"}',
      { medicationId: 'med-atorvastatin' },
    ])
  })

  it('refreshes the verified count on toolchange', async () => {
    const fake = createFakeWebMcp()
    const registration = await registerClearDoseTools({ documentRef: fake.documentRef })
    fake.remove('view_cart')
    await Promise.resolve()
    await Promise.resolve()

    expect(useWebMcpStore().registeredToolCount).toBe(10)
    expect(useWebMcpStore()).toMatchObject({
      status: 'degraded',
      registrationError: 'WebMCP registry is incomplete. Missing: view_cart.',
    })
    expect(useWebMcpStore().canExecuteNatively('search_medications')).toBe(true)
    expect(useWebMcpStore().canExecuteNatively('view_cart')).toBe(false)
    registration.dispose()
  })

  it('ignores a late registry refresh after disposal', async () => {
    const definitions = new Map<string, WebMcpToolDefinition>()
    const events = new EventTarget()
    let getToolsCalls = 0
    let resolveLateRefresh: ((tools: RegisteredWebMcpTool[]) => void) | undefined
    const registeredTools = (): RegisteredWebMcpTool[] =>
      [...definitions.values()].map((definition) => ({
        name: definition.name,
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        annotations: definition.annotations,
      }))
    const context: WebMcpModelContext = {
      async registerTool(definition): Promise<void> {
        definitions.set(definition.name, definition)
      },
      getTools: async () => {
        getToolsCalls += 1
        if (getToolsCalls === 1) return registeredTools()
        return new Promise<RegisteredWebMcpTool[]>((resolve) => {
          resolveLateRefresh = resolve
        })
      },
      addEventListener: (type, listener) => events.addEventListener(type, listener),
      removeEventListener: (type, listener) => events.removeEventListener(type, listener),
    }
    const registration = await registerClearDoseTools({ documentRef: { modelContext: context } })

    events.dispatchEvent(new Event('toolchange'))
    await Promise.resolve()
    expect(getToolsCalls).toBe(2)
    registration.dispose()
    expect(useWebMcpStore().status).toBe('idle')

    resolveLateRefresh?.(registeredTools())
    await Promise.resolve()
    await Promise.resolve()
    expect(useWebMcpStore()).toMatchObject({ status: 'idle', registeredToolCount: 0 })
  })

  it('keeps an initial discovery failure in the error state during abort cleanup', async () => {
    const definitions = new Map<string, WebMcpToolDefinition>()
    const events = new EventTarget()
    let discoveryCalls = 0
    const context: WebMcpModelContext = {
      async registerTool(
        definition: WebMcpToolDefinition,
        options: WebMcpRegistrationOptions,
      ): Promise<void> {
        definitions.set(definition.name, definition)
        options.signal.addEventListener('abort', () => {
          definitions.delete(definition.name)
          events.dispatchEvent(new Event('toolchange'))
        }, { once: true })
      },
      getTools: async () => {
        discoveryCalls += 1
        throw new Error('Registry discovery failed.')
      },
      addEventListener: (type, listener) => events.addEventListener(type, listener),
      removeEventListener: (type, listener) => events.removeEventListener(type, listener),
    }

    const registration = await registerClearDoseTools({ documentRef: { modelContext: context } })

    expect(discoveryCalls).toBe(1)
    expect(definitions.size).toBe(0)
    expect(useWebMcpStore()).toMatchObject({
      status: 'error',
      registeredToolCount: 0,
      registrationError: 'Registry discovery failed.',
    })
    registration.dispose()
  })

  it('enforces declared enum, pattern, date, and numeric constraints in runtime code', async () => {
    const fake = createFakeWebMcp()
    const registration = await registerClearDoseTools({ documentRef: fake.documentRef })

    const invalidCalls: Array<[string, Record<string, JsonValue>, string]> = [
      ['search_medications', { query: 'atorvastatin', form: 'syrup' }, 'form must be one of'],
      [
        'compare_fulfillment_options',
        {
          medicationId: 'med-atorvastatin',
          form: 'tablet',
          strength: '20 mg',
          quantity: 90,
          maxDeliveryDays: 31,
        },
        'maxDeliveryDays must be an integer from 0 to 30',
      ],
      [
        'create_prescription_request_card',
        {
          offerId: 'offer-atorvastatin-20-90-cleardose',
          deliveryOptionId: 'standard',
          dateOfBirth: 'not-a-date',
        },
        'dateOfBirth must use YYYY-MM-DD format',
      ],
      [
        'checkout_demo_order',
        {
          fullName: 'Demo User',
          address: { line1: '100 Demo Street', city: 'Baltimore', state: 'M', postalCode: '21201' },
          prescriptionStatus: 'provider-will-send',
        },
        'state must be a two-letter US state code',
      ],
      ['get_order_status', { orderId: 'wrong-id' }, 'orderId must match CD-YYYY-NNNN'],
    ]

    for (const [name, input, message] of invalidCalls) {
      const definition = fake.definitions.get(name)
      if (!definition) throw new Error(`Missing tool ${name}.`)
      await expect(Promise.resolve().then(() => definition.execute(input))).rejects.toThrow(message)
    }

    expect(useAgentActivityStore().entries).toHaveLength(invalidCalls.length)
    expect(useAgentActivityStore().entries.every((entry) => entry.status === 'error')).toBe(true)

    registration.dispose()
  })

  it('logs an already-aborted invocation as a tool error', async () => {
    const fake = createFakeWebMcp()
    const registration = await registerClearDoseTools({ documentRef: fake.documentRef })
    const definition = fake.definitions.get('search_medications')
    if (!definition) throw new Error('Missing search_medications definition.')
    const controller = new AbortController()
    controller.abort()

    await expect(
      Promise.resolve(definition.execute({ query: 'atorvastatin' }, { signal: controller.signal })),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(useAgentActivityStore().entries).toHaveLength(1)
    expect(useAgentActivityStore().entries[0]).toMatchObject({
      toolName: 'search_medications',
      status: 'error',
    })

    registration.dispose()
  })

  it('redacts optional prescription identity fields from persisted activity', async () => {
    const fake = createFakeWebMcp()
    const registration = await registerClearDoseTools({ documentRef: fake.documentRef })
    const definition = fake.definitions.get('create_prescription_request_card')
    if (!definition) throw new Error('Missing create_prescription_request_card definition.')

    await definition.execute({
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'standard',
      patientName: 'Demo Patient',
      prescriberName: 'Demo Prescriber',
      practice: 'Demo Practice',
    })

    expect(useAgentActivityStore().entries[0]?.input).toMatchObject({
      patientName: '[redacted]',
      prescriberName: '[redacted]',
      practice: '[redacted]',
    })
    registration.dispose()
  })

  it('gives stale identifiers a specific recovery tool', async () => {
    const fake = createFakeWebMcp()
    const registration = await registerClearDoseTools({ documentRef: fake.documentRef })
    const expectToolError = async (
      name: string,
      input: Record<string, JsonValue>,
      recovery: string,
    ): Promise<void> => {
      const definition = fake.definitions.get(name)
      if (!definition) throw new Error(`Missing tool ${name}.`)
      await expect(Promise.resolve(definition.execute(input))).rejects.toThrow(recovery)
    }

    await expectToolError(
      'get_medication_details',
      { medicationId: 'med-stale' },
      'Call search_medications',
    )
    await expectToolError(
      'compare_fulfillment_options',
      { medicationId: 'med-stale', form: 'tablet', strength: '20 mg', quantity: 90 },
      'Call search_medications',
    )
    for (const name of [
      'select_medication_option',
      'create_prescription_request_card',
      'add_to_cart',
    ]) {
      await expectToolError(
        name,
        { offerId: 'offer-stale', deliveryOptionId: 'standard' },
        'Call compare_fulfillment_options',
      )
    }
    await expectToolError(
      'set_delivery_option',
      { cartItemId: 'cart-stale', deliveryOptionId: 'standard' },
      'Call view_cart',
    )

    const add = fake.definitions.get('add_to_cart')
    if (!add) throw new Error('Missing add_to_cart definition.')
    await add.execute({
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'standard',
    })
    const cartItemId = useCartStore().items[0]?.id
    if (!cartItemId) throw new Error('Expected a demo cart item.')
    await expectToolError(
      'set_delivery_option',
      { cartItemId, deliveryOptionId: 'overnight' },
      'Call view_cart',
    )

    registration.dispose()
  })

  it('keeps large tool outputs within the Chrome character budget and omits checkout PII', async () => {
    const fake = createFakeWebMcp()
    const registration = await registerClearDoseTools({ documentRef: fake.documentRef })
    const execute = async (name: string, input: Record<string, JsonValue> = {}) => {
      const definition = fake.definitions.get(name)
      if (!definition) throw new Error(`Missing tool ${name}.`)
      const output = await definition.execute(input)
      expect(JSON.stringify(output).length).toBeLessThanOrEqual(webMcpContractBudgets.output)
      return output
    }

    const expectConsistentPage = (
      output: JsonValue,
      itemsKey: 'results' | 'options' | 'items',
      offsetKey: 'offset' | 'itemOffset' = 'offset',
      nextOffsetKey: 'nextOffset' | 'nextItemOffset' = 'nextOffset',
    ): void => {
      expect(output).not.toBeNull()
      expect(Array.isArray(output)).toBe(false)
      if (output === null || typeof output !== 'object' || Array.isArray(output)) return
      const items = output[itemsKey]
      expect(Array.isArray(items)).toBe(true)
      if (!Array.isArray(items)) return
      expect(output.returned).toBe(items.length)
      if (output.truncated) {
        expect(output[nextOffsetKey]).toBe((output[offsetKey] as number) + items.length)
      } else {
        expect(output[nextOffsetKey]).toBeNull()
      }
    }

    const search = await execute('search_medications', { query: 'a', limit: 10 })
    expectConsistentPage(search, 'results')
    const comparison = await execute('compare_fulfillment_options', {
      medicationId: 'med-atorvastatin',
      form: 'tablet',
      strength: '20 mg',
      quantity: 90,
      maxResults: 8,
    })
    expectConsistentPage(comparison, 'options')

    const availableOffers = useCatalogStore().offers.filter((offer) => offer.available).slice(0, 10)
    for (const offer of availableOffers) {
      const deliveryOptionId = offer.deliveryOptions[0]?.id
      if (deliveryOptionId) await execute('add_to_cart', { offerId: offer.id, deliveryOptionId })
    }
    const cartPage = await execute('view_cart', { limit: 5 })
    expectConsistentPage(cartPage, 'items')

    const checkout = await execute('checkout_demo_order', {
      fullName: 'Private Demo Name',
      address: {
        line1: '999 Private Street',
        city: 'Baltimore',
        state: 'MD',
        postalCode: '21201',
      },
      prescriptionStatus: 'provider-will-send',
    })
    const orderId =
      checkout !== null && typeof checkout === 'object' && !Array.isArray(checkout)
        ? checkout.orderId
        : null
    expect(typeof orderId).toBe('string')
    const status = await execute('get_order_status')
    expectConsistentPage(status, 'items', 'itemOffset', 'nextItemOffset')
    const serializedStatus = JSON.stringify(status)
    expect(serializedStatus).not.toContain('Private Demo Name')
    expect(serializedStatus).not.toContain('999 Private Street')

    registration.dispose()
  })

  it('aborts earlier registrations and records a clean error when registration fails', async () => {
    const signals: AbortSignal[] = []
    let attempt = 0
    const context: WebMcpModelContext = {
      async registerTool(
        _definition: WebMcpToolDefinition,
        options: WebMcpRegistrationOptions,
      ): Promise<void> {
        signals.push(options.signal)
        attempt += 1
        if (attempt === 3) throw new Error('Registration denied for the demo.')
      },
    }

    const registration = await registerClearDoseTools({
      documentRef: { modelContext: context },
    })

    expect(signals).toHaveLength(3)
    expect(new Set(signals).size).toBe(1)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(useWebMcpStore()).toMatchObject({
      supported: true,
      status: 'error',
      registeredToolCount: 0,
      registrationError: 'Registration denied for the demo.',
    })
    expect(registration.registrationError).toBe('Registration denied for the demo.')
  })

  it('does not crash when the browser has no WebMCP implementation', async () => {
    await expect(registerClearDoseTools({ documentRef: {} })).resolves.toMatchObject({
      supported: false,
      registeredToolNames: [],
      registrationError: null,
    })
    expect(useWebMcpStore()).toMatchObject({
      supported: false,
      status: 'unsupported',
      registeredToolCount: 0,
    })
  })
})
