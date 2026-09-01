export type JsonPrimitive = string | number | boolean | null

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean'
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean
  items?: JsonSchema
  enum?: JsonPrimitive[]
  const?: JsonPrimitive
  default?: JsonValue
  examples?: JsonValue[]
  format?: string
  pattern?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
}

export interface WebMcpToolAnnotations {
  readOnlyHint: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
  untrustedContentHint?: boolean
}

export interface WebMcpExecutionOptions {
  signal?: AbortSignal
}

export interface WebMcpRegistrationOptions {
  signal: AbortSignal
  exposedTo?: string[]
}

export interface WebMcpToolDefinition {
  name: string
  title?: string
  description: string
  inputSchema: JsonSchema
  annotations: WebMcpToolAnnotations
  execute(input: unknown, options?: WebMcpExecutionOptions): JsonValue | Promise<JsonValue>
}

export interface RegisteredWebMcpTool {
  name: string
  title?: string
  description: string
  inputSchema?: JsonSchema
  annotations?: WebMcpToolAnnotations
  origin?: string
  window?: Window
}

export interface WebMcpModelContext {
  registerTool(
    definition: WebMcpToolDefinition,
    options: WebMcpRegistrationOptions,
  ): Promise<void>
  getTools?: (options?: { fromOrigins?: string[] }) => Promise<RegisteredWebMcpTool[]>
  executeTool?: (
    tool: RegisteredWebMcpTool,
    input?: string,
    options?: WebMcpExecutionOptions,
  ) => Promise<unknown>
  addEventListener?: (type: 'toolchange', listener: EventListener) => void
  removeEventListener?: (type: 'toolchange', listener: EventListener) => void
}

export interface WebMcpDocumentLike {
  readonly modelContext?: WebMcpModelContext
}

export type ClearDoseToolCategory =
  | 'discovery'
  | 'pricing'
  | 'prescription'
  | 'commerce'

export interface ClearDoseToolDescriptor {
  name: string
  title: string
  description: string
  category: ClearDoseToolCategory
  inputSchema: JsonSchema
  annotations: WebMcpToolAnnotations
  exampleInput: Record<string, JsonValue>
}

export type ClearDoseToolDefinition = ClearDoseToolDescriptor & WebMcpToolDefinition
