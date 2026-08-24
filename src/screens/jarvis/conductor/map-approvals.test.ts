import { describe, expect, it } from 'vitest'
import {
  GATE_ACTIONS,
  NO_SOURCE_TEXT,
  OMITTED_ACTION,
  buildOthersWaitingLine,
  clampText,
  deriveCommand,
  deriveTitle,
  formatWaiting,
  mapApprovalToGateProps,
  mapApprovalToGateSummary,
  mapApprovalToMobileGateProps,
  normalizeApprovals,
  readableInput,
  selectPendingApprovals,
  statusToGateState,
} from './map-approvals'
import type { GatewayApprovalEntry } from '@/lib/gateway-api'
import { commandGateFixture } from '@/components/jarvis/fixtures'

const SECOND_MS = 1_000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** A fixed clock, so every wait below is arithmetic and not a race. */
const NOW = new Date('2026-08-24T12:00:00Z').getTime()

function approval(
  overrides: Partial<GatewayApprovalEntry> = {},
): GatewayApprovalEntry {
  return {
    id: 'appr-1',
    sessionKey: 'agent:km-agent:subagent:06ec90ba',
    agentName: 'km-agent',
    action: 'Write 41 restored notes to Vault/Published/',
    tool: 'Write',
    input: 'Vault/Published/2026-08-24-restored.md',
    requestedAt: NOW - (4 * MINUTE_MS + 12 * SECOND_MS),
    status: 'pending',
    ...overrides,
  }
}

describe('deriveTitle', () => {
  it('uses the real action sentence when the gateway supplies one', () => {
    expect(deriveTitle(approval())).toBe(
      'Write 41 restored notes to Vault/Published/',
    )
  })

  it('falls back to the tool, then to a neutral line — never to an invention', () => {
    expect(deriveTitle(approval({ action: '   ' }))).toBe('Write')
    expect(deriveTitle(approval({ action: '', tool: '' }))).toBe(
      'Approval requested',
    )
  })

  it('never reproduces the fixture headline from a real entry', () => {
    const entry = approval({ action: '', tool: '', input: undefined })
    expect(deriveTitle(entry)).not.toBe(commandGateFixture.title)
  })

  it('clamps a title that would push the panel below the mobile fold', () => {
    const title = deriveTitle(approval({ action: 'word '.repeat(60) }))
    expect(title.length).toBeLessThanOrEqual(97)
    expect(title.endsWith('…')).toBe(true)
  })
})

describe('readableInput', () => {
  it('reads a short string and a string argv', () => {
    expect(readableInput('git push origin main')).toBe('git push origin main')
    expect(readableInput(['git', 'push', 'origin', 'main'])).toBe(
      'git push origin main',
    )
  })

  it('refuses anything opaque rather than dumping it on the hero card', () => {
    expect(readableInput({ file_path: '/a', old_string: 'x' })).toBeNull()
    expect(readableInput(['ok', { nested: true }])).toBeNull()
    expect(readableInput(undefined)).toBeNull()
    expect(readableInput('')).toBeNull()
    expect(readableInput([])).toBeNull()
  })

  it('clamps an unbounded string input', () => {
    const long = readableInput('x'.repeat(500))
    expect(long).not.toBeNull()
    expect((long as string).length).toBeLessThanOrEqual(121)
    expect((long as string).endsWith('…')).toBe(true)
  })
})

describe('deriveCommand', () => {
  it('puts the tool in front of a legible input', () => {
    expect(deriveCommand(approval())).toBe(
      'Write Vault/Published/2026-08-24-restored.md',
    )
  })

  it('shows the tool alone when the input is a payload', () => {
    expect(deriveCommand(approval({ input: { patch: 'x'.repeat(400) } }))).toBe(
      'Write',
    )
  })

  it('falls back to the entry context, then to its id', () => {
    expect(
      deriveCommand(
        approval({ tool: '', input: undefined, context: 'vault write queue' }),
      ),
    ).toBe('vault write queue')
    expect(
      deriveCommand(
        approval({ tool: '', input: undefined, context: '', id: 'appr-9' }),
      ),
    ).toBe('approval appr-9')
  })

  it('clamps the whole line, not just the input', () => {
    const command = deriveCommand(
      approval({ tool: 'Bash', input: 'echo '.repeat(80) }),
    )
    expect(command.length).toBeLessThanOrEqual(121)
  })
})

describe('formatWaiting', () => {
  it('derives the wait from requestedAt', () => {
    expect(formatWaiting(NOW - 42 * SECOND_MS, NOW)).toBe('42s')
    expect(formatWaiting(NOW - (4 * MINUTE_MS + 12 * SECOND_MS), NOW)).toBe(
      '4m 12s',
    )
    expect(formatWaiting(NOW - (2 * HOUR_MS + 5 * MINUTE_MS), NOW)).toBe('2h 5m')
    expect(formatWaiting(NOW - 3 * DAY_MS, NOW)).toBe('3d')
  })

  it('says nothing rather than "0s" when there is no usable timestamp', () => {
    expect(formatWaiting(undefined, NOW)).toBeUndefined()
    expect(formatWaiting(Number.NaN, NOW)).toBeUndefined()
  })

  it('treats a future timestamp as clock skew, not a negative wait', () => {
    expect(formatWaiting(NOW + 10 * MINUTE_MS, NOW)).toBe('0s')
  })
})

describe('statusToGateState', () => {
  it('maps the gateway statuses onto the card states', () => {
    expect(statusToGateState('pending')).toBe('pending')
    expect(statusToGateState('approved')).toBe('approved')
    expect(statusToGateState('denied')).toBe('rejected')
  })

  it('treats a status-less entry as pending — it came off the pending list', () => {
    expect(statusToGateState(undefined)).toBe('pending')
  })
})

describe('mapApprovalToGateProps', () => {
  it('maps every REAL field the gateway actually carries', () => {
    const props = mapApprovalToGateProps(approval(), NOW)

    expect(props.title).toBe('Write 41 restored notes to Vault/Published/')
    expect(props.command).toBe('Write Vault/Published/2026-08-24-restored.md')
    expect(props.subtitle).toBe('km-agent')
    expect(props.waiting).toBe('4m 12s')
    expect(props.state).toBe('pending')
  })

  it('omits the sublabel rather than guessing when no agent is named', () => {
    expect(mapApprovalToGateProps(approval({ agentName: '' }), NOW).subtitle)
      .toBeUndefined()
  })

  it('ALWAYS fills blast radius and undo path with the inert sentinel', () => {
    // NO SOURCE (§3.2). Nothing about the entry may reach these two cells, so
    // the assertion is over a deliberately rich set of entries rather than one.
    const entries: Array<GatewayApprovalEntry> = [
      approval(),
      approval({ action: '', tool: '', input: undefined, context: '' }),
      approval({ status: 'approved' }),
      approval({ status: 'denied', agentName: 'builder' }),
      approval({
        context: 'publishes 1 public page and fires an RSS blast',
        input: { blastRadius: '2,411 subscribers', undoPath: 'revert ≈90s' },
      }),
    ]

    for (const entry of entries) {
      const props = mapApprovalToGateProps(entry, NOW)
      expect(props.blastRadius).toBe(NO_SOURCE_TEXT)
      expect(props.undoPath).toBe(NO_SOURCE_TEXT)
      // And never the plausible fixture prose.
      expect(props.blastRadius).not.toBe(commandGateFixture.blastRadius)
      expect(props.undoPath).not.toBe(commandGateFixture.undoPath)
    }
  })

  it('never synthesises a caveat', () => {
    const props = mapApprovalToGateProps(
      approval({ context: 'qa has not run against the fix yet' }),
      NOW,
    )
    expect('caveat' in props).toBe(false)
  })

  it('offers only the two actions that map onto a real endpoint', () => {
    const props = mapApprovalToGateProps(approval(), NOW)
    expect(props.actions).toEqual(GATE_ACTIONS)
    expect(props.actions).not.toContain(OMITTED_ACTION)
  })

  it('drops the header sublabel on the mobile hero and nothing else', () => {
    const desktop = mapApprovalToGateProps(approval(), NOW)
    const mobile = mapApprovalToMobileGateProps(approval(), NOW)

    expect(mobile.subtitle).toBeUndefined()
    expect({ ...mobile, subtitle: desktop.subtitle }).toEqual(desktop)
  })
})

describe('mapApprovalToGateSummary', () => {
  it('names the real agent and counts the real queue behind it', () => {
    const summary = mapApprovalToGateSummary(approval(), 2, 'NEEDS YOU')

    expect(summary.heading).toBe('NEEDS YOU')
    expect(summary.label).toBe('GATE · km-agent · +2 more waiting')
    expect(summary.title).toBe('Write 41 restored notes to Vault/Published/')
  })

  it('offers REVIEW only — a glance surface draws no blast radius panel', () => {
    expect(mapApprovalToGateSummary(approval(), 0, 'NEEDS YOU').actions).toEqual(
      ['REVIEW'],
    )
  })

  it('drops the tally when the hero is the whole queue', () => {
    expect(mapApprovalToGateSummary(approval(), 0, 'NEEDS YOU').label).toBe(
      'GATE · km-agent',
    )
  })
})

describe('buildOthersWaitingLine', () => {
  it('is empty unless something is actually behind the hero', () => {
    expect(buildOthersWaitingLine(0)).toBe('')
    expect(buildOthersWaitingLine(-1)).toBe('')
    expect(buildOthersWaitingLine(2)).toBe('+2 more waiting')
  })
})

describe('normalizeApprovals', () => {
  it('stamps the pending list, keeps given statuses, and dedupes by id', () => {
    const entries = normalizeApprovals({
      pending: [{ id: 'a' }],
      approvals: [
        { id: 'a', status: 'approved' },
        { id: 'b', status: 'denied' },
      ],
    })

    expect(entries).toHaveLength(2)
    expect(entries.find((entry) => entry.id === 'a')?.status).toBe('pending')
    expect(entries.find((entry) => entry.id === 'b')?.status).toBe('denied')
  })

  it('reads an absent or empty response as an empty queue', () => {
    expect(normalizeApprovals(undefined)).toEqual([])
    expect(normalizeApprovals({ ok: false, approvals: [] })).toEqual([])
  })
})

describe('selectPendingApprovals', () => {
  it('keeps only pending entries, oldest first', () => {
    const pending = selectPendingApprovals([
      approval({ id: 'new', requestedAt: NOW - MINUTE_MS }),
      approval({ id: 'done', status: 'approved' }),
      approval({ id: 'old', requestedAt: NOW - HOUR_MS }),
      approval({ id: 'refused', status: 'denied' }),
    ])

    expect(pending.map((entry) => entry.id)).toEqual(['old', 'new'])
  })

  it('sorts an unknown wait last — it is not evidence of a long one', () => {
    const pending = selectPendingApprovals([
      approval({ id: 'unknown', requestedAt: undefined }),
      approval({ id: 'known', requestedAt: NOW - MINUTE_MS }),
    ])

    expect(pending.map((entry) => entry.id)).toEqual(['known', 'unknown'])
  })
})

describe('clampText', () => {
  it('cuts on a word boundary when there is one worth cutting on', () => {
    expect(clampText('alpha beta gamma delta', 16)).toBe('alpha beta…')
    expect(clampText('short', 16)).toBe('short')
  })
})
