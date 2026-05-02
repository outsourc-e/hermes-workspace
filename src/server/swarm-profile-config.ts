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

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'yaml'

export type ConfigSyncResult =
  | { ok: true; changed: boolean; previous?: { provider: string; default: string } }
  | { ok: false; error: string }

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
