import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Resolve the Hermes workspace state directory.
 *
 * Priority:
 * 1. `HERMES_WORKSPACE_STATE_DIR` env var (explicit override)
 * 2. `join(HERMES_HOME, 'workspace')` where HERMES_HOME respects
 *    `HERMES_HOME` → `CLAUDE_HOME` → `~/.hermes` (standard chain)
 *
 * The returned path is absolute and resolved. Callers should create the
 * directory at startup if it doesn't exist.
 */
export function getStateDir(): string {
  const explicit = process.env.HERMES_WORKSPACE_STATE_DIR?.trim()
  if (explicit) return resolve(explicit)

  const hermesHome =
    process.env.HERMES_HOME?.trim() ??
    process.env.CLAUDE_HOME?.trim() ??
    join(homedir(), '.hermes')

  return resolve(join(hermesHome, 'workspace'))
}
