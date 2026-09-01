const SENSITIVE_KEYS = /name|birth|address|postal|zip|patient|prescriber|practice/i

export const redactSensitive = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.slice(0, 5).map(redactSensitive)
  if (value === null || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SENSITIVE_KEYS.test(key) ? '[redacted]' : redactSensitive(entry),
    ]),
  )
}

export const compactSummary = (value: unknown): unknown => {
  if (Array.isArray(value)) return { count: value.length, sample: value.slice(0, 2) }
  if (value === null || typeof value !== 'object') return value

  const entries = Object.entries(value as Record<string, unknown>).slice(0, 8)
  return Object.fromEntries(entries.map(([key, entry]) => [key, redactSensitive(entry)]))
}
