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
  process.env.HERMES_HOME ?? join(homedir(), '.hermes'),
  'workspace-sessions.json',
)
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

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
 * Remove a session token (logout).
 */
export function revokeSessionToken(token: string): void {
  _tokens.delete(token)
  _persist()
}

/**
 * Check if password protection is enabled.
 */
export function isPasswordProtectionEnabled(): boolean {
  return Boolean(
    process.env.HERMES_PASSWORD && process.env.HERMES_PASSWORD.length > 0,
  )
}

/**
 * Verify password using timing-safe comparison.
 */
export function verifyPassword(password: string): boolean {
  const configured = process.env.HERMES_PASSWORD
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
    if (cookie.startsWith('hermes-auth=')) {
      return cookie.substring('hermes-auth='.length)
    }
  }
  return null
}

function isLocalRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || '127.0.0.1'
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
 * Create a Set-Cookie header for the session token.
 */
export function createSessionCookie(token: string): string {
  // httpOnly: prevents JS access
  // secure: HTTPS only (disabled for local dev)
  // sameSite=strict: CSRF protection
  // path=/: available everywhere
  // maxAge: 30 days
  return `hermes-auth=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 60 * 60}`
}
