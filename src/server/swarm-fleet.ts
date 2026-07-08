/**
 * Parallel fleet: worker clones + concurrency caps.
 *
 * When a cloneable role is busy and more work is queued for it, the fleet
 * spins up a clone worker (`builder-2`, `builder-3`, …): a filtered copy of
 * the base profile directory plus a roster entry that points wrapper/profile
 * back at the base. Clones behave exactly like their base role; git-touching
 * tasks already run in isolated worktrees by playbook rule.
 *
 * Caps:
 *   HERMES_MAX_CLONES    — instances per role including the base (default 3)
 *   HERMES_MAX_PARALLEL  — busy workers across the whole swarm (default 4)
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { rosterByWorkerId, upsertSwarmRosterWorker } from './swarm-roster'

export const CLONEABLE_ROLES = new Set([
  'builder',
  'researcher',
  'qa',
  'maintainer',
  'km-agent',
])

/** Directories/files that must NOT be copied into a clone profile. */
const CLONE_EXCLUDE = new Set([
  'sessions',
  'logs',
  'sandboxes',
  'pastes',
  'audio_cache',
  'image_cache',
  'cache',
  'runtime.json',
  'auth.lock',
])

export function profilesDir(): string {
  return (
    process.env.HERMES_PROFILES_DIR || join(homedir(), '.hermes', 'profiles')
  )
}

export function maxClonesPerRole(): number {
  const n = Number(process.env.HERMES_MAX_CLONES)
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 5) : 3
}

export function maxParallel(): number {
  const n = Number(process.env.HERMES_MAX_PARALLEL)
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 12) : 4
}

export function fleetWorkerIsIdle(workerId: string): boolean {
  try {
    const runtimePath = join(profilesDir(), workerId, 'runtime.json')
    if (!existsSync(runtimePath)) return true
    const runtime = JSON.parse(readFileSync(runtimePath, 'utf8')) as {
      state?: string
      phase?: string
      currentTask?: string | null
    }
    const busy = ['executing', 'dispatching', 'planning', 'reviewing'].includes(
      runtime.state ?? 'idle',
    )
    if (busy && runtime.phase === 'done' && !runtime.currentTask) return true
    return !busy
  } catch {
    return false
  }
}

/** Busy workers across all profile dirs (clones included). */
export function busyWorkerCount(): number {
  try {
    return readdirSync(profilesDir()).filter(
      (id) => !id.startsWith('.') && !fleetWorkerIsIdle(id),
    ).length
  } catch {
    return 0
  }
}

export function isCloneId(workerId: string): boolean {
  return /^(.+)-([2-9])$/.test(workerId) && CLONEABLE_ROLES.has(baseOf(workerId))
}

export function baseOf(workerId: string): string {
  return workerId.replace(/-[2-9]$/, '')
}

/** Copy a base profile into a clone profile (idempotent). */
export function ensureCloneProfile(baseId: string, cloneId: string): boolean {
  const src = join(profilesDir(), baseId)
  const dst = join(profilesDir(), cloneId)
  if (!existsSync(src)) return false
  if (existsSync(join(dst, 'auth.json')) || existsSync(join(dst, 'config.yaml'))) {
    return true
  }
  try {
    mkdirSync(dst, { recursive: true })
    cpSync(src, dst, {
      recursive: true,
      filter: (from) => {
        const name = basename(from)
        if (CLONE_EXCLUDE.has(name)) return false
        if (name.startsWith('state.db')) return false
        return true
      },
    })
    // A stale runtime copied through a nested path would poison idleness.
    rmSync(join(dst, 'runtime.json'), { force: true })
    const base = rosterByWorkerId([baseId]).get(baseId)
    const n = cloneId.slice(-1)
    upsertSwarmRosterWorker({
      ...(base ?? {
        id: cloneId,
        name: '',
        role: 'Worker',
        specialty: '',
        model: 'Worker',
        mission: 'Awaiting orchestrator dispatch.',
        modes: [],
        tools: [],
        skills: [],
        plugins: [],
        pluginToolsets: [],
        mcpServers: [],
        modelTiers: [],
        capabilities: [],
        preferredTaskTypes: [],
        greenlightRequiredFor: [],
        maxConcurrentTasks: 1,
        acceptsBroadcast: false,
        reviewRequired: false,
      }),
      id: cloneId,
      name: `${base?.name?.trim() || baseId} ${n}`,
      mission: `Clone of ${baseId} for parallel work.`,
      // Wrapper + profile resolve back to the base so the clone launches
      // with the same CLI entrypoint and behavior pack.
      wrapper: base?.wrapper?.trim() || baseId,
      profile: baseId,
      acceptsBroadcast: false,
    })
    return true
  } catch {
    rmSync(dst, { recursive: true, force: true })
    return false
  }
}

/**
 * Pick an idle worker for a role, cloning when everyone is busy and caps
 * allow. Returns null when the role is saturated.
 */
export function resolveWorkerForRole(baseId: string): string | null {
  if (fleetWorkerIsIdle(baseId)) return baseId
  if (!CLONEABLE_ROLES.has(baseId)) return null
  for (let n = 2; n <= maxClonesPerRole(); n += 1) {
    const cloneId = `${baseId}-${n}`
    if (existsSync(join(profilesDir(), cloneId))) {
      if (fleetWorkerIsIdle(cloneId)) return cloneId
      continue
    }
    // Room in the role cap and the global cap → create a new clone.
    if (busyWorkerCount() >= maxParallel()) return null
    return ensureCloneProfile(baseId, cloneId) ? cloneId : null
  }
  return null
}
