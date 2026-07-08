import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  baseOf,
  busyWorkerCount,
  fleetWorkerIsIdle,
  isCloneId,
  maxParallel,
  resolveWorkerForRole,
} from './swarm-fleet'

let dir: string
const prev = process.env.HERMES_PROFILES_DIR

function setRuntime(id: string, state: string, phase = 'working') {
  mkdirSync(join(dir, id), { recursive: true })
  writeFileSync(
    join(dir, id, 'runtime.json'),
    JSON.stringify({ state, phase, currentTask: state === 'idle' ? null : 'x' }),
  )
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'swarm-fleet-'))
  process.env.HERMES_PROFILES_DIR = dir
})

afterAll(() => {
  if (prev === undefined) delete process.env.HERMES_PROFILES_DIR
  else process.env.HERMES_PROFILES_DIR = prev
  rmSync(dir, { recursive: true, force: true })
})

describe('clone ids', () => {
  it('recognizes clones of cloneable roles only', () => {
    expect(isCloneId('builder-2')).toBe(true)
    expect(isCloneId('builder')).toBe(false)
    expect(isCloneId('strategist-2')).toBe(false)
    expect(baseOf('builder-3')).toBe('builder')
    expect(baseOf('builder')).toBe('builder')
  })
})

describe('idleness and caps', () => {
  it('reads runtime state and counts busy workers', () => {
    setRuntime('builder', 'executing')
    setRuntime('qa', 'idle')
    expect(fleetWorkerIsIdle('builder')).toBe(false)
    expect(fleetWorkerIsIdle('qa')).toBe(true)
    expect(fleetWorkerIsIdle('missing-worker')).toBe(true)
    expect(busyWorkerCount()).toBe(1)
    expect(maxParallel()).toBeGreaterThanOrEqual(1)
  })

  it('returns the base worker when idle, null for saturated non-cloneable', () => {
    setRuntime('qa', 'idle')
    expect(resolveWorkerForRole('qa')).toBe('qa')
    setRuntime('strategist', 'executing')
    expect(resolveWorkerForRole('strategist')).toBeNull()
  })

  it('prefers an existing idle clone over creating one', () => {
    setRuntime('builder', 'executing')
    setRuntime('builder-2', 'idle')
    expect(resolveWorkerForRole('builder')).toBe('builder-2')
  })
})
