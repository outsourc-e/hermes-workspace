import { create } from 'zustand'

const SETUP_STORAGE_KEY = 'hermes-gateway-configured'

type GatewaySetupState = {
  isOpen: boolean
  setupConfigured: boolean
  step: 'gateway' | 'provider' | 'complete'
  gatewayUrl: string
  gatewayToken: string
  testStatus: 'idle' | 'testing' | 'success' | 'error'
  testError: string | null
  saving: boolean
  _initialized: boolean
  initialize: () => Promise<void>
  loadCurrentConfig: () => Promise<void>
  setGatewayUrl: (url: string) => void
  setGatewayToken: (token: string) => void
  /** Save URL/token to server .env, then test connection */
  saveAndTest: () => Promise<boolean>
  /** Just test current server connection (no save) */
  testConnection: () => Promise<boolean>
  autoDetectGateway: () => Promise<{ ok: boolean; url?: string; token?: string; error?: string }>
  proceed: () => void
  skipProviderSetup: () => void
  completeSetup: () => void
  reset: () => void
  open: () => void
  close: () => void
}

type SavedGatewayConfig = {
  url: string
  token: string
}

function normalizeGatewayUrl(url: string): string {
  const trimmedUrl = url.trim()

  if (trimmedUrl.startsWith('http://')) {
    return `ws://${trimmedUrl.slice('http://'.length)}`
  }

  if (trimmedUrl.startsWith('https://')) {
    return `wss://${trimmedUrl.slice('https://'.length)}`
  }

  return trimmedUrl
}

export async function pingGateway(): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch('/api/ping', {
      signal: AbortSignal.timeout(8000),
    })
    const data = (await response.json()) as { ok?: boolean; error?: string }
    return { ok: Boolean(data.ok), error: data.error }
  } catch {
    return { ok: false, error: 'Could not reach Hermes Workspace server' }
  }
}

export async function fetchCurrentConfig(): Promise<{
  url: string
  token: string
  hasToken: boolean
}> {
  try {
    const response = await fetch('/api/gateway-config', {
      signal: AbortSignal.timeout(5000),
    })
    const data = (await response.json()) as {
      url?: string
      token?: string
      hasToken?: boolean
    }
    return {
      url: data.url || 'ws://127.0.0.1:18789',
      token: data.token || '',
      hasToken: Boolean(data.hasToken),
    }
  } catch {
    return { url: 'ws://127.0.0.1:18789', token: '', hasToken: false }
  }
}

async function saveConfig(url: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const normalizedUrl = normalizeGatewayUrl(url)

  // Persist to localStorage so token survives page refresh
  try {
    localStorage.setItem('hermes-gateway-url', normalizedUrl)
    localStorage.setItem('hermes-gateway-token', token)
  } catch {
    // Ignore localStorage write failures (private browsing, etc.)
  }

  try {
    const response = await fetch('/api/gateway-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: normalizedUrl, token }),
      signal: AbortSignal.timeout(15000),
    })
    const data = (await response.json()) as { ok?: boolean; connected?: boolean; error?: string }
    if (data.ok && data.connected === false) {
      return { ok: true, error: 'Config saved. Reconnecting to Hermes...' }
    }
    return { ok: Boolean(data.ok), error: data.error }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save config' }
  }
}

export async function autoDetectGateway(): Promise<{
  ok: boolean
  url?: string
  token?: string
  error?: string
}> {
  try {
    const response = await fetch('/api/gateway-discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'scan' }),
      signal: AbortSignal.timeout(15000),
    })
    const data = (await response.json()) as {
      ok?: boolean
      url?: string
      token?: string
      error?: string
    }

    if (!data.ok || !data.url) {
      return {
        ok: false,
        error: data.error || 'No Hermes instance found on localhost ports 18789-18800.',
      }
    }

    return { ok: true, url: data.url, token: data.token }
  } catch {
    return {
      ok: false,
      error: 'Auto-detect failed. Enter the Hermes URL manually.',
    }
  }
}

function readSavedGatewayConfig(): SavedGatewayConfig | null {
  if (typeof window === 'undefined') return null

  try {
    const settingsRaw =
      localStorage.getItem('hermes-settings') ??
      localStorage.getItem('openclaw-settings')
    if (settingsRaw) {
      const parsed = JSON.parse(settingsRaw) as {
        state?: { settings?: { gatewayUrl?: string; gatewayToken?: string } }
      }
      const url = parsed.state?.settings?.gatewayUrl?.trim()
      const token = parsed.state?.settings?.gatewayToken?.trim() || ''

      if (url) {
        return { url, token }
      }
    }
  } catch {
    // Ignore invalid persisted settings and fall back to legacy keys.
  }

  const url =
    localStorage.getItem('hermes-gateway-url')?.trim() ||
    localStorage.getItem('gateway-url')?.trim() ||
    ''
  const token =
    localStorage.getItem('hermes-gateway-token')?.trim() ||
    localStorage.getItem('gateway-token')?.trim() ||
    ''

  return url ? { url, token } : null
}

async function trySilentConnection(config: SavedGatewayConfig): Promise<boolean> {
  const saveResult = await saveConfig(config.url, config.token)
  if (!saveResult.ok) {
    return false
  }

  await new Promise((resolve) => setTimeout(resolve, 500))
  const { ok } = await pingGateway()
  return ok
}

export const useGatewaySetupStore = create<GatewaySetupState>((set, get) => ({
  isOpen: false,
  setupConfigured: false,
  step: 'gateway',
  gatewayUrl: 'ws://127.0.0.1:18789',
  gatewayToken: '',
  testStatus: 'idle',
  testError: null,
  saving: false,
  _initialized: false,

  initialize: async () => {
    if (get()._initialized) return
    set({ _initialized: true })
    if (typeof window === 'undefined') return

    try {
      const configured = localStorage.getItem(SETUP_STORAGE_KEY) === 'true'

      // Debug: ?wizard=provider or ?wizard=gateway forces the wizard open
      const params = new URLSearchParams(window.location.search)
      const forceWizard = params.get('wizard')
      if (forceWizard) {
        const step = forceWizard === 'provider' ? 'provider' : 'gateway'
        set({
          isOpen: true,
          setupConfigured: configured,
          step,
          gatewayUrl: 'ws://127.0.0.1:18789',
        })
        return
      }

      const savedConfig = readSavedGatewayConfig()
      if (savedConfig) {
        set({
          gatewayUrl: savedConfig.url,
          gatewayToken: savedConfig.token,
          testStatus: 'idle',
          testError: null,
        })

        if (await trySilentConnection(savedConfig)) {
          localStorage.setItem(SETUP_STORAGE_KEY, 'true')
          set({ setupConfigured: true })
          return
        }
      } else {
        const { ok } = await pingGateway()
        if (ok) {
          localStorage.setItem(SETUP_STORAGE_KEY, 'true')
          set({ setupConfigured: true })
          return
        }
      }

      try {
        const discoverRes = await fetch('/api/gateway-discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(15000),
        })
        const discoverData = (await discoverRes.json()) as {
          ok?: boolean
          url?: string
          token?: string
        }

        if (discoverData.ok) {
          localStorage.setItem(SETUP_STORAGE_KEY, 'true')
          set({
            setupConfigured: true,
            gatewayUrl: discoverData.url || savedConfig?.url || 'ws://127.0.0.1:18789',
            gatewayToken: discoverData.token || savedConfig?.token || '',
            testStatus: 'success',
            testError: null,
            isOpen: false,
          })
          return
        }
      } catch {
        // Discovery failed, fall through to manual wizard.
      }

      const config = await fetchCurrentConfig()
      set({
        isOpen: false,
        setupConfigured: configured,
        step: 'gateway',
        gatewayUrl: savedConfig?.url || config.url,
        gatewayToken: savedConfig?.token || config.token,
        testStatus: configured ? 'idle' : get().testStatus,
        testError: null,
      })
    } catch {
      const config = await fetchCurrentConfig().catch(() => ({
        url: 'ws://127.0.0.1:18789',
        token: '',
        hasToken: false,
      }))
      set({
        isOpen: false,
        setupConfigured: false,
        step: 'gateway',
        gatewayUrl: config.url,
        gatewayToken: config.token,
        testStatus: 'idle',
        testError: null,
      })
    }
  },

  loadCurrentConfig: async () => {
    const config = await fetchCurrentConfig()
    set({
      gatewayUrl: config.url,
      gatewayToken: config.token,
      testStatus: 'idle',
      testError: null,
    })
  },

  setGatewayUrl: (url) => set({ gatewayUrl: url, testStatus: 'idle', testError: null }),
  setGatewayToken: (token) => set({ gatewayToken: token, testStatus: 'idle', testError: null }),

  saveAndTest: async () => {
    const { gatewayUrl, gatewayToken } = get()
    const normalizedGatewayUrl = normalizeGatewayUrl(gatewayUrl)

    if (normalizedGatewayUrl !== gatewayUrl) {
      set({ gatewayUrl: normalizedGatewayUrl })
    }

    set({ saving: true, testStatus: 'testing', testError: null })

    // 1. Save to .env via server API
    const saveResult = await saveConfig(normalizedGatewayUrl, gatewayToken)
    if (!saveResult.ok) {
      set({
        saving: false,
        testStatus: 'error',
        testError: saveResult.error || 'Failed to save configuration',
      })
      return false
    }

    // 2. Brief delay for server to pick up new env vars
    await new Promise((r) => setTimeout(r, 500))

    // 3. Test connection via /api/ping
    const { ok, error } = await pingGateway()
    set({ saving: false })

    if (ok) {
      localStorage.setItem(SETUP_STORAGE_KEY, 'true')
      set({ testStatus: 'success', testError: null })
      set({ setupConfigured: true })
      return true
    }

    set({
      testStatus: 'error',
        testError: error || 'Hermes is not reachable after saving config. You may need to restart Hermes Workspace.',
    })
    return false
  },

  testConnection: async () => {
    set({ testStatus: 'testing', testError: null })
    const { ok, error } = await pingGateway()
    if (ok) {
      set({ testStatus: 'success', testError: null })
      return true
    }
    set({ testStatus: 'error', testError: error || 'Hermes is not reachable' })
    return false
  },

  autoDetectGateway: async () => {
    const result = await autoDetectGateway()
    if (!result.ok || !result.url) {
      return result
    }

    set({
      gatewayUrl: result.url,
      gatewayToken: result.token || get().gatewayToken,
      testStatus: 'idle',
      testError: null,
    })
    return result
  },

  proceed: () => set({ step: 'provider' }),

  skipProviderSetup: () => {
    localStorage.setItem(SETUP_STORAGE_KEY, 'true')
    set({ isOpen: false, setupConfigured: true, step: 'complete' })
  },

  completeSetup: () => {
    localStorage.setItem(SETUP_STORAGE_KEY, 'true')
    set({ isOpen: false, setupConfigured: true, step: 'complete' })
  },

  reset: () => {
    localStorage.removeItem(SETUP_STORAGE_KEY)
    set({
      isOpen: true,
      setupConfigured: false,
      step: 'gateway',
      gatewayUrl: 'ws://127.0.0.1:18789',
      gatewayToken: '',
      testStatus: 'idle',
      testError: null,
    })
  },

  open: async () => {
    const config = await fetchCurrentConfig()
    set({
      isOpen: true,
      step: 'gateway',
      gatewayUrl: config.url,
      gatewayToken: config.token,
      testStatus: 'idle',
      testError: null,
    })
  },

  close: () => {
    set({ isOpen: false })
  },
}))
