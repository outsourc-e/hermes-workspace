import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeCoordinationDatabase } from '../../server/mission-coordinator/coordination-db'
import { createMission } from '../../server/mission-coordinator/coordinator'

const originalStateDir = process.env.HERMES_WORKSPACE_STATE_DIR
let stateDir = ''

beforeEach(() => {
  stateDir = mkdtempSync(`${tmpdir()}/hermes-coordinator-api-`)
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
})

afterEach(() => {
  closeCoordinationDatabase()
  rmSync(stateDir, { recursive: true, force: true })
  if (originalStateDir === undefined) delete process.env.HERMES_WORKSPACE_STATE_DIR
  else process.env.HERMES_WORKSPACE_STATE_DIR = originalStateDir
})

describe('mission coordinator API contract helpers', () => {
  it('creates a template-shaped mission that starts sequentially', () => {
    const result = createMission({
      id: 'api-contract',
      title: 'API contract',
      maxParallelism: 1,
      nodes: [
        { id: 'inspect', title: 'Inspect', role: 'researcher', objective: 'Inspect', dependsOn: [], locks: [], readOnly: true },
        { id: 'build', title: 'Build', role: 'builder', objective: 'Build', dependsOn: ['inspect'], locks: ['repository:write'], readOnly: false },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mission.nodes.map((node) => node.state)).toEqual(['ready', 'blocked_by_dependency'])
  })
})
