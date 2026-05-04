/**
 * Trust normalization for hub entries — CODEX-6 hardening.
 *
 * normalizeTemplate() validates and sanitizes a raw template before
 * install or display. It rejects dangerous patterns that could lead to
 * shell injection or privilege escalation.
 */
import type { McpClientInput } from '../../types/mcp'
import type { HubTrust } from './types'

// Shell metacharacters that must not appear in a command string
const SHELL_METACHAR_RE = /[;|&$`<>]/

// Control characters (including NUL) that must not appear in command or args
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/

// Env key must be SCREAMING_SNAKE_CASE (same rule as mcp-input-validate.ts)
const ENV_KEY_RE = /^[A-Z][A-Z0-9_]*$/

const SUPPORTED_TRANSPORTS: ReadonlySet<string> = new Set(['stdio', 'http'])

/**
 * Safe absolute-path root prefixes.
 * Commands starting with an absolute path must begin with one of these.
 */
const SAFE_PATH_ROOTS: ReadonlyArray<string> = [
  '/usr/bin/',
  '/usr/local/bin/',
  '/opt/homebrew/bin/',
]

/** Regex for user-local safe roots: /Users/<name>/.local/bin/ and /Users/<name>/Library/PhpWebStudy/env/node/bin/ */
const USER_LOCAL_BIN_RE = /^\/Users\/[^/]+\/.local\/bin\//
const USER_PHPWEBSTUDY_BIN_RE = /^\/Users\/[^/]+\/Library\/PhpWebStudy\/env\/node\/bin\//

/** Shell interpreters that must not be paired with inline-exec flags */
const SHELL_INTERPRETERS: ReadonlySet<string> = new Set([
  'sh', 'bash', 'zsh', 'fish', 'dash', 'csh', 'tcsh', 'ksh',
])

/** Inline-exec flags for shell interpreters */
const SHELL_INLINE_FLAGS: ReadonlySet<string> = new Set([
  '-c', '-lc', '-ic', '-i', '--command', '-e',
])

/** Other interpreters with their inline-exec flags */
const INTERPRETER_INLINE_FLAGS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['python', new Set(['-c'])],
  ['python3', new Set(['-c'])],
  ['node', new Set(['-e', '--eval'])],
  ['perl', new Set(['-e'])],
  ['ruby', new Set(['-e'])],
])

export type NormalizeResult =
  | { ok: true; template: McpClientInput }
  | { ok: false; reason: string }

/**
 * Return the basename of a command (handles both plain names and absolute paths).
 */
function commandBasename(cmd: string): string {
  const idx = cmd.lastIndexOf('/')
  return idx >= 0 ? cmd.slice(idx + 1) : cmd
}

/**
 * Validate and sanitize `template` coming from an untrusted hub source.
 *
 * Rules (CODEX-6 + hardening):
 * 1. Transport must be 'stdio' or 'http' — no exotic/unknown values.
 * 2. For stdio: command must not contain shell metacharacters ; | & $ ` < >
 * 3. For stdio: command must not contain control characters [\x00-\x1F\x7F]
 * 4. For stdio: absolute-path commands must begin with a known-safe root.
 *    Rejects /tmp/, /var/tmp/, ~/.cache/, path traversal (..), etc.
 * 5. For stdio: shell-wrapper commands (sh/bash/zsh/…) with inline-exec flags
 *    (-c, -lc, -ic, --command, -e) are rejected.
 * 6. For stdio: interpreter inline-exec (python -c, node -e, etc.) rejected.
 * 7. For stdio: args must not contain control characters.
 * 8. For stdio: no arg starting with `-c` (legacy sh inline execution).
 * 9. Env keys not matching ^[A-Z][A-Z0-9_]*$ are stripped (not rejected).
 * 10. trust param is passed through for caller to store on the entry.
 */
export function normalizeTemplate(
  template: unknown,
  _trust: HubTrust,
): NormalizeResult {
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    return { ok: false, reason: 'template must be a plain object' }
  }

  const t = template as Record<string, unknown>

  // Transport check
  const transport = typeof t.transportType === 'string' ? t.transportType : 'stdio'
  if (!SUPPORTED_TRANSPORTS.has(transport)) {
    return { ok: false, reason: `unsupported transport "${transport}"` }
  }

  // Name
  const name = typeof t.name === 'string' ? t.name.trim() : ''
  if (!name) {
    return { ok: false, reason: 'template.name is required' }
  }

  if (transport === 'stdio') {
    const command = typeof t.command === 'string' ? t.command.trim() : ''
    if (!command) {
      return { ok: false, reason: 'command is required for stdio transport' }
    }

    // Control-char check on command
    if (CONTROL_CHAR_RE.test(command)) {
      return { ok: false, reason: `command contains disallowed control characters: "${command}"` }
    }

    if (SHELL_METACHAR_RE.test(command)) {
      return {
        ok: false,
        reason: `command contains disallowed shell metacharacters: "${command}"`,
      }
    }

    // Absolute-path safety check
    if (command.startsWith('/')) {
      // Reject path traversal
      if (command.includes('..')) {
        return { ok: false, reason: `command contains path traversal: "${command}"` }
      }
      const isSafe =
        SAFE_PATH_ROOTS.some((root) => command.startsWith(root)) ||
        USER_LOCAL_BIN_RE.test(command) ||
        USER_PHPWEBSTUDY_BIN_RE.test(command)
      if (!isSafe) {
        return {
          ok: false,
          reason: `command absolute path is outside known-safe roots: "${command}"`,
        }
      }
    }

    // Args: control-char check + shell-inline flag rejection
    const rawArgs = Array.isArray(t.args) ? t.args : []
    for (const arg of rawArgs) {
      const s = String(arg)
      if (CONTROL_CHAR_RE.test(s)) {
        return { ok: false, reason: `args contains disallowed control characters: "${s}"` }
      }
      if (s === '-c' || s.startsWith('-c=') || s.startsWith('-c ')) {
        return {
          ok: false,
          reason: `args contains disallowed inline-exec flag "-c": "${s}"`,
        }
      }
    }

    // Shell-wrapper + inline-exec flag check
    const basename = commandBasename(command)
    const argStrings = rawArgs.map((a) => String(a))

    if (SHELL_INTERPRETERS.has(basename)) {
      const hasInlineFlag = argStrings.some((a) => SHELL_INLINE_FLAGS.has(a))
      if (hasInlineFlag) {
        return {
          ok: false,
          reason: `shell interpreter "${basename}" paired with inline-exec flag`,
        }
      }
    }

    // Other interpreter inline-exec check (python -c, node -e, etc.)
    const interpreterFlags = INTERPRETER_INLINE_FLAGS.get(basename)
    if (interpreterFlags) {
      const hasInlineFlag = argStrings.some((a) => interpreterFlags.has(a))
      if (hasInlineFlag) {
        return {
          ok: false,
          reason: `interpreter "${basename}" paired with inline-exec flag`,
        }
      }
    }

    const args: Array<string> = rawArgs.map((a) => String(a))

    // Env: strip keys that don't match ENV_KEY_RE
    const rawEnv =
      t.env && typeof t.env === 'object' && !Array.isArray(t.env)
        ? (t.env as Record<string, unknown>)
        : {}
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawEnv)) {
      if (ENV_KEY_RE.test(k)) {
        env[k] = String(v ?? '')
      }
      // Invalid keys are silently dropped per spec
    }

    const normalized: McpClientInput = {
      name,
      transportType: 'stdio',
      command,
      args,
      ...(Object.keys(env).length > 0 ? { env } : {}),
    }

    if (typeof t.authType === 'string') {
      const at = t.authType
      if (at === 'none' || at === 'bearer' || at === 'oauth') {
        normalized.authType = at
      }
    }
    if (t.toolMode === 'all' || t.toolMode === 'include' || t.toolMode === 'exclude') {
      normalized.toolMode = t.toolMode
    }

    return { ok: true, template: normalized }
  }

  // HTTP transport
  const url = typeof t.url === 'string' ? t.url.trim() : ''
  if (!url) {
    return { ok: false, reason: 'url is required for http transport' }
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: 'url must be http(s)' }
    }
  } catch {
    return { ok: false, reason: `url is not a valid URL: "${url}"` }
  }

  const normalizedHttp: McpClientInput = {
    name,
    transportType: 'http',
    url,
  }

  if (typeof t.authType === 'string') {
    const at = t.authType
    if (at === 'none' || at === 'bearer' || at === 'oauth') {
      normalizedHttp.authType = at
    }
  }

  return { ok: true, template: normalizedHttp }
}
