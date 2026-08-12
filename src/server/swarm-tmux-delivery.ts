/**
 * Shared tmux transport helpers for Swarm worker sessions.
 *
 * Lifecycle (all modes):
 *   POST /api/swarm-tmux-start  → tmux new-session -d -s swarm-<role> "<shell|hermes>"
 *   POST /api/swarm-dispatch    → tmux send-keys (TUI paste or CLI command)
 *   POST /api/swarm-tmux-scroll → capture-pane / copy-mode scroll
 *   POST /api/swarm-tmux-stop   → tmux kill-session
 */

import { execFile } from 'node:child_process'

export type TmuxTransportMode = 'tui' | 'cli'

export function shellEscapeSingle(value: string): string {
  return value.replace(/'/g, `'\\''`)
}

/** tmux-tui: long-lived Hermes TUI (paste SwarmBrief into prompt). */
export function buildHermesTmuxTuiCommand(input: {
  profilePath: string
  hermesBin: string
  ghToken?: string | null
  useExec?: boolean
}): string {
  const launchPrefix = [
    `HERMES_HOME='${shellEscapeSingle(input.profilePath)}'`,
    `HERMES_CLI_BIN='${shellEscapeSingle(input.hermesBin)}'`,
    input.ghToken ? `GH_TOKEN='${shellEscapeSingle(input.ghToken)}'` : '',
    input.ghToken ? `GITHUB_TOKEN='${shellEscapeSingle(input.ghToken)}'` : '',
  ].filter(Boolean).join(' ')
  const hermesBin = shellEscapeSingle(input.hermesBin)
  return `${launchPrefix} exec ${hermesBin} chat --tui`
}

/** tmux-cli: long-lived bash with Hermes env; dispatch runs `hermes chat -q` per task. */
export function buildHermesTmuxShellCommand(input: {
  profilePath: string
  hermesBin: string
  ghToken?: string | null
}): string {
  const launchPrefix = [
    `HERMES_HOME='${shellEscapeSingle(input.profilePath)}'`,
    `HERMES_CLI_BIN='${shellEscapeSingle(input.hermesBin)}'`,
    input.ghToken ? `GH_TOKEN='${shellEscapeSingle(input.ghToken)}'` : '',
    input.ghToken ? `GITHUB_TOKEN='${shellEscapeSingle(input.ghToken)}'` : '',
  ].filter(Boolean).join(' ')
  return `${launchPrefix} exec bash -l`
}

export function resolveTmuxTransportMode(
  request?: TmuxTransportMode | null,
): TmuxTransportMode {
  if (request === 'cli' || request === 'tui') return request
  const env = (process.env.HERMES_SWARM_TMUX_MODE || '').trim().toLowerCase()
  if (env === 'cli') return 'cli'
  return 'tui'
}

const HERMES_TUI_MARKERS = [
  /ready\s*│/i,
  /❯/,
  /Hermes Agent/i,
  /Available Tools/i,
  /Nous Research/i,
]

/** True when tmux capture-pane content looks like an active Hermes TUI prompt. */
export function tmuxPaneLooksLikeHermesTui(paneText: string): boolean {
  const text = paneText.trim()
  if (!text) return false
  const hasTui = HERMES_TUI_MARKERS.some((pattern) => pattern.test(text))
  if (!hasTui) return false
  const tail = text.split('\n').slice(-8).join('\n')
  if (/\)\s+[\w.-]+@[\w.-]+:.*\$\s*$/m.test(tail) && !/❯/.test(tail)) {
    return false
  }
  if (/Execute: command not found/i.test(tail)) {
    return false
  }
  return true
}

const SHELL_COMMANDS = /^(bash|sh|zsh|fish|dash|login)$/i

const BRACKETED_PASTE_START = '\x1b[200~'
const BRACKETED_PASTE_END = '\x1b[201~'

/** Explicit first-pane target. Bare session names can fail with "can't find pane". */
export function tmuxPaneTarget(sessionName: string): string {
  return sessionName.includes(':') ? sessionName : `${sessionName}:0.0`
}

/** True when the session has at least one live pane. */
export async function tmuxSessionHasPane(
  tmuxBin: string,
  sessionName: string,
): Promise<boolean> {
  const listed = await execFileAsync(tmuxBin, ['list-panes', '-t', sessionName], 5_000)
  return listed.ok
}

/**
 * Paste content into a tmux pane wrapped with bracketed-paste escape sequences
 * so that prompt_toolkit receives the whole content as a single paste and does
 * not enter multiline continuation mode.
 */
export async function tmuxPasteWithBracketedPaste(
  tmuxBin: string,
  sessionName: string,
  content: string,
): Promise<void> {
  const target = tmuxPaneTarget(sessionName)
  if (!(await tmuxSessionHasPane(tmuxBin, sessionName))) {
    throw new Error(`paste-buffer failed: can't find pane: ${sessionName}`)
  }
  const wrapped = `${BRACKETED_PASTE_START}${content}${BRACKETED_PASTE_END}`
  const bufferName = `swarm-bp-${process.pid}-${Date.now().toString(36)}`
  const loaded = await execFileAsync(tmuxBin, ['load-buffer', '-b', bufferName, '-'], 8_000, wrapped)
  if (!loaded.ok) throw new Error(`load-buffer failed: ${loaded.error}`)
  const pasted = await execFileAsync(tmuxBin, ['paste-buffer', '-d', '-b', bufferName, '-t', target])
  if (!pasted.ok) throw new Error(`paste-buffer failed: ${pasted.error}`)
}

/** Send an escape sequence to a tmux pane as literal text. */
export async function tmuxSendLiteralEscape(
  tmuxBin: string,
  sessionName: string,
  sequence: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile(tmuxBin, ['send-keys', '-t', sessionName, '-l', sequence], (err) => {
      if (err) reject(err)
      else resolve()
    })
    if (child.stdin) child.stdin.end()
  })
}

/** Promisified wrapper around child_process.execFile. */
function execFileAsync(
  file: string,
  args: string[],
  timeoutMs = 8_000,
  input?: string,
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const child = execFile(file, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, error: stderr || err.message })
        return
      }
      resolve({ ok: true, stdout })
    })
    if (input !== undefined && child.stdin) {
      child.stdin.write(input, 'utf8')
      child.stdin.end()
    }
  })
}

export function tmuxPaneLooksLikeShellReady(
  paneText: string,
  paneCommand?: string | null,
): boolean {
  if (paneCommand && !SHELL_COMMANDS.test(paneCommand.trim())) {
    return false
  }
  const tail = paneText.trim().split('\n').slice(-12).join('\n')
  if (/Execute: command not found/i.test(tail)) return false
  if (tmuxPaneLooksLikeHermesTui(paneText)) return false
  // Match common shell prompts: $, #, or ~$ at end of line (with optional spaces)
  // Supports: user@host:~$, user@host:path$, user@host:dir$, etc.
  return /[$#~]\s*$/m.test(tail.trim())
}
