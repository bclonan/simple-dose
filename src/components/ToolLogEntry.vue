<script setup lang="ts">
import type { AgentActivity } from '../types/demo-db'
import { formatActivityJson as safeJson } from '../utils/redact'

defineProps<{ entry: AgentActivity }>()

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
