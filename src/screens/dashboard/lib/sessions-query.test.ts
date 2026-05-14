import { describe, expect, it } from 'vitest'
import { normalizeDashboardSessionsPayload } from './sessions-query'

describe('normalizeDashboardSessionsPayload', () => {
  it('keeps working session responses available', () => {
    const result = normalizeDashboardSessionsPayload({
      sessions: [{ id: 'session-1' }],
    })

    expect(result).toEqual({
      sessions: [{ id: 'session-1' }],
      unavailable: false,
      message: undefined,
    })
  })

  it('marks source:unavailable responses as unavailable', () => {
    const result = normalizeDashboardSessionsPayload({
      sessions: [],
      source: 'unavailable',
      message: 'Sessions are unavailable',
    })

    expect(result).toEqual({
      sessions: [],
      unavailable: true,
      message: 'Sessions are unavailable',
    })
  })

  it('marks capability_unavailable responses as unavailable', () => {
    const result = normalizeDashboardSessionsPayload({
      code: 'capability_unavailable',
    })

    expect(result).toEqual({
      sessions: [],
      unavailable: true,
      message: undefined,
    })
  })
})
