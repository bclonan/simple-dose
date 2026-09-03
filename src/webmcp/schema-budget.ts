import type { JsonSchema, WebMcpToolDefinition } from './types'

// This is ClearDose's tested budget, not a claimed browser limit.
export const nativeDeclarationBudget = 18_000

// These JSON Schema annotations do not validate input. Keep them in the local
// catalog for the tool inspector, but omit them from the browser registration.
const nativeInputSchema = (schema: JsonSchema): JsonSchema => {
  const result = { ...schema }
  delete result.title
  delete result.default
  delete result.examples
  if (schema.properties) result.properties = Object.fromEntries(Object.entries(schema.properties).map(([name, property]) => [name, nativeInputSchema(property)]))
  if (schema.items) result.items = nativeInputSchema(schema.items)
  if (schema.oneOf) result.oneOf = schema.oneOf.map(nativeInputSchema)
  return result
}

export const nativeToolDefinition = (tool: WebMcpToolDefinition): WebMcpToolDefinition => ({
  name: tool.name,
  description: tool.description,
  inputSchema: nativeInputSchema(tool.inputSchema),
  annotations: {
    readOnlyHint: tool.annotations.readOnlyHint,
    untrustedContentHint: tool.annotations.untrustedContentHint ?? false,
  },
  execute: tool.execute,
})

type Declaration = Omit<WebMcpToolDefinition, 'execute'>

export const nativeDeclarationBytes = (tools: readonly Declaration[]): number =>
  new TextEncoder().encode(JSON.stringify(tools.map(tool => nativeToolDefinition({ ...tool, execute: () => null })))).length

export const assertNativeDeclarationBudget = (tools: readonly Declaration[]): void => {
  const bytes = nativeDeclarationBytes(tools)
  if (bytes > nativeDeclarationBudget) {
    throw new Error(`WebMCP declarations exceed ClearDose's ${nativeDeclarationBudget}-byte budget (${bytes}). Use paged catalog context instead of larger schemas.`)
  }
}
