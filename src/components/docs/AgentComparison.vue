<script setup lang="ts">
import { computed, ref } from 'vue'
const progress = ref(0)
const oldSteps = ['Inspect the catalog page', 'Find the search input', 'Type a medication name', 'Read the matching cards', 'Locate the details link', 'Open the medication', 'Read forms and strengths', 'Copy the exact configuration']
const toolSteps = ['Discover tools and argument schemas', 'Call search_medications with a name', 'Call get_medication_details with a returned ID', 'Read structured shopConfigurations']
const oldDone = computed(() => Math.min(progress.value, oldSteps.length))
const toolDone = computed(() => Math.min(Math.floor(progress.value / 2), toolSteps.length))
</script>
<template>
  <section class="comparison" aria-labelledby="agent-comparison-heading">
    <p class="section-kicker">Same goal, different interaction</p><h2 id="agent-comparison-heading">Find an exact medication configuration</h2>
    <p>An interface-reading agent interprets controls and content. A WebMCP agent reads declared names and schemas, sends arguments, and receives IDs for the next call. Moving a card on screen does not change that contract, though tool or data changes still can.</p>
    <p class="comparison__notice">Illustrative walkthrough, not a recorded benchmark. Counts describe this script only. No application tools run here.</p>
    <div class="comparison__columns">
      <article><h3>Screenshot or DOM agent</h3><p>Observe the page, infer the controls, operate them, then inspect again.</p><ol><li v-for="(step, index) in oldSteps" :key="step" :class="{ complete: index < oldDone }">{{ step }} <span v-if="index < oldDone">✓</span></li></ol><p>{{ oldDone > 0 ? Math.min(3, Math.ceil(oldDone / 3)) : 0 }} observations · {{ Math.min(5, Math.max(0, oldDone - Math.min(3, Math.ceil(oldDone / 3)))) }} UI operations · 0 tool calls</p></article>
      <article><h3>WebMCP agent</h3><p>Discover the contract, call it, and use the structured response.</p><ol><li v-for="(step, index) in toolSteps" :key="step" :class="{ complete: index < toolDone }">{{ step }} <span v-if="index < toolDone">✓</span></li></ol><p>0 screenshot observations · 0 UI operations · {{ Math.min(2, Math.max(0, toolDone - 1)) }} tool calls</p></article>
    </div>
    <div class="comparison__controls"><button class="button button--primary button--small" :disabled="progress === 8" @click="progress++">Next illustrative step</button><button class="button button--secondary button--small" @click="progress = 0">Reset illustration</button><span role="status">{{ progress === 8 ? 'Both examples found a configuration. Nothing was selected or purchased.' : `Illustration step ${progress} of 8` }}</span></div>
  </section>
</template>
<style scoped>
.comparison { padding: clamp(1rem, 3vw, 2rem); border: 1px solid var(--cd-border); background: #fff; border-radius: 20px; }
.comparison__columns { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
article { padding: 1.2rem; background: #f4f8fb; border-radius: 14px; min-width: 0; }
article:last-child { background: #eaf8f5; } li { margin: .7rem 0; color: #526a81; } li.complete { color: #0d7067; font-weight: 650; }
.comparison__notice { border-left: 3px solid #168f82; padding-left: .8rem; font-size: .9rem; }
.comparison__controls { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; margin-top: 1rem; }
@media(max-width: 650px) { .comparison__columns { grid-template-columns: 1fr; } }
@media print { .comparison__controls { display: none; } }
</style>
