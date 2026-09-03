<script setup lang="ts">
import { computed, ref } from 'vue'
import ComparisonFactCell from './ComparisonFactCell.vue'
import { useDrugFacts } from '../../composables/useDrugFacts'
import { useCatalogStore } from '../../stores/catalog.store'
import { drugFactRegistry, drugFactTypes, isDrugFactType, type DrugFactCard, type DrugFactType } from '../../domain/drug-facts'
import { comparisonFactPresentation, comparisonRowStatus, createComparisonReportHtml, type ComparisonReportInput } from '../../domain/comparison-report'

const props = defineProps<{ cards: DrugFactCard[]; drugIds: string[]; loading: boolean }>()
const emit = defineEmits<{ change: [cardId: string, fact: DrugFactType]; remove: [cardId: string] }>()
const catalog = useCatalogStore()
const { getFact } = useDrugFacts()
const highlight = ref(true)
const expanded = ref(false)
const exportMessage = ref('')
const medications = computed(() => props.drugIds.map(id => {
  const medication = catalog.medicationById(id)
  const identity = catalog.publicRecords[id]?.drug?.identity
  const name = medication?.genericName ?? identity?.genericName ?? id
  const brands = identity?.brandNames ?? medication?.publicSummary?.brandNames ?? medication?.brandNames ?? []
  const distinctNames = [...new Map(brands.map(brand => [brand.toLowerCase(), brand])).values()]
    .filter(brand => !brand.toLowerCase().startsWith(name.toLowerCase()))
  return { id, name, brands: distinctNames }
}))
const rows = computed(() => props.cards.map(card => {
  const fact = getFact(props.drugIds, card.factType)
  return { ...card, fact, presentation: comparisonFactPresentation(card.factType), comparison: comparisonRowStatus(fact.drugs) }
}))
const availableCount = computed(() => rows.value.reduce((sum, row) => sum + row.fact.drugs.filter(drug => drug.hasContent).length, 0))
const totalCount = computed(() => rows.value.length * medications.value.length)
const incompleteCount = computed(() => rows.value.filter(row => row.comparison.kind === 'incomplete').length)
const report = computed<ComparisonReportInput>(() => ({
  title: 'Medication comparison', generatedAt: new Date().toISOString(), medications: medications.value,
  rows: rows.value.map(row => ({ id: row.id, factType: row.factType, cells: row.fact.drugs })),
}))
const reportDate = computed(() => new Date(report.value.generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))

function changeFact(cardId: string, event: Event): void {
  const fact = (event.target as HTMLSelectElement).value
  if (isDrugFactType(fact)) emit('change', cardId, fact)
}
function downloadReport(): void {
  exportMessage.value = ''
  try {
    const snapshot = { ...report.value, generatedAt: new Date().toISOString() }
    const blob = new Blob([createComparisonReportHtml(snapshot)], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `cleardose-comparison-${snapshot.generatedAt.slice(0, 10)}.html`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    exportMessage.value = 'Report downloaded. It is a dated copy, not a live medical record.'
  } catch {
    exportMessage.value = 'The report could not download. Use Print or save PDF instead.'
  }
}
function printReport(): void {
  exportMessage.value = ''
  try { window.print() }
  catch { exportMessage.value = 'Printing is unavailable in this browser. Download the report instead.' }
}
</script>

<template>
  <section class="comparison-report" aria-labelledby="comparison-report-title" data-testid="comparison-report">
    <header class="report-heading">
      <div>
        <p class="report-eyebrow">Your comparison report</p>
        <h2 id="comparison-report-title" tabindex="-1">Medication comparison</h2>
        <p class="report-subtitle">{{ medications.length }} {{ medications.length === 1 ? 'medication' : 'medications' }} · {{ rows.length }} {{ rows.length === 1 ? 'topic' : 'topics' }} · {{ reportDate }}</p>
      </div>
      <div class="report-export-actions report-screen-only">
        <button type="button" class="button button--secondary button--small" :disabled="loading || !medications.length" @click="downloadReport">Download report</button>
        <button type="button" class="button button--small" :disabled="loading || !medications.length" @click="printReport">Print or save PDF</button>
      </div>
    </header>
    <p v-if="exportMessage" class="report-export-message report-screen-only" role="status">{{ exportMessage }}</p>
    <div class="report-reading-guide">
      <strong>Read across a row to compare the same topic.</strong>
      <p>Use this report to prepare questions for your pharmacist or prescriber. It cannot tell you which medicine is right for you. Do not start, stop, or switch a medicine based on this report.</p>
    </div>
    <div class="report-toolbar report-screen-only">
      <div class="report-coverage" role="status"><span class="report-coverage-dot" aria-hidden="true"></span>{{ availableCount }} of {{ totalCount }} requested facts have content<span v-if="incompleteCount"> · {{ incompleteCount }} {{ incompleteCount === 1 ? 'topic needs' : 'topics need' }} a source check</span></div>
      <div class="report-display-controls">
        <label><input v-model="highlight" type="checkbox" /> Highlight differences</label>
        <button type="button" class="button button--text button--small" @click="expanded = !expanded">{{ expanded ? 'Collapse source text' : 'Expand source text' }}</button>
      </div>
    </div>
    <p class="report-legend"><span class="report-highlight-key" aria-hidden="true"></span>Highlighted rows contain different source details. They do not rank benefits, risks, or suitability.</p>
    <p class="report-mobile-help report-screen-only" id="comparison-scroll-help">Scroll sideways to compare all medications. Each column keeps the same medication.</p>
    <div class="comparison-scroll" role="region" aria-label="Scrollable medication comparison" aria-describedby="comparison-scroll-help" tabindex="0" data-testid="comparison-scroll">
      <table class="comparison-table" :style="{ '--medication-count': Math.max(medications.length, 1) }" aria-label="Medication comparison report">
        <caption class="sr-only">{{ medications.map(medication => medication.name).join(' compared with ') }}. Facts are rows and medications are columns.</caption>
        <colgroup><col class="report-topic-column" /><col v-for="medication in medications" :key="medication.id" /></colgroup>
        <thead><tr>
          <th scope="col" class="report-topic-heading">What to compare<span>Selected report topics</span></th>
          <th v-for="(medication, index) in medications" :id="`report-drug-${medication.id}`" :key="medication.id" scope="col" class="report-medication-heading">
            <span class="report-medication-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
            <h3>{{ medication.name }}</h3>
            <p v-if="medication.brands.length" class="report-brand-names">Also listed as {{ medication.brands.slice(0, 2).join(', ') }}<span v-if="medication.brands.length > 2"> + {{ medication.brands.length - 2 }} more names</span></p>
            <span class="report-column-label">{{ catalog.dataMode === 'demo' ? 'Demo reference' : 'Public drug information' }}</span>
          </th>
        </tr></thead>
        <tbody>
          <tr v-for="row in rows" :id="row.id" :key="row.id" tabindex="-1" :aria-labelledby="`${row.id}-title`" data-testid="drug-info-card" :data-fact-type="row.factType" :data-comparison="row.comparison.kind" :class="{ 'is-highlighted': highlight && row.comparison.kind === 'different' }">
            <th :id="`${row.id}-header`" scope="row" class="report-topic-cell">
              <p class="report-source-label">{{ row.fact.sourceLabel }}</p>
              <h3 :id="`${row.id}-title`">{{ drugFactRegistry[row.factType].label }}</h3>
              <p class="report-topic-help">{{ row.presentation.help }}</p>
              <span class="report-difference-label" :data-kind="row.comparison.kind">{{ row.comparison.label }}</span>
              <p v-if="row.fact.notice" class="report-row-notice">{{ row.fact.notice }}</p>
              <div class="report-row-actions report-screen-only">
                <label class="sr-only" :for="`${row.id}-change`">Change {{ row.fact.title }} fact</label>
                <select :id="`${row.id}-change`" :value="row.factType" :disabled="loading" :aria-label="`Change ${row.fact.title} fact`" @change="changeFact(row.id, $event)"><option v-for="fact in drugFactTypes" :key="fact" :value="fact">{{ drugFactRegistry[fact].label }}</option></select>
                <button type="button" class="button button--text button--small" :disabled="loading" :aria-label="`Remove ${row.fact.title} card`" @click="emit('remove', row.id)">Remove topic</button>
              </div>
            </th>
            <td v-for="drug in row.fact.drugs" :key="drug.drugId" :headers="`${row.id}-header report-drug-${drug.drugId}`">
              <ComparisonFactCell :drug="drug" :fact-type="row.factType" :cell-id="`${row.id}-${drug.drugId}`" :expanded="expanded" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <footer class="report-footer">
      <div><p class="report-eyebrow">Take it to your next conversation</p><h3>Questions for your pharmacist or prescriber</h3></div>
      <ul><li>Which benefits and risks matter for my health history?</li><li>Could this medicine affect anything else I take, including supplements?</li><li>What would I actually pay for my prescribed product and quantity?</li></ul>
      <p class="report-footer-note">FDA excerpts are not a complete medication guide. Missing information does not mean no risk. Public acquisition benchmarks are not patient prices. Source dates appear with each topic.</p>
    </footer>
  </section>
</template>

<style scoped>
.comparison-report { --report-rule: #d5e1e7; border: 1px solid var(--report-rule); border-radius: 18px; background: white; box-shadow: 0 8px 30px rgb(16 42 67 / 5%); min-width: 0; overflow: clip; }
.report-heading { display: flex; align-items: center; justify-content: space-between; gap: 1.3rem; flex-wrap: wrap; padding: 1.75rem 1.8rem 1.4rem; border-top: 5px solid var(--cd-teal-dark); }
.report-eyebrow { margin: 0 0 .5rem; color: var(--cd-teal-deep); font-size: .7rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.report-heading h2 { margin: 0; font-size: clamp(1.6rem, 3vw, 2.15rem); line-height: 1.2; letter-spacing: -.04em; scroll-margin-top: 100px; }
.report-subtitle { color: var(--cd-muted-dark); font-size: .82rem; margin: .6rem 0 0; }
.report-export-actions, .report-display-controls { display: flex; align-items: center; flex-wrap: wrap; gap: .6rem; }
.report-export-message { margin: 0 1.8rem 1rem; font-size: .85rem; }
.report-reading-guide { padding: 1rem 1.8rem; background: #edf6f5; border-block: 1px solid #d8eae6; font-size: .9rem; }
.report-reading-guide strong { color: var(--cd-teal-deep); }
.report-reading-guide p { margin: .35rem 0 0; max-width: 80ch; color: #36585a; line-height: 1.6; }
.report-toolbar { padding: .85rem 1.8rem; display: flex; justify-content: space-between; align-items: center; gap: .6rem 1.5rem; flex-wrap: wrap; }
.report-coverage { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem; color: var(--cd-muted-dark); font-size: .78rem; }
.report-coverage-dot { width: 6px; height: 6px; background: var(--cd-muted-dark); border-radius: 50%; }
.report-display-controls label { font-size: .8rem; display: flex; align-items: center; gap: .4rem; min-height: 2.75rem; }
.report-display-controls input { accent-color: var(--cd-teal-dark); height: 1rem; width: 1rem; }
.report-legend { margin: 0; padding: 0 1.8rem 1rem; display: flex; align-items: baseline; gap: .45rem; font-size: .75rem; color: var(--cd-muted-dark); line-height: 1.5; }
.report-highlight-key { width: .7rem; height: .7rem; background: #eaf2fb; border: 1px solid #9ebddc; flex-shrink: 0; }
.report-mobile-help { display: block; margin: 0; padding: 0 1.8rem .8rem; font-size: .75rem; color: var(--cd-muted-dark); }
.comparison-scroll { overflow: auto; max-height: 78vh; border-block: 1px solid var(--report-rule); overscroll-behavior-x: contain; scroll-padding-top: 10rem; }
.comparison-scroll:focus-visible { outline: 3px solid var(--cd-focus); outline-offset: -3px; }
.comparison-table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; min-width: calc(220px + var(--medication-count) * 290px); }
.report-topic-column { width: 220px; }
.comparison-table th, .comparison-table td { padding: 1.3rem; vertical-align: top; text-align: left; border-right: 1px solid var(--report-rule); border-bottom: 1px solid var(--report-rule); overflow-wrap: anywhere; }
.comparison-table th { text-transform: none; letter-spacing: normal; }
.comparison-table tr > :last-child { border-right: 0; }
.comparison-table tbody tr:last-child > * { border-bottom: 0; }
.comparison-table thead th { position: sticky; top: 0; z-index: 3; background: #f0f6f7; border-bottom: 2px solid #c9dedb; }
.comparison-table thead .report-topic-heading { z-index: 4; }
.report-topic-heading { color: var(--cd-muted-dark); font-size: .85rem; }
.report-topic-heading span { display: block; font-size: .72rem; font-weight: 400; margin-top: .4rem; }
.report-medication-number { font-size: .7rem; font-weight: 700; color: var(--cd-teal-dark); margin-bottom: .6rem; display: block; }
.report-medication-heading h3 { font-size: clamp(1.05rem, 1.4vw, 1.3rem); line-height: 1.3; margin: 0; letter-spacing: -.025em; }
.report-brand-names { font-size: .78rem; line-height: 1.5; font-weight: 400; color: var(--cd-muted-dark); margin: .45rem 0; }
.report-column-label { display: block; margin-top: .55rem; color: var(--cd-teal-deep); font-size: .68rem; font-weight: 500; }
.comparison-table .report-topic-cell { background: #f8fafc; font-weight: 400; }
.report-source-label { font-size: .65rem; text-transform: uppercase; letter-spacing: .055em; line-height: 1.5; color: var(--cd-muted-dark); margin: 0 0 .45rem; }
.report-topic-cell h3 { font-size: 1rem; line-height: 1.4; margin: 0 0 .5rem; }
.report-topic-help { font-size: .8rem; line-height: 1.55; color: var(--cd-muted-dark); margin: 0 0 .8rem; }
.report-difference-label { display: inline-block; border: 1px solid #d0dae4; border-radius: .3rem; padding: .28rem .4rem; color: #3e5267; font-size: .65rem; line-height: 1.45; font-weight: 600; }
.report-difference-label[data-kind='different'] { color: #234f7b; background: #eaf2fb; border-color: #bed2e8; }
.report-difference-label[data-kind='incomplete'] { color: #76510b; background: #fff8e6; border-color: #ead7a4; }
.comparison-table .is-highlighted > td { background: #f6f9ff; }
.comparison-table .is-highlighted > th { box-shadow: inset 3px 0 #7fa7cf; }
.comparison-table tr:focus { outline: 2px solid var(--cd-teal); outline-offset: -2px; }
.report-row-notice { font-size: .73rem; line-height: 1.6; color: var(--cd-muted-dark); margin: .85rem 0 0; }
.report-row-actions { margin-top: 1rem; padding-top: .75rem; border-top: 1px solid var(--report-rule); }
.report-row-actions select { width: 100%; min-height: 2.5rem; background: white; border: 1px solid var(--report-rule); border-radius: .35rem; font-size: .75rem; padding: .4rem; color: var(--cd-navy); }
.report-row-actions button { font-size: .72rem; margin-top: .3rem; padding-left: 0; }
.report-footer { padding: 1.5rem 1.8rem; background: #fbfcfc; }
.report-footer h3 { margin: .3rem 0; font-size: 1.05rem; }
.report-footer ul { padding-left: 1.15rem; margin: .85rem 0; color: var(--cd-muted-dark); font-size: .86rem; line-height: 1.75; }
.report-footer-note { font-size: .73rem; line-height: 1.6; color: var(--cd-muted-dark); padding-top: .85rem; border-top: 1px solid var(--report-rule); margin: 1rem 0 0; }
@media (min-width: 701px) { .comparison-table .report-topic-cell, .comparison-table .report-topic-heading { position: sticky; left: 0; z-index: 2; } .comparison-table thead .report-topic-heading { z-index: 4; } }
@media (max-width: 1000px) { .report-mobile-help { display: block; margin: 0; padding: 0 1.3rem .8rem; font-size: .75rem; color: var(--cd-muted-dark); } }
@media (max-width: 700px) { .report-heading, .report-footer { padding: 1.2rem; } .report-reading-guide { padding: 1rem 1.2rem; } .report-toolbar { padding: .7rem 1.2rem; } .report-legend { padding-inline: 1.2rem; } .comparison-table { min-width: calc(175px + var(--medication-count) * 270px); } .report-topic-column { width: 175px; } .comparison-table th, .comparison-table td { padding: 1rem; } .report-export-actions { width: 100%; } .report-export-actions button { flex: 1; } }
@media print {
  .comparison-report { border: 0; box-shadow: none; overflow: visible; }
  .report-screen-only, .report-mobile-help { display: none !important; }
  .report-heading { padding: 0 0 8px; border-top: 2px solid var(--cd-teal-dark); }
  .report-heading h2 { font-size: 19pt; margin-top: 5px; }
  .report-eyebrow { font-size: 7pt; margin: 5px 0 3px; }
  .report-subtitle { font-size: 8pt; margin-top: 4px; }
  .report-reading-guide { padding: 7px 9px; font-size: 8pt; }
  .report-reading-guide p { max-width: none; line-height: 1.35; }
  .report-legend { padding: 6px 0; font-size: 7pt; line-height: 1.3; }
  .comparison-scroll { max-height: none; overflow: visible; border: 0; }
  .comparison-table { min-width: 0; font-size: 9pt; }
  .report-topic-column { width: 18%; }
  .comparison-table th, .comparison-table td { padding: 7px; }
  .comparison-table thead { display: table-header-group; }
  .comparison-table th { position: static !important; }
  .comparison-table tr { break-inside: avoid; }
  .report-topic-heading, .report-topic-cell h3 { font-size: 9pt; }
  .report-medication-heading h3 { font-size: 11pt; }
  .report-medication-number { font-size: 7pt; margin-bottom: 3px; }
  .report-brand-names { font-size: 8pt; margin: 3px 0; line-height: 1.3; }
  .report-column-label, .report-topic-heading span { font-size: 7pt; margin-top: 3px; }
  .report-source-label { font-size: 6.5pt; }
  .report-topic-help, .report-row-notice { font-size: 8pt; line-height: 1.35; margin: 5px 0; }
  .report-difference-label { font-size: 7pt; padding: 2px 4px; }
  .report-footer { padding: 9px 0; break-inside: avoid; }
  .report-footer h3 { font-size: 10pt; margin: 3px 0; }
  .report-footer ul { font-size: 8pt; line-height: 1.4; margin: 5px 0; }
  .report-footer-note { font-size: 7pt; line-height: 1.35; margin: 6px 0 0; padding-top: 5px; }
}
</style>
