<script setup lang="ts">
import { computed } from 'vue'
import { useCatalogStore } from '../stores/catalog.store'
import type { PrescriptionRequest } from '../types/demo-db'
import { formatCurrency } from '../utils/format'

const props = defineProps<{ request: PrescriptionRequest }>()
const catalog = useCatalogStore()
const medication = computed(() => catalog.medicationById(props.request.medicationId))
const sku = computed(() => catalog.skuById(props.request.skuId))
const demoNotice = computed(() => sku.value?.demoProvenance?.notice ?? 'Fictional demo only. Configuration, quantity, price, and fulfillment are for a mock shopping workflow, not dosing guidance, a pharmacy quote, or verified availability.')
const pharmacy = computed(() =>
  catalog.pharmacies.find((candidate) => candidate.id === props.request.pharmacyId),
)
</script>

<template>
  <article class="prescription-card" data-testid="prescription-request-card">
    <header class="prescription-card__header">
      <div class="brand-mark brand-mark--print"><span>Clear</span>Dose</div>
      <div>
        <p class="eyebrow">Demo prescription request</p>
        <h2>For your prescriber</h2>
      </div>
      <span class="request-id">{{ request.id }}</span>
    </header>

    <dl class="prescription-grid">
      <div><dt>Medication</dt><dd>{{ medication?.genericName }}</dd></div>
      <div><dt>Form</dt><dd>{{ sku?.form }}</dd></div>
      <div><dt>Strength</dt><dd>{{ sku?.strength }}</dd></div>
      <div><dt>Quantity</dt><dd>{{ sku?.quantity }}</dd></div>
      <div class="wide"><dt>Preferred fulfillment</dt><dd>{{ pharmacy?.name }}</dd></div>
      <div class="wide"><dt>Demo estimate</dt><dd class="prescription-card__price">{{ formatCurrency(request.estimatedTotal) }} simulated delivered total</dd></div>
      <div v-if="request.patientName"><dt>Patient name</dt><dd>{{ request.patientName }}</dd></div>
      <div v-if="request.dateOfBirth"><dt>Date of birth</dt><dd>{{ request.dateOfBirth }}</dd></div>
      <div v-if="request.prescriberName"><dt>Prescriber name</dt><dd>{{ request.prescriberName }}</dd></div>
      <div v-if="request.practice"><dt>Practice</dt><dd>{{ request.practice }}</dd></div>
    </dl>

    <section class="pharmacy-destination">
      <p class="eyebrow">Simulated pharmacy destination</p>
      <strong>{{ pharmacy?.name }}</strong>
      <span>Demo fulfillment pharmacy</span>
      <span>Pharmacy ID: {{ pharmacy?.demoPharmacyId }}</span>
    </section>

    <p class="prescription-warning" data-testid="prescription-demo-notice">{{ demoNotice }}</p>
    <p class="prescription-warning">
      This is a prescription request summary, not a prescription. A licensed prescriber must determine whether a medication is appropriate and issue any required prescription.
    </p>
  </article>
</template>
