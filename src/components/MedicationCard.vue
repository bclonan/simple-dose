<script setup lang="ts">
import { computed } from 'vue'
import type { Medication } from '@/types/demo-db'
import { formatCurrency } from '@/utils/format'
import { compactMedicationLabels, medicationBrandLabels, medicationCategoryLabel, medicationFormLabel, medicationNameLabel, uniqueMedicationLabels } from '../utils/medication-presentation'
import { useCatalogStore } from '../stores/catalog.store'
import { usePricingStore } from '../stores/pricing.store'

const props = withDefaults(
  defineProps<{
    medication: Medication
    startingPrice?: number
    actionLabel?: string
  }>(),
  {
    startingPrice: undefined,
    actionLabel: 'View medication',
  },
)

const medicationUrl = computed(() => `/medications/${encodeURIComponent(props.medication.slug)}`)
const catalog = useCatalogStore()
const pricing = usePricingStore()
const publicSummary = computed(() => catalog.dataMode !== 'demo' || props.medication.publicOnly ? props.medication.publicSummary : undefined)
const displayName = computed(() => medicationNameLabel(props.medication.genericName))
const brands = computed(() => medicationBrandLabels(props.medication.genericName, publicSummary.value?.brandNames ?? props.medication.brandNames))
const brandLine = computed(() => {
  return brands.value.length ? `Listed brands: ${compactMedicationLabels(brands.value, 3)}` : 'No distinct brand names listed'
})
const forms = computed(() => uniqueMedicationLabels(publicSummary.value?.forms ?? props.medication.forms).map(medicationFormLabel))
const strengths = computed(() => uniqueMedicationLabels(publicSummary.value?.strengths ?? props.medication.strengths))
const demoPrice = computed(() => {
  if (props.startingPrice !== undefined && Number.isFinite(props.startingPrice) && props.startingPrice >= 0) return props.startingPrice
  const skuIds = new Set(catalog.skusForMedication(props.medication.id).map(sku => sku.id))
  const prices = catalog.offers.filter(offer => skuIds.has(offer.skuId) && offer.available)
    .map(offer => pricing.pricingForOffer(offer).medicationSubtotal).filter(price => Number.isFinite(price) && price >= 0)
  return prices.length ? Math.min(...prices) : undefined
})
const formattedPrice = computed(() => demoPrice.value === undefined ? null : formatCurrency(demoPrice.value))
</script>

<template>
  <article class="medication-card">
    <div class="medication-card__topline">
      <span class="medication-card__category">{{ medicationCategoryLabel(medication.category) }}</span>
      <div class="medication-card__badges">
        <span v-if="medication.rxRequired && !medication.publicOnly" class="medication-card__rx" aria-label="Prescription required">Rx</span>
        <span v-if="medication.publicSource && (catalog.dataMode !== 'demo' || medication.publicOnly)" class="medication-card__reference">Public data</span>
      </div>
    </div>

    <div class="medication-card__illustration" aria-hidden="true">
      <span class="medication-card__capsule medication-card__capsule--left"></span>
      <span class="medication-card__capsule medication-card__capsule--right"></span>
      <span class="medication-card__initial">{{ displayName.charAt(0) }}</span>
    </div>

    <div class="medication-card__body">
      <h3>{{ displayName }}</h3>
      <p class="medication-card__brand" :title="brands.join(', ')">{{ brandLine }}</p>
      <dl class="medication-card__details">
        <div><dt>Form</dt><dd :title="forms.join(' · ')">{{ compactMedicationLabels(forms, 2) || 'Not listed in source' }}</dd></div>
        <div><dt>Strength</dt><dd :title="strengths.join(' · ')">{{ compactMedicationLabels(strengths, 3) || 'Not listed in source' }}</dd></div>
      </dl>
    </div>

    <div class="medication-card__footer">
      <div v-if="formattedPrice" class="medication-card__price">
        <span>Demo price from</span>
        <strong>{{ formattedPrice }}</strong>
        <small>Simulated fulfillment</small>
      </div>
      <span v-else class="medication-card__price-note">Demo price unavailable</span>
      <RouterLink class="medication-card__link" :to="medicationUrl">
        {{ actionLabel }}
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M4 10h12m-4.5-4.5L16 10l-4.5 4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </RouterLink>
    </div>
  </article>
</template>

<style scoped>
.medication-card { height: 100%; }
.medication-card__topline { align-items: flex-start; flex-wrap: wrap; gap: .5rem .75rem; }
.medication-card__category { flex: 1 1 7rem; max-width: none; padding-top: .35rem; white-space: normal; overflow-wrap: anywhere; }
.medication-card__badges { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
.medication-card__reference { display: inline-flex; min-height: 27px; align-items: center; padding: .25rem .55rem; border: 1px solid #cae8e3; border-radius: 8px; background: var(--cd-mint); color: var(--cd-teal-deep); font-family: inherit; font-size: .68rem; font-weight: 700; line-height: 1; white-space: nowrap; }
.medication-card__illustration { flex: 0 0 110px; }
.medication-card__body h3 { font-size: 1.15rem; line-height: 1.25; }
.medication-card__brand { overflow-wrap: anywhere; line-height: 1.5; }
.medication-card__details { display: grid; gap: .5rem; margin-top: 0; }
.medication-card__details > div { display: grid; grid-template-columns: 3.6rem minmax(0, 1fr); gap: .35rem; }
.medication-card__details dt { font-size: .67rem; font-weight: 700; color: var(--cd-muted-dark); }
.medication-card__details dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.medication-card__footer { flex-wrap: wrap; align-items: flex-end; }
.medication-card__price small { display: block; margin-top: .3rem; color: var(--cd-muted); font-size: .62rem; }
.medication-card__link { margin-left: auto; min-height: 36px; white-space: normal; }
.medication-card__link svg { flex: 0 0 17px; }
@media (max-width: 380px) { .medication-card__footer { flex-direction: row; } }
</style>
