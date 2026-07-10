import { describe, expect, it } from 'vitest'
import { buildGoogleWorkspaceReport } from './google-workspace-connector'

const NOW = '2026-07-09T12:00:00.000Z'

describe('buildGoogleWorkspaceReport', () => {
  it('reports not-wired when no google oauth signal exists', () => {
    const report = buildGoogleWorkspaceReport([], NOW)
    expect(report.status).toBe('not-wired')
    expect(report.gmail.connected).toBe(false)
    expect(report.gmail.actionItems).toBeNull()
    expect(report.writePolicy).toBe('approval-gated')
  })

  it('reports auth-needed when signals exist but nothing is proven connected', () => {
    const report = buildGoogleWorkspaceReport(
      [{ name: 'google', text: 'google oauth provider', connected: false }],
      NOW,
    )
    expect(report.status).toBe('auth-needed')
    expect(report.guidance).toMatch(/auth/i)
  })

  it('reports oauth-connected but never fabricates inbox or calendar data', () => {
    const report = buildGoogleWorkspaceReport(
      [
        { name: 'google-gmail', text: 'google-gmail connected', connected: true },
        { name: 'google-calendar', text: 'google-calendar connected', connected: true },
      ],
      NOW,
    )
    expect(report.status).toBe('oauth-connected')
    expect(report.gmail.connected).toBe(true)
    expect(report.calendar.connected).toBe(true)
    // No local read API exists — data must be null with an honest detail,
    // never an empty array pretending we checked.
    expect(report.gmail.actionItems).toBeNull()
    expect(report.calendar.events).toBeNull()
    expect(report.gmail.detail).toMatch(/no .*read/i)
  })

  it('always gates sends/schedules/modifications on Taylor approval', () => {
    const connected = buildGoogleWorkspaceReport(
      [{ name: 'google-gmail', text: 'google-gmail connected', connected: true }],
      NOW,
    )
    expect(connected.writePolicy).toBe('approval-gated')
    expect(connected.guidance.length).toBeGreaterThan(0)
  })
})
