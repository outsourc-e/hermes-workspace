/**
 * MCP preset catalog store — Phase 2 file-backed catalog.
 *
 * Resolves `~/.hermes/mcp-presets.json` (override via `HERMES_HOME`) and
 * exposes `readPresets()` returning a normalized payload + provenance.
 *
 * Bootstrapping: when the user file is missing, the seed bundled at
 * `assets/mcp-presets.seed.json` is copied via tmp+rename so concurrent
 * workers do not truncate each other.
 */
import {
  closeSync,
  existsSync,
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
import { homedir } from 'node:os'
import { dirname, join, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import type { McpClientInput } from '../types/mcp'
import { parseMcpServerInput } from './mcp-input-validate'

export interface McpPreset {
  id: string
  name: string
  description: string
  category: string
  homepage?: string
  tags?: Array<string>
  template: McpClientInput
}

export type PresetSource = 'user-file' | 'seed' | 'invalid'

export interface ValidationIssue {
  path: string
  message: string
}

export interface ReadPresetsResult {
  presets: Array<McpPreset>
  source: PresetSource
  error?: string
  errorPath?: string
  validationErrors?: Array<ValidationIssue>
  warnings?: Array<ValidationIssue>
}

interface CacheEntry {
  key: string
  result: ReadPresetsResult
}

const ID_RE = /^[a-z][a-z0-9_-]{0,63}$/
const TAG_RE = /^[a-z][a-z0-9-]*$/
const NAME_MAX = 100
const VALID_CATEGORIES = new Set([
  'Official Presets',
  'Productivity',
  'Communication',
  'Data',
  'Storage',
  'Browser',
  'DevOps',
  'Security',
  'Custom',
])
const DESC_MAX = 500
const TAGS_MAX = 12
const TAG_LEN_MIN = 1
const TAG_LEN_MAX = 30

const PRESET_KNOWN_FIELDS = new Set([
  'id',
  'name',
  'description',
  'category',
  'homepage',
  'tags',
  'template',
])
const TOP_KNOWN_FIELDS = new Set(['version', 'presets'])

let _cache: CacheEntry | null = null

function hermesHome(): string {
  const override = process.env.HERMES_HOME?.trim()
  if (override) return override
  const claudeHome = process.env.CLAUDE_HOME?.trim()
  if (claudeHome) return claudeHome
  return join(homedir(), '.hermes')
}

export function presetsFilePath(): string {
  return join(hermesHome(), 'mcp-presets.json')
}

/**
 * Resolve the bundled seed asset path. Workspace is run either from `src/`
 * (dev) or from `dist/` (build); both layouts have `assets/` at the repo
 * root. Allow `MCP_PRESETS_SEED_PATH` to override for tests.
 */
export function seedAssetPath(): string {
  const override = process.env.MCP_PRESETS_SEED_PATH?.trim()
  if (override) return override
  // Walk up from this module to find the repo root that owns `assets/`.
  const here = fileURLToPath(new URL('.', import.meta.url))
  // Try a few candidates; first match wins.
  const candidates = [
    pathResolve(here, '../../assets/mcp-presets.seed.json'),
    pathResolve(here, '../../../assets/mcp-presets.seed.json'),
    pathResolve(process.cwd(), 'assets/mcp-presets.seed.json'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  // Fall back to cwd path so error messages remain readable
  return pathResolve(process.cwd(), 'assets/mcp-presets.seed.json')
}

type StatKeyResult =
  | { ok: true; mtimeMs: number; size: number; ino: number; ctimeMs: number }
  | { ok: false; missing: true }
  | { ok: false; missing: false; code: string }

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
      // Distinguish true absence from a dangling symlink: lstat on the path
      // itself succeeds for a symlink even when the target is missing.
      try {
        lstatSync(path)
        // lstat succeeded → path exists as a symlink pointing to a missing target
        return { ok: false, missing: false, code: 'ELOOP_DANGLING' }
      } catch {
        // lstat also failed → path truly does not exist
        return { ok: false, missing: true }
      }
    }
    return { ok: false, missing: false, code }
  }
}

function readFileText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * Atomically copy seed bytes to `final`. Returns true on success (we wrote
 * the file), false if another process won the race (file already exists).
 * Throws only on unexpected I/O failure.
 *
 * Always uses tmp+fsync+link pattern for atomicity. `fs.linkSync` is atomic
 * and EEXIST-safe: if another worker already placed the file, link fails with
 * EEXIST and we unlink the temp + return false. No direct `wx` write.
 */
function bootstrapSeed(seedBytes: string, final: string): boolean {
  const dir = dirname(final)
  mkdirSync(dir, { recursive: true })

  // Write to a per-process temp file and fsync before linking.
  const tmp = `${final}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, seedBytes)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }

  try {
    // linkSync is atomic on POSIX: succeeds only if final does not exist yet.
    linkSync(tmp, final)
    // We own final now — remove the temp hard-link.
    try { unlinkSync(tmp) } catch { /* ignore */ }
    return true
  } catch (linkErr) {
    // Always remove temp regardless of outcome.
    try { unlinkSync(tmp) } catch { /* ignore */ }
    if ((linkErr as NodeJS.ErrnoException).code === 'EEXIST') {
      // Another worker beat us — return false so caller re-reads final.
      return false
    }
    throw linkErr
  }
}

interface PresetValidation {
  presets: Array<McpPreset>
  errors: Array<ValidationIssue>
  warnings: Array<ValidationIssue>
}

function validatePayload(parsed: unknown): PresetValidation {
  const errors: Array<ValidationIssue> = []
  const warnings: Array<ValidationIssue> = []
  const out: Array<McpPreset> = []

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push({ path: '', message: 'root must be an object' })
    return { presets: [], errors, warnings }
  }
  const root = parsed as Record<string, unknown>

  if (root.version !== 1) {
    errors.push({ path: 'version', message: 'version must be 1' })
  }
  // Surface unknown top-level keys as warnings (forward-compat)
  for (const key of Object.keys(root)) {
    if (!TOP_KNOWN_FIELDS.has(key)) {
      warnings.push({ path: key, message: 'unknown top-level field (ignored)' })
    }
  }

  if (!Array.isArray(root.presets)) {
    errors.push({ path: 'presets', message: 'presets must be an array' })
    return { presets: [], errors, warnings }
  }

  const seen = new Set<string>()
  for (let i = 0; i < root.presets.length; i++) {
    const item = root.presets[i]
    const base = `presets[${i}]`
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ path: base, message: 'preset must be an object' })
      continue
    }
    const p = item as Record<string, unknown>

    // Unknown per-preset fields → warnings
    for (const key of Object.keys(p)) {
      if (!PRESET_KNOWN_FIELDS.has(key)) {
        warnings.push({ path: `${base}.${key}`, message: 'unknown field (ignored)' })
      }
    }

    const id = typeof p.id === 'string' ? p.id : ''
    if (!ID_RE.test(id)) {
      errors.push({
        path: `${base}.id`,
        message: 'id must match /^[a-z][a-z0-9_-]{0,63}$/',
      })
    } else if (seen.has(id)) {
      errors.push({ path: `${base}.id`, message: `duplicate id "${id}"` })
    } else {
      seen.add(id)
    }

    const name = typeof p.name === 'string' ? p.name : ''
    if (name.length < 1 || name.length > NAME_MAX) {
      errors.push({
        path: `${base}.name`,
        message: `name length must be 1..${NAME_MAX}`,
      })
    }

    let description = ''
    if (p.description === undefined) {
      description = ''
    } else if (typeof p.description !== 'string') {
      errors.push({ path: `${base}.description`, message: 'description must be a string' })
    } else if (p.description.length > DESC_MAX) {
      errors.push({
        path: `${base}.description`,
        message: `description length must be 0..${DESC_MAX}`,
      })
    } else {
      description = p.description
    }

    let category = 'Custom'
    if (p.category !== undefined) {
      if (typeof p.category !== 'string') {
        errors.push({ path: `${base}.category`, message: 'category must be a string' })
      } else if (!VALID_CATEGORIES.has(p.category)) {
        errors.push({
          path: `${base}.category`,
          message: `category must be one of: ${[...VALID_CATEGORIES].join(', ')}`,
        })
      } else {
        category = p.category
      }
    }

    let homepage: string | undefined
    if (p.homepage !== undefined) {
      if (typeof p.homepage !== 'string') {
        errors.push({ path: `${base}.homepage`, message: 'homepage must be a string' })
      } else {
        try {
          const u = new URL(p.homepage)
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            errors.push({ path: `${base}.homepage`, message: 'homepage must be http(s)' })
          } else {
            homepage = p.homepage
          }
        } catch {
          errors.push({ path: `${base}.homepage`, message: 'homepage is not a valid URL' })
        }
      }
    }

    let tags: Array<string> | undefined
    if (p.tags !== undefined) {
      if (!Array.isArray(p.tags)) {
        errors.push({ path: `${base}.tags`, message: 'tags must be an array' })
      } else if (p.tags.length > TAGS_MAX) {
        errors.push({ path: `${base}.tags`, message: `tags max ${TAGS_MAX} entries` })
      } else {
        const collected: Array<string> = []
        for (let ti = 0; ti < p.tags.length; ti++) {
          const t = p.tags[ti]
          if (typeof t !== 'string' || t.length < TAG_LEN_MIN || t.length > TAG_LEN_MAX || !TAG_RE.test(t)) {
            errors.push({
              path: `${base}.tags[${ti}]`,
              message: 'tag must match /^[a-z][a-z0-9-]*$/ (1..30 chars)',
            })
          } else {
            collected.push(t)
          }
        }
        tags = collected
      }
    }

    if (!p.template || typeof p.template !== 'object' || Array.isArray(p.template)) {
      errors.push({ path: `${base}.template`, message: 'template is required' })
      continue
    }
    const tmplResult = parseMcpServerInput(p.template)
    if (!tmplResult.ok) {
      for (const e of tmplResult.errors) {
        errors.push({
          path: `${base}.template${e.path ? '.' + e.path : ''}`,
          message: e.message,
        })
      }
      continue
    }

    out.push({
      id,
      name,
      description,
      category,
      ...(homepage !== undefined ? { homepage } : {}),
      ...(tags !== undefined ? { tags } : {}),
      template: tmplResult.value as McpClientInput,
    })
  }

  return { presets: out, errors, warnings }
}

function parseFromText(text: string): unknown | { __jsonError: string } {
  try {
    return JSON.parse(text)
  } catch (err) {
    return { __jsonError: (err as Error).message }
  }
}

function readSeed(): { ok: true; bytes: string; data: unknown } | { ok: false; error: string; path: string } {
  const seedPath = seedAssetPath()
  const bytes = readFileText(seedPath)
  if (bytes === null) {
    return { ok: false, error: 'seed asset missing', path: seedPath }
  }
  const parsed = parseFromText(bytes)
  if (parsed && typeof parsed === 'object' && '__jsonError' in (parsed as Record<string, unknown>)) {
    return {
      ok: false,
      error: `seed asset is not valid JSON: ${(parsed as { __jsonError: string }).__jsonError}`,
      path: seedPath,
    }
  }
  return { ok: true, bytes, data: parsed }
}

/** Build a cache key that detects same-size edits via inode + ctime. */
function makeCacheKey(path: string, st: { mtimeMs: number; size: number; ino: number; ctimeMs: number }): string {
  return `${path}:${st.mtimeMs}:${st.size}:${st.ino}:${st.ctimeMs}`
}

/**
 * Read presets from the user file, bootstrapping from the seed when missing.
 * Cache key includes mtime, size, inode, and ctime to catch same-size edits
 * with identical mtime (MED-5).
 *
 * HIGH-3: statKey now distinguishes ENOENT (bootstrap) from EACCES/ELOOP/
 * other (permission/symlink error → return source:'invalid').
 */
export async function readPresets(): Promise<ReadPresetsResult> {
  const path = presetsFilePath()

  // Fast path — file exists and we have a fresh cache entry
  const stat = statKey(path)
  if (!stat.ok) {
    if (!stat.missing) {
      // Permission denied, broken symlink, or other unreadable error.
      const reason = `cannot read existing user catalog: ${stat.code}`
      return {
        presets: [],
        source: 'invalid',
        error: reason,
        errorPath: path,
        validationErrors: [{ path: '', message: reason }],
      }
    }
    // stat.missing === true → fall through to bootstrap
  } else {
    const key = makeCacheKey(path, stat)
    if (_cache && _cache.key === key) {
      return _cache.result
    }
    const text = readFileText(path)
    if (text === null) {
      // File vanished between stat and read — fall through to bootstrap
    } else {
      const parsed = parseFromText(text)
      if (parsed && typeof parsed === 'object' && '__jsonError' in (parsed as Record<string, unknown>)) {
        const result: ReadPresetsResult = {
          presets: [],
          source: 'invalid',
          error: `User catalog file is not valid JSON: ${(parsed as { __jsonError: string }).__jsonError}`,
          errorPath: path,
          validationErrors: [
            { path: '', message: (parsed as { __jsonError: string }).__jsonError },
          ],
        }
        _cache = { key, result }
        return result
      }
      const validation = validatePayload(parsed)
      if (validation.errors.length > 0) {
        const result: ReadPresetsResult = {
          presets: [],
          source: 'invalid',
          error: `User catalog file failed validation (${validation.errors.length} error${validation.errors.length === 1 ? '' : 's'}).`,
          errorPath: path,
          validationErrors: validation.errors,
          ...(validation.warnings.length > 0 ? { warnings: validation.warnings } : {}),
        }
        _cache = { key, result }
        return result
      }
      const result: ReadPresetsResult = {
        presets: validation.presets,
        source: 'user-file',
        ...(validation.warnings.length > 0 ? { warnings: validation.warnings } : {}),
      }
      _cache = { key, result }
      return result
    }
  }

  // Bootstrap from seed
  const seed = readSeed()
  if (!seed.ok) {
    const result: ReadPresetsResult = {
      presets: [],
      source: 'invalid',
      error: seed.error,
      errorPath: seed.path,
      validationErrors: [{ path: '', message: seed.error }],
    }
    // Do not cache invalid-seed result — operator may fix the asset
    return result
  }

  const seedValidation = validatePayload(seed.data)
  if (seedValidation.errors.length > 0) {
    const result: ReadPresetsResult = {
      presets: [],
      source: 'invalid',
      error: `Bundled seed asset failed validation (${seedValidation.errors.length} error${seedValidation.errors.length === 1 ? '' : 's'}).`,
      errorPath: seedAssetPath(),
      validationErrors: seedValidation.errors,
      ...(seedValidation.warnings.length > 0 ? { warnings: seedValidation.warnings } : {}),
    }
    // Do NOT clobber user file (we never had one) — just return invalid
    return result
  }

  let wrote = true
  try {
    wrote = bootstrapSeed(seed.bytes, path)
  } catch (err) {
    const result: ReadPresetsResult = {
      presets: [],
      source: 'invalid',
      error: `Failed to bootstrap user catalog: ${(err as Error).message}`,
      errorPath: path,
      validationErrors: [{ path: '', message: (err as Error).message }],
    }
    return result
  }

  // EEXIST race — another worker wrote concurrently. Re-read final.
  if (!wrote) {
    const stat2 = statKey(path)
    const text2 = stat2.ok ? readFileText(path) : null
    if (stat2.ok && text2 !== null) {
      const parsed2 = parseFromText(text2)
      if (
        !(parsed2 && typeof parsed2 === 'object' && '__jsonError' in (parsed2 as Record<string, unknown>))
      ) {
        const validation = validatePayload(parsed2)
        if (validation.errors.length === 0) {
          const result: ReadPresetsResult = {
            presets: validation.presets,
            source: 'seed',
            ...(validation.warnings.length > 0 ? { warnings: validation.warnings } : {}),
          }
          _cache = { key: makeCacheKey(path, stat2), result }
          return result
        }
      }
    }
  }

  // Return seed-validated presets directly so the first request is fast even
  // if a re-stat would briefly miss the just-written file on slow filesystems.
  const stat3 = statKey(path)
  const result: ReadPresetsResult = {
    presets: seedValidation.presets,
    source: 'seed',
    ...(seedValidation.warnings.length > 0 ? { warnings: seedValidation.warnings } : {}),
  }
  if (stat3.ok) {
    _cache = { key: makeCacheKey(path, stat3), result }
  }
  return result
}

/**
 * Test-only helper: reset the in-memory cache so a freshly-mocked
 * `HERMES_HOME` is honored on the next call.
 */
export function __resetPresetsCacheForTests(): void {
  _cache = null
}
