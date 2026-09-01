<script setup lang="ts">
import { computed } from 'vue'
import MedicationCard from '../components/MedicationCard.vue'
import MedicationSearch from '../components/MedicationSearch.vue'
import { useCatalogStore } from '../stores/catalog.store'

const catalog = useCatalogStore()
const forms = computed(() => [...new Set(catalog.medications.flatMap((medication) => medication.forms))])
const strengths = computed(() => [...new Set(catalog.medications.flatMap((medication) => medication.strengths))].sort())

const setFilters = (): void => {
  catalog.setFilters(catalog.formFilter, catalog.strengthFilter, catalog.rxFilter)
}
</script>

<template>
  <main id="main-content" class="page-shell medications-page">
    <header class="page-heading page-heading--split">
      <div>
        <p class="eyebrow">Local demo catalog</p>
        <h1>Find your exact medication</h1>
        <p>Search generic names, brands, categories, forms, and strengths. Results stay in your browser.</p>
      </div>
      <span class="catalog-count">{{ catalog.medications.length }} medications</span>
    </header>

    <MedicationSearch />

    <section class="filter-bar" aria-label="Medication filters">
      <label>
        <span>Form</span>
        <select v-model="catalog.formFilter" @change="setFilters">
          <option value="">All forms</option>
          <option v-for="form in forms" :key="form" :value="form">{{ form }}</option>
        </select>
      </label>
      <label>
        <span>Strength</span>
        <select v-model="catalog.strengthFilter" @change="setFilters">
          <option value="">All strengths</option>
          <option v-for="strength in strengths" :key="strength" :value="strength">{{ strength }}</option>
        </select>
      </label>
      <label>
        <span>Prescription</span>
        <select v-model="catalog.rxFilter" @change="setFilters">
          <option value="all">All</option>
          <option value="required">Prescription required</option>
          <option value="not-required">No prescription required</option>
        </select>
      </label>
      <button class="button button--text" type="button" @click="catalog.clearFilters()">Clear filters</button>
    </section>

    <p class="result-count" aria-live="polite">
      {{ catalog.filteredMedications.length }} {{ catalog.filteredMedications.length === 1 ? 'match' : 'matches' }}
      <template v-if="catalog.searchQuery"> for "{{ catalog.searchQuery }}"</template>
    </p>

    <section v-if="catalog.filteredMedications.length" class="medication-grid" aria-label="Medication search results">
      <MedicationCard
        v-for="medication in catalog.filteredMedications"
        :key="medication.id"
        :medication="medication"
      />
    </section>
    <section v-else class="empty-state" data-testid="no-results">
      <span class="empty-state__icon" aria-hidden="true">⌕</span>
      <h2>No medications match</h2>
      <p>Try a generic or brand name, or clear one of the filters.</p>
      <button class="button button--secondary" type="button" @click="catalog.clearFilters()">Clear filters</button>
    </section>

  </main>
</template>
