<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { useDrugFacts } from '../../composables/useDrugFacts'
import { drugFactRegistry, type DrugFactType } from '../../domain/drug-facts'

type ComparisonDrugFact = ReturnType<ReturnType<typeof useDrugFacts>['getFact']>['drugs'][number]
const props = withDefaults(defineProps<{ drug: ComparisonDrugFact; factType: DrugFactType; cellId: string; expanded?: boolean }>(), { expanded: false })
const isExpanded = ref(props.expanded)
watch(() => props.expanded, value => { isExpanded.value = value })
watch(() => [props.drug.drugId, props.factType], () => { isExpanded.value = props.expanded })

const clinical = computed(() => drugFactRegistry[props.factType].load === 'clinical')
const unavailable = computed(() => ['provider-failed', 'field-absent', 'source-unavailable', 'not-loaded'].includes(props.drug.availability))
const content = computed(() => props.drug.content)
const bodyId = computed(() => `${props.cellId}-body`)

// A source prefix, never a generated summary. The full string stays available on expansion.
function excerpt(value: string, limit = 480): string {
  if (value.length <= limit) return value
  const boundary = value.lastIndexOf(' ', limit)
  return value.slice(0, boundary > limit - 80 ? boundary : limit).trimEnd()
}
const canExpand = computed(() => Boolean(content.value && (
  content.value.items.length > 1 || content.value.items.some(value => value.length > 480)
  || content.value.values.length > 3 || content.value.values.some(value => value.value.length > 240)
  || content.value.events.length > 4 || content.value.priceGroups.length
)))
const textOmitted = computed(() => Boolean(content.value && (
  content.value.items.length > 1 || content.value.items.some(value => value.length > 480)
  || content.value.values.length > 3 || content.value.values.some(value => value.value.length > 240)
  || content.value.events.length > 4
)))
const printOmitted = computed(() => textOmitted.value || Boolean(content.value?.priceGroups.some(group => group.quotes.length > 1)))
const visibleItems = computed(() => isExpanded.value ? content.value?.items : content.value?.items.slice(0, 1).map(value => excerpt(value)))
const visibleValues = computed(() => isExpanded.value ? content.value?.values : content.value?.values.slice(0, 3).map(value => ({ ...value, value: excerpt(value.value, 240) })))
</script>

<template>
  <section class="comparison-fact-cell" :aria-label="drug.label" :aria-busy="drug.loading" :data-drug-id="drug.drugId" :data-availability="drug.availability">
    <p class="comparison-fact-cell__status" :class="{ 'comparison-fact-cell__status--unavailable': unavailable }" role="status">{{ drug.statusLabel }}</p>
    <p v-if="drug.message" class="comparison-fact-cell__notice">{{ drug.message }}</p>
    <p v-if="drug.failureMessage" class="comparison-fact-cell__notice">{{ drug.failureMessage }}</p>
    <p v-if="!drug.hasContent" class="comparison-fact-cell__empty">{{ drug.emptyMessage }}</p>

    <template v-else-if="content">
      <div :id="bodyId" class="comparison-fact-cell__screen">
        <p v-if="content.items.length" class="comparison-fact-cell__eyebrow">{{ clinical ? isExpanded ? 'FDA label text' : 'FDA label excerpt' : isExpanded ? 'Source text' : 'Source excerpt' }}</p>
        <div class="comparison-fact-cell__body" :class="{ 'comparison-fact-cell__body--preview': !isExpanded }">
          <p v-for="(item, index) in visibleItems" :key="`item-${index}`" class="comparison-fact-cell__text drug-info-card__text">{{ item }}</p>
          <dl v-if="content.values.length" class="comparison-fact-cell__values">
            <div v-for="(value, index) in visibleValues" :key="`value-${index}`"><dt>{{ value.label }}</dt><dd class="drug-info-card__text">{{ value.value }}</dd></div>
          </dl>
          <section v-for="group in content.priceGroups" :key="group.kind" class="comparison-fact-cell__price-group" :data-price-kind="group.kind">
            <h4>{{ group.label }}</h4>
            <p class="comparison-fact-cell__notice">{{ group.notice }}</p>
            <p v-if="!isExpanded && group.quotes.length > 1" class="comparison-fact-cell__record-count">First of {{ group.quotes.length }} source records. Not a lowest-price selection.</p>
            <div v-for="quote in isExpanded ? group.quotes : group.quotes.slice(0, 1)" :key="quote.id" class="comparison-fact-cell__quote" :data-quote-id="quote.id">
              <strong class="comparison-fact-cell__amount">{{ quote.amount }}</strong>
              <p class="comparison-fact-cell__dimensions">{{ quote.dimensions || 'Quantity not supplied' }}</p>
              <p class="comparison-fact-cell__quote-label">{{ quote.label }}</p>
              <dl class="comparison-fact-cell__values comparison-fact-cell__quote-details">
                <div v-if="quote.ndc"><dt>Package NDC</dt><dd>{{ quote.ndc }}</dd></div>
                <div><dt>Effective or as-of date</dt><dd>{{ quote.effective }}</dd></div>
                <template v-if="isExpanded">
                  <div><dt>Basis</dt><dd>{{ quote.basis }}</dd></div>
                  <div v-if="quote.unitAmount"><dt>Per unit</dt><dd>{{ quote.unitAmount }}</dd></div>
                  <div v-if="quote.plan"><dt>Plan</dt><dd>{{ quote.plan }}</dd></div>
                </template>
                <div><dt>Source</dt><dd><a v-if="quote.source.url" :href="quote.source.url" target="_blank" rel="noreferrer">{{ quote.source.label }}</a><template v-else>{{ quote.source.label }}</template></dd></div>
              </dl>
              <template v-if="isExpanded">
                <p class="comparison-fact-cell__notice">{{ quote.meaning }}</p>
                <p class="comparison-fact-cell__notice">Retrieved {{ quote.source.retrieved }}<template v-if="quote.source.effective">. Source effective {{ quote.source.effective }}</template><template v-if="quote.source.dataset">. Dataset {{ quote.source.dataset }}</template>.</p>
                <p v-if="quote.source.disclaimer" class="comparison-fact-cell__notice">{{ quote.source.disclaimer }}</p>
              </template>
            </div>
          </section>
          <ul v-if="content.events.length" class="comparison-fact-cell__events">
            <li v-for="(event, index) in isExpanded ? content.events : content.events.slice(0, 4)" :key="`${event.reaction}-${index}`"><span>{{ event.reaction }}</span><strong>{{ event.reports }} reports</strong></li>
          </ul>
        </div>
        <p v-if="!isExpanded && textOmitted" class="comparison-fact-cell__notice comparison-fact-cell__omitted">Excerpt only. More source text is available below.</p>
        <button v-if="canExpand" type="button" class="comparison-fact-cell__expand" :aria-expanded="isExpanded" :aria-controls="bodyId" @click="isExpanded = !isExpanded">{{ isExpanded ? 'Show less' : 'Show more' }}<span class="sr-only"> for {{ drug.label }}</span></button>
      </div>

      <div class="comparison-fact-cell__print">
        <p v-if="content.items.length" class="comparison-fact-cell__eyebrow">{{ clinical ? 'FDA label excerpt' : 'Source excerpt' }}</p>
        <p v-for="(item, index) in content.items.slice(0, 1)" :key="`print-item-${index}`" class="comparison-fact-cell__text">{{ excerpt(item) }}</p>
        <dl v-if="content.values.length" class="comparison-fact-cell__values"><div v-for="(value, index) in content.values.slice(0, 3)" :key="`print-value-${index}`"><dt>{{ value.label }}</dt><dd>{{ excerpt(value.value, 240) }}</dd></div></dl>
        <section v-for="group in content.priceGroups" :key="`print-${group.kind}`" class="comparison-fact-cell__price-group">
          <h4>{{ group.label }}</h4><p class="comparison-fact-cell__notice">{{ group.notice }}</p>
          <div v-for="quote in group.quotes.slice(0, 1)" :key="quote.id" class="comparison-fact-cell__quote">
            <strong class="comparison-fact-cell__amount">{{ quote.amount }}</strong><p>{{ quote.dimensions || 'Quantity not supplied' }}</p><p>{{ quote.label }}</p>
            <p v-if="quote.ndc">Package NDC {{ quote.ndc }}</p><p>Effective or as-of date {{ quote.effective }}.</p>
            <p>{{ quote.source.label }}. Retrieved {{ quote.source.retrieved }}.</p>
            <p v-if="group.quotes.length > 1">First of {{ group.quotes.length }} source records, not a lowest-price selection.</p>
          </div>
        </section>
        <ul v-if="content.events.length" class="comparison-fact-cell__events"><li v-for="(event, index) in content.events.slice(0, 4)" :key="`print-event-${index}`"><span>{{ event.reaction }}</span><strong>{{ event.reports }} reports</strong></li></ul>
        <p v-if="printOmitted" class="comparison-fact-cell__omitted">Excerpt only. Additional text or records are omitted from this report. Read the source for the full information.</p>
      </div>
    </template>

    <p v-if="content?.sources[0]" class="comparison-fact-cell__source-line">{{ content.sources[0].label }}<template v-if="content.sources[0].effective">. Effective {{ content.sources[0].effective }}</template><template v-else>. Retrieved {{ content.sources[0].retrieved }}</template>.</p>
    <details v-if="content" class="comparison-fact-cell__sources" :open="isExpanded">
      <summary>Sources and freshness<span class="sr-only"> for {{ drug.label }}</span></summary>
      <ul v-if="content.sources.length">
        <li v-for="(source, index) in content.sources" :key="`${source.label}-${index}`">
          <a v-if="source.url" :href="source.url" target="_blank" rel="noreferrer">{{ source.label }}</a><strong v-else>{{ source.label }}</strong>
          <span>Retrieved {{ source.retrieved }}<template v-if="source.effective">. Effective {{ source.effective }}</template><template v-if="source.dataset">. Dataset {{ source.dataset }}</template>.</span>
          <p v-if="source.disclaimer">{{ source.disclaimer }}</p>
        </li>
      </ul>
      <p v-else>Source metadata is unavailable for this fact.</p>
    </details>
    <details v-if="drug.notices.length" class="comparison-fact-cell__sources comparison-fact-cell__source-notices" :open="isExpanded"><summary>Source notices<span class="sr-only"> for {{ drug.label }}</span></summary><ul><li v-for="(notice, index) in drug.notices" :key="index">{{ notice }}</li></ul></details>
  </section>
</template>

<style scoped>
.comparison-fact-cell { min-width: 0; font-size: .875rem; line-height: 1.6; overflow-wrap: anywhere; }
.comparison-fact-cell p { margin: 0 0 .65rem; }
.comparison-fact-cell__status { display: inline-block; padding: .2rem .55rem; border: 1px solid var(--cd-border); border-radius: .4rem; background: var(--cd-surface-alt, #f2f6f9); color: var(--cd-muted-dark); font-weight: 600; }
.comparison-fact-cell__status--unavailable { background: #fff5da; border-color: #e2c67b; color: #705214; }
.comparison-fact-cell__eyebrow { color: var(--cd-muted-dark); font-weight: 600; }
.comparison-fact-cell__text { white-space: pre-wrap; }
.comparison-fact-cell__notice, .comparison-fact-cell__source-line, .comparison-fact-cell__record-count { color: var(--cd-muted-dark); }
.comparison-fact-cell__empty { padding: .75rem; background: var(--cd-surface-alt, #f2f6f9); border-radius: .4rem; }
.comparison-fact-cell__values { margin: .5rem 0 .85rem; display: grid; gap: .55rem; }
.comparison-fact-cell__values dt { color: var(--cd-muted-dark); }
.comparison-fact-cell__values dd { margin: .05rem 0 0; white-space: pre-wrap; }
.comparison-fact-cell__price-group { margin: .65rem 0 1rem; padding: .85rem; border: 1px solid var(--cd-border); border-radius: .5rem; background: var(--cd-surface); }
.comparison-fact-cell__price-group h4 { font-size: .9375rem; line-height: 1.45; margin: 0 0 .4rem; }
.comparison-fact-cell__quote + .comparison-fact-cell__quote { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--cd-border); }
.comparison-fact-cell__amount { display: block; color: var(--cd-navy, #142d43); font-size: 1.75rem; line-height: 1.3; font-variant-numeric: tabular-nums; margin: .55rem 0 .15rem; }
.comparison-fact-cell__dimensions { font-weight: 600; }
.comparison-fact-cell__quote-label { color: var(--cd-muted-dark); }
.comparison-fact-cell__quote-details { gap: .3rem; }
.comparison-fact-cell__quote-details > div { display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; }
.comparison-fact-cell__quote-details dd { text-align: right; }
.comparison-fact-cell__events { list-style: none; padding: 0; margin: .5rem 0; }
.comparison-fact-cell__events li { display: flex; justify-content: space-between; gap: .75rem; padding: .4rem 0; border-bottom: 1px solid var(--cd-border); }
.comparison-fact-cell__events strong { white-space: nowrap; font-variant-numeric: tabular-nums; }
.comparison-fact-cell__expand { display: inline-flex; align-items: center; min-height: 2.75rem; padding: .45rem .75rem; border: 1px solid var(--cd-border-strong, #b6ccd5); border-radius: .45rem; background: var(--cd-surface); color: var(--cd-teal-dark, #006a65); font: inherit; font-weight: 600; cursor: pointer; }
.comparison-fact-cell__expand:hover { background: var(--cd-surface-alt, #f2f6f9); }
.comparison-fact-cell__expand:focus-visible, .comparison-fact-cell__sources summary:focus-visible, .comparison-fact-cell a:focus-visible { outline: 3px solid var(--cd-teal, #00857e); outline-offset: 3px; }
.comparison-fact-cell__omitted { font-style: italic; }
.comparison-fact-cell__source-line { margin-top: .8rem !important; padding-top: .75rem; border-top: 1px solid var(--cd-border); }
.comparison-fact-cell__sources { margin-top: .65rem; color: var(--cd-muted-dark); }
.comparison-fact-cell__sources summary { cursor: pointer; min-height: 2rem; }
.comparison-fact-cell__sources ul { margin: .3rem 0 0; padding-left: 1.1rem; }
.comparison-fact-cell__sources li { margin-top: .5rem; }
.comparison-fact-cell__sources span { display: block; }
.comparison-fact-cell__sources p { margin: .2rem 0; }
.comparison-fact-cell a { color: var(--cd-teal-dark, #006a65); text-decoration: underline; text-underline-offset: .15em; }
.comparison-fact-cell__print { display: none; }
@media print {
  .comparison-fact-cell__screen { display: none; }
  .comparison-fact-cell__print { display: block; }
  .comparison-fact-cell { font-size: 8pt; line-height: 1.35; color: #142d43; }
  .comparison-fact-cell p { margin-bottom: 4px; }
  .comparison-fact-cell__price-group { padding: 6px; margin: 5px 0; break-inside: avoid; }
  .comparison-fact-cell__price-group h4 { font-size: 9pt; line-height: 1.3; margin-bottom: 4px; }
  .comparison-fact-cell__status { background: none; padding: 2px 4px; font-size: 7pt; }
  .comparison-fact-cell__amount { font-size: 16pt; margin: 4px 0 2px; }
  .comparison-fact-cell__values { gap: 4px; margin: 4px 0; }
  .comparison-fact-cell__sources { font-size: 7pt; line-height: 1.3; margin-top: 5px; break-inside: avoid; }
  .comparison-fact-cell__sources summary { min-height: 0; }
  .comparison-fact-cell__sources ul { margin-top: 3px; padding-left: 12px; }
  .comparison-fact-cell__sources li { margin-top: 4px; }
  .comparison-fact-cell__sources::details-content { content-visibility: visible; }
  .comparison-fact-cell__sources > :not(summary) { display: block; }
  .comparison-fact-cell__sources summary { display: block; font-weight: 600; list-style: none; }
  .comparison-fact-cell__sources summary::marker { content: ''; }
  .comparison-fact-cell__sources a::after { content: ' ' attr(href); display: block; font-weight: 400; }
  .comparison-fact-cell__sources .sr-only { display: none; }
  .comparison-fact-cell__source-line { display: none; }
}
</style>
