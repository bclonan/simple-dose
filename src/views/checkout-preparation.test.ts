import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import type { DemoCheckoutInput } from '../domain/checkout'
import { useClearDoseActions } from '../services/cleardose.actions'
import { useAgentActivityStore } from '../stores/agentActivity.store'
import { useCartStore } from '../stores/cart.store'
import { useCatalogStore } from '../stores/catalog.store'
import { useCheckoutStore } from '../stores/checkout.store'
import { useOrderStore } from '../stores/order.store'
import { createClearDoseToolDefinitions } from '../webmcp/definitions'
import CheckoutView from './CheckoutView.vue'

enableAutoUnmount(afterEach)

const offer = { offerId: 'offer-atorvastatin-20-90-cleardose', deliveryOptionId: 'standard' }
const recipient = (): DemoCheckoutInput => ({
  fullName: 'First Fictional Recipient',
  address: { line1: '101 Example Draft Street', line2: 'Demo Unit 7', city: 'Sampleville', state: 'MD', postalCode: '21201' },
  prescriptionStatus: 'provider-will-send',
})

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
  useCatalogStore().dataMode = 'demo'
})

const setup = async (withCart = true) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/checkout', component: CheckoutView },
      { path: '/:pathMatch(.*)*', component: { template: '<main>Other route</main>' } },
    ],
  })
  await router.push('/medications')
  await router.isReady()
  const actions = useClearDoseActions({ navigate: path => router.push(path) })
  if (withCart) actions.addToCart(offer)
  const tool = createClearDoseToolDefinitions(actions).find(item => item.name === 'prepare_demo_checkout')!
  const wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [router] } })
  return { router, actions, tool, wrapper }
}

const field = (wrapper: VueWrapper, autocomplete: string) => wrapper.get(`input[autocomplete="${autocomplete}"]`)
const fieldValue = (wrapper: VueWrapper, autocomplete: string) => (field(wrapper, autocomplete).element as HTMLInputElement).value
const storedValues = () => Object.values(window.localStorage).join('\n')
const assertNoRecipientStored = (input: DemoCheckoutInput) => {
  const stored = storedValues()
  for (const value of [input.fullName, input.address.line1, input.address.line2, input.address.city]) {
    if (value) expect(stored).not.toContain(value)
  }
  expect(window.localStorage.getItem('cleardose:orders')).toBeNull()
}

describe('visible checkout preparation through WebMCP', () => {
  it('fills every visible field, updates the same mounted form and only orders after the person clicks', async () => {
    const { tool, wrapper, router } = await setup()
    await useClearDoseActions().createPrescriptionRequestCard(offer)
    const cart = useCartStore()
    const total = cart.grandTotal
    const first = recipient()
    const output = await tool.execute(first)
    await flushPromises()
    expect(output).toMatchObject({ route: '/checkout', prepared: true, orderCreated: false, itemCount: 1, total })
    expect(router.currentRoute.value.path).toBe('/checkout')
    expect(cart.drawerOpen).toBe(false)
    expect(fieldValue(wrapper, 'name')).toBe(first.fullName)
    expect(fieldValue(wrapper, 'address-line1')).toBe(first.address.line1)
    expect(fieldValue(wrapper, 'address-line2')).toBe(first.address.line2)
    expect(fieldValue(wrapper, 'address-level2')).toBe(first.address.city)
    expect(fieldValue(wrapper, 'address-level1')).toBe(first.address.state)
    expect(fieldValue(wrapper, 'postal-code')).toBe(first.address.postalCode)
    expect((wrapper.get('input[value="provider-will-send"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toContain('No order has been placed')
    expect(wrapper.get('[data-testid="checkout-total"]').text()).toBe('$17.80')
    expect(useOrderStore().orders).toHaveLength(0)
    assertNoRecipientStored(first)

    const checkoutForm = wrapper.get('.checkout-form').element
    const second: DemoCheckoutInput = {
      fullName: 'Second Fictional Recipient',
      address: { line1: '202 Replacement Draft Road', city: 'Mocktown', state: 'va', postalCode: '20101-1234' },
      prescriptionStatus: 'request-prepared',
    }
    await tool.execute(second)
    await flushPromises()
    expect(wrapper.get('.checkout-form').element).toBe(checkoutForm)
    expect(fieldValue(wrapper, 'name')).toBe(second.fullName)
    expect(fieldValue(wrapper, 'address-line1')).toBe(second.address.line1)
    expect(fieldValue(wrapper, 'address-line2')).toBe('')
    expect(fieldValue(wrapper, 'address-level2')).toBe(second.address.city)
    expect(fieldValue(wrapper, 'address-level1')).toBe('VA')
    expect(fieldValue(wrapper, 'postal-code')).toBe(second.address.postalCode)
    expect((wrapper.get('input[value="request-prepared"]').element as HTMLInputElement).checked).toBe(true)
    expect(useOrderStore().orders).toHaveLength(0)
    expect(cart.itemCount).toBe(1)
    assertNoRecipientStored(first)
    assertNoRecipientStored(second)

    await field(wrapper, 'name').setValue('Reviewed Fictional Recipient')
    await field(wrapper, 'address-line2').setValue('Human reviewed unit 9')
    await field(wrapper, 'postal-code').setValue('20102')
    await wrapper.get('input[value="provider-will-send"]').setValue()
    expect(useCheckoutStore().form).toMatchObject({ fullName: 'Reviewed Fictional Recipient', line2: 'Human reviewed unit 9', postalCode: '20102', prescriptionStatus: 'provider-will-send' })
    expect(storedValues()).not.toContain('Reviewed Fictional Recipient')
    expect(storedValues()).not.toContain('Human reviewed unit 9')
    expect(useOrderStore().orders).toHaveLength(0)

    await wrapper.get('[data-testid="place-order"]').trigger('click')
    await flushPromises()
    expect(useOrderStore().orders).toHaveLength(1)
    expect(useOrderStore().currentOrder).toMatchObject({
      fullName: 'Reviewed Fictional Recipient',
      address: { line1: second.address.line1, line2: 'Human reviewed unit 9', city: second.address.city, state: 'VA', postalCode: '20102' },
      prescriptionStatus: 'provider-will-send', total,
    })
    expect(router.currentRoute.value.path).toMatch(/^\/orders\/CD-/)
    expect(cart.itemCount).toBe(0)
    expect(useCheckoutStore().prepared).toBe(false)
    expect(useCheckoutStore().form).toEqual({ fullName: '', line1: '', line2: '', city: '', state: '', postalCode: '', prescriptionStatus: 'provider-will-send' })
    expect(useAgentActivityStore().entries.filter(entry => entry.toolName === 'prepare_demo_checkout')).toHaveLength(2)
  })

  it('keeps drafts in memory across route visits and does not restore them after a fresh store starts', async () => {
    const { tool, router, wrapper } = await setup()
    const input = recipient()
    await tool.execute(input)
    await router.push('/medications')
    await router.push('/checkout')
    await flushPromises()
    expect(fieldValue(wrapper, 'name')).toBe(input.fullName)
    assertNoRecipientStored(input)
    wrapper.unmount()
    setActivePinia(createPinia())
    expect(useCheckoutStore().prepared).toBe(false)
    expect(useCheckoutStore().form.fullName).toBe('')
    expect(useCheckoutStore().form.line1).toBe('')
    expect(useCartStore().itemCount).toBe(1)
  })

  it('rejects malformed input and an unmatched prepared request without changing an existing draft', async () => {
    const { tool, wrapper, router } = await setup()
    await tool.execute(recipient())
    await flushPromises()
    const before = JSON.stringify(useCheckoutStore().$state)
    const invalid = [
      { ...recipient(), fullName: '' },
      { ...recipient(), address: {} },
      { ...recipient(), address: { ...recipient().address, postalCode: '123' } },
      { ...recipient(), address: { ...recipient().address, state: 'USA' } },
      { ...recipient(), prescriptionStatus: 'request-prepared' },
    ]
    for (const input of invalid) {
      await expect(tool.execute(input)).rejects.toThrow()
      expect(JSON.stringify(useCheckoutStore().$state)).toBe(before)
      expect(useOrderStore().orders).toHaveLength(0)
      expect(useCartStore().itemCount).toBe(1)
    }
    expect(router.currentRoute.value.path).toBe('/checkout')
    expect(fieldValue(wrapper, 'name')).toBe(recipient().fullName)
    assertNoRecipientStored(recipient())
  })

  it('rejects an empty cart without opening checkout or filling the draft', async () => {
    const { tool, router } = await setup(false)
    const before = JSON.stringify(useCheckoutStore().$state)
    await expect(tool.execute(recipient())).rejects.toThrow(/cart is empty/i)
    expect(JSON.stringify(useCheckoutStore().$state)).toBe(before)
    expect(router.currentRoute.value.path).toBe('/medications')
    expect(useOrderStore().orders).toHaveLength(0)
    assertNoRecipientStored(recipient())
  })

  it('preserves an existing draft when a cart item becomes invalid and disables checkout', async () => {
    const { tool, wrapper } = await setup()
    await tool.execute(recipient())
    const before = JSON.stringify(useCheckoutStore().$state)
    const cart = useCartStore()
    cart.items[0]!.skuId = 'sku-unrestorable-test'
    await flushPromises()
    await expect(tool.execute({ ...recipient(), fullName: 'Rejected Replacement Recipient' })).rejects.toThrow(/needs review/i)
    expect(JSON.stringify(useCheckoutStore().$state)).toBe(before)
    expect(cart.itemCount).toBe(1)
    expect(wrapper.get('[role="alert"]').text()).toContain('Some cart items need attention')
    expect(wrapper.get('[data-testid="place-order"]').attributes('disabled')).toBeDefined()
    expect(useOrderStore().orders).toHaveLength(0)
    expect(storedValues()).not.toContain('Rejected Replacement Recipient')
  })

  it('shows invalid human edits as a visible error and retains the draft for correction', async () => {
    const { tool, wrapper } = await setup()
    await tool.execute(recipient())
    await flushPromises()
    await field(wrapper, 'postal-code').setValue('123')
    await wrapper.get('[data-testid="place-order"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('valid ZIP code')
    expect(fieldValue(wrapper, 'postal-code')).toBe('123')
    expect(useCheckoutStore().prepared).toBe(true)
    expect(useOrderStore().orders).toHaveLength(0)
    expect(useCartStore().itemCount).toBe(1)
    expect(wrapper.get('[data-testid="place-order"]').attributes('disabled')).toBeUndefined()
    assertNoRecipientStored(recipient())
  })
})
