import { useClearDoseActions } from '../services/cleardose.actions'
import {
  useWebMcpStore,
  type WebMcpStatusStore,
} from '../stores/webmcp.store'
import {
  clearDoseToolNames,
  createClearDoseToolDefinitions,
} from './definitions'
import {
  getModelContext,
  getTools,
  isWebMcpSupported,
  listenForToolChanges,
} from './support'
import type {
  WebMcpDocumentLike,
  WebMcpToolDefinition,
} from './types'

export interface RegisterClearDoseToolsOptions {
  navigate?: (path: string) => unknown | Promise<unknown>
  documentRef?: WebMcpDocumentLike
  statusStore?: WebMcpStatusStore
}

export interface ClearDoseToolRegistration {
  readonly supported: boolean
  readonly registeredToolNames: readonly string[]
  readonly registrationError: string | null
  dispose(): void
}

export type ClearDoseRegistration = ClearDoseToolRegistration

const browserDocument = (): WebMcpDocumentLike | undefined =>
  typeof document === 'undefined' ? undefined : (document as Document & WebMcpDocumentLike)

const browserDefinition = (definition: WebMcpToolDefinition): WebMcpToolDefinition => ({
  name: definition.name,
  title: definition.title,
  description: definition.description,
  inputSchema: definition.inputSchema,
  annotations: {
    readOnlyHint: definition.annotations.readOnlyHint,
    untrustedContentHint: definition.annotations.untrustedContentHint ?? false,
  },
  execute: definition.execute,
})

const expectedNameSet = new Set(clearDoseToolNames)

export const registerClearDoseTools = async (
  options: RegisterClearDoseToolsOptions = {},
): Promise<ClearDoseToolRegistration> => {
  const documentRef = options.documentRef ?? browserDocument()
  const statusStore = options.statusStore ?? useWebMcpStore()
  const supported = isWebMcpSupported(documentRef)

  if (!supported) {
    statusStore.setUnsupported()
    return {
      supported: false,
      registeredToolNames: [],
      registrationError: null,
      dispose: () => statusStore.reset(),
    }
  }

  const context = getModelContext(documentRef)
  if (!context) {
    statusStore.setUnsupported()
    return {
      supported: false,
      registeredToolNames: [],
      registrationError: null,
      dispose: () => statusStore.reset(),
    }
  }

  const controller = new AbortController()
  const definitions = createClearDoseToolDefinitions(
    useClearDoseActions({
      navigate: options.navigate
        ? async (path) => {
            await options.navigate?.(path)
          }
        : undefined,
    }),
  )
  let disposed = false
  let refreshVersion = 0
  let stopListening: () => void = () => undefined

  const refreshRegisteredNames = async (): Promise<void> => {
    const version = ++refreshVersion
    if (disposed) return
    let names: string[]
    try {
      names =
        typeof context.getTools === 'function'
          ? (await getTools(documentRef))
              .map((tool) => tool.name)
              .filter((name) => expectedNameSet.has(name))
          : definitions.map((tool) => tool.name)
    } catch (error) {
      if (disposed || version !== refreshVersion) return
      throw error
    }
    if (disposed || version !== refreshVersion) return
    const verified = typeof context.getTools === 'function'
    const missingNames = clearDoseToolNames.filter((name) => !names.includes(name))
    if (verified && missingNames.length > 0) {
      statusStore.setDegraded(names, missingNames)
    } else {
      statusStore.setRegistered(names, verified)
    }
  }

  const registration: ClearDoseToolRegistration = {
    supported: true,
    get registeredToolNames() {
      return [...statusStore.registeredToolNames]
    },
    get registrationError() {
      return statusStore.registrationError
    },
    dispose() {
      if (disposed) return
      disposed = true
      refreshVersion += 1
      stopListening()
      controller.abort()
      statusStore.reset()
    },
  }

  statusStore.beginRegistration(true)
  try {
    for (const definition of definitions) {
      controller.signal.throwIfAborted()
      await context.registerTool(browserDefinition(definition), {
        signal: controller.signal,
      })
    }
    stopListening = listenForToolChanges(async () => {
      try {
        await refreshRegisteredNames()
      } catch (error) {
        if (!disposed) statusStore.setError(error)
      }
    }, documentRef)
    await refreshRegisteredNames()
  } catch (error) {
    refreshVersion += 1
    stopListening()
    stopListening = () => undefined
    controller.abort()
    statusStore.setError(error)
  }

  return registration
}
