<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCatalogStore } from '../../stores/catalog.store'
import PublicDrugPanel from './PublicDrugPanel.vue'

const props = defineProps<{ medicationId: string }>()
const catalog = useCatalogStore()
const scope = ref<'site' | 'results'>('site')
const finding = ref(false)
const comparing = ref(false)
const searched = ref(false)
const message = ref('')
const matches = ref<Array<{ medicationId: string; name: string; reasons: string[] }>>([])
const comparisonIds = ref<string[]>([])
let requestVersion = 0

const comparisonRows = computed(() => comparisonIds.value.map((medicationId) => ({
  medicationId,
  name: catalog.medicationById(medicationId)?.genericName ?? medicationId,
  record: catalog.publicRecords[medicationId],
})))
const medicationPath = (medicationId: string): string => {
  const medication = catalog.medicationById(medicationId)
  return medication ? `/medications/${encodeURIComponent(medication.slug)}` : '/medications'
}
const showList = (values?: string[]): string => values?.length ? values.join(', ') : 'Unavailable'

watch(() => [props.medicationId, catalog.dataMode], () => {
  requestVersion += 1
  matches.value = []
  comparisonIds.value = []
  searched.value = false
  finding.value = false
  comparing.value = false
  message.value = ''
})

const findRelated = async (): Promise<void> => {
  const version = ++requestVersion
  finding.value = true
  message.value = ''
  comparisonIds.value = []
  try {
    const scopeIds = scope.value === 'results'
      ? catalog.filteredMedications.map((medication) => medication.id)
      : undefined
    const result = await catalog.findRelated(props.medicationId, scopeIds)
    if (version !== requestVersion) return
    matches.value = result.matches
    message.value = result.notice
    searched.value = true
  } catch {
    if (version === requestVersion) {
      matches.value = []
      message.value = 'Related records could not be loaded. Your medication page and existing demo cart are unchanged.'
    }
  } finally {
    if (version === requestVersion) finding.value = false
  }
}

const compare = async (medicationId: string): Promise<void> => {
  const version = ++requestVersion
  comparing.value = true
  message.value = ''
  try {
    const ids = [props.medicationId, medicationId]
    const result = await catalog.compareMedications(ids)
    if (version !== requestVersion) return
    comparisonIds.value = ids
    message.value = result.notice
  } catch {
    if (version === requestVersion) message.value = 'The comparison could not load. Open either medication to inspect its available source data.'
  } finally {
    if (version === requestVersion) comparing.value = false
  }
}
</script>

<template>
  <section class="related-medications" data-testid="related-medications">
    <header class="related-medications__heading">
      <div>
        <p class="section-kicker">Catalog discovery</p>
        <h2>Find related medication records</h2>
        <p>Compare shared catalog categories, forms, ingredients, or classes. A shared attribute does not mean medicines are interchangeable or suitable for the same person.</p>
      </div>
      <div class="related-controls">
        <label>
          <span>Search within</span>
          <select v-model="scope" :disabled="finding || comparing" data-testid="related-scope">
            <option value="site">Loaded site catalog</option>
            <option value="results">Current search results</option>
          </select>
        </label>
        <button class="button button--secondary" type="button" :disabled="finding || comparing" data-testid="find-related" @click="findRelated">
          {{ finding ? 'Finding related records...' : 'Find related records' }}
        </button>
      </div>
    </header>

    <p v-if="message" class="related-message" role="status">{{ message }}</p>
    <p v-if="searched && !matches.length && !finding">No related records were found in this scope. Try the loaded site catalog or search for another medication.</p>
    <ul v-if="matches.length" class="related-list" aria-label="Related medication records">
      <li v-for="match in matches" :key="match.medicationId">
        <div>
          <RouterLink :to="medicationPath(match.medicationId)">{{ match.name }}</RouterLink>
          <ul class="related-reasons"><li v-for="reason in match.reasons" :key="reason">{{ reason }}</li></ul>
        </div>
        <button class="button button--secondary button--small" type="button" :disabled="finding || comparing" @click="compare(match.medicationId)">
          Compare details
        </button>
      </li>
    </ul>

    <p v-if="comparing" role="status">Loading public details for these two records...</p>
    <section v-if="comparisonRows.length" class="related-comparison" data-testid="related-comparison">
      <h3>Medication information comparison</h3>
      <p>This is a reference comparison, not a recommendation to substitute a medicine. Missing label data is unavailable, not a clean safety result.</p>
      <div class="related-table-wrap">
        <table>
          <caption class="sr-only">Public medication attributes for the selected records</caption>
          <thead><tr><th scope="col">Attribute</th><th v-for="row in comparisonRows" :key="row.medicationId" scope="col">{{ row.name }}</th></tr></thead>
          <tbody>
            <tr><th scope="row">Data status</th><td v-for="row in comparisonRows" :key="row.medicationId">{{ row.record?.status ?? 'unavailable' }}</td></tr>
            <tr><th scope="row">Active ingredients</th><td v-for="row in comparisonRows" :key="row.medicationId">{{ showList(row.record?.drug?.activeIngredients) }}</td></tr>
            <tr><th scope="row">Brand names</th><td v-for="row in comparisonRows" :key="row.medicationId">{{ showList(row.record?.drug?.identity.brandNames) }}</td></tr>
            <tr><th scope="row">Forms</th><td v-for="row in comparisonRows" :key="row.medicationId">{{ showList(row.record?.drug?.forms) }}</td></tr>
            <tr><th scope="row">Strengths</th><td v-for="row in comparisonRows" :key="row.medicationId">{{ showList(row.record?.drug?.strengths) }}</td></tr>
            <tr><th scope="row">Routes</th><td v-for="row in comparisonRows" :key="row.medicationId">{{ showList(row.record?.drug?.routes) }}</td></tr>
            <tr><th scope="row">Pharmacologic classes</th><td v-for="row in comparisonRows" :key="row.medicationId">{{ showList(row.record?.drug?.pharmacologicClasses) }}</td></tr>
            <tr><th scope="row">Indications</th><td v-for="row in comparisonRows" :key="row.medicationId">{{ row.record?.drug?.clinical?.indications.length ? 'Label text in details below' : 'Unavailable' }}</td></tr>
            <tr><th scope="row">Warnings / boxed warnings</th><td v-for="row in comparisonRows" :key="row.medicationId">{{ row.record?.drug?.clinical?.warnings.length || row.record?.drug?.clinical?.boxedWarnings.length ? 'Label text in details below' : 'Unavailable' }}</td></tr>
            <tr><th scope="row">Adverse reactions</th><td v-for="row in comparisonRows" :key="row.medicationId">{{ row.record?.drug?.clinical?.adverseReactions.length ? 'Label text in details below' : 'Unavailable' }}</td></tr>
            <tr><th scope="row">Interaction sections</th><td v-for="row in comparisonRows" :key="row.medicationId">{{ row.record?.drug?.clinical?.drugInteractions.length ? 'Label text in details below' : 'Unavailable' }}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="related-comparison__details">
        <details v-for="row in comparisonRows" :key="row.medicationId">
          <summary>All available details for {{ row.name }}</summary>
          <PublicDrugPanel :record="row.record" :loading="catalog.detailLoading[row.medicationId]" @retry="catalog.loadMedication(row.medicationId, 30, undefined, true)" />
        </details>
      </div>
    </section>
  </section>
</template>

<style scoped>
.related-medications { margin-block: 2rem; padding: clamp(1rem, 3vw, 1.75rem); border: 1px solid var(--cd-border); border-radius: 1rem; background: var(--cd-surface); }
.related-medications__heading { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1.25rem; align-items: flex-end; }
.related-medications__heading > div:first-child { flex: 1 1 24rem; }
.related-medications h2 { font-size: 1.35rem; margin-block: .2rem .65rem; }
.related-medications__heading p, .related-message, .related-comparison > p { max-width: 52rem; font-size: .88rem; color: var(--cd-muted-dark); }
.related-controls { display: flex; flex-wrap: wrap; align-items: flex-end; gap: .65rem; }
.related-controls label { display: grid; gap: .35rem; font-size: .8rem; }
.related-controls select { min-height: 2.6rem; border: 1px solid var(--cd-border); border-radius: .5rem; background: white; padding: .5rem; max-width: 100%; }
.related-list { list-style: none; padding: 0; margin: 1.25rem 0 0; }
.related-list > li { padding: 1rem 0; border-top: 1px solid var(--cd-border); display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.related-list a { font-weight: 650; }
.related-reasons { font-size: .82rem; color: var(--cd-muted-dark); padding-left: 1.1rem; margin-top: .35rem; }
.related-comparison { margin-top: 1.75rem; }
.related-table-wrap { overflow-x: auto; max-width: 100%; }
.related-table-wrap table { width: 100%; border-collapse: collapse; min-width: 34rem; font-size: .85rem; }
.related-table-wrap th, .related-table-wrap td { padding: .8rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--cd-border); overflow-wrap: anywhere; }
.related-table-wrap th { background: var(--cd-background); }
.related-table-wrap th:first-child { width: 25%; }
.related-table-wrap td { width: 37.5%; }
.related-comparison__details { margin-top: 1rem; }
.related-comparison__details > details { border-top: 1px solid var(--cd-border); padding-block: .9rem; }
.related-comparison__details summary { font-size: .92rem; font-weight: 650; cursor: pointer; }
@media (max-width: 600px) { .related-list > li { flex-direction: column; } .related-controls { width: 100%; } }
</style>
