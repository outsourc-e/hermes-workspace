import { randomBytes, timingSafeEqual } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Persistent session token store.
 *
 * Tokens are held in memory for fast lookup and persisted to a JSON file
 * so they survive server restarts.  This is safe for single-instance
 * deployments.  For multi-worker setups the file becomes a race-condition
 * window — in that case replace with Redis or a database.
 *
 * File location: ~/.hermes/workspace-sessions.json
 */
interface SessionStore {
  tokens: Record<string, number> // token -> expiry unix-ms
}

const STORE_FILE = join(
  process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? join(homedir(), '.hermes'),
  'workspace-sessions.json',
)
/** Durée de vie d'une session, source unique de vérité (store ET cookie). */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 jours
const TOKEN_TTL_MS = SESSION_TTL_SECONDS * 1000

/**
 * Fenêtre de renouvellement : on ne prolonge (et on ne réémet le cookie) qu'une
 * fois par heure au maximum. Évite une écriture disque + un en-tête Set-Cookie
 * sur *chaque* requête (cf. pièges P3/P4).
 * Surchargeable par SESSION_RENEW_INTERVAL_SECONDS pour les tests manuels.
 */
export function getSessionRenewIntervalMs(): number {
  const raw = Number(process.env.SESSION_RENEW_INTERVAL_SECONDS)
  return Number.isFinite(raw) && raw > 0 ? raw * 1000 : 60 * 60 * 1000
}

function loadStore(): SessionStore {
  try {
    if (existsSync(STORE_FILE)) {
      const raw = readFileSync(STORE_FILE, 'utf8')
      const parsed = JSON.parse(raw) as SessionStore
      // Expire any stale tokens on load
      const now = Date.now()
      const valid: Record<string, number> = {}
      for (const [token, expiry] of Object.entries(parsed.tokens)) {
        if (expiry > now) valid[token] = expiry
      }
      return { tokens: valid }
    }
  } catch {
    // Corrupt store — start fresh
  }
  return { tokens: {} }
}

function saveStore(store: SessionStore): void {
  try {
    const dir = dirname(STORE_FILE)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    }
    // Write with restrictive permissions — tokens are sensitive.
    writeFileSync(STORE_FILE, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 })
    // Enforce 0600 even if the file already existed with looser perms.
    try {
      chmodSync(STORE_FILE, 0o600)
    } catch {
      // chmod is best-effort (e.g. Windows) — ignore failures.
    }
  } catch {
    // Non-fatal — tokens are still in memory.
    console.warn(`[auth] Failed to persist session store to ${STORE_FILE}`)
  }
}

// In-memory working copy
const _tokens: Map<string, number> = new Map()

// Hydrate from disk on module load
const initial = loadStore()
for (const [token, expiry] of Object.entries(initial.tokens)) {
  _tokens.set(token, expiry)
}

/**
 * Prune expired tokens from the store (called on every write + a periodic sweep).
 */
function _prune(): void {
  const now = Date.now()
  let changed = false
  for (const [token, expiry] of _tokens) {
    if (expiry <= now) {
      _tokens.delete(token)
      changed = true
    }
  }
  if (changed) _persist()
}

function _persist(): void {
  const store: SessionStore = { tokens: Object.fromEntries(_tokens) }
  saveStore(store)
}

// Sweep expired tokens every 10 minutes
setInterval(_prune, 10 * 60 * 1000)

/**
 * Generate a cryptographically secure session token.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Store a session token as valid (30-day TTL).
 */
export function storeSessionToken(token: string): void {
  _tokens.set(token, Date.now() + TOKEN_TTL_MS)
  _persist()
}

/**
 * Check if a session token is valid and not expired.
 */
export function isValidSessionToken(token: string): boolean {
  const expiry = _tokens.get(token)
  if (expiry === undefined) return false
  if (expiry <= Date.now()) {
    _tokens.delete(token)
    _persist()
    return false
  }
  return true
}

/**
 * Prolonge la durée de vie d'un token valide (expiration glissante).
 *
 * @returns `true` si le token a effectivement été prolongé (donc si l'appelant
 *          doit réémettre le cookie), `false` si le token est inconnu/expiré
 *          OU si la fenêtre de renouvellement n'est pas atteinte.
 *
 * Persistance : n'écrit sur disque que lors d'une prolongation réelle, soit au
 * plus une fois par heure et par session.
 */
export function touchSessionToken(token: string): boolean {
  const expiry = _tokens.get(token)
  if (expiry === undefined) return false
  const now = Date.now()
  if (expiry <= now) {
    _tokens.delete(token)
    _persist()
    return false
  }
  // Prolongation seulement si la session a « vieilli » d'au moins une fenêtre.
  const elapsedSinceIssue = TOKEN_TTL_MS - (expiry - now)
  if (elapsedSinceIssue < getSessionRenewIntervalMs()) return false
  _tokens.set(token, now + TOKEN_TTL_MS)
  _persist()
  return true
}

/** Expiration absolue courante d'un token (unix-ms), ou `null`. */
export function getSessionExpiry(token: string): number | null {
  const expiry = _tokens.get(token)
  return expiry !== undefined && expiry > Date.now() ? expiry : null
}

/**
 * Remove a session token (logout).
 */
export function revokeSessionToken(token: string): void {
  _tokens.delete(token)
  _persist()
}

/**
 * Resolve the configured workspace password.
 *
 * Honors HERMES_PASSWORD first (current name, post-rename) and falls back to
 * CLAUDE_PASSWORD for back-compat with deployments configured pre-rename.
 */
function getConfiguredPassword(): string {
  const fromHermes = process.env.HERMES_PASSWORD
  if (fromHermes && fromHermes.length > 0) return fromHermes
  const fromClaude = process.env.CLAUDE_PASSWORD
  if (fromClaude && fromClaude.length > 0) return fromClaude
  return ''
}

/**
 * Check if password protection is enabled.
 */
export function isPasswordProtectionEnabled(): boolean {
  return getConfiguredPassword().length > 0
}

/**
 * Verify password using timing-safe comparison.
 */
export function verifyPassword(password: string): boolean {
  const configured = getConfiguredPassword()
  if (!configured || configured.length === 0) {
    return false
  }

  // Timing-safe comparison
  const passwordBuf = Buffer.from(password, 'utf8')
  const configuredBuf = Buffer.from(configured, 'utf8')

  // If lengths differ, still do a comparison to avoid timing leak
  if (passwordBuf.length !== configuredBuf.length) {
    return false
  }

  try {
    return timingSafeEqual(passwordBuf, configuredBuf)
  } catch {
    return false
  }
}

/**
 * Extract session token from cookie header.
 */
export function getSessionTokenFromCookie(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';').map((c) => c.trim())
  for (const cookie of cookies) {
    if (cookie.startsWith('claude-auth=')) {
      return cookie.substring('claude-auth='.length)
    }
  }
  return null
}

/**
 * Whether the workspace is configured to trust proxy-forwarded headers
 * (`x-forwarded-for`, `x-real-ip`). Off by default — enabled explicitly when
 * deployed behind a trusted reverse proxy (Traefik, Nginx, Cloudflare).
 * See #125.
 */
function isTrustedProxyEnabled(): boolean {
  const v = (process.env.TRUST_PROXY || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

/**
 * Best-effort extraction of the peer IP, preferring the actual socket
 * address when available. Forwarded headers are only honored when
 * TRUST_PROXY is set — otherwise a client-controlled `x-forwarded-for`
 * could spoof local classification (#125).
 */
export function getRequestIp(request: Request): string {
  if (isTrustedProxyEnabled()) {
    const forwarded = request.headers.get('x-forwarded-for')
    const first = forwarded?.split(',')[0]?.trim()
    if (first) return first
    const real = request.headers.get('x-real-ip')?.trim()
    if (real) return real
  }
  // Node's Request does not expose the socket; the adapter that constructs it
  // (TanStack Start / undici) may attach `remoteAddress` under a well-known
  // symbol. Fall back to loopback when nothing is available so we fail *safe*
  // (no LAN/Tailscale bypass for unknown peers).
  const maybeAddress = (request as unknown as { remoteAddress?: string })
    .remoteAddress
  return (maybeAddress && maybeAddress.trim()) || '127.0.0.1'
}

function isLocalRequest(request: Request): boolean {
  const ip = getRequestIp(request)
  const localIPs = ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']
  if (localIPs.includes(ip)) return true
  // Allow Tailscale (100.x.x.x) and private LAN ranges
  if (/^100\.\d+\.\d+\.\d+$/.test(ip)) return true
  if (/^192\.168\./.test(ip)) return true
  if (/^10\./.test(ip)) return true
  return false
}

/**
 * Check if the request is authenticated.
 * Returns true if:
 * - Password protection is disabled, OR
 * - Request has a valid session token
 */
export function isAuthenticated(request: Request): boolean {
  // No password configured? No auth needed
  if (!isPasswordProtectionEnabled()) {
    return true
  }

  // Check for valid session token
  const cookieHeader = request.headers.get('cookie')
  const token = getSessionTokenFromCookie(cookieHeader)

  if (!token) {
    return false
  }

  return isValidSessionToken(token)
}

export function requireLocalOrAuth(request: Request): boolean {
  if (!isPasswordProtectionEnabled()) {
    return isLocalRequest(request)
  }

  return isAuthenticated(request)
}

/**
 * Whether session cookies should set the `Secure` attribute.
 *
 * Defaults ON in production, OFF in development (so localhost-over-HTTP
 * login flows still work). Operators can override with
 * `COOKIE_SECURE=0` (force off) or `COOKIE_SECURE=1` (force on). See #123.
 */
function shouldSetSecureCookie(): boolean {
  const override = (process.env.COOKIE_SECURE || '').trim().toLowerCase()
  if (override === '1' || override === 'true' || override === 'yes') return true
  if (override === '0' || override === 'false' || override === 'no') return false
  return process.env.NODE_ENV === 'production'
}

/**
 * `Strict` par défaut (comportement actuel, cf. #123). Derrière un IdP externe
 * (oauth2-proxy/Keycloak), le retour de redirection est une navigation
 * cross-site : un cookie Strict n'est PAS renvoyé sur cette première requête →
 * faux « déconnecté ». Les opérateurs concernés doivent poser
 * COOKIE_SAMESITE=Lax. Cf. piège P5.
 */
function getCookieSameSite(): 'Strict' | 'Lax' | 'None' {
  const v = (process.env.COOKIE_SAMESITE || '').trim().toLowerCase()
  if (v === 'lax') return 'Lax'
  if (v === 'none') return 'None'
  return 'Strict'
}

/**
 * Attributs communs HttpOnly/Secure/SameSite/Path partagés par le cookie de
 * session et le cookie d'expiration. `SameSite=None` impose `Secure` : si
 * l'opérateur n'a pas activé `COOKIE_SECURE`, on force `Secure` quand même et
 * on journalise un avertissement (sinon le navigateur rejette le cookie).
 */
function buildCookieAttrs(): Array<string> {
  const sameSite = getCookieSameSite()
  let secure = shouldSetSecureCookie()
  if (sameSite === 'None' && !secure) {
    console.warn(
      '[auth] COOKIE_SAMESITE=none requires Secure — forcing Secure on session cookies.',
    )
    secure = true
  }
  const attrs = ['HttpOnly']
  if (secure) attrs.push('Secure')
  attrs.push(`SameSite=${sameSite}`, 'Path=/')
  return attrs
}

/**
 * Attributs :
 *   HttpOnly · Secure (prod par défaut, COOKIE_SECURE=0/1) · SameSite (voir
 *   getCookieSameSite) · Path=/ · Max-Age=SESSION_TTL_SECONDS
 */
export function createSessionCookie(
  token: string,
  maxAgeSeconds: number = SESSION_TTL_SECONDS,
): string {
  const attrs = [...buildCookieAttrs(), `Max-Age=${maxAgeSeconds}`]
  return `claude-auth=${token}; ${attrs.join('; ')}`
}

/** Cookie d'expiration immédiate (déconnexion / token révoqué). */
export function createExpiredSessionCookie(): string {
  const attrs = [...buildCookieAttrs(), 'Max-Age=0']
  return `claude-auth=; ${attrs.join('; ')}`
}
