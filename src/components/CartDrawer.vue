<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useClearDoseActions } from '../services/cleardose.actions'
import { useCartStore } from '../stores/cart.store'
import { formatCurrency } from '../utils/format'

const cart = useCartStore()
const actions = useClearDoseActions()
const closeButton = ref<HTMLButtonElement | null>(null)
let restoreFocus: HTMLElement | null = null

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
              <p class="section-kicker">Your selection</p>
              <h2 id="cart-title">Cart <span>({{ cart.itemCount }})</span></h2>
            </div>
            <button ref="closeButton" class="icon-button" type="button" aria-label="Close cart" @click="cart.closeDrawer()">×</button>
          </header>

          <p class="drawer-feedback" aria-live="polite">{{ cart.feedbackMessage }}</p>

          <div v-if="cart.itemCount" class="cart-lines">
            <article v-for="line in cart.detailedItems" :key="line.item.id" class="cart-line">
              <div class="cart-line__title">
                <div>
                  <h3>{{ line.medication.genericName }}</h3>
                  <p>{{ line.sku.strength }} {{ line.sku.form }} · {{ line.sku.quantity }} count</p>
                </div>
                <strong>{{ formatCurrency(line.total) }}</strong>
              </div>
              <p>{{ line.pharmacy.name }}</p>
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

            <dl class="cart-totals">
              <div><dt>Medication</dt><dd>{{ formatCurrency(cart.medicationSubtotal) }}</dd></div>
              <div><dt>Delivery</dt><dd>{{ formatCurrency(cart.deliveryTotal) }}</dd></div>
              <div class="cart-totals__grand"><dt>Total</dt><dd>{{ formatCurrency(cart.grandTotal) }}</dd></div>
            </dl>

            <RouterLink class="button button--full" to="/checkout" @click="cart.closeDrawer()">Go to checkout</RouterLink>
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
