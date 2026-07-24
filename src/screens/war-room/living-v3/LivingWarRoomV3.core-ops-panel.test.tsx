import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WorkspaceCoreOpsPanel } from './WorkspaceCoreOpsPanel'
import type { WorkspaceCoreOpsSnapshot } from '../../../lib/workspace-core-ops'

describe('LivingWarRoomV3 Core Ops panel', () => {
  it('adds a read-only global ops panel without changing map room phase/dimming mechanics', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(path.join(dir, 'LivingWarRoomV3.tsx'), 'utf8')
    const panelSource = readFileSync(path.join(dir, 'WorkspaceCoreOpsPanel.tsx'), 'utf8')
    const panelCss = readFileSync(path.join(dir, 'workspace-core-ops-panel.css'), 'utf8')
    const css = readFileSync(path.join(dir, 'living-war-room-v3.css'), 'utf8')
    const contract = readFileSync(path.join(dir, '../../../lib/war-room/living-v3/living-v3-contract.ts'), 'utf8')

    expect(source).toContain('buildWorkspaceCoreOpsSnapshot')
    expect(source).toContain('<WorkspaceCoreOpsPanel')
    expect(source).toContain('snapshot={workspaceCoreOpsSnapshot}')
    expect(panelSource).toContain('data-workspace-core-ops="v1"')
    expect(panelSource).toContain('data-human-alert-cards="agent-summary-v3"')
    expect(panelSource).toContain('data-notification-drawer="right-toggle-v1"')
    expect(panelSource).toContain('data-notification-drawer-default="collapsed-v2"')
    expect(panelSource).toContain("const DRAWER_OPEN_STORAGE_KEY = 'hermes:workspace-core-ops:drawer-open:v2'")
    expect(panelSource).toContain('if (typeof window === \'undefined\') return false')
    expect(panelSource).toContain("window.localStorage.setItem(DRAWER_OPEN_STORAGE_KEY, '0')")
    expect(panelSource).toContain('return false')
    expect(panelSource).not.toContain("return stored === '1'")
    expect(panelSource).toContain('workspace-core-ops-bell')
    expect(panelSource).toContain('badgeCount')
    expect(panelSource).toContain('onApprovalDecision')
    expect(panelSource).toContain('decideApproval(notification, \'approved\'')
    expect(panelSource).toContain('decideApproval(notification, \'rejected\'')
    expect(panelSource).toContain('workspace-core-ops-panel__notification-avatar')
    expect(panelSource).toContain('notification.summary')
    expect(panelSource).toContain('notification.actorLabel')
    expect(panelSource).not.toContain('Notifications / Approvals / Artifacts')
    expect(panelSource).toContain("data-read-only-api={persistence?.provider === 'supabase' ? 'false' : 'true'}")
    expect(panelSource).toContain('data-live-actions-locked="true"')
    expect(panelSource).toContain('No live sends')
    expect(source).toContain('const selectedStationUsesGatewayLayer = selectedStation?.id === \'gateway-console\'')
    expect(source).toContain('const selectedStationUsesOracleWorkspace = selectedStationIsOracle')
    expect(source).toContain('|| selectedStationUsesOracleWorkspace')
    expect(source).toContain('living-v3--oracle-primary-workspace')
    expect(source).toContain('data-oracle-primary-workspace-active={selectedStationUsesOracleWorkspace ? \'true\' : \'false\'}')
    expect(source).toContain('data-oracle-product-scout="workbench-v1"')
    expect(source).toContain('const selectedStationSuppressesGlobalOverlays = selectedStationUsesPrimaryWorkspace || selectedStationUsesGatewayLayer')
    expect(source).toContain('data-gateway-approval-gate="locked-v1"')
    expect(source).toContain('data-generic-send-agent="removed"')
    expect(source).toContain('!selectedStationSuppressesGlobalOverlays && (')
    expect(source).toContain('!selectedStationSuppressesGlobalOverlays && !selectedStationUsesGoblinWorkspace')
    expect(source).toContain('navigationDebugOpen && !selectedStationSuppressesGlobalOverlays')
    expect(panelCss).toContain('.workspace-core-ops-panel')
    expect(css).toContain('.living-v3--etsy-primary-workspace .workspace-core-ops-shell')
    expect(css).toContain('.living-v3--gateway-active-layer .workspace-core-ops-shell')
    expect(css).toContain('.living-v3--oracle-primary-workspace .workspace-core-ops-shell')
    expect(css).toContain(".living-v3--oracle-primary-workspace .living-v3__oracle-shell[data-oracle-product-scout='workbench-v1']")
    expect(css).toContain('.living-v3__gateway-approval-gate')
    expect(css).toContain('.living-v3--terra-primary-workspace .living-v3__terra-workspace-rail')

    expect(source).toContain('LIVING_V3_WORLD_CONFIG.rooms.map((room) =>')
    expect(source).not.toContain('data-room-phase')
    expect(source).not.toContain('living-v3__core-strip')
    expect(source).not.toContain('living-v3__room--phase')
    expect(source).not.toContain('room.phase')
    expect(contract).not.toContain('LivingV3RoomPhase')
    expect(contract).not.toContain('phase:')
    expect(panelCss).not.toContain('living-v3__room--phase')
    expect(panelCss).not.toContain('filter: saturate')
  })

  it('renders the empty-artifact state without crashing', () => {
    const snapshot = {
      generatedAtMs: 1,
      source: 'workspace-kernel-local-state',
      safety: {
        localOnly: true,
        readOnly: true,
        usageAllowed: false,
        workerSpawnAllowed: false,
        externalRequestsAllowed: false,
        liveActionsAllowed: false,
      },
      counts: {
        notifications: 0,
        waitingApprovals: 0,
        artifacts: 0,
        failedRuns: 0,
        blockedRuns: 0,
        completedRuns: 0,
      },
      notifications: [],
      approvals: [],
      artifacts: [],
    } satisfies WorkspaceCoreOpsSnapshot

    const markup = renderToStaticMarkup(
      <WorkspaceCoreOpsPanel snapshot={snapshot} storeStatus="ready" onOpenRoom={() => undefined} />,
    )

    expect(markup).toContain('None yet')
  })
})
