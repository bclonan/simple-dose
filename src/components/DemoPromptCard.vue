<script setup lang="ts">
defineProps<{
  id: string
  title: string
  prompt: string
  running?: boolean
}>()

defineEmits<{
  copy: [prompt: string]
  replay: [id: string]
}>()
</script>

<template>
  <article class="prompt-card" :data-testid="`prompt-${id}`">
    <div class="prompt-card__icon" aria-hidden="true">✦</div>
    <h3>{{ title }}</h3>
    <p>{{ prompt }}</p>
    <div>
      <button class="button button--text button--small" type="button" @click="$emit('copy', prompt)">Copy prompt</button>
      <button class="button button--secondary button--small" type="button" :disabled="running" @click="$emit('replay', id)">
        {{ running ? 'Replaying...' : 'Replay demo' }}
      </button>
    </div>
  </article>
</template>
