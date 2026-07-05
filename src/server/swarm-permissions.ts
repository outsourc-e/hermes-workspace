/**
 * Per-worker permission (approvals) mode control for the agent swarm.
 *
 * Hermes Agent reads `approvals.mode` from
 * `~/.hermes/profiles/<workerId>/config.yaml` on every invocation, so
 * patching that key changes how a worker asks for tool approval:
 * - 'ask'   → always prompt
 * - 'smart' → default heuristic approval
 * - 'auto'  → auto-approve safe operations
 * - 'yolo'  → bypass all approval prompts
 *
 * Writes go through the `yaml` package (parse → mutate → stringify) so all
 * unrelated config keys are preserved — same style as swarm-profile-config.ts.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'yaml'
import { getProfilesDir } from './claude-paths'
import { rosterByWorkerId } from './swarm-roster'

export const SWARM_PERMISSION_MODES = ['ask', 'smart', 'auto', 'yolo'] as const

export type SwarmPermissionMode = (typeof SWARM_PERMISSION_MODES)[number]

export function isSwarmPermissionMode(
  value: unknown,
): value is SwarmPermissionMode {
  return (
    typeof value === 'string' &&
    (SWARM_PERMISSION_MODES as ReadonlyArray<string>).includes(value)
  )
}

export type PermissionModeReadResult =
  | { ok: true; mode: SwarmPermissionMode }
  | { ok: false; error: string }

export type PermissionModeWriteResult =
  | { ok: true; changed: boolean; previous: SwarmPermissionMode | null }
  | { ok: false; error: string }

function workerConfigPath(workerId: string): string {
  return join(getProfilesDir(), workerId, 'config.yaml')
}

function readConfigRoot(
  configPath: string,
): { ok: true; root: Record<string, unknown> } | { ok: false; error: string } {
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
  return { ok: true, root: parsed as Record<string, unknown> }
}

/**
 * Read `approvals.mode` from a worker's profile config. Falls back to
 * 'smart' (the Hermes default) when the key is absent but the config exists.
 */
export function getWorkerPermissionMode(
  workerId: string,
): PermissionModeReadResult {
  const read = readConfigRoot(workerConfigPath(workerId))
  if (!read.ok) return read
  const approvals =
    read.root.approvals &&
    typeof read.root.approvals === 'object' &&
    !Array.isArray(read.root.approvals)
      ? (read.root.approvals as Record<string, unknown>)
      : null
  const mode = approvals?.mode
  if (isSwarmPermissionMode(mode)) return { ok: true, mode }
  return { ok: true, mode: 'smart' }
}

/**
 * Patch `approvals.mode` in a worker's profile config, preserving all other
 * yaml keys (including sibling `approvals.*` fields).
 */
export function setWorkerPermissionMode(
  workerId: string,
  mode: string,
): PermissionModeWriteResult {
  if (!isSwarmPermissionMode(mode)) {
    return {
      ok: false,
      error: `invalid permission mode "${mode}" (expected one of: ${SWARM_PERMISSION_MODES.join(', ')})`,
    }
  }
  const configPath = workerConfigPath(workerId)
  const read = readConfigRoot(configPath)
  if (!read.ok) return read
  const root = read.root

  const existingApprovals =
    root.approvals &&
    typeof root.approvals === 'object' &&
    !Array.isArray(root.approvals)
      ? (root.approvals as Record<string, unknown>)
      : null
  const previous = isSwarmPermissionMode(existingApprovals?.mode)
    ? existingApprovals.mode
    : null

  if (previous === mode) {
    return { ok: true, changed: false, previous }
  }

  // Update in place to preserve any sibling fields (e.g. `approvals.allowlist`).
  const merged = existingApprovals ? { ...existingApprovals } : {}
  merged.mode = mode
  root.approvals = merged

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

/**
 * Map of workerId → current permission mode for every roster worker.
 * Workers whose profile config is missing/unreadable are omitted.
 */
export function getAllPermissionModes(): Record<string, SwarmPermissionMode> {
  const modes: Record<string, SwarmPermissionMode> = {}
  for (const workerId of rosterByWorkerId().keys()) {
    const result = getWorkerPermissionMode(workerId)
    if (result.ok) modes[workerId] = result.mode
  }
  return modes
}
