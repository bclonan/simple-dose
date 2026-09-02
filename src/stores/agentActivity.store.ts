import { defineStore } from 'pinia'
import type { AgentActivity, AgentActivityContext } from '../types/demo-db'
import { createId } from '../utils/ids'
import { compactSummary, redactSensitive } from '../utils/redact'
import { readStorage, storageKeys, writeStorage } from '../utils/storage'

type ActivitySource = AgentActivity['source']

interface ActivityState {
  entries: AgentActivity[]
  activeJourney: {
    id: string
    title: string
    source: ActivitySource
  } | null
}

interface ActivityJourneyInput {
  journeyId?: string
  journeyTitle?: string
  contextBefore?: AgentActivityContext
}

export interface AgentActivityJourney {
  id: string
  title: string
  source: ActivitySource
  startedAt: string
  updatedAt: string
  status: AgentActivity['status']
  entries: AgentActivity[]
}

const JOURNEY_WINDOW_MS = 2 * 60 * 1000

const defaultJourneyTitle = (toolName: string, source: ActivitySource): string => {
  if (source === 'demo') return 'Programmatic replay'
  if (toolName.includes('cart') || toolName.includes('delivery')) return 'Cart planning'
  if (toolName.includes('order') || toolName.includes('checkout')) return 'Demo checkout'
  if (toolName.includes('prescription')) return 'Prescription request'
  if (toolName.includes('compare') || toolName.includes('saving')) return 'Cost comparison'
  return 'Medication discovery'
}

const normalizeEntries = (entries: AgentActivity[]): AgentActivity[] =>
  entries.map((entry) => ({
    ...entry,
    journeyId: entry.journeyId ?? `journey-${entry.id}`,
    journeyTitle: entry.journeyTitle ?? defaultJourneyTitle(entry.toolName, entry.source),
  }))

export const useAgentActivityStore = defineStore('agentActivity', {
  state: (): ActivityState => {
    const stored = readStorage<{ entries: AgentActivity[] }>(storageKeys.activity, { entries: [] })
    return { entries: normalizeEntries(stored.entries), activeJourney: null }
  },
  getters: {
    journeys(state): AgentActivityJourney[] {
      const grouped = new Map<string, AgentActivityJourney>()
      for (const entry of [...state.entries].reverse()) {
        const existing = grouped.get(entry.journeyId)
        if (existing) {
          existing.entries.push(entry)
          existing.updatedAt = entry.timestamp
          if (entry.status === 'error') existing.status = 'error'
          else if (entry.status === 'started' && existing.status !== 'error') existing.status = 'started'
          else if (existing.status !== 'error' && existing.status !== 'started') existing.status = 'success'
          continue
        }
        grouped.set(entry.journeyId, {
          id: entry.journeyId,
          title: entry.journeyTitle,
          source: entry.source,
          startedAt: entry.timestamp,
          updatedAt: entry.timestamp,
          status: entry.status,
          entries: [entry],
        })
      }
      return [...grouped.values()]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 10)
    },
  },
  actions: {
    start(
      toolName: string,
      source: ActivitySource,
      input?: unknown,
      journey: ActivityJourneyInput = {},
    ): AgentActivity {
      const timestamp = new Date().toISOString()
      const latest = this.entries[0]
      const latestTimestamp = latest ? Date.parse(latest.timestamp) : Number.NaN
      const canContinueLatest = Boolean(
        !journey.journeyId &&
        latest &&
        latest.source === source &&
        latest.toolName !== 'checkout_demo_order' &&
        Number.isFinite(latestTimestamp) &&
        Date.parse(timestamp) - latestTimestamp <= JOURNEY_WINDOW_MS,
      )
      const activeJourney = this.activeJourney?.source === source ? this.activeJourney : null
      const journeyId = journey.journeyId
        ?? activeJourney?.id
        ?? (canContinueLatest ? latest?.journeyId : undefined)
        ?? createId('journey')
      const journeyTitle = journey.journeyTitle
        ?? activeJourney?.title
        ?? (canContinueLatest ? latest?.journeyTitle : undefined)
        ?? defaultJourneyTitle(toolName, source)
      const event: AgentActivity = {
        id: createId('activity'),
        journeyId,
        journeyTitle,
        timestamp,
        source,
        type: 'tool',
        toolName,
        status: 'started',
        input: redactSensitive(input),
        contextBefore: journey.contextBefore,
      }
      this.entries.unshift(event)
      this.entries = this.entries.slice(0, 100)
      this.persist()
      return event
    },
    beginJourney(title: string, source: ActivitySource): string {
      const id = createId('journey')
      this.activeJourney = { id, title, source }
      return id
    },
    endJourney(journeyId?: string): void {
      if (!this.activeJourney) return
      if (journeyId && this.activeJourney.id !== journeyId) return
      this.activeJourney = null
    },
    succeed(
      id: string,
      output: unknown,
      durationMs: number,
      contextAfter?: AgentActivityContext,
    ): void {
      const event = this.entries.find((candidate) => candidate.id === id)
      if (!event) return
      event.status = 'success'
      event.outputSummary = compactSummary(output)
      event.durationMs = durationMs
      event.contextAfter = contextAfter
      this.persist()
    },
    fail(
      id: string,
      error: unknown,
      durationMs: number,
      contextAfter?: AgentActivityContext,
    ): void {
      const event = this.entries.find((candidate) => candidate.id === id)
      if (!event) return
      event.status = 'error'
      event.error = error instanceof Error ? error.message : 'Tool execution failed.'
      event.durationMs = durationMs
      event.contextAfter = contextAfter
      this.persist()
    },
    clear(): void {
      this.entries = []
      this.activeJourney = null
      this.persist()
    },
    persist(): void {
      writeStorage(storageKeys.activity, { entries: this.entries })
    },
  },
})
