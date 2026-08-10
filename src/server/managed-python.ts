import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'

export function resolveManagedPythonBin(
  input: {
    platform?: NodeJS.Platform
    env?: NodeJS.ProcessEnv
    home?: string
    pathExists?: (path: string) => boolean
  } = {},
): string {
  const platform = input.platform ?? process.platform
  const env = input.env ?? process.env
  const home = input.home ?? homedir()
  const pathExists = input.pathExists ?? existsSync
  const pathApi = platform === 'win32' ? win32 : posix

  const override = env.HERMES_PYTHON_BIN
  if (override) {
    if (!override.includes('/') && !override.includes('\\')) return override
    if (pathExists(override)) return override
  }

  const hermesHome =
    env.HERMES_HOME || env.CLAUDE_HOME || pathApi.join(home, '.hermes')
  const managed =
    platform === 'win32'
      ? pathApi.join(
          hermesHome,
          'hermes-agent',
          'venv',
          'Scripts',
          'python.exe',
        )
      : pathApi.join(hermesHome, 'hermes-agent', 'venv', 'bin', 'python')
  if (pathExists(managed)) return managed
  return platform === 'win32' ? 'python' : 'python3'
}
