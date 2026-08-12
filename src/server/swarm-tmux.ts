import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Single shared tmux binary resolver for the swarm.
 *
 * Both the runtime/status probe (swarm-runtime.ts) and the dispatch spawn
 * path (swarm-dispatch.ts) must agree on which tmux binary to use, otherwise
 * the same box can produce two different answers (0 workers in the UI while
 * `tmux ls` shows live sessions, or a dispatch falling back to oneshot even
 * though a session exists).
 *
 * Resolution order:
 *   1. Explicit override (HERMES_TMUX_BIN || CLAUDE_TMUX_BIN || TMUX_BIN).
 *      An absolute path must exist; a bare command (no slash) is trusted and
 *      resolved via PATH by execFile.
 *   2. Absolute candidates, first that `existsSync`.
 *   3. Bare `tmux` as the last resort (resolved via PATH).
 *
 * Unlike the previous dispatch resolver, absolute candidates are never
 * returned without an existence check — the old code returned
 * `/opt/homebrew/bin/tmux` or `/usr/local/bin/tmux` unconditionally, which is
 * a hard spawn failure on any Linux box where those paths don't exist.
 */
export function resolveTmuxBin(): string | null {
  const override =
    process.env.HERMES_TMUX_BIN ||
    process.env.CLAUDE_TMUX_BIN ||
    process.env.TMUX_BIN
  if (override) {
    if (!override.includes('/')) return override
    if (existsSync(override)) return override
  }

  const candidates = [
    '/opt/homebrew/bin/tmux',
    '/usr/local/bin/tmux',
    '/usr/bin/tmux',
    join(homedir(), '.local', 'bin', 'tmux'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return 'tmux'
}
