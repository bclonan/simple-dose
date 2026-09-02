<script setup lang="ts">
import type { AgentActivity } from '../types/demo-db'
import { redactSensitive } from '../utils/redact'

defineProps<{ entry: AgentActivity }>()

const safeJson = (value: unknown): string => {
  let formatted: string
  try {
    formatted = JSON.stringify(redactSensitive(value ?? {}), null, 2)
  } catch {
    formatted = '{\n  "context": "unavailable"\n}'
  }
  if (formatted.length <= 1200) return formatted
  return `${formatted.slice(0, 1200)}\n... [bounded at 1,200 characters]`
}
</script>

<template>
  <article class="tool-log-entry" :class="`tool-log-entry--${entry.status}`">
    <div class="tool-log-entry__status" aria-hidden="true">
      {{ entry.status === 'success' ? '✓' : entry.status === 'error' ? '!' : '·' }}
    </div>
    <div class="tool-log-entry__body">
      <div class="tool-log-entry__heading">
        <strong>{{ entry.toolName }}</strong>
        <span>{{ new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}</span>
      </div>
      <p>
        {{ entry.status === 'started' ? 'Running' : entry.status }}
        <template v-if="entry.durationMs !== undefined"> · {{ entry.durationMs }}ms</template>
        <template> · {{ entry.source === 'agent' ? 'Browser agent' : entry.source === 'demo' ? 'Agent Lab replay' : 'Visible interface' }}</template>
      </p>
      <p v-if="entry.error" class="tool-log-entry__error">The tool reported an error. Personal checkout fields are not shown.</p>
      <details v-if="entry.input !== undefined || entry.outputSummary !== undefined || entry.contextBefore !== undefined || entry.contextAfter !== undefined">
        <summary>Inspect redacted context</summary>
        <div v-if="entry.input !== undefined"><span>Input</span><pre>{{ safeJson(entry.input) }}</pre></div>
        <div v-if="entry.outputSummary !== undefined"><span>Bounded outcome</span><pre>{{ safeJson(entry.outputSummary) }}</pre></div>
        <div v-if="entry.contextBefore !== undefined"><span>Recorded state before</span><pre>{{ safeJson(entry.contextBefore) }}</pre></div>
        <div v-if="entry.contextAfter !== undefined"><span>Recorded state after</span><pre>{{ safeJson(entry.contextAfter) }}</pre></div>
      </details>
    </div>
  </article>
</template>
