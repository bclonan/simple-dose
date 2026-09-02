<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import MedicationCard from '../components/MedicationCard.vue'
import MedicationSearch from '../components/MedicationSearch.vue'
import { useClearDoseActions } from '../services/cleardose.actions'
import { useCatalogStore } from '../stores/catalog.store'
import { discoveryAttributes } from '../domain/catalog'

const catalog = useCatalogStore()
const actions = useClearDoseActions()
const modeError = ref('')
const discoveryMedications = computed(() => catalog.medications.map(medication => discoveryAttributes(medication, catalog.dataMode !== 'demo')))
const forms = computed(() => [...new Set(discoveryMedications.value.flatMap((medication) => medication.forms.map(form => form.trim().toLowerCase())))])
const strengths = computed(() => [...new Set(discoveryMedications.value.flatMap((medication) => medication.strengths))].sort())
const categories = computed(() => [...new Set(catalog.medications.map((medication) => medication.category))].filter((category) => category && category !== 'uncategorized').sort())
const modeDescription = computed(() => {
  if (catalog.dataMode === 'demo') return 'Deterministic local fixtures. Prices, pharmacies, and checkout are fictional.'
  if (catalog.dataMode === 'live') return 'Public medication records only. Cash prices and pharmacy availability remain unavailable unless a provider supplies them.'
  return 'Public medication information with cached records and explicit demo fallback. Pharmacy offers and checkout remain fictional.'
})

onMounted(async () => {
  if (catalog.searchResultIds !== null || catalog.searchLoading) return
  try {
    await catalog.search(catalog.searchQuery, {
      form: catalog.formFilter || undefined,
      strength: catalog.strengthFilter || undefined,
      rxRequired: catalog.rxFilter === 'all' ? undefined : catalog.rxFilter === 'required',
    })
  } catch {
    modeError.value = 'Public search could not refresh. Try a medication name or switch to hybrid mode for local fallback.'
  }
})

const changeMode = async (event: Event): Promise<void> => {
  modeError.value = ''
  const mode = (event.target as HTMLSelectElement).value
  if (mode !== 'live' && mode !== 'hybrid' && mode !== 'demo') return
  try {
    await catalog.setDataMode(mode)
  } catch {
    modeError.value = 'The data mode could not change. Current results remain available.'
  }
}

const browseCategory = async (category: string): Promise<void> => {
  try {
    await actions.searchMedications({ query: category })
  } catch {
    modeError.value = 'That category could not load. Try searching for a medication name.'
  }
}

const provenance = (medicationId: string): string => {
  const record = catalog.publicRecords[medicationId]
  if (record?.status === 'live') return 'Public source data'
  if (record?.status === 'cache') return 'Cached public source data'
  if (record?.status === 'stale-cache') return 'Older cached public source data'
  if (record?.status === 'demo' || catalog.dataMode === 'demo') return 'Demo catalog fixture'
  return 'Open to inspect sources and available details'
}

const setFilters = (): void => {
  catalog.setFilters(catalog.formFilter, catalog.strengthFilter, catalog.rxFilter)
}
</script>

<template>
  <main id="main-content" class="page-shell medications-page">
    <header class="page-heading page-heading--split">
      <div>
        <p class="eyebrow">{{ catalog.dataMode === 'demo' ? 'Local demo catalog' : 'Public medication catalog' }}</p>
        <h1>Find your exact medication</h1>
        <p>Search generic names, brands, categories, forms, and strengths. Public searches use the medication data providers; your cart stays in this browser.</p>
      </div>
      <span class="catalog-count">{{ catalog.medications.length }} medications</span>
    </header>

    <section class="catalog-data-mode" aria-label="Medication data mode">
      <label><span>Data mode</span><select :value="catalog.dataMode" :disabled="catalog.searchLoading" data-testid="catalog-data-mode" @change="changeMode"><option value="hybrid">Hybrid public + demo fallback</option><option value="live">Public data only</option><option value="demo">Deterministic demo</option></select></label>
      <p>{{ modeDescription }}</p>
    </section>

    <MedicationSearch />

    <nav class="catalog-categories" aria-label="Browse medication categories">
      <button v-for="category in categories" :key="category" class="button button--text button--small" type="button" :disabled="catalog.searchLoading" @click="browseCategory(category)">{{ category.replaceAll('-', ' ') }}</button>
    </nav>

    <p v-if="catalog.searchLoading" class="catalog-search-message" role="status">Searching public and cached medication records...</p>
    <p v-if="catalog.searchMessage" class="catalog-search-message" role="status" data-testid="catalog-search-message">{{ catalog.searchMessage }}</p>
    <p v-if="modeError" class="error-banner" role="alert">{{ modeError }}</p>

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

    <section v-if="catalog.filteredMedications.length" class="medication-grid" aria-label="Medication search results" :aria-busy="catalog.searchLoading">
      <div v-for="medication in catalog.filteredMedications" :key="medication.id" class="catalog-result">
        <MedicationCard :medication="medication" />
        <p class="catalog-result__source">{{ provenance(medication.id) }}</p>
      </div>
    </section>
    <section v-else-if="!catalog.searchLoading" class="empty-state" data-testid="no-results">
      <span class="empty-state__icon" aria-hidden="true">⌕</span>
      <h2>No medications match</h2>
      <p>Try a generic or brand name, or clear one of the filters.</p>
      <button class="button button--secondary" type="button" @click="catalog.clearFilters()">Clear filters</button>
    </section>

  </main>
</template>

<style scoped>
.catalog-data-mode { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem 1.5rem; margin-bottom: 1.25rem; padding: 1rem 1.25rem; background: var(--cd-surface); border: 1px solid var(--cd-border); border-radius: .85rem; }
.catalog-data-mode label { display: grid; gap: .3rem; font-size: .8rem; font-weight: 600; }
.catalog-data-mode select { padding: .5rem .65rem; min-height: 2.6rem; border: 1px solid var(--cd-border); border-radius: .5rem; background: white; max-width: 100%; }
.catalog-data-mode p { flex: 1 1 20rem; margin: 0; color: var(--cd-muted-dark); font-size: .85rem; }
.catalog-categories { display: flex; flex-wrap: wrap; gap: .25rem .65rem; margin-block: .8rem; }
.catalog-search-message { font-size: .87rem; color: var(--cd-muted-dark); padding: .6rem .85rem; background: var(--cd-mint); border-radius: .5rem; }
.catalog-result { min-width: 0; display: flex; flex-direction: column; }
.catalog-result :deep(.medication-card) { flex: 1; }
.catalog-result__source { margin: .45rem .5rem; color: var(--cd-muted-dark); font-size: .74rem; }
</style>
