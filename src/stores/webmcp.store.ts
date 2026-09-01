import { defineStore } from 'pinia'

export type WebMcpRegistrationStatus =
  | 'idle'
  | 'registering'
  | 'ready'
  | 'ready-unverified'
  | 'degraded'
  | 'unsupported'
  | 'error'

interface WebMcpState {
  supported: boolean
  status: WebMcpRegistrationStatus
  registeredToolNames: string[]
  registrationError: string | null
}

const initialState = (): WebMcpState => ({
  supported: false,
  status: 'idle',
  registeredToolNames: [],
  registrationError: null,
})

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'WebMCP tool registration failed.'

export const useWebMcpStore = defineStore('webmcp', {
  state: initialState,
  getters: {
    registeredToolCount: (state): number => state.registeredToolNames.length,
    isReady: (state): boolean =>
      state.status === 'ready' || state.status === 'ready-unverified',
    canExecuteNatively: (state) => (name: string): boolean =>
      (state.status === 'ready' || state.status === 'degraded') &&
      state.registeredToolNames.includes(name),
  },
  actions: {
    beginRegistration(supported: boolean): void {
      this.supported = supported
      this.status = supported ? 'registering' : 'unsupported'
      this.registeredToolNames = []
      this.registrationError = null
    },
    setRegistered(names: readonly string[], verified = true): void {
      this.supported = true
      this.registeredToolNames = [...new Set(names)].sort()
      this.status = verified ? 'ready' : 'ready-unverified'
      this.registrationError = null
    },
    setDegraded(names: readonly string[], missingNames: readonly string[]): void {
      this.supported = true
      this.registeredToolNames = [...new Set(names)].sort()
      this.status = 'degraded'
      this.registrationError = `WebMCP registry is incomplete. Missing: ${missingNames.join(', ')}.`
    },
    setUnsupported(): void {
      this.supported = false
      this.status = 'unsupported'
      this.registeredToolNames = []
      this.registrationError = null
    },
    setError(error: unknown): void {
      this.supported = true
      this.status = 'error'
      this.registeredToolNames = []
      this.registrationError = errorMessage(error)
    },
    reset(): void {
      Object.assign(this, initialState())
    },
  },
})

export type WebMcpStatusStore = ReturnType<typeof useWebMcpStore>
