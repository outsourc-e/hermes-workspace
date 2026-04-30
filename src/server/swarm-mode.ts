import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SWARM_CANONICAL_REPO } from './swarm-environment'

export type SwarmControlMode = 'auto' | 'manual'

export type SwarmModeState = {
  mode: SwarmControlMode
  updatedAt: string
}

export const SWARM_MODE_PATH = join(SWARM_CANONICAL_REPO, '.runtime', 'swarm-mode.json')

function nowIso(): string {
  return new Date().toISOString()
}

export function readSwarmMode(): SwarmModeState {
  if (!existsSync(SWARM_MODE_PATH)) {
    return { mode: 'auto', updatedAt: nowIso() }
  }
  try {
    const parsed = JSON.parse(readFileSync(SWARM_MODE_PATH, 'utf8')) as Partial<SwarmModeState>
    return {
      mode: parsed.mode === 'manual' ? 'manual' : 'auto',
      updatedAt: typeof parsed.updatedAt === 'string' && parsed.updatedAt.trim() ? parsed.updatedAt : nowIso(),
    }
  } catch {
    return { mode: 'auto', updatedAt: nowIso() }
  }
}

export function writeSwarmMode(mode: SwarmControlMode): SwarmModeState {
  const next: SwarmModeState = {
    mode,
    updatedAt: nowIso(),
  }
  mkdirSync(dirname(SWARM_MODE_PATH), { recursive: true })
  const tmp = `${SWARM_MODE_PATH}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n')
  renameSync(tmp, SWARM_MODE_PATH)
  return next
}

export function applySwarmModeToLoopFlags(input: {
  mode: SwarmControlMode
  autoContinueRequested: boolean
  allowExecutionRequested: boolean
}): {
  autoContinue: boolean
  allowExecution: boolean
} {
  if (input.mode === 'manual') {
    return {
      autoContinue: false,
      allowExecution: false,
    }
  }
  return {
    autoContinue: input.autoContinueRequested,
    allowExecution: input.allowExecutionRequested,
  }
}
