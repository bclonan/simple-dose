<script setup lang="ts">
import type { AgentActivity } from '../types/demo-db'

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
      </p>
      <p v-if="entry.error" class="tool-log-entry__error">{{ entry.error }}</p>
      <details v-if="entry.input !== undefined || entry.outputSummary !== undefined">
        <summary>Inspect call</summary>
        <div v-if="entry.input !== undefined"><span>Input</span><pre>{{ JSON.stringify(entry.input, null, 2) }}</pre></div>
        <div v-if="entry.outputSummary !== undefined"><span>Output</span><pre>{{ JSON.stringify(entry.outputSummary, null, 2) }}</pre></div>
      </details>
    </div>
  </article>
</template>
