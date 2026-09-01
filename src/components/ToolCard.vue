<script setup lang="ts">
import type { ClearDoseToolDescriptor } from '../webmcp/types'

defineProps<{
  tool: ClearDoseToolDescriptor
  running?: boolean
}>()
defineEmits<{ run: [tool: ClearDoseToolDescriptor] }>()

const accessLabel = (tool: ClearDoseToolDescriptor): string => {
  if (tool.annotations.readOnlyHint) return 'Read'
  if (tool.annotations.destructiveHint) {
    return tool.name === 'remove_cart_item' ? 'Remove' : 'Commit'
  }
  if (tool.annotations.idempotentHint) return 'State'
  return 'Write'
}
</script>

<template>
  <article class="tool-card" :data-testid="`tool-card-${tool.name}`">
    <header>
      <div>
        <span class="tag" :class="tool.annotations.readOnlyHint ? '' : 'tag--write'">
          {{ accessLabel(tool) }}
        </span>
        <h3>{{ tool.title }}</h3>
      </div>
      <code>{{ tool.name }}</code>
    </header>
    <p>{{ tool.description }}</p>
    <details>
      <summary>Input schema</summary>
      <pre>{{ JSON.stringify(tool.inputSchema, null, 2) }}</pre>
    </details>
    <div class="tool-card__example">
      <span>Example input</span>
      <pre>{{ JSON.stringify(tool.exampleInput, null, 2) }}</pre>
    </div>
    <button class="button button--secondary button--small" type="button" :disabled="running" @click="$emit('run', tool)">
      {{ running ? 'Running...' : 'Run example' }}
    </button>
  </article>
</template>
