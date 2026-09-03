import { describe, expect, it, vi } from 'vitest'
import { drugFactTypes } from '../domain/drug-facts'
import { clearDoseToolCatalog, webMcpContractBudgets } from './definitions'
import { createDynamicMedicationTools } from './dynamic'
import { createExplorerTools } from './explorer'
import { assertNativeDeclarationBudget, nativeDeclarationBudget, nativeDeclarationBytes, nativeToolDefinition } from './schema-budget'
import type { JsonSchema, WebMcpToolDefinition } from './types'

const declarations = (catalogSize: number, cardCount: number, idLength = 128) => {
  const catalog = Array.from({ length: catalogSize }, (_, index) => ({
    id: `med-${String(index).padStart(3, '0')}-${'x'.repeat(idLength - 8)}`,
    name: `Medication ${index} ${'名'.repeat(60)}`,
  }))
  const selected = catalog.slice(0, 4)
  const medicationTools = createDynamicMedicationTools({
    getSnapshot: () => ({ revision: 'r'.repeat(96), route: '/drugs/explore', dataMode: 'hybrid', catalog, pageMedicationIds: selected.map(item => item.id) }),
    compare: vi.fn(), findRelated: vi.fn(),
  })
  const explorerTools = createExplorerTools({
    snapshot: () => ({ revision: 'w'.repeat(96), route: '/drugs/explore', catalog, selectedDrugs: selected,
      cards: drugFactTypes.slice(0, cardCount).map((factType, index) => ({ id: `fact-${index}-${'c'.repeat(100)}`, factType, drugIds: selected.map(item => item.id) })),
    }),
    selectDrugs: vi.fn(), showFacts: vi.fn(), updateFactCard: vi.fn(), removeFactCard: vi.fn(), reveal: vi.fn(),
  })
  return [...clearDoseToolCatalog, ...medicationTools, ...explorerTools]
}

const visitSchema = (schema: JsonSchema, visit: (schema: JsonSchema) => void): void => {
  visit(schema)
  Object.values(schema.properties ?? {}).forEach(property => visitSchema(property, visit))
  if (schema.items) visitSchema(schema.items, visit)
  schema.oneOf?.forEach(option => visitSchema(option, visit))
}

const validationOnly = (schema: JsonSchema): JsonSchema => {
  const result = structuredClone(schema)
  visitSchema(result, property => {
    delete property.title
    delete property.description
    delete property.default
    delete property.examples
  })
  return result
}

describe('native declaration size and preserved contracts', () => {
  it.each([1, 12, 13, 112])('keeps %i catalog IDs and every supported card count under 18,000 UTF-8 bytes', catalogSize => {
    for (const cards of [0, 12, 14]) {
      for (const idLength of [12, 24, 75, 128]) {
        const tools = declarations(catalogSize, cards, idLength)
        expect(tools).toHaveLength(20)
        expect(nativeDeclarationBudget).toBe(18_000)
        expect(nativeDeclarationBytes(tools)).toBeLessThanOrEqual(nativeDeclarationBudget)
        expect(() => assertNativeDeclarationBudget(tools)).not.toThrow()
      }
    }
  })

  it.each([[3, 96], [2, 76], [3, 49], [3, 50], [4, 36], [8, 16], [12, 10]])('bounds near-threshold inline IDs for %i records of length %i', (catalogSize, idLength) => {
    expect(nativeDeclarationBytes(declarations(catalogSize, 14, idLength))).toBeLessThanOrEqual(nativeDeclarationBudget)
  })

  it('keeps declaration headroom after adding checkout form preparation', () => {
    const sizes = [[3, 96], [2, 76], [3, 49], [3, 50], [4, 36], [8, 16], [12, 10], [112, 128]]
      .map(([catalogSize, idLength]) => nativeDeclarationBytes(declarations(catalogSize!, 14, idLength!)))
    expect(Math.max(...sizes)).toBeLessThanOrEqual(nativeDeclarationBudget - 200)
  })

  it('removes display-only metadata without changing constraints, execution, descriptions or supported security hints', () => {
    const execute = vi.fn(() => null)
    const source: WebMcpToolDefinition = {
      name: 'metadata_fixture', title: 'Rich local title', description: 'No automatic checkout. Public facts and demo prices are separate.',
      inputSchema: {
        type: 'object', title: 'Local schema title', description: 'Trusted task description.', required: ['rows'], additionalProperties: false,
        properties: { rows: { type: 'array', minItems: 1, maxItems: 4, default: [], examples: [['med-a']],
          items: { type: 'string', title: 'Medication', description: 'Exact current ID.', minLength: 1, maxLength: 128, pattern: '^med-[a-z]+$',
            enum: ['med-a', 'med-b'], oneOf: [{ type: 'string', const: 'med-a', title: 'Medication A' }],
          },
        } },
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true, destructiveHint: true, idempotentHint: false, openWorldHint: true }, execute,
    }
    const before = JSON.stringify(source)
    const native = nativeToolDefinition(source)
    expect(native.name).toBe(source.name)
    expect(native.title).toBeUndefined()
    expect(native.description).toBe(source.description)
    expect(native.execute).toBe(execute)
    expect(native.annotations).toEqual({ readOnlyHint: false, untrustedContentHint: true })
    expect(validationOnly(native.inputSchema)).toEqual(validationOnly(source.inputSchema))
    visitSchema(native.inputSchema, schema => {
      expect(schema).not.toHaveProperty('title')
      expect(schema).not.toHaveProperty('default')
      expect(schema).not.toHaveProperty('examples')
    })
    expect(JSON.stringify(source)).toBe(before)
    expect(source.annotations.destructiveHint).toBe(true)
    expect(source.inputSchema.properties?.rows?.default).toEqual([])
  })

  it('keeps all parameter descriptions within 150 characters without truncating safety instructions', () => {
    for (const tool of declarations(112, 14)) {
      expect(tool.description.length).toBeLessThanOrEqual(webMcpContractBudgets.toolDescription)
      visitSchema(tool.inputSchema, schema => {
        if (schema.description) expect(schema.description.length).toBeLessThanOrEqual(150)
      })
    }
    const tool = (name: string) => clearDoseToolCatalog.find(item => item.name === name)!
    expect(tool('checkout_demo_order').description).toContain('Only after the user asks')
    expect(tool('checkout_demo_order').description).toContain('Never transmits payment')
    expect(tool('add_to_cart').description).toContain('After the user chooses')
    expect(tool('add_to_cart').description).toContain('Does not check out')
    expect(tool('compare_fulfillment_options').description).toContain('all four exact SKU fields')
    expect(tool('compare_fulfillment_options').description).toContain('not public benchmarks')
    expect(tool('compare_fulfillment_options').description).toContain('Never infer dosing or substitutions')
  })

  it('measures encoded bytes and rejects oversized declarations without silently cutting content', () => {
    const large = { ...clearDoseToolCatalog[0]!, description: '名'.repeat(7_000) }
    expect(nativeDeclarationBytes([large])).toBeGreaterThan(21_000)
    expect(() => assertNativeDeclarationBudget([large])).toThrow('18000-byte budget')
    expect(nativeToolDefinition({ ...large, execute: () => null }).description).toBe(large.description)
  })
})
