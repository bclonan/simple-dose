import { executeWithActivity } from '../services/cleardose.actions'
import { clearDoseToolCatalog } from './definitions'
import { assertNativeDeclarationBudget, nativeToolDefinition } from './schema-budget'
import { isTransientProviderFailure, warningsForFactLoad } from '../domain/drug-fact-status'
import type { ProviderWarning } from '../../cleardose-data-plugin/src/types'
import type {
  ClearDoseToolDefinition,
  JsonSchema,
  JsonValue,
  WebMcpExecutionOptions,
  WebMcpModelContext,
} from './types'

export type MedicationDataMode = 'live' | 'hybrid' | 'demo'
export type MedicationScope = 'page' | 'catalog'
export type MedicationSimilarityBasis = 'ingredient' | 'class' | 'category' | 'form'
export type MedicationComparisonSection = 'identity' | 'product' | 'clinical' | 'prices' | 'sources'

export interface DynamicMedicationSnapshot {
  revision: string
  route: string
  dataMode: MedicationDataMode
  catalog: Array<{ id: string; name: string }>
  pageMedicationIds: string[]
}

export interface FindRelatedMedicationRequest {
  referenceMedicationId: string
  candidateMedicationIds: string[]
  basis: MedicationSimilarityBasis
  signal?: AbortSignal
}

export interface CompareMedicationRequest {
  medicationIds: string[]
  section: MedicationComparisonSection
  signal?: AbortSignal
}

export interface RelatedMedicationResult {
  matches: Array<{ medicationId: string; name: string; reasons: string[] }>
  notice: string
}

export interface MedicationComparisonResult {
  drugs: Array<{
    medicationId: string
    name: string
    status: string
    drug?: unknown
    message?: string
  }>
  notice: string
}

export interface DynamicMedicationDependencies {
  getSnapshot(): DynamicMedicationSnapshot
  findRelated(input: FindRelatedMedicationRequest): RelatedMedicationResult | Promise<RelatedMedicationResult>
  compare(input: CompareMedicationRequest): MedicationComparisonResult | Promise<MedicationComparisonResult>
}

export const dynamicMedicationToolNames = ['find_related_medications', 'compare_medications'] as const
export const dynamicMedicationOutputBudget = 1_500

const similarityBases: MedicationSimilarityBasis[] = ['ingredient', 'class', 'category', 'form']
const comparisonSections: MedicationComparisonSection[] = ['identity', 'product', 'clinical', 'prices', 'sources']
const comparisonNotice = 'Catalog similarity is not therapeutic interchangeability, dosing equivalence, or personal medical advice. A clinician must assess medication changes.'
const staleMessage = 'Medication context changed. Refresh the available WebMCP tools, then retry with their current contextRevision and medication IDs.'

const safeName = (value: string): string => value
  .replace(/[^\p{L}\p{N} .,/+%\-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 60)

const normalizeSnapshot = (input: DynamicMedicationSnapshot): DynamicMedicationSnapshot => {
  if (!input.revision || input.revision.length > 96) throw new Error('Medication context requires a revision of at most 96 characters.')
  const catalog = [...new Map(input.catalog
    .filter((item) => /^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/.test(item.id))
    .map((item) => [item.id, { id: item.id, name: safeName(item.name) || item.id }] as const))
    .values()]
    .sort((left, right) => left.id.localeCompare(right.id))
  if (catalog.length > 112) throw new Error('Medication context exceeds the 112-record catalog limit.')
  const knownIds = new Set(catalog.map((item) => item.id))
  return {
    revision: input.revision,
    route: input.route.slice(0, 160),
    dataMode: input.dataMode,
    catalog,
    pageMedicationIds: [...new Set(input.pageMedicationIds.filter((id) => knownIds.has(id)))].sort(),
  }
}

export const dynamicMedicationSignature = (snapshot: DynamicMedicationSnapshot): string => {
  const { route: _route, ...context } = normalizeSnapshot(snapshot)
  return JSON.stringify(context)
}

const objectSchema = (properties: Record<string, JsonSchema>, required: string[]): JsonSchema => ({
  type: 'object', properties, required, additionalProperties: false,
})

const medicationSchema = (snapshot: DynamicMedicationSnapshot): JsonSchema => {
  const ids = snapshot.catalog.map(item => item.id)
  const inline = ids.length <= 12 && JSON.stringify(ids).length <= 160
  return {
    type: 'string', minLength: 1, maxLength: 128,
    description: 'ID from cleardose_get_explorer_state section catalog.',
    ...(inline ? { enum: ids } : { pattern: '^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$', examples: ids.slice(0, 3) }),
  }
}

const commonProperties = (snapshot: DynamicMedicationSnapshot): Record<string, JsonSchema> => ({
  contextRevision: {
    type: 'string', const: snapshot.revision,
    description: 'Refresh tools after catalog or page changes.',
  },
  scope: {
    type: 'string', enum: snapshot.pageMedicationIds.length ? ['page', 'catalog'] : ['catalog'],
    default: 'catalog',
    description: 'Page: visible IDs. Catalog: all loaded IDs.',
  },
  offset: {
    type: 'integer', minimum: 0, maximum: 1_000_000, default: 0,
    description: 'Start at 0, then follow nextOffset for all rows.',
  },
  limit: {
    type: 'integer', minimum: 1, maximum: 10, default: 5,
    description: 'Row limit; budget may return fewer.',
  },
})

const asInput = (value: unknown, allowed: string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool input must be an object.')
  const input = value as Record<string, unknown>
  const extra = Object.keys(input).find((key) => !allowed.includes(key))
  if (extra) throw new Error(`Unexpected input field: ${extra}.`)
  return input
}

const integer = (input: Record<string, unknown>, key: string, fallback: number, maximum: number): number => {
  const value = input[key] ?? fallback
  const minimum = key === 'offset' ? 0 : 1
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer from ${minimum} to ${maximum}.`)
  }
  return value
}

const choice = <T extends string>(value: unknown, allowed: readonly T[], key: string): T => {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${key} must be one of the currently available values. Read the current catalog or refresh tools.`)
  return value as T
}

interface FieldRow { path: string; value: JsonValue; part?: number; parts?: number }

// Field paths and numbered string parts preserve complete normalized sections without raw FDA payloads.
const fieldRows = (value: unknown): FieldRow[] => {
  const json = JSON.stringify(value)
  if (json === undefined || json.length > 2_000_000) throw new Error('Normalized data is too large. Request a narrower medication section.')
  const normalized = JSON.parse(json) as JsonValue
  const rows: FieldRow[] = []
  const visit = (item: JsonValue, path: string): void => {
    if (path.length > 200) throw new Error('Normalized field path is too long. Request a narrower medication section.')
    if (Array.isArray(item) && item.length) {
      item.forEach((child, index) => visit(child, `${path}/${index}`))
      return
    }
    if (item !== null && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length) {
      Object.entries(item).forEach(([key, child]) => visit(child, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`))
      return
    }
    if (typeof item !== 'string' || JSON.stringify({ path, value: item }).length <= 620) {
      rows.push({ path, value: item })
      return
    }
    const chunks: string[] = []
    let remaining = item
    while (remaining) {
      let length = Math.min(remaining.length, 500)
      while (JSON.stringify({ path, value: remaining.slice(0, length), part: 99999, parts: 99999 }).length > 620) {
        length = Math.max(1, Math.floor(length * 0.8))
      }
      // Do not split a UTF-16 surrogate pair.
      if (length < remaining.length && /[\uD800-\uDBFF]/.test(remaining[length - 1] ?? '')) length -= 1
      chunks.push(remaining.slice(0, length))
      remaining = remaining.slice(length)
    }
    chunks.forEach((chunk, index) => rows.push({ path, value: chunk, part: index + 1, parts: chunks.length }))
  }
  visit(normalized, '')
  return rows
}

const pageOutput = (
  snapshot: DynamicMedicationSnapshot,
  scope: MedicationScope,
  section: string,
  rows: FieldRow[],
  offset: number,
  limit: number,
): JsonValue => {
  if (offset > rows.length) throw new Error('offset exceeds this result. Retry with offset 0 or a returned nextOffset.')
  const output = {
    contextRevision: snapshot.revision,
    scope,
    dataMode: snapshot.dataMode,
    section,
    route: snapshot.route,
    offset,
    returned: 0,
    totalRows: rows.length,
    nextOffset: null as number | null,
    format: 'JSON Pointer field rows. Join string parts in order. Follow nextOffset for all fields.',
    notice: comparisonNotice,
    rows: [] as FieldRow[],
  }
  for (const row of rows.slice(offset, offset + limit)) {
    output.rows.push(row)
    output.returned = output.rows.length
    output.nextOffset = offset + output.returned < rows.length ? offset + output.returned : null
    if (JSON.stringify(output).length > dynamicMedicationOutputBudget) {
      output.rows.pop()
      output.returned = output.rows.length
      output.nextOffset = offset + output.returned < rows.length ? offset + output.returned : null
      break
    }
  }
  if (!output.returned && offset < rows.length) throw new Error('This normalized field exceeds the result budget. Request a narrower section.')
  return JSON.parse(JSON.stringify(output)) as JsonValue
}

const pickSection = (result: MedicationComparisonResult, section: MedicationComparisonSection): unknown => ({
  drugs: result.drugs.map((entry) => {
    const drug = entry.drug && typeof entry.drug === 'object'
      ? entry.drug as Record<string, unknown> : undefined
    const details = section === 'product'
      ? drug && Object.fromEntries(['activeIngredients', 'pharmacologicClasses', 'forms', 'strengths', 'routes', 'manufacturers', 'variants']
        .map((key) => [key, drug[key] ?? null]))
      : drug?.[section]
    const warnings = Array.isArray(drug?.warnings) ? drug.warnings.filter((warning): warning is ProviderWarning =>
      Boolean(warning && typeof warning === 'object' && typeof warning.source === 'string' && typeof warning.code === 'string' && typeof warning.message === 'string')) : []
    const relevant = warningsForFactLoad(warnings, section === 'clinical' ? 'clinical' : section === 'prices' ? 'pricing' : 'product')
    const publicDetails = section === 'prices' && Array.isArray(details) ? details.filter(quote => quote?.kind !== 'demo') : details
    const hasContent = publicDetails !== undefined && publicDetails !== null && (Array.isArray(publicDetails) ? publicDetails.length > 0
      : typeof publicDetails === 'object' ? Object.values(publicDetails).some(value => Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined) : true)
    const failed = relevant.some(isTransientProviderFailure)
    const availability = failed ? hasContent ? 'partial' : 'provider-failed' : hasContent ? 'available' : details == null ? 'source-unavailable' : 'field-absent'
    return {
      medicationId: entry.medicationId, name: entry.name, status: entry.status,
      ...(entry.message ? { message: entry.message } : {}),
      dataAvailability: availability, providerWarnings: warnings, freshness: drug?.dataMeta ?? null,
      [section]: details ?? null,
    }
  }),
  notice: result.notice,
})

export const createDynamicMedicationTools = (
  dependencies: DynamicMedicationDependencies,
  source: 'agent' | 'demo' = 'agent',
  contextSnapshot: DynamicMedicationSnapshot = dependencies.getSnapshot(),
): ClearDoseToolDefinition[] => {
  const snapshot = normalizeSnapshot(contextSnapshot)
  if (!snapshot.catalog.length) return []
  const signature = dynamicMedicationSignature(snapshot)
  const catalogIds = snapshot.catalog.map((item) => item.id)
  const common = commonProperties(snapshot)
  const annotations = { readOnlyHint: true, untrustedContentHint: true, idempotentHint: true, destructiveHint: false }
  const results = new Map<string, FieldRow[]>()
  const readRows = async (key: string, load: () => unknown | Promise<unknown>, signal?: AbortSignal, refresh = false): Promise<FieldRow[]> => {
    const cached = results.get(key)
    if (cached && !refresh) return cached
    const value = await load()
    signal?.throwIfAborted()
    const rows = fieldRows(value)
    if (results.size >= 16) results.delete(results.keys().next().value!)
    results.set(key, rows)
    return rows
  }
  const validateContext = (input: Record<string, unknown>): MedicationScope => {
    if (input.contextRevision !== snapshot.revision || dynamicMedicationSignature(dependencies.getSnapshot()) !== signature) {
      throw new Error(staleMessage)
    }
    return choice(input.scope ?? 'catalog', snapshot.pageMedicationIds.length ? ['page', 'catalog'] : ['catalog'], 'scope')
  }
  const run = (name: string, input: unknown, options: WebMcpExecutionOptions | undefined, callback: () => Promise<JsonValue>): Promise<JsonValue> =>
    executeWithActivity({ toolName: name, source, args: input, run: async () => {
      options?.signal?.throwIfAborted()
      const result = await callback()
      options?.signal?.throwIfAborted()
      return result
    } })

  const tools: ClearDoseToolDefinition[] = [{
    name: 'find_related_medications',
    title: 'Find related catalog medications',
    description: 'Find and explain shared catalog fields. Similarity is not therapeutic interchangeability or advice about suitability.',
    category: 'discovery',
    inputSchema: objectSchema({
      ...common,
      referenceMedicationId: medicationSchema(snapshot),
      basis: { type: 'string', enum: similarityBases, default: 'category', description: 'Match field. Ingredient/class need loaded public facts.' },
    }, ['contextRevision', 'referenceMedicationId']),
    annotations,
    exampleInput: { contextRevision: snapshot.revision, referenceMedicationId: catalogIds[0]!, scope: 'catalog', basis: 'category' },
    execute: (raw, options) => run('find_related_medications', raw, options, async () => {
      const input = asInput(raw, ['contextRevision', 'referenceMedicationId', 'basis', 'scope', 'offset', 'limit'])
      const scope = validateContext(input)
      const referenceMedicationId = choice(input.referenceMedicationId, catalogIds, 'referenceMedicationId')
      const basis = choice(input.basis ?? 'category', similarityBases, 'basis')
      const offset = integer(input, 'offset', 0, 1_000_000)
      const limit = integer(input, 'limit', 5, 10)
      const candidates = scope === 'page' ? snapshot.pageMedicationIds : catalogIds
      const rows = await readRows(JSON.stringify(['related', referenceMedicationId, scope, basis]),
        () => dependencies.findRelated({ referenceMedicationId, candidateMedicationIds: candidates.filter((id) => id !== referenceMedicationId), basis, signal: options?.signal }), options?.signal, offset === 0)
      validateContext(input)
      return pageOutput({ ...snapshot, route: dependencies.getSnapshot().route }, scope, 'matches', rows, offset, limit)
    }),
  }]

  tools.push({
    name: 'compare_medications',
    title: 'Compare medication data',
    description: 'Read up to four drugs without page changes. For a visible report, call cleardose_show_drug_fact with drugs/facts. Follow nextOffset. FDA interactions are label text, not a pairwise check or treatment decision.',
    category: 'discovery',
    inputSchema: objectSchema({
      ...common,
      medicationIds: { type: 'array', minItems: 1, maxItems: 4, items: medicationSchema(snapshot), description: 'Distinct IDs. Page scope needs visible IDs.' },
      section: { type: 'string', enum: comparisonSections, default: 'identity', description: 'Clinical pages full available FDA text.' },
    }, ['contextRevision', 'medicationIds']),
    annotations,
    exampleInput: { contextRevision: snapshot.revision, medicationIds: catalogIds.slice(0, 2), scope: 'catalog', section: 'identity' },
    execute: (raw, options) => run('compare_medications', raw, options, async () => {
      const input = asInput(raw, ['contextRevision', 'medicationIds', 'section', 'scope', 'offset', 'limit'])
      const scope = validateContext(input)
      if (!Array.isArray(input.medicationIds) || input.medicationIds.length < 1 || input.medicationIds.length > 4) {
        throw new Error('medicationIds must contain one to four distinct current medication IDs.')
      }
      const allowedIds = scope === 'page' ? snapshot.pageMedicationIds : catalogIds
      const medicationIds = input.medicationIds.map((id) => choice(id, allowedIds, 'medicationIds'))
      if (new Set(medicationIds).size !== medicationIds.length) throw new Error('medicationIds must be distinct.')
      const section = choice(input.section ?? 'identity', comparisonSections, 'section')
      const offset = integer(input, 'offset', 0, 1_000_000)
      const limit = integer(input, 'limit', 5, 10)
      const rows = await readRows(JSON.stringify(['compare', medicationIds, scope, section]), async () => {
        const result = await dependencies.compare({ medicationIds, section, signal: options?.signal })
        return pickSection(result, section)
      }, options?.signal, offset === 0)
      validateContext(input)
      return pageOutput({ ...snapshot, route: dependencies.getSnapshot().route }, scope, section, rows, offset, limit)
    }),
  })
  return tools
}

export interface DynamicMedicationRegistrationState {
  expectedNames: string[]
  registeredNames: string[]
  verified: boolean
  revision: string
}

export interface DynamicMedicationRegistration {
  readonly definitions: readonly ClearDoseToolDefinition[]
  refresh(): Promise<void>
  dispose(): void
}

export interface RegisterDynamicMedicationOptions {
  context: WebMcpModelContext
  dependencies: DynamicMedicationDependencies
  extraDefinitions?: () => ClearDoseToolDefinition[]
  onChanged?: (state: DynamicMedicationRegistrationState) => void
  onError?: (error: unknown) => void
}

export const registerDynamicMedicationTools = async (
  options: RegisterDynamicMedicationOptions,
): Promise<DynamicMedicationRegistration> => {
  let disposed = false
  interface Entry {
    definition: ClearDoseToolDefinition
    signature: string
    controller: AbortController
    inFlight: number
    pending: boolean
  }
  const entries = new Map<string, Entry>()
  let requested: { snapshot: DynamicMedicationSnapshot; definitions: ClearDoseToolDefinition[] } | undefined
  let running: Promise<void> | undefined
  let deferredTimer: ReturnType<typeof setTimeout> | undefined
  const signatureOf = (definition: ClearDoseToolDefinition): string => JSON.stringify(nativeToolDefinition(definition))

  const refresh = (): Promise<void> => {
    if (disposed) return Promise.resolve()
    try {
      const nextSnapshot = normalizeSnapshot(options.dependencies.getSnapshot())
      const extras = options.extraDefinitions?.() ?? []
      const definitions = [...createDynamicMedicationTools(options.dependencies, 'agent', nextSnapshot), ...extras]
      assertNativeDeclarationBudget([...clearDoseToolCatalog, ...definitions])
      if (new Set(definitions.map(tool => tool.name)).size !== definitions.length) throw new Error('Duplicate WebMCP tool names in registration.')
      requested = { snapshot: nextSnapshot, definitions }
    } catch (error) {
      options.onError?.(error)
      return Promise.reject(error)
    }
    if (running) return running
    running = (async () => {
      while (!disposed && requested) {
        const { snapshot, definitions: desired } = requested
        requested = undefined
        let changed = false
        let deferred = false
        try {
          const desiredNames = new Set(desired.map(tool => tool.name))
          for (const [name, entry] of entries) {
            if (desiredNames.has(name)) continue
            if (entry.inFlight) { entry.pending = true; deferred = true; continue }
            entry.controller.abort()
            entries.delete(name)
            changed = true
          }
          for (const definition of desired) {
            if (disposed) break
            const signature = signatureOf(definition)
            const previous = entries.get(definition.name)
            if (previous?.signature === signature) { previous.pending = false; continue }
            // A tool can change its own page/workspace before its promise resolves.
            // Keep its registration alive until that execution has returned.
            if (previous?.inFlight) { previous.pending = true; deferred = true; continue }
            previous?.controller.abort()
            entries.delete(definition.name)
            const entry: Entry = { definition, signature, controller: new AbortController(), inFlight: 0, pending: false }
            entries.set(definition.name, entry)
            const native = nativeToolDefinition(definition)
            try {
              await options.context.registerTool({ ...native, execute: async (input, executionOptions) => {
                entry.inFlight += 1
                try { return await definition.execute(input, executionOptions) }
                finally {
                  entry.inFlight -= 1
                  if (!disposed && !entry.inFlight && entry.pending && deferredTimer === undefined) {
                    // Leave the current promise chain before removing its browser registration.
                    deferredTimer = setTimeout(() => {
                      deferredTimer = undefined
                      if (!disposed) void refresh().catch(() => undefined) // refresh already reports through onError
                    }, 0)
                  }
                }
              } }, { signal: entry.controller.signal })
            } catch (error) {
              entry.controller.abort()
              entries.delete(definition.name)
              throw error
            }
            changed = true
            if (disposed) entry.controller.abort()
          }
          if (disposed) break
          if (requested || deferred || !changed) continue
          const expectedNames = desired.map((tool) => tool.name)
          const verified = typeof options.context.getTools === 'function'
          const registeredNames = verified
            ? (await options.context.getTools!()).map((tool) => tool.name).filter((name) => expectedNames.includes(name))
            : expectedNames
          if (disposed) break
          if (requested) continue
          options.onChanged?.({ expectedNames, registeredNames: [...new Set(registeredNames)].sort(), verified, revision: snapshot.revision })
        } catch (error) {
          if (!disposed) options.onError?.(error)
          if (!requested) throw error
        }
      }
    })().finally(() => { running = undefined })
    return running
  }

  const registration: DynamicMedicationRegistration = {
    get definitions() { return [...entries.values()].map(entry => entry.definition) },
    refresh,
    dispose() {
      if (disposed) return
      disposed = true
      requested = undefined
      if (deferredTimer !== undefined) clearTimeout(deferredTimer)
      for (const entry of entries.values()) entry.controller.abort()
      entries.clear()
    },
  }
  try { await refresh() }
  catch (error) { registration.dispose(); throw error }
  return registration
}
