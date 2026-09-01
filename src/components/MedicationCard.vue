<script setup lang="ts">
import { computed } from 'vue'
import type { Medication } from '@/types/demo-db'
import { formatCurrency, toTitleCase } from '@/utils/format'

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
const brandLine = computed(() => {
  const brands = props.medication.brandNames.join(', ')
  return brands ? `Generic for ${brands}` : 'Generic medication'
})
const formLabel = computed(() =>
  props.medication.forms.map((form) => toTitleCase(form)).join(' or '),
)
const strengthLabel = computed(() => props.medication.strengths.join(' · '))
const formattedPrice = computed(() =>
  props.startingPrice === undefined ? null : formatCurrency(props.startingPrice),
)
</script>

<template>
  <article class="medication-card">
    <div class="medication-card__topline">
      <span class="medication-card__category">{{ medication.category.replaceAll('-', ' ') }}</span>
      <span v-if="medication.rxRequired" class="medication-card__rx">Rx</span>
    </div>

    <div class="medication-card__illustration" aria-hidden="true">
      <span class="medication-card__capsule medication-card__capsule--left"></span>
      <span class="medication-card__capsule medication-card__capsule--right"></span>
      <span class="medication-card__initial">{{ medication.genericName.charAt(0) }}</span>
    </div>

    <div class="medication-card__body">
      <h3>{{ medication.genericName }}</h3>
      <p class="medication-card__brand">{{ brandLine }}</p>
      <p class="medication-card__details">
        <span>{{ formLabel }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ strengthLabel }}</span>
      </p>
    </div>

    <div class="medication-card__footer">
      <div v-if="formattedPrice" class="medication-card__price">
        <span>Starting at</span>
        <strong>{{ formattedPrice }}</strong>
      </div>
      <span v-else class="medication-card__price-note">See demo prices</span>
      <RouterLink class="medication-card__link" :to="medicationUrl">
        {{ actionLabel }}
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M4 10h12m-4.5-4.5L16 10l-4.5 4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </RouterLink>
    </div>
  </article>
</template>
