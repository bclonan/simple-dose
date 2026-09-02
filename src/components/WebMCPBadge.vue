<script setup lang="ts">
import { computed } from 'vue'
import { useAgentActivityStore } from '../stores/agentActivity.store'
import type { WebMcpRegistrationStatus } from '../stores/webmcp.store'
import { clearDoseToolNames } from '../webmcp/definitions'

const props = defineProps<{
  status: WebMcpRegistrationStatus
  count: number
  expectedToolCount?: number
  expanded?: boolean
}>()

const emit = defineEmits<{
  open: []
}>()

const activity = useAgentActivityStore()
const available = computed(() =>
  props.status === 'ready' || props.status === 'ready-unverified',
)
const degraded = computed(() => props.status === 'degraded')
const expectedCount = computed(() => props.expectedToolCount ?? clearDoseToolNames.length)
const statusCopy = computed(() => {
  if (degraded.value) return `${props.count} of ${expectedCount.value} tools available`
  if (available.value) return `${props.count} ${props.count === 1 ? 'tool' : 'tools'} available`
  if (props.status === 'registering') return 'Registering browser tools'
  return 'Browser tools unavailable'
})
</script>

<template>
  <button
    class="webmcp-badge"
    :class="{
      'webmcp-badge--unsupported': !available && !degraded,
      'webmcp-badge--degraded': degraded,
      'webmcp-badge--expanded': expanded,
    }"
    type="button"
    :aria-label="`Open WebMCP activity, ${statusCopy}, ${activity.entries.length} recent calls`"
    :aria-expanded="Boolean(expanded)"
    aria-controls="webmcp-drawer"
    data-testid="webmcp-badge"
    @click="emit('open')"
  >
    <span class="webmcp-badge__icon" aria-hidden="true">
      <svg viewBox="0 0 22 22" fill="none">
        <path d="m11 2 .85 4.14a5 5 0 0 0 3.88 3.88l4.14.85-4.14.85a5 5 0 0 0-3.88 3.88L11 19.74l-.85-4.14a5 5 0 0 0-3.88-3.88l-4.14-.85 4.14-.85a5 5 0 0 0 3.88-3.88L11 2Z" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round" />
      </svg>
    </span>
    <span class="webmcp-badge__copy">
      <strong>WebMCP</strong>
      <span>
        <i aria-hidden="true"></i>
        {{ statusCopy }}<template v-if="activity.entries.length"> · {{ activity.entries.length }} logged</template>
      </span>
    </span>
    <svg class="webmcp-badge__chevron" aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="m7.5 5 5 5-5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
</template>
