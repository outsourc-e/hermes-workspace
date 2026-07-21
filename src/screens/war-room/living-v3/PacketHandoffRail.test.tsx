import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PacketHandoffRail } from './PacketHandoffRail'
import type { WorkspacePacketMissionRailItem } from '../../../lib/workspace-kernel/mission-spine'

function item(overrides: Partial<WorkspacePacketMissionRailItem> = {}): WorkspacePacketMissionRailItem {
  return {
    packetId: 'packet-rail-1',
    runId: 'run-rail-1',
    packetType: 'context',
    sender: { roomId: 'olympus-command', agentId: 'hermes' },
    receiver: { roomId: 'terra-forge', agentId: 'terra' },
    status: 'blocked',
    tone: 'blocked',
    summary: 'hermes → terra',
    missingFields: ['modelChecksum'],
    nextRequiredAction: 'Fill: modelChecksum.',
    contentHash: 'a'.repeat(64),
    createdAt: '2026-07-20T17:10:00.000Z',
    approvalGatePersisted: false,
    approvalStage: null,
    statusReason: 'Need exact model evidence.',
    ...overrides,
  }
}

describe('PacketHandoffRail', () => {
  it('keeps route, status, blocker, approval and next action visible while technical IDs stay collapsed', () => {
    const html = renderToStaticMarkup(
      <PacketHandoffRail
        items={[item()]}
        status="ready"
        runId="run-rail-1"
        readback="Loaded from local Packet store."
      />,
    )

    expect(html).toContain('data-workspace-packet-rail="v1"')
    expect(html).toContain('data-packet-details-collapsed="true"')
    expect(html).toContain('data-packet-id="packet-rail-1"')
    expect(html).toContain('data-packet-type="context"')
    expect(html).toContain('data-packet-step-status="blocked"')
    expect(html).toContain('data-packet-approval-status="none"')
    expect(html).toContain('Step 1 · context')
    expect(html).toContain('hermes → terra')
    expect(html).toContain('Owner / room')
    expect(html).toContain('terra · terra-forge')
    expect(html).toContain('Need exact model evidence.')
    expect(html).toContain('Fill: modelChecksum.')
    expect(html).toContain('data-packet-technical-details="collapsed"')
    expect(html.indexOf('Next required action')).toBeLessThan(html.indexOf('Technical details'))
  })

  it('never renders an approval action when no persisted approval gate exists', () => {
    const html = renderToStaticMarkup(
      <PacketHandoffRail items={[item()]} status="ready" runId="run-rail-1" />,
    )

    expect(html).toContain('data-packet-approval-gate="none"')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('data-persisted-approval-gate')
  })

  it('wires LivingWarRoomV3 to verified persisted Packets instead of the legacy seven-step placeholder', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/screens/war-room/living-v3/LivingWarRoomV3.tsx'), 'utf8')

    expect(source).toContain('/api/war-room/workspace-kernel/packets?runId=')
    expect(source).toContain('parseWorkspacePacketMissionResults(payload.result.packets)')
    expect(source).toContain('<PacketHandoffRail')
    expect(source.indexOf('<PacketHandoffRail')).toBeLessThan(source.indexOf('<details className="living-v3__command-details">'))
    expect(source).not.toContain('missionSpine.map')
    expect(source).not.toContain('data-workspace-mission-spine="v1"')
  })

  it('shows a truthful empty state instead of placeholder mission steps', () => {
    const html = renderToStaticMarkup(
      <PacketHandoffRail items={[]} status="ready" runId="run-empty" />,
    )

    expect(html).toContain('No persisted Packets for this run yet.')
    expect(html).toContain('data-packet-handoff-count="0"')
    expect(html).not.toContain('Idea')
    expect(html).not.toContain('Council')
    expect(html).not.toContain('Approval')
  })
})
