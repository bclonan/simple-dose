import type { AgentActivity } from '../types/demo-db'
import { redactSensitive } from '../utils/redact'

export type JourneyStatus = 'running' | 'success' | 'error'
export type ReplayState = 'idle' | 'running' | 'complete' | 'error'

export interface WebMcpJourney {
  id: string
  title: string
  entries: AgentActivity[]
  startedAt: string
  endedAt: string
  durationMs: number
  status: JourneyStatus
  writeCount: number
  replayable: boolean
  replayBlockedReason: string | null
  hasRedactedContext: boolean
}

const JOURNEY_GAP_MS = 2 * 60 * 1000
export const MAX_REPLAY_CALLS = 12

const writeTools = new Set([
  'select_medication_option',
  'create_prescription_request_card',
  'add_to_cart',
  'remove_cart_item',
  'set_delivery_option',
  'checkout_demo_order',
])

const terminalTools = new Set(['checkout_demo_order', 'get_order_status'])

const toolLabels: Record<string, string> = {
  search_medications: 'Medication search',
  get_medication_details: 'Medication details',
  compare_fulfillment_options: 'Cost comparison',
  compare_cart_savings: 'Cart savings comparison',
  select_medication_option: 'Fulfillment selection',
  create_prescription_request_card: 'Prescription request',
  add_to_cart: 'Cart build',
  view_cart: 'Cart review',
  remove_cart_item: 'Cart correction',
  set_delivery_option: 'Delivery update',
  checkout_demo_order: 'Demo checkout',
  get_order_status: 'Order status',
}

const timestamp = (entry: AgentActivity): number => {
  const parsed = Date.parse(entry.timestamp)
  return Number.isFinite(parsed) ? parsed : 0
}

const hasRedactedValue = (value: unknown): boolean => {
  if (value === '[redacted]') return true
  if (Array.isArray(value)) return value.some(hasRedactedValue)
  if (value === null || typeof value !== 'object') return false
  return Object.values(value as Record<string, unknown>).some(hasRedactedValue)
}

const removeRedactedValues = (value: unknown): unknown => {
  if (value === '[redacted]') return undefined
  if (Array.isArray(value)) {
    return value
      .map(removeRedactedValues)
      .filter((item) => item !== undefined)
  }
  if (value === null || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, removeRedactedValues(item)] as const)
      .filter(([, item]) => item !== undefined),
  )
}

const journeyTitle = (entries: AgentActivity[]): string => {
  const recordedTitle = entries[0]?.journeyTitle?.trim()
  if (recordedTitle) return recordedTitle
  const names = new Set(entries.map((entry) => entry.toolName))
  if (names.has('checkout_demo_order')) return 'Demo checkout journey'
  if (names.has('create_prescription_request_card')) return 'Prescription request journey'
  if (names.has('add_to_cart') || names.has('remove_cart_item')) return 'Cart planning journey'
  if (names.has('compare_fulfillment_options')) return 'Medication cost comparison'
  if (names.has('search_medications')) return 'Medication discovery'

  const last = entries.at(-1)
  return last ? toolLabels[last.toolName] ?? 'WebMCP journey' : 'WebMCP journey'
}

const blockedReason = (entries: AgentActivity[]): string | null => {
  if (entries.length > MAX_REPLAY_CALLS) {
    return `This journey has more than ${MAX_REPLAY_CALLS} calls. Replay it as smaller reviewed journeys.`
  }
  if (entries.some((entry) => entry.toolName === 'checkout_demo_order')) {
    return 'Checkout stays human-controlled. Identity and address context is never replayed from this log.'
  }
  if (entries.some((entry) => entry.status === 'started')) {
    return 'Wait for every call to finish before replaying this journey.'
  }
  if (entries.some((entry) => entry.status === 'error')) {
    return 'Failed journeys remain available for inspection, but replay is disabled.'
  }
  if (!entries.some((entry) => entry.status === 'success')) {
    return 'This journey has no completed calls to replay.'
  }
  return null
}

const makeJourney = (entries: AgentActivity[]): WebMcpJourney => {
  const first = entries[0]
  const last = entries.at(-1) ?? first
  const reason = blockedReason(entries)
  const status: JourneyStatus = entries.some((entry) => entry.status === 'error')
    ? 'error'
    : entries.some((entry) => entry.status === 'started')
      ? 'running'
      : 'success'
  const usesOneRecordedId = first
    && entries.every((entry) => entry.journeyId === first.journeyId)

  return {
    id: usesOneRecordedId
      ? first.journeyId
      : `journey-${first?.id ?? 'empty'}-${last?.id ?? 'empty'}`,
    title: journeyTitle(entries),
    entries,
    startedAt: first?.timestamp ?? new Date(0).toISOString(),
    endedAt: last?.timestamp ?? first?.timestamp ?? new Date(0).toISOString(),
    durationMs: entries.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0),
    status,
    writeCount: entries.filter((entry) => writeTools.has(entry.toolName)).length,
    replayable: reason === null,
    replayBlockedReason: reason,
    hasRedactedContext: entries.some(
      (entry) => hasRedactedValue(entry.input) || hasRedactedValue(entry.outputSummary),
    ),
  }
}

const shouldStartNewJourney = (
  current: AgentActivity[],
  entry: AgentActivity,
): boolean => {
  const previous = current.at(-1)
  if (!previous) return false
  if (current.length >= MAX_REPLAY_CALLS) return true
  if (entry.source !== previous.source) return true
  if (timestamp(entry) - timestamp(previous) > JOURNEY_GAP_MS) return true
  if (
    entry.toolName === 'search_medications'
    && current.some((candidate) => candidate.toolName === 'search_medications')
  ) return true
  if (terminalTools.has(previous.toolName) && entry.toolName !== 'get_order_status') return true
  return false
}

export const groupWebMcpJourneys = (
  entries: AgentActivity[],
  maxJourneys = 5,
): WebMcpJourney[] => {
  const chronological = [...entries].sort((left, right) => timestamp(left) - timestamp(right))
  const recordedGroups = new Map<string, AgentActivity[]>()
  const legacyEntries: AgentActivity[] = []

  for (const entry of chronological) {
    const isNormalizedLegacyEntry = entry.journeyId === `journey-${entry.id}`
    if (entry.journeyId && !isNormalizedLegacyEntry) {
      const recorded = recordedGroups.get(entry.journeyId) ?? []
      recorded.push(entry)
      recordedGroups.set(entry.journeyId, recorded)
    } else {
      legacyEntries.push(entry)
    }
  }

  const groups: AgentActivity[][] = [...recordedGroups.values()]
  let current: AgentActivity[] = []

  for (const entry of legacyEntries) {
    if (shouldStartNewJourney(current, entry)) {
      groups.push(current)
      current = []
    }
    current.push(entry)
  }
  if (current.length) groups.push(current)

  return groups
    .map(makeJourney)
    .sort((left, right) => timestamp(right.entries.at(-1)!) - timestamp(left.entries.at(-1)!))
    .slice(0, maxJourneys)
}

export const replayEntriesForJourney = (journey: WebMcpJourney): AgentActivity[] =>
  journey.entries.map((entry) => ({
    ...entry,
    input: removeRedactedValues(redactSensitive(entry.input)),
    outputSummary: undefined,
    contextBefore: undefined,
    contextAfter: undefined,
    error: undefined,
  }))

export const isWriteTool = (toolName: string): boolean => writeTools.has(toolName)

export const labelForTool = (toolName: string): string =>
  toolLabels[toolName] ?? toolName.replaceAll('_', ' ')
