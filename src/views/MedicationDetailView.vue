<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FulfillmentOptionCard from '../components/FulfillmentOptionCard.vue'
import MedicationSelector from '../components/MedicationSelector.vue'
import PriceBreakdown from '../components/PriceBreakdown.vue'
import { useClearDoseActions } from '../services/cleardose.actions'
import { useCatalogStore } from '../stores/catalog.store'
import { usePricingStore } from '../stores/pricing.store'
import { useSelectionStore } from '../stores/selection.store'
import type { PriceComparison } from '../types/demo-db'
import { formatCurrency } from '../utils/format'

const route = useRoute()
const router = useRouter()
const catalog = useCatalogStore()
const selection = useSelectionStore()
const pricing = usePricingStore()
const actions = useClearDoseActions({ navigate: (path) => router.push(path) })

const medication = computed(() => catalog.medicationBySlug(String(route.params.slug)))
const sku = computed(() => selection.skuId ? catalog.skuById(selection.skuId) : undefined)
const comparisons = computed(() => sku.value ? pricing.comparisonsForSku(sku.value) : [])
const lowest = computed(() => comparisons.value.find((option) => option.isLowestTotal))
const selectedOptionId = computed(() =>
  selection.offerId && selection.deliveryOptionId
    ? `${selection.offerId}:${selection.deliveryOptionId}`
    : null,
)

watch(
  medication,
  (next) => {
    if (next && selection.medicationId !== next.id) selection.initializeMedication(next.id)
  },
  { immediate: true },
)

const updateConfiguration = (key: 'form' | 'strength' | 'quantity', value: string | number): void => {
  if (!medication.value || !selection.form || !selection.strength || !selection.quantity) return
  try {
    selection.setConfiguration({
      medicationId: medication.value.id,
      form: key === 'form' ? String(value) : selection.form,
      strength: key === 'strength' ? String(value) : selection.strength,
      quantity: key === 'quantity' ? Number(value) : selection.quantity,
    })
  } catch {
    // The unavailable state below explains missing exact SKUs without exposing an exception.
  }
}

const select = (option: PriceComparison): void => {
  actions.selectMedicationOption({
    offerId: option.offerId,
    deliveryOptionId: option.deliveryOptionId,
  })
}

const chosenOption = (): PriceComparison | undefined =>
  comparisons.value.find((option) => option.optionId === selectedOptionId.value) ?? lowest.value

const prepareRequest = (): void => {
  const option = chosenOption()
  if (!option) return
  actions.createPrescriptionRequestCard({
    offerId: option.offerId,
    deliveryOptionId: option.deliveryOptionId,
  })
}

const addToCart = (): void => {
  const option = chosenOption()
  if (!option) return
  actions.addToCart({ offerId: option.offerId, deliveryOptionId: option.deliveryOptionId })
}
</script>

<template>
  <main v-if="medication" id="main-content" class="page-shell medication-detail-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <RouterLink to="/medications">Medications</RouterLink><span>/</span><span>{{ medication.genericName }}</span>
    </nav>

    <div class="detail-hero">
      <section>
        <p class="eyebrow">{{ medication.category }}</p>
        <h1>{{ medication.genericName }}</h1>
        <p v-if="medication.brandNames.length" class="generic-for">Generic for {{ medication.brandNames.join(', ') }}</p>
        <span v-if="medication.rxRequired" class="rx-badge">Prescription required</span>

        <MedicationSelector
          v-if="selection.form && selection.strength && selection.quantity"
          :forms="medication.forms"
          :strengths="medication.strengths"
          :quantities="medication.quantityOptions"
          :form="selection.form"
          :strength="selection.strength"
          :quantity="selection.quantity"
          @select-form="updateConfiguration('form', $event)"
          @select-strength="updateConfiguration('strength', $event)"
          @select-quantity="updateConfiguration('quantity', $event)"
        />
      </section>

      <aside v-if="lowest" class="lowest-price-card">
        <p class="section-kicker">Your lowest available price</p>
        <strong>{{ formatCurrency(lowest.medicationSubtotal) }}</strong>
        <span>Medication only</span>
        <p>{{ selection.strength }} {{ selection.form }} · {{ selection.quantity }} count</p>
      </aside>
    </div>

    <div v-if="lowest" class="detail-layout">
      <PriceBreakdown :pricing="lowest.pricing" />
      <section aria-labelledby="fulfillment-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Exact prescription</p>
            <h2 id="fulfillment-title">Fulfillment options</h2>
          </div>
          <span>Demo pricing only. Not a real pharmacy quote.</span>
        </div>
        <div class="fulfillment-grid">
          <FulfillmentOptionCard
            v-for="option in comparisons"
            :key="option.optionId"
            :option="option"
            :selected="selectedOptionId === option.optionId"
            @select="select"
          />
        </div>
      </section>
    </div>

    <section v-else class="empty-state">
      <h2>This exact configuration is unavailable</h2>
      <p>Choose another strength or quantity. ClearDose will never substitute a different medication.</p>
    </section>

    <div v-if="lowest" class="sticky-actions">
      <button class="button button--secondary" type="button" @click="router.push('/compare')">Compare all options</button>
      <button class="button button--secondary" type="button" @click="prepareRequest">Prepare prescription request</button>
      <button class="button" type="button" data-testid="add-selected-to-cart" @click="addToCart">Add selected option to cart</button>
    </div>

  </main>
  <main v-else id="main-content" class="page-shell">
    <section class="empty-state">
      <h1>Medication not found</h1>
      <p>This demo catalog does not contain that medication.</p>
      <RouterLink class="button" to="/medications">Browse medications</RouterLink>
    </section>
  </main>
</template>
