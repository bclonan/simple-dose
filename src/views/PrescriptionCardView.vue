<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PrescriptionRequestCard from '../components/PrescriptionRequestCard.vue'
import { useClearDoseActions } from '../services/cleardose.actions'
import { useCatalogStore } from '../stores/catalog.store'
import { usePrescriptionStore } from '../stores/prescription.store'
import { usePricingStore } from '../stores/pricing.store'
import { useSelectionStore } from '../stores/selection.store'
import { formatCurrency } from '../utils/format'

const router = useRouter()
const catalog = useCatalogStore()
const selection = useSelectionStore()
const pricing = usePricingStore()
const prescriptions = usePrescriptionStore()
const actions = useClearDoseActions({ navigate: (path) => router.push(path) })
const copyStatus = ref('')
const actionError = ref('')

const optionalFields = reactive({
  patientName: prescriptions.latestRequest?.patientName ?? '',
  dateOfBirth: prescriptions.latestRequest?.dateOfBirth ?? '',
  prescriberName: prescriptions.latestRequest?.prescriberName ?? '',
  practice: prescriptions.latestRequest?.practice ?? '',
})

// Tool calls replace the authoritative request even when this route stays open.
// Watch the object, since a later request can retain the same display ID.
watch(() => prescriptions.latestRequest, (request) => {
  optionalFields.patientName = request?.patientName ?? ''
  optionalFields.dateOfBirth = request?.dateOfBirth ?? ''
  optionalFields.prescriberName = request?.prescriberName ?? ''
  optionalFields.practice = request?.practice ?? ''
  copyStatus.value = ''
})

const selectedSku = computed(() => selection.skuId ? catalog.skuById(selection.skuId) : undefined)
const selectedOption = computed(() => {
  if (!selectedSku.value) return undefined
  const comparisons = pricing.comparisonsForSku(selectedSku.value)
  return comparisons.find(
    (option) =>
      option.offerId === selection.offerId &&
      option.deliveryOptionId === selection.deliveryOptionId,
  ) ?? comparisons.find((option) => option.isLowestTotal)
})

const generate = async (): Promise<void> => {
  actionError.value = ''
  const option = selectedOption.value
  if (!option) { actionError.value = 'Choose an available fulfillment option before preparing a request.'; return }
  try {
    await actions.createPrescriptionRequestCard({ offerId: option.offerId, deliveryOptionId: option.deliveryOptionId, ...optionalFields })
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'The demo request could not be prepared. Choose a current fulfillment option and try again.'
  }
}

const cardText = computed(() => {
  const request = prescriptions.latestRequest
  if (!request) return ''
  const medication = catalog.medicationById(request.medicationId)
  const sku = catalog.skuById(request.skuId)
  const pharmacy = catalog.pharmacies.find((candidate) => candidate.id === request.pharmacyId)
  return [
    'CLEARDOSE DEMO PRESCRIPTION REQUEST',
    'For your prescriber',
    sku?.demoProvenance?.notice ?? 'Fictional demo only. Configuration, quantity, price, and fulfillment are for a mock shopping workflow, not dosing guidance, a pharmacy quote, or verified availability.',
    `Medication: ${medication?.genericName ?? ''}`,
    `Form: ${sku?.form ?? ''}`,
    `Strength: ${sku?.strength ?? ''}`,
    `Quantity: ${sku?.quantity ?? ''}`,
    `Demo estimate: ${formatCurrency(request.estimatedTotal)} simulated delivered total`,
    `Simulated pharmacy destination: ${pharmacy?.name ?? ''}`,
    `Demo pharmacy ID: ${pharmacy?.demoPharmacyId ?? ''}`,
    'This is a prescription request summary, not a prescription.',
  ].join('\n')
})

const copyRequest = async (): Promise<void> => {
  if (!cardText.value) return
  try {
    await navigator.clipboard.writeText(cardText.value)
    copyStatus.value = 'Request copied.'
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = cardText.value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.append(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
    copyStatus.value = 'Request copied.'
  }
}

const addToCart = (): void => {
  actionError.value = ''
  const request = prescriptions.latestRequest
  if (!request) { actionError.value = 'Prepare a request before adding its medication to the cart.'; return }
  try {
    actions.addToCart({ offerId: request.offerId, deliveryOptionId: request.deliveryOptionId })
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'This request could not be added to the cart. Choose a current fulfillment option and update the request.'
  }
}

const printRequest = (): void => window.print()
</script>

<template>
  <main id="main-content" class="page-shell prescription-page">
    <header class="page-heading page-heading--split no-print">
      <div>
        <p class="eyebrow">Clear handoff</p>
        <h1>Prescription request card</h1>
        <p>Prepare a concise summary for a licensed prescriber. All fields stay in this browser.</p>
      </div>
      <span class="local-only-badge">Local only</span>
    </header>

    <template v-if="selectedSku || prescriptions.latestRequest">
      <section class="optional-details no-print" aria-labelledby="optional-details-title">
        <div>
          <p class="section-kicker">Optional demo fields</p>
          <h2 id="optional-details-title">Add context for the printout</h2>
          <p>Leave these blank if you do not want to enter personal information.</p>
        </div>
        <div class="form-grid">
          <label><span>Patient name</span><input v-model="optionalFields.patientName" autocomplete="off" /></label>
          <label><span>Date of birth</span><input v-model="optionalFields.dateOfBirth" type="date" autocomplete="off" /></label>
          <label><span>Prescriber name</span><input v-model="optionalFields.prescriberName" autocomplete="off" /></label>
          <label><span>Practice</span><input v-model="optionalFields.practice" autocomplete="off" /></label>
        </div>
        <button class="button button--secondary" type="button" @click="generate">
          {{ prescriptions.latestRequest ? 'Update request card' : 'Generate request card' }}
        </button>
      </section>

      <PrescriptionRequestCard
        v-if="prescriptions.latestRequest"
        :request="prescriptions.latestRequest"
      />
      <section v-else class="empty-state no-print">
        <h2>Ready to prepare</h2>
        <p>Generate the card for your selected exact medication and fulfillment option.</p>
        <button class="button" type="button" data-testid="generate-request" @click="generate">Generate request card</button>
      </section>

      <p v-if="actionError" class="error-banner no-print" role="alert">{{ actionError }}</p>
      <div v-if="prescriptions.latestRequest" class="page-actions no-print">
        <button class="button button--secondary" type="button" @click="copyRequest">Copy request</button>
        <button class="button button--secondary" type="button" @click="printRequest">Print / Save PDF</button>
        <button class="button" type="button" data-testid="prescription-add-cart" @click="addToCart">Add medication to cart</button>
      </div>
      <p class="sr-only" aria-live="polite">{{ copyStatus }}</p>
    </template>

    <section v-else class="empty-state no-print">
      <h2>No medication selected</h2>
      <p>Choose an exact medication configuration and pharmacy before creating a request.</p>
      <RouterLink class="button" to="/medications">Find a medication</RouterLink>
    </section>

  </main>
</template>
