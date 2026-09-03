import { describe, expect, it, vi } from 'vitest'
import { clearDoseToolCatalog } from './definitions'
import { createToolDocumentation, validateDocumentationExample } from './documentation'
import { createDynamicMedicationTools, type DynamicMedicationDependencies, type DynamicMedicationSnapshot } from './dynamic'
import { createExplorerTools, type ExplorerToolDependencies, type ExplorerWorkspaceSnapshot } from './explorer'
import { nativeToolDefinition } from './schema-budget'
import type { ClearDoseToolDescriptor, JsonSchema } from './types'

const fixture = (empty = false) => {
  const catalog = empty ? [] : [{ id: 'med-metformin', name: 'Metformin' }, { id: 'med-empagliflozin', name: 'Empagliflozin' }]
  let medication: DynamicMedicationSnapshot = { revision: 'catalog-example-1', route: '/webmcp', dataMode: 'hybrid', catalog, pageMedicationIds: [] }
  let workspace: ExplorerWorkspaceSnapshot = { revision: 'workspace-example-1', catalog, selectedDrugs: [], cards: [] }
  const medicationDependencies: DynamicMedicationDependencies = { getSnapshot: () => medication, findRelated: vi.fn(), compare: vi.fn() }
  const explorerDependencies: ExplorerToolDependencies = { snapshot: () => workspace, selectDrugs: vi.fn(), showFacts: vi.fn(), updateFactCard: vi.fn(), removeFactCard: vi.fn(), reveal: vi.fn() }
  return {
    tools: () => [...clearDoseToolCatalog, ...createDynamicMedicationTools(medicationDependencies), ...createExplorerTools(explorerDependencies)],
    medicationDependencies,
    explorerDependencies,
    change: () => {
      medication = { ...medication, revision: 'catalog-example-2', route: '/drugs/explore', pageMedicationIds: catalog.map(drug => drug.id) }
      workspace = { ...workspace, revision: 'workspace-example-2', selectedDrugs: catalog, cards: [{ id: 'fact-current-1', factType: 'warnings', drugIds: catalog.map(drug => drug.id) }] }
    },
  }
}

describe('canonical tool documentation', () => {
  it('documents every supplied definition and validates every current example', () => {
    const tools = fixture().tools()
    const documentation = createToolDocumentation(tools)
    expect(documentation).toHaveLength(tools.length)
    expect(documentation.map(tool => tool.name)).toEqual(tools.map(tool => tool.name))
    for (const item of documentation) {
      expect(item.validationErrors, item.name).toEqual([])
      expect(item.prompt, item.name).not.toBe('')
      expect(item.sourceModule, item.name).toMatch(/^src\/webmcp\//)
      expect(item.stateAffected.length, item.name).toBeGreaterThan(0)
      expect(item.errors.length, item.name).toBeGreaterThan(0)
      expect(item.exampleResult, item.name).toBeDefined()
      expect(item.inputSchema).toBe(tools.find(tool => tool.name === item.name)!.inputSchema)
      expect(item.nativeSchema).toEqual(nativeToolDefinition({ ...item, execute: () => null }).inputSchema)
    }
  })

  it('documents the supplied definitions when the contextual catalog is empty', () => {
    const tools = fixture(true).tools()
    const documentation = createToolDocumentation(tools)
    expect(documentation).toHaveLength(tools.length)
    expect(documentation.some(tool => tool.name === 'compare_medications')).toBe(false)
    expect(documentation.every(tool => tool.validationErrors.length === 0)).toBe(true)
    const edit = documentation.find(tool => tool.name === 'cleardose_update_fact_card')!
    expect(edit.exampleInput.cardId).toBe('card-not-yet-created')
    expect(edit.safeToRun).toBe(false)
    expect(edit.errors.some(error => error.recovery.includes('current revision and card IDs'))).toBe(true)
  })

  it('generates docs without executing tools, preparing prerequisites or calling providers', () => {
    const current = fixture()
    const execute = vi.fn(() => { throw new Error('Documentation must never execute a tool.') })
    createToolDocumentation(current.tools().map(tool => ({ ...tool, execute })))
    expect(execute).not.toHaveBeenCalled()
    expect(current.medicationDependencies.findRelated).not.toHaveBeenCalled()
    expect(current.medicationDependencies.compare).not.toHaveBeenCalled()
    for (const name of ['selectDrugs', 'showFacts', 'updateFactCard', 'removeFactCard', 'reveal'] as const) {
      expect(current.explorerDependencies[name]).not.toHaveBeenCalled()
    }
  })

  it('updates dynamic example revisions, allowed scope and current card IDs', () => {
    const current = fixture()
    const before = createToolDocumentation(current.tools())
    current.change()
    const after = createToolDocumentation(current.tools())
    expect(before.find(tool => tool.name === 'compare_medications')!.exampleInput.contextRevision).toBe('catalog-example-1')
    expect(after.find(tool => tool.name === 'compare_medications')!.exampleInput.contextRevision).toBe('catalog-example-2')
    expect(after.find(tool => tool.name === 'compare_medications')!.inputSchema.properties!.scope!.enum).toEqual(['page', 'catalog'])
    expect(after.find(tool => tool.name === 'cleardose_update_fact_card')!.exampleInput).toMatchObject({ workspaceRevision: 'workspace-example-2', cardId: 'fact-current-1' })
    expect(after.every(tool => tool.validationErrors.length === 0)).toBe(true)
  })

  it('only permits the two reviewed read shortcuts and discloses drawer presentation effects', () => {
    const docs = createToolDocumentation(fixture().tools())
    expect(docs.filter(tool => tool.safeToRun).map(tool => tool.name).sort()).toEqual(['cleardose_get_explorer_state', 'view_cart'])
    expect(docs.find(tool => tool.name === 'view_cart')!.stateAffected).toContain('Opens the cart drawer')
    expect(docs.find(tool => tool.name === 'checkout_demo_order')!.classification).toBe('approval-required')
    expect(docs.find(tool => tool.name === 'remove_cart_item')!.classification).toBe('destructive')
    expect(docs.find(tool => tool.name === 'search_medications')!.classification).toBe('mutating')
    expect(docs.find(tool => tool.name === 'compare_medications')!.classification).toBe('read-only')
    const changed = { ...clearDoseToolCatalog.find(tool => tool.name === 'view_cart')!, annotations: { readOnlyHint: false } }
    expect(createToolDocumentation([changed])[0]!.safeToRun).toBe(false)
  })

  it('fails closed for unknown tools while preserving automatic cards and prompts', () => {
    const newTool: ClearDoseToolDescriptor = { name: 'new_catalog_reader', title: 'Inspect a new catalog', description: 'Future catalog inspection.', category: 'discovery', inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 1 } }, required: ['query'], additionalProperties: false }, annotations: { readOnlyHint: true }, exampleInput: { query: 'metformin' } }
    const [doc] = createToolDocumentation([newTool])
    expect(doc).toMatchObject({ name: newTool.name, classification: 'read-only', safeToRun: false, validationErrors: [] })
    expect(doc!.prompt).toContain(newTool.name)
    expect(doc!.prompt).toContain('metformin')
    expect(doc!.sourceModule).toBe('Application-provided canonical tool descriptor')
    expect(doc!.exampleResult).toMatchObject({ documentationOnly: true })
    expect(createToolDocumentation([])).toEqual([])
  })

  it('keeps checkout preparation preview-only and separates form filling from order creation', () => {
    const definition = clearDoseToolCatalog.find(tool => tool.name === 'prepare_demo_checkout')!
    expect(definition).toBeDefined()
    const [doc] = createToolDocumentation([definition])
    expect(doc).toMatchObject({ classification: 'mutating', safeToRun: false, validationErrors: [] })
    expect(doc!.exampleResult).toMatchObject({ route: '/checkout', itemCount: 1, prepared: true, orderCreated: false })
    expect(doc!.stateAffected).toContain('Does not create an order, clear the cart or persist recipient fields')
    expect(doc!.prompt).toContain('stop for my review')
    expect(doc!.prompt).toContain('Do not invent missing details or place an order')
    const result = doc!.exampleResult as Record<string, unknown>
    expect(result.filledFields).toEqual(['fullName', 'address', 'prescriptionStatus'])
    expect(result).not.toHaveProperty('fullName')
    expect(result).not.toHaveProperty('address')
    expect(JSON.stringify(result)).not.toContain(String(definition.exampleInput.fullName))
    expect(doc!.errors.some(error => error.recovery.includes('Ask the person for the missing details'))).toBe(true)
  })

  it('retains authored schema annotations but uses the existing compact native projection', () => {
    const [doc] = createToolDocumentation([clearDoseToolCatalog[0]!])
    expect(doc!.inputSchema.properties!.limit!.default).toBe(5)
    expect(doc!.nativeSchema.properties!.limit!.default).toBeUndefined()
    expect(doc!.nativeSchema.properties!.limit!.minimum).toBe(1)
    expect(doc!.schemaNotes).toContain('Runtime handlers also check current IDs')
  })

  it('reports invalid safe-read examples without making them runnable', () => {
    const tool = { ...clearDoseToolCatalog.find(item => item.name === 'view_cart')!, exampleInput: { limit: 99 } }
    const [doc] = createToolDocumentation([tool])
    expect(doc!.validationErrors).toContain('arguments.limit must be at most 5.')
    expect(doc!.safeToRun).toBe(false)
  })

  it('keeps each Explorer result fixture consistent with its example facts and medication IDs', () => {
    const current = fixture()
    current.change()
    const docs = createToolDocumentation(current.tools())
    const select = docs.find(tool => tool.name === 'cleardose_select_drugs')!
    expect(select.exampleResult).toMatchObject({ selectedDrugIds: select.exampleInput.drugs, cardCount: 0, factResults: [], data: { availability: 'not-requested', requested: 0 } })
    const show = docs.find(tool => tool.name === 'cleardose_show_drug_fact')!
    expect(show.exampleResult).toMatchObject({ selectedDrugIds: show.exampleInput.drugs, cardCount: 2, factResultsTotal: 2, factResults: [
      { factType: 'side-effects', drugId: 'med-empagliflozin' }, { factType: 'pricing', drugId: 'med-empagliflozin' },
    ], data: { requested: 2, unavailable: 2 } })
    const update = docs.find(tool => tool.name === 'cleardose_update_fact_card')!
    expect(update.exampleResult).toMatchObject({ cardCount: 1, factResults: [{ id: 'fact-current-1', factType: 'ingredients' }] })
    const remove = docs.find(tool => tool.name === 'cleardose_remove_fact_card')!
    expect(remove.exampleResult).toMatchObject({ selectedDrugIds: ['med-example-existing-selection'], cardCount: 0, factResults: [], factResultsTotal: 0 })
    const results = [select.exampleResult, show.exampleResult, update.exampleResult, remove.exampleResult] as Array<{ factResults: Array<{ factType: string }> }>
    expect(results.flatMap(result => result.factResults.map(row => row.factType))).not.toContain('interactions')
  })

  it('keeps multi-drug fixture fact counts and response pagination truthful', () => {
    const show = fixture().tools().find(tool => tool.name === 'cleardose_show_drug_fact')!
    const tool = { ...show, exampleInput: { ...show.exampleInput, drugs: ['med-metformin', 'med-empagliflozin'], facts: ['uses', 'warnings', 'pricing'] } }
    const [doc] = createToolDocumentation([tool])
    const result = doc!.exampleResult as { cardCount: number; selectedDrugIds: string[]; factResultsTotal: number; factResults: Array<{ factType: string; drugId: string }>; factResultsTruncated: boolean; data: { requested: number } }
    expect(result).toMatchObject({ cardCount: 3, selectedDrugIds: tool.exampleInput.drugs, factResultsTotal: 6, factResultsTruncated: true, data: { requested: 6 } })
    expect(result.factResults.every(row => tool.exampleInput.facts.includes(row.factType) && tool.exampleInput.drugs.includes(row.drugId))).toBe(true)
    expect(result.factResults.length).toBeLessThanOrEqual(4)
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_500)
  })
})

describe('documentation example schema checks', () => {
  it('checks object type, required fields, extra fields and nested values', () => {
    const schema: JsonSchema = { type: 'object', required: ['address'], additionalProperties: false, properties: { address: { type: 'object', required: ['postalCode'], additionalProperties: false, properties: { postalCode: { type: 'string', pattern: '^\\d{5}$' } } } } }
    expect(validateDocumentationExample({ address: { postalCode: '21201' } }, schema)).toEqual([])
    expect(validateDocumentationExample({}, schema)).toContain('arguments.address is required.')
    expect(validateDocumentationExample(null, schema)).toContain('arguments must be an object.')
    expect(validateDocumentationExample([], schema)).toContain('arguments must be an object.')
    expect(validateDocumentationExample({ address: { postalCode: 'bad', extra: true }, wrong: 1 }, schema)).toEqual(expect.arrayContaining(['arguments.address.postalCode does not match its declared pattern.', 'arguments.address.extra is not an allowed property.', 'arguments.wrong is not an allowed property.']))
    expect(validateDocumentationExample({ address: undefined }, schema)).toContain('arguments.address must be an object.')
  })

  it('checks arrays, enums, const, numbers, integers and booleans', () => {
    const array: JsonSchema = { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', enum: ['one', 'two'] } }
    expect(validateDocumentationExample([], array)).toContain('arguments needs at least 1 items.')
    expect(validateDocumentationExample(['one', 'two', 'other'], array)).toEqual(expect.arrayContaining(['arguments allows at most 2 items.', 'arguments[2] must use a declared enum value.']))
    expect(validateDocumentationExample('one', array)).toContain('arguments must be an array.')
    expect(validateDocumentationExample('old', { type: 'string', const: 'current' })).toContain('arguments must equal the declared const value.')
    expect(validateDocumentationExample(null, { type: 'string', const: 'current' })).toContain('arguments must be a string.')
    expect(validateDocumentationExample(1.2, { type: 'integer', minimum: 2, maximum: 4 })).toEqual(['arguments must be an integer.', 'arguments must be at least 2.'])
    expect(validateDocumentationExample(5, { type: 'number', maximum: 4 })).toContain('arguments must be at most 4.')
    expect(validateDocumentationExample(2.5, { type: 'number', minimum: 2, maximum: 4 })).toEqual([])
    expect(validateDocumentationExample(Number.NaN, { type: 'number' })).toContain('arguments must be a finite number.')
    expect(validateDocumentationExample(Infinity, { type: 'integer' })).toContain('arguments must be a finite integer.')
    expect(validateDocumentationExample('true', { type: 'boolean' })).toContain('arguments must be a boolean.')
    expect(validateDocumentationExample(false, { type: 'boolean' })).toEqual([])
  })

  it('checks calendar dates, patterns and Unicode string lengths', () => {
    expect(validateDocumentationExample('2024-02-29', { type: 'string', format: 'date' })).toEqual([])
    for (const date of ['2025-02-29', '2026-13-01', '2026-01-32', '2026-1-01', 'not-a-date']) {
      expect(validateDocumentationExample(date, { type: 'string', format: 'date' })).toContain('arguments must be a valid YYYY-MM-DD date.')
    }
    expect(validateDocumentationExample('a', { type: 'string', minLength: 2 })).toContain('arguments needs at least 2 characters.')
    expect(validateDocumentationExample('long', { type: 'string', maxLength: 3 })).toContain('arguments allows at most 3 characters.')
    expect(validateDocumentationExample('\u{1F48A}', { type: 'string', maxLength: 1 })).toEqual([])
    expect(validateDocumentationExample('text', { type: 'string', pattern: '[' })).toContain('arguments has an invalid schema pattern.')
  })

  it('requires exactly one oneOf match and still validates parent constraints', () => {
    const schema: JsonSchema = { type: 'integer', maximum: 5, oneOf: [{ type: 'integer', minimum: 0 }, { type: 'integer', maximum: -1 }] }
    expect(validateDocumentationExample(2, schema)).toEqual([])
    expect(validateDocumentationExample(6, schema)).toEqual(['arguments must be at most 5.'])
    expect(validateDocumentationExample(0, { type: 'integer', oneOf: [{ type: 'integer', minimum: 0 }, { type: 'integer', maximum: 0 }] })).toContain('arguments must match exactly one oneOf branch.')
    expect(validateDocumentationExample('bad', schema)).toContain('arguments must match exactly one oneOf branch.')
  })
})
