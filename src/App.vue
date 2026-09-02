<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppDisclaimer from './components/AppDisclaimer.vue'
import AppHeader from './components/AppHeader.vue'
import CartDrawer from './components/CartDrawer.vue'
import WebMCPBadge from './components/WebMCPBadge.vue'
import WebMCPDrawer from './components/WebMCPDrawer.vue'
import { MAX_REPLAY_CALLS, type ReplayState } from './components/webmcpJourneys'
import { router } from './router'
import { useClearDoseActions } from './services/cleardose.actions'
import { useAgentActivityStore } from './stores/agentActivity.store'
import { useWebMcpStore } from './stores/webmcp.store'
import type { AgentActivity } from './types/demo-db'
import {
  clearDoseToolCatalog,
  createClearDoseToolDefinitions,
} from './webmcp/definitions'
import { registerClearDoseTools, type ClearDoseToolRegistration } from './webmcp/register'

const webmcp = useWebMcpStore()
const activity = useAgentActivityStore()
const webmcpDrawerOpen = ref(false)
const replayState = ref<ReplayState>('idle')
const activeReplayEntryId = ref<string | null>(null)
const activeReplayJourneyId = ref<string | null>(null)
const replayError = ref<string | null>(null)
let registration: ClearDoseToolRegistration | undefined
let unmounted = false

const replayActions = useClearDoseActions({ navigate: (path) => router.push(path) })
const replayDefinitions = new Map(
  createClearDoseToolDefinitions(replayActions, 'demo').map((definition) => [
    definition.name,
    definition,
  ]),
)
const neverReplayTools = new Set(['checkout_demo_order'])

const replayJourney = async (entries: AgentActivity[]): Promise<void> => {
  if (replayState.value === 'running' || entries.length === 0) return

  const chronological = [...entries]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
  const originalJourneyId = chronological[0]?.journeyId ?? null
  activeReplayJourneyId.value = originalJourneyId
  replayError.value = null

  if (
    chronological.length > MAX_REPLAY_CALLS ||
    chronological.some(
      (entry) => entry.status !== 'success' || neverReplayTools.has(entry.toolName),
    )
  ) {
    replayState.value = 'error'
    replayError.value = chronological.length > MAX_REPLAY_CALLS
      ? `Replay is limited to ${MAX_REPLAY_CALLS} reviewed calls per journey.`
      : 'This journey contains an unfinished, failed, or checkout call and cannot be replayed.'
    return
  }

  const replayLogJourneyId = activity.beginJourney(
    `Replay: ${chronological[0]?.journeyTitle ?? 'WebMCP journey'}`,
    'demo',
  )
  replayState.value = 'running'

  try {
    for (const entry of chronological) {
      activeReplayEntryId.value = entry.id
      const definition = replayDefinitions.get(entry.toolName)
      if (!definition) throw new Error(`${entry.toolName} is no longer registered.`)
      await definition.execute(entry.input ?? {})
    }
    replayState.value = 'complete'
  } catch (error) {
    replayState.value = 'error'
    replayError.value = error instanceof Error ? error.message : 'Journey replay failed.'
  } finally {
    activity.endJourney(replayLogJourneyId)
  }
}

onMounted(async () => {
  const nextRegistration = await registerClearDoseTools({
    navigate: (path) => router.push(path),
  })
  if (unmounted) nextRegistration.dispose()
  else registration = nextRegistration
})

onBeforeUnmount(() => {
  unmounted = true
  registration?.dispose()
})
</script>

<template>
  <div class="app-frame">
    <AppHeader />
    <RouterView />
    <AppDisclaimer />
    <CartDrawer />
    <WebMCPBadge
      :status="webmcp.status"
      :count="webmcp.registeredToolCount"
      :expected-tool-count="clearDoseToolCatalog.length"
      :expanded="webmcpDrawerOpen"
      @open="webmcpDrawerOpen = true"
    />
    <WebMCPDrawer
      :open="webmcpDrawerOpen"
      :expected-tool-count="clearDoseToolCatalog.length"
      :replay-state="replayState"
      :active-replay-entry-id="activeReplayEntryId"
      :active-replay-journey-id="activeReplayJourneyId"
      :replay-error="replayError"
      @close="webmcpDrawerOpen = false"
      @replay="replayJourney"
    />
  </div>
</template>
