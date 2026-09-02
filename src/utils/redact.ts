const SENSITIVE_KEYS = /name|birth|address|postal|zip|patient|prescriber|practice/i
const PUBLIC_KEYS = new Set(['genericName', 'brandNames', 'pharmacyName', 'pharmacyShortName', 'toolName', 'manufacturers'])
const CONTEXT_ID_KEYS = new Set(['catalogMedicationIds', 'itemIds', 'offerIds', 'selectedDrugIds', 'drugIds'])

export const redactSensitive = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.slice(0, 5).map(redactSensitive)
  if (value === null || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SENSITIVE_KEYS.test(key) && !PUBLIC_KEYS.has(key) ? '[redacted]' :
        CONTEXT_ID_KEYS.has(key) && Array.isArray(entry) ? entry.filter(item => typeof item === 'string').slice(0, 112) :
          ['facts', 'factTypes', 'cards'].includes(key) && Array.isArray(entry) ? entry.slice(0, 14).map(redactSensitive) :
            key === 'rows' && Array.isArray(entry) ? entry.slice(0, 10).map(redactSensitive) : redactSensitive(entry),
    ]),
  )
}

export const formatActivityJson = (value: unknown): string => {
  try {
    const formatted = JSON.stringify(redactSensitive(value ?? {}), null, 2)
    return formatted.length <= 16_000 ? formatted : `${formatted.slice(0, 16_000)}\n... [bounded at 16,000 characters]`
  } catch {
    return '{\n  "context": "unavailable"\n}'
  }
}

export const compactSummary = (value: unknown): unknown => {
  if (Array.isArray(value)) return { count: value.length, sample: value.slice(0, 2) }
  if (value === null || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  // Contextual tools already page their normalized output to 1,500 characters.
  // Preserve those field rows and their notice so the visible receipt is useful.
  if ((typeof record.format === 'string' && record.format.startsWith('JSON Pointer field rows.') || typeof record.workspaceRevision === 'string') &&
    Array.isArray(record.rows) && JSON.stringify(record).length <= 1_500) {
    return { ...redactSensitive(record) as Record<string, unknown>, rows: record.rows.slice(0, 10).map(redactSensitive) }
  }

  const entries = Object.entries(record).slice(0, 8)
  return Object.fromEntries(entries.map(([key, entry]) => [key, redactSensitive(entry)]))
}
