import { defineStore } from 'pinia'
import type { AgentActivity } from '../types/demo-db'
import { createId } from '../utils/ids'
import { compactSummary, redactSensitive } from '../utils/redact'
import { readStorage, storageKeys, writeStorage } from '../utils/storage'

type ActivitySource = AgentActivity['source']

interface ActivityState {
  entries: AgentActivity[]
}

export const useAgentActivityStore = defineStore('agentActivity', {
  state: (): ActivityState =>
    readStorage<ActivityState>(storageKeys.activity, { entries: [] }),
  actions: {
    start(toolName: string, source: ActivitySource, input?: unknown): AgentActivity {
      const event: AgentActivity = {
        id: createId('activity'),
        timestamp: new Date().toISOString(),
        source,
        type: 'tool',
        toolName,
        status: 'started',
        input: redactSensitive(input),
      }
      this.entries.unshift(event)
      this.entries = this.entries.slice(0, 100)
      this.persist()
      return event
    },
    succeed(id: string, output: unknown, durationMs: number): void {
      const event = this.entries.find((candidate) => candidate.id === id)
      if (!event) return
      event.status = 'success'
      event.outputSummary = compactSummary(output)
      event.durationMs = durationMs
      this.persist()
    },
    fail(id: string, error: unknown, durationMs: number): void {
      const event = this.entries.find((candidate) => candidate.id === id)
      if (!event) return
      event.status = 'error'
      event.error = error instanceof Error ? error.message : 'Tool execution failed.'
      event.durationMs = durationMs
      this.persist()
    },
    clear(): void {
      this.entries = []
      this.persist()
    },
    persist(): void {
      writeStorage(storageKeys.activity, { entries: this.entries })
    },
  },
})
