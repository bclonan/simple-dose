import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drugFactTypes, type DrugFactType } from '../domain/drug-facts'
import { useAgentActivityStore } from '../stores/agentActivity.store'
import {
  createExplorerTools,
  explorerOutputBudget,
  explorerToolNames,
  explorerWorkspaceSignature,
  type ExplorerDrugIdentity,
  type ExplorerFactCard,
  type ExplorerMutationContext,
  type ExplorerToolDependencies,
  type ExplorerWorkspaceSnapshot,
} from './explorer'
import type { JsonSchema } from './types'
import { nativeToolDefinition } from './schema-budget'

const catalog: ExplorerDrugIdentity[] = [
  { id: 'med-metformin', name: 'Metformin' },
  { id: 'med-empagliflozin', name: 'Empagliflozin' },
  { id: 'med-atorvastatin', name: 'Atorvastatin' },
]

const initial = (): ExplorerWorkspaceSnapshot => ({
  revision: 'workspace-1', selectedDrugs: [catalog[0]!], cards: [], catalog,
  route: '/medications',
})

const setup = (seed: ExplorerWorkspaceSnapshot = initial()) => {
  let current = structuredClone(seed)
  let version = 1
  let sequence = 0
  const guard = (input: ExplorerMutationContext): void => {
    input.signal?.throwIfAborted()
    if (input.expectedRevision !== current.revision) throw new Error('The workspace changed before commit.')
  }
  const resolve = (terms: string[]): ExplorerDrugIdentity[] => terms.map((term) => {
    const query = term.toLowerCase()
    const drug = current.catalog.find((drug) => drug.id === term || drug.name.toLowerCase() === query ||
      (query === 'jardiance' && drug.id === 'med-empagliflozin'))
    if (!drug) throw new Error('That medication is not available. Search another generic or brand name.')
    return drug
  })
  const commit = (selectedDrugs: ExplorerDrugIdentity[], cards: ExplorerFactCard[] = current.cards): void => {
    current = { ...current, revision: `workspace-${++version}`, selectedDrugs,
      cards: cards.map((card) => ({ ...card, drugIds: selectedDrugs.map((drug) => drug.id) })),
    }
  }
  const requestedCards = (facts: DrugFactType[], mode: 'add' | 'replace'): ExplorerFactCard[] => {
    const requested = facts.map((factType) => current.cards.find((card) => card.factType === factType) ??
      { id: `fact-${++sequence}`, factType, drugIds: [] })
    return mode === 'replace' ? requested : [...current.cards, ...requested.filter((card) => !current.cards.some((old) => old.factType === card.factType))]
  }
  const dependencies: ExplorerToolDependencies = {
    snapshot: () => current,
    selectDrugs: vi.fn(async (input) => {
      const resolved = resolve(input.drugs)
      guard(input)
      const drugs = input.mode === 'replace' ? resolved : input.mode === 'remove'
        ? current.selectedDrugs.filter((drug) => !resolved.some((candidate) => candidate.id === drug.id))
        : [...new Map([...current.selectedDrugs, ...resolved].map((drug) => [drug.id, drug])).values()]
      if (drugs.length > 4) throw new Error('Compare up to four medications.')
      commit(drugs)
    }),
    showFacts: vi.fn(async (input) => {
      const resolved = input.drugs ? resolve(input.drugs) : current.selectedDrugs
      guard(input)
      commit(resolved, requestedCards(input.facts, input.mode))
    }),
    updateFactCard: vi.fn(async (input) => {
      guard(input)
      commit(current.selectedDrugs, current.cards.map((card) => card.id === input.cardId ? { ...card, factType: input.factType } : card))
    }),
    removeFactCard: vi.fn(async (input) => {
      guard(input)
      commit(current.selectedDrugs, current.cards.filter((card) => card.id !== input.cardId))
    }),
    reveal: vi.fn(async () => { current = { ...current, route: '/drugs/explore' } }),
  }
  const tool = (name: typeof explorerToolNames[number]) => createExplorerTools(dependencies).find((item) => item.name === name)!
  return { dependencies, tool, guard, current: () => current, update: (next: ExplorerWorkspaceSnapshot) => { current = structuredClone(next) } }
}

interface StateOutput {
  workspaceRevision: string
  stateRevision: string
  section: string
  offset: number
  returned: number
  total: number
  nextOffset: number | null
  rows: Array<{ kind: string; id: string; label?: string; factType?: DrugFactType; drugIds?: string[] }>
}
const stateResult = (value: unknown): StateOutput => value as StateOutput

describe('Explorer fact loading receipts', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.restoreAllMocks() })
  it('rejects an edit superseded during navigation without changing the newer workspace', async () => {
    const fixture = setup()
    let entered!: () => void
    let release!: () => void
    const navigationStarted = new Promise<void>(resolve => { entered = resolve })
    const navigationFinished = new Promise<void>(resolve => { release = resolve })
    vi.mocked(fixture.dependencies.reveal).mockImplementation(async () => { entered(); await navigationFinished })
    const pending = fixture.tool('cleardose_show_drug_fact').execute({ workspaceRevision: fixture.current().revision, facts: ['warnings'] })
    const rejected = expect(pending).rejects.toThrow('superseded it while navigation finished')
    await navigationStarted
    expect(fixture.current().cards.map(card => card.factType)).toEqual(['warnings'])
    fixture.update({ ...fixture.current(), revision: 'newer-workspace', selectedDrugs: [], cards: [], route: '/medications' })
    const newer = structuredClone(fixture.current())
    release()
    await rejected
    expect(fixture.current()).toEqual(newer)
    expect(useAgentActivityStore().entries[0]?.status).toBe('error')
  })
  it('reports a committed layout separately from unavailable facts and invalidates pages after data recovery', async () => {
    const cards: ExplorerFactCard[] = [{ id: 'fact-1', factType: 'side-effects', drugIds: ['med-metformin'] }]
    const fixture = setup({ ...initial(), cards, factResults: [{ cardId: 'fact-1', drugId: 'med-metformin', factType: 'side-effects', availability: 'provider-failed', source: 'openfda-label', warnings: [{ source: 'openfda-label', code: 'network' }] }] })
    const declarations = createExplorerTools(fixture.dependencies)
    const before = JSON.stringify(declarations.map(nativeToolDefinition))
    const output = await fixture.tool('cleardose_show_drug_fact').execute({ workspaceRevision: fixture.current().revision, facts: ['side-effects'] })
    expect(output).toMatchObject({ status: 'updated', cardCount: 1, data: { availability: 'unavailable', requested: 1, providerFailed: 1 }, factResults: [expect.objectContaining({ availability: 'provider-failed', warnings: [{ source: 'openfda-label', code: 'network' }] })] })
    const reader = declarations.find(tool => tool.name === 'cleardose_get_explorer_state')!
    const first = stateResult(await reader.execute({ section: 'cards', limit: 1 }))
    const failed = stateResult(await reader.execute({ section: 'cards', offset: first.nextOffset, workspaceRevision: first.workspaceRevision, stateRevision: first.stateRevision }))
    expect(failed.rows).toEqual([expect.objectContaining({ kind: 'fact-data', drugId: 'med-metformin', factType: 'side-effects', availability: 'provider-failed' })])
    fixture.update({ ...fixture.current(), factResults: fixture.current().factResults!.map(result => ({ ...result, availability: 'available', warnings: [] })) })
    expect(JSON.stringify(createExplorerTools(fixture.dependencies).map(nativeToolDefinition))).toBe(before)
    await expect(reader.execute({ section: 'cards', offset: first.nextOffset, workspaceRevision: first.workspaceRevision, stateRevision: first.stateRevision })).rejects.toThrow('state or catalog changed')
    expect(await reader.execute({ section: 'cards' })).toMatchObject({ data: { availability: 'available', providerFailed: 0 } })
  })

  it('pages all 56 long-ID fact outcomes and keeps the committed mutation within 1500 characters', async () => {
    const drugs = Array.from({ length: 4 }, (_, index) => ({ id: `med-${'x'.repeat(123)}${index}`, name: 'Public name '.repeat(8) }))
    const cards = drugFactTypes.map((factType, index) => ({ id: `fact-${'x'.repeat(120)}${String(index).padStart(3, '0')}`, factType, drugIds: drugs.map(drug => drug.id) }))
    const fixture = setup({ ...initial(), revision: 'w'.repeat(96), route: `/${'r'.repeat(159)}`, catalog: drugs, selectedDrugs: drugs, cards,
      factResults: cards.flatMap(card => drugs.map(drug => ({ cardId: card.id, drugId: drug.id, factType: card.factType, availability: 'provider-failed' as const, source: 's'.repeat(40), warnings: Array.from({ length: 4 }, () => ({ source: 's'.repeat(40), code: 'c'.repeat(32) })) }))),
    })
    vi.mocked(fixture.dependencies.selectDrugs).mockResolvedValue()
    vi.mocked(fixture.dependencies.reveal).mockResolvedValue()
    const changed = await fixture.tool('cleardose_select_drugs').execute({ workspaceRevision: fixture.current().revision, drugs: drugs.map(drug => drug.id) })
    expect(JSON.stringify(changed).length).toBeLessThanOrEqual(explorerOutputBudget)
    expect(changed).toMatchObject({ status: 'updated', data: { requested: 56, providerFailed: 56 }, factResultsTotal: 56, factResultsTruncated: true })
    const reader = fixture.tool('cleardose_get_explorer_state')
    const rows: StateOutput['rows'] = []
    let offset = 0
    let stateRevision: string | undefined
    do {
      const result = await reader.execute({ section: 'workspace', offset, limit: 10, workspaceRevision: fixture.current().revision, ...(stateRevision ? { stateRevision } : {}) })
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(explorerOutputBudget)
      const page = stateResult(result)
      rows.push(...page.rows)
      stateRevision = page.stateRevision
      if (page.nextOffset === null) break
      expect(page.nextOffset).toBeGreaterThan(offset)
      offset = page.nextOffset
    } while (true)
    expect(rows.filter(row => row.kind === 'fact-data')).toHaveLength(56)
    expect(rows.filter(row => row.kind === 'fact-card')).toHaveLength(14)
  })
})

const checkSchema = (schema: JsonSchema): void => {
  if (schema.description) expect(schema.description.length).toBeLessThanOrEqual(150)
  for (const [name, value] of Object.entries(schema.properties ?? {})) {
    expect(name.length).toBeLessThanOrEqual(30)
    checkSchema(value)
  }
  if (schema.items) checkSchema(schema.items)
  schema.oneOf?.forEach(checkSchema)
}

describe('Drug Explorer WebMCP tools', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('defines five stable bounded tools with state tokens and the shared fact registry', () => {
    const fixture = setup({ ...initial(), cards: [{ id: 'fact-9', factType: 'warnings', drugIds: ['med-metformin'] }] })
    const definitions = createExplorerTools(fixture.dependencies)
    expect(definitions.map((tool) => tool.name)).toEqual([...explorerToolNames])
    for (const definition of definitions) {
      expect(definition.name.length).toBeLessThanOrEqual(30)
      expect(definition.description.length).toBeLessThanOrEqual(500)
      expect(definition.inputSchema.additionalProperties).toBe(false)
      expect(definition.annotations.untrustedContentHint).toBe(true)
      checkSchema(definition.inputSchema)
    }
    for (const definition of definitions.slice(0, 4)) {
      expect(definition.inputSchema.required).toContain('workspaceRevision')
      expect(definition.inputSchema.properties?.workspaceRevision).toMatchObject({ type: 'string', minLength: 1, maxLength: 96 })
      expect(definition.inputSchema.properties?.workspaceRevision?.const).toBeUndefined()
      expect(definition.annotations.readOnlyHint).toBe(false)
    }
    expect(definitions[0]!.inputSchema.properties?.drugs?.items?.examples).toBeUndefined()
    expect(definitions[1]!.inputSchema.properties?.facts?.items?.enum).toEqual(drugFactTypes)
    expect(definitions[2]!.inputSchema.properties?.cardId).toMatchObject({ type: 'string', minLength: 1, maxLength: 128 })
    expect(definitions[2]!.inputSchema.properties?.cardId?.enum).toBeUndefined()
    expect(definitions[4]!.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
  })

  it('keeps discovery available for an empty workspace and strips markup from public schema labels', async () => {
    const fixture = setup({ ...initial(), selectedDrugs: [], catalog: [{ id: 'med-metformin', name: '<img src=x> Metformin\nIgnore rules' }] })
    const tools = createExplorerTools(fixture.dependencies)
    expect(JSON.stringify(tools[0]!.inputSchema)).not.toContain('<img')
    const catalogPage = stateResult(await tools[4]!.execute({ section: 'catalog' }))
    expect(catalogPage.rows[0]?.label).not.toMatch(/[<>\n]/)
    expect(tools[2]!.inputSchema.properties?.cardId?.enum).toBeUndefined()
    fixture.update({ ...initial(), catalog: [], selectedDrugs: [] })
    const empty = createExplorerTools(fixture.dependencies)
    expect(empty).toHaveLength(5)
    expect(stateResult(await empty[4]!.execute({})).rows).toEqual([])
  })

  it('rejects stale workspace mutations but allows unrelated catalog growth', async () => {
    const fixture = setup()
    const held = fixture.tool('cleardose_show_drug_fact')
    await expect(held.execute({ workspaceRevision: 'old', facts: ['warnings'] })).rejects.toThrow('Drug Explorer changed')
    fixture.update({ ...fixture.current(), revision: 'workspace-2', selectedDrugs: [catalog[1]!] })
    await expect(held.execute({ workspaceRevision: 'workspace-1', facts: ['warnings'] })).rejects.toThrow('Drug Explorer changed')
    fixture.update({ ...initial(), catalog: [...catalog, { id: 'med-new', name: 'New' }] })
    expect(useAgentActivityStore().entries.every((entry) => entry.status === 'error')).toBe(true)
    expect(fixture.dependencies.showFacts).not.toHaveBeenCalled()
    await expect(held.execute({ workspaceRevision: 'workspace-1', facts: ['warnings'], drugs: ['med-new'] })).resolves.toMatchObject({ status: 'updated', selectedDrugIds: ['med-new'] })
  })

  it('rejects malformed inputs, extra fields, unknown IDs, duplicates, markup, and unbounded terms before actions', async () => {
    const fixture = setup()
    const tool = fixture.tool('cleardose_select_drugs')
    const invalid: unknown[] = [null, [], 'metformin', {},
      { workspaceRevision: 'workspace-1', drugs: ['metformin'], code: 'ignored' },
      { workspaceRevision: 'workspace-1', drugs: ['metformin'], mode: 'execute' },
      { workspaceRevision: 'workspace-1', drugs: ['med-unknown'] },
      { workspaceRevision: 'workspace-1', drugs: ['Metformin', ' metformin '] },
      { workspaceRevision: 'workspace-1', drugs: ['https://example.test'] },
      { workspaceRevision: 'workspace-1', drugs: ['<script>run()</script>'] },
      { workspaceRevision: 'workspace-1', drugs: ['a'.repeat(121)] },
      { workspaceRevision: 'workspace-1', drugs: ['a', 'b', 'c', 'd', 'e'] },
      { workspaceRevision: 'workspace-1', drugs: [], mode: 'add' },
      { workspaceRevision: 'workspace-1', drugs: [1] },
    ]
    for (const input of invalid) await expect(tool.execute(input)).rejects.toThrow()
    expect(fixture.dependencies.selectDrugs).not.toHaveBeenCalled()
    expect(fixture.dependencies.reveal).not.toHaveBeenCalled()
  })

  it('runs select, show-only, card evolution, card removal, and drug removal through shared callbacks', async () => {
    const fixture = setup()
    const held = new Map(createExplorerTools(fixture.dependencies).map(tool => [tool.name, tool]))
    const tool = (name: string) => held.get(name)!
    await tool('cleardose_select_drugs').execute({ workspaceRevision: fixture.current().revision, drugs: ['Metformin', 'Jardiance'] })
    expect(fixture.current().selectedDrugs.map((drug) => drug.id)).toEqual(['med-metformin', 'med-empagliflozin'])
    await tool('cleardose_show_drug_fact').execute({ workspaceRevision: fixture.current().revision, facts: ['side-effects', 'pricing'], mode: 'replace' })
    expect(fixture.current().cards.map((card) => card.factType)).toEqual(['side-effects', 'pricing'])
    const response = await tool('cleardose_show_drug_fact').execute({ workspaceRevision: fixture.current().revision, facts: ['interactions'], mode: 'replace' })
    expect(response).toMatchObject({ status: 'updated', cardCount: 1, route: '/drugs/explore' })
    const card = fixture.current().cards[0]!
    await tool('cleardose_update_fact_card').execute({ workspaceRevision: fixture.current().revision, cardId: card.id, factType: 'ingredients' })
    expect(fixture.current().cards[0]).toMatchObject({ id: card.id, factType: 'ingredients', drugIds: ['med-metformin', 'med-empagliflozin'] })
    await tool('cleardose_select_drugs').execute({ workspaceRevision: fixture.current().revision, drugs: ['med-metformin'], mode: 'remove' })
    expect(fixture.current().cards[0]!.drugIds).toEqual(['med-empagliflozin'])
    await tool('cleardose_remove_fact_card').execute({ workspaceRevision: fixture.current().revision, cardId: card.id })
    expect(fixture.current().cards).toEqual([])
    expect(fixture.dependencies.reveal).toHaveBeenCalledTimes(6)
    expect(useAgentActivityStore().entries).toHaveLength(6)
    expect(useAgentActivityStore().entries.every((entry) => entry.status === 'success')).toBe(true)
  })

  it('passes optional drugs and exact facts as one guarded mutation, preserving add mode and clearing only on replace', async () => {
    const fixture = setup()
    const controller = new AbortController()
    await fixture.tool('cleardose_show_drug_fact').execute({ workspaceRevision: fixture.current().revision,
      drugs: ['Metformin', 'Jardiance'], facts: ['warnings', 'pricing'], mode: 'replace',
    }, { signal: controller.signal })
    expect(fixture.dependencies.showFacts).toHaveBeenCalledWith({ expectedRevision: 'workspace-1', signal: controller.signal,
      drugs: ['Metformin', 'Jardiance'], facts: ['warnings', 'pricing'], mode: 'replace',
    })
    expect(fixture.dependencies.selectDrugs).not.toHaveBeenCalled()
    await fixture.tool('cleardose_show_drug_fact').execute({ workspaceRevision: fixture.current().revision, facts: ['warnings', 'ingredients'], mode: 'add' })
    expect(fixture.current().cards.map((card) => card.factType)).toEqual(['warnings', 'pricing', 'ingredients'])
    await fixture.tool('cleardose_select_drugs').execute({ workspaceRevision: fixture.current().revision, drugs: [], mode: 'replace' })
    expect(fixture.current().selectedDrugs).toEqual([])
    expect(fixture.current().cards.every((card) => card.drugIds.length === 0)).toBe(true)
  })

  it('requires selected IDs for removal and existing current card IDs for card edits', async () => {
    const fixture = setup()
    for (const drugs of [['Metformin'], ['med-empagliflozin']]) {
      await expect(fixture.tool('cleardose_select_drugs').execute({ workspaceRevision: 'workspace-1', drugs, mode: 'remove' })).rejects.toThrow('current selected drug IDs')
    }
    await expect(fixture.tool('cleardose_remove_fact_card').execute({ workspaceRevision: 'workspace-1', cardId: 'fact-missing' })).rejects.toThrow('cardId')
    await expect(fixture.tool('cleardose_update_fact_card').execute({ workspaceRevision: 'workspace-1', cardId: 'fact-missing', factType: 'warnings' })).rejects.toThrow('cardId')
    expect(fixture.dependencies.selectDrugs).not.toHaveBeenCalled()
    expect(fixture.dependencies.updateFactCard).not.toHaveBeenCalled()
    expect(fixture.dependencies.removeFactCard).not.toHaveBeenCalled()
  })

  it('keeps an out-of-mode selected public ID removable without allowing it in add or replace', async () => {
    const publicDrug = { id: 'med-public-empagliflozin', name: 'Empagliflozin' }
    const fixture = setup({ ...initial(), selectedDrugs: [publicDrug], catalog: [catalog[0]!] })
    const tool = fixture.tool('cleardose_select_drugs')
    const choices = tool.inputSchema.properties?.drugs?.items
    expect(choices?.examples).toBeUndefined()
    expect(choices?.description).toContain('removal-only')
    expect(fixture.tool('cleardose_show_drug_fact').inputSchema.properties?.drugs?.items?.examples).toBeUndefined()
    for (const mode of ['add', 'replace']) {
      await expect(tool.execute({ workspaceRevision: 'workspace-1', drugs: [publicDrug.id], mode })).rejects.toThrow('current catalog ID')
    }
    expect(fixture.dependencies.selectDrugs).not.toHaveBeenCalled()
    vi.mocked(fixture.dependencies.selectDrugs).mockImplementationOnce(input => {
      fixture.guard(input)
      fixture.update({ ...fixture.current(), revision: 'workspace-2', selectedDrugs: [] })
    })
    await tool.execute({ workspaceRevision: 'workspace-1', drugs: [publicDrug.id], mode: 'remove' })
    expect(fixture.dependencies.selectDrugs).toHaveBeenCalledWith({ expectedRevision: 'workspace-1', signal: undefined, drugs: [publicDrug.id], mode: 'remove' })
    expect(fixture.current().selectedDrugs).toEqual([])
  })

  it('rejects empty or duplicate facts and refuses an empty selection without supplied drugs', async () => {
    const fixture = setup()
    const tool = fixture.tool('cleardose_show_drug_fact')
    for (const facts of [[], ['warnings', 'warnings'], ['not-a-fact'], [...drugFactTypes, 'warnings']]) {
      await expect(tool.execute({ workspaceRevision: 'workspace-1', facts })).rejects.toThrow()
    }
    fixture.update({ ...initial(), selectedDrugs: [] })
    await expect(fixture.tool('cleardose_show_drug_fact').execute({ workspaceRevision: 'workspace-1', facts: ['warnings'] })).rejects.toThrow('Select at least one drug')
    expect(fixture.dependencies.showFacts).not.toHaveBeenCalled()
  })

  it('rejects cancellation before dispatch and logs provider failures without revealing a changed page', async () => {
    const fixture = setup()
    const aborted = new AbortController()
    aborted.abort()
    const tool = fixture.tool('cleardose_show_drug_fact')
    await expect(tool.execute(tool.exampleInput, { signal: aborted.signal })).rejects.toThrow()
    expect(fixture.dependencies.showFacts).not.toHaveBeenCalled()
    vi.mocked(fixture.dependencies.showFacts).mockRejectedValueOnce(new Error('Public provider is unavailable. Existing workspace is unchanged.'))
    await expect(tool.execute(tool.exampleInput)).rejects.toThrow('Existing workspace is unchanged')
    expect(fixture.dependencies.reveal).not.toHaveBeenCalled()
    expect(fixture.current()).toEqual(initial())
    expect(useAgentActivityStore().entries.every((entry) => entry.status === 'error')).toBe(true)
  })

  it('passes cancellation and expected revision to the async pre-commit guard', async () => {
    const fixture = setup()
    let release: (() => void) | undefined
    const pending = new Promise<void>((resolve) => { release = resolve })
    vi.mocked(fixture.dependencies.showFacts).mockImplementationOnce(async (input) => { await pending; fixture.guard(input) })
    const controller = new AbortController()
    const tool = fixture.tool('cleardose_show_drug_fact')
    const run = tool.execute(tool.exampleInput, { signal: controller.signal })
    fixture.update({ ...fixture.current(), revision: 'human-2' })
    release!()
    await expect(run).rejects.toThrow('changed before commit')
    expect(fixture.dependencies.reveal).not.toHaveBeenCalled()
  })

  it('does not report a committed mutation as cancelled when its schema refresh aborts registration', async () => {
    const fixture = setup()
    const controller = new AbortController()
    const original = fixture.dependencies.showFacts
    fixture.dependencies.showFacts = vi.fn(async (input) => { await original(input); controller.abort() })
    const tool = fixture.tool('cleardose_show_drug_fact')
    const result = await tool.execute(tool.exampleInput, { signal: controller.signal })
    expect(result).toMatchObject({ status: 'updated', cardCount: 2, route: '/drugs/explore' })
    expect(fixture.dependencies.reveal).toHaveBeenCalledOnce()
    expect(useAgentActivityStore().entries[0]!.status).toBe('success')
  })

  it('pages every selected drug and all fourteen cards without skipping bounded rows', async () => {
    const fixture = setup({ ...initial(), selectedDrugs: catalog,
      cards: drugFactTypes.map((factType, index) => ({ id: `fact-${index}`, factType, drugIds: catalog.map((drug) => drug.id) })),
    })
    const tool = fixture.tool('cleardose_get_explorer_state')
    let offset = 0
    let stateRevision: string | undefined
    const rows: StateOutput['rows'] = []
    do {
      const result = await tool.execute({ section: 'workspace', offset, limit: 10, workspaceRevision: 'workspace-1', ...(stateRevision ? { stateRevision } : {}) })
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(explorerOutputBudget)
      const page = stateResult(result)
      rows.push(...page.rows)
      stateRevision = page.stateRevision
      expect(page.returned).toBe(page.rows.length)
      if (page.nextOffset === null) break
      expect(page.nextOffset).toBeGreaterThan(offset)
      offset = page.nextOffset
    } while (offset < 30)
    expect(rows.filter((row) => row.kind === 'selected-drug').map((row) => row.id)).toEqual(catalog.map((drug) => drug.id))
    expect(rows.filter((row) => row.kind === 'fact-card').map((row) => row.factType)).toEqual(drugFactTypes)
    expect(fixture.dependencies.reveal).not.toHaveBeenCalled()
  })

  it('pages all 112 catalog IDs and uses the current state from held read definitions', async () => {
    const identities = Array.from({ length: 112 }, (_, i) => ({ id: `med-${String(i).padStart(3, '0')}`, name: `Drug ${i}` }))
    const fixture = setup()
    const tool = fixture.tool('cleardose_get_explorer_state')
    fixture.update({ ...initial(), revision: 'workspace-current', catalog: identities })
    const ids: string[] = []
    let offset = 0
    let stateRevision: string | undefined
    for (;;) {
      const result = await tool.execute({ section: 'catalog', offset, limit: 10, workspaceRevision: 'workspace-current', ...(stateRevision ? { stateRevision } : {}) })
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(explorerOutputBudget)
      const page = stateResult(result)
      expect(page.workspaceRevision).toBe('workspace-current')
      ids.push(...page.rows.map((row) => row.id))
      stateRevision = page.stateRevision
      if (page.nextOffset === null) break
      offset = page.nextOffset
    }
    expect(ids).toEqual(identities.map((drug) => drug.id))
    expect(fixture.dependencies.reveal).not.toHaveBeenCalled()
  })

  it('rejects unpinned later pages, stale pinned pages, and invalid pagination without navigation', async () => {
    const fixture = setup()
    const tool = fixture.tool('cleardose_get_explorer_state')
    await expect(tool.execute({ offset: 1 })).rejects.toThrow('workspaceRevision')
    await expect(tool.execute({ workspaceRevision: 'old' })).rejects.toThrow('Drug Explorer changed')
    for (const input of [{ section: 'secrets' }, { offset: -1 }, { offset: 113 }, { limit: 0 }, { limit: 11 }, { limit: 1.5 }, { route: '/hidden' }]) {
      await expect(tool.execute(input)).rejects.toThrow()
    }
    expect(fixture.dependencies.reveal).not.toHaveBeenCalled()
  })

  it('rejects a pinned catalog page after catalog growth without a workspace edit', async () => {
    const fixture = setup()
    const tool = fixture.tool('cleardose_get_explorer_state')
    const first = stateResult(await tool.execute({ section: 'catalog', limit: 1 }))
    fixture.update({ ...fixture.current(), catalog: [...catalog, { id: 'med-alpha', name: 'Alpha' }] })
    expect(fixture.current().revision).toBe(first.workspaceRevision)
    await expect(tool.execute({ section: 'catalog', offset: first.nextOffset,
      workspaceRevision: first.workspaceRevision, stateRevision: first.stateRevision,
    })).rejects.toThrow('Explorer state or catalog changed')
    const restarted = stateResult(await tool.execute({ section: 'catalog' }))
    expect(restarted.stateRevision).not.toBe(first.stateRevision)
    expect(restarted.rows.map((row) => row.id)).toContain('med-alpha')
  })

  it('keeps declarations stable while held handlers validate current revisions and current card membership', async () => {
    const fixture = setup()
    const declarations = createExplorerTools(fixture.dependencies)
    const signatureOf = () => JSON.stringify(createExplorerTools(fixture.dependencies).map(nativeToolDefinition))
    const initialDeclarations = signatureOf()
    const before = fixture.tool('cleardose_show_drug_fact')
    const signature = explorerWorkspaceSignature(fixture.current())
    fixture.update({ ...fixture.current(), route: '/drugs/explore?facts=warnings' })
    expect(explorerWorkspaceSignature(fixture.current())).toBe(signature)
    await before.execute(before.exampleInput)
    expect(signatureOf()).toBe(initialDeclarations)
    await expect(before.execute(before.exampleInput)).rejects.toThrow('Drug Explorer changed')
    const cardId = fixture.current().cards[0]!.id
    const edit = declarations.find(tool => tool.name === 'cleardose_update_fact_card')!
    await edit.execute({ workspaceRevision: fixture.current().revision, cardId, factType: 'warnings' })
    expect(fixture.current().cards.find(card => card.id === cardId)?.factType).toBe('warnings')
    await declarations.find(tool => tool.name === 'cleardose_remove_fact_card')!.execute({ workspaceRevision: fixture.current().revision, cardId })
    await expect(edit.execute({ workspaceRevision: fixture.current().revision, cardId, factType: 'uses' })).rejects.toThrow('cardId')
    expect(signatureOf()).toBe(initialDeclarations)
  })
})
