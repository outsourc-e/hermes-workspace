export type AuthAction = 'ignore' | 'session-expired' | 'auth-probe' | 'proxy-redirect'

export type AuthInterceptorOptions = {
  /** Défaut : () => window.location.reload(). */
  reload?: () => void
  /** 401 MARQUÉ X-Hermes-Auth (§2.4) : bascule immédiate. Défaut : no-op. */
  onSessionExpired?: (source: string) => void
  /** Signal indéterminé (401 nu, HTML/2xx) : demande d'arbitrage. Défaut : no-op. */
  onAuthProbe?: (source: string) => void
  /** Défaut : 15_000 — anti-boucle de rechargement (piège P7). */
  reloadCooldownMs?: number
}

const AUTH_ENDPOINTS_EXEMPT = [
  '/api/auth',
  '/api/auth/refresh',
  '/api/auth-check',
  '/api/oauth/device-code',
  '/api/oauth/poll-token',
]

const SESSION_EXPIRED_DEDUPE_MS = 5_000
const AUTH_PROBE_THROTTLE_MS = 5_000
const RELOAD_STORAGE_KEY = 'hermes:last-auth-reload'
const RELOAD_MAX_IN_WINDOW = 2
const RELOAD_WINDOW_MS = 60_000

/**
 * Décision pure, testable sans DOM ni store : que faire de cette réponse ?
 *
 * Règles évaluées dans l'ordre, première correspondance gagnante — voir §4.2
 * du plan pour la justification de chaque règle (P6, P6bis notamment).
 */
export function classifyAuthResponse(
  url: string,
  response: Response,
  request?: { accept?: string | null },
): AuthAction {
  const origin = typeof location !== 'undefined' ? location.origin : undefined

  let parsed: URL
  try {
    parsed = new URL(url, origin)
  } catch {
    return 'ignore'
  }

  // 1. URL non same-origin, ou chemin ne commençant pas par '/api/'.
  if ((origin && parsed.origin !== origin) || !parsed.pathname.startsWith('/api/')) {
    return 'ignore'
  }

  // 2. Routes d'auth elles-mêmes : c'est le store qui les gère (§4.2 règle 2).
  if (AUTH_ENDPOINTS_EXEMPT.includes(parsed.pathname)) {
    return 'ignore'
  }

  // 3. Preuve directe : la réponse a été suivie jusqu'à une redirection cross-origin.
  if (response.redirected) {
    try {
      if (origin && new URL(response.url).origin !== origin) {
        return 'proxy-redirect'
      }
    } catch {
      // response.url malformée — on continue le traitement normal.
    }
  }

  const marked = response.headers.get('X-Hermes-Auth') === 'required'

  // 4. 401/403/400 marqués : expiration workspace certaine (§2.4).
  if (
    (response.status === 401 || response.status === 403 || response.status === 400) &&
    marked
  ) {
    return 'session-expired'
  }

  // 5. 401 nu : indéterminé, jamais une bascule directe (P6bis).
  if (response.status === 401) {
    return 'auth-probe'
  }

  // 6. 2xx + text/html alors que le client demandait du JSON : signal indéterminé.
  const contentType = response.headers.get('content-type') || ''
  if (
    response.status >= 200 &&
    response.status < 300 &&
    contentType.startsWith('text/html') &&
    (request?.accept || '').includes('application/json')
  ) {
    return 'auth-probe'
  }

  return 'ignore'
}

type WrappedFetch = typeof fetch & {
  __hermesAuthInterceptor?: boolean
  __hermesAuthUninstall?: () => void
}

function isReloadCapReached(): boolean {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_STORAGE_KEY)
    if (!raw) return false
    const entry = JSON.parse(raw) as { count: number; windowStart: number }
    if (Date.now() - entry.windowStart > RELOAD_WINDOW_MS) return false
    return entry.count >= RELOAD_MAX_IN_WINDOW
  } catch {
    return false
  }
}

function markReload(): void {
  try {
    const now = Date.now()
    const raw = window.sessionStorage.getItem(RELOAD_STORAGE_KEY)
    const entry = raw ? (JSON.parse(raw) as { count: number; windowStart: number }) : null
    const stillInWindow = entry ? now - entry.windowStart < RELOAD_WINDOW_MS : false
    const windowStart = stillInWindow && entry ? entry.windowStart : now
    const count = stillInWindow && entry ? entry.count + 1 : 1
    window.sessionStorage.setItem(RELOAD_STORAGE_KEY, JSON.stringify({ count, windowStart }))
  } catch {
    // sessionStorage indisponible — best effort, pas bloquant.
  }
}

let currentOptions: Required<AuthInterceptorOptions> | null = null

/**
 * Installe le wrapper global. Idempotent (HMR-safe, piège P9) et no-op côté SSR.
 * @returns fonction de désinstallation (restaure le fetch d'origine).
 */
export function installAuthFetchInterceptor(
  opts: AuthInterceptorOptions = {},
): () => void {
  if (typeof window === 'undefined') return () => {}

  const options: Required<AuthInterceptorOptions> = {
    reload: opts.reload ?? (() => window.location.reload()),
    onSessionExpired: opts.onSessionExpired ?? (() => {}),
    onAuthProbe: opts.onAuthProbe ?? (() => {}),
    reloadCooldownMs: opts.reloadCooldownMs ?? 15_000,
  }
  currentOptions = options

  const existing = window.fetch as WrappedFetch
  if (existing.__hermesAuthInterceptor) {
    // Déjà installé (HMR) : on ne réempile pas de wrapper, on rafraîchit juste
    // les callbacks. On renvoie le *même* uninstall que la première install —
    // en créer un nouveau ici capturerait un `wrapped` jamais initialisé
    // (early return avant sa déclaration plus bas).
    return existing.__hermesAuthUninstall ?? (() => {})
  }

  const originalFetch = window.fetch.bind(window)
  let lastExpiredAt = 0
  let lastProbeAt = 0
  let lastReloadAt = 0

  const wrapped: WrappedFetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

    let pathIsApi = false
    try {
      const parsed = new URL(url, window.location.href)
      pathIsApi =
        parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/')
    } catch {
      pathIsApi = false
    }

    let requestInit = init
    let accept =
      init?.headers !== undefined
        ? new Headers(init.headers).get('Accept')
        : input instanceof Request
          ? input.headers.get('Accept')
          : null

    // Pose Accept: application/json sur /api/* si absent (§4.3) — permet à un
    // proxy IdP configuré en conséquence de répondre 401 plutôt que 302 (§7.3).
    if (pathIsApi && !accept) {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      )
      headers.set('Accept', 'application/json')
      requestInit = { ...init, headers }
      accept = 'application/json'
    }

    // Ne JAMAIS lire response.body ici — uniquement status/url/redirected/headers.
    const response = await originalFetch(input, requestInit)

    const action = classifyAuthResponse(url, response, { accept })
    const activeOptions = currentOptions ?? opts

    switch (action) {
      case 'session-expired': {
        const now = Date.now()
        if (now - lastExpiredAt >= SESSION_EXPIRED_DEDUPE_MS) {
          lastExpiredAt = now
          activeOptions.onSessionExpired?.(url)
        }
        break
      }
      case 'auth-probe': {
        const now = Date.now()
        if (now - lastProbeAt >= AUTH_PROBE_THROTTLE_MS) {
          lastProbeAt = now
          activeOptions.onAuthProbe?.(url)
        }
        break
      }
      case 'proxy-redirect': {
        const now = Date.now()
        const cooldown = activeOptions.reloadCooldownMs ?? 15_000
        if (now - lastReloadAt >= cooldown && !isReloadCapReached()) {
          lastReloadAt = now
          markReload()
          activeOptions.reload?.()
        }
        break
      }
      case 'ignore':
        break
    }

    // La réponse est toujours renvoyée intacte à l'appelant.
    return response
  }
  wrapped.__hermesAuthInterceptor = true

  function uninstallInterceptor(): void {
    if (window.fetch === wrapped) {
      window.fetch = originalFetch
    }
    currentOptions = null
  }
  wrapped.__hermesAuthUninstall = uninstallInterceptor

  window.fetch = wrapped
  return uninstallInterceptor
}

/** Wrapper explicite pour le nouveau code : `apiFetch('/api/x')`. */
export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return window.fetch(input, init)
}
