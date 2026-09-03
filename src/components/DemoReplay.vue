<script setup lang="ts">
export interface ReplayStep {
  name: string
  label: string
  status: 'pending' | 'running' | 'complete' | 'error'
}

defineProps<{
  title: string
  steps: ReplayStep[]
  state: 'idle' | 'running' | 'complete' | 'error'
}>()

defineEmits<{ reset: [] }>()
</script>

<template>
  <section v-if="state !== 'idle'" class="demo-replay" aria-labelledby="replay-title" data-testid="demo-replay">
    <header>
      <div>
        <p class="section-kicker">Programmatic replay</p>
        <h2 id="replay-title">{{ title }}</h2>
      </div>
      <span class="replay-state" :class="`replay-state--${state}`">{{ state }}</span>
    </header>
    <ol>
      <li v-for="(step, index) in steps" :key="`${index}-${step.name}`" :class="`replay-step--${step.status}`">
        <span aria-hidden="true">{{ step.status === 'complete' ? '✓' : step.status === 'running' ? '→' : step.status === 'error' ? '!' : '○' }}</span>
        <div><strong>{{ step.label }}</strong><code>{{ step.name }}</code></div>
      </li>
    </ol>
    <button v-if="state !== 'running'" class="button button--text" type="button" @click="$emit('reset')">Reset replay</button>
  </section>
</template>
