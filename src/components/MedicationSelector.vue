<script setup lang="ts">
import { medicationFormLabel } from '../utils/medication-presentation'

defineProps<{
  forms: string[]
  strengths: string[]
  quantities: number[]
  form: string
  strength: string
  quantity: number
  demo?: boolean
  notice?: string
}>()

defineEmits<{
  selectForm: [value: string]
  selectStrength: [value: string]
  selectQuantity: [value: number]
}>()
</script>

<template>
  <div class="medication-selector" data-testid="medication-selector">
    <p v-if="demo" class="medication-selector__notice"><strong>Demo configuration</strong><span>{{ notice || 'These options are for simulated shopping, not prescribing or dosing guidance.' }}</span></p>
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
          {{ medicationFormLabel(option) }}
        </button>
        <p v-if="!forms.length" class="medication-selector__empty">No form options available.</p>
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
        <p v-if="!strengths.length" class="medication-selector__empty">No strength options available.</p>
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
        <p v-if="!quantities.length" class="medication-selector__empty">No quantity options available.</p>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.medication-selector, fieldset, .choice-row { min-width: 0; }
.choice-button { max-width: 100%; overflow-wrap: anywhere; text-align: left; }
.medication-selector__notice { display: grid; gap: .25rem; margin: 0; padding-bottom: 1rem; border-bottom: 1px solid var(--cd-border); color: var(--cd-muted-dark); font-size: .78rem; line-height: 1.5; }
.medication-selector__notice strong { color: var(--cd-teal-deep); font-size: .82rem; }
.medication-selector__empty { margin: 0; color: var(--cd-muted); font-size: .8rem; }
@media (max-width: 420px) { .medication-selector { padding: 1rem; } }
</style>
