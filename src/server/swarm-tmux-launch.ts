import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, posix, win32 } from 'node:path'

export function resolveSwarmHermesBin(
  input: {
    platform?: NodeJS.Platform
    env?: NodeJS.ProcessEnv
    pathExists?: (path: string) => boolean
    home?: string
  } = {},
): string {
  const platform = input.platform ?? process.platform
  const env = input.env ?? process.env
  const pathExists = input.pathExists ?? existsSync
  const home = input.home ?? homedir()
  const pathApi = platform === 'win32' ? win32 : posix
  const override = env.HERMES_CLI_BIN
  if (override) {
    if (!override.includes('/') && !override.includes('\\')) return override
    if (pathExists(override)) return override
  }

  const hermesHome =
    env.HERMES_HOME || env.CLAUDE_HOME || pathApi.join(home, '.hermes')
  const candidates =
    platform === 'win32'
      ? [
          pathApi.join(
            hermesHome,
            'hermes-agent',
            'venv',
            'Scripts',
            'hermes.exe',
          ),
          pathApi.join(hermesHome, 'hermes-agent', 'venv', 'Scripts', 'hermes'),
        ]
      : [
          pathApi.join(hermesHome, 'hermes-agent', 'venv', 'bin', 'hermes'),
          pathApi.join(home, '.local', 'bin', 'hermes'),
        ]
  return candidates.find(pathExists) ?? 'hermes'
}

export function resolveSwarmTmuxBin(
  input: {
    platform?: NodeJS.Platform
    env?: NodeJS.ProcessEnv
    pathExists?: (path: string) => boolean
    home?: string
  } = {},
): string {
  const platform = input.platform ?? process.platform
  const env = input.env ?? process.env
  const pathExists = input.pathExists ?? existsSync
  const home = input.home ?? homedir()
  const override = env.HERMES_TMUX_BIN || env.CLAUDE_TMUX_BIN || env.TMUX_BIN
  if (override) {
    if (!override.includes('/') && !override.includes('\\')) return override
    if (pathExists(override)) return override
  }

  if (platform === 'darwin') {
    for (const candidate of ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux']) {
      if (pathExists(candidate)) return candidate
    }
  }
  const local = join(home, '.local', 'bin', 'tmux')
  return pathExists(local) ? local : 'tmux'
}

function shellEscapeSingle(value: string): string {
  return value.replace(/'/g, `'\\''`)
}

function shellPath(value: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? value.replace(/\\/g, '/') : value
}

export function buildTmuxNewSessionArgs(input: {
  sessionName: string
  cwd: string
  platform?: NodeJS.Platform
}): Array<string> {
  const platform = input.platform ?? process.platform
  const args = ['new-session', '-d', '-s', input.sessionName]
  if (platform !== 'win32') args.push('-c', input.cwd)
  return args
}

export function buildTmuxSendKeysArgs(
  sessionName: string,
  launchCommand: string,
): Array<string> {
  return ['send-keys', '-t', sessionName, launchCommand, 'C-m']
}

export function buildTmuxBufferLoad(input: {
  bufferName: string
  content: string
  platform?: NodeJS.Platform
}): { args: Array<string>; stdin?: string } {
  const platform = input.platform ?? process.platform
  if (platform === 'win32') {
    return {
      args: ['set-buffer', '-b', input.bufferName, '--', input.content],
    }
  }
  return {
    args: ['load-buffer', '-b', input.bufferName, '-'],
    stdin: input.content,
  }
}

export function buildSwarmTmuxLaunchCommand(input: {
  profilePath: string
  cwd: string
  hermesBin: string
  platform?: NodeJS.Platform
  keepShellAlive?: boolean
}): string {
  const platform = input.platform ?? process.platform
  const profilePath = shellPath(input.profilePath, platform)
  const cwd = shellPath(input.cwd, platform)
  const hermesBin = shellPath(input.hermesBin, platform)
  const launchPrefix = [
    platform === 'win32' ? `cd '${shellEscapeSingle(cwd)}' &&` : '',
    `HERMES_HOME='${shellEscapeSingle(profilePath)}'`,
    `HERMES_CLI_BIN='${shellEscapeSingle(hermesBin)}'`,
  ]
    .filter(Boolean)
    .join(' ')
  const invocation = `'${shellEscapeSingle(hermesBin)}' chat --tui`
  if (input.keepShellAlive === false) return `${launchPrefix} ${invocation}`
  return `${launchPrefix} ${invocation}; status=$?; printf '\n[Hermes worker exited with status %s]\n' "$status"`
}
