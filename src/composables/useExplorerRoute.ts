import { nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDrugExplorerStore } from '../stores/drugExplorer.store'
import { useCatalogStore } from '../stores/catalog.store'

// One binding for the whole app, including changes made by an agent on another page.
export const useExplorerRoute = () => {
  const router = useRouter()
  const explorer = useDrugExplorerStore()
  const catalog = useCatalogStore()
  let hydrating = 0
  let pendingHydration: Promise<void> | undefined
  let lastWritten = ''
  const key = (query: Record<string, unknown>) => JSON.stringify([query.drugs ?? '', query.facts ?? ''])
  const syncToRoute = async () => {
    if (hydrating || router.currentRoute.value.path !== '/drugs/explore') return
    const query = explorer.routeQuery()
    if (key(router.currentRoute.value.query) === key(query)) return
    lastWritten = key(query)
    await router.replace({ path: '/drugs/explore', query })
  }
  const hydrate = async (query: Record<string, unknown>) => {
    hydrating++
    let success = false
    try { success = await explorer.hydrateFromRoute(query) } finally { hydrating-- }
    // Canonicalize aliases/defaults only after a successful hydration.
    if (success) await syncToRoute()
  }
  const startHydration = (query: Record<string, unknown>) => {
    const pending = hydrate(query).finally(() => {
      if (pendingHydration === pending) pendingHydration = undefined
    })
    pendingHydration = pending
    return pending
  }
  watch(() => router.currentRoute.value.fullPath, async () => {
    const route = router.currentRoute.value
    if (route.path !== '/drugs/explore') return
    const routeKey = key(route.query)
    if (routeKey === lastWritten) { lastWritten = ''; return }
    await startHydration(route.query)
  }, { immediate: true })
  watch(() => JSON.stringify(explorer.routeQuery()), () => { void syncToRoute() })
  watch(() => catalog.dataMode, async () => {
    const route = router.currentRoute.value
    if (route.path === '/drugs/explore' && key(route.query) !== key(explorer.routeQuery())) {
      await startHydration(route.query)
    } else await explorer.loadSelected()
  })
  return {
    ready: async () => {
      // Initial lazy navigation and URL hydration must finish before native tools
      // can edit the workspace. Later navigation keeps its existing precedence.
      await router.isReady()
      await nextTick()
      while (pendingHydration) {
        await pendingHydration
        await nextTick()
      }
    },
    syncToRoute,
    reveal: async () => {
      const query = explorer.routeQuery()
      lastWritten = key(query)
      await router.push({ path: '/drugs/explore', query })
    },
  }
}
