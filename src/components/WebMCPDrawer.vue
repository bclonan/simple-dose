<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { AgentActivity } from '../types/demo-db'
import { useAgentActivityStore } from '../stores/agentActivity.store'
import { useWebMcpStore } from '../stores/webmcp.store'
import { clearDoseToolNames } from '../webmcp/definitions'
import ToolLogEntry from './ToolLogEntry.vue'
import WebMCPJourneyCard from './WebMCPJourneyCard.vue'
import {
  groupWebMcpJourneys,
  replayEntriesForJourney,
  type ReplayState,
} from './webmcpJourneys'

const props = withDefaults(defineProps<{
  open: boolean
  expectedToolCount?: number
  replayState?: ReplayState
  activeReplayEntryId?: string | null
  activeReplayJourneyId?: string | null
  replayError?: string | null
}>(), {
  expectedToolCount: 0,
  replayState: 'idle',
  activeReplayEntryId: null,
  activeReplayJourneyId: null,
  replayError: null,
})

const emit = defineEmits<{
  close: []
  replay: [entries: AgentActivity[]]
}>()

const webmcp = useWebMcpStore()
const activity = useAgentActivityStore()
const closeButton = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const activeTab = ref<'journeys' | 'calls'>('journeys')
const expandedJourneyIds = ref<Set<string>>(new Set())
const selectedJourneyId = ref<string | null>(null)
let restoreFocus: HTMLElement | null = null

const journeys = computed(() => groupWebMcpJourneys(activity.entries))
const selectedJourney = computed(() =>
  journeys.value.find((journey) => journey.id === selectedJourneyId.value) ?? null,
)
const effectiveExpectedCount = computed(() =>
  props.expectedToolCount || clearDoseToolNames.length,
)
const effectiveActiveJourneyId = computed(() => {
  if (props.activeReplayJourneyId) return props.activeReplayJourneyId
  if (!props.activeReplayEntryId) return null
  return journeys.value.find((journey) =>
    journey.entries.some((entry) => entry.id === props.activeReplayEntryId),
  )?.id ?? null
})
const replayAnnouncement = computed(() => {
  if (props.replayState === 'idle') return ''
  if (props.replayState === 'complete') return 'Journey replay complete.'
  if (props.replayState === 'error') return props.replayError || 'Journey replay stopped on an error.'
  const journey = journeys.value.find((candidate) => candidate.id === effectiveActiveJourneyId.value)
  const entry = journey?.entries.find((candidate) => candidate.id === props.activeReplayEntryId)
  return entry ? `Replaying ${entry.toolName}.` : 'Journey replay is starting.'
})

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'select:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const onKeydown = (event: KeyboardEvent): void => {
  if (!props.open) return
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  if (event.key !== 'Tab' || !panel.value) return

  const focusable = [...panel.value.querySelectorAll<HTMLElement>(focusableSelector)]
    .filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null)
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

const onTabKeydown = (event: KeyboardEvent): void => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'Home'
    ? 'journeys'
    : event.key === 'End'
      ? 'calls'
      : activeTab.value === 'journeys'
        ? 'calls'
        : 'journeys'
  activeTab.value = next
  nextTick(() => {
    panel.value?.querySelector<HTMLElement>(`#webmcp-${next}-tab`)?.focus()
  })
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.addEventListener('keydown', onKeydown)
      document.body.classList.add('is-drawer-open')
      await nextTick()
      closeButton.value?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown)
      document.body.classList.remove('is-drawer-open')
      selectedJourneyId.value = null
      restoreFocus?.focus()
    }
  },
)

watch(journeys, (nextJourneys) => {
  if (
    selectedJourneyId.value
    && !nextJourneys.some((journey) => journey.id === selectedJourneyId.value)
  ) selectedJourneyId.value = null
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('is-drawer-open')
})

const toggleJourney = (journeyId: string): void => {
  const next = new Set(expandedJourneyIds.value)
  if (next.has(journeyId)) next.delete(journeyId)
  else next.add(journeyId)
  expandedJourneyIds.value = next
}

const reviewJourney = (journeyId: string): void => {
  const journey = journeys.value.find((candidate) => candidate.id === journeyId)
  if (!journey?.replayable || props.replayState === 'running') return
  selectedJourneyId.value = journeyId
  const next = new Set(expandedJourneyIds.value)
  next.add(journeyId)
  expandedJourneyIds.value = next
  nextTick(() => panel.value?.querySelector<HTMLElement>('[data-testid="replay-confirmation"]')?.focus())
}

const confirmReplay = (): void => {
  const journey = selectedJourney.value
  if (!journey?.replayable || props.replayState === 'running') return
  selectedJourneyId.value = null
  emit('replay', replayEntriesForJourney(journey))
}

const clearActivity = (): void => {
  if (props.replayState === 'running') return
  selectedJourneyId.value = null
  expandedJourneyIds.value = new Set()
  activity.clear()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open" class="drawer-layer webmcp-drawer-layer" data-testid="webmcp-drawer">
        <button class="drawer-backdrop" type="button" aria-label="Close WebMCP activity" @click="$emit('close')" />
        <aside
          id="webmcp-drawer"
          ref="panel"
          class="drawer-panel webmcp-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="webmcp-drawer-title"
          aria-describedby="webmcp-drawer-description"
        >
          <header class="drawer-header webmcp-drawer__header">
            <div>
              <p class="section-kicker">Browser-native tools</p>
              <h2 id="webmcp-drawer-title">WebMCP activity</h2>
              <p id="webmcp-drawer-description">Inspect redacted calls and replay safe journeys in order.</p>
            </div>
            <button ref="closeButton" class="icon-button" type="button" aria-label="Close WebMCP activity" @click="$emit('close')">×</button>
          </header>

          <div class="drawer-status webmcp-drawer__status" :class="{ supported: webmcp.isReady, degraded: webmcp.status === 'degraded' }" aria-live="polite">
            <span class="status-dot" aria-hidden="true"></span>
            <div>
              <strong v-if="webmcp.status === 'ready'">{{ webmcp.registeredToolCount }} tools verified</strong>
              <strong v-else-if="webmcp.status === 'ready-unverified'">{{ webmcp.registeredToolCount }} tools registered</strong>
              <strong v-else-if="webmcp.status === 'degraded'">{{ webmcp.registeredToolCount }} of {{ effectiveExpectedCount }} tools verified</strong>
              <strong v-else-if="webmcp.status === 'registering'">Registering tools</strong>
              <strong v-else-if="webmcp.status === 'error'">Registration failed</strong>
              <strong v-else-if="webmcp.status === 'unsupported'">WebMCP unavailable</strong>
              <strong v-else>WebMCP status pending</strong>
              <span v-if="webmcp.status === 'unsupported'">The pharmacy demo still works normally.</span>
              <span v-else-if="webmcp.registrationError">{{ webmcp.registrationError }}</span>
              <span v-else-if="webmcp.status === 'ready-unverified'">This browser cannot verify the registry with getTools.</span>
              <span v-else-if="webmcp.status === 'ready'">Calls use the same state as the visible ClearDose interface.</span>
              <span v-else-if="webmcp.status === 'registering'">Registration is still in progress.</span>
              <span v-else>Registration has not started.</span>
            </div>
          </div>

          <div class="webmcp-drawer__tabs" role="tablist" aria-label="WebMCP activity views">
            <button
              id="webmcp-journeys-tab"
              type="button"
              role="tab"
              :aria-selected="activeTab === 'journeys'"
              aria-controls="webmcp-journeys-panel"
              :tabindex="activeTab === 'journeys' ? 0 : -1"
              data-testid="webmcp-journeys-tab"
              @click="activeTab = 'journeys'"
              @keydown="onTabKeydown"
            >
              Journeys <span>{{ journeys.length }}</span>
            </button>
            <button
              id="webmcp-calls-tab"
              type="button"
              role="tab"
              :aria-selected="activeTab === 'calls'"
              aria-controls="webmcp-calls-panel"
              :tabindex="activeTab === 'calls' ? 0 : -1"
              data-testid="webmcp-calls-tab"
              @click="activeTab = 'calls'"
              @keydown="onTabKeydown"
            >
              Calls <span>{{ activity.entries.length }}</span>
            </button>
          </div>

          <p class="sr-only" aria-live="polite">{{ replayAnnouncement }}</p>

          <section
            v-if="activeTab === 'journeys'"
            id="webmcp-journeys-panel"
            class="webmcp-drawer__content webmcp-journeys"
            role="tabpanel"
            aria-labelledby="webmcp-journeys-tab"
          >
            <div class="webmcp-drawer__section-heading">
              <div>
                <h3>Recent journeys</h3>
                <p>Calls are grouped by sequence and stored locally in this browser.</p>
              </div>
            </div>

            <template v-for="journey in journeys" :key="journey.id">
              <WebMCPJourneyCard
                :journey="journey"
                :expanded="expandedJourneyIds.has(journey.id)"
                :replay-state="replayState"
                :active-replay-entry-id="activeReplayEntryId"
                :active-replay-journey-id="effectiveActiveJourneyId"
                @toggle="toggleJourney"
                @review="reviewJourney"
              />

              <section
                v-if="selectedJourneyId === journey.id"
                class="webmcp-replay-confirmation"
                role="region"
                aria-labelledby="replay-confirmation-title"
                tabindex="-1"
                data-testid="replay-confirmation"
              >
                <p class="section-kicker">Explicit replay</p>
                <h3 id="replay-confirmation-title">Run these {{ journey.entries.length }} calls again?</h3>
                <p>
                  ClearDose will execute the saved tool inputs in order. The visible page and shared local state will change after each step.
                </p>
                <p v-if="journey.writeCount" class="webmcp-replay-confirmation__warning">
                  This journey has {{ journey.writeCount }} state-changing {{ journey.writeCount === 1 ? 'call' : 'calls' }}. No checkout or personal fields are included.
                </p>
                <ol>
                  <li v-for="entry in journey.entries" :key="entry.id"><code>{{ entry.toolName }}</code></li>
                </ol>
                <div>
                  <button class="button button--secondary button--small" type="button" @click="selectedJourneyId = null">Cancel</button>
                  <button
                    class="button button--small"
                    type="button"
                    data-testid="confirm-journey-replay"
                    @click="confirmReplay"
                  >
                    Run {{ journey.entries.length }} calls
                  </button>
                </div>
              </section>
            </template>

            <div v-if="!journeys.length" class="webmcp-drawer__empty">
              <span aria-hidden="true">{ }</span>
              <h3>No journeys yet</h3>
              <p>Run a tool from the Agent Lab or a WebMCP-enabled browser. Its redacted context will appear here.</p>
              <RouterLink class="button button--secondary button--small" to="/webmcp" @click="$emit('close')">Open Agent Lab</RouterLink>
            </div>
          </section>

          <section
            v-else
            id="webmcp-calls-panel"
            class="webmcp-drawer__content webmcp-drawer__calls"
            role="tabpanel"
            aria-labelledby="webmcp-calls-tab"
          >
            <div class="webmcp-drawer__section-heading webmcp-drawer__section-heading--split">
              <div>
                <h3>Tool call log</h3>
                <p>Inputs are redacted. Outcomes are bounded before storage.</p>
              </div>
              <button class="button button--text button--small" type="button" :disabled="!activity.entries.length || replayState === 'running'" @click="clearActivity">Clear</button>
            </div>
            <div v-if="activity.entries.length" class="webmcp-drawer__call-list" aria-live="polite">
              <ToolLogEntry v-for="entry in activity.entries.slice(0, 20)" :key="entry.id" :entry="entry" />
            </div>
            <div v-else class="webmcp-drawer__empty">
              <span aria-hidden="true">{ }</span>
              <h3>No calls logged</h3>
              <p>The log records tool name, status, timing, and redacted structured context.</p>
            </div>
          </section>

          <footer class="webmcp-drawer__footer">
            <span>Local demo log. Personal checkout fields are not retained here.</span>
            <RouterLink to="/webmcp" @click="$emit('close')">Open Agent Lab</RouterLink>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
