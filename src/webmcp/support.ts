import type {
  JsonValue,
  RegisteredWebMcpTool,
  WebMcpDocumentLike,
  WebMcpExecutionOptions,
  WebMcpModelContext,
} from './types'

const browserDocument = (): WebMcpDocumentLike | undefined =>
  typeof document === 'undefined' ? undefined : (document as Document & WebMcpDocumentLike)

export const getModelContext = (
  documentRef: WebMcpDocumentLike | undefined = browserDocument(),
): WebMcpModelContext | undefined => documentRef?.modelContext

export const isWebMcpSupported = (
  documentRef: WebMcpDocumentLike | undefined = browserDocument(),
): boolean => typeof getModelContext(documentRef)?.registerTool === 'function'

export const getTools = async (
  documentRef: WebMcpDocumentLike | undefined = browserDocument(),
): Promise<RegisteredWebMcpTool[]> => {
  const context = getModelContext(documentRef)
  if (!context || typeof context.getTools !== 'function') return []
  const tools = await context.getTools()
  return Array.isArray(tools) ? tools.filter((tool) => typeof tool?.name === 'string') : []
}

const parseExecutionResult = (result: unknown): unknown => {
  if (typeof result !== 'string') return result
  try {
    return JSON.parse(result) as unknown
  } catch {
    return result
  }
}

const requiresLegacyObjectInput = (error: unknown): boolean =>
  error instanceof Error && /requires? an object input|input must be an object/i.test(error.message)

export const executeTool = async (
  name: string,
  input: Record<string, JsonValue> = {},
  documentRef: WebMcpDocumentLike | undefined = browserDocument(),
  options?: WebMcpExecutionOptions,
): Promise<unknown> => {
  const context = getModelContext(documentRef)
  if (!context || typeof context.getTools !== 'function' || typeof context.executeTool !== 'function') {
    throw new Error('WebMCP tool execution is not available in this browser.')
  }

  const tool = (await getTools(documentRef)).find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`WebMCP tool "${name}" is not registered.`)
  options?.signal?.throwIfAborted()
  try {
    return parseExecutionResult(
      await context.executeTool(tool, JSON.stringify(input), options),
    )
  } catch (error) {
    // Never retry a mutation under a second calling convention.
    if (!tool.annotations?.readOnlyHint || !requiresLegacyObjectInput(error)) throw error
    const legacyExecute = context.executeTool as unknown as (
      target: RegisteredWebMcpTool,
      legacyInput: Record<string, JsonValue>,
      executionOptions?: WebMcpExecutionOptions,
    ) => Promise<unknown>
    return parseExecutionResult(await legacyExecute.call(context, tool, input, options))
  }
}

export const listenForToolChanges = (
  listener: () => void | Promise<void>,
  documentRef: WebMcpDocumentLike | undefined = browserDocument(),
): (() => void) => {
  const context = getModelContext(documentRef)
  if (!context || typeof context.addEventListener !== 'function') return () => undefined

  const eventListener: EventListener = () => {
    void listener()
  }
  context.addEventListener('toolchange', eventListener)
  return () => context.removeEventListener?.('toolchange', eventListener)
}
