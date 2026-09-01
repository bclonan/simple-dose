<script setup lang="ts">
import type { PriceComparison } from '../types/demo-db'
import { formatCurrency, formatDeliveryEstimate } from '../utils/format'

defineProps<{
  option: PriceComparison
  selected?: boolean
}>()

defineEmits<{ select: [option: PriceComparison] }>()
</script>

<template>
  <article
    class="fulfillment-card"
    :class="{ 'fulfillment-card--selected': selected }"
    :data-testid="`offer-${option.optionId}`"
  >
    <div class="fulfillment-card__topline">
      <div>
        <h3>{{ option.pharmacyName }}</h3>
        <p>{{ option.deliveryLabel }} · {{ formatDeliveryEstimate(option.estimatedMinDays, option.estimatedMaxDays) }}</p>
      </div>
      <span v-if="option.isLowestTotal" class="tag tag--accent">Lowest total</span>
    </div>
    <dl class="offer-math">
      <div><dt>Medication</dt><dd>{{ formatCurrency(option.medicationSubtotal) }}</dd></div>
      <div><dt>{{ option.deliveryType === 'pickup' ? 'Pickup' : 'Delivery' }}</dt><dd>{{ option.deliveryPrice === 0 ? 'Free' : formatCurrency(option.deliveryPrice) }}</dd></div>
      <div class="offer-math__total"><dt>Delivered total</dt><dd>{{ formatCurrency(option.total) }}</dd></div>
    </dl>
    <div class="tag-row">
      <span v-if="option.isFastest" class="tag">Fastest</span>
      <span v-if="option.deliveryType === 'pickup'" class="tag">Pickup available</span>
    </div>
    <button
      class="button"
      :class="selected ? 'button--selected' : 'button--secondary'"
      type="button"
      :aria-pressed="selected"
      @click="$emit('select', option)"
    >
      {{ selected ? 'Selected' : 'Select option' }}
    </button>
  </article>
</template>
