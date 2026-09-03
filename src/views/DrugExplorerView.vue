<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import DrugComparisonReport from '../components/medications/DrugComparisonReport.vue'
import { drugFactRegistry, drugFactTypes, quickDrugFacts, type DrugFactType } from '../domain/drug-facts'
import { useCatalogStore } from '../stores/catalog.store'
import { MAX_EXPLORER_DRUGS, useDrugExplorerStore } from '../stores/drugExplorer.store'
import type { Medication } from '../types/demo-db'

const catalog = useCatalogStore()
const workspace = useDrugExplorerStore()
const query = ref('')
const searchResults = ref<Medication[]>([])
const searched = ref(false)
const searchError = ref('')
const actionError = ref('')
const copyMessage = ref('')
const selectedFact = ref<DrugFactType>('identity')
const factsLoading = computed(() => workspace.loading || workspace.selectedDrugIds.some(id => catalog.detailLoading[id]))
const busy = computed(() => factsLoading.value || catalog.searchLoading)
const atLimit = computed(() => workspace.selectedDrugIds.length >= MAX_EXPLORER_DRUGS)
const modeDescription = computed(() => catalog.dataMode === 'demo'
  ? 'Demo mode does not request public clinical data. Unavailable facts remain labeled.'
  : catalog.dataMode === 'live'
    ? 'Public records only. Benchmarks are not retail prices or pharmacy availability.'
    : 'Public and cached medication records. Any demo price remains labeled as fictional.')

const dataStatus = (id: string): string => {
  if (catalog.detailLoading[id]) return 'Loading requested facts'
  switch (catalog.publicRecords[id]?.status) {
    case 'live': return 'Public data'
    case 'cache': return 'Cached public data'
    case 'stale-cache': return 'Older cached public data'
    case 'demo': return 'Demo only'
    default: return 'Public data unavailable'
  }
}

const focusCard = async (id: string | null): Promise<void> => {
  if (!id) return
  await nextTick()
  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  if (workspace.focusedCardId !== id) return
  const card = document.getElementById(id)
  card?.focus({ preventScroll: true })
  card?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
}

watch(() => workspace.focusedCardId, id => { void focusCard(id) }, { flush: 'post', immediate: true })
watch(() => catalog.dataMode, () => {
  searchResults.value = []
  searched.value = false
  searchError.value = ''
})

const search = async (): Promise<void> => {
  const term = query.value.trim()
  if (!term || busy.value) return
  searchError.value = ''
  try {
    searchResults.value = await catalog.search(term)
    searched.value = true
  } catch {
    searchResults.value = []
    searchError.value = 'Medication search could not load. Try again or choose another data mode.'
  }
}

const addMedication = async (medication: Medication): Promise<void> => {
  actionError.value = ''
  try {
    await workspace.selectDrugs([medication.id], 'add')
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'This medication could not be added.'
  }
}

const addFact = async (fact: DrugFactType): Promise<void> => {
  actionError.value = ''
  try {
    await workspace.addFactCard(fact)
    await focusCard(workspace.focusedCardId)
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'This fact card could not be added.'
  }
}

const buildReport = async (): Promise<void> => {
  actionError.value = ''
  try {
    await workspace.configureWorkspace({ facts: ['uses', 'side-effects', 'warnings', 'interactions', 'pricing'], factMode: 'replace', focus: false })
    await nextTick()
    const heading = document.getElementById('comparison-report-title')
    heading?.focus({ preventScroll: true })
    heading?.scrollIntoView({ block: 'start', behavior: 'instant' })
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'The report could not load. Available facts remain visible.'
  }
}

const changeFact = (cardId: string, fact: DrugFactType): void => {
  actionError.value = ''
  try { workspace.changeFactCard(cardId, fact) }
  catch (error) { actionError.value = error instanceof Error ? error.message : 'This fact card could not change.' }
}

const changeMode = (event: Event): void => {
  const mode = (event.target as HTMLSelectElement).value
  if (mode === 'live' || mode === 'hybrid' || mode === 'demo') catalog.setDataMode(mode)
}

const clearWorkspace = (): void => {
  workspace.clearWorkspace()
  actionError.value = ''
  copyMessage.value = ''
}

const retryFacts = async (): Promise<void> => {
  actionError.value = ''
  try { await workspace.loadSelected(true) }
  catch { actionError.value = 'The requested facts could not refresh. Available data remains visible.' }
}

const copyLink = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copyMessage.value = 'Workspace link copied.'
  } catch {
    copyMessage.value = 'Copy the workspace link from your browser address bar.'
  }
}
</script>

<template>
  <main id="main-content" class="page-shell drug-explorer" data-testid="drug-explorer">
    <header class="explorer-heading">
      <div>
        <p class="eyebrow">Compare. Understand. Ask informed questions.</p>
        <h1>Drug Explorer</h1>
        <p>A side-by-side medication report, with the facts and sources you need for a conversation with your care team.</p>
      </div>
      <div class="explorer-workspace-actions">
        <button class="button button--secondary button--small" type="button" :disabled="busy || !workspace.selectedDrugIds.length" @click="copyLink">Copy workspace link</button>
        <button class="button button--text button--small" type="button" :disabled="busy || (!workspace.selectedDrugIds.length && !workspace.cards.length)" data-testid="explorer-clear" @click="clearWorkspace">Clear workspace</button>
      </div>
    </header>
    <p v-if="copyMessage" class="explorer-message" role="status">{{ copyMessage }}</p>

    <div class="explorer-builder">
    <section class="explorer-panel explorer-search" aria-labelledby="explorer-search-title">
      <div class="explorer-section-heading">
        <div><p class="explorer-step">Step 1</p><h2 id="explorer-search-title">Choose medications</h2><p>Add up to {{ MAX_EXPLORER_DRUGS }} generic or brand names. Each gets its own report column.</p></div>
        <label class="explorer-mode"><span>Data mode</span><select :value="catalog.dataMode" :disabled="busy" data-testid="explorer-data-mode" @change="changeMode"><option value="hybrid">Hybrid public + demo</option><option value="live">Public data only</option><option value="demo">Deterministic demo</option></select></label>
      </div>
      <form class="explorer-search-form" role="search" aria-label="Find medications for Drug Explorer" @submit.prevent="search">
        <label class="sr-only" for="explorer-medication-query">Search explorer medications</label>
        <input id="explorer-medication-query" v-model="query" type="search" maxlength="120" placeholder="Generic or brand name" autocomplete="off" :disabled="workspace.loading" />
        <button class="button" type="submit" :disabled="busy || !query.trim()">{{ catalog.searchLoading ? 'Searching...' : 'Search medications' }}</button>
      </form>
      <p class="explorer-help">{{ modeDescription }}</p>
      <p v-if="searchError" class="error-banner" role="alert">{{ searchError }}</p>
      <p v-if="catalog.searchLoading" class="explorer-message" role="status">Searching medication names. Full fact data loads only after selection.</p>
      <template v-if="searched && !catalog.searchLoading">
        <p class="explorer-result-count" role="status">{{ searchResults.length }} {{ searchResults.length === 1 ? 'result' : 'results' }}<template v-if="catalog.searchMessage">. {{ catalog.searchMessage }}</template></p>
        <ul v-if="searchResults.length" class="explorer-results" aria-label="Explorer medication search results" data-testid="explorer-search-results">
          <li v-for="medication in searchResults" :key="medication.id">
            <div><strong>{{ medication.genericName }}</strong><span v-if="(medication.publicSummary?.brandNames ?? medication.brandNames).length">{{ (medication.publicSummary?.brandNames ?? medication.brandNames).join(', ') }}</span><span>{{ (medication.publicSummary?.forms ?? medication.forms).join(', ') || 'Form unavailable' }}<template v-if="(medication.publicSummary?.strengths ?? medication.strengths).length"> · {{ (medication.publicSummary?.strengths ?? medication.strengths).join(', ') }}</template></span></div>
            <button class="button button--secondary button--small" type="button" :disabled="busy || atLimit || workspace.selectedDrugIds.includes(medication.id)" :aria-label="`${workspace.selectedDrugIds.includes(medication.id) ? 'Added' : 'Add'} ${medication.genericName}`" @click="addMedication(medication)">{{ workspace.selectedDrugIds.includes(medication.id) ? 'Added' : 'Add' }}</button>
          </li>
        </ul>
        <p v-else class="explorer-empty-search">No exact results found. Try the generic name or another brand name.</p>
      </template>

      <section class="explorer-selection" aria-labelledby="explorer-selection-title">
        <h3 id="explorer-selection-title">Selected medications <span>{{ workspace.selectedDrugIds.length }} / {{ MAX_EXPLORER_DRUGS }}</span></h3>
        <ul v-if="workspace.selectedMedications.length" class="explorer-chips" aria-label="Selected medications" data-testid="explorer-selected">
          <li v-for="medication in workspace.selectedMedications" :key="medication.id"><span>{{ medication.genericName }}</span><button type="button" :aria-label="`Remove ${medication.genericName}`" :disabled="workspace.loading" @click="workspace.removeDrug(medication.id)"><span aria-hidden="true">×</span></button></li>
        </ul>
        <p v-else class="explorer-help">No medications selected. Search above to start a focused comparison.</p>
        <p v-if="atLimit" class="explorer-help" role="status">The workspace holds {{ MAX_EXPLORER_DRUGS }} medications. Remove one to add another.</p>
      </section>
    </section>

    <section class="explorer-panel explorer-facts" aria-labelledby="explorer-facts-title">
      <div class="explorer-section-heading"><div><p class="explorer-step">Step 2</p><h2 id="explorer-facts-title">Choose facts</h2><p>Build a five-topic report, or add just the topics you want.</p></div></div>
      <div class="explorer-report-builder">
        <button class="button" type="button" :disabled="busy || !workspace.selectedDrugIds.length" @click="buildReport">Build comparison report</button>
        <p>Replaces current topics with uses, side effects, warnings, interactions, and public pricing.</p>
      </div>
      <div class="explorer-quick-facts" role="group" aria-label="Quick fact cards">
        <button v-for="fact in quickDrugFacts" :key="fact" class="button button--secondary button--small" :class="{ 'explorer-fact-selected': workspace.cards.some(card => card.factType === fact) }" type="button" :disabled="workspace.loading || !workspace.selectedDrugIds.length" :data-testid="`explorer-add-${fact}`" @click="addFact(fact)"><span v-if="workspace.cards.some(card => card.factType === fact)" aria-hidden="true">✓ </span>{{ drugFactRegistry[fact].label }}</button>
      </div>
      <form class="explorer-fact-picker" @submit.prevent="addFact(selectedFact)">
        <label for="explorer-fact-type">All available facts</label>
        <select id="explorer-fact-type" v-model="selectedFact" :disabled="workspace.loading || !workspace.selectedDrugIds.length"><option v-for="fact in drugFactTypes" :key="fact" :value="fact">{{ drugFactRegistry[fact].label }}</option></select>
        <button class="button button--secondary button--small" type="submit" :disabled="workspace.loading || !workspace.selectedDrugIds.length">Add fact card</button>
      </form>
    </section>
    </div>

    <p v-if="factsLoading" class="explorer-loading" role="status">Loading the selected medication facts...</p>
    <p v-if="workspace.message" class="explorer-message" role="status" data-testid="explorer-message">{{ workspace.message }}</p>
    <p v-if="actionError && actionError !== workspace.message" class="error-banner" role="alert">{{ actionError }}</p>
    <section v-if="workspace.selectedMedications.length" class="explorer-source-summary" aria-label="Selected medication data status">
      <span v-for="medication in workspace.selectedMedications" :key="medication.id"><strong>{{ medication.genericName }}</strong> · {{ dataStatus(medication.id) }}</span>
      <button class="button button--text button--small" type="button" :disabled="factsLoading" data-testid="explorer-retry" @click="retryFacts">Retry requested facts</button>
      <p>Missing facts do not establish safety. Label interactions are not a pairwise interaction check. Do not change medication or dosage based on this workspace.</p>
    </section>

    <section v-if="workspace.cards.length" aria-label="Selected medication fact cards" :aria-busy="factsLoading" data-testid="explorer-cards">
      <DrugComparisonReport :cards="workspace.cards" :drug-ids="workspace.selectedDrugIds" :loading="factsLoading" @change="changeFact" @remove="workspace.removeFactCard($event)" />
    </section>
    <section v-else class="explorer-empty" data-testid="explorer-empty">
      <h2>{{ workspace.selectedDrugIds.length ? 'Your medications are ready to compare' : 'Start with the medicines you want to understand' }}</h2>
      <p>{{ workspace.selectedDrugIds.length ? 'Build a comparison report or choose individual topics above. Read across each row to see the same fact for every medication.' : 'Choose medications above, then build a report. Public facts appear side by side, with source dates and a copy you can download or print.' }}</p>
    </section>
    <p class="explorer-footer-note">Your selected medications and facts stay in the page link. WebMCP tools use this same workspace, so agent changes appear here.</p>
  </main>
</template>

<style scoped>
.drug-explorer { padding-top: clamp(28px, 5vw, 56px); }
.explorer-heading, .explorer-section-heading { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem 1.5rem; }
.explorer-heading { margin-bottom: 1.6rem; }
.explorer-heading > div:first-child { flex: 1 1 28rem; }
.explorer-heading h1 { margin: 0 0 .7rem; font-size: clamp(2.15rem, 4vw, 3.25rem); }
.explorer-heading p:last-child { margin: 0; color: var(--cd-muted-dark); max-width: 42rem; }
.explorer-builder { display: grid; grid-template-columns: 1.15fr 1fr; gap: 1.2rem; align-items: start; }
.explorer-builder .explorer-panel { margin: 0; height: 100%; }
.explorer-section-heading .explorer-step { color: var(--cd-teal-dark); text-transform: uppercase; font-size: .65rem; letter-spacing: .08em; font-weight: 800; margin-bottom: .4rem; }
.explorer-report-builder { margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--cd-border); }
.explorer-report-builder p { margin: .6rem 0 0; font-size: .76rem; line-height: 1.5; color: var(--cd-muted-dark); }
.explorer-quick-facts .button { min-height: 2.25rem; font-size: .75rem; padding: .4rem .6rem; }
.explorer-quick-facts .explorer-fact-selected { background: var(--cd-mint); border-color: var(--cd-mint-strong); color: var(--cd-teal-deep); }
.explorer-workspace-actions { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; }
.explorer-panel { min-width: 0; padding: clamp(1rem, 3vw, 1.5rem); margin-bottom: 1.2rem; border: 1px solid var(--cd-border); border-radius: var(--cd-radius-md); background: var(--cd-surface); box-shadow: var(--cd-shadow-xs); }
.explorer-section-heading { margin-bottom: 1rem; }
.explorer-section-heading h2 { font-size: 1.15rem; margin: 0 0 .35rem; }
.explorer-section-heading p { margin: 0; max-width: 43rem; color: var(--cd-muted-dark); font-size: .85rem; }
.explorer-mode { display: grid; gap: .3rem; font-size: .75rem; flex: 1 1 11rem; min-width: 0; }
.drug-explorer select, .explorer-search-form input { min-height: 2.75rem; border: 1px solid var(--cd-border-strong); border-radius: .6rem; background: white; padding: .6rem .7rem; min-width: 0; max-width: 100%; }
.explorer-mode select { width: 100%; }
.explorer-search-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .65rem; }
.explorer-search-form input { width: 100%; }
.explorer-help, .explorer-result-count, .explorer-message, .explorer-loading { font-size: .83rem; color: var(--cd-muted-dark); }
.explorer-help { margin: .7rem 0 0; }
.explorer-results { margin: .6rem 0 1.2rem; padding: 0; list-style: none; max-height: 21rem; overflow-y: auto; border: 1px solid var(--cd-border); border-radius: .65rem; }
.explorer-results li { display: flex; gap: .85rem; justify-content: space-between; align-items: center; padding: .8rem; }
.explorer-results li + li { border-top: 1px solid var(--cd-border); }
.explorer-results li > div { display: grid; gap: .15rem; min-width: 0; overflow-wrap: anywhere; }
.explorer-results li span { color: var(--cd-muted-dark); font-size: .77rem; }
.explorer-results li button { flex-shrink: 0; }
.explorer-selection { margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--cd-border); }
.explorer-selection h3 { margin: 0 0 .75rem; font-size: .86rem; }
.explorer-selection h3 > span { color: var(--cd-muted); font-weight: 400; margin-left: .5rem; }
.explorer-chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: .6rem; }
.explorer-chips li { display: inline-flex; align-items: center; gap: .4rem; padding: .2rem .3rem .2rem .75rem; border: 1px solid var(--cd-mint-strong); border-radius: 2rem; background: var(--cd-mint); color: var(--cd-teal-deep); font-size: .85rem; min-width: 0; max-width: 100%; }
.explorer-chips li > span { overflow-wrap: anywhere; }
.explorer-chips button { display: grid; place-items: center; flex-shrink: 0; min-height: 2rem; min-width: 2rem; border-radius: 50%; background: transparent; color: var(--cd-teal-deep); font-size: 1.2rem; }
.explorer-chips button:hover { background: var(--cd-mint-strong); }
.explorer-quick-facts { display: flex; flex-wrap: wrap; gap: .55rem; }
.explorer-fact-picker { display: flex; align-items: center; flex-wrap: wrap; gap: .6rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--cd-border); }
.explorer-fact-picker label { font-size: .8rem; color: var(--cd-muted-dark); }
.explorer-fact-picker select { flex: 0 1 17rem; font-size: .84rem; }
.explorer-source-summary { display: flex; flex-wrap: wrap; gap: .55rem 1.2rem; margin: 1.5rem 0 1rem; font-size: .77rem; color: var(--cd-muted-dark); }
.explorer-source-summary p { flex-basis: 100%; margin: .1rem 0; }
.explorer-empty { text-align: center; padding: clamp(2rem, 5vw, 4rem) 1.25rem; border: 1px dashed var(--cd-border-strong); border-radius: var(--cd-radius-md); }
.explorer-empty h2 { font-size: 1.25rem; margin-bottom: .6rem; }
.explorer-empty p { max-width: 40rem; margin: 0 auto; font-size: .9rem; color: var(--cd-muted-dark); }
.explorer-footer-note { margin-top: 1.25rem; color: var(--cd-muted); font-size: .77rem; }
@media (max-width: 900px) { .explorer-builder { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 700px) { .explorer-mode { flex-basis: 100%; } }
@media (max-width: 480px) { .explorer-search-form { grid-template-columns: minmax(0, 1fr); } .explorer-fact-picker { display: grid; grid-template-columns: minmax(0, 1fr); } .explorer-fact-picker select { width: 100%; } }
</style>

<style>
@media print {
  @page { size: landscape; margin: 12mm; }
  body:has(.drug-explorer) { background: white !important; }
  body:has(.drug-explorer) .skip-link,
  .drug-explorer > :not([data-testid='explorer-cards']) { display: none !important; }
  .drug-explorer { padding: 0 !important; max-width: none !important; width: 100% !important; }
}
</style>
