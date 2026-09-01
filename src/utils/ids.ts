let fallbackSequence = 0

export const createId = (prefix: string): string => {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `${prefix}-${uuid}`

  fallbackSequence += 1
  return `${prefix}-${Date.now()}-${fallbackSequence}`
}

export const createDisplayId = (prefix: string, sequence: number): string =>
  `${prefix}-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`
