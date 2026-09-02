import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentActivityStore } from '../stores/agentActivity.store'
import {
  createDynamicMedicationTools,
  dynamicMedicationOutputBudget,
  registerDynamicMedicationTools,
  type DynamicMedicationDependencies,
  type DynamicMedicationRegistrationState,
  type DynamicMedicationSnapshot,
  type CompareMedicationRequest,
  type RelatedMedicationResult,
} from './dynamic'
import type { JsonSchema, RegisteredWebMcpTool, WebMcpModelContext, WebMcpToolDefinition } from './types'

const snapshot = (): DynamicMedicationSnapshot => ({
  revision: 'catalog-v1', route: '/medications', dataMode: 'hybrid',
  catalog: [{ id: 'med-atorvastatin', name: 'Atorvastatin' }, { id: 'med-rosuvastatin', name: 'Rosuvastatin' }],
  pageMedicationIds: ['med-atorvastatin'],
})

const setup = () => {
  let current = snapshot()
  const dependencies: DynamicMedicationDependencies = {
    getSnapshot: () => current,
    findRelated: vi.fn(async () => ({
      matches: [{ medicationId: 'med-rosuvastatin', name: 'Rosuvastatin', reasons: ['Shared catalog category: cholesterol'] }],
      notice: 'Catalog match, not a treatment recommendation.',
    })),
    compare: vi.fn(async ({ medicationIds }: CompareMedicationRequest) => ({
      drugs: medicationIds.map((medicationId) => ({
        medicationId, name: medicationId, status: 'ready',
        drug: {
          identity: { id: medicationId, genericName: medicationId },
          forms: ['tablet'], routes: ['ORAL'], variants: [],
          clinical: { indications: ['Public label text.'], drugInteractions: ['Label section only.'] },
          prices: [{ kind: 'nadac-benchmark', amount: 3, consumerMeaning: 'Acquisition benchmark, not a cash price.' }],
          sources: [{ source: 'openfda-label', retrievedAt: '2026-09-02T00:00:00Z' }],
        },
      })),
      notice: 'Public data, not personalized medical advice.',
    })),
  }
  return { dependencies, update: (next: DynamicMedicationSnapshot) => { current = next } }
}

interface PageResult {
  contextRevision: string
  scope: string
  dataMode: string
  notice: string
  offset: number
  returned: number
  totalRows: number
  nextOffset: number | null
  rows: Array<{ path: string; value: unknown; part?: number; parts?: number }>
}

const output = (value: unknown): PageResult => value as PageResult

const fakeContext = () => {
  const tools = new Map<string, WebMcpToolDefinition>()
  const signals: AbortSignal[] = []
  const context: WebMcpModelContext = {
    registerTool: vi.fn(async (definition, options) => {
      if (tools.has(definition.name)) throw new Error(`Duplicate tool: ${definition.name}`)
      if (options.signal.aborted) return
      tools.set(definition.name, definition)
      signals.push(options.signal)
      options.signal.addEventListener('abort', () => { tools.delete(definition.name) }, { once: true })
    }),
    getTools: vi.fn(async () => [...tools.values()]),
  }
  return { context, tools, signals }
}

const checkSchema = (schema: JsonSchema): void => {
  if (schema.description) expect(schema.description.length).toBeLessThanOrEqual(150)
  for (const [name, value] of Object.entries(schema.properties ?? {})) {
    expect(name.length).toBeLessThanOrEqual(30)
    checkSchema(value)
  }
  if (schema.items) checkSchema(schema.items)
  schema.oneOf?.forEach(checkSchema)
}

describe('dynamic medication WebMCP tools', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('exposes current catalog enums, safe name labels, revision, sections, and read-only external-data hints', () => {
    const { dependencies } = setup()
    const tools = createDynamicMedicationTools(dependencies)
    expect(tools.map((tool) => tool.name)).toEqual(['find_related_medications', 'compare_medications'])
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, untrustedContentHint: true, destructiveHint: false })
      expect(tool.description.length).toBeLessThanOrEqual(500)
      expect(tool.inputSchema.additionalProperties).toBe(false)
      expect(tool.inputSchema.properties?.contextRevision?.const).toBe('catalog-v1')
      checkSchema(tool.inputSchema)
    }
    const ids = tools[0]!.inputSchema.properties?.referenceMedicationId
    expect(ids?.enum).toEqual(['med-atorvastatin', 'med-rosuvastatin'])
    expect(ids?.oneOf?.[0]).toMatchObject({ const: 'med-atorvastatin', title: 'Atorvastatin' })
    expect(tools[1]!.inputSchema.properties?.medicationIds?.minItems).toBe(1)
    expect(tools[1]!.inputSchema.properties?.section?.enum).toEqual(['identity', 'product', 'clinical', 'prices', 'sources'])
  })

  it('rejects stale revisions and held handlers when catalog membership changes', async () => {
    const { dependencies, update } = setup()
    const tool = createDynamicMedicationTools(dependencies)[0]!
    await expect(tool.execute({ ...tool.exampleInput, contextRevision: 'old' })).rejects.toThrow('Refresh the available WebMCP tools')
    update({ ...snapshot(), catalog: [{ id: 'med-new', name: 'New drug' }] })
    await expect(tool.execute(tool.exampleInput)).rejects.toThrow('Medication context changed')
    expect(dependencies.findRelated).not.toHaveBeenCalled()
    expect(useAgentActivityStore().entries).toHaveLength(2)
    expect(useAgentActivityStore().entries.every((entry) => entry.status === 'error')).toBe(true)
  })

  it('limits related candidates to the selected page scope and excludes the reference medication', async () => {
    const { dependencies, update } = setup()
    update({ ...snapshot(), pageMedicationIds: ['med-atorvastatin', 'med-rosuvastatin'] })
    const tool = createDynamicMedicationTools(dependencies)[0]!
    const result = output(await tool.execute({ ...tool.exampleInput, scope: 'page' }))
    expect(dependencies.findRelated).toHaveBeenCalledWith({
      referenceMedicationId: 'med-atorvastatin', candidateMedicationIds: ['med-rosuvastatin'], basis: 'category', signal: undefined,
    })
    expect(result.scope).toBe('page')
    expect(result.notice).toContain('not therapeutic interchangeability')
    expect(useAgentActivityStore().entries[0]).toMatchObject({ toolName: 'find_related_medications', status: 'success' })
  })

  it('validates unknown fields, IDs, scope membership, duplicate IDs, and integer limits before calling the repository', async () => {
    const { dependencies } = setup()
    const tool = createDynamicMedicationTools(dependencies)[1]!
    await expect(tool.execute({ ...tool.exampleInput, medicationIds: ['med-unknown'] })).rejects.toThrow('medicationIds must be one of')
    await expect(tool.execute({ ...tool.exampleInput, medicationIds: ['med-atorvastatin', 'med-atorvastatin'] })).rejects.toThrow('must be distinct')
    await expect(tool.execute({ ...tool.exampleInput, scope: 'page' })).rejects.toThrow('medicationIds must be one of')
    await expect(tool.execute({ ...tool.exampleInput, limit: 0 })).rejects.toThrow('limit must be an integer')
    await expect(tool.execute({ ...tool.exampleInput, offset: 0.5 })).rejects.toThrow('offset must be an integer')
    await expect(tool.execute({ ...tool.exampleInput, other: true })).rejects.toThrow('Unexpected input field')
    expect(dependencies.compare).not.toHaveBeenCalled()
  })

  it('reads one medication and preserves every character of a long clinical section across bounded pages', async () => {
    const { dependencies } = setup()
    const text = 'Public warning with unicode 🧪, quotes " and slash \\. '.repeat(150)
    dependencies.compare = vi.fn(async () => ({
      drugs: [{ medicationId: 'med-atorvastatin', name: 'Atorvastatin', status: 'ready', drug: { clinical: { warnings: [text] } } }],
      notice: 'FDA label material.',
    }))
    const tool = createDynamicMedicationTools(dependencies)[1]!
    const rows: PageResult['rows'] = []
    let offset: number | null = 0
    let pages = 0
    while (offset !== null) {
      const page = output(await tool.execute({ contextRevision: 'catalog-v1', medicationIds: ['med-atorvastatin'], section: 'clinical', offset, limit: 10 }))
      expect(JSON.stringify(page).length).toBeLessThanOrEqual(dynamicMedicationOutputBudget)
      expect(page.offset).toBe(offset)
      expect(page.returned).toBe(page.rows.length)
      expect(page.rows.length).toBeGreaterThan(0)
      rows.push(...page.rows)
      offset = page.nextOffset
      pages += 1
      expect(pages).toBeLessThan(200)
    }
    const warningRows = rows.filter((row) => row.path === '/drugs/0/clinical/warnings/0')
    expect(warningRows.map((row) => row.value).join('')).toBe(text)
    expect(warningRows.map((row) => row.part)).toEqual(warningRows.map((_, index) => index + 1))
    expect(dependencies.compare).toHaveBeenCalledTimes(1)
  })

  it('keeps product, pricing, source, and unavailable clinical data accessible without cash-price reinterpretation', async () => {
    const { dependencies } = setup()
    const tool = createDynamicMedicationTools(dependencies)[1]!
    const allRows = async (section: string) => {
      const rows: PageResult['rows'] = []
      let offset: number | null = 0
      while (offset !== null) {
        const page = output(await tool.execute({ contextRevision: 'catalog-v1', medicationIds: ['med-atorvastatin'], section, offset, limit: 10 }))
        rows.push(...page.rows)
        offset = page.nextOffset
      }
      return rows
    }
    expect(await allRows('product')).toContainEqual({ path: '/drugs/0/product/routes/0', value: 'ORAL' })
    expect(await allRows('prices')).toContainEqual({ path: '/drugs/0/prices/0/kind', value: 'nadac-benchmark' })
    expect(await allRows('sources')).toContainEqual({ path: '/drugs/0/sources/0/source', value: 'openfda-label' })
  })

  it('honors execution cancellation before calling providers and after a pending provider response', async () => {
    const { dependencies } = setup()
    const tool = createDynamicMedicationTools(dependencies)[0]!
    const cancelled = new AbortController()
    cancelled.abort()
    await expect(tool.execute(tool.exampleInput, { signal: cancelled.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(dependencies.findRelated).not.toHaveBeenCalled()
    let resolve!: (value: { matches: []; notice: string }) => void
    dependencies.findRelated = vi.fn(() => new Promise<RelatedMedicationResult>((done) => { resolve = done }))
    const controller = new AbortController()
    const result = tool.execute(tool.exampleInput, { signal: controller.signal })
    await Promise.resolve()
    controller.abort()
    resolve({ matches: [], notice: 'Completed after cancellation.' })
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(useAgentActivityStore().entries.every((entry) => entry.status === 'error')).toBe(true)
  })

  it('supports an empty catalog and omits page scope when no page medications exist', () => {
    const { dependencies, update } = setup()
    update({ ...snapshot(), catalog: [] })
    expect(createDynamicMedicationTools(dependencies)).toEqual([])
    update({ ...snapshot(), catalog: [snapshot().catalog[0]!], pageMedicationIds: [] })
    const tools = createDynamicMedicationTools(dependencies)
    expect(tools).toHaveLength(2)
    expect(tools[0]!.inputSchema.properties?.scope?.enum).toEqual(['catalog'])
  })

  it('refreshes schemas without duplicate registration and aborts old lifecycles', async () => {
    const { dependencies, update } = setup()
    const fake = fakeContext()
    const states: DynamicMedicationRegistrationState[] = []
    const registration = await registerDynamicMedicationTools({ context: fake.context, dependencies, onChanged: (state) => { states.push(state) } })
    const oldTool = fake.tools.get('find_related_medications')!
    expect(fake.tools.size).toBe(2)
    await registration.refresh()
    expect(fake.context.registerTool).toHaveBeenCalledTimes(2)
    update({ ...snapshot(), revision: 'catalog-v2', catalog: [{ id: 'med-new', name: '<script>new</script>' }] })
    await registration.refresh()
    expect(fake.context.registerTool).toHaveBeenCalledTimes(4)
    expect(fake.signals[0]!.aborted).toBe(true)
    expect(states.at(-1)).toEqual({ expectedNames: ['find_related_medications', 'compare_medications'], registeredNames: ['compare_medications', 'find_related_medications'], verified: true, revision: 'catalog-v2' })
    expect(fake.tools.get('find_related_medications')!.inputSchema.properties?.referenceMedicationId?.enum).toEqual(['med-new'])
    expect(fake.tools.get('find_related_medications')!.inputSchema.properties?.referenceMedicationId?.oneOf?.[0]?.title).not.toContain('<')
    await expect(oldTool.execute({ contextRevision: 'catalog-v1', referenceMedicationId: 'med-atorvastatin' })).rejects.toThrow('Medication context changed')
    registration.dispose()
    expect(fake.tools.size).toBe(0)
    expect(registration.definitions).toHaveLength(0)
    await registration.refresh()
    expect(fake.context.registerTool).toHaveBeenCalledTimes(4)
  })

  it('coalesces changes arriving while refresh waits and never publishes an obsolete schema', async () => {
    const { dependencies, update } = setup()
    const fake = fakeContext()
    const changed = vi.fn()
    const registration = await registerDynamicMedicationTools({ context: fake.context, dependencies, onChanged: changed })
    const original = fake.context.registerTool
    let release!: () => void
    let wait = true
    fake.context.registerTool = vi.fn(async (tool, options) => {
      if (wait) { wait = false; await new Promise<void>((resolve) => { release = resolve }) }
      await original(tool, options)
    })
    update({ ...snapshot(), revision: 'catalog-v2' })
    const second = registration.refresh()
    update({ ...snapshot(), revision: 'catalog-v3' })
    const third = registration.refresh()
    release()
    await Promise.all([second, third])
    expect(changed.mock.calls.map(([state]) => state.revision)).toEqual(['catalog-v1', 'catalog-v3'])
    expect(fake.tools.get('compare_medications')!.inputSchema.properties?.contextRevision?.const).toBe('catalog-v3')
    registration.dispose()
  })

  it('does not restore tool state when disposed during an in-flight refresh', async () => {
    const { dependencies, update } = setup()
    const fake = fakeContext()
    const changed = vi.fn()
    const registration = await registerDynamicMedicationTools({ context: fake.context, dependencies, onChanged: changed })
    let release!: () => void
    fake.context.getTools = vi.fn(() => new Promise<RegisteredWebMcpTool[]>((resolve) => { release = () => resolve([...fake.tools.values()]) }))
    update({ ...snapshot(), revision: 'catalog-v2' })
    const refresh = registration.refresh()
    while (!release) await Promise.resolve()
    registration.dispose()
    release()
    await refresh
    expect(fake.tools.size).toBe(0)
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('reports partial discovery, missing getTools, and registration failure without claiming success', async () => {
    const { dependencies } = setup()
    const partial = fakeContext()
    partial.context.getTools = async () => []
    const changed = vi.fn()
    const registration = await registerDynamicMedicationTools({ context: partial.context, dependencies, onChanged: changed })
    expect(changed.mock.calls[0]![0]).toMatchObject({ registeredNames: [], verified: true })
    registration.dispose()
    const unverified = fakeContext()
    delete unverified.context.getTools
    const fallback = await registerDynamicMedicationTools({ context: unverified.context, dependencies, onChanged: changed })
    expect(changed.mock.calls.at(-1)![0]).toMatchObject({ registeredNames: ['compare_medications', 'find_related_medications'], verified: false })
    fallback.dispose()
    const failed = fakeContext()
    failed.context.registerTool = async () => { throw new Error('Registration failed') }
    const onError = vi.fn()
    await expect(registerDynamicMedicationTools({ context: failed.context, dependencies, onError })).rejects.toThrow('Registration failed')
    expect(onError).toHaveBeenCalledTimes(1)
    expect(failed.tools.size).toBe(0)
  })
})
