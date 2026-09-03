import { onScopeDispose, readonly, ref } from 'vue'
import type { Router } from 'vue-router'

export const isRouteModuleLoadError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'ChunkLoadError') return true
  return typeof message === 'string' && /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading (?:css )?chunk [\w-]+ failed|unable to preload css for|failed to load module script/i.test(message)
}

export const sameOriginReloadPath = (path: string, origin: string): string | null => {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null
  try {
    const url = new URL(path, origin)
    return url.origin === origin && /^https?:$/.test(url.protocol) ? `${url.pathname}${url.search}${url.hash}` : null
  } catch { return null }
}

// Never reload automatically. The person may still have an unsaved checkout draft.
export const useRouteLoadRecovery = (router: Router) => {
  const failedRoute = ref<string | null>(null)
  const removeErrorHandler = router.onError((error, to) => {
    // Installing onError replaces Vue Router's default logging. Keep unknown
    // failures visible in the console and preserve the rejected navigation.
    console.error(error)
    failedRoute.value = isRouteModuleLoadError(error) && typeof window !== 'undefined'
      ? sameOriginReloadPath(to.fullPath, window.location.origin)
      : null
  })
  const removeAfterEach = router.afterEach((_to, _from, failure) => {
    if (!failure) failedRoute.value = null
  })
  onScopeDispose(() => { removeErrorHandler(); removeAfterEach() })
  return { failedRoute: readonly(failedRoute) }
}
