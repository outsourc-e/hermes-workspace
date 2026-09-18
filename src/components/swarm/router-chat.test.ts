import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(): string {
  return readFileSync(
    join(process.cwd(), 'src/components/swarm/router-chat.tsx'),
    'utf-8',
  )
}

describe('RouterChat dispatch request', () => {
  it('waits for a checkpoint and continues the returned mission through the approval-safe loop', () => {
    const src = source()

    expect(src).toContain("fetch('/api/swarm-dispatch'")
    expect(src).toContain('waitForCheckpoint: true')
    expect(src).toContain('checkpointPollSeconds: 90')
    expect(src).toContain('missionId: data.missionId')
    expect(src).toContain("member.id === 'reviewer'")
    expect(src).toContain("member.id === 'swarm6'")
    expect(src).toContain('allowExecution: false')
    expect(src).toContain("fetch('/api/swarm-orchestrator-loop'")
  })
})
