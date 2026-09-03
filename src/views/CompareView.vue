<script setup lang="ts">
import { computed, ref } from 'vue'
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
const actionError = ref('')

const medication = computed(() => selection.medicationId ? catalog.medicationById(selection.medicationId) : undefined)
const sku = computed(() => selection.skuId ? catalog.skuById(selection.skuId) : undefined)
const comparisons = computed(() => sku.value ? pricing.comparisonsForSku(sku.value, selection.maxDeliveryDays ?? undefined) : [])
const deliveryLimits = computed(() => [...new Set([0, 1, 2, 3, 5, 7, 14, 30, ...(selection.maxDeliveryDays === null ? [] : [selection.maxDeliveryDays])])].sort((left, right) => left - right))
const selectedOptionId = computed(() =>
  selection.offerId && selection.deliveryOptionId
    ? `${selection.offerId}:${selection.deliveryOptionId}`
    : null,
)
const selectedOption = computed(() => comparisons.value.find(option => option.optionId === selectedOptionId.value))

const changeDeliveryLimit = (value: string): void => {
  actionError.value = ''
  try {
    selection.setDeliveryLimit(value === '' ? null : Number(value))
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'This delivery window is unavailable.'
  }
}

const select = async (option: PriceComparison): Promise<void> => {
  actionError.value = ''
  try {
    await actions.selectMedicationOption({ offerId: option.offerId, deliveryOptionId: option.deliveryOptionId })
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'This fulfillment option could not be selected. Choose a current option and try again.'
  }
}

const addToCart = (): void => {
  actionError.value = ''
  const option = selectedOption.value
  if (!option) { actionError.value = 'Select a fulfillment option from the comparison before adding it to your cart.'; return }
  try {
    actions.addToCart({ offerId: option.offerId, deliveryOptionId: option.deliveryOptionId })
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'This medication could not be added. Choose a current fulfillment option and try again.'
  }
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

      <p v-if="sku.demoProvenance" class="comparison-notice">{{ sku.demoProvenance.notice }}</p>

      <DemoScenarioSwitch />

      <label class="comparison-delivery-filter">
        <span>Maximum delivery days</span>
        <select :value="selection.maxDeliveryDays ?? ''" @change="changeDeliveryLimit(($event.target as HTMLSelectElement).value)">
          <option value="">Any delivery time</option>
          <option v-for="days in deliveryLimits" :key="days" :value="days">{{ days === 0 ? 'Today' : `Within ${days} ${days === 1 ? 'day' : 'days'}` }}</option>
        </select>
      </label>

      <PriceComparisonTable
        v-if="comparisons.length"
        :options="comparisons"
        :selected-option-id="selectedOptionId"
        @select="select"
      />
      <section v-else class="empty-state">
        <h2>No offers available</h2>
        <p>{{ selection.maxDeliveryDays === null ? 'No fictional pharmacy currently offers this exact SKU.' : 'No fictional fulfillment options match this delivery window. Choose a longer delivery time.' }}</p>
      </section>

      <p v-if="actionError" class="error-banner" role="alert">{{ actionError }}</p>
      <p v-if="!selectedOption && comparisons.length" class="comparison-notice">Select a fulfillment option above to add it to your mock cart. No purchase or prescription is sent.</p>
      <div class="page-actions">
        <RouterLink class="button button--secondary" :to="`/medications/${medication.slug}`">Change configuration</RouterLink>
        <RouterLink v-if="selectedOption" class="button button--secondary" to="/prescription-card">Prepare prescription request</RouterLink>
        <button v-else class="button button--secondary" type="button" disabled>Prepare prescription request</button>
        <button class="button" type="button" :disabled="!selectedOption" data-testid="comparison-add-cart" @click="addToCart">Add selected option to cart</button>
      </div>
    </template>

    <section v-else class="empty-state" data-testid="empty-comparison">
      <h2>Choose a medication first</h2>
      <p>Select an exact form, strength, and quantity before comparing pharmacies.</p>
      <RouterLink class="button" to="/medications">Find a medication</RouterLink>
    </section>

  </main>
</template>

<style scoped>
.comparison-notice { padding: 1rem; border: 1px solid var(--cd-border); border-radius: .75rem; background: var(--cd-mint); color: var(--cd-muted-dark); line-height: 1.6; }
.comparison-delivery-filter { display: grid; gap: .4rem; max-width: 22rem; margin: 1.25rem 0; font-weight: 650; }
</style>
