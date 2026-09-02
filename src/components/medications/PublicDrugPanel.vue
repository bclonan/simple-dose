<script setup lang="ts">
import { computed } from 'vue'
import type {
  ClearDoseDrug,
  DrugClinical,
  DrugPriceKind,
  SourceStamp,
} from '../../../cleardose-data-plugin/src/types'
import { formatCurrency } from '../../utils/format'
import { drugFactRegistry, drugPriceKinds, drugSourceNames, factDate, factMoney, selectClinicalItems, selectFactSource } from '../../domain/drug-facts'

const props = withDefaults(defineProps<{
  record?: {
    drug?: ClearDoseDrug
    status: 'live' | 'cache' | 'stale-cache' | 'demo' | 'unavailable'
    message?: string
  }
  loading?: boolean
}>(), { loading: false })
defineEmits<{ retry: [] }>()

const drug = computed(() => props.record?.drug)
const statusLabel = computed(() => {
  switch (props.record?.status) {
    case 'live': return 'Public data loaded'
    case 'cache': return 'Cached public data'
    case 'stale-cache': return 'Older cached public data'
    case 'demo': return 'Demo fallback'
    default: return 'Public data unavailable'
  }
})

const sections: Array<{ key: keyof DrugClinical; title: string; note?: string }> = [
  { key: 'indications', title: 'FDA indications' },
  { key: 'contraindications', title: 'Contraindications' },
  { key: 'warnings', title: drugFactRegistry.warnings.label },
  { key: 'boxedWarnings', title: drugFactRegistry['boxed-warnings'].label },
  { key: 'adverseReactions', title: 'Side effects and adverse reactions' },
  {
    key: 'drugInteractions',
    title: 'Drug interaction label sections',
    note: drugFactRegistry.interactions.notice,
  },
  { key: 'clinicalPharmacology', title: drugFactRegistry['clinical-pharmacology'].label },
  { key: 'pregnancy', title: drugFactRegistry.pregnancy.label },
  { key: 'pediatricUse', title: drugFactRegistry.pediatric.label },
  { key: 'geriatricUse', title: drugFactRegistry.geriatric.label },
  { key: 'dosageAndAdministration', title: 'Dosage and administration' },
]

const priceKinds = (Object.keys(drugPriceKinds) as DrugPriceKind[]).map(kind => ({ kind, title: drugPriceKinds[kind].label, note: drugPriceKinds[kind].notice }))
const priceGroups = computed(() => priceKinds.map((group) => ({
  ...group,
  quotes: drug.value?.prices.filter((price) => price.kind === group.kind) ?? [],
})))

const sourceName = (source: SourceStamp): string => selectFactSource(source).label
const sourceUrl = (source: SourceStamp): string | undefined => selectFactSource(source).url
const dateLabel = factDate
const sectionItems = (field: keyof DrugClinical): string[] => drug.value ? selectClinicalItems(drug.value, field) : []
const list = (items?: string[]): string => items?.filter(Boolean).join(', ') || 'Unavailable from this record'
const unitCurrency = (amount: number): string => factMoney(amount, true)
</script>

<template>
  <section class="public-drug-panel" data-testid="public-drug-panel" :aria-busy="loading">
    <header class="public-drug-panel__heading">
      <div>
        <p class="section-kicker">Medication reference</p>
        <h2>Public medication information</h2>
      </div>
      <span class="tag" :class="{ 'tag--accent': record?.status === 'live' || record?.status === 'cache' }" data-testid="public-data-status">
        {{ loading ? 'Loading public sources...' : statusLabel }}
      </span>
    </header>
    <button class="button button--text button--small" type="button" :disabled="loading" data-testid="retry-public-data" @click="$emit('retry')">Retry public data</button>
    <p v-if="record?.message" class="public-data-message" role="status">{{ record.message }}</p>
    <details v-if="drug?.warnings?.length" class="public-provider-warnings" data-testid="provider-warnings">
      <summary>{{ drug.warnings.length }} source {{ drug.warnings.length === 1 ? 'notice' : 'notices' }}</summary>
      <ul><li v-for="(warning, index) in drug.warnings" :key="`${warning.source}-${warning.code}-${index}`"><strong>{{ drugSourceNames[warning.source] ?? warning.source }}</strong> · {{ warning.code }}. {{ warning.message }}</li></ul>
    </details>
    <p class="public-drug-panel__notice">
      Reference information, not personal medical advice. Missing warnings or label sections do not mean a medication is safe for you. Do not change medicines or doses based on this comparison.
    </p>

    <template v-if="drug">
      <dl class="public-identity">
        <div><dt>Public generic name</dt><dd>{{ drug.identity.genericName }}</dd></div>
        <div><dt>Brand names</dt><dd>{{ list(drug.identity.brandNames) }}</dd></div>
        <div><dt>Active ingredients</dt><dd>{{ list(drug.activeIngredients) }}</dd></div>
        <div><dt>Forms</dt><dd>{{ list(drug.forms) }}</dd></div>
        <div><dt>Strengths</dt><dd>{{ list(drug.strengths) }}</dd></div>
        <div><dt>Routes</dt><dd>{{ list(drug.routes) }}</dd></div>
        <div><dt>Manufacturers / labelers</dt><dd>{{ list(drug.manufacturers) }}</dd></div>
        <div><dt>Pharmacologic classes</dt><dd>{{ list(drug.pharmacologicClasses) }}</dd></div>
        <div><dt>RxCUI</dt><dd>{{ drug.identity.rxcui || 'Unavailable from this record' }}</dd></div>
      </dl>

      <details class="public-detail">
        <summary>Product identifiers and variants <span>{{ drug.variants.length }} variants</span></summary>
        <div class="public-detail__body">
          <dl class="public-identity">
            <div><dt>Product NDCs</dt><dd>{{ list(drug.identity.productNdcs) }}</dd></div>
            <div><dt>NDCs</dt><dd>{{ list(drug.identity.ndcs) }}</dd></div>
            <div><dt>Application numbers</dt><dd>{{ list(drug.identity.applicationNumbers) }}</dd></div>
            <div><dt>SPL set IDs</dt><dd>{{ list(drug.identity.splSetIds) }}</dd></div>
          </dl>
          <article v-for="(variant, index) in drug.variants" :key="`${variant.productNdc}-${index}`" class="public-variant">
            <h3>{{ variant.brandName || variant.genericName || `Product ${index + 1}` }}</h3>
            <dl class="public-identity">
              <div><dt>Product NDC</dt><dd>{{ variant.productNdc || 'Unavailable' }}</dd></div>
              <div><dt>Package NDCs</dt><dd>{{ list(variant.packageNdcs) }}</dd></div>
              <div><dt>Dosage form</dt><dd>{{ variant.dosageForm || 'Unavailable' }}</dd></div>
              <div><dt>Routes</dt><dd>{{ list(variant.route) }}</dd></div>
              <div><dt>Ingredients and strengths</dt><dd>{{ list(variant.activeIngredients.map((ingredient) => [ingredient.name, ingredient.strength].filter(Boolean).join(' '))) }}</dd></div>
              <div><dt>Labeler</dt><dd>{{ variant.labelerName || 'Unavailable' }}</dd></div>
              <div><dt>Marketing category</dt><dd>{{ variant.marketingCategory || 'Unavailable' }}</dd></div>
            </dl>
          </article>
          <p v-if="!drug.variants.length">No product variants were returned.</p>
        </div>
      </details>

      <div class="public-clinical" data-testid="public-clinical-sections">
        <details v-for="section in sections" :key="section.key" class="public-detail">
          <summary>{{ section.title }} <span>{{ sectionItems(section.key).length ? 'Label text' : 'Unavailable' }}</span></summary>
          <div class="public-detail__body">
            <p v-if="section.note" class="public-data-message">{{ section.note }}</p>
            <p v-for="(text, index) in sectionItems(section.key)" :key="index" class="public-label-text">{{ text }}</p>
            <p v-if="!sectionItems(section.key).length">This label section is unavailable in the returned record. That does not establish the absence of a risk or interaction.</p>
          </div>
        </details>
      </div>

      <section class="public-prices" data-testid="public-price-groups">
        <h3>Prices and benchmarks</h3>
        <p>Each value keeps its original price type. A benchmark applies to the quote's listed NDC and quantity, not automatically to the selected demo SKU. Public benchmarks never enter the demo cart.</p>
        <details v-for="group in priceGroups" :key="group.kind" class="public-detail" :data-price-kind="group.kind" :open="group.kind === 'nadac-benchmark' && group.quotes.length > 0">
          <summary>{{ group.title }} <span>{{ group.quotes.length ? `${group.quotes.length} records` : 'Unavailable' }}</span></summary>
          <div class="public-detail__body">
            <p class="public-data-message">{{ group.note }}</p>
            <article v-for="quote in group.quotes" :key="quote.id" class="public-price-quote">
              <div class="public-price-quote__heading"><strong>{{ quote.label }}</strong><strong>{{ formatCurrency(quote.amount) }}</strong></div>
              <p>{{ quote.consumerMeaning }}</p>
              <dl class="public-identity">
                <div><dt>Basis</dt><dd>{{ quote.basis }}<template v-if="quote.quantity !== undefined">, quantity {{ quote.quantity }}</template><template v-if="quote.unit"> {{ quote.unit }}</template></dd></div>
                <div v-if="quote.unitAmount !== undefined"><dt>Per unit</dt><dd>{{ unitCurrency(quote.unitAmount) }}</dd></div>
                <div v-if="quote.ndc"><dt>NDC</dt><dd>{{ quote.ndc }}</dd></div>
                <div><dt>Source</dt><dd>{{ sourceName(quote.source) }}</dd></div>
                <div><dt>Effective date</dt><dd>{{ dateLabel(quote.effectiveDate || quote.source.effectiveAt) }}</dd></div>
                <div><dt>Retrieved</dt><dd>{{ dateLabel(quote.source.retrievedAt) }}</dd></div>
                <div v-if="quote.plan?.planName"><dt>Plan</dt><dd>{{ quote.plan.planName }}</dd></div>
              </dl>
            </article>
            <p v-if="!group.quotes.length">No {{ group.title.toLowerCase() }} data is available for this record.</p>
          </div>
        </details>
      </section>

      <details class="public-detail">
        <summary>Reported adverse events <span>{{ drug.reportedAdverseEvents?.length ? 'Report counts' : 'Not loaded' }}</span></summary>
        <div class="public-detail__body">
          <p class="public-data-message">Spontaneous FAERS reports do not prove that a medicine caused an event. Counts do not measure risk or incidence.</p>
          <ul v-if="drug.reportedAdverseEvents?.length">
            <li v-for="event in drug.reportedAdverseEvents" :key="event.reaction">{{ event.reaction }}: {{ event.reports.toLocaleString() }} reports</li>
          </ul>
          <p v-else>No adverse-event summary was loaded for this record.</p>
        </div>
      </details>

      <details class="public-detail" data-testid="public-sources">
        <summary>Sources and freshness <span>{{ drug.sources.length }} sources</span></summary>
        <ul v-if="drug.sources.length" class="public-source-list">
          <li v-for="(source, index) in drug.sources" :key="`${source.source}-${index}`">
            <a v-if="sourceUrl(source)" :href="sourceUrl(source)" target="_blank" rel="noreferrer">{{ sourceName(source) }}</a>
            <strong v-else>{{ sourceName(source) }}</strong>
            <span>Retrieved {{ dateLabel(source.retrievedAt) }}<template v-if="source.effectiveAt"> · Effective {{ dateLabel(source.effectiveAt) }}</template></span>
            <span v-if="source.datasetVersion">Dataset {{ source.datasetVersion }}</span>
            <p v-if="source.disclaimer">{{ source.disclaimer }}</p>
          </li>
        </ul>
        <p v-else class="public-detail__body">Source metadata is unavailable.</p>
      </details>
    </template>
    <p v-else-if="loading" role="status">Loading public medication information. Existing demo options remain available below in hybrid mode.</p>
    <p v-else>Public details are unavailable. Any demo fulfillment options below are fictional and do not confirm current clinical information or pharmacy availability.</p>
  </section>
</template>

<style scoped>
.public-drug-panel { margin: 1.5rem 0; padding: clamp(1rem, 3vw, 1.75rem); border: 1px solid var(--cd-border); border-radius: 1rem; background: var(--cd-surface); min-width: 0; }
.public-drug-panel__heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.public-drug-panel__heading h2 { margin: .2rem 0 .8rem; font-size: 1.35rem; }
.public-drug-panel__notice, .public-data-message { font-size: .88rem; line-height: 1.6; color: var(--cd-muted-dark); }
.public-drug-panel__notice { padding: .85rem 1rem; background: #f1f6f4; border-radius: .65rem; }
.public-provider-warnings { margin-block: .75rem; padding: .65rem .85rem; border-radius: .65rem; background: var(--cd-warning-soft); font-size: .83rem; }
.public-provider-warnings ul { padding-left: 1.1rem; }
.public-identity { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .9rem 1.25rem; margin: 1.25rem 0; }
.public-identity div { min-width: 0; }
.public-identity dt { color: var(--cd-muted-dark); font-size: .76rem; margin-bottom: .25rem; }
.public-identity dd { margin: 0; font-size: .87rem; line-height: 1.5; overflow-wrap: anywhere; }
.public-detail { border-top: 1px solid var(--cd-border); }
.public-detail summary { padding: .95rem 0; cursor: pointer; font-size: .88rem; font-weight: 650; line-height: 1.5; }
.public-detail summary span { font-weight: 400; font-size: .76rem; color: var(--cd-muted-dark); margin-left: .5rem; }
.public-detail__body { max-height: 32rem; overflow-y: auto; padding: 0 .5rem .9rem 0; font-size: .88rem; line-height: 1.6; overflow-wrap: anywhere; }
.public-label-text { white-space: pre-wrap; }
.public-variant + .public-variant, .public-price-quote + .public-price-quote { border-top: 1px solid var(--cd-border); padding-top: .9rem; }
.public-variant h3, .public-prices h3 { font-size: 1rem; }
.public-prices { margin-top: 1.5rem; }
.public-prices > p { font-size: .88rem; color: var(--cd-muted-dark); }
.public-price-quote__heading { display: flex; justify-content: space-between; gap: 1rem; }
.public-source-list { margin: 0; padding: 0 0 1rem 1.2rem; font-size: .85rem; line-height: 1.6; overflow-wrap: anywhere; }
.public-source-list li + li { margin-top: .75rem; }
.public-source-list span { display: block; color: var(--cd-muted-dark); }
.public-source-list p { margin: .2rem 0; }
@media (max-width: 600px) { .public-identity { grid-template-columns: minmax(0, 1fr); } }
</style>
