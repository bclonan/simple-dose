<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OrderTimeline from '../components/OrderTimeline.vue'
import { useCatalogStore } from '../stores/catalog.store'
import { useDemoStore } from '../stores/demo.store'
import { useOrderStore } from '../stores/order.store'
import { formatCurrency, formatDateTime } from '../utils/format'

const route = useRoute()
const router = useRouter()
const catalog = useCatalogStore()
const orders = useOrderStore()
const demo = useDemoStore()
const order = computed(() => orders.orderById(String(route.params.id)))

const orderLines = computed(() =>
  order.value?.items.map((item) => {
    const sku = catalog.skuById(item.skuId)
    const medication = sku ? catalog.medicationById(sku.medicationId) : undefined
    const offer = catalog.offers.find((candidate) => candidate.id === item.offerId)
    const pharmacy = offer ? catalog.pharmacies.find((candidate) => candidate.id === offer.pharmacyId) : undefined
    const delivery = offer?.deliveryOptions.find((candidate) => candidate.id === item.deliveryOptionId)
    return { item, sku, medication, pharmacy, delivery }
  }) ?? [],
)

const reset = (): void => {
  demo.resetAll()
  void router.push('/')
}
</script>

<template>
  <main id="main-content" class="page-shell order-page">
    <template v-if="order">
      <header class="order-confirmation">
        <span class="success-mark" aria-hidden="true">✓</span>
        <p class="eyebrow">Demo order created</p>
        <h1>Order {{ order.id }}</h1>
        <p>No payment or prescription was sent. This confirmation exists only in your browser.</p>
      </header>

      <div class="order-layout">
        <section class="order-status-card">
          <h2>Order status</h2>
          <OrderTimeline :current-status="order.status" />
        </section>

        <section class="order-details-card">
          <h2>Order details</h2>
          <dl>
            <template v-for="line in orderLines" :key="line.item.id">
              <div><dt>Medication</dt><dd>{{ line.medication?.genericName }} · {{ line.sku?.strength }} {{ line.sku?.form }} · {{ line.sku?.quantity }} count</dd></div>
              <div><dt>Selected pharmacy</dt><dd>{{ line.pharmacy?.name }}</dd></div>
              <div><dt>Delivery</dt><dd>{{ line.delivery?.label }}</dd></div>
            </template>
            <div><dt>Order total</dt><dd>{{ formatCurrency(order.total) }}</dd></div>
            <div><dt>Created</dt><dd>{{ formatDateTime(order.createdAt) }}</dd></div>
          </dl>
        </section>
      </div>

      <div class="page-actions">
        <RouterLink class="button button--secondary" to="/medications">Start another order</RouterLink>
        <button class="button button--text" type="button" @click="reset">Reset demo</button>
      </div>
    </template>

    <section v-else class="empty-state" data-testid="unknown-order">
      <h1>Order not found</h1>
      <p>That local demo order does not exist, or the demo was reset.</p>
      <RouterLink class="button" to="/">Return home</RouterLink>
    </section>

  </main>
</template>
