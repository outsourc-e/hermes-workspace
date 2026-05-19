/**
 * MCP Hub Sources store — Phase 3.2.
 *
 * Manages `~/.hermes/mcp-hub-sources.json` — user-configurable marketplace
 * sources. Built-in sources (mcp-get, local-file) are always injected and
 * cannot be removed by the user.
 *
 * Atomic bootstrap via tmp+fsync+linkSync (same pattern as mcp-presets-store).
 * mtime+size+inode+ctime cache invalidation.
 */
import {
  closeSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { getStateDir } from './workspace-state-dir'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HubSourceTrust = 'official' | 'community' | 'unverified'
export type HubSourceFormat = 'smithery' | 'generic-json'

export interface HubSourceEntry {
  id: string
  name: string
  url: string
  trust: HubSourceTrust
  format: HubSourceFormat
  enabled: boolean
  /** True for built-ins (mcp-get, local-file); user cannot remove these */
  builtin?: boolean
}

export type HubSourcesSource = 'user-file' | 'seed' | 'invalid'

export interface ValidationIssue {
  path: string
  message: string
}

export interface ReadHubSourcesResult {
  sources: HubSourceEntry[]
  source: HubSourcesSource
  error?: string
  errorPath?: string
  validationErrors?: ValidationIssue[]
}

// ---------------------------------------------------------------------------
// Built-in sources (always present, cannot be removed)
// ---------------------------------------------------------------------------

export const BUILTIN_SOURCES: HubSourceEntry[] = [
  {
    id: 'mcp-get',
    name: 'Smithery Registry',
    url: 'https://registry.smithery.ai/servers',
    trust: 'community',
    format: 'smithery',
    enabled: true,
    builtin: true,
  },
  {
    id: 'local-file',
    name: 'Local Presets',
    url: 'file://~/.hermes/mcp-presets.json',
    trust: 'official',
    format: 'generic-json',
    enabled: true,
    builtin: true,
  },
]

export const BUILTIN_IDS = new Set(BUILTIN_SOURCES.map((s) => s.id))

// ---------------------------------------------------------------------------
// Validation constants
// ---------------------------------------------------------------------------

const ID_RE = /^[a-z][a-z0-9_-]{0,63}$/
const VALID_TRUST: ReadonlySet<string> = new Set(['official', 'community', 'unverified'])
const VALID_FORMAT: ReadonlySet<string> = new Set(['smithery', 'generic-json'])
const KNOWN_TOP_FIELDS = new Set(['version', 'sources'])


// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function hubSourcesFilePath(): string {
  return join(getStateDir(), 'mcp-hub-sources.json')
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  key: string
  result: ReadHubSourcesResult
}

let _cache: CacheEntry | null = null

type StatKeyResult =
  | { ok: true; mtimeMs: number; size: number; ino: number; ctimeMs: number }
  | { ok: false; missing: boolean; code: string }

function statKey(path: string): StatKeyResult {
  try {
    const fd = openSync(path, 'r')
    try {
      const st = fstatSync(fd)
      return { ok: true, mtimeMs: st.mtimeMs, size: st.size, ino: st.ino, ctimeMs: st.ctimeMs }
    } finally {
      closeSync(fd)
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN'
    if (code === 'ENOENT') {
      try {
        lstatSync(path)
        return { ok: false, missing: false, code: 'ELOOP_DANGLING' }
      } catch {
        return { ok: false, missing: true, code: 'ENOENT' }
      }
    }
    return { ok: false, missing: false, code }
  }
}

function makeCacheKey(path: string, st: { mtimeMs: number; size: number; ino: number; ctimeMs: number }): string {
  return `${path}:${st.mtimeMs}:${st.size}:${st.ino}:${st.ctimeMs}`
}

// ---------------------------------------------------------------------------
// Seed (empty user sources — built-ins are always injected separately)
// ---------------------------------------------------------------------------

const SEED_PAYLOAD = { version: 1, sources: [] as HubSourceEntry[] }

// ---------------------------------------------------------------------------
// Atomic bootstrap
// ---------------------------------------------------------------------------

function bootstrapSeed(final: string): boolean {
  const dir = dirname(final)
  mkdirSync(dir, { recursive: true })

  const bytes = JSON.stringify(SEED_PAYLOAD, null, 2)
  const tmp = `${final}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, bytes)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }

  try {
    linkSync(tmp, final)
    try { unlinkSync(tmp) } catch { /* ignore */ }
    return true
  } catch (linkErr) {
    try { unlinkSync(tmp) } catch { /* ignore */ }
    if ((linkErr as NodeJS.ErrnoException).code === 'EEXIST') {
      return false
    }
    throw linkErr
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface PayloadValidationResult {
  sources: HubSourceEntry[]
  errors: ValidationIssue[]
}

function validatePayload(parsed: unknown): PayloadValidationResult {
  const errors: ValidationIssue[] = []
  const out: HubSourceEntry[] = []

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push({ path: '', message: 'root must be an object' })
    return { sources: [], errors }
  }
  const root = parsed as Record<string, unknown>

  if (root.version !== 1) {
    errors.push({ path: 'version', message: 'version must be 1' })
  }

  for (const key of Object.keys(root)) {
    if (!KNOWN_TOP_FIELDS.has(key)) {
      errors.push({ path: key, message: 'unknown top-level field (ignored)' })
    }
  }

  if (!Array.isArray(root.sources)) {
    errors.push({ path: 'sources', message: 'sources must be an array' })
    return { sources: [], errors }
  }

  const seen = new Set<string>()

  for (let i = 0; i < root.sources.length; i++) {
    const item = root.sources[i]
    const base = `sources[${i}]`

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ path: base, message: 'source entry must be an object' })
      continue
    }
    const p = item as Record<string, unknown>

    const id = typeof p.id === 'string' ? p.id : ''
    if (!ID_RE.test(id)) {
      errors.push({ path: `${base}.id`, message: 'id must match /^[a-z][a-z0-9_-]{0,63}$/' })
      continue
    }
    if (BUILTIN_IDS.has(id)) {
      errors.push({ path: `${base}.id`, message: `"${id}" is a reserved built-in source id` })
      continue
    }
    if (seen.has(id)) {
      errors.push({ path: `${base}.id`, message: `duplicate id "${id}"` })
      continue
    }
    seen.add(id)

    const name = typeof p.name === 'string' ? p.name.trim() : ''
    if (name.length < 1 || name.length > 100) {
      errors.push({ path: `${base}.name`, message: 'name must be 1..100 characters' })
    }

    const url = typeof p.url === 'string' ? p.url.trim() : ''
    if (!url) {
      errors.push({ path: `${base}.url`, message: 'url is required' })
    } else {
      try {
        const parsedUrl = new URL(url)
        if (parsedUrl.protocol !== 'https:') {
          errors.push({ path: `${base}.url`, message: 'url must use https:// (http:// is not allowed)' })
        }
      } catch {
        errors.push({ path: `${base}.url`, message: `url is not a valid URL: "${url}"` })
      }
    }

    const trust = typeof p.trust === 'string' ? p.trust : ''
    if (!VALID_TRUST.has(trust)) {
      errors.push({ path: `${base}.trust`, message: `trust must be one of: ${[...VALID_TRUST].join(', ')}` })
    }

    const format = typeof p.format === 'string' ? p.format : ''
    if (!VALID_FORMAT.has(format)) {
      errors.push({ path: `${base}.format`, message: `format must be one of: ${[...VALID_FORMAT].join(', ')}` })
    }

    const entryErrors = errors.filter((e) => e.path.startsWith(base))
    if (entryErrors.length === 0) {
      const enabled = typeof p.enabled === 'boolean' ? p.enabled : true
      out.push({
        id,
        name,
        url,
        trust: trust as HubSourceTrust,
        format: format as HubSourceFormat,
        enabled,
      })
    }
  }

  return { sources: out, errors }
}

// ---------------------------------------------------------------------------
// Merge built-ins + user sources
// ---------------------------------------------------------------------------

function mergeWithBuiltins(userSources: HubSourceEntry[]): HubSourceEntry[] {
  return [...BUILTIN_SOURCES, ...userSources]
}

// ---------------------------------------------------------------------------
// Public read API
// ---------------------------------------------------------------------------

/** Read hub sources, bootstrapping the file if missing. */
export async function readHubSources(): Promise<ReadHubSourcesResult> {
  const path = hubSourcesFilePath()

  const stat = statKey(path)
  if (!stat.ok) {
    if (!stat.missing) {
      const reason = `cannot read existing hub-sources file: ${stat.code}`
      return {
        sources: mergeWithBuiltins([]),
        source: 'invalid',
        error: reason,
        errorPath: path,
        validationErrors: [{ path: '', message: reason }],
      }
    }
    // Fall through to bootstrap
  } else {
    const key = makeCacheKey(path, stat)
    if (_cache && _cache.key === key) return _cache.result

    let text: string | null = null
    try { text = readFileSync(path, 'utf8') } catch { /* file vanished */ }

    if (text !== null) {
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch (err) {
        const result: ReadHubSourcesResult = {
          sources: mergeWithBuiltins([]),
          source: 'invalid',
          error: `hub-sources file is not valid JSON: ${(err as Error).message}`,
          errorPath: path,
          validationErrors: [{ path: '', message: (err as Error).message }],
        }
        _cache = { key, result }
        return result
      }

      const validation = validatePayload(parsed)
      const hardErrors = validation.errors.filter(
        (e) => !e.message.includes('unknown top-level field'),
      )

      if (hardErrors.length > 0) {
        const result: ReadHubSourcesResult = {
          sources: mergeWithBuiltins([]),
          source: 'invalid',
          error: `hub-sources file failed validation (${hardErrors.length} error${hardErrors.length === 1 ? '' : 's'}).`,
          errorPath: path,
          validationErrors: hardErrors,
        }
        _cache = { key, result }
        return result
      }

      const result: ReadHubSourcesResult = {
        sources: mergeWithBuiltins(validation.sources),
        source: 'user-file',
      }
      _cache = { key, result }
      return result
    }
  }

  // Bootstrap
  try {
    bootstrapSeed(path)
  } catch (err) {
    return {
      sources: mergeWithBuiltins([]),
      source: 'invalid',
      error: `Failed to bootstrap hub-sources file: ${(err as Error).message}`,
      errorPath: path,
      validationErrors: [{ path: '', message: (err as Error).message }],
    }
  }

  const result: ReadHubSourcesResult = {
    sources: mergeWithBuiltins([]),
    source: 'seed',
  }
  const stat3 = statKey(path)
  if (stat3.ok) {
    _cache = { key: makeCacheKey(path, stat3), result }
  }
  return result
}

// ---------------------------------------------------------------------------
// Internal: read only user-defined sources from the file
// ---------------------------------------------------------------------------

async function readUserSources(): Promise<{ sources: HubSourceEntry[]; error?: string; validationErrors?: ValidationIssue[] }> {
  const path = hubSourcesFilePath()
  const stat = statKey(path)
  if (!stat.ok) {
    if (stat.missing) return { sources: [] }
    return { sources: [], error: `cannot read hub-sources file: ${stat.code}` }
  }

  let text: string | null = null
  try { text = readFileSync(path, 'utf8') } catch { /* ignore */ }
  if (!text) return { sources: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { sources: [], error: `not valid JSON: ${(err as Error).message}` }
  }

  const validation = validatePayload(parsed)
  const hardErrors = validation.errors.filter((e) => !e.message.includes('unknown top-level field'))
  if (hardErrors.length > 0) {
    return { sources: validation.sources, error: 'validation errors', validationErrors: hardErrors }
  }
  return { sources: validation.sources }
}

// ---------------------------------------------------------------------------
// Internal: atomic write user sources
// ---------------------------------------------------------------------------

function writeUserSourcesSync(userSources: HubSourceEntry[]): void {
  const path = hubSourcesFilePath()
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })

  // Strip the builtin flag before persisting
  const toWrite = userSources.map(({ builtin: _b, ...rest }) => rest)
  const payload = { version: 1, sources: toWrite }
  const bytes = JSON.stringify(payload, null, 2)

  const tmp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, bytes)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    renameSync(tmp, path)
  } catch (err) {
    try { unlinkSync(tmp) } catch { /* ignore */ }
    throw err
  }
  _cache = null
}

// ---------------------------------------------------------------------------
// validateSourceEntry — single-entry validation used by REST handlers
// ---------------------------------------------------------------------------

export function validateSourceEntry(
  raw: unknown,
): { ok: true; entry: Omit<HubSourceEntry, 'builtin'> } | { ok: false; errors: ValidationIssue[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: [{ path: '', message: 'body must be a plain object' }] }
  }
  const p = raw as Record<string, unknown>
  const errors: ValidationIssue[] = []

  const id = typeof p.id === 'string' ? p.id : ''
  if (!ID_RE.test(id)) {
    errors.push({ path: 'id', message: 'id must match /^[a-z][a-z0-9_-]{0,63}$/' })
  } else if (BUILTIN_IDS.has(id)) {
    errors.push({ path: 'id', message: `"${id}" is a reserved built-in source id` })
  }

  const name = typeof p.name === 'string' ? p.name.trim() : ''
  if (name.length < 1 || name.length > 100) {
    errors.push({ path: 'name', message: 'name must be 1..100 characters' })
  }

  const url = typeof p.url === 'string' ? p.url.trim() : ''
  if (!url) {
    errors.push({ path: 'url', message: 'url is required' })
  } else {
    try {
      const parsedUrl = new URL(url)
      if (parsedUrl.protocol !== 'https:') {
        errors.push({ path: 'url', message: 'url must use https:// (http:// is not allowed)' })
      }
    } catch {
      errors.push({ path: 'url', message: `url is not a valid URL: "${url}"` })
    }
  }

  const trust = typeof p.trust === 'string' ? p.trust : ''
  if (!VALID_TRUST.has(trust)) {
    errors.push({ path: 'trust', message: `trust must be one of: ${[...VALID_TRUST].join(', ')}` })
  }

  const format = typeof p.format === 'string' ? p.format : ''
  if (!VALID_FORMAT.has(format)) {
    errors.push({ path: 'format', message: `format must be one of: ${[...VALID_FORMAT].join(', ')}` })
  }

  if (errors.length > 0) return { ok: false, errors }

  const enabled = typeof p.enabled === 'boolean' ? p.enabled : true
  return {
    ok: true,
    entry: {
      id,
      name,
      url,
      trust: trust as HubSourceTrust,
      format: format as HubSourceFormat,
      enabled,
    },
  }
}

// ---------------------------------------------------------------------------
// MEDIUM-1: Per-process mutex for CRUD read-modify-write operations.
//
// This prevents concurrent requests in the same Node process from racing on
// the mcp-hub-sources.json file. Cross-process locking is deferred — a single
// Node process is expected per deployment.
// ---------------------------------------------------------------------------

let _crudPending: Promise<void> = Promise.resolve()

function withCrudLock<T>(fn: () => Promise<T>): Promise<T> {
  let resolve!: () => void
  const next = new Promise<void>((r) => { resolve = r })
  const result = _crudPending.then(fn).finally(resolve)
  _crudPending = next.catch(() => undefined)
  return result
}

// ---------------------------------------------------------------------------
// CRUD mutations
// ---------------------------------------------------------------------------

/** Append a new user-defined source. */
export async function addHubSource(
  raw: unknown,
): Promise<{ ok: true; sources: HubSourceEntry[] } | { ok: false; errors: ValidationIssue[]; status?: number }> {
  const validation = validateSourceEntry(raw)
  if (!validation.ok) return { ok: false, errors: validation.errors }

  return withCrudLock(async () => {
    const existing = await readUserSources()
    const userSources = existing.sources

    if (userSources.some((s) => s.id === validation.entry.id)) {
      return { ok: false, errors: [{ path: 'id', message: `duplicate id "${validation.entry.id}"` }] }
    }

    writeUserSourcesSync([...userSources, validation.entry])

    const result = await readHubSources()
    return { ok: true, sources: result.sources }
  })
}

/** Update an existing user-defined source. */
export async function updateHubSource(
  id: string,
  raw: unknown,
): Promise<{ ok: true; sources: HubSourceEntry[] } | { ok: false; errors: ValidationIssue[]; status?: number }> {
  if (BUILTIN_IDS.has(id)) {
    return { ok: false, errors: [{ path: 'id', message: `"${id}" is a built-in source and cannot be modified` }], status: 400 }
  }

  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const merged = { ...(body as Record<string, unknown>), id }
  const validation = validateSourceEntry(merged)
  if (!validation.ok) return { ok: false, errors: validation.errors }

  return withCrudLock(async () => {
    const existing = await readUserSources()
    const userSources = existing.sources

    const idx = userSources.findIndex((s) => s.id === id)
    if (idx === -1) {
      return { ok: false, errors: [{ path: 'id', message: `source "${id}" not found` }], status: 404 }
    }

    const updated = [...userSources]
    updated[idx] = validation.entry
    writeUserSourcesSync(updated)

    const result = await readHubSources()
    return { ok: true, sources: result.sources }
  })
}

/** Remove a user-defined source by id. */
export async function deleteHubSource(
  id: string,
): Promise<{ ok: true; sources: HubSourceEntry[] } | { ok: false; errors: ValidationIssue[]; status?: number }> {
  if (BUILTIN_IDS.has(id)) {
    return { ok: false, errors: [{ path: 'id', message: `"${id}" is a built-in source and cannot be removed` }], status: 400 }
  }

  return withCrudLock(async () => {
    const existing = await readUserSources()
    const userSources = existing.sources

    const idx = userSources.findIndex((s) => s.id === id)
    if (idx === -1) {
      return { ok: false, errors: [{ path: 'id', message: `source "${id}" not found` }], status: 404 }
    }

    writeUserSourcesSync(userSources.filter((_, i) => i !== idx))

    const result = await readHubSources()
    return { ok: true, sources: result.sources }
  })
}

/** Test-only helper: reset the in-memory cache. */
export function __resetHubSourcesCacheForTests(): void {
  _cache = null
}
