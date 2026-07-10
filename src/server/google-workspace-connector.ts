import { collectOauthSignals } from './dashboard-aggregator'
import { dashboardFetch } from './gateway-capabilities'
import type { OauthSignal } from './dashboard-aggregator'

/**
 * Honest Google Workspace connector surface.
 *
 * There is no local Gmail/Calendar read API on this machine today — the only
 * real evidence is the gateway's OAuth provider payload. This module reports
 * exactly that: OAuth connection state, null (never fabricated) message and
 * calendar data, and a hard approval gate on every send/schedule/modify.
 */
export type GoogleWorkspaceStatus =
  | 'oauth-connected'
  | 'auth-needed'
  | 'not-wired'

export type GoogleWorkspaceReport = {
  generatedAt: string
  status: GoogleWorkspaceStatus
  gmail: {
    connected: boolean
    /** Null until a real read connector exists — never an empty-array lie. */
    actionItems: null
    detail: string
  }
  calendar: {
    connected: boolean
    events: null
    detail: string
  }
  drafts: {
    available: false
    detail: string
  }
  writePolicy: 'approval-gated'
  guidance: string
  source: string
}

export function buildGoogleWorkspaceReport(
  signals: Array<OauthSignal>,
  now: string,
): GoogleWorkspaceReport {
  const googleSignals = signals.filter((entry) =>
    /google|gmail|calendar/.test(entry.text),
  )
  const gmailConnected = googleSignals.some(
    (entry) => entry.connected && /gmail|mail|google/.test(entry.text),
  )
  const calendarConnected = googleSignals.some(
    (entry) => entry.connected && /calendar|gcal|google/.test(entry.text),
  )

  const status: GoogleWorkspaceStatus =
    gmailConnected || calendarConnected
      ? 'oauth-connected'
      : googleSignals.length > 0
        ? 'auth-needed'
        : 'not-wired'

  const noReader =
    'OAuth is proven at the gateway, but no local read connector exists — this panel will not invent inbox/calendar data'

  return {
    generatedAt: now,
    status,
    gmail: {
      connected: gmailConnected,
      actionItems: null,
      detail: gmailConnected ? noReader : 'Gmail connection not proven',
    },
    calendar: {
      connected: calendarConnected,
      events: null,
      detail: calendarConnected ? noReader : 'Calendar connection not proven',
    },
    drafts: {
      available: false,
      detail: 'Draft creation requires a Google connector plus Taylor approval',
    },
    writePolicy: 'approval-gated',
    guidance:
      status === 'not-wired'
        ? 'No Google OAuth signal at the gateway. Wire a Google provider/MCP in Hermes, then reads become possible; sends stay approval-gated.'
        : status === 'auth-needed'
          ? 'A Google provider is present but not authenticated. Finish the OAuth flow in Hermes; sends stay approval-gated.'
          : 'OAuth is connected. Next step is a real read connector (Gmail/Calendar MCP); all sends, schedules, and modifications require Taylor approval via a fabric review.',
    source: 'gateway /api/providers/oauth',
  }
}

export async function gatherGoogleWorkspaceReport(): Promise<GoogleWorkspaceReport> {
  let raw: unknown = null
  try {
    const res = await dashboardFetch('/api/providers/oauth')
    if (res.ok) raw = await res.json()
  } catch {
    raw = null
  }
  return buildGoogleWorkspaceReport(
    collectOauthSignals(raw),
    new Date().toISOString(),
  )
}
