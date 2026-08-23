import { refreshSession } from './claude-auth'
import type { AuthStatus } from './claude-auth'

export type AuthSessionState = {
  /** Dernier statut connu ; `null` tant qu'aucun check n'a abouti. */
  status: AuthStatus | null
  /**
   * 'unknown'     — aucun check abouti (SSR, tout premier rendu)
   * 'ok'          — session valide
   * 'expired'     — authRequired && !authenticated (→ LoginScreen)
   * 'unreachable' — serveur/gateway injoignable, polling en backoff
   * 'suspended'   — backoff plafonné (§3.1 règle 5bis) : polling arrêté,
   *                 relance uniquement sur action utilisateur / visibilitychange / online
   */
  phase: 'unknown' | 'ok' | 'expired' | 'unreachable' | 'suspended'
  lastCheckedAt: number | null
  lastError: string | null
  /** Échecs consécutifs, remis à 0 par tout succès. Alimente backoff et plafond. */
  consecutiveFailures: number
}

export const AUTH_POLL_INTERVAL_MS = 60_000
export const AUTH_REFRESH_INTERVAL_MS = 10 * 60_000
export const AUTH_POLL_BACKOFF_MS = [60_000, 120_000, 300_000] // en cas d'injoignable

/**
 * Plafond d'échecs consécutifs. Au-delà, le poller se met en veille
 * (`phase:'suspended'`) : plus AUCUN timer, donc plus aucun trafic vers un
 * serveur manifestement mort. 10 échecs ≈ 33 min (60+120+300×8). Cf. règle 5bis.
 */
export const AUTH_POLL_MAX_CONSECUTIVE_FAILURES = 10

const AUTH_CHECK_PATH = '/api/auth-check'
const PROBE_THROTTLE_MS = 5_000
const EVENT_CHECK_THROTTLE_MS = 5_000
const RELOAD_COOLDOWN_MS = 15_000
const RELOAD_STORAGE_KEY = 'hermes:last-auth-reload'
const RELOAD_MAX_IN_WINDOW = 2
const RELOAD_WINDOW_MS = 60_000

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/**
 * Bornage réglable pour les tests/déploiements atypiques via
 * `VITE_AUTH_POLL_MAX_FAILURES`. Absent/vide ⇒ comportement par défaut
 * (`AUTH_POLL_MAX_CONSECUTIVE_FAILURES`). Explicitement `0` ou non numérique
 * ⇒ pas de plafond (comportement historique) — à réserver aux diagnostics :
 * un opérateur doit l'activer sciemment, ce n'est jamais la valeur implicite.
 */
function getMaxConsecutiveFailures(): number {
  const raw = (import.meta as { env?: Record<string, string | undefined> })
    .env?.VITE_AUTH_POLL_MAX_FAILURES
  if (raw === undefined || raw === '') return AUTH_POLL_MAX_CONSECUTIVE_FAILURES
  const n = Number(raw)
  if (n === 0 || !Number.isFinite(n)) return Infinity
  return n
}

const initialState: AuthSessionState = {
  status: null,
  phase: 'unknown',
  lastCheckedAt: null,
  lastError: null,
  consecutiveFailures: 0,
}

let state: AuthSessionState = initialState
const listeners = new Set<(s: AuthSessionState) => void>()

let pollTimer: ReturnType<typeof setTimeout> | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
let inFlight: Promise<AuthSessionState> | null = null
let lastProbeAt = 0
let lastEventCheckAt = 0
let lastRefreshAt = 0

function setState(patch: Partial<AuthSessionState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener(state)
}

function stopPolling(): void {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function scheduleNextPoll(delayMs: number): void {
  if (!isBrowser() || listeners.size === 0) return
  stopPolling()
  pollTimer = setTimeout(() => {
    void checkAuthNow('poll')
  }, delayMs)
}

/**
 * Rechargement unique protégé par un cooldown + un compteur `sessionStorage`
 * (piège P7) : au-delà de `RELOAD_MAX_IN_WINDOW` rechargements en
 * `RELOAD_WINDOW_MS`, on cesse de recharger et on bascule sur un état
 * d'erreur explicite plutôt que de boucler indéfiniment.
 *
 * Partage la même clé `sessionStorage` que `auth-fetch-interceptor.ts`
 * (§4.3) : les deux déclencheurs de rechargement (preuve directe côté
 * intercepteur, escalade 6bis côté store) coopèrent sous le même compteur.
 */
export function triggerProxyRedirectReload(): void {
  if (!isBrowser()) return
  try {
    const now = Date.now()
    const raw = window.sessionStorage.getItem(RELOAD_STORAGE_KEY)
    const entry = raw
      ? (JSON.parse(raw) as { count: number; windowStart: number; lastAt: number })
      : null

    if (entry && now - entry.lastAt < RELOAD_COOLDOWN_MS) return

    const windowStart = entry && now - entry.windowStart < RELOAD_WINDOW_MS ? entry.windowStart : now
    const count = entry && now - entry.windowStart < RELOAD_WINDOW_MS ? entry.count + 1 : 1

    if (count > RELOAD_MAX_IN_WINDOW) {
      setState({
        phase: 'unreachable',
        lastError: 'Session expirée — rechargez la page.',
      })
      return
    }

    window.sessionStorage.setItem(
      RELOAD_STORAGE_KEY,
      JSON.stringify({ count, windowStart, lastAt: now }),
    )
  } catch {
    // sessionStorage indisponible — on recharge quand même, au mieux.
  }
  window.location.reload()
}

type ProbeResult =
  | { kind: 'status'; status: AuthStatus }
  | { kind: 'proxy-redirect' }
  | { kind: 'unreachable'; error: string }

/**
 * Sonde bas niveau vers `/api/auth-check`, indépendante de
 * `fetchClaudeAuthStatus()` : elle a besoin de `response.redirected` et du
 * `content-type` pour détecter l'escalade 6bis (interception par le proxy
 * IdP sur la route arbitre elle-même), ce que le contrat "throw on !ok" de
 * `fetchClaudeAuthStatus` ne peut pas exposer.
 */
async function probeAuthCheck(timeoutMs = 5_000): Promise<ProbeResult> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(AUTH_CHECK_PATH, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    return {
      kind: 'unreachable',
      error:
        error instanceof Error
          ? error.message
          : 'Failed to connect to Hermes Agent',
    }
  } finally {
    globalThis.clearTimeout(timeout)
  }

  if (res.redirected && isBrowser()) {
    try {
      if (new URL(res.url).origin !== window.location.origin) {
        return { kind: 'proxy-redirect' }
      }
    } catch {
      // URL malformée — on continue le traitement normal.
    }
  }

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    return { kind: 'proxy-redirect' }
  }

  try {
    const body = (await res.json()) as AuthStatus
    if (!res.ok) {
      // 503 gateway injoignable (P11) — ce n'est jamais une expiration.
      return { kind: 'unreachable', error: body.error ?? `HTTP ${res.status}` }
    }
    return { kind: 'status', status: body }
  } catch {
    return { kind: 'unreachable', error: `HTTP ${res.status}` }
  }
}

/** Amorce l'état depuis un statut déjà obtenu ailleurs (évite un double appel réseau au boot). */
export function primeAuthSession(status: AuthStatus): void {
  const expired = status.authRequired && !status.authenticated
  setState({
    status,
    phase: expired ? 'expired' : 'ok',
    lastCheckedAt: Date.now(),
    lastError: null,
    consecutiveFailures: 0,
  })
}

/**
 * Appelé par l'intercepteur (§4) sur un 401 **marqué** `X-Hermes-Auth: required`.
 * Bascule immédiatement en phase 'expired' (→ LoginScreen) sans attendre le
 * prochain tick, puis déclenche un checkAuthNow() de confirmation.
 *
 * ⚠️ Ne jamais appeler sur un 401 non marqué : utiliser probeAuthSession().
 */
export function markSessionExpired(_source: string): void {
  setState({
    phase: 'expired',
    status: { authRequired: true, authenticated: false },
    lastCheckedAt: Date.now(),
    lastError: null,
  })
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent('hermes:auth-expired'))
  }
  void checkAuthNow('markSessionExpired-confirm')
}

/**
 * Appelé par l'intercepteur sur un signal *indéterminé* (§2.4, §4.2 règles 3b
 * et 6) : 401 sans marqueur, ou HTML/2xx sur /api/*. Ne change PAS la phase
 * directement — déclenche un checkAuthNow() dédoublonné + throttlé (max 1 par
 * 5 s) dont la réponse de /api/auth-check arbitre.
 */
export function probeAuthSession(_source: string): void {
  const now = Date.now()
  if (now - lastProbeAt < PROBE_THROTTLE_MS) return
  lastProbeAt = now
  void checkAuthNow('probe')
}

/** Force un check immédiat (dédoublonné : un seul vol en cours à la fois). */
export function checkAuthNow(reason: string): Promise<AuthSessionState> {
  if (inFlight) return inFlight
  inFlight = performCheck(reason).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function performCheck(_reason: string): Promise<AuthSessionState> {
  const result = await probeAuthCheck()

  if (result.kind === 'proxy-redirect') {
    setState({
      phase: 'unreachable',
      lastError: 'proxy-redirect',
      lastCheckedAt: Date.now(),
    })
    triggerProxyRedirectReload()
    return state
  }

  if (result.kind === 'unreachable') {
    handleFailure(result.error)
    return state
  }

  handleSuccess(result.status)
  return state
}

function handleSuccess(status: AuthStatus): void {
  const expired = status.authRequired && !status.authenticated
  setState({
    status,
    phase: expired ? 'expired' : 'ok',
    lastCheckedAt: Date.now(),
    lastError: null,
    consecutiveFailures: 0,
  })
  scheduleNextPoll(AUTH_POLL_INTERVAL_MS)
}

function handleFailure(error: string): void {
  const consecutiveFailures = state.consecutiveFailures + 1
  const maxFailures = getMaxConsecutiveFailures()

  if (consecutiveFailures >= maxFailures) {
    setState({
      phase: 'suspended',
      lastError: error,
      lastCheckedAt: Date.now(),
      consecutiveFailures,
    })
    stopPolling()
    return
  }

  setState({
    phase: 'unreachable',
    lastError: error,
    lastCheckedAt: Date.now(),
    consecutiveFailures,
  })
  const backoffIndex = Math.min(
    consecutiveFailures - 1,
    AUTH_POLL_BACKOFF_MS.length - 1,
  )
  scheduleNextPoll(AUTH_POLL_BACKOFF_MS[backoffIndex])
}

async function runRefresh(): Promise<void> {
  lastRefreshAt = Date.now()
  try {
    const result = await refreshSession()
    if (!result.ok && result.authRequired && !result.authenticated) {
      setState({
        phase: 'expired',
        status: { authRequired: true, authenticated: false },
        lastCheckedAt: Date.now(),
      })
    }
  } catch {
    // Panne réseau — c'est le poller qui tranche l'état, pas le refresh.
  }
}

function startRefreshTimer(): void {
  if (!isBrowser() || refreshTimer) return
  refreshTimer = setInterval(() => {
    void runRefresh()
  }, AUTH_REFRESH_INTERVAL_MS)
}

function stopRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function handleWakeEvent(source: string): void {
  const now = Date.now()
  if (now - lastEventCheckAt < EVENT_CHECK_THROTTLE_MS) return
  lastEventCheckAt = now
  void checkAuthNow(source)

  if (lastRefreshAt === 0 || now - lastRefreshAt > AUTH_REFRESH_INTERVAL_MS) {
    void runRefresh()
  }
}

function handleVisibilityChange(): void {
  if (!isBrowser() || document.visibilityState !== 'visible') return
  handleWakeEvent('visibilitychange')
}

function handleOnline(): void {
  handleWakeEvent('online')
}

/** Abonnement + démarrage paresseux du poller. Retourne la fonction de désabonnement. */
export function subscribeAuthSession(
  listener: (s: AuthSessionState) => void,
): () => void {
  listeners.add(listener)

  if (listeners.size === 1 && isBrowser()) {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    startRefreshTimer()
    if (state.phase !== 'suspended') {
      void checkAuthNow('subscribe')
    }
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && isBrowser()) {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      stopPolling()
      stopRefreshTimer()
    }
  }
}

export function getAuthSessionState(): AuthSessionState {
  return state
}
