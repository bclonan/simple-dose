<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useAgentActivityStore } from '../stores/agentActivity.store'
import { useWebMcpStore } from '../stores/webmcp.store'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const webmcp = useWebMcpStore()
const activity = useAgentActivityStore()
const closeButton = ref<HTMLButtonElement | null>(null)
let restoreFocus: HTMLElement | null = null

const capabilities = [
  'Search medications',
  'Read medication details',
  'Compare exact prices',
  'Select fulfillment',
  'Prepare a prescription request',
  'Add or remove demo cart items',
  'Select delivery',
  'Complete simulated checkout',
  'Track a demo order',
]

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && props.open) emit('close')
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      closeButton.value?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown)
      restoreFocus?.focus()
    }
  },
)

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open" class="drawer-layer webmcp-drawer-layer">
        <button class="drawer-backdrop" type="button" aria-label="Close WebMCP panel" @click="$emit('close')" />
        <aside class="drawer-panel webmcp-drawer" role="dialog" aria-modal="true" aria-labelledby="webmcp-drawer-title">
          <header class="drawer-header">
            <div>
              <p class="section-kicker">Browser-native tools</p>
              <h2 id="webmcp-drawer-title">Agent capabilities</h2>
            </div>
            <button ref="closeButton" class="icon-button" type="button" aria-label="Close WebMCP panel" @click="$emit('close')">×</button>
          </header>

          <div class="drawer-status" :class="{ supported: webmcp.isReady, degraded: webmcp.status === 'degraded' }">
            <span class="status-dot" aria-hidden="true"></span>
            <div>
              <strong v-if="webmcp.status === 'ready'">{{ webmcp.registeredToolCount }} tools verified</strong>
              <strong v-else-if="webmcp.status === 'ready-unverified'">{{ webmcp.registeredToolCount }} tools registered</strong>
              <strong v-else-if="webmcp.status === 'degraded'">{{ webmcp.registeredToolCount }} of 11 tools verified</strong>
              <strong v-else-if="webmcp.status === 'registering'">Registering tools</strong>
              <strong v-else-if="webmcp.status === 'error'">Registration failed</strong>
              <strong v-else-if="webmcp.status === 'unsupported'">WebMCP unavailable</strong>
              <strong v-else>WebMCP status pending</strong>
              <span v-if="webmcp.status === 'unsupported'">The pharmacy demo still works normally.</span>
              <span v-else-if="webmcp.registrationError">{{ webmcp.registrationError }}</span>
              <span v-else-if="webmcp.status === 'ready-unverified'">This browser cannot verify the registry with getTools.</span>
              <span v-else-if="webmcp.status === 'ready'">These tools share the live ClearDose state.</span>
              <span v-else-if="webmcp.status === 'registering'">Registration is still in progress.</span>
              <span v-else>Registration has not started.</span>
            </div>
          </div>

          <ul class="capability-list">
            <li v-for="capability in capabilities" :key="capability"><span aria-hidden="true">✓</span>{{ capability }}</li>
          </ul>

          <section class="drawer-activity" aria-labelledby="recent-activity-title">
            <div class="drawer-section-heading">
              <h3 id="recent-activity-title">Recent tool activity</h3>
              <span>{{ activity.entries.length }}</span>
            </div>
            <ol v-if="activity.entries.length">
              <li v-for="entry in activity.entries.slice(0, 4)" :key="entry.id">
                <span :class="`activity-dot activity-dot--${entry.status}`" aria-hidden="true"></span>
                <div><strong>{{ entry.toolName }}</strong><small>{{ entry.status }}<template v-if="entry.durationMs !== undefined"> · {{ entry.durationMs }}ms</template></small></div>
              </li>
            </ol>
            <p v-else>No tool calls yet. The Agent Lab has deterministic examples.</p>
          </section>

          <RouterLink class="button button--full" to="/webmcp" @click="$emit('close')">Open Agent Lab</RouterLink>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
