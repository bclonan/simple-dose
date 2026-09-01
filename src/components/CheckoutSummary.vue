<script setup lang="ts">
import type { CartLine } from '../stores/cart.store'
import { formatCurrency } from '../utils/format'

defineProps<{ lines: CartLine[]; total: number }>()
defineEmits<{ changeDelivery: [itemId: string, deliveryId: string] }>()
</script>

<template>
  <section class="checkout-summary" aria-labelledby="order-summary-title">
    <p class="section-kicker">Demo order</p>
    <h2 id="order-summary-title">Order summary</h2>
    <article v-for="line in lines" :key="line.item.id" class="checkout-line">
      <div class="checkout-line__heading">
        <div>
          <h3>{{ line.medication.genericName }}</h3>
          <p>{{ line.sku.strength }} {{ line.sku.form }} · {{ line.sku.quantity }} count</p>
          <p>{{ line.pharmacy.name }}</p>
        </div>
        <strong>{{ formatCurrency(line.pricing.medicationSubtotal) }}</strong>
      </div>
      <fieldset>
        <legend>Delivery</legend>
        <label v-for="delivery in line.offer.deliveryOptions" :key="delivery.id" class="radio-card">
          <input
            type="radio"
            :name="`delivery-${line.item.id}`"
            :value="delivery.id"
            :checked="delivery.id === line.delivery.id"
            @change="$emit('changeDelivery', line.item.id, delivery.id)"
          />
          <span>{{ delivery.label }}</span>
          <strong>{{ delivery.price === 0 ? 'Free' : formatCurrency(delivery.price) }}</strong>
        </label>
      </fieldset>
    </article>
    <dl class="checkout-total">
      <div><dt>Total</dt><dd data-testid="checkout-total">{{ formatCurrency(total) }}</dd></div>
    </dl>
  </section>
</template>
