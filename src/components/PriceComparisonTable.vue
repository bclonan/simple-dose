<script setup lang="ts">
import type { PriceComparison } from '../types/demo-db'
import { formatCurrency, formatDeliveryEstimate } from '../utils/format'

defineProps<{
  options: PriceComparison[]
  selectedOptionId?: string | null
}>()

defineEmits<{ select: [option: PriceComparison] }>()
</script>

<template>
  <div class="comparison-table-wrap">
    <table class="comparison-table">
      <caption class="sr-only">Exact medication fulfillment comparison</caption>
      <thead>
        <tr>
          <th scope="col">Pharmacy</th>
          <th scope="col">Medication</th>
          <th scope="col">Fulfillment</th>
          <th scope="col">Arrival</th>
          <th scope="col">Total</th>
          <th scope="col"><span class="sr-only">Choose option</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="option in options"
          :key="option.optionId"
          :class="{ selected: selectedOptionId === option.optionId }"
          :data-testid="`comparison-${option.optionId}`"
        >
          <th scope="row">
            {{ option.pharmacyName }}
            <span class="table-tags">
              <span v-if="option.isLowestTotal" class="tag tag--accent">Lowest total</span>
              <span v-if="option.isFastest" class="tag">Fastest</span>
            </span>
          </th>
          <td>{{ formatCurrency(option.medicationSubtotal) }}</td>
          <td>{{ option.deliveryLabel }}<br /><small>{{ option.deliveryPrice === 0 ? 'Free' : formatCurrency(option.deliveryPrice) }}</small></td>
          <td>{{ formatDeliveryEstimate(option.estimatedMinDays, option.estimatedMaxDays) }}</td>
          <td class="comparison-table__total">{{ formatCurrency(option.total) }}</td>
          <td>
            <button
              class="button button--small"
              :class="selectedOptionId === option.optionId ? 'button--selected' : 'button--secondary'"
              type="button"
              @click="$emit('select', option)"
            >
              {{ selectedOptionId === option.optionId ? 'Selected' : 'Select' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
