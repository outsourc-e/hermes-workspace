import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'

const require = createRequire(import.meta.url)

type SqliteDatabaseSync = {
  prepare: (sql: string) => {
    get: () => Record<string, unknown> | undefined
  }
  close: () => void
}

type NodeSqliteModule = {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabaseSync
}

export type ProfileSummary = {
  name: string
  path: string
  active: boolean
  exists: boolean
  model?: string
  provider?: string
  description?: string
  systemPrompt?: string
  skillCount: number
  sessionCount: number
  hasEnv: boolean
  updatedAt?: string
}

export type ProfileDetail = {
  name: string
  path: string
  active: boolean
  config: Record<string, unknown>
  description: string
  systemPrompt: string
  envPath?: string
  hasEnv: boolean
  sessionsDir?: string
  skillsDir?: string
}

const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const TEXT_REWRITE_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.yaml',
  '.yml',
  '.json',
  '.jsonl',
  '.toml',
  '.env',
  '.plist',
  '.sh',
  '.js',
  '.ts',
  '.tsx',
])

function getHermesRoot(): string {
  return (
    process.env.HERMES_HOME ??
    process.env.CLAUDE_HOME ??
    path.join(os.homedir(), '.hermes')
  )
}

function getClaudeRoot(): string {
  return getHermesRoot()
}

export function getProfilesRoot(): string {
  return path.join(getClaudeRoot(), 'profiles')
}

function getActiveProfilePath(): string {
  return path.join(getClaudeRoot(), 'active_profile')
}

function stickyActiveProfileEnabled(): boolean {
  return process.env.HERMES_WORKSPACE_STICKY_PROFILE !== '0'
}

/**
 * Validate a profile name that will be *written* to disk. The 'default'
 * profile is reserved — callers must not create or mutate it via the UI.
 */
function validateProfileName(name: string): string {
  const trimmed = validateProfileIdentifier(name)
  if (trimmed === 'default')
    throw new Error('Default profile cannot be modified here')
  return trimmed
}

/**
 * Validate a profile name that will only be *read* (e.g. `cloneFrom` source).
 * Any existing profile name is allowed, including 'default'.
 */
function validateProfileIdentifier(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Profile name is required')
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..')
  ) {
    throw new Error('Invalid profile name')
  }
  return trimmed
}

function safeReadText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

function readYamlConfig(configPath: string): Record<string, unknown> {
  if (!fs.existsSync(configPath)) return {}
  try {
    const parsed = YAML.parse(safeReadText(configPath)) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function countFilesRecursive(
  rootPath: string,
  predicate: (fullPath: string) => boolean,
): number {
  if (!fs.existsSync(rootPath)) return 0
  let count = 0
  const stack = [rootPath]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries: Array<fs.Dirent> = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (predicate(fullPath)) count += 1
    }
  }
  return count
}

function countLegacySessionFiles(sessionsDir: string): number {
  return countFilesRecursive(sessionsDir, (full) =>
    /\.(jsonl|json|sqlite|db)$/i.test(full),
  )
}

function countSessionsFromStateDb(profilePath: string): number | undefined {
  const dbPath = path.join(profilePath, 'state.db')
  if (!fs.existsSync(dbPath)) return undefined

  let db: SqliteDatabaseSync | undefined
  try {
    const sqlite = require('node:sqlite') as NodeSqliteModule
    db = new sqlite.DatabaseSync(dbPath, { readOnly: true })
    const row = db.prepare('select count(*) as count from sessions').get()
    const count = row?.count
    return typeof count === 'number' ? count : undefined
  } catch {
    return undefined
  } finally {
    try {
      db?.close()
    } catch {
      // Ignore close failures; session counting should not break profile listing.
    }
  }
}

function countProfileSessions(profilePath: string): number {
  return (
    countSessionsFromStateDb(profilePath) ??
    countLegacySessionFiles(path.join(profilePath, 'sessions'))
  )
}

function latestMtime(paths: Array<string>): string | undefined {
  let latest = 0
  for (const target of paths) {
    if (!fs.existsSync(target)) continue
    try {
      const stat = fs.statSync(target)
      latest = Math.max(latest, stat.mtimeMs)
    } catch {
      // ignore
    }
  }
  return latest > 0 ? new Date(latest).toISOString() : undefined
}

function extractDescription(config: Record<string, unknown>): string {
  const direct = config.description
  if (typeof direct === 'string') return direct.trim()

  const metadata = config.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const nested = (metadata as Record<string, unknown>).description
    if (typeof nested === 'string') return nested.trim()
  }

  return ''
}

function extractSystemPrompt(
  config: Record<string, unknown>,
  profilePath: string,
): string {
  const configured = config.system_prompt
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim()
  }

  const soulPath = path.join(profilePath, 'SOUL.md')
  if (!fs.existsSync(soulPath)) return ''

  try {
    return safeReadText(soulPath).trim()
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Dashboard API fallback for split-host deployments
// ---------------------------------------------------------------------------

function getDashboardUrl(): string | undefined {
  const url = process.env.HERMES_DASHBOARD_URL?.trim()
  return url || undefined
}

function getDashboardToken(): string | undefined {
  return (
    process.env.HERMES_API_TOKEN?.trim() ||
    process.env.CLAUDE_API_TOKEN?.trim() ||
    process.env.CLAUDE_DASHBOARD_TOKEN?.trim() ||
    undefined
  )
}

async function fetchDashboardProfiles(): Promise<{
  profiles: Array<ProfileSummary>
  activeProfile: string
} | null> {
  const dashboardUrl = getDashboardUrl()
  if (!dashboardUrl) return null

  try {
    const token = getDashboardToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const response = await fetch(`${dashboardUrl}/api/profiles`, {
      headers,
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null

    const data = (await response.json()) as {
      profiles?: Array<{
        name: string
        model?: string
        provider?: string
        description?: string
        is_default?: boolean
        skill_count?: number
        session_count?: number
        has_env?: boolean
        updated_at?: string
      }>
    }

    if (!data.profiles || !Array.isArray(data.profiles)) return null

    const activeProfile =
      data.profiles.find((p) => p.is_default)?.name || 'default'

    const profiles: Array<ProfileSummary> = data.profiles.map((p) => ({
      name: p.name,
      path: p.is_default
        ? getClaudeRoot()
        : path.join(getProfilesRoot(), p.name),
      active: p.name === activeProfile,
      exists: true,
      model: p.model,
      provider: p.provider,
      description: p.description,
      skillCount: p.skill_count ?? 0,
      sessionCount: p.session_count ?? 0,
      hasEnv: p.has_env ?? false,
      updatedAt: p.updated_at,
    }))

    profiles.sort((a, b) => {
      if (a.active && !b.active) return -1
      if (!a.active && b.active) return 1
      return Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '')
    })

    return { profiles, activeProfile }
  } catch (error) {
    // Dashboard unreachable or returned unexpected data — fall back to filesystem
    return null
  }
}

/**
 * List profiles with dashboard API fallback for split-host deployments.
 * When HERMES_DASHBOARD_URL is set and reachable, fetches from the dashboard
 * API. Falls back to filesystem reads for colocated deployments.
 */
export async function listProfilesWithFallback(): Promise<{
  profiles: Array<ProfileSummary>
  activeProfile: string
}> {
  // Try dashboard first for split-host deployments
  const dashboardResult = await fetchDashboardProfiles()
  if (dashboardResult) return dashboardResult

  // Fall back to filesystem (colocated deployment)
  return {
    profiles: listProfiles(),
    activeProfile: getActiveProfileName(),
  }
}

/**
 * Read a single profile with dashboard API fallback for split-host deployments.
 */
export async function readProfileWithFallback(
  name: string,
): Promise<ProfileDetail> {
  // Try filesystem first (fast path for colocated deployments)
  const normalized = name.trim() || 'default'
  const profilePath =
    normalized === 'default'
      ? getClaudeRoot()
      : path.join(getProfilesRoot(), validateProfileIdentifier(normalized))

  if (fs.existsSync(profilePath)) {
    return readProfile(normalized)
  }

  // Filesystem miss — try dashboard API for split-host deployments
  const dashboardUrl = getDashboardUrl()
  if (dashboardUrl) {
    try {
      const token = getDashboardToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(`${dashboardUrl}/api/profiles`, {
        headers,
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        const data = (await response.json()) as {
          profiles?: Array<{
            name: string
            model?: string
            provider?: string
            description?: string
            is_default?: boolean
          }>
        }
        const match = data.profiles?.find(
          (p) => p.name === normalized || (normalized === 'default' && p.is_default),
        )
        if (match) {
          const active = getActiveProfileName()
          return {
            name: match.name,
            path: match.is_default
              ? getClaudeRoot()
              : path.join(getProfilesRoot(), match.name),
            active: match.name === active,
            config: {
              ...(match.model ? { model: match.model } : {}),
              ...(match.provider ? { provider: match.provider } : {}),
            },
            description: match.description || '',
            systemPrompt: '',
            hasEnv: false,
          }
        }
      }
    } catch {
      // Dashboard unreachable — fall through to error
    }
  }

  throw new Error('Profile not found')
}

export function getActiveProfileName(): string {
  const activePath = getActiveProfilePath()
  if (!fs.existsSync(activePath)) return 'default'
  try {
    const raw = safeReadText(activePath).trim()
    return raw || 'default'
  } catch {
    return 'default'
  }
}

export function listProfiles(): Array<ProfileSummary> {
  const profilesRoot = getProfilesRoot()
  const activeProfile = getActiveProfileName()
  const results: Array<ProfileSummary> = []

  if (fs.existsSync(profilesRoot)) {
    let entries: Array<fs.Dirent> = []
    try {
      entries = fs.readdirSync(profilesRoot, { withFileTypes: true })
    } catch {
      entries = []
    }

    for (const entry of entries) {
      const name = entry.name
      if (name === 'default') continue
      const profilePath = path.join(profilesRoot, name)
      if (!entry.isDirectory()) {
        if (!entry.isSymbolicLink()) continue
        try {
          if (!fs.statSync(profilePath).isDirectory()) continue
        } catch {
          continue
        }
      }
      const configPath = path.join(profilePath, 'config.yaml')
      const envPath = path.join(profilePath, '.env')
      const skillsDir = path.join(profilePath, 'skills')
      const sessionsDir = path.join(profilePath, 'sessions')
      const config = readYamlConfig(configPath)
      const skillCount = countFilesRecursive(
        skillsDir,
        (full) => path.basename(full) === 'SKILL.md',
      )
      // Resolve model/provider from nested or flat config structure
      let modelName: string | undefined
      let providerName: string | undefined
      if (typeof config.model === 'string') {
        modelName = config.model
      } else if (
        config.model &&
        typeof config.model === 'object' &&
        !Array.isArray(config.model)
      ) {
        const m = config.model as Record<string, unknown>
        if (typeof m.default === 'string') modelName = m.default
        if (typeof m.provider === 'string') providerName = m.provider
      }
      if (!providerName && typeof config.provider === 'string') {
        providerName = config.provider
      }
      results.push({
        name,
        path: profilePath,
        active: name === activeProfile,
        exists: true,
        model: modelName,
        provider: providerName,
        description: extractDescription(config) || undefined,
        systemPrompt: extractSystemPrompt(config, profilePath) || undefined,
        skillCount,
        sessionCount: countProfileSessions(profilePath),
        hasEnv: fs.existsSync(envPath),
        updatedAt: latestMtime([
          profilePath,
          configPath,
          envPath,
          skillsDir,
          sessionsDir,
        ]),
      })
    }
  }

  const root = getClaudeRoot()
  const config = readYamlConfig(path.join(root, 'config.yaml'))
  // Resolve model/provider for default profile too
  let defaultModel: string | undefined
  let defaultProvider: string | undefined
  if (typeof config.model === 'string') {
    defaultModel = config.model
  } else if (
    config.model &&
    typeof config.model === 'object' &&
    !Array.isArray(config.model)
  ) {
    const m = config.model as Record<string, unknown>
    if (typeof m.default === 'string') defaultModel = m.default
    if (typeof m.provider === 'string') defaultProvider = m.provider
  }
  if (!defaultProvider && typeof config.provider === 'string') {
    defaultProvider = config.provider
  }
  results.unshift({
    name: 'default',
    path: root,
    active: activeProfile === 'default',
    exists: true,
    model: defaultModel,
    provider: defaultProvider,
    description: extractDescription(config) || undefined,
    systemPrompt: extractSystemPrompt(config, root) || undefined,
    skillCount: countFilesRecursive(
      path.join(root, 'skills'),
      (full) => path.basename(full) === 'SKILL.md',
    ),
    sessionCount: countProfileSessions(root),
    hasEnv: fs.existsSync(path.join(root, '.env')),
    updatedAt: latestMtime([root, path.join(root, 'config.yaml')]),
  })

  results.sort((a, b) => {
    if (a.active && !b.active) return -1
    if (!a.active && b.active) return 1
    return Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '')
  })
  return results
}

export function readProfile(name: string): ProfileDetail {
  const active = getActiveProfileName()
  const normalized = name.trim() || 'default'
  const profilePath =
    normalized === 'default'
      ? getClaudeRoot()
      : path.join(getProfilesRoot(), validateProfileName(normalized))
  if (!fs.existsSync(profilePath)) throw new Error('Profile not found')
  const configPath = path.join(profilePath, 'config.yaml')
  const envPath = path.join(profilePath, '.env')
  const sessionsDir = path.join(profilePath, 'sessions')
  const skillsDir = path.join(profilePath, 'skills')
  const config = readYamlConfig(configPath)
  return {
    name: normalized,
    path: profilePath,
    active: normalized === active,
    config,
    description: extractDescription(config),
    systemPrompt: extractSystemPrompt(config, profilePath),
    envPath: fs.existsSync(envPath) ? envPath : undefined,
    hasEnv: fs.existsSync(envPath),
    sessionsDir: fs.existsSync(sessionsDir) ? sessionsDir : undefined,
    skillsDir: fs.existsSync(skillsDir) ? skillsDir : undefined,
  }
}

export function setActiveProfile(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Profile name is required')
  // "default" means clear the active_profile file (revert to default)
  if (trimmed === 'default') {
    if (stickyActiveProfileEnabled()) {
      const activePath = getActiveProfilePath()
      if (fs.existsSync(activePath)) fs.unlinkSync(activePath)
    }
    return
  }
  const normalized = validateProfileName(trimmed)
  const profilePath = path.join(getProfilesRoot(), normalized)
  if (!fs.existsSync(profilePath)) throw new Error('Profile not found')
  if (stickyActiveProfileEnabled()) {
    fs.mkdirSync(getClaudeRoot(), { recursive: true })
    fs.writeFileSync(getActiveProfilePath(), `${normalized}\n`, 'utf-8')
  }
  console.warn(
    `[profiles] Active profile set to "${normalized}". Restart the Hermes Agent gateway for this profile switch to take effect.`,
  )
}

export function createProfile(
  name: string,
  options?: { cloneFrom?: string; model?: string; provider?: string },
): ProfileDetail {
  const normalized = validateProfileName(name)
  const profilePath = path.join(getProfilesRoot(), normalized)
  if (fs.existsSync(profilePath)) throw new Error('Profile already exists')
  fs.mkdirSync(profilePath, { recursive: true })

  const configPath = path.join(profilePath, 'config.yaml')

  // Clone config from source profile if specified
  if (options?.cloneFrom) {
    const sourceName = validateProfileIdentifier(options.cloneFrom)
    // The 'default' profile lives at ~/.hermes, not ~/.hermes/profiles/default
    const sourceRoot =
      sourceName === 'default'
        ? getClaudeRoot()
        : path.join(getProfilesRoot(), sourceName)
    const sourceConfigPath = path.join(sourceRoot, 'config.yaml')
    if (fs.existsSync(sourceConfigPath)) {
      fs.copyFileSync(sourceConfigPath, configPath)
    } else {
      fs.writeFileSync(
        configPath,
        YAML.stringify({ model: '', provider: '' }),
        'utf-8',
      )
    }
  } else {
    fs.writeFileSync(
      configPath,
      YAML.stringify({ model: '', provider: '' }),
      'utf-8',
    )
  }

  // Override model/provider if specified
  if (options?.model || options?.provider) {
    const config = readYamlConfig(configPath)
    if (options.model) config.model = options.model
    if (options.provider) config.provider = options.provider
    fs.writeFileSync(configPath, YAML.stringify(config), 'utf-8')
  }

  // Create subdirectories
  fs.mkdirSync(path.join(profilePath, 'skills'), { recursive: true })
  fs.mkdirSync(path.join(profilePath, 'sessions'), { recursive: true })

  return readProfile(normalized)
}

export function deleteProfile(name: string): void {
  const normalized = validateProfileName(name)
  if (normalized === getActiveProfileName())
    throw new Error('Cannot delete the active profile')
  const profilePath = path.join(getProfilesRoot(), normalized)
  if (!fs.existsSync(profilePath)) throw new Error('Profile not found')
  const trashDir = path.join(getClaudeRoot(), 'trash')
  fs.mkdirSync(trashDir, { recursive: true })
  const trashName = `${normalized}-${Date.now()}`
  fs.renameSync(profilePath, path.join(trashDir, trashName))
}

export function updateProfileConfig(
  name: string,
  patch: Record<string, unknown>,
): ProfileDetail {
  const normalized = name.trim() || 'default'
  const profilePath =
    normalized === 'default'
      ? getClaudeRoot()
      : path.join(getProfilesRoot(), validateProfileName(normalized))
  if (!fs.existsSync(profilePath)) throw new Error('Profile not found')
  const configPath = path.join(profilePath, 'config.yaml')
  const current = readYamlConfig(configPath)

  // Deep merge helper (same logic as claude-config.ts)
  function deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ) {
    for (const [key, value] of Object.entries(source)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        target[key] &&
        typeof target[key] === 'object'
      ) {
        deepMerge(
          target[key] as Record<string, unknown>,
          value as Record<string, unknown>,
        )
      } else {
        target[key] = value
      }
    }
  }

  // Handle null values as explicit removals
  const updates = { ...patch }
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      delete current[key]
      delete updates[key]
    }
  }
  deepMerge(current, updates)

  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, YAML.stringify(current), 'utf-8')
  return readProfile(normalized)
}

export function renameProfile(oldName: string, newName: string): ProfileDetail {
  const from = validateProfileName(oldName)
  const to = validateProfileName(newName)
  const fromPath = path.join(getProfilesRoot(), from)
  const toPath = path.join(getProfilesRoot(), to)
  if (!fs.existsSync(fromPath)) throw new Error('Profile not found')
  if (fs.existsSync(toPath)) throw new Error('Target profile already exists')
  fs.renameSync(fromPath, toPath)
  if (stickyActiveProfileEnabled() && getActiveProfileName() === from) {
    fs.writeFileSync(getActiveProfilePath(), `${to}\n`, 'utf-8')
  }
  return readProfile(to)
}
