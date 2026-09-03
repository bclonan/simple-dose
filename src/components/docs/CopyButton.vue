<script setup lang="ts">
import { ref } from 'vue'
const props = withDefaults(defineProps<{ text: string; label?: string }>(), { label: 'Copy prompt' })
const status = ref('')
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.text)
    status.value = 'Copied.'
  } catch { status.value = 'Copy unavailable. Select and copy the text above.' }
}
</script>

<template>
  <span class="docs-copy-control"><button type="button" class="button button--secondary button--small" @click="copy">{{ label }}</button><span role="status">{{ status }}</span></span>
</template>

<style scoped>
.docs-copy-control { display: inline-flex; align-items: center; flex-wrap: wrap; gap: .5rem; }
.docs-copy-control [role='status'] { font-size: .78rem; color: var(--cd-teal-deep); }
@media print { .docs-copy-control { display: none; } }
</style>
