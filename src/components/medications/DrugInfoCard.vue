<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { drugFactRegistry, drugFactTypes, isDrugFactType, type DrugFactCard, type DrugFactType } from '../../domain/drug-facts'
import { useDrugFacts } from '../../composables/useDrugFacts'

const props = withDefaults(defineProps<{ card: DrugFactCard; editable?: boolean }>(), { editable: true })
const emit = defineEmits<{ change: [fact: DrugFactType]; remove: [] }>()
const { getFact } = useDrugFacts()
const data = computed(() => getFact(props.card.drugIds, props.card.factType))
const expanded = ref<Record<string, boolean>>({})
watch(() => props.card.factType, () => { expanded.value = {} })
const changeFact = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value
  if (isDrugFactType(value)) emit('change', value)
}
const bodyId = (drugId: string) => `${props.card.id}-${drugId}-content`
</script>

<template>
  <article :id="card.id" class="drug-info-card" data-testid="drug-info-card" :data-fact-type="card.factType" tabindex="-1" :aria-labelledby="`${card.id}-title`">
    <header class="drug-info-card__header">
      <div><p class="drug-info-card__source-label">{{ data.sourceLabel }}</p><h2 :id="`${card.id}-title`">{{ data.title }}</h2></div>
      <div v-if="editable" class="drug-info-card__actions">
        <label class="drug-info-card__change"><span class="sr-only">Change {{ data.title }} fact</span>
          <select :value="card.factType" :aria-label="`Change ${data.title} fact`" @change="changeFact">
            <option v-for="fact in drugFactTypes" :key="fact" :value="fact">{{ drugFactRegistry[fact].label }}</option>
          </select>
        </label>
        <button type="button" class="button button--text button--small" :aria-label="`Remove ${data.title} card`" @click="emit('remove')">Remove</button>
      </div>
    </header>
    <p v-if="data.notice" class="drug-info-card__notice">{{ data.notice }}</p>
    <p v-if="!data.drugs.length" class="drug-info-card__empty">Select a medication to show this fact.</p>
    <section v-for="drug in data.drugs" :key="drug.drugId" class="drug-info-card__drug" :aria-busy="drug.loading" :data-drug-id="drug.drugId" :data-availability="drug.availability">
      <div class="drug-info-card__drug-heading"><h3>{{ drug.label }}</h3><span class="drug-info-card__status" :class="{ 'drug-info-card__status--stale': drug.status === 'stale-cache' }" role="status">{{ drug.statusLabel }}</span></div>
      <p v-if="drug.message" class="drug-info-card__empty">{{ drug.message }}</p>
      <p v-if="drug.failureMessage" class="drug-info-card__empty" role="status">{{ drug.failureMessage }}</p>
      <p v-if="!drug.hasContent" class="drug-info-card__empty">{{ drug.emptyMessage }}</p>
      <template v-else-if="drug.content">
        <div :id="bodyId(drug.drugId)" class="drug-info-card__body" :class="{ 'drug-info-card__body--preview': drug.expandable && !expanded[drug.drugId] }">
          <p v-for="(item, index) in expanded[drug.drugId] ? drug.content.items : drug.content.items.slice(0, 2)" :key="`item-${index}`" class="drug-info-card__text">{{ item }}</p>
          <dl v-if="drug.content.values.length" class="drug-info-card__values">
            <div v-for="(value, index) in expanded[drug.drugId] ? drug.content.values : drug.content.values.slice(0, 4)" :key="`value-${index}`"><dt>{{ value.label }}</dt><dd class="drug-info-card__text">{{ value.value }}</dd></div>
          </dl>
          <section v-for="group in drug.content.priceGroups" :key="group.kind" class="drug-info-card__price-group" :data-price-kind="group.kind">
            <h4>{{ group.label }}</h4><p class="drug-info-card__notice">{{ group.notice }}</p>
            <div v-for="quote in expanded[drug.drugId] ? group.quotes : group.quotes.slice(0, 2)" :key="quote.id" class="drug-info-card__quote">
              <div class="drug-info-card__quote-heading"><strong>{{ quote.label }}</strong><strong>{{ quote.amount }}</strong></div>
              <p v-if="quote.dimensions">{{ quote.dimensions }}</p><p>{{ quote.meaning }}</p>
              <dl class="drug-info-card__values">
                <div><dt>Basis</dt><dd>{{ quote.basis }}</dd></div>
                <div v-if="quote.unitAmount"><dt>Per unit</dt><dd>{{ quote.unitAmount }}</dd></div>
                <div v-if="quote.ndc"><dt>Package NDC</dt><dd>{{ quote.ndc }}</dd></div>
                <div v-if="quote.plan"><dt>Plan</dt><dd>{{ quote.plan }}</dd></div>
                <div><dt>Effective or as-of date</dt><dd>{{ quote.effective }}</dd></div>
                <div><dt>Source</dt><dd>{{ quote.source.label }}</dd></div>
              </dl>
            </div>
          </section>
          <ul v-if="drug.content.events.length" class="drug-info-card__events">
            <li v-for="(event, index) in expanded[drug.drugId] ? drug.content.events : drug.content.events.slice(0, 5)" :key="`${event.reaction}-${index}`"><span>{{ event.reaction }}</span><strong>{{ event.reports }} reports</strong></li>
          </ul>
        </div>
        <button v-if="drug.expandable" type="button" class="button button--text button--small drug-info-card__expand" :aria-expanded="Boolean(expanded[drug.drugId])" :aria-controls="bodyId(drug.drugId)" @click="expanded[drug.drugId] = !expanded[drug.drugId]">{{ expanded[drug.drugId] ? 'Show less' : 'Show more' }}<span class="sr-only"> for {{ drug.label }}</span></button>
      </template>
        <details v-if="drug.content" class="drug-info-card__sources">
          <summary>Sources and freshness</summary>
          <ul v-if="drug.content.sources.length">
            <li v-for="(source, index) in drug.content.sources" :key="`${source.label}-${index}`">
              <a v-if="source.url" :href="source.url" target="_blank" rel="noreferrer">{{ source.label }}</a><strong v-else>{{ source.label }}</strong>
              <span>Retrieved {{ source.retrieved }}<template v-if="source.effective">. Effective {{ source.effective }}</template><template v-if="source.dataset">. Dataset {{ source.dataset }}</template>.</span>
              <p v-if="source.disclaimer">{{ source.disclaimer }}</p>
            </li>
          </ul>
          <p v-else>Source metadata is unavailable for this fact.</p>
        </details>
      <details v-if="drug.notices.length" class="drug-info-card__sources"><summary>Source notices</summary><ul><li v-for="(notice, index) in drug.notices" :key="index">{{ notice }}</li></ul></details>
    </section>
  </article>
</template>

<style scoped>
.drug-info-card { min-width: 0; padding: 1.25rem; border: 1px solid var(--cd-border); border-radius: var(--cd-radius-md); background: var(--cd-surface); box-shadow: var(--cd-shadow-xs); scroll-margin-top: 6rem; }
.drug-info-card__header { display: flex; justify-content: space-between; align-items: start; gap: .75rem; flex-wrap: wrap; }
.drug-info-card__header h2 { margin: .2rem 0 .65rem; font-size: 1.2rem; line-height: 1.3; }
.drug-info-card__source-label { margin: 0; color: var(--cd-muted-dark); font-size: .73rem; }
.drug-info-card__actions { display: flex; align-items: center; gap: .35rem; flex-wrap: wrap; }
.drug-info-card__change select { max-width: min(100%, 15rem); padding: .4rem; border: 1px solid var(--cd-border); border-radius: .4rem; background: var(--cd-surface); font-size: .76rem; }
.drug-info-card__notice, .drug-info-card__empty { margin: .35rem 0 .85rem; color: var(--cd-muted-dark); font-size: .82rem; line-height: 1.55; }
.drug-info-card__drug { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--cd-border); min-width: 0; }
.drug-info-card__drug-heading { display: flex; justify-content: space-between; align-items: baseline; gap: .6rem; flex-wrap: wrap; }
.drug-info-card__drug-heading h3 { margin: 0 0 .6rem; font-size: 1rem; line-height: 1.4; overflow-wrap: anywhere; }
.drug-info-card__status { font-size: .7rem; color: var(--cd-muted-dark); }
.drug-info-card__status--stale { color: var(--cd-warning); }
.drug-info-card__text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .875rem; line-height: 1.65; }
.drug-info-card__body--preview .drug-info-card__text { display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
.drug-info-card__values { display: grid; gap: .7rem; margin: .6rem 0; }
.drug-info-card__values dt { color: var(--cd-muted-dark); font-size: .73rem; }
.drug-info-card__values dd { margin: .15rem 0 0; overflow-wrap: anywhere; font-size: .85rem; }
.drug-info-card__price-group { border-left: 3px solid var(--cd-border-strong); padding-left: .9rem; margin-top: 1rem; }
.drug-info-card__price-group[data-price-kind="nadac-benchmark"] { border-color: var(--cd-teal); }
.drug-info-card__price-group[data-price-kind="demo"] { border-color: var(--cd-warning); }
.drug-info-card__price-group h4 { font-size: .95rem; margin: 0 0 .4rem; }
.drug-info-card__quote { margin-top: .85rem; padding-top: .75rem; border-top: 1px solid var(--cd-border); font-size: .81rem; overflow-wrap: anywhere; }
.drug-info-card__quote p { margin: .35rem 0; }
.drug-info-card__quote-heading { display: flex; justify-content: space-between; gap: .7rem; align-items: start; }
.drug-info-card__quote-heading strong:last-child { white-space: nowrap; }
.drug-info-card__events { list-style: none; margin: .5rem 0; padding: 0; font-size: .87rem; }
.drug-info-card__events li { display: flex; justify-content: space-between; gap: .75rem; padding: .4rem 0; border-bottom: 1px solid var(--cd-border); }
.drug-info-card__events span { overflow-wrap: anywhere; }
.drug-info-card__events strong { white-space: nowrap; }
.drug-info-card__expand { margin-top: .5rem; }
.drug-info-card__sources { margin-top: .8rem; color: var(--cd-muted-dark); font-size: .74rem; line-height: 1.55; }
.drug-info-card__sources summary { cursor: pointer; }
.drug-info-card__sources ul { padding-left: 1.1rem; }
.drug-info-card__sources li { margin-top: .5rem; overflow-wrap: anywhere; }
.drug-info-card__sources span { display: block; }
.drug-info-card__sources p { margin: .2rem 0; }
.drug-info-card__sources a { text-decoration: underline; }
@media (max-width: 600px) { .drug-info-card { padding: 1rem; } .drug-info-card__actions { width: 100%; } .drug-info-card__change { flex: 1; min-width: 0; } .drug-info-card__change select { width: 100%; } }
</style>
