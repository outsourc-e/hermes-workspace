import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ETSY_MARKET_LAB_STATION_IDS } from '../../../lib/war-room/living-v3/etsy-station-apps'

const dir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(dir, 'LivingWarRoomV3.tsx'), 'utf8')
const css = readFileSync(path.join(dir, 'etsy-desktop-canonical.css'), 'utf8')
const missionSource = readFileSync(path.join(dir, 'EtsyProductMissionWorkspace.tsx'), 'utf8')
const missionCss = readFileSync(path.join(dir, 'etsy-product-mission-workspace.css'), 'utf8')
const routeSource = readFileSync(path.join(dir, '../war-room-screen.tsx'), 'utf8')
const primaryWorkspaceSource = source.slice(
  source.indexOf('function EtsyMarketLabPrimaryWorkspace'),
  source.indexOf('function toolStatusLabel'),
)
const productConsoleSource = source.slice(
  source.indexOf('function SimpleProductConsole'),
  source.indexOf('function renderEtsyStationApp'),
)

describe('LivingWarRoomV3 canonical Etsy desktop workspace', () => {
  it('uses one modern mission frame, product mission list, stage workbench, and collapsed proof drawer', () => {
    expect(primaryWorkspaceSource).toContain('<EtsyProductMissionWorkspace')
    expect(missionSource).toContain('data-product-mission-workspace="v1"')
    expect(missionSource.match(/className="etsy-mission__appbar"/g)).toHaveLength(1)
    expect(missionSource.match(/className="etsy-mission__list"/g)).toHaveLength(1)
    expect(missionSource.match(/className="etsy-mission__workbench"/g)).toHaveLength(1)
    expect(missionSource.match(/className="etsy-mission__proof"/g)).toHaveLength(1)
    expect(missionSource).toContain('data-product-mission-list="v1"')
    expect(missionSource).toContain('data-manual-stage-start="required"')
    expect(missionSource).toContain('data-etsy-context-collapsed="true"')
    expect(missionSource).not.toContain('living-v3__workbench-inspector')
    expect(missionSource).not.toContain('living-v3__etsy-tool-tabs')
    expect(missionSource).not.toContain('data-capability-truth="v1"')
  })

  it('keeps every canonical station in the single frame with a distinct workbench archetype', () => {
    for (const stationId of ETSY_MARKET_LAB_STATION_IDS) {
      expect(source).toContain(`case '${stationId}'`)
    }

    expect(source).toContain('data-simple-product-console="v1"')
    expect(source).toContain('living-v3__etsy-app--ledger')
    expect(source).toContain('living-v3__etsy-app--net')
    expect(source).toContain('living-v3__etsy-app--truth')
    expect(source).toContain('living-v3__etsy-app--shotlab')
    expect(source).toContain('living-v3__etsy-app--inspection')
    expect(source).toContain('living-v3__etsy-app--draft')
    expect(css).toContain('Product Search: visual artifact cockpit')
    expect(css).toContain('SEO: ledger-first composition')
    expect(css).toContain('Source Leads: marketplace comparison board')
    expect(css).toContain('Source Truth: evidence matrix')
    expect(css).toContain('ShotLab Prep: media storyboard')
    expect(css).toContain('QA: inspection tiles')
    expect(css).toContain('Draft Approval: final read sheet')
  })

  it('does not expose the old Product Search tool switcher or legacy Etsy route', () => {
    expect(productConsoleSource).not.toContain('living-v3__simple-product-advanced')
    expect(productConsoleSource).not.toContain('כלים טכניים מוסתרים')
    expect(productConsoleSource).not.toContain('<SmartIntakeWorkbench')
    expect(productConsoleSource).not.toContain('<EtsySheetIntakeTool')
    expect(productConsoleSource).not.toContain('<EtsyProductPrepWorkbench')
    expect(missionSource).not.toContain('runLiveScout')
    expect(missionSource).not.toContain('Search products')
    expect(missionSource).toContain('data-product-packet-inbox="v1"')
    expect(routeSource).not.toContain('legacyEtsyOps')
    expect(routeSource).not.toContain('<EtsyOpsRoom')
  })

  it('preserves ownership boundaries and real local gates', () => {
    expect(missionSource).toContain('data-room-ownership="etsy-execution-only"')
    expect(missionSource).toContain('data-research-lab-primary="moved-to-goblin"')
    expect(missionSource).toContain('Open Goblin Research')
    expect(missionSource).toContain('Research in Goblin · media packet local · Etsy publish locked')
    expect(missionSource).toContain('Waiting for manual ${labels[actionId]} start.')
    expect(source).toContain('const hasRoomSelectedProduct = Boolean(roomState.selectedProductPacket)')
    expect(source).toContain('const hasSeoPacket = Boolean(roomState.seoPacket)')
    expect(source).toContain('const canCreateTruthPacket = Boolean(activeCandidate || activeLead || truthPacket)')
    expect(source).toContain('data-locked-action="Etsy upload draft"')
    expect(source).toContain('data-locked-action="Etsy publish"')
  })

  it('keeps rail readiness identical to the actual station action gates', () => {
    expect(source).toContain('const hasTruth = Boolean(pipeline.productTruthPacket)')
    expect(source).toContain('const canStartTruth = Boolean(activeProduct || activeLead || pipeline.productTruthPacket)')
    expect(source).toContain('const hasQaCards = pipeline.qaItems.length > 0')
    expect(source).toContain("label: hasQaReport ? 'report ready' : hasQaCards ? 'inspect' : 'needs QA cards'")
    expect(source).toContain('const hasDraftInputs = hasSeo && hasShotLab')
    expect(source).toContain("state: hasDraft ? 'done' : hasDraftInputs ? 'ready' : 'locked'")
    expect(source).toContain('disabled={!(hasSeoPacket && hasShotLabPacket)}')
    expect(source).not.toContain('Boolean(pipeline.productTruthPacket || roomState.selectedProductPacket)')
  })

  it('keeps the legacy station stylesheet order and loads a scoped modern mission stylesheet', () => {
    expect(source.indexOf("import './living-war-room-v3.css'")).toBeLessThan(
      source.indexOf("import './etsy-desktop-canonical.css'"),
    )
    expect(css).toContain('@media (min-width: 1100px)')
    expect(css).toContain('grid-template-columns: repeat(7, minmax(0, 1fr));')
    expect(missionSource).toContain("import './etsy-product-mission-workspace.css'")
    expect(missionCss).toContain('.living-v3--etsy-primary-workspace .etsy-mission')
    expect(missionCss).toContain('--mission-bg: #07111d;')
    expect(missionCss).toContain('@media (max-width: 700px)')
  })
})
