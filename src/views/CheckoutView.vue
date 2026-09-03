<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CheckoutSummary from '../components/CheckoutSummary.vue'
import { useClearDoseActions } from '../services/cleardose.actions'
import { useCartStore } from '../stores/cart.store'
import { useCheckoutStore } from '../stores/checkout.store'

const router = useRouter()
const cart = useCartStore()
const draft = useCheckoutStore()
const actions = useClearDoseActions({ navigate: (path) => router.push(path) })
const errorMessage = ref('')
const submitting = ref(false)

const form = draft.form
const hasRequest = computed(() => actions.preparedRequestCoversCart())
watch(form, () => { errorMessage.value = '' })

const changeDelivery = (itemId: string, deliveryId: string): void => {
  errorMessage.value = ''
  try {
    actions.setDeliveryOption(
      { cartItemId: itemId, deliveryOptionId: deliveryId },
      { revealCart: false },
    )
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Delivery could not be changed.'
  }
}

const checkout = async (): Promise<void> => {
  errorMessage.value = ''
  submitting.value = true
  try {
    await actions.checkoutDemoOrder({
      fullName: form.fullName,
      address: {
        line1: form.line1,
        line2: form.line2 || undefined,
        city: form.city,
        state: form.state,
        postalCode: form.postalCode,
      },
      prescriptionStatus: form.prescriptionStatus,
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Demo checkout could not be completed.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main id="main-content" class="page-shell checkout-page">
    <header class="page-heading">
      <p class="eyebrow">No payment collected</p>
      <h1>Complete demo checkout</h1>
      <p>Nothing leaves this browser. No prescription, payment, or address is transmitted.</p>
    </header>
    <p v-if="draft.prepared" class="notice checkout-prepared" role="status">Checkout form prepared for review. No order has been placed. You can edit every field below.</p>
    <section v-if="cart.checkoutIssues.length" class="error-banner" role="alert">
      <h2>Some cart items need attention</h2>
      <p>{{ cart.checkoutIssueMessage }}</p>
      <div v-for="issue in cart.checkoutIssues" :key="issue.cartItemId">
        <p>{{ issue.message }}</p>
        <button class="button button--text" type="button" @click="cart.removeItem(issue.cartItemId)">Remove unavailable item</button>
      </div>
    </section>

    <div v-if="cart.itemCount" class="checkout-layout">
      <form class="checkout-form" novalidate @submit.prevent="checkout">
        <section aria-labelledby="delivery-address-title">
          <p class="section-kicker">Demo delivery</p>
          <h2 id="delivery-address-title">Delivery address</h2>
          <div class="form-grid">
            <label class="wide"><span>Full name</span><input v-model="form.fullName" required autocomplete="name" /></label>
            <label class="wide"><span>Address</span><input v-model="form.line1" required autocomplete="address-line1" /></label>
            <label class="wide"><span>Address line 2 <small>optional</small></span><input v-model="form.line2" autocomplete="address-line2" /></label>
            <label><span>City</span><input v-model="form.city" required autocomplete="address-level2" /></label>
            <label><span>State</span><input v-model="form.state" required maxlength="2" autocomplete="address-level1" /></label>
            <label><span>ZIP</span><input v-model="form.postalCode" required inputmode="numeric" autocomplete="postal-code" /></label>
          </div>
        </section>

        <fieldset class="prescription-choice">
          <legend>Prescription</legend>
          <label class="radio-card">
            <input v-model="form.prescriptionStatus" type="radio" value="provider-will-send" />
            <span>My provider will send it</span>
          </label>
          <label class="radio-card" :class="{ disabled: !hasRequest }">
            <input v-model="form.prescriptionStatus" type="radio" value="request-prepared" :disabled="!hasRequest" />
            <span>Prescription request prepared</span>
            <RouterLink v-if="hasRequest" to="/prescription-card">View request</RouterLink>
          </label>
          <p v-if="!hasRequest" class="safety-note">For multiple prescription items, use "My provider will send it". A prepared request must match the cart's exact offer and delivery.</p>
        </fieldset>

        <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>
        <p class="safety-note">Demo checkout. No payment or prescription is transmitted.</p>
        <button class="button button--large button--full" type="submit" :disabled="submitting || !cart.readyForCheckout" data-testid="place-order">
          {{ submitting ? 'Creating demo order...' : 'Place demo order' }}
        </button>
      </form>

      <CheckoutSummary
        v-if="cart.readyForCheckout"
        :lines="cart.detailedItems"
        :total="cart.grandTotal"
        @change-delivery="changeDelivery"
      />
    </div>

    <section v-else class="empty-state" data-testid="empty-cart-checkout">
      <h2>Your cart is empty</h2>
      <p>Add an exact medication and fulfillment option before opening checkout.</p>
      <RouterLink class="button" to="/medications">Browse medications</RouterLink>
    </section>

  </main>
</template>

<style scoped>
.checkout-prepared {
  margin: 0 0 24px;
}
</style>
