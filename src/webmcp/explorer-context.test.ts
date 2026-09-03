import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { useCatalogStore } from '../stores/catalog.store'
import { useDrugExplorerStore } from '../stores/drugExplorer.store'
import { createExplorerTools, type ExplorerToolDependencies } from './explorer'
import { useExplorerToolDependencies } from './explorer-context'

describe('Explorer card edit completion', () => {
  it.each(['workspace', 'mode'])('rejects a card update superseded by a later %s change without revealing old work', async kind => {
    const pinia = createPinia()
    const component = defineComponent({ template: '<div />' })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component }] })
    await router.push('/')
    const reveal = vi.fn(async () => undefined)
    let dependencies!: ExplorerToolDependencies
    const wrapper = mount(defineComponent({ setup() { dependencies = useExplorerToolDependencies(reveal); return () => null } }), { global: { plugins: [pinia, router] } })
    try {
      const explorer = useDrugExplorerStore(pinia)
      const catalog = useCatalogStore(pinia)
      explorer.selectedDrugIds = ['med-metformin']
      explorer.cards = [{ id: 'fact-1', factType: 'uses', drugIds: ['med-metformin'] }]
      let release!: () => void
      const facts = new Promise<void>(resolve => { release = resolve })
      vi.spyOn(catalog, 'loadMedication').mockImplementation(async () => { await facts })
      vi.spyOn(catalog, 'bootstrapPublicCatalog').mockResolvedValue()
      const edit = createExplorerTools(dependencies).find(tool => tool.name === 'cleardose_update_fact_card')!
      const pending = edit.execute({ workspaceRevision: dependencies.snapshot().revision, cardId: 'fact-1', factType: 'warnings' })
      const rejected = expect(pending).rejects.toThrow('superseded')
      expect(explorer.cards[0]?.factType).toBe('warnings')
      if (kind === 'workspace') explorer.clearWorkspace()
      else catalog.setDataMode('hybrid')
      const latestRevision = dependencies.snapshot().revision
      release()
      await rejected
      expect(dependencies.snapshot().revision).toBe(latestRevision)
      expect(reveal).not.toHaveBeenCalled()
      if (kind === 'workspace') expect(explorer.cards).toEqual([])
    } finally { wrapper.unmount() }
  })
})
