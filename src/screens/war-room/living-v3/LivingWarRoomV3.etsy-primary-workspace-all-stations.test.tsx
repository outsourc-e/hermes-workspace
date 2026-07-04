import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ETSY_MARKET_LAB_STATION_IDS } from '../../../lib/war-room/living-v3/etsy-station-apps'

describe('LivingWarRoomV3 Etsy primary workspace', () => {
  it('routes every Etsy station through the primary workspace instead of the drawer shell', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(path.join(dir, 'LivingWarRoomV3.tsx'), 'utf8')

    expect(source).toContain('function EtsyMarketLabPrimaryWorkspace')
    expect(source).toContain('const selectedStationUsesEtsyWorkspace = selectedStationIsEtsy')
    expect(source).not.toContain("selectedStation?.id === 'etsy-loki-product-hunt'")
    expect(source).toContain('data-etsy-workspace-mode="primary"')
    expect(source).toContain('data-workbench-os="phase2-v1"')
    expect(source).toContain("data-etsy-focus-mode={etsyFocusMode ? 'true' : 'false'}")
    expect(source).toContain("selectedStation && !selectedStationUsesEtsyWorkspace")
    expect(source).toContain('className="living-v3__workbench-details living-v3__workbench-details--proof"')
    expect(source).toContain('data-capability-truth="v1"')
    expect(source).toContain('Google OAuth is not connected in Hermes')
    expect(source).toContain("data-debug-proof-collapsed={proofOpen ? 'false' : 'true'}")

    for (const stationId of ETSY_MARKET_LAB_STATION_IDS) {
      expect(source).toContain(`case '${stationId}'`)
    }
  })

  it('keeps old static drawer copy out of the primary Etsy workspace shell', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(path.join(dir, 'LivingWarRoomV3.tsx'), 'utf8')
    const primaryWorkspaceSource = source.slice(
      source.indexOf('function EtsyMarketLabPrimaryWorkspace'),
      source.indexOf('function toolStatusLabel'),
    )

    expect(primaryWorkspaceSource).not.toContain('LOCAL-ONLY WORKBENCH')
    expect(primaryWorkspaceSource).not.toContain('Local-only workbench')
    expect(primaryWorkspaceSource).not.toContain('ACTIVE OPERATOR')
    expect(primaryWorkspaceSource).not.toContain('Active operator')
    expect(primaryWorkspaceSource).not.toContain('Publishing, live upload, supplier messaging')
    expect(primaryWorkspaceSource).not.toContain('Pipeline state is stored locally on this browser only.')
    expect(primaryWorkspaceSource).not.toContain('Operator spot')
    expect(primaryWorkspaceSource).not.toContain('Local media')
  })

  it('opens War Room on the main rooms map unless an explicit Etsy focus flag is used', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(path.join(dir, 'LivingWarRoomV3.tsx'), 'utf8')
    const routeSource = readFileSync(path.join(dir, '../war-room-screen.tsx'), 'utf8')
    const css = readFileSync(path.join(dir, 'living-war-room-v3.css'), 'utf8')

    expect(routeSource).toContain('const etsyFocusMode = isTruthyWarRoomFlag(routeSearch.etsyFocus)')
    expect(routeSource).not.toContain('etsyFocusMode={isTruthyWarRoomFlag(routeSearch.etsyOps)}')
    expect(routeSource).toContain('if (isTruthyWarRoomFlag(routeSearch.legacyEtsyOps)) return <EtsyOpsRoom />')
    expect(source).toContain('etsyFocusMode = false')
    expect(source).toContain("? { kind: 'station', id: 'etsy-loki-product-hunt' }")
    expect(source).toContain("? { kind: 'station', id: 'agora-intake' }")
    expect(source).toContain("etsyFocusMode\n      ? fitLivingV3RoomCamera('etsy-market-lab', INITIAL_VIEWPORT)")
    expect(source).toContain("living-v3--etsy-focus-mode")
    expect(css).toContain('.living-v3--etsy-focus-mode .living-v3__kernel-telemetry-strip')
    expect(css).toContain('.living-v3--etsy-focus-mode .living-v3__event-readback')
    expect(css).toContain('.living-v3--council-primary-workspace .living-v3__kernel-telemetry-strip')
    expect(css).toContain('.living-v3--council-primary-workspace .living-v3__event-readback')
  })

  it('keeps Proof / Debug collapsed inside the right workbench inspector', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(path.join(dir, 'LivingWarRoomV3.tsx'), 'utf8')
    const css = readFileSync(path.join(dir, 'living-war-room-v3.css'), 'utf8')
    const primaryWorkspaceSource = source.slice(
      source.indexOf('function EtsyMarketLabPrimaryWorkspace'),
      source.indexOf('function toolStatusLabel'),
    )

    expect(primaryWorkspaceSource.indexOf('className="living-v3__workbench-canvas"')).toBeLessThan(
      primaryWorkspaceSource.indexOf('className="living-v3__workbench-inspector"'),
    )
    expect(primaryWorkspaceSource).toContain('<summary>Proof / Debug</summary>')
    expect(primaryWorkspaceSource).not.toContain('<summary>Safety / Proof</summary>')
    expect(primaryWorkspaceSource).not.toContain('<EtsyPrerequisiteRail')
    expect(css).toContain('grid-template-areas:')
    expect(css).toContain('"rail canvas inspector"')
    expect(css).toContain('.living-v3__workbench-inspector')
  })

  it('gives the station switcher a full toolbar row at medium desktop widths', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const css = readFileSync(path.join(dir, 'living-war-room-v3.css'), 'utf8')

    expect(css).toContain('@media (min-width: 981px) and (max-width: 1360px)')
    expect(css).toContain('"title chips context proof"')
    expect(css).toContain('"stations stations stations stations"')
    expect(css).toContain('grid-area: stations;')
    expect(css).toContain('-webkit-mask-image: none;')
    expect(css).toContain('mask-image: none;')
  })

  it('gates primary station actions on real local prerequisites', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(path.join(dir, 'LivingWarRoomV3.tsx'), 'utf8')

    expect(source).toContain('const hasRoomSelectedProduct = Boolean(roomState.selectedProductPacket)')
    expect(source).toContain('const hasSeoPacket = Boolean(roomState.seoPacket)')
    expect(source).toContain('const canCreateTruthPacket = Boolean(activeCandidate || activeLead || truthPacket)')
    expect(source).toContain('disabled={!hasSeoPacket}')
    expect(source).toContain('Stage Sheet Row blocked')
    expect(source).toContain('Create Product Truth Packet blocked')
    expect(source).toContain('Create ShotLab Handoff blocked')
    expect(source).toContain('Create Draft Payload blocked')
    expect(source).toContain('Create DLV Approval Packet blocked')
    expect(source).toContain('data-disabled-reason=')
  })

  it('uses distinct disabled styling for primary Etsy buttons', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const css = readFileSync(path.join(dir, 'living-war-room-v3.css'), 'utf8')
    const prepCss = readFileSync(path.join(dir, 'etsy-product-prep-workbench.css'), 'utf8')

    expect(css).toContain('.living-v3--etsy-primary-workspace .living-v3__etsy-primary:disabled')
    expect(css).toContain('background: #dfe5dc;')
    expect(css).toContain('color: #37443d;')
    expect(css).toContain('cursor: not-allowed;')
    expect(prepCss).toContain('.etsy-prep__button:disabled')
    expect(prepCss).toContain('background: #dfe5dc;')
    expect(prepCss).toContain('color: #34433b;')
  })

  it('marks non-search Etsy station apps with the clean simple pass', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(path.join(dir, 'LivingWarRoomV3.tsx'), 'utf8')
    const css = readFileSync(path.join(dir, 'living-war-room-v3.css'), 'utf8')

    expect(source.match(/data-etsy-clean-pass="v1"/g)?.length).toBe(6)
    expect(source).toContain('data-component-source="simple-clean-station"')
    expect(css).toContain('DLV clean/simple pass')
    expect(css).toContain(".living-v3--etsy-primary-workspace .living-v3__etsy-app--practical[data-etsy-clean-pass='v1']")
    expect(css).toContain('.living-v3__etsy-blocked-preview')
    expect(css).toContain('display: none;')
  })

  it('connects Terra UI to a real profile, 3D skills, and proportional sprite scale', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(path.join(dir, 'LivingWarRoomV3.tsx'), 'utf8')
    const css = readFileSync(path.join(dir, 'living-war-room-v3.css'), 'utf8')

    expect(source).toContain('TerraAgentProfileClient')
    expect(source).toContain('Terra prompt staged with Obsidian + 3D skills')
    expect(source).toContain('terraAgentMotionTarget')
    expect(source).toContain('terraMotionTargetKey')
    expect(css).toContain('.living-v3__agent--terra')
    expect(css).toContain('--agent-sprite-scale-x: 0.7;')
    expect(css).toContain('.living-v3__terra-agent-skills')
  })

  it('adds a dynamic mission spine and separated agent minds to Hermes Command', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(path.join(dir, 'LivingWarRoomV3.tsx'), 'utf8')
    const css = readFileSync(path.join(dir, 'living-war-room-v3.css'), 'utf8')

    expect(source).toContain('buildWorkspaceMissionSpine')
    expect(source).toContain('createCouncilHandoffWorkspaceRun')
    expect(source).toContain('workspaceAgentMindsForRun')
    expect(source).toContain('data-workspace-mission-spine="v1"')
    expect(source).toContain('data-agent-mind={mind.mindId}')
    expect(source).toContain('missionSpine={missionSpine}')
    expect(source).toContain('missionAgentMinds={missionAgentMinds}')
    expect(css).toContain('.living-v3__mission-spine')
    expect(css).toContain('.living-v3__mission-minds')
    expect(css).toContain('grid-template-columns: repeat(7, minmax(0, 1fr));')
  })
})
