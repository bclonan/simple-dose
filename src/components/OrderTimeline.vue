<script setup lang="ts">
const props = defineProps<{ currentStatus: string }>()

const steps = [
  { id: 'demo-order-created', label: 'Demo order created' },
  { id: 'prescription-awaiting-provider', label: 'Prescription awaiting provider' },
  { id: 'pharmacy-review', label: 'Pharmacy review' },
  { id: 'prepared', label: 'Prepared' },
  { id: 'shipped', label: 'Shipped' },
]

const currentIndex = steps.findIndex((step) => step.id === props.currentStatus)
</script>

<template>
  <ol class="order-timeline" aria-label="Order status">
    <li
      v-for="(step, index) in steps"
      :key="step.id"
      :class="{ complete: index <= currentIndex, current: index === currentIndex }"
      :aria-current="index === currentIndex ? 'step' : undefined"
    >
      <span class="timeline-dot" aria-hidden="true">{{ index <= currentIndex ? '✓' : '' }}</span>
      <span>{{ step.label }}</span>
    </li>
  </ol>
</template>
