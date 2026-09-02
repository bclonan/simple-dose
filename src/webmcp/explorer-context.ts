import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCatalogStore } from '../stores/catalog.store'
import { useDrugExplorerStore } from '../stores/drugExplorer.store'
import type { ExplorerMutationContext, ExplorerToolDependencies, ExplorerWorkspaceSnapshot } from './explorer'

const contexts = new WeakMap<object, ExplorerToolDependencies>()
export const useExplorerToolDependencies = (revealWorkspace?: () => Promise<void>): ExplorerToolDependencies => {
  const explorer = useDrugExplorerStore()
  const existing = contexts.get(explorer)
  if (existing) return existing
  const catalog = useCatalogStore()
  const router = useRouter()
  const state = computed<ExplorerWorkspaceSnapshot>(() => {
    const choices = catalog.medications.filter(item => catalog.dataMode !== 'demo' || !item.publicOnly)
    const value = {
      selectedDrugs: explorer.selectedMedications.map(item => ({ id: item.id, name: item.genericName })),
      cards: explorer.cards.map(card => ({ ...card, drugIds: [...card.drugIds] })),
      catalog: choices.map(item => ({ id: item.id, name: item.genericName })),
      route: router.currentRoute.value.path,
    }
    // Resolution may add catalog identities. Only a workspace/mode edit invalidates its pending commit.
    return { ...value, revision: `${explorer.revision}-${catalog.dataMode}-${catalog.dataEpoch}` }
  })
  const check = (input: ExplorerMutationContext) => {
    input.signal?.throwIfAborted()
    if (input.expectedRevision !== state.value.revision) throw new Error('Drug Explorer changed. Refresh its WebMCP tools and retry with the current workspaceRevision.')
  }
  const dependencies: ExplorerToolDependencies = {
    snapshot: () => state.value,
    selectDrugs: input => explorer.configureWorkspace({ drugs: input.drugs, mode: input.mode, beforeCommit: () => check(input) }),
    showFacts: input => explorer.configureWorkspace({ drugs: input.drugs, facts: input.facts, factMode: input.mode, beforeCommit: () => check(input) }),
    updateFactCard: async input => { check(input); explorer.changeFactCard(input.cardId, input.factType); await explorer.loadSelected() },
    removeFactCard: input => { check(input); explorer.removeFactCard(input.cardId) },
    // The successful mutation owns this navigation, even after its schema gets refreshed.
    reveal: async () => {
      if (revealWorkspace) await revealWorkspace()
      else await router.push({ path: '/drugs/explore', query: explorer.routeQuery() })
    },
  }
  contexts.set(explorer, dependencies)
  return dependencies
}
