<script setup lang="ts">
import type { PriceBreakdown } from '../types/demo-db'
import { formatCurrency } from '../utils/format'

defineProps<{ pricing: PriceBreakdown }>()
</script>

<template>
  <section class="price-breakdown" aria-labelledby="price-breakdown-title">
    <div class="section-kicker">No hidden math</div>
    <h2 id="price-breakdown-title">Transparent price</h2>
    <dl>
      <div>
        <dt>Ingredient / medication cost</dt>
        <dd>{{ formatCurrency(pricing.medicationCost) }}</dd>
      </div>
      <div>
        <dt>Fulfillment fee</dt>
        <dd>{{ formatCurrency(pricing.fulfillmentFee) }}</dd>
      </div>
      <div>
        <dt>Markup</dt>
        <dd>{{ formatCurrency(pricing.markup) }}</dd>
      </div>
      <div class="price-breakdown__total">
        <dt>Medication subtotal</dt>
        <dd>{{ formatCurrency(pricing.medicationSubtotal) }}</dd>
      </div>
    </dl>
  </section>
</template>
