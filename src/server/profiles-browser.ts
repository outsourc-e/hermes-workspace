import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'

export type ProfileSummary = {
  name: string
  path: string
  active: boolean
  exists: boolean
  model?: string
  provider?: string
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
  return process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
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
 * Validate a profile name that will only be *read* (e.g. \`cloneFrom\` source).
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
    return (
      (YAML.parse(safeReadText(configPath)) as Record<string, unknown>) || {}
    )
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
      if (!entry.isDirectory()) continue
      const name = entry.name
      const profilePath = path.join(profilesRoot, name)
      const configPath = path.join(profilePath, 'config.yaml')
      const envPath = path.join(profilePath, '.env')
      const skillsDir = path.join(profilePath, 'skills')
      const sessionsDir = path.join(profilePath, 'sessions')
      const config = readYamlConfig(configPath)
      const skillCount = countFilesRecursive(
        skillsDir,
        (full) => path.basename(full) === 'SKILL.md',
      )
      const sessionCount = countFilesRecursive(sessionsDir, (full) =>
        /\.(jsonl|json|sqlite|db)$/i.test(full),
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
        skillCount,
        sessionCount,
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
    skillCount: countFilesRecursive(
      path.join(root, 'skills'),
      (full) => path.basename(full) === 'SKILL.md',
    ),
    sessionCount: countFilesRecursive(path.join(root, 'sessions'), (full) =>
      /\.(jsonl|json|sqlite|db)$/i.test(full),
    ),
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
  return {
    name: normalized,
    path: profilePath,
    active: normalized === active,
    config: readYamlConfig(configPath),
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
    const activePath = getActiveProfilePath()
    if (fs.existsSync(activePath)) fs.unlinkSync(activePath)
    return
  }
  const normalized = validateProfileName(trimmed)
  const profilePath = path.join(getProfilesRoot(), normalized)
  if (!fs.existsSync(profilePath)) throw new Error('Profile not found')
  fs.mkdirSync(getClaudeRoot(), { recursive: true })
  fs.writeFileSync(getActiveProfilePath(), `${normalized}\n`, 'utf-8')
  // eslint-disable-next-line no-console
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
  if (getActiveProfileName() === from) {
    fs.writeFileSync(getActiveProfilePath(), `${to}\n`, 'utf-8')
  }
  return readProfile(to)
}
