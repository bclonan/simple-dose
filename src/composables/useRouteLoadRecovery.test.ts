import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '../App.vue'
import { useClearDoseActions } from '../services/cleardose.actions'
import { useCartStore } from '../stores/cart.store'
import { useCatalogStore } from '../stores/catalog.store'
import { useCheckoutStore } from '../stores/checkout.store'
import { isRouteModuleLoadError, sameOriginReloadPath } from './useRouteLoadRecovery'

vi.mock('../webmcp/register', () => ({ registerClearDoseTools: vi.fn().mockResolvedValue({ supported: false, dispose: () => {} }) }))
enableAutoUnmount(afterEach)
beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
  useCatalogStore().dataMode = 'demo'
  vi.spyOn(useCatalogStore(), 'bootstrapPublicCatalog').mockResolvedValue()
})
afterEach(() => vi.restoreAllMocks())

const setup = async (failure: Error) => {
  const page = { template: '<main>Current page</main>' }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/medications', component: page },
    { path: '/compare', component: page },
    { path: '/drugs/explore', component: () => Promise.reject(failure) },
  ] })
  await router.push('/medications')
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [router], stubs: { AppHeader: true, AppDisclaimer: true, CartDrawer: true, WebMCPBadge: true, WebMCPDrawer: true } } })
  await flushPromises()
  return { router, wrapper }
}

describe('route module failure recovery', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://example.com/assets/OldView.js',
    'error loading dynamically imported module: https://example.com/assets/OldView.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/OldView.css',
    'Loading chunk medication-view failed.',
    'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
  ])('recognizes a module loading error: %s', (message) => {
    expect(isRouteModuleLoadError(new Error(message))).toBe(true)
  })

  it('does not classify general network, application or syntax failures as stale chunks', () => {
    for (const message of ['Failed to fetch', 'Medication was not found.', "Unexpected token '<'", 'Initial route failed.']) {
      expect(isRouteModuleLoadError(new Error(message))).toBe(false)
    }
    expect(isRouteModuleLoadError(null)).toBe(false)
  })

  it('only allows a same-origin path and retains the intended query and fragment', () => {
    const origin = 'https://cleardose-webmcp-demo.netlify.app'
    expect(sameOriginReloadPath('/drugs/explore?drugs=metformin&facts=pricing#report', origin)).toBe('/drugs/explore?drugs=metformin&facts=pricing#report')
    for (const path of ['https://other.example/path', '//other.example/path', '/\\other.example/path', 'javascript:alert(1)']) {
      expect(sameOriginReloadPath(path, origin)).toBeNull()
    }
  })

  it('shows a deliberate reload link without resetting the saved cart or unsaved draft', async () => {
    const failure = new TypeError('Failed to fetch dynamically imported module: /assets/OldView.js')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { router, wrapper } = await setup(failure)
    const actions = useClearDoseActions()
    actions.addToCart({ offerId: 'offer-atorvastatin-20-90-cleardose', deliveryOptionId: 'standard' })
    useCheckoutStore().form.fullName = 'Unsaved Fictional Draft'
    const cartBefore = window.localStorage.getItem('cleardose:cart')
    const locationBefore = window.location.href
    const destination = '/drugs/explore?drugs=metformin&facts=pricing#report'
    await expect(router.push(destination)).rejects.toBe(failure)
    await flushPromises()
    const banner = wrapper.get('[data-testid="route-load-recovery"]')
    expect(banner.attributes('role')).toBe('alert')
    expect(banner.text()).toContain('Reloading keeps your saved cart')
    expect(banner.text()).toContain('Unsaved checkout fields will clear')
    expect(banner.get('a').text()).toBe('Reload page')
    expect(banner.get('a').attributes('href')).toBe(destination)
    expect(banner.get('a').attributes('aria-describedby')).toBe('route-reload-notice')
    expect(router.currentRoute.value.path).toBe('/medications')
    expect(window.location.href).toBe(locationBefore)
    expect(useCheckoutStore().form.fullName).toBe('Unsaved Fictional Draft')
    expect(useCartStore().itemCount).toBe(1)
    expect(window.localStorage.getItem('cleardose:cart')).toBe(cartBefore)

    await router.push('/compare')
    await flushPromises()
    expect(wrapper.find('[data-testid="route-load-recovery"]').exists()).toBe(false)
    expect(useCheckoutStore().form.fullName).toBe('Unsaved Fictional Draft')
  })

  it('keeps unknown errors rejected, logged and available to other router listeners', async () => {
    const failure = new Error('Unexpected checkout application failure.')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { router, wrapper } = await setup(failure)
    const otherListener = vi.fn()
    router.onError(otherListener)
    await expect(router.push('/drugs/explore')).rejects.toBe(failure)
    await flushPromises()
    expect(log).toHaveBeenCalledWith(failure)
    expect(otherListener).toHaveBeenCalledWith(failure, expect.objectContaining({ path: '/drugs/explore' }), expect.objectContaining({ path: '/medications' }))
    expect(wrapper.find('[data-testid="route-load-recovery"]').exists()).toBe(false)
  })
})
