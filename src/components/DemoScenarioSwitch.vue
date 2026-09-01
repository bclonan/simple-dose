<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { usePricingStore } from '../stores/pricing.store'

const pricing = usePricingStore()
const { scenarioId, currentScenario } = storeToRefs(pricing)
</script>

<template>
  <section class="scenario-switch" aria-labelledby="pricing-scenario-title">
    <div>
      <div class="section-kicker">Demo control</div>
      <h2 id="pricing-scenario-title">Pricing scenario</h2>
      <p v-if="currentScenario" class="scenario-switch__timestamp" aria-live="polite">
        Prices updated · Aug 31, 2026 · Demo scenario
      </p>
      <p v-else class="scenario-switch__timestamp">Seeded catalog prices</p>
    </div>
    <div class="segmented-control" role="group" aria-label="Pricing scenario">
      <button
        type="button"
        :aria-pressed="scenarioId === 'current'"
        :class="{ active: scenarioId === 'current' }"
        data-testid="scenario-current"
        @click="pricing.setScenario('current')"
      >
        Current prices
      </button>
      <button
        type="button"
        :aria-pressed="scenarioId === 'market-update'"
        :class="{ active: scenarioId === 'market-update' }"
        data-testid="scenario-market-update"
        @click="pricing.setScenario('market-update')"
      >
        Market update
      </button>
    </div>
  </section>
</template>
