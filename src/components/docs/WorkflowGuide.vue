<script setup lang="ts">
import { documentedWorkflows, featurePrompts } from '../../content/webmcp-workflows'
import CopyButton from './CopyButton.vue'
</script>
<template>
  <section id="prompt-library" aria-labelledby="prompt-library-heading">
    <p class="section-kicker">Start with your goal</p><h2 id="prompt-library-heading">Prompt library</h2><p>Copy a prompt into a WebMCP-capable agent connected to this tab. These examples do not run when copied.</p>
    <div class="goal-grid"><details v-for="item in featurePrompts" :key="item.goal" class="goal-card"><summary>{{ item.goal }} <span>{{ item.level }}</span></summary><p>{{ item.prompt }}</p><p class="goal-support">{{ item.support }}</p><CopyButton :text="item.prompt" /></details></div>
  </section>
  <section id="chained-workflows" class="workflow-section" aria-labelledby="workflow-heading">
    <p class="section-kicker">Pass results forward</p><h2 id="workflow-heading">Five chained workflows</h2><p>Each chain names real tools. Data references below explain the flow; they are not executable expressions or complete tool arguments.</p>
    <details v-for="workflow in documentedWorkflows" :key="workflow.name" class="workflow-card"><summary>{{ workflow.name }}</summary><p>{{ workflow.goal }}</p>
      <ol class="workflow-stepper"><li v-for="(step, index) in workflow.steps" :key="index"><a :href="`#tool-${step.tool}`"><code>{{ step.tool }}</code></a><p>{{ step.outcome }}</p><small>Uses: {{ step.uses.join('; ') || 'No previous result required' }}</small></li></ol>
      <p><strong>Approval boundary.</strong> {{ workflow.approval }}</p><p><strong>If a step fails.</strong> {{ workflow.failure }}</p>
      <p>{{ workflow.prompt }}</p><CopyButton :text="workflow.prompt" />
      <details><summary>Structured workflow</summary><pre>{{ JSON.stringify({ name: workflow.name, steps: workflow.steps }, null, 2) }}</pre><CopyButton :text="JSON.stringify({ name: workflow.name, steps: workflow.steps }, null, 2)" label="Copy workflow" /></details>
    </details>
  </section>
</template>
<style scoped>
section { scroll-margin-top: 7rem; }
.goal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
.goal-card, .workflow-card { padding: 1.1rem 1.3rem; border: 1px solid var(--cd-border); border-radius: 14px; background: #fff; min-width: 0; }
summary { font-weight: 700; cursor: pointer; } summary span { display: block; color: #526a81; font-size: .75rem; font-weight: 500; margin: .3rem 0 0 1rem; }
.goal-support { font-size: .8rem; color: #526a81; overflow-wrap: anywhere; }
.workflow-section { margin-top: 2.5rem; } .workflow-card { margin-bottom: 1rem; }
.workflow-stepper { padding-left: 1.5rem; } .workflow-stepper li { padding: .4rem 0 1rem .6rem; border-left: 2px solid #b7dfd8; margin-left: .3rem; }
.workflow-stepper p { margin: .35rem 0; } code, small { overflow-wrap: anywhere; } pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 24rem; overflow-y: auto; }
@media(max-width: 650px) { .goal-grid { grid-template-columns: 1fr; } }
@media print { details { break-inside: avoid; } }
</style>
