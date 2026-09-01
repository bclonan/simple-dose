<script setup lang="ts">
import { computed } from 'vue'
import DemoScenarioSwitch from '../components/DemoScenarioSwitch.vue'
import PriceComparisonTable from '../components/PriceComparisonTable.vue'
import { useClearDoseActions } from '../services/cleardose.actions'
import { useCatalogStore } from '../stores/catalog.store'
import { usePricingStore } from '../stores/pricing.store'
import { useSelectionStore } from '../stores/selection.store'
import type { PriceComparison } from '../types/demo-db'

const catalog = useCatalogStore()
const selection = useSelectionStore()
const pricing = usePricingStore()
const actions = useClearDoseActions()

const medication = computed(() => selection.medicationId ? catalog.medicationById(selection.medicationId) : undefined)
const sku = computed(() => selection.skuId ? catalog.skuById(selection.skuId) : undefined)
const comparisons = computed(() => sku.value ? pricing.comparisonsForSku(sku.value) : [])
const selectedOptionId = computed(() =>
  selection.offerId && selection.deliveryOptionId
    ? `${selection.offerId}:${selection.deliveryOptionId}`
    : null,
)

const select = (option: PriceComparison): void => {
  actions.selectMedicationOption({ offerId: option.offerId, deliveryOptionId: option.deliveryOptionId })
}
</script>

<template>
  <main id="main-content" class="page-shell compare-page">
    <header class="page-heading">
      <p class="eyebrow">Apples to apples</p>
      <h1>Compare the exact prescription</h1>
      <p>ClearDose only compares the same active ingredient, form, strength, and quantity. It never suggests a clinical substitution.</p>
    </header>

    <template v-if="medication && sku">
      <section class="comparison-identity">
        <div>
          <span>Active ingredient</span>
          <strong>{{ medication.genericName }}</strong>
        </div>
        <div><span>Form</span><strong>{{ sku.form }}</strong></div>
        <div><span>Strength</span><strong>{{ sku.strength }}</strong></div>
        <div><span>Quantity</span><strong>{{ sku.quantity }} count</strong></div>
      </section>

      <DemoScenarioSwitch />

      <PriceComparisonTable
        v-if="comparisons.length"
        :options="comparisons"
        :selected-option-id="selectedOptionId"
        @select="select"
      />
      <section v-else class="empty-state">
        <h2>No offers available</h2>
        <p>No fictional pharmacy currently offers this exact SKU.</p>
      </section>

      <div class="page-actions">
        <RouterLink class="button button--secondary" :to="`/medications/${medication.slug}`">Change configuration</RouterLink>
        <RouterLink class="button" to="/prescription-card">Prepare prescription request</RouterLink>
      </div>
    </template>

    <section v-else class="empty-state" data-testid="empty-comparison">
      <h2>Choose a medication first</h2>
      <p>Select an exact form, strength, and quantity before comparing pharmacies.</p>
      <RouterLink class="button" to="/medications">Find a medication</RouterLink>
    </section>

  </main>
</template>
