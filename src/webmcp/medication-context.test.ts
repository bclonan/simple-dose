import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { useCatalogStore } from '../stores/catalog.store'
import { useMedicationToolDependencies } from './medication-context'
import type { DynamicMedicationDependencies } from './dynamic'

describe('current-page medication context', () => {
  it('tracks navigation, visible home cards, filtered results, and detail scope', async () => {
    const pinia = createPinia()
    const view = defineComponent({ template: '<div />' })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: view }, { path: '/medications', component: view }, { path: '/medications/:slug', component: view }, { path: '/webmcp', component: view }] })
    await router.push('/')
    let dependencies!: DynamicMedicationDependencies
    const wrapper = mount(defineComponent({ setup() { dependencies = useMedicationToolDependencies(); return () => null } }), { global: { plugins: [pinia, router] } })
    const first = dependencies.getSnapshot()
    expect(first.pageMedicationIds).toEqual(['med-atorvastatin', 'med-metformin', 'med-lisinopril', 'med-sertraline'])
    const catalog = useCatalogStore(pinia)
    await catalog.search('cholesterol')
    await router.push('/medications')
    const results = dependencies.getSnapshot()
    expect(results.route).toBe('/medications')
    expect(results.pageMedicationIds).toEqual(['med-atorvastatin', 'med-rosuvastatin'])
    expect(results.revision).not.toBe(first.revision)
    await router.push('/medications/atorvastatin')
    expect(dependencies.getSnapshot()).toMatchObject({ route: '/medications/atorvastatin', pageMedicationIds: ['med-atorvastatin'] })
    await router.push('/webmcp')
    expect(dependencies.getSnapshot().pageMedicationIds).toEqual([])
    wrapper.unmount()
  })
})
