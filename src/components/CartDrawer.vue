<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useClearDoseActions } from '../services/cleardose.actions'
import { useCartStore } from '../stores/cart.store'
import { formatCurrency } from '../utils/format'

const cart = useCartStore()
const actions = useClearDoseActions()
const closeButton = ref<HTMLButtonElement | null>(null)
let restoreFocus: HTMLElement | null = null

const savings = computed(() => cart.readyForCheckout ? actions.compareCartSavings() : null)
const savingsFor = (cartItemId: string) =>
  savings.value?.items.find((item) => item.cartItemId === cartItemId)

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && cart.drawerOpen) cart.closeDrawer()
}

watch(
  () => cart.drawerOpen,
  async (open) => {
    if (open) {
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      closeButton.value?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown)
      restoreFocus?.focus()
    }
  },
)

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

const changeDelivery = (itemId: string, deliveryId: string): void => {
  actions.setDeliveryOption({ cartItemId: itemId, deliveryOptionId: deliveryId })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="cart.drawerOpen" class="drawer-layer" data-testid="cart-drawer">
        <button class="drawer-backdrop" type="button" aria-label="Close cart" @click="cart.closeDrawer()" />
        <aside class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">
          <header class="drawer-header">
            <div>
              <p class="section-kicker">Mock shopping cart</p>
              <h2 id="cart-title">Cart <span>({{ cart.itemCount }})</span></h2>
            </div>
            <button ref="closeButton" class="icon-button" type="button" aria-label="Close cart" @click="cart.closeDrawer()">×</button>
          </header>

          <p class="drawer-feedback" aria-live="polite">{{ cart.feedbackMessage }}</p>
          <p class="drawer-feedback">Demo prices and fulfillment only. No medication can be purchased here.</p>

          <div v-if="cart.itemCount" class="cart-lines">
            <section v-if="cart.checkoutIssues.length" class="error-banner" role="alert">
              <h3>Cart items need attention</h3>
              <p>{{ cart.checkoutIssueMessage }}</p>
              <div v-for="issue in cart.checkoutIssues" :key="issue.cartItemId">
                <p>{{ issue.message }}</p>
                <button class="button button--text" type="button" @click="actions.removeCartItem({ cartItemId: issue.cartItemId })">Remove unavailable item</button>
              </div>
            </section>
            <article v-for="line in cart.detailedItems" :key="line.item.id" class="cart-line">
              <div class="cart-line__title">
                <div>
                  <h3>{{ line.medication.genericName }}</h3>
                  <p>{{ line.sku.strength }} {{ line.sku.form }} · {{ line.sku.quantity }} count</p>
                </div>
                <strong>{{ formatCurrency(line.total) }}</strong>
              </div>
              <p>{{ line.pharmacy.name }}</p>
              <p v-if="line.sku.demoProvenance">{{ line.sku.demoProvenance.notice }}</p>
              <p v-if="(savingsFor(line.item.id)?.savings ?? 0) > 0" class="cart-line__saving">
                Save {{ formatCurrency(savingsFor(line.item.id)?.savings ?? 0) }} with the lowest current delivered option.
              </p>
              <label>
                <span>Fulfillment</span>
                <select :value="line.delivery.id" @change="changeDelivery(line.item.id, ($event.target as HTMLSelectElement).value)">
                  <option v-for="delivery in line.offer.deliveryOptions" :key="delivery.id" :value="delivery.id">
                    {{ delivery.label }} · {{ delivery.price === 0 ? 'Free' : formatCurrency(delivery.price) }}
                  </option>
                </select>
              </label>
              <button class="button button--text button--small" type="button" @click="actions.removeCartItem({ cartItemId: line.item.id })">Remove</button>
            </article>

            <dl v-if="cart.readyForCheckout" class="cart-totals">
              <div><dt>Medication</dt><dd>{{ formatCurrency(cart.medicationSubtotal) }}</dd></div>
              <div><dt>Delivery</dt><dd>{{ formatCurrency(cart.deliveryTotal) }}</dd></div>
              <div class="cart-totals__grand"><dt>Total</dt><dd>{{ formatCurrency(cart.grandTotal) }}</dd></div>
            </dl>

            <section v-if="savings" class="cart-savings" data-testid="cart-savings" aria-labelledby="cart-savings-title">
              <div class="cart-savings__heading">
                <div>
                  <p class="section-kicker">Current demo offers</p>
                  <h3 id="cart-savings-title">Cart savings check</h3>
                </div>
                <span>{{ savings.itemsWithSavings }} {{ savings.itemsWithSavings === 1 ? 'line' : 'lines' }} can save</span>
              </div>
              <dl>
                <div><dt>Current cart</dt><dd data-testid="cart-current-total">{{ formatCurrency(savings.currentTotal) }}</dd></div>
                <div><dt>Lowest available</dt><dd data-testid="cart-optimized-total">{{ formatCurrency(savings.optimizedTotal) }}</dd></div>
                <div class="cart-savings__potential"><dt>Potential savings</dt><dd data-testid="cart-potential-savings">{{ formatCurrency(savings.potentialSavings) }}</dd></div>
              </dl>
              <p>{{ savings.basis }}</p>
            </section>

            <div class="cart-actions">
              <RouterLink class="button button--secondary button--full" to="/medications" @click="cart.closeDrawer()">Add another medication</RouterLink>
              <RouterLink v-if="cart.readyForCheckout" class="button button--full" to="/checkout" @click="cart.closeDrawer()">Go to checkout</RouterLink>
              <button v-else class="button button--full" type="button" disabled>Resolve unavailable items to check out</button>
            </div>
          </div>

          <section v-else class="empty-state empty-state--compact">
            <h3>Your cart is empty</h3>
            <p>Choose an exact medication and fulfillment option to begin.</p>
            <RouterLink class="button button--secondary" to="/medications" @click="cart.closeDrawer()">Browse medications</RouterLink>
          </section>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
