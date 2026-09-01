<script setup lang="ts">
defineProps<{
  forms: string[]
  strengths: string[]
  quantities: number[]
  form: string
  strength: string
  quantity: number
}>()

defineEmits<{
  selectForm: [value: string]
  selectStrength: [value: string]
  selectQuantity: [value: number]
}>()
</script>

<template>
  <div class="medication-selector" data-testid="medication-selector">
    <fieldset>
      <legend>Form</legend>
      <div class="choice-row">
        <button
          v-for="option in forms"
          :key="option"
          class="choice-button"
          :class="{ active: option === form }"
          type="button"
          :aria-pressed="option === form"
          @click="$emit('selectForm', option)"
        >
          {{ option }}
        </button>
      </div>
    </fieldset>

    <fieldset>
      <legend>Strength</legend>
      <div class="choice-row">
        <button
          v-for="option in strengths"
          :key="option"
          class="choice-button"
          :class="{ active: option === strength }"
          type="button"
          :aria-pressed="option === strength"
          :data-testid="`strength-${option.replace(/\s+/g, '-')}`"
          @click="$emit('selectStrength', option)"
        >
          {{ option }}
        </button>
      </div>
    </fieldset>

    <fieldset>
      <legend>Quantity</legend>
      <div class="choice-row">
        <button
          v-for="option in quantities"
          :key="option"
          class="choice-button"
          :class="{ active: option === quantity }"
          type="button"
          :aria-pressed="option === quantity"
          :data-testid="`quantity-${option}`"
          @click="$emit('selectQuantity', option)"
        >
          {{ option }}
        </button>
      </div>
    </fieldset>
  </div>
</template>
