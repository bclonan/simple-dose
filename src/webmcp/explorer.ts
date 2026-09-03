import { drugFactTypes, type DrugFactType } from '../domain/drug-facts'
import { factAvailabilityValues, type FactAvailability } from '../domain/drug-fact-status'
import { executeWithActivity } from '../services/cleardose.actions'
import type { ClearDoseToolDefinition, JsonSchema, JsonValue, WebMcpExecutionOptions } from './types'

export type AppToolDefinition = ClearDoseToolDefinition
export type ExplorerSelectionMode = 'replace' | 'add' | 'remove'
export type ExplorerFactMode = 'replace' | 'add'

export interface ExplorerDrugIdentity {
  id: string
  name: string
}

export interface ExplorerFactCard {
  id: string
  factType: DrugFactType
  drugIds: string[]
}

export interface ExplorerFactResult {
  cardId: string
  drugId: string
  factType: DrugFactType
  availability: FactAvailability
  source: string
  warnings: Array<{ source: string; code: string }>
  warningCount?: number
}

export interface ExplorerWorkspaceSnapshot {
  revision: string
  selectedDrugs: ExplorerDrugIdentity[]
  cards: ExplorerFactCard[]
  catalog: ExplorerDrugIdentity[]
  route?: string
  factResults?: ExplorerFactResult[]
}

export interface ExplorerMutationContext {
  expectedRevision: string
  signal?: AbortSignal
}

export interface ExplorerToolDependencies {
  snapshot(): ExplorerWorkspaceSnapshot
  // Async adapters must check expectedRevision and signal again before committing.
  selectDrugs(input: ExplorerMutationContext & { drugs: string[]; mode: ExplorerSelectionMode }): void | Promise<void>
  // Optional drugs replace selection in the same guarded commit as the requested facts.
  showFacts(input: ExplorerMutationContext & { facts: DrugFactType[]; mode: ExplorerFactMode; drugs?: string[] }): void | Promise<void>
  updateFactCard(input: ExplorerMutationContext & { cardId: string; factType: DrugFactType }): void | Promise<void>
  removeFactCard(input: ExplorerMutationContext & { cardId: string }): void | Promise<void>
  reveal(input: { signal?: AbortSignal }): void | Promise<void>
}

export const explorerToolNames = [
  'cleardose_select_drugs',
  'cleardose_show_drug_fact',
  'cleardose_update_fact_card',
  'cleardose_remove_fact_card',
  'cleardose_get_explorer_state',
] as const
export const explorerOutputBudget = 1_500

const staleMessage = 'Drug Explorer changed. Read cleardose_get_explorer_state, then retry with its current workspaceRevision.'
const medicalNotice = 'Public reference facts are not personal medical advice. Label interactions are not a pairwise interaction check. NADAC is not a pharmacy cash price.'
const stateSections = ['workspace', 'selected', 'cards', 'catalog'] as const
type StateSection = typeof stateSections[number]
const readRevisions = new WeakMap<ExplorerToolDependencies, { signature: string; revision: string }>()
let readSequence = 0
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/
const searchPattern = "^(?![mM][eE][dD]-)[\\p{L}\\p{N}][\\p{L}\\p{N} .,/+%'()-]*$"
const validSearch = new RegExp(searchPattern, 'u')

const safeLabel = (value: string): string => value
  .replace(/[^\p{L}\p{N} .,/+%\-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 60)

const normalizeSnapshot = (input: ExplorerWorkspaceSnapshot): ExplorerWorkspaceSnapshot => {
  if (!input.revision || input.revision.length > 96) throw new Error('Drug Explorer requires a workspace revision of at most 96 characters.')
  const identities = (items: ExplorerDrugIdentity[]): ExplorerDrugIdentity[] => [...new Map(items
    .filter((item) => idPattern.test(item.id))
    .map((item) => [item.id, { id: item.id, name: safeLabel(item.name) || item.id }] as const)).values()]
  const catalog = identities(input.catalog).sort((a, b) => a.id.localeCompare(b.id))
  const selectedDrugs = identities(input.selectedDrugs)
  if (catalog.length > 112 || selectedDrugs.length > 4 || input.cards.length > 14) {
    throw new Error('Drug Explorer exceeds its catalog, selection, or card limit. Update the workspace before using tools.')
  }
  const cards = input.cards.map((card) => {
    if (!idPattern.test(card.id) || !drugFactTypes.includes(card.factType) || card.drugIds.length > 4 ||
      card.drugIds.some((id) => !idPattern.test(id)) || new Set(card.drugIds).size !== card.drugIds.length) {
      throw new Error('Drug Explorer contains an invalid fact card. Update the workspace before using tools.')
    }
    return { id: card.id, factType: card.factType, drugIds: [...card.drugIds] }
  })
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new Error('Drug Explorer contains duplicate card IDs.')
  if ((input.factResults?.length ?? 0) > 56) throw new Error('Drug Explorer exceeds its fact-result limit.')
  const factResults = input.factResults?.map(result => {
    if (!cards.some(card => card.id === result.cardId && card.factType === result.factType && card.drugIds.includes(result.drugId)) ||
      !factAvailabilityValues.includes(result.availability)) throw new Error('Drug Explorer contains an invalid fact result.')
    return {
      cardId: result.cardId, drugId: result.drugId, factType: result.factType,
      availability: result.availability, source: result.source.slice(0, 40),
      warningCount: result.warningCount ?? result.warnings.length,
      warnings: result.warnings.slice(0, 2).map(warning => ({ source: warning.source.slice(0, 40), code: warning.code.slice(0, 32) })),
    }
  })
  return {
    revision: input.revision, selectedDrugs, cards, catalog,
    ...(input.route ? { route: input.route.slice(0, 160) } : {}),
    ...(factResults ? { factResults } : {}),
  }
}

export const explorerWorkspaceSignature = (input: ExplorerWorkspaceSnapshot): string => {
  const { route: _route, ...workspace } = normalizeSnapshot(input)
  return JSON.stringify(workspace)
}

const currentReadRevision = (dependencies: ExplorerToolDependencies, snapshot: ExplorerWorkspaceSnapshot): string => {
  const signature = explorerWorkspaceSignature(snapshot)
  const existing = readRevisions.get(dependencies)
  if (existing?.signature === signature) return existing.revision
  const revision = `explorer-state-${++readSequence}`
  readRevisions.set(dependencies, { signature, revision })
  return revision
}

const objectSchema = (properties: Record<string, JsonSchema>, required: string[]): JsonSchema => ({
  type: 'object', properties, required, additionalProperties: false,
})

const factSchema = (): JsonSchema => ({
  type: 'string', enum: [...drugFactTypes],
  description: 'Public fact type. Label warnings and interactions are not personalized checks.',
})

const drugSchema = (): JsonSchema => ({
  type: 'string', minLength: 1, maxLength: 128,
  description: 'ID or generic/brand name. Read IDs with cleardose_get_explorer_state. Out-of-mode selected IDs are removal-only.',
})

const cardSchema = (): JsonSchema => ({
  type: 'string', minLength: 1, maxLength: 128, pattern: idPattern.source,
  description: 'Current card ID from cleardose_get_explorer_state.',
})

const asInput = (value: unknown, allowed: string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool input must be an object.')
  const input = value as Record<string, unknown>
  const extra = Object.keys(input).find((key) => !allowed.includes(key))
  if (extra) throw new Error(`Unexpected input field: ${extra}.`)
  return input
}

const choice = <T extends string>(value: unknown, allowed: readonly T[], label: string): T => {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${label} must be one of the currently available values.`)
  return value as T
}

const integer = (value: unknown, fallback: number, minimum: number, maximum: number, label: string): number => {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`)
  }
  return value
}

const drugsInput = (value: unknown, snapshot: ExplorerWorkspaceSnapshot, allowEmpty = false): string[] => {
  if (!Array.isArray(value) || value.length < (allowEmpty ? 0 : 1) || value.length > 4) {
    throw new Error(`drugs must contain ${allowEmpty ? 'zero' : 'one'} to four distinct catalog IDs or generic/brand search terms.`)
  }
  const ids = new Set(snapshot.catalog.map((drug) => drug.id))
  const result = value.map((drug) => {
    if (typeof drug !== 'string') throw new Error('Each drug must be a catalog ID or generic/brand search term.')
    const term = drug.trim()
    if (ids.has(term)) return term
    if (!term || term.length > 120 || !validSearch.test(term)) {
      throw new Error('Use a current catalog ID or a plain generic/brand name of at most 120 characters. URLs, markup, and unknown medication IDs are not accepted.')
    }
    return term
  })
  if (new Set(result.map((term) => term.toLocaleLowerCase())).size !== result.length) throw new Error('drugs must be distinct.')
  return result
}

const factsInput = (value: unknown): DrugFactType[] => {
  if (!Array.isArray(value) || !value.length || value.length > drugFactTypes.length) throw new Error('facts must contain one to fourteen supported fact types.')
  const facts = value.map((fact) => choice(fact, drugFactTypes, 'facts'))
  if (new Set(facts).size !== facts.length) throw new Error('facts must be distinct.')
  return facts
}

const factDataSummary = (snapshot: ExplorerWorkspaceSnapshot): JsonValue => {
  const results = snapshot.factResults ?? []
  const count = (statuses: FactAvailability[]) => results.filter(result => statuses.includes(result.availability)).length
  const available = count(['available'])
  const partial = count(['partial'])
  const loading = count(['loading'])
  return {
    availability: !results.length ? 'not-requested' : available === results.length ? 'available'
      : available || partial ? 'partial' : loading ? 'loading' : results.every(result => result.availability === 'demo') ? 'demo' : 'unavailable',
    requested: results.length, available, partial, providerFailed: count(['provider-failed']),
    unavailable: count(['field-absent', 'source-unavailable', 'not-loaded', 'demo']), loading,
    warningCount: results.reduce((sum, result) => sum + (result.warningCount ?? result.warnings.length), 0),
  }
}

const factDataRow = (result: ExplorerFactResult): JsonValue => ({
  kind: 'fact-data', id: result.cardId, drugId: result.drugId, factType: result.factType,
  availability: result.availability, source: result.source,
  warningCount: result.warningCount ?? result.warnings.length, warnings: result.warnings,
})

const mutationOutput = (input: ExplorerWorkspaceSnapshot): JsonValue => {
  const snapshot = normalizeSnapshot(input)
  const results = snapshot.factResults ?? []
  const output = {
    status: 'updated', workspaceRevision: snapshot.revision,
    selectedDrugIds: snapshot.selectedDrugs.map((drug) => drug.id),
    cardCount: snapshot.cards.length,
    workspacePath: '/drugs/explore',
    ...(snapshot.route ? { route: snapshot.route } : {}),
    data: factDataSummary(snapshot), factResults: [] as JsonValue[], factResultsTotal: results.length, factResultsTruncated: results.length > 0,
    nextAction: 'Use this workspaceRevision for edits. Read cleardose_get_explorer_state section cards for all fact-data rows.',
    notice: medicalNotice,
  }
  // The edit already committed. Never fail it merely because detailed availability
  // needs another page; the state reader provides every bounded fact-result row.
  if (JSON.stringify(output).length > explorerOutputBudget) delete output.route
  for (const result of results.slice(0, 4)) {
    output.factResults.push(factDataRow(result))
    output.factResultsTruncated = output.factResults.length < results.length
    if (JSON.stringify(output).length > explorerOutputBudget) {
      output.factResults.pop()
      output.factResultsTruncated = true
      break
    }
  }
  return output
}

const stateOutput = (snapshot: ExplorerWorkspaceSnapshot, stateRevision: string, section: StateSection, offset: number, limit: number): JsonValue => {
  const rows: JsonValue[] = []
  if (section === 'workspace' || section === 'selected') {
    rows.push(...snapshot.selectedDrugs.map((drug) => ({ kind: 'selected-drug', id: drug.id, label: drug.name })))
  }
  if (section === 'workspace' || section === 'cards') {
    rows.push(...snapshot.cards.map((card) => ({ kind: 'fact-card', id: card.id, factType: card.factType, drugIds: card.drugIds })))
    rows.push(...(snapshot.factResults ?? []).map(factDataRow))
  }
  if (section === 'catalog') rows.push(...snapshot.catalog.map((drug) => ({ kind: 'catalog-drug', id: drug.id, label: drug.name })))
  const output = {
    workspaceRevision: snapshot.revision, stateRevision, section, offset, returned: 0, total: rows.length,
    nextOffset: null as number | null, rows: [] as JsonValue[],
    format: 'Drug Explorer state rows. Follow nextOffset with both revision values to read the rest.',
    selectedDrugCount: snapshot.selectedDrugs.length, cardCount: snapshot.cards.length,
    data: factDataSummary(snapshot),
    workspacePath: '/drugs/explore', ...(snapshot.route ? { route: snapshot.route } : {}), notice: medicalNotice,
  }
  for (const row of rows.slice(offset, offset + limit)) {
    output.rows.push(row)
    output.returned = output.rows.length
    output.nextOffset = offset + output.returned < rows.length ? offset + output.returned : null
    if (output.rows.length === 1 && JSON.stringify(output).length > explorerOutputBudget) {
      delete output.route
      output.format = 'Follow nextOffset with both revision tokens for every row.'
      output.notice = 'Public reference data, not personal medical advice. Missing facts are not safety findings.'
    }
    if (JSON.stringify(output).length > explorerOutputBudget) {
      output.rows.pop()
      output.returned = output.rows.length
      output.nextOffset = offset + output.returned < rows.length ? offset + output.returned : null
      break
    }
  }
  if (!output.returned && offset < rows.length) throw new Error('This workspace row exceeds the result budget. Shorten the selected catalog labels or IDs.')
  return output
}

export const createExplorerTools = (
  dependencies: ExplorerToolDependencies,
  source: 'agent' | 'demo' = 'agent',
  workspaceSnapshot: ExplorerWorkspaceSnapshot = dependencies.snapshot(),
): AppToolDefinition[] => {
  const snapshot = normalizeSnapshot(workspaceSnapshot)
  const workspaceRevision: JsonSchema = {
    type: 'string', minLength: 1, maxLength: 96,
    description: 'Current token from cleardose_get_explorer_state or the last edit.',
  }
  const changing = { readOnlyHint: false, untrustedContentHint: true, destructiveHint: true, idempotentHint: false, openWorldHint: true }
  const validateRevision = (input: Record<string, unknown>): ExplorerMutationContext => {
    // Native handles stay stable. Every invocation reads the live workspace;
    // the shared action checks this same expected revision again before commit.
    const current = normalizeSnapshot(dependencies.snapshot())
    if (input.workspaceRevision !== current.revision) throw new Error(staleMessage)
    return { expectedRevision: current.revision }
  }
  const run = (name: string, raw: unknown, options: WebMcpExecutionOptions | undefined, action: () => Promise<JsonValue>): Promise<JsonValue> =>
    executeWithActivity({ toolName: name, source, args: raw, run: async () => {
      options?.signal?.throwIfAborted()
      const output = await action()
      if (JSON.stringify(output).length > explorerOutputBudget) throw new Error('Explorer output exceeded its response limit.')
      return output
    } })
  const mutate = async (action: () => void | Promise<void>, options?: WebMcpExecutionOptions): Promise<JsonValue> => {
    await action()
    const committedRevision = dependencies.snapshot().revision
    // The adapter checks cancellation before its guarded commit. Once committed,
    // keep the successful result even if later navigation removes the tool.
    await dependencies.reveal({ signal: options?.signal })
    if (dependencies.snapshot().revision !== committedRevision) {
      throw new Error('This edit was applied, then a newer workspace or data-mode change superseded it while navigation finished. Review the current workspace before another edit.')
    }
    return mutationOutput(dependencies.snapshot())
  }
  const drugs: JsonSchema = {
    type: 'array', minItems: 0, maxItems: 4, items: drugSchema(),
    description: 'Distinct IDs or names. Remove uses selected IDs. Replace accepts an empty list to clear selection.',
  }
  const firstDrug = snapshot.catalog.find(drug => snapshot.selectedDrugs.some(selected => selected.id === drug.id))?.id ?? snapshot.catalog[0]?.id ?? 'metformin'
  const firstCard = snapshot.cards[0]?.id ?? 'card-not-yet-created'
  return [{
    name: explorerToolNames[0], title: 'Select explorer drugs', category: 'discovery',
    description: 'Replace, add, or remove up to four drugs in the visible Explorer. Generic or brand names resolve through the catalog. Fact cards follow selection. This changes the workspace, not prescriptions or cart items.',
    inputSchema: objectSchema({ workspaceRevision, drugs, mode: { type: 'string', enum: ['replace', 'add', 'remove'], default: 'replace', description: 'Replace with drugs: [] clears selection. Remove requires selected drug IDs.' } }, ['workspaceRevision', 'drugs']),
    annotations: changing,
    exampleInput: { workspaceRevision: snapshot.revision, drugs: [firstDrug], mode: 'replace' },
    execute: (raw, options) => run(explorerToolNames[0], raw, options, async () => {
      const input = asInput(raw, ['workspaceRevision', 'drugs', 'mode'])
      const guard = validateRevision(input)
      const mode = choice(input.mode ?? 'replace', ['replace', 'add', 'remove'], 'mode')
      const current = normalizeSnapshot(dependencies.snapshot())
      if (mode === 'remove' && Array.isArray(input.drugs) && input.drugs.some((id) => !current.selectedDrugs.some((drug) => drug.id === id))) {
        throw new Error('Remove accepts only current selected drug IDs. Read cleardose_get_explorer_state for those IDs.')
      }
      const terms = drugsInput(input.drugs, mode === 'remove' ? { ...current, catalog: current.selectedDrugs } : current, mode === 'replace')
      return mutate(() => dependencies.selectDrugs({ ...guard, signal: options?.signal, drugs: terms, mode }), options)
    }),
  }, {
    name: explorerToolNames[1], title: 'Show requested drug facts', category: 'discovery',
    description: 'Show requested Explorer fact cards. Replace shows only these facts; add keeps existing cards. Optional drugs replace selection in the same edit. Missing public facts stay unavailable. This performs no clinical interaction check.',
    inputSchema: objectSchema({ workspaceRevision,
      facts: { type: 'array', minItems: 1, maxItems: 14, items: factSchema(), description: 'Exactly the fact cards requested. Use replace to hide all other facts.' },
      mode: { type: 'string', enum: ['replace', 'add'], default: 'add', description: 'Replace shows only the requested facts. Add keeps existing cards and reuses duplicates.' },
      drugs: { ...drugs, minItems: 1, description: 'Optional replacement selection. Omit to keep current drugs.' },
    }, ['workspaceRevision', 'facts']),
    annotations: changing,
    exampleInput: { workspaceRevision: snapshot.revision, facts: ['side-effects', 'pricing'], mode: 'replace', drugs: [firstDrug] },
    execute: (raw, options) => run(explorerToolNames[1], raw, options, async () => {
      const input = asInput(raw, ['workspaceRevision', 'facts', 'mode', 'drugs'])
      const guard = validateRevision(input)
      const facts = factsInput(input.facts)
      const mode = choice(input.mode ?? 'add', ['replace', 'add'], 'mode')
      const current = normalizeSnapshot(dependencies.snapshot())
      const terms = input.drugs === undefined ? undefined : drugsInput(input.drugs, current)
      if (!terms && !current.selectedDrugs.length) throw new Error('Select at least one drug first, or include drugs with the requested facts.')
      return mutate(() => dependencies.showFacts({ ...guard, signal: options?.signal, facts, mode, ...(terms ? { drugs: terms } : {}) }), options)
    }),
  }, {
    name: explorerToolNames[2], title: 'Change an explorer fact card', category: 'discovery',
    description: 'Change one current Explorer card to another supported fact, keeping the shared drug selection. This edits the visible workspace, not medication records.',
    inputSchema: objectSchema({ workspaceRevision, cardId: cardSchema(), factType: factSchema() }, ['workspaceRevision', 'cardId', 'factType']),
    annotations: { ...changing, idempotentHint: true },
    exampleInput: { workspaceRevision: snapshot.revision, cardId: firstCard, factType: 'ingredients' },
    execute: (raw, options) => run(explorerToolNames[2], raw, options, async () => {
      const input = asInput(raw, ['workspaceRevision', 'cardId', 'factType'])
      const guard = validateRevision(input)
      const cardId = choice(input.cardId, normalizeSnapshot(dependencies.snapshot()).cards.map((card) => card.id), 'cardId')
      const factType = choice(input.factType, drugFactTypes, 'factType')
      return mutate(() => dependencies.updateFactCard({ ...guard, signal: options?.signal, cardId, factType }), options)
    }),
  }, {
    name: explorerToolNames[3], title: 'Remove an explorer fact card', category: 'discovery',
    description: 'Remove one current Explorer fact card. Selected drugs and medication records remain unchanged. Read current card IDs with cleardose_get_explorer_state.',
    inputSchema: objectSchema({ workspaceRevision, cardId: cardSchema() }, ['workspaceRevision', 'cardId']),
    annotations: { ...changing, idempotentHint: true, openWorldHint: false },
    exampleInput: { workspaceRevision: snapshot.revision, cardId: firstCard },
    execute: (raw, options) => run(explorerToolNames[3], raw, options, async () => {
      const input = asInput(raw, ['workspaceRevision', 'cardId'])
      const guard = validateRevision(input)
      const cardId = choice(input.cardId, normalizeSnapshot(dependencies.snapshot()).cards.map((card) => card.id), 'cardId')
      return mutate(() => dependencies.removeFactCard({ ...guard, signal: options?.signal, cardId }), options)
    }),
  }, {
    name: explorerToolNames[4], title: 'Read the drug explorer workspace', category: 'discovery',
    description: 'Read selected drug IDs, fact cards, or loaded catalog IDs without changing the page. Follow nextOffset with both returned revision tokens. Use compare_medications for complete public facts.',
    inputSchema: objectSchema({
      section: { type: 'string', enum: [...stateSections], default: 'workspace', description: 'Workspace combines selection and cards. Catalog lists current drug IDs and names.' },
      offset: { type: 'integer', minimum: 0, maximum: 112, default: 0, description: 'Zero-based offset. Follow nextOffset for all rows.' },
      limit: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'Maximum rows per page. The output budget may return fewer.' },
      workspaceRevision: { type: 'string', minLength: 1, maxLength: 96, description: 'Required after offset zero. Use the first page token to pin the workspace.' },
      stateRevision: { type: 'string', minLength: 1, maxLength: 64, description: 'Required after offset zero. Detects workspace and catalog changes.' },
    }, []),
    annotations: { readOnlyHint: true, untrustedContentHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    exampleInput: { section: 'workspace' },
    execute: (raw, options) => run(explorerToolNames[4], raw, options, async () => {
      const input = asInput(raw, ['section', 'offset', 'limit', 'workspaceRevision', 'stateRevision'])
      const current = normalizeSnapshot(dependencies.snapshot())
      const stateRevision = currentReadRevision(dependencies, current)
      const section = choice(input.section ?? 'workspace', stateSections, 'section')
      const offset = integer(input.offset, 0, 0, 112, 'offset')
      const limit = integer(input.limit, 5, 1, 10, 'limit')
      if (input.workspaceRevision !== undefined && input.workspaceRevision !== current.revision) throw new Error(staleMessage)
      if (input.stateRevision !== undefined && input.stateRevision !== stateRevision) throw new Error('Explorer state or catalog changed. Restart at offset zero before reading more pages.')
      if (offset > 0 && (input.workspaceRevision === undefined || input.stateRevision === undefined)) {
        throw new Error('Follow nextOffset with the returned workspaceRevision and stateRevision to read later pages safely.')
      }
      return stateOutput(current, stateRevision, section, offset, limit)
    }),
  }]
}
