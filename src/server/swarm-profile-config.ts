/**
 * Patch a swarm worker's profile `config.yaml` so its `model.provider`
 * and `model.default` match the roster.
 *
 * Hermes Agent reads `~/.hermes/profiles/<workerId>/config.yaml` on every
 * `hermes` invocation. The wrapper at `~/.local/bin/<workerId>` invokes
 * `hermes chat --continue` with no `--model` flag, so the per-profile
 * config wins. Without a sync step, the roster's `model:` field is purely
 * cosmetic — the bug reported in #236.
 *
 * This helper is best-effort: if the config file is missing or malformed
 * it leaves things alone (don't wedge a worker because we couldn't write
 * a model line). It also no-ops when the existing model config already
 * matches, so re-running on a healthy profile is free.
 */

import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as yaml from 'yaml'

export type ConfigSyncResult =
  | { ok: true; changed: boolean; previous?: { provider: string; default: string } }
  | { ok: false; error: string }

export type ProfileBootstrapResult = {
  ok: boolean
  configCreated: boolean
  envLinked: boolean
  authLinked: boolean
  error?: string
}

export type SwarmWorkerIdentity = {
  id: string
  name?: string
  role?: string
  specialty?: string
  model?: string
  mission?: string
  skills?: Array<string>
  capabilities?: Array<string>
}

/**
 * Ensure a worker HERMES_HOME has enough runtime config to boot Hermes.
 *
 * Swarm dispatch runs workers with HERMES_HOME=~/.hermes/profiles/<workerId>.
 * A brand-new profile only has memory/runtime files, so `hermes chat -q` exits
 * with first-run setup before the worker can do any work. Bootstrap by copying
 * the operator's non-secret config.yaml and linking the private .env locally.
 * The config is copied (not symlinked) because per-worker model sync edits it.
 */
export function ensureSwarmProfileConfig(profilePath: string): ProfileBootstrapResult {
  const result: ProfileBootstrapResult = { ok: true, configCreated: false, envLinked: false, authLinked: false }
  try {
    mkdirSync(profilePath, { recursive: true })

    const configPath = join(profilePath, 'config.yaml')
    const sourceConfig = join(homedir(), '.hermes', 'config.yaml')
    if (!existsSync(configPath) && existsSync(sourceConfig)) {
      copyFileSync(sourceConfig, configPath)
      result.configCreated = true
    }

    const envPath = join(profilePath, '.env')
    const sourceEnv = join(homedir(), '.hermes', '.env')
    if (existsSync(sourceEnv)) {
      let shouldLink = !existsSync(envPath)
      if (!shouldLink) {
        try {
          const stat = lstatSync(envPath)
          shouldLink = stat.isSymbolicLink()
          if (shouldLink) unlinkSync(envPath)
        } catch {
          shouldLink = false
        }
      }
      if (shouldLink) {
        symlinkSync(sourceEnv, envPath)
        result.envLinked = true
      }
    }

    const authPath = join(profilePath, 'auth.json')
    const sourceAuth = join(homedir(), '.hermes', 'auth.json')
    if (existsSync(sourceAuth)) {
      let shouldLink = !existsSync(authPath)
      if (!shouldLink) {
        try {
          const stat = lstatSync(authPath)
          shouldLink = stat.isSymbolicLink()
          if (shouldLink) unlinkSync(authPath)
        } catch {
          shouldLink = false
        }
      }
      if (shouldLink) {
        symlinkSync(sourceAuth, authPath)
        result.authLinked = true
      }
    }

    if (!existsSync(configPath)) {
      return { ...result, ok: false, error: `config.yaml missing at ${configPath}` }
    }
    return result
  } catch (err) {
    return { ...result, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function renderSwarmWorkerIdentity(worker: SwarmWorkerIdentity): string {
  const name = worker.name?.trim() || worker.id
  const role = worker.role?.trim() || 'Worker'
  const specialty = worker.specialty?.trim() || 'General execution'
  const model = worker.model?.trim() || 'Unspecified'
  const mission = worker.mission?.trim() || 'Execute assigned swarm work and checkpoint progress.'
  const skills = worker.skills && worker.skills.length > 0 ? worker.skills.join(', ') : 'swarm-worker-core'
  const capabilities = worker.capabilities && worker.capabilities.length > 0 ? worker.capabilities.join(', ') : 'not declared'

  return [
    `# IDENTITY.md — ${name}`,
    '',
    `- Name: ${name}`,
    `- Worker ID: ${worker.id}`,
    `- Role: ${role}`,
    `- Specialty: ${specialty}`,
    `- Mission: ${mission}`,
    `- Skills: ${skills}`,
    `- Capabilities: ${capabilities}`,
    `- Model: ${model}`,
    '',
    '## Job description',
    `${name} is the ${role} lane. ${mission}`,
    '',
    'The worker ID is a stable machine identifier only; user-facing surfaces should prefer `Name — Role`.',
    '',
  ].join('\n')
}

export function syncSwarmProfileIdentity(profilePath: string, worker: SwarmWorkerIdentity): ConfigSyncResult {
  if (!existsSync(profilePath)) {
    return { ok: false, error: `profile path missing: ${profilePath}` }
  }
  const identityDir = join(profilePath, 'memory')
  const identityPath = join(identityDir, 'IDENTITY.md')
  const next = renderSwarmWorkerIdentity(worker)
  try {
    mkdirSync(identityDir, { recursive: true })
    const current = existsSync(identityPath) ? readFileSync(identityPath, 'utf8') : ''
    if (current === next) return { ok: true, changed: false }
    const tmpPath = `${identityPath}.tmp-${process.pid}-${Date.now()}`
    writeFileSync(tmpPath, next, 'utf8')
    renameSync(tmpPath, identityPath)
    return { ok: true, changed: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function syncSwarmProfileModel(
  profilePath: string,
  next: { provider: string; default: string },
): ConfigSyncResult {
  if (!existsSync(profilePath)) {
    return { ok: false, error: `profile path missing: ${profilePath}` }
  }
  const configPath = join(profilePath, 'config.yaml')
  if (!existsSync(configPath)) {
    return { ok: false, error: `config.yaml missing at ${configPath}` }
  }

  let raw: string
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  let parsed: unknown
  try {
    parsed = yaml.parse(raw) ?? {}
  } catch (err) {
    return {
      ok: false,
      error: `failed to parse config.yaml: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'config.yaml root is not an object' }
  }
  const root = parsed as Record<string, unknown>

  const existingModel =
    root.model && typeof root.model === 'object' && !Array.isArray(root.model)
      ? (root.model as Record<string, unknown>)
      : null
  const existingProvider =
    existingModel && typeof existingModel.provider === 'string'
      ? existingModel.provider
      : ''
  const existingDefault =
    existingModel && typeof existingModel.default === 'string'
      ? existingModel.default
      : ''

  if (
    existingProvider === next.provider &&
    existingDefault === next.default
  ) {
    return {
      ok: true,
      changed: false,
      previous: { provider: existingProvider, default: existingDefault },
    }
  }

  const previous = existingProvider || existingDefault
    ? { provider: existingProvider, default: existingDefault }
    : undefined

  // Update in place to preserve any sibling fields (e.g. `model.alternates`).
  const merged = existingModel ? { ...existingModel } : {}
  merged.provider = next.provider
  merged.default = next.default
  root.model = merged

  let serialised: string
  try {
    serialised = yaml.stringify(root, { lineWidth: 0 })
  } catch (err) {
    return {
      ok: false,
      error: `failed to stringify config.yaml: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const tmpPath = `${configPath}.tmp-${process.pid}-${Date.now()}`
  try {
    writeFileSync(tmpPath, serialised, 'utf8')
    renameSync(tmpPath, configPath)
    return { ok: true, changed: true, previous }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
