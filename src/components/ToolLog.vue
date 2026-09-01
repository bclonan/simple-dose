<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useAgentActivityStore } from '../stores/agentActivity.store'
import ToolLogEntry from './ToolLogEntry.vue'

type Filter = 'all' | 'read' | 'write' | 'success' | 'error'

const readTools = new Set([
  'search_medications',
  'get_medication_details',
  'compare_fulfillment_options',
  'view_cart',
  'get_order_status',
])

const activity = useAgentActivityStore()
const filter = ref<Filter>('all')
const list = ref<HTMLElement | null>(null)

const filteredEntries = computed(() =>
  activity.entries.filter((entry) => {
    if (filter.value === 'all') return true
    if (filter.value === 'success' || filter.value === 'error') return entry.status === filter.value
    return filter.value === 'read' ? readTools.has(entry.toolName) : !readTools.has(entry.toolName)
  }),
)

watch(
  () => activity.entries.length,
  async () => {
    await nextTick()
    list.value?.scrollTo({ top: 0, behavior: 'smooth' })
  },
)
</script>

<template>
  <section class="tool-log" aria-labelledby="live-activity-title">
    <header class="tool-log__header">
      <div>
        <p class="section-kicker">Live activity</p>
        <h2 id="live-activity-title">Tool log</h2>
      </div>
      <button class="button button--text button--small" type="button" :disabled="!activity.entries.length" @click="activity.clear()">Clear log</button>
    </header>
    <label class="tool-log__filter">
      <span>Filter activity</span>
      <select v-model="filter" data-testid="activity-filter">
        <option value="all">All</option>
        <option value="read">Read</option>
        <option value="write">Write</option>
        <option value="success">Success</option>
        <option value="error">Error</option>
      </select>
    </label>
    <div ref="list" class="tool-log__list" aria-live="polite">
      <ToolLogEntry v-for="entry in filteredEntries" :key="entry.id" :entry="entry" />
      <div v-if="!filteredEntries.length" class="tool-log__empty">
        <span aria-hidden="true">{ }</span>
        <p>No matching tool activity yet.</p>
      </div>
    </div>
  </section>
</template>
