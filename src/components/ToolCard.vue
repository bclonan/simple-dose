<script setup lang="ts">
import CopyButton from './docs/CopyButton.vue'
import type { ToolDocumentation } from '../webmcp/documentation'

defineProps<{
  tool: ToolDocumentation
  running?: boolean
}>()
defineEmits<{ run: [tool: ToolDocumentation] }>()
const json = (value: unknown) => JSON.stringify(value, null, 2)
</script>

<template>
  <article :id="`tool-${tool.name}`" class="tool-card" :data-testid="`tool-card-${tool.name}`">
    <header>
      <div>
        <span class="tag" :class="tool.annotations.readOnlyHint ? '' : 'tag--write'">
          {{ tool.classification }}
        </span>
        <h3>{{ tool.title }}</h3>
      </div>
      <code>{{ tool.name }}</code>
    </header>
    <p>{{ tool.description }}</p>
    <p class="tool-validation" :class="{ 'tool-validation--error': tool.validationErrors.length }">{{ tool.validationErrors.length ? 'Example needs review: ' + tool.validationErrors.join(' ') : 'Example arguments pass the current schema.' }}</p>
    <details>
      <summary>Arguments and input schema</summary>
      <p><strong>Required:</strong> {{ tool.inputSchema.required?.join(', ') || 'None' }}</p>
      <p><strong>Optional:</strong> {{ Object.keys(tool.inputSchema.properties ?? {}).filter(key => !tool.inputSchema.required?.includes(key)).join(', ') || 'None' }}</p>
      <pre>{{ json(tool.inputSchema) }}</pre><p>{{ tool.schemaNotes }}</p>
      <details><summary>Schema sent to the browser</summary><pre>{{ json(tool.nativeSchema) }}</pre></details>
    </details>
    <details><summary>Example arguments and result</summary>
      <p>Schema-valid arguments are not a promise that these IDs exist in your session. Read current IDs before a call.</p>
      <pre>{{ json(tool.exampleInput) }}</pre><CopyButton :text="json(tool.exampleInput)" label="Copy arguments" />
      <h4>Representative result, not a live response</h4><pre>{{ json(tool.exampleResult) }}</pre>
    </details>
    <details><summary>State, errors and source</summary>
      <h4>Application state affected</h4><ul><li v-for="state in tool.stateAffected" :key="state">{{ state }}</li></ul>
      <h4>Errors and recovery</h4><dl><template v-for="error in tool.errors" :key="error.condition"><dt>{{ error.condition }}</dt><dd>{{ error.recovery }}</dd></template></dl>
      <p>Definition module: <code>{{ tool.sourceModule }}</code>. Registration lives in <code>src/App.vue</code>.</p>
    </details>
    <details><summary>Prompt and shortcuts</summary><p>{{ tool.prompt }}</p>
      <div class="tool-card__actions"><CopyButton :text="tool.prompt" /><CopyButton :text="tool.name" label="Copy tool name" /><CopyButton :text="json(tool.exampleInput)" label="Copy arguments" /></div>
    </details>
    <button class="button button--secondary button--small" type="button" :disabled="running || !!tool.validationErrors.length" @click="$emit('run', tool)">
      {{ running ? 'Running...' : tool.safeToRun ? 'Run example' : 'Preview example' }}
    </button>
  </article>
</template>

<style scoped>
.tool-card { min-width: 0; scroll-margin-top: 7rem; }
.tool-card header { flex-wrap: wrap; }
.tool-card code, .tool-card p, .tool-card dd { overflow-wrap: anywhere; }
.tool-card pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 26rem; overflow-y: auto; }
.tool-card details { margin: .75rem 0; }
.tool-card summary { cursor: pointer; font-weight: 650; padding: .35rem 0; }
.tool-card dt { font-weight: 650; margin-top: .7rem; }
.tool-card dd { margin: .25rem 0 0; }
.tool-card__actions { display: flex; gap: .7rem; flex-wrap: wrap; }
.tool-validation { font-size: .8rem; color: var(--cd-teal-deep); }
.tool-validation--error { color: #922c2c; }
@media print { .tool-card button { display: none; } }
</style>
