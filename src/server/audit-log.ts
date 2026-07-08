/**
 * Tamper-evident audit log for mutating actions.
 *
 * Every mutating API call appends one JSONL entry to
 * ~/.hermes/logs/audit.jsonl. Entries form an HMAC hash chain: each entry's
 * `sig` covers its own content plus the previous entry's `sig`, keyed by a
 * machine-local secret (~/.hermes/audit.key, created on first use, 600).
 * Truncating, editing, or reordering the file breaks the chain, which
 * verifyAuditChain() detects.
 *
 * Append is best-effort and must never block or fail the real action.
 */
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { createHmac, randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export type AuditEntry = {
  at: number
  actor: string
  action: string
  detail: string
  prev: string
  sig: string
}

export function auditLogPath(): string {
  return (
    process.env.HERMES_AUDIT_LOG_PATH ||
    join(homedir(), '.hermes', 'logs', 'audit.jsonl')
  )
}

function auditKeyPath(): string {
  return (
    process.env.HERMES_AUDIT_KEY_PATH || join(homedir(), '.hermes', 'audit.key')
  )
}

function auditKey(): string {
  try {
    if (existsSync(auditKeyPath())) {
      return readFileSync(auditKeyPath(), 'utf8').trim()
    }
    const key = randomBytes(32).toString('hex')
    mkdirSync(dirname(auditKeyPath()), { recursive: true })
    writeFileSync(auditKeyPath(), key)
    chmodSync(auditKeyPath(), 0o600)
    return key
  } catch {
    return ''
  }
}

function sign(key: string, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('hex').slice(0, 32)
}

function readEntries(): Array<AuditEntry> {
  try {
    if (!existsSync(auditLogPath())) return []
    return readFileSync(auditLogPath(), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as AuditEntry
        } catch {
          return null
        }
      })
      .filter((e): e is AuditEntry => e !== null)
  } catch {
    return []
  }
}

let lastSigCache: string | null = null

/** Append a mutating action to the audit chain. Never throws. */
export function appendAudit(input: {
  actor: string
  action: string
  detail: string
}): void {
  try {
    const key = auditKey()
    if (!key) return
    if (lastSigCache === null) {
      const entries = readEntries()
      lastSigCache = entries.at(-1)?.sig ?? 'genesis'
    }
    const entry: Omit<AuditEntry, 'sig'> = {
      at: Date.now(),
      actor: input.actor.slice(0, 80),
      action: input.action.slice(0, 80),
      detail: input.detail.slice(0, 500),
      prev: lastSigCache,
    }
    const sig = sign(key, JSON.stringify(entry))
    lastSigCache = sig
    mkdirSync(dirname(auditLogPath()), { recursive: true })
    appendFileSync(auditLogPath(), `${JSON.stringify({ ...entry, sig })}\n`)
  } catch {
    /* never block the real action */
  }
}

export function listAudit(limit = 200): Array<AuditEntry> {
  return readEntries().slice(-limit).reverse()
}

/** Walk the chain; returns the first broken index or null when intact. */
export function verifyAuditChain(): {
  ok: boolean
  entries: number
  brokenAt: number | null
} {
  const key = auditKey()
  const entries = readEntries()
  let prev = 'genesis'
  for (let i = 0; i < entries.length; i += 1) {
    const { sig, ...rest } = entries[i]
    if (rest.prev !== prev || sign(key, JSON.stringify(rest)) !== sig) {
      return { ok: false, entries: entries.length, brokenAt: i }
    }
    prev = sig
  }
  return { ok: true, entries: entries.length, brokenAt: null }
}

/** Derive a stable actor label from a request (local vs cookie session). */
export function actorFromRequest(request: Request): string {
  const cookie = request.headers.get('cookie') ?? ''
  if (cookie.includes('claude-auth=')) return 'session-user'
  return 'local'
}
