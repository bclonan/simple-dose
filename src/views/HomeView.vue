<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MedicationCard from '@/components/MedicationCard.vue'
import MedicationSearch from '@/components/MedicationSearch.vue'
import { useCatalogStore } from '@/stores/catalog.store'
import type { Medication } from '@/types/demo-db'

interface PopularMedication {
  medication: Medication
  startingPrice?: number
}

const catalogStore = useCatalogStore()
const router = useRouter()
const query = ref(catalogStore.searchQuery)

watch(
  () => catalogStore.searchQuery,
  (value) => {
    query.value = value
  },
)

const featuredSlugs = ['atorvastatin', 'metformin', 'lisinopril', 'sertraline']

const popularMedications = computed<PopularMedication[]>(() =>
  featuredSlugs.flatMap((slug) => {
    const medication = catalogStore.medications.find((item) => item.slug === slug)
    if (!medication) return []

    const skuIds = new Set(
      catalogStore.skus
        .filter((sku) => sku.medicationId === medication.id)
        .map((sku) => sku.id),
    )
    const prices = catalogStore.offers
      .filter((offer) => offer.available && skuIds.has(offer.skuId))
      .map((offer) => offer.pricing.medicationSubtotal)

    return [{ medication, startingPrice: prices.length ? Math.min(...prices) : undefined }]
  }),
)

const searchMedications = async (submittedQuery: string): Promise<void> => {
  query.value = submittedQuery
  await router.push('/medications')
}
</script>

<template>
  <main id="main-content" class="home-page">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="container home-hero__grid">
        <div class="home-hero__content">
          <p class="eyebrow">
            <span aria-hidden="true"></span>
            See the whole price before you choose
          </p>
          <h1 id="home-title">
            Transparent prescriptions.
            <span>Agent-ready.</span>
          </h1>
          <p class="home-hero__lede">
            Compare exact medication prices, prepare a prescription request, and choose the fulfillment option that works for you.
          </p>

          <MedicationSearch
            v-model="query"
            label="Search the ClearDose medication catalog"
            placeholder="Search medications, brands, or strengths"
            required
            @search="searchMedications"
          />

          <div class="agent-prompt">
            <span class="agent-prompt__spark" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none">
                <path d="m10 2 .7 3.36a4 4 0 0 0 3.1 3.1l3.36.7-3.36.7a4 4 0 0 0-3.1 3.1L10 16.32l-.7-3.36a4 4 0 0 0-3.1-3.1l-3.36-.7 3.36-.7a4 4 0 0 0 3.1-3.1L10 2Z" stroke="currentColor" stroke-width="1.35" />
              </svg>
            </span>
            <p>
              <strong>Or ask your agent</strong>
              <span>"Find atorvastatin 20 mg, 90 tablets and compare my options."</span>
            </p>
          </div>

          <div class="home-hero__assurances" aria-label="ClearDose comparison rules">
            <span>
              <svg aria-hidden="true" viewBox="0 0 18 18" fill="none"><path d="m4 9 3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
              Exact medication matches
            </span>
            <span>
              <svg aria-hidden="true" viewBox="0 0 18 18" fill="none"><path d="m4 9 3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
              Every fee shown
            </span>
          </div>
        </div>

        <aside class="hero-receipt" aria-label="Transparent pricing example">
          <div class="hero-receipt__wash" aria-hidden="true"></div>
          <div class="hero-receipt__header">
            <div>
              <span>Example prescription</span>
              <strong>Atorvastatin</strong>
              <small>20 mg tablet · 90 count</small>
            </div>
            <span class="hero-receipt__rx">Rx</span>
          </div>

          <div class="hero-receipt__medicine" aria-hidden="true">
            <div class="hero-receipt__bottle">
              <span></span>
              <strong>CD</strong>
            </div>
            <div class="hero-receipt__tablet hero-receipt__tablet--one"></div>
            <div class="hero-receipt__tablet hero-receipt__tablet--two"></div>
            <div class="hero-receipt__tablet hero-receipt__tablet--three"></div>
          </div>

          <div class="hero-receipt__rows">
            <div><span>Medication</span><strong>$8.20</strong></div>
            <div><span>Pharmacy fulfillment</span><strong>$4.00</strong></div>
            <div><span>Markup</span><strong>$1.20</strong></div>
            <div><span>Standard delivery</span><strong>$5.00</strong></div>
          </div>
          <div class="hero-receipt__total">
            <span>Delivered total</span>
            <strong>$18.40</strong>
          </div>
          <p>Demo pricing only. Not a real pharmacy quote.</p>
        </aside>
      </div>
    </section>

    <section class="home-section" aria-labelledby="popular-title">
      <div class="container">
        <div class="section-heading section-heading--split">
          <div>
            <p class="eyebrow">Popular in the demo catalog</p>
            <h2 id="popular-title">Start with a familiar search</h2>
          </div>
          <RouterLink class="text-link" to="/medications">
            Browse all medications
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 10h12m-4.5-4.5L16 10l-4.5 4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </RouterLink>
        </div>

        <div class="medication-grid">
          <MedicationCard
            v-for="item in popularMedications"
            :key="item.medication.id"
            :medication="item.medication"
            :starting-price="item.startingPrice"
          />
        </div>
      </div>
    </section>

    <section class="home-section home-section--tinted" aria-labelledby="how-title">
      <div class="container">
        <div class="section-heading">
          <p class="eyebrow">A short, visible path</p>
          <h2 id="how-title">How ClearDose works</h2>
          <p>One exact prescription stays in view while you compare, prepare, and order.</p>
        </div>

        <ol class="how-grid">
          <li>
            <span>01</span>
            <div class="how-grid__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="5.5" stroke="currentColor" stroke-width="1.6" /><path d="m15 15 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
            </div>
            <h3>Find your medication</h3>
            <p>Search by generic name, brand, form, or strength.</p>
          </li>
          <li>
            <span>02</span>
            <div class="how-grid__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 5.5h14M5 11.5h9M5 17.5h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><circle cx="18" cy="17.5" r="2" stroke="currentColor" stroke-width="1.5" /></svg>
            </div>
            <h3>Compare your full cost</h3>
            <p>See medication, fulfillment, markup, and delivery together.</p>
          </li>
          <li>
            <span>03</span>
            <div class="how-grid__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M7 3.5h7l4 4v13H7v-17Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="M14 3.5v4h4M10 12h5M10 16h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
            </div>
            <h3>Prepare your request</h3>
            <p>Create a printable summary for your licensed prescriber.</p>
          </li>
          <li>
            <span>04</span>
            <div class="how-grid__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h11v10H4V7Zm11 3h3l2 3v4h-5v-7Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><circle cx="8" cy="18" r="1.5" stroke="currentColor" stroke-width="1.5" /><circle cx="17.5" cy="18" r="1.5" stroke="currentColor" stroke-width="1.5" /></svg>
            </div>
            <h3>Choose delivery and order</h3>
            <p>Pick a demo option and follow its simulated status.</p>
          </li>
        </ol>
      </div>
    </section>

    <section class="home-section home-story" aria-labelledby="pricing-title">
      <div class="container home-story__grid">
        <article class="pricing-story">
          <div class="section-heading">
            <p class="eyebrow">No mystery total</p>
            <h2 id="pricing-title">The receipt comes first.</h2>
            <p>ClearDose keeps each part of the demo price separate, then adds it once.</p>
          </div>

          <div class="price-ledger">
            <div><span>Medication</span><strong>$8.20</strong></div>
            <div><span>Pharmacy fulfillment</span><strong>$4.00</strong></div>
            <div><span>Markup</span><strong>$1.20</strong></div>
            <div><span>Delivery</span><strong>$5.00</strong></div>
            <div class="price-ledger__total"><span>Delivered total</span><strong>$18.40</strong></div>
          </div>
        </article>

        <article class="agent-story">
          <div class="agent-story__orb" aria-hidden="true">
            <svg viewBox="0 0 34 34" fill="none">
              <path d="m17 3 .95 5.35a8.5 8.5 0 0 0 6.7 6.7L30 16l-5.35.95a8.5 8.5 0 0 0-6.7 6.7L17 29l-.95-5.35a8.5 8.5 0 0 0-6.7-6.7L4 16l5.35-.95a8.5 8.5 0 0 0 6.7-6.7L17 3Z" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </div>
          <p class="eyebrow">WebMCP inside the browser</p>
          <h2>Built for people and their agents.</h2>
          <p>
            An AI agent can use ClearDose's structured browser tools while you watch the same search, selection, and cart update on screen.
          </p>
          <RouterLink class="button button--light" to="/webmcp">
            Explore WebMCP tools
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 10h12m-4.5-4.5L16 10l-4.5 4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </RouterLink>
        </article>
      </div>
    </section>
  </main>
</template>
