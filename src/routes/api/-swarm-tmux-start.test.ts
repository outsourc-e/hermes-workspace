import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('/api/swarm-tmux-start Windows compatibility', () => {
  const source = readFileSync(
    new URL('./swarm-tmux-start.ts', import.meta.url),
    'utf8',
  )

  it('creates worker profiles instead of requiring Unix wrapper files', () => {
    expect(source).toContain('ensureSwarmProfileConfig(profilePath)')
    expect(source).not.toContain('No wrapper for')
  })

  it('delegates process ownership instead of constructing tmux sessions in the route', () => {
    expect(source).toContain('startWorkerProcess(workerId)')
    expect(source).toContain('getWorkerProcessHost().status(workerId)')
    expect(source).not.toContain('buildTmuxNewSessionArgs')
    expect(source).not.toContain('buildTmuxSendKeysArgs')
  })
})
