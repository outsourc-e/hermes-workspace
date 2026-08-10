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

  it('starts an interactive pane and sends the Hermes launch command into it', () => {
    expect(source).toContain('buildTmuxNewSessionArgs')
    expect(source).toContain('buildTmuxSendKeysArgs')
  })
})
