<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FulfillmentOptionCard from '../components/FulfillmentOptionCard.vue'
import MedicationSelector from '../components/MedicationSelector.vue'
import PriceBreakdown from '../components/PriceBreakdown.vue'
import PublicDrugPanel from '../components/medications/PublicDrugPanel.vue'
import RelatedMedications from '../components/medications/RelatedMedications.vue'
import DrugInfoCard from '../components/medications/DrugInfoCard.vue'
import { factLoadOptions, type DrugFactType } from '../domain/drug-facts'
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
const inlineActions = useClearDoseActions()
const lookupLoading = ref(false)
const lookupError = ref('')
const detailFact = ref<DrugFactType | null>('uses')
let lookupVersion = 0

const medication = computed(() => catalog.medicationBySlug(String(route.params.slug)))
const exactSkus = computed(() => medication.value ? catalog.skusForMedication(medication.value.id) : [])
const hasDemoConfigurations = computed(() => exactSkus.value.length > 0)
const commerceEnabled = computed(() => catalog.dataMode !== 'live' && hasDemoConfigurations.value)
const configurationForms = computed(() => [...new Set(exactSkus.value.map((item) => item.form))])
const configurationStrengths = computed(() => [...new Set(exactSkus.value.map((item) => item.strength))])
const configurationQuantities = computed(() => [...new Set(exactSkus.value.map((item) => item.quantity))])
const sku = computed(() => {
  const current = selection.skuId ? catalog.skuById(selection.skuId) : undefined
  return current?.medicationId === medication.value?.id ? current : undefined
})
const comparisons = computed(() => commerceEnabled.value && sku.value ? pricing.comparisonsForSku(sku.value) : [])
const lowest = computed(() => comparisons.value.find((option) => option.isLowestTotal))
const selectedOptionId = computed(() =>
  selection.offerId && selection.deliveryOptionId
    ? `${selection.offerId}:${selection.deliveryOptionId}`
    : null,
)

watch(() => [String(route.params.slug), catalog.dataMode], async () => {
  const version = ++lookupVersion
  lookupError.value = ''
  if (medication.value) return
  lookupLoading.value = true
  try {
    await catalog.loadBySlug(String(route.params.slug))
  } catch {
    if (version === lookupVersion) lookupError.value = 'The public record could not load. Search by generic or brand name to try again.'
  } finally {
    if (version === lookupVersion) lookupLoading.value = false
  }
}, { immediate: true })

const reloadPublicData = async (): Promise<void> => {
  if (!medication.value) return
  try {
    await catalog.loadMedication(medication.value.id, sku.value?.quantity ?? 30, { includeClinical: true, includePrices: true }, true)
  } catch {
    lookupError.value = 'Public details could not refresh. Existing data and your cart are unchanged.'
  }
}

const changeDetailFact = async (fact: DrugFactType) => {
  detailFact.value = fact
  if (medication.value) await catalog.loadMedication(medication.value.id, sku.value?.quantity ?? 30, factLoadOptions([fact]))
}

watch(() => [medication.value?.id, catalog.dataMode, sku.value?.quantity], async () => {
  const current = medication.value
  if (!current) return
  if (commerceEnabled.value && selection.medicationId !== current.id) {
    try {
      selection.initializeMedication(current.id)
    } catch {
      const first = exactSkus.value[0]
      if (first) selection.setConfiguration({ medicationId: first.medicationId, form: first.form, strength: first.strength, quantity: first.quantity })
    }
  }
  await reloadPublicData()
}, { immediate: true })

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
  void inlineActions.selectMedicationOption({
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
        <span v-if="hasDemoConfigurations && medication.rxRequired" class="rx-badge">Prescription required for demo fulfillment</span>
        <span v-else-if="!hasDemoConfigurations" class="rx-badge">Prescription status unavailable</span>

        <MedicationSelector
          v-if="commerceEnabled && sku && selection.form && selection.strength && selection.quantity"
          :forms="configurationForms"
          :strengths="configurationStrengths"
          :quantities="configurationQuantities"
          :form="selection.form"
          :strength="selection.strength"
          :quantity="selection.quantity"
          @select-form="updateConfiguration('form', $event)"
          @select-strength="updateConfiguration('strength', $event)"
          @select-quantity="updateConfiguration('quantity', $event)"
        />
      </section>

      <aside v-if="lowest" class="lowest-price-card">
        <p class="section-kicker">Lowest fictional demo price</p>
        <strong>{{ formatCurrency(lowest.medicationSubtotal) }}</strong>
        <span>Medication only</span>
        <p>{{ selection.strength }} {{ selection.form }} · {{ selection.quantity }} count</p>
      </aside>
    </div>

    <section aria-label="Medication fact workspace" class="detail-fact-workspace">
      <div class="section-heading">
        <div><p class="section-kicker">Choose what to read</p><h2>Medication facts</h2></div>
        <RouterLink class="button button--secondary button--small" :to="{ path: '/drugs/explore', query: { drugs: medication.slug, facts: detailFact ?? 'uses' } }">Compare in Drug Explorer</RouterLink>
      </div>
      <DrugInfoCard v-if="detailFact" :card="{ id: 'detail-fact-card', factType: detailFact, drugIds: [medication.id] }" @change="changeDetailFact" @remove="detailFact = null" />
      <button v-else class="button button--secondary" type="button" @click="changeDetailFact('uses')">Show medication facts</button>
    </section>

    <PublicDrugPanel
      :record="catalog.publicRecords[medication.id]"
      :loading="catalog.detailLoading[medication.id]"
      @retry="reloadPublicData"
    />
    <p v-if="lookupError" class="error-banner" role="status">{{ lookupError }}</p>

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

    <section v-else-if="commerceEnabled" class="empty-state">
      <h2>This exact demo configuration is unavailable</h2>
      <p>Choose another strength or quantity. ClearDose will never substitute a different medication.</p>
    </section>
    <section v-else class="empty-state empty-state--compact" data-testid="public-only-fulfillment">
      <h2>{{ catalog.dataMode === 'live' ? 'Live mode does not include fictional fulfillment' : 'No pharmacy fulfillment data' }}</h2>
      <p>Public medication information and benchmarks do not establish cash prices or pharmacy inventory. No cart option is available for this record in the current mode.</p>
    </section>

    <div v-if="lowest" class="sticky-actions">
      <button class="button button--secondary" type="button" @click="router.push('/compare')">Compare all options</button>
      <button class="button button--secondary" type="button" @click="prepareRequest">Prepare prescription request</button>
      <button class="button" type="button" data-testid="add-selected-to-cart" @click="addToCart">Add selected option to cart</button>
    </div>

    <RelatedMedications :medication-id="medication.id" />

  </main>
  <main v-else id="main-content" class="page-shell">
    <section v-if="lookupLoading" class="empty-state" role="status">
      <h1>Loading medication</h1>
      <p>Checking public and cached records for this medication.</p>
    </section>
    <section v-else class="empty-state">
      <h1>Medication not found</h1>
      <p>{{ lookupError || 'This medication is not in the loaded catalog. Search by its generic or brand name to load an available public record.' }}</p>
      <RouterLink class="button" to="/medications">Browse medications</RouterLink>
    </section>
  </main>
</template>
