import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDynamicMedicationTools, registerDynamicMedicationTools, type DynamicMedicationDependencies, type DynamicMedicationSnapshot } from './dynamic'
import { createExplorerTools, type ExplorerToolDependencies, type ExplorerWorkspaceSnapshot } from './explorer'
import { clearDoseToolCatalog, createClearDoseToolDefinitions } from './definitions'
import { registerClearDoseTools } from './register'
import { nativeDeclarationBudget, nativeDeclarationBytes } from './schema-budget'
import { executeTool } from './support'
import type { WebMcpModelContext, WebMcpToolDefinition } from './types'
import type { ClearDoseActions } from '../services/cleardose.actions'

const fixture = () => {
  let snapshot: DynamicMedicationSnapshot = { revision: 'catalog-1', route: '/medications', dataMode: 'hybrid',
    catalog: [{ id: 'med-a', name: 'A' }, { id: 'med-b', name: 'B' }], pageMedicationIds: ['med-a'] }
  let workspace: ExplorerWorkspaceSnapshot = { revision: 'workspace-1', selectedDrugs: [{ id: 'med-a', name: 'A' }],
    catalog: snapshot.catalog, cards: [{ id: 'fact-1', factType: 'warnings', drugIds: ['med-a'] }], route: snapshot.route }
  const dependencies: DynamicMedicationDependencies = { getSnapshot: () => snapshot,
    compare: vi.fn(async () => ({ drugs: [], notice: 'Public reference data.' })),
    findRelated: vi.fn(async () => ({ matches: [], notice: 'Catalog matches, not medical substitutes.' })) }
  const explorer: ExplorerToolDependencies = { snapshot: () => ({ ...workspace, catalog: snapshot.catalog, route: snapshot.route }),
    selectDrugs: vi.fn(), showFacts: vi.fn(), updateFactCard: vi.fn(), removeFactCard: vi.fn(), reveal: vi.fn() }
  const tools = new Map<string, WebMcpToolDefinition>()
  const signals = new Map<string, AbortSignal>()
  const context: WebMcpModelContext = {
    registerTool: vi.fn(async (definition, options) => {
      if (tools.has(definition.name)) throw new Error(`Duplicate ${definition.name}`)
      if (options.signal.aborted) return
      tools.set(definition.name, definition)
      signals.set(definition.name, options.signal)
      options.signal.addEventListener('abort', () => {
        if (tools.get(definition.name) === definition) { tools.delete(definition.name); signals.delete(definition.name) }
      }, { once: true })
    }),
    getTools: vi.fn(async () => [...tools.values()]),
  }
  return { dependencies, explorer, tools, signals, context,
    snapshot: () => snapshot, workspace: () => workspace,
    change: (next: Partial<DynamicMedicationSnapshot>) => { snapshot = { ...snapshot, ...next } },
    changeWorkspace: (next: Partial<ExplorerWorkspaceSnapshot>) => { workspace = { ...workspace, ...next } },
  }
}

describe('bounded native registration lifecycle', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('keeps all static tools and unchanged Explorer handles through 120 page changes without repeated no-op discovery', async () => {
    const f = fixture()
    const base = await registerClearDoseTools({ documentRef: { modelContext: f.context } })
    const registration = await registerDynamicMedicationTools({ context: f.context, dependencies: f.dependencies,
      extraDefinitions: () => createExplorerTools(f.explorer) })
    const staticHandles = new Map(clearDoseToolCatalog.map(tool => [tool.name, f.tools.get(tool.name)]))
    const workspaceReader = f.tools.get('cleardose_get_explorer_state')
    const cardEditor = f.tools.get('cleardose_update_fact_card')
    for (let index = 0; index < 120; index += 1) {
      f.change({ revision: `catalog-${index + 2}`, route: index % 2 ? '/medications' : '/medications/a', pageMedicationIds: index % 2 ? ['med-a', 'med-b'] : ['med-a'] })
      await registration.refresh()
      const discoveries = vi.mocked(f.context.getTools!).mock.calls.length
      await registration.refresh()
      expect(f.context.getTools).toHaveBeenCalledTimes(discoveries)
      expect(f.tools.size).toBe(20)
      expect(f.tools.get('cleardose_get_explorer_state')).toBe(workspaceReader)
      expect(f.tools.get('cleardose_update_fact_card')).toBe(cardEditor)
      for (const [name, handle] of staticHandles) expect(f.tools.get(name)).toBe(handle)
    }
    expect(f.context.registerTool).toHaveBeenCalledTimes(20 + 120 * 2)
    registration.dispose()
    expect(f.tools.size).toBe(clearDoseToolCatalog.length)
    base.dispose()
    expect(f.tools.size).toBe(0)
  })

  it('keeps112 long IDs discoverable through bounded catalog pages within the aggregate native schema budget', async () => {
    const f = fixture()
    const catalog = Array.from({ length: 112 }, (_, index) => ({ id: `med-${String(index).padStart(3, '0')}-${'x'.repeat(120)}`, name: `Medication ${index} ${'名'.repeat(40)}` }))
    f.change({ catalog, pageMedicationIds: [catalog[0]!.id] })
    const dynamic = createDynamicMedicationTools(f.dependencies)
    const explorer = createExplorerTools(f.explorer)
    const declarations = [...clearDoseToolCatalog, ...dynamic, ...explorer]
    const bytes = nativeDeclarationBytes(declarations)
    expect(bytes).toBeLessThanOrEqual(nativeDeclarationBudget)
    expect(declarations.filter(tool => tool.annotations.untrustedContentHint)).toHaveLength(14)
    expect(dynamic[0]!.inputSchema.properties?.referenceMedicationId?.enum).toBeUndefined()
    expect(dynamic[0]!.inputSchema.properties?.referenceMedicationId?.examples).toHaveLength(3)
    expect(JSON.stringify([...dynamic, ...explorer])).not.toContain('oneOf')
    const reader = explorer.find(tool => tool.name === 'cleardose_get_explorer_state')!
    let offset = 0
    let tokens = {}
    const ids: string[] = []
    do {
      const page = await reader.execute({ section: 'catalog', offset, limit: 10, ...tokens }) as { rows: Array<{ id: string }>; nextOffset: number | null; workspaceRevision: string; stateRevision: string }
      expect(JSON.stringify(page).length).toBeLessThanOrEqual(1_500)
      ids.push(...page.rows.map(row => row.id))
      if (page.nextOffset === null) break
      offset = page.nextOffset
      tokens = { workspaceRevision: page.workspaceRevision, stateRevision: page.stateRevision }
    } while (offset < 112)
    expect(ids).toEqual(catalog.map(drug => drug.id))
    await expect(dynamic[1]!.execute({ contextRevision: 'catalog-1', medicationIds: ['med-not-in-the-catalog'] })).rejects.toThrow('currently available')
  })

  it('keeps an executing Explorer registration alive through its own workspace and page changes', async () => {
    const f = fixture()
    const registration = await registerDynamicMedicationTools({ context: f.context, dependencies: f.dependencies,
      extraDefinitions: () => createExplorerTools(f.explorer) })
    const held = f.tools.get('cleardose_select_drugs')!
    const signal = f.signals.get(held.name)!
    vi.mocked(f.explorer.selectDrugs).mockImplementation(async () => {
      f.changeWorkspace({ revision: 'workspace-2', selectedDrugs: [{ id: 'med-b', name: 'B' }] })
      f.change({ revision: 'catalog-2', route: '/drugs/explore', pageMedicationIds: ['med-b'] })
      await registration.refresh()
      expect(signal.aborted).toBe(false)
    })
    const result = await held.execute({ workspaceRevision: 'workspace-1', drugs: ['med-b'] }, { signal })
    expect(result).toMatchObject({ status: 'updated', selectedDrugIds: ['med-b'] })
    expect(signal.aborted).toBe(false)
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(signal.aborted).toBe(false)
    expect(f.tools.get(held.name)).toBe(held)
    await expect(held.execute({ workspaceRevision: 'workspace-1', drugs: ['med-a'] })).rejects.toThrow('Drug Explorer changed')
    expect(f.explorer.selectDrugs).toHaveBeenCalledTimes(1)
    registration.dispose()
    expect(f.tools.size).toBe(0)
  })

  it('executes 120 workspace edits through the same five native Explorer registrations', async () => {
    const f = fixture()
    const base = await registerClearDoseTools({ documentRef: { modelContext: f.context } })
    const registration = await registerDynamicMedicationTools({ context: f.context, dependencies: f.dependencies,
      extraDefinitions: () => createExplorerTools(f.explorer) })
    const handles = new Map([...f.tools].filter(([name]) => name.startsWith('cleardose_')))
    const show = handles.get('cleardose_show_drug_fact')!
    const read = handles.get('cleardose_get_explorer_state')!
    let sequence = 1
    vi.mocked(f.explorer.showFacts).mockImplementation(async input => {
      expect(input.expectedRevision).toBe(f.workspace().revision)
      const drug = f.snapshot().catalog[sequence % 2]!
      f.changeWorkspace({ revision: `workspace-${++sequence}`, selectedDrugs: [drug],
        cards: [{ id: `fact-${sequence}`, factType: input.facts[0]!, drugIds: [drug.id] }] })
      await registration.refresh()
      expect(f.signals.get(show.name)?.aborted).toBe(false)
    })
    const discoveries = vi.mocked(f.context.getTools!).mock.calls.length
    for (let index = 0; index < 120; index += 1) {
      await expect(show.execute({ workspaceRevision: f.workspace().revision, facts: ['warnings'], mode: 'replace' }))
        .resolves.toMatchObject({ workspaceRevision: `workspace-${index + 2}`, cardCount: 1 })
      const state = await read.execute({ section: 'cards' }) as { workspaceRevision: string; rows: Array<{ id: string }> }
      expect(state.workspaceRevision).toBe(f.workspace().revision)
      expect(state.rows[0]?.id).toBe(`fact-${index + 2}`)
      for (const [name, handle] of handles) expect(f.tools.get(name)).toBe(handle)
      expect(f.context.registerTool).toHaveBeenCalledTimes(20)
    }
    expect(f.context.getTools).toHaveBeenCalledTimes(discoveries)
    await expect(show.execute({ workspaceRevision: 'workspace-1', facts: ['uses'] })).rejects.toThrow('Drug Explorer changed')
    expect(f.explorer.showFacts).toHaveBeenCalledTimes(120)
    registration.dispose()
    base.dispose()
    expect(f.tools.size).toBe(0)
  }, 15_000)

  it('defers only an in-flight medication read and rejects stale context before replacing its handle', async () => {
    const f = fixture()
    let release!: () => void
    vi.mocked(f.dependencies.compare).mockImplementation(async () => {
      await new Promise<void>(resolve => { release = resolve })
      return { drugs: [], notice: 'Public data.' }
    })
    const registration = await registerDynamicMedicationTools({ context: f.context, dependencies: f.dependencies,
      extraDefinitions: () => createExplorerTools(f.explorer) })
    const held = f.tools.get('compare_medications')!
    const reader = f.tools.get('cleardose_get_explorer_state')!
    const signal = f.signals.get(held.name)!
    const pending = held.execute({ contextRevision: 'catalog-1', medicationIds: ['med-a'] }, { signal })
    const rejected = expect(pending).rejects.toThrow('Medication context changed')
    while (!release) await Promise.resolve()
    f.change({ revision: 'catalog-2', pageMedicationIds: ['med-b'] })
    await registration.refresh()
    expect(signal.aborted).toBe(false)
    expect(f.tools.get(held.name)).toBe(held)
    expect(f.tools.get('cleardose_get_explorer_state')).toBe(reader)
    release()
    await rejected
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(signal.aborted).toBe(true)
    expect(f.tools.get(held.name)).not.toBe(held)
    expect(f.tools.get('cleardose_get_explorer_state')).toBe(reader)
    registration.dispose()
  })

  it('cleans partial initial registration and reports over-budget schemas without replacing healthy handles', async () => {
    const f = fixture()
    const original = f.context.registerTool
    f.context.registerTool = vi.fn(async (tool, options) => {
      if (tool.name === 'compare_medications') throw new Error('Registration refused')
      return original(tool, options)
    })
    await expect(registerDynamicMedicationTools({ context: f.context, dependencies: f.dependencies })).rejects.toThrow('Registration refused')
    expect(f.tools.size).toBe(0)
    f.context.registerTool = original
    let oversized = false
    const onError = vi.fn()
    const registration = await registerDynamicMedicationTools({ context: f.context, dependencies: f.dependencies,
      extraDefinitions: () => createExplorerTools(f.explorer).map(tool => oversized ? { ...tool, description: 'x'.repeat(10_000) } : tool), onError })
    const held = f.tools.get('compare_medications')
    oversized = true
    await expect(registration.refresh()).rejects.toThrow('byte budget')
    expect(onError).toHaveBeenCalledTimes(1)
    expect(f.tools.get('compare_medications')).toBe(held)
    registration.dispose()
  })

  it('retains medication handles on route-only changes and returns the current route', async () => {
    const f = fixture()
    const registration = await registerDynamicMedicationTools({ context: f.context, dependencies: f.dependencies })
    const held = f.tools.get('compare_medications')!
    const registrations = vi.mocked(f.context.registerTool).mock.calls.length
    f.change({ route: '/compare' })
    await registration.refresh()
    expect(f.context.registerTool).toHaveBeenCalledTimes(registrations)
    expect(f.tools.get('compare_medications')).toBe(held)
    await expect(held.execute({ contextRevision: 'catalog-1', medicationIds: ['med-a'] })).resolves.toMatchObject({ route: '/compare' })
    registration.dispose()
  })

  it('accepts source forms and demo quantities but never retries an uncertain mutation with legacy input', async () => {
    const compare = vi.fn(async () => ({ options: [], medication: {}, pricingNotice: 'Fictional demonstration prices.' }))
    const actions = { compareFulfillmentOptions: compare } as unknown as ClearDoseActions
    const tool = createClearDoseToolDefinitions(actions).find(tool => tool.name === 'compare_fulfillment_options')!
    await tool.execute({ medicationId: 'med-public-new', form: 'SOLUTION, INJECTION', strength: '120 mg/1 mL', quantity: 1 })
    expect(compare).toHaveBeenCalledWith(expect.objectContaining({ form: 'SOLUTION, INJECTION', strength: '120 mg/1 mL', quantity: 1 }))
    await expect(tool.execute({ medicationId: 'med-public-new', form: 'tablet', strength: '1 mg', quantity: 0 })).rejects.toThrow('quantity')
    const execute = vi.fn(async () => { throw new Error('WebMCP executeTool requires an object input.') })
    await expect(executeTool('add_to_cart', {}, { modelContext: { registerTool: vi.fn(), getTools: async () => [{ name: 'add_to_cart', description: 'Add item', annotations: { readOnlyHint: false } }], executeTool: execute } })).rejects.toThrow('object input')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('pages every generated shopping configuration and keeps its fictional-price notice', async () => {
    const configurations = Array.from({ length: 40 }, (_, index) => ({ form: 'TABLET, FILM COATED', strength: `${index + 1} mg/1`, quantity: 28, unit: 'tablet' }))
    const actions = { getMedicationDetails: vi.fn(async () => ({ medicationId: 'med-public-new', genericName: 'New medication',
      forms: Array.from({ length: 100 }, (_, index) => `Source form ${index}`), strengths: [], prescriptionRequired: null,
      shopConfigurations: configurations, shopConfigurationCount: configurations.length, availableSkuCount: configurations.length,
      dataStatus: 'live', pricingNotice: 'Fictional demo configurations and prices, not dosing advice.' })) } as unknown as ClearDoseActions
    const tool = createClearDoseToolDefinitions(actions).find(tool => tool.name === 'get_medication_details')!
    let offset = 0
    const rows: unknown[] = []
    do {
      const result = await tool.execute({ medicationId: 'med-public-new', offset, limit: 10 }) as { shopConfigurations: unknown[]; nextOffset: number | null; pricingNotice: string }
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_500)
      expect(result.pricingNotice).toContain('Fictional')
      rows.push(...result.shopConfigurations)
      if (result.nextOffset === null) break
      offset = result.nextOffset
    } while (offset < configurations.length)
    expect(rows).toEqual(configurations)
  })

  it('keeps worst-case valid configurations exact and rejects a single oversized configuration without an oversized response', async () => {
    const configuration = { form: '"'.repeat(80), strength: '\\'.repeat(120), quantity: 1_000, unit: 'demo unit' }
    const details = { medicationId: `med-${'x'.repeat(124)}`, genericName: '"'.repeat(1_000), shopConfigurations: [configuration],
      shopConfigurationCount: 1, availableSkuCount: 1, dataStatus: 'live', pricingNotice: 'Fictional demo configurations and prices, not dosing advice.' }
    const actions = { getMedicationDetails: vi.fn(async () => details) } as unknown as ClearDoseActions
    const tool = createClearDoseToolDefinitions(actions).find(tool => tool.name === 'get_medication_details')!
    const result = await tool.execute({ medicationId: details.medicationId })
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_500)
    expect(result).toMatchObject({ shopConfigurations: [configuration] })
    details.shopConfigurations = [{ ...configuration, unit: 'x'.repeat(2_000) }]
    await expect(tool.execute({ medicationId: details.medicationId })).rejects.toThrow('One demo configuration exceeds')
  })
})
