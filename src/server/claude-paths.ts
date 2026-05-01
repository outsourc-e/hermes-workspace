import { homedir } from 'node:os'
import { dirname, join, normalize, sep } from 'node:path'

function isProfilesChild(pathValue: string): boolean {
  const parts = normalize(pathValue).split(sep).filter(Boolean)
  return parts.length >= 2 && parts.at(-2) === 'profiles'
}

function isProfileHome(pathValue: string): boolean {
  const parts = normalize(pathValue).split(sep).filter(Boolean)
  return parts.length >= 3 && parts.at(-3) === 'profiles' && parts.at(-1) === 'home'
}

function claudeRootFromProfile(pathValue: string): string | null {
  if (isProfilesChild(pathValue)) {
    return dirname(dirname(pathValue))
  }
  if (isProfileHome(pathValue)) {
    return dirname(dirname(dirname(pathValue)))
  }
  return null
}

export function getClaudeRoot(): string {
  const envHome = process.env.CLAUDE_HOME || process.env.CLAUDE_HOME
  if (envHome) {
    const profileRoot = claudeRootFromProfile(envHome)
    if (profileRoot) return profileRoot
    return envHome
  }

  const osHome = homedir()
  const profileRoot = claudeRootFromProfile(osHome)
  if (profileRoot) return profileRoot
  return join(osHome, '.claude')
}

export function getProfilesDir(): string {
  return join(getClaudeRoot(), 'profiles')
}

export function getWorkspaceClaudeHome(): string {
  return getClaudeRoot()
}

export function getProfileClaudeHome(profileId: string): string {
  return join(getProfilesDir(), profileId)
}

export function getUserHomeForClaudeRoot(): string {
  const root = getClaudeRoot()
  if (root.endsWith(`${sep}.claude`)) return dirname(root)
  return homedir()
}

export function getLocalBinDir(): string {
  return join(getUserHomeForClaudeRoot(), '.local', 'bin')
}
