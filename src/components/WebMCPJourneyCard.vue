<script setup lang="ts">
import { computed } from 'vue'
import type { AgentActivity } from '../types/demo-db'
import { redactSensitive } from '../utils/redact'
import {
  labelForTool,
  type ReplayState,
  type WebMcpJourney,
} from './webmcpJourneys'

const props = withDefaults(defineProps<{
  journey: WebMcpJourney
  expanded?: boolean
  replayState?: ReplayState
  activeReplayJourneyId?: string | null
  activeReplayEntryId?: string | null
}>(), {
  expanded: false,
  replayState: 'idle',
  activeReplayJourneyId: null,
  activeReplayEntryId: null,
})

defineEmits<{
  toggle: [journeyId: string]
  review: [journeyId: string]
}>()

const isActiveReplay = computed(() => props.activeReplayJourneyId === props.journey.id)
const activeReplayIndex = computed(() =>
  props.journey.entries.findIndex((entry) => entry.id === props.activeReplayEntryId),
)

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))

const formatDuration = (durationMs: number): string => {
  if (durationMs < 1000) return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`
}

const safeJson = (value: unknown): string => {
  const redacted = redactSensitive(value ?? {})
  let formatted: string
  try {
    formatted = JSON.stringify(redacted, null, 2)
  } catch {
    formatted = '{\n  "context": "unavailable"\n}'
  }
  if (formatted.length <= 1200) return formatted
  return `${formatted.slice(0, 1200)}\n... [bounded at 1,200 characters]`
}

const replayStepStatus = (
  index: number,
): 'pending' | 'running' | 'complete' | 'error' | 'recorded' => {
  if (!isActiveReplay.value || props.replayState === 'idle') return 'recorded'
  if (props.replayState === 'complete') return 'complete'

  const activeIndex = activeReplayIndex.value
  if (activeIndex < 0) return props.replayState === 'running' ? 'pending' : 'recorded'
  if (index < activeIndex) return 'complete'
  if (index > activeIndex) return 'pending'
  return props.replayState === 'error' ? 'error' : 'running'
}

const callStatusLabel = (entry: AgentActivity, index: number): string => {
  const replayStatus = replayStepStatus(index)
  if (replayStatus !== 'recorded') return replayStatus
  return entry.status === 'started' ? 'running' : entry.status
}

const callStatusIcon = (entry: AgentActivity, index: number): string => {
  const status = callStatusLabel(entry, index)
  if (status === 'complete' || status === 'success') return '✓'
  if (status === 'error') return '!'
  if (status === 'running') return '→'
  return '·'
}
</script>

<template>
  <article
    class="webmcp-journey"
    :class="{
      'webmcp-journey--active': isActiveReplay,
      'webmcp-journey--error': journey.status === 'error',
    }"
    data-testid="webmcp-journey"
  >
    <header class="webmcp-journey__header">
      <div class="webmcp-journey__heading">
        <span class="webmcp-journey__mark" :class="`webmcp-journey__mark--${journey.status}`" aria-hidden="true">
          {{ journey.status === 'success' ? '✓' : journey.status === 'error' ? '!' : '·' }}
        </span>
        <div>
          <h3>{{ journey.title }}</h3>
          <p>
            {{ journey.entries.length }} {{ journey.entries.length === 1 ? 'call' : 'calls' }}
            <span aria-hidden="true">·</span>
            {{ formatDuration(journey.durationMs) }}
            <span aria-hidden="true">·</span>
            <time :datetime="journey.startedAt">{{ formatDateTime(journey.startedAt) }}</time>
          </p>
        </div>
      </div>
      <span class="webmcp-journey__status" :class="`webmcp-journey__status--${journey.status}`">
        {{ journey.status === 'success' ? 'Completed' : journey.status === 'error' ? 'Needs review' : 'Running' }}
      </span>
    </header>

    <ol class="webmcp-journey__path" :aria-label="`${journey.title} tool sequence`">
      <li v-for="entry in journey.entries" :key="entry.id">
        <code>{{ entry.toolName }}</code>
      </li>
    </ol>

    <div class="webmcp-journey__facts">
      <span>{{ journey.writeCount ? `${journey.writeCount} state-changing` : 'Read-only' }}</span>
      <span>Stored context is redacted and bounded</span>
    </div>

    <div v-if="journey.replayBlockedReason" class="webmcp-journey__notice" role="note">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
        <path d="M10 2.5 17.2 16H2.8L10 2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M10 7v4.2M10 13.7v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <span>{{ journey.replayBlockedReason }}</span>
    </div>

    <div class="webmcp-journey__actions">
      <button
        class="button button--secondary button--small"
        type="button"
        :aria-expanded="expanded"
        :aria-controls="`journey-calls-${journey.id}`"
        :data-testid="`journey-details-${journey.id}`"
        @click="$emit('toggle', journey.id)"
      >
        {{ expanded ? 'Hide calls' : 'Inspect calls' }}
      </button>
      <button
        class="button button--small"
        type="button"
        :disabled="!journey.replayable || replayState === 'running'"
        :data-testid="`journey-replay-${journey.id}`"
        @click="$emit('review', journey.id)"
      >
        {{ isActiveReplay && replayState === 'running' ? 'Replaying...' : 'Review replay' }}
      </button>
    </div>

    <div
      v-if="expanded"
      :id="`journey-calls-${journey.id}`"
      class="webmcp-journey__calls"
    >
      <article
        v-for="(entry, index) in journey.entries"
        :key="entry.id"
        class="journey-call"
        :class="`journey-call--${replayStepStatus(index)}`"
        :data-testid="`journey-call-${entry.id}`"
      >
        <div class="journey-call__rail" aria-hidden="true">
          <span>{{ callStatusIcon(entry, index) }}</span>
        </div>
        <div class="journey-call__body">
          <header>
            <div>
              <strong>{{ labelForTool(entry.toolName) }}</strong>
              <code>{{ entry.toolName }}</code>
            </div>
            <span :class="`journey-call__status journey-call__status--${callStatusLabel(entry, index)}`">
              {{ callStatusLabel(entry, index) }}
            </span>
          </header>
          <p class="journey-call__meta">
            {{ entry.source === 'agent' ? 'Browser agent' : entry.source === 'demo' ? 'Agent Lab replay' : 'Visible interface' }}
            <template v-if="entry.durationMs !== undefined">
              <span aria-hidden="true">·</span> {{ formatDuration(entry.durationMs) }}
            </template>
          </p>
          <details>
            <summary>View redacted context</summary>
            <div class="journey-call__context">
              <div>
                <span>Input</span>
                <pre>{{ safeJson(entry.input) }}</pre>
              </div>
              <div v-if="entry.outputSummary !== undefined">
                <span>Bounded outcome</span>
                <pre>{{ safeJson(entry.outputSummary) }}</pre>
              </div>
              <div v-if="entry.contextBefore !== undefined">
                <span>Recorded state before</span>
                <pre>{{ safeJson(entry.contextBefore) }}</pre>
              </div>
              <div v-if="entry.contextAfter !== undefined">
                <span>Recorded state after</span>
                <pre>{{ safeJson(entry.contextAfter) }}</pre>
              </div>
              <p v-if="entry.error" class="journey-call__error">The tool reported an error. No personal checkout fields are shown here.</p>
            </div>
          </details>
        </div>
      </article>
    </div>
  </article>
</template>
