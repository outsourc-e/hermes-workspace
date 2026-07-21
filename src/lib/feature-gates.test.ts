import { describe, expect, it } from 'vitest'
import { getUnavailableReason } from './feature-gates'

describe('getUnavailableReason', () => {
  it('points the sessions copy at the direct sessions endpoint', () => {
    const message = getUnavailableReason('sessions')

    expect(message).toContain('/api/sessions')
    expect(message).not.toContain('/api/gateway-status')
  })

  it('uses real Workspace API routes for non-session features', () => {
    expect(getUnavailableReason('config')).toContain('/api/claude-config')
    expect(getUnavailableReason('jobs')).toContain('/api/claude-jobs')
    expect(getUnavailableReason('memory')).toContain('/api/memory/list')
  })
})
