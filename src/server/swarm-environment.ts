import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { getClaudeRoot, getProfilesDir, getLocalBinDir } from './claude-paths'

export const SWARM_CANONICAL_REPO = '/Users/aurora/claude-workspace'
export const SWARM_MEMORY_ROOT = '/Users/aurora/.openclaw/workspace'
export const SWARM_MEMORY_HANDOFFS = join(SWARM_MEMORY_ROOT, 'memory')
export const SWARM_FORBIDDEN_PATHS = [
  '/Users/aurora/claude-workspace',
]

export type SwarmEnvironment = {
  canonicalRepo: string
  canonicalRepoExists: boolean
  memoryRoot: string
  memoryRootExists: boolean
  handoffsRoot: string
  handoffsRootExists: boolean
  claudeRoot: string
  profilesRoot: string
  localBinDir: string
  wrapperPattern: string
  tmuxSessionPattern: string
  defaultBuildCommand: string
  defaultTestCommand: string
  defaultDevCommand: string
  runtimeApis: string[]
  writableRoots: string[]
  readOnlyRoots: string[]
  forbiddenRoots: string[]
  notes: string[]
}

export function getSwarmEnvironment(): SwarmEnvironment {
  const claudeRoot = getClaudeRoot()
  const profilesRoot = getProfilesDir()
  const localBinDir = getLocalBinDir()

  return {
    canonicalRepo: SWARM_CANONICAL_REPO,
    canonicalRepoExists: existsSync(SWARM_CANONICAL_REPO),
    memoryRoot: SWARM_MEMORY_ROOT,
    memoryRootExists: existsSync(SWARM_MEMORY_ROOT),
    handoffsRoot: SWARM_MEMORY_HANDOFFS,
    handoffsRootExists: existsSync(SWARM_MEMORY_HANDOFFS),
    claudeRoot,
    profilesRoot,
    localBinDir,
    wrapperPattern: join(localBinDir, 'swarmN'),
    tmuxSessionPattern: 'swarm-<workerId>',
    defaultBuildCommand: `cd ${SWARM_CANONICAL_REPO} && npm run build`,
    defaultTestCommand: `cd ${SWARM_CANONICAL_REPO} && npm test -- src/screens/swarm2`,
    defaultDevCommand: `cd ${SWARM_CANONICAL_REPO} && PORT=3002 npm run dev`,
    runtimeApis: [
      '/api/swarm-environment',
      '/api/swarm-runtime',
      '/api/swarm-roster',
      '/api/swarm-health',
      '/api/swarm-project',
      '/api/swarm-chat',
      '/api/swarm-decompose',
      '/api/swarm-dispatch',
      '/api/swarm-tmux-start',
      '/api/swarm-tmux-stop',
      '/api/swarm-tmux-scroll',
    ],
    writableRoots: [
      SWARM_CANONICAL_REPO,
      SWARM_MEMORY_HANDOFFS,
    ],
    readOnlyRoots: [
      SWARM_MEMORY_ROOT,
      profilesRoot,
      localBinDir,
      join(homedir(), '.ssh'),
    ],
    forbiddenRoots: SWARM_FORBIDDEN_PATHS,
    notes: [
      'Swarm code, git, build, and tests run only in the canonical repo.',
      'Do not use /Users/aurora/claude-workspace for Swarm work.',
      'Worker profiles live under ~/.claude/profiles/<workerId> and wrappers under ~/.local/bin/swarmN.',
      'Prefer live tmux-backed Claude sessions over one-shot subprocesses.',
      'Use the swarm APIs as the machine-readable source of worker/runtime truth.',
    ],
  }
}

export function isForbiddenSwarmPath(pathValue: string | null | undefined): boolean {
  if (!pathValue) return false
  return SWARM_FORBIDDEN_PATHS.some((root) => pathValue === root || pathValue.startsWith(`${root}/`))
}
