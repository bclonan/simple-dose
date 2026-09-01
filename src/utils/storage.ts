const STORAGE_PREFIX = 'cleardose:'

export const storageKeys = {
  catalog: `${STORAGE_PREFIX}catalog`,
  selection: `${STORAGE_PREFIX}selection`,
  pricing: `${STORAGE_PREFIX}pricing`,
  prescription: `${STORAGE_PREFIX}prescription`,
  cart: `${STORAGE_PREFIX}cart`,
  orders: `${STORAGE_PREFIX}orders`,
  activity: `${STORAGE_PREFIX}activity`,
} as const

export const readStorage = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback

  try {
    const stored = window.localStorage.getItem(key)
    return stored === null ? fallback : (JSON.parse(stored) as T)
  } catch {
    return fallback
  }
}

export const writeStorage = (key: string, value: unknown): void => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be disabled or full. The in-memory app remains functional.
  }
}

export const clearClearDoseStorage = (): void => {
  if (typeof window === 'undefined') return
  Object.values(storageKeys).forEach((key) => window.localStorage.removeItem(key))
}
