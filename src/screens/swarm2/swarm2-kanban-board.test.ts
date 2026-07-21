import { describe, expect, it } from 'vitest'
import { getKanbanBackendPresentation } from './swarm2-kanban-board'

describe('Swarm2 Kanban backend presentation', () => {
  it('keeps the initial backend state quiet and non-committal while auto-detecting', () => {
    expect(getKanbanBackendPresentation(null)).toMatchObject({
      badgeLabel: 'Detecting board',
      badgeTone: 'unknown',
      toastTitle: 'Detecting Swarm Board backend',
    })
  })

  it('presents detected Kanban as the default shared board, not a backend demo', () => {
    expect(getKanbanBackendPresentation({
      id: 'claude',
      label: 'Hermes Kanban',
      detected: true,
      writable: true,
      details: 'Canonical storage detected',
      path: '/tmp/kanban.db',
    })).toMatchObject({
      badgeLabel: 'Shared board',
      badgeTone: 'claude',
      toastTitle: 'Board connected',
      toastBody: 'Cards and status changes are using the canonical Kanban store.',
      title: 'Canonical storage detected',
    })
  })

  it('presents local storage as an automatic fallback, not a manual control', () => {
    expect(getKanbanBackendPresentation({
      id: 'local',
      label: 'Local board',
      detected: true,
      writable: true,
      details: 'Using local Swarm board JSON store.',
      path: '/tmp/swarm2-kanban.json',
    })).toMatchObject({
      badgeLabel: 'Local fallback',
      badgeTone: 'local',
      toastTitle: 'Using local Swarm Board',
      toastBody: 'Using local Swarm board JSON store.',
    })
  })

  it('does not deep-link remote users to a loopback Hermes Dashboard URL', () => {
    expect(getKanbanBackendPresentation({
      id: 'hermes-proxy',
      label: 'Hermes Dashboard kanban',
      detected: true,
      writable: true,
      details: 'Synced through Workspace proxy',
      path: 'http://127.0.0.1:9119',
    })).toMatchObject({
      badgeLabel: 'Synced • Hermes',
      badgeTone: 'hermes-proxy',
      dashboardUrl: undefined,
    })
  })

  it('deep-links to Hermes Dashboard only when the configured URL is remotely reachable', () => {
    expect(getKanbanBackendPresentation({
      id: 'hermes-proxy',
      label: 'Hermes Dashboard kanban',
      detected: true,
      writable: true,
      details: 'Synced through Workspace proxy',
      path: 'http://100.113.68.47:9119',
    })).toMatchObject({
      badgeLabel: 'Synced • Hermes',
      badgeTone: 'hermes-proxy',
      dashboardUrl: 'http://100.113.68.47:9119/kanban',
    })
  })
})
