<script setup lang="ts">
import { useCartStore } from '@/stores/cart.store'

const cartStore = useCartStore()

const openCart = (): void => {
  cartStore.openDrawer()
}
</script>

<template>
  <header class="app-header">
    <div class="container app-header__inner">
      <RouterLink class="app-brand" to="/" aria-label="ClearDose home">
        <span class="app-brand__mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M9.25 6.75h13.5a4.5 4.5 0 0 1 4.5 4.5v9.5a4.5 4.5 0 0 1-4.5 4.5H9.25a4.5 4.5 0 0 1-4.5-4.5v-9.5a4.5 4.5 0 0 1 4.5-4.5Z" stroke="currentColor" stroke-width="1.7" />
            <path d="M16 10.75v10.5M10.75 16h10.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
          </svg>
        </span>
        <span>ClearDose</span>
      </RouterLink>

      <nav class="app-nav" aria-label="Primary navigation">
        <RouterLink to="/medications">Medications</RouterLink>
        <RouterLink to="/drugs/explore">Drug Explorer</RouterLink>
        <RouterLink to="/compare">Compare</RouterLink>
        <RouterLink to="/prescription-card">Prescription Card</RouterLink>
        <RouterLink to="/webmcp">Agent Lab</RouterLink>
        <RouterLink to="/hackathon">Hackathon</RouterLink>
      </nav>

      <button
        class="cart-button"
        type="button"
        :aria-label="`Open cart, ${cartStore.itemCount} ${cartStore.itemCount === 1 ? 'item' : 'items'}`"
        @click="openCart"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M3.5 4.5h2l1.7 9.1a2 2 0 0 0 2 1.65h7.9a2 2 0 0 0 1.95-1.55L20.5 7H6.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="9.5" cy="19" r="1.25" fill="currentColor" />
          <circle cx="17.5" cy="19" r="1.25" fill="currentColor" />
        </svg>
        <span class="cart-button__label">Cart</span>
        <span class="cart-button__count" aria-hidden="true">{{ cartStore.itemCount }}</span>
      </button>
    </div>
  </header>
</template>
