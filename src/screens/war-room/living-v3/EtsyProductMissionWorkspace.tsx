import {
  Alert02Icon,
  ArrowRight01Icon,
  Chart02Icon,
  CheckListIcon,
  File02Icon,
  Image02Icon,
  InboxIcon,
  LockIcon,
  Package01Icon,
  PlayIcon,
  Refresh01Icon,
  UserIcon,
  WorkflowSquare01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo, useState } from 'react'
import { buildEtsyProductMissionList } from '../../../lib/war-room/living-v3/etsy-product-missions'
import type { ReactNode } from 'react'
import type { EtsyProductMissionActionId, EtsyProductMissionRow, EtsyProductMissionStageId } from '../../../lib/war-room/living-v3/etsy-product-missions'
import type { EtsyPipelineState, EtsyQaStatus } from '../../../lib/war-room/living-v3/etsy-pipeline'
import type { EtsyProductWorkspaceStateV2 } from '../../../lib/war-room/living-v3/etsy-product-model'
import type { EtsyRoomState, EtsyShotLabHandoffPacket } from '../../../lib/war-room/living-v3/etsy-room-contracts'
import type { EtsyMarketLabStationId } from '../../../lib/war-room/living-v3/etsy-station-apps'
import './etsy-product-mission-workspace.css'

type MissionWorkspaceActions = {
  onOpenOpportunityResearch: () => void
  onSelectStation: (stationId: EtsyMarketLabStationId) => void
  onResetPipeline: () => void
  selectCandidate: (candidateId: string) => void
  createTruthPacket: () => void
  setShotLabPreset: (value: EtsyShotLabHandoffPacket['preset']) => void
  setShotLabImageCount: (value: number) => void
  setShotLabSourceImageRequirements: (value: string | ((current: string) => string)) => void
  setShotLabVariantNotes: (value: string | ((current: string) => string)) => void
  createShotLabHandoffPacket: () => void
  createSeoPacket: () => void
  createDraftPayload: () => void
  createDraftApprovalPacket: () => void
  updateQaItemStatus: (qaItemId: string, status: EtsyQaStatus) => void
}

export type EtsyProductMissionWorkspaceProps = {
  selectedStationId: EtsyMarketLabStationId
  workspaceState: EtsyProductWorkspaceStateV2
  operatorLabel: string
  operatorStatus: string
  stationSurface: ReactNode
  stationReceipt?: string
  actions: MissionWorkspaceActions
}

const stationNavigation: Array<{
  id: EtsyMarketLabStationId
  label: string
  shortLabel: string
  icon: Parameters<typeof HugeiconsIcon>[0]['icon']
}> = [
  { id: 'etsy-loki-product-hunt', label: 'Product Packets', shortLabel: 'Packets', icon: InboxIcon },
  { id: 'etsy-loki-source-leads', label: 'Supplier Proof', shortLabel: 'Sources', icon: Package01Icon },
  { id: 'etsy-thor-source-truth', label: 'Source Truth', shortLabel: 'Truth', icon: CheckListIcon },
  { id: 'etsy-thor-shotlab-prep', label: 'Image Production', shortLabel: 'Images', icon: Image02Icon },
  { id: 'etsy-thor-qa-review', label: 'Visual QA', shortLabel: 'QA', icon: Alert02Icon },
  { id: 'etsy-thor-seo-metrics', label: 'SEO Workbench', shortLabel: 'SEO', icon: Chart02Icon },
  { id: 'etsy-odin-draft-approval', label: 'Draft & Approval', shortLabel: 'Approval', icon: File02Icon },
]

const stageCopy: Record<EtsyProductMissionStageId, { label: string; eyebrow: string; description: string }> = {
  intake: { label: 'Product Packet Inbox', eyebrow: 'EXTERNAL INTAKE', description: 'Products arrive from Goblin, Sheet Intake, Smart Intake, or an approved local packet. There is no product search inside Etsy Market Lab.' },
  truth: { label: 'Source Truth Review', eyebrow: 'MANUAL STAGE 02', description: 'Check claims, materials, variants, dimensions, supplier proof, and unsupported fields before image work.' },
  images: { label: 'Image Production Workbench', eyebrow: 'MANUAL STAGE 03', description: 'Prepare a local ShotLab handoff, inspect source media, and record visual QA. Paid generation remains locked.' },
  seo: { label: 'SEO Workbench', eyebrow: 'MANUAL STAGE 04', description: 'Build title, tags, description structure, and keyword metrics from the selected product packet.' },
  draft: { label: 'Draft Preparation', eyebrow: 'MANUAL STAGE 05', description: 'Assemble a local-only listing preview from Truth, Images, and SEO packets.' },
  approval: { label: 'DLV Approval Gate', eyebrow: 'MANUAL STAGE 06', description: 'Review the prepared draft and evidence. Etsy upload and publish remain locked.' },
}

function imageSource(ref?: string) {
  if (!ref) return undefined
  if (/^(https?:\/\/|data:image\/|\/)/i.test(ref)) return ref
  return undefined
}

function ProductSourceImage({ primaryRef, fallbackRef, alt, fallback }: {
  primaryRef?: string
  fallbackRef?: string
  alt: string
  fallback: ReactNode
}) {
  const sources = useMemo(
    () => [...new Set([imageSource(primaryRef), imageSource(fallbackRef)].filter((ref): ref is string => Boolean(ref)))],
    [fallbackRef, primaryRef],
  )
  const [sourceIndex, setSourceIndex] = useState(0)

  const src = sources.at(sourceIndex)
  if (!src) return <>{fallback}</>

  return <img src={src} alt={alt} loading="lazy" onError={() => setSourceIndex((index) => index + 1)} />
}

const shotTypeOptions = [
  { label: 'Hero', hint: 'Main listing image', aliases: ['hero', 'front'] },
  { label: 'Lifestyle', hint: 'Product in a real setting', aliases: ['lifestyle', 'context'] },
  { label: 'Detail', hint: 'Texture and finish close-up', aliases: ['detail', 'clasp'] },
  { label: 'Scale', hint: 'Size shown clearly', aliases: ['scale'] },
  { label: 'Packaging', hint: 'What the buyer receives', aliases: ['packaging'] },
  { label: 'Variant', hint: 'One proof image per option', aliases: ['variant'] },
] as const

function selectedShotTypes(value: string) {
  const normalized = value.toLowerCase()
  return shotTypeOptions.filter((option) => option.aliases.some((alias) => normalized.includes(alias))).map((option) => option.label)
}

function toggleShotType(value: string, label: typeof shotTypeOptions[number]['label']) {
  const selected = new Set(selectedShotTypes(value))
  if (selected.has(label)) selected.delete(label)
  else selected.add(label)
  return shotTypeOptions.filter((option) => selected.has(option.label)).map((option) => option.label).join(', ')
}

function selectedVariantOptions(value: string) {
  const marker = 'Selected variants:'
  const markerIndex = value.indexOf(marker)
  if (markerIndex < 0) return []
  return value.slice(markerIndex + marker.length).split('|').map((item) => item.trim()).filter(Boolean)
}

function toggleVariantOption(value: string, option: string) {
  const marker = 'Selected variants:'
  const markerIndex = value.indexOf(marker)
  const selected = new Set(selectedVariantOptions(value))
  if (selected.has(option)) selected.delete(option)
  else selected.add(option)
  const base = (markerIndex >= 0 ? value.slice(0, markerIndex) : value).trim()
  const selectionLine = selected.size ? `${marker} ${[...selected].join(' | ')}` : ''
  return [base, selectionLine].filter(Boolean).join('\n')
}

function stageForStation(stationId: EtsyMarketLabStationId, row?: EtsyProductMissionRow): EtsyProductMissionStageId {
  if (stationId === 'etsy-loki-product-hunt') return 'intake'
  if (stationId === 'etsy-loki-source-leads' || stationId === 'etsy-thor-source-truth') return 'truth'
  if (stationId === 'etsy-thor-shotlab-prep' || stationId === 'etsy-thor-qa-review') return 'images'
  if (stationId === 'etsy-thor-seo-metrics') return 'seo'
  if (row?.currentStageId === 'approval') return 'approval'
  return 'draft'
}

function actionWaitingCopy(actionId: EtsyProductMissionActionId) {
  if (actionId === 'review-approval') return 'Waiting for DLV review.'
  if (actionId === 'select-product') return 'Waiting for a manual product selection.'
  const labels: Record<Exclude<EtsyProductMissionActionId, 'review-approval' | 'select-product'>, string> = {
    'start-truth': 'Truth',
    'start-images': 'Images',
    'start-seo': 'SEO',
    'prepare-draft': 'Draft',
    'request-approval': 'Approval',
  }
  return `Waiting for manual ${labels[actionId]} start.`
}

function runMissionAction(row: EtsyProductMissionRow, actions: MissionWorkspaceActions) {
  const action = row.nextAction
  if (!action.enabled) return
  actions.onSelectStation(action.targetStationId)
  if (action.id === 'select-product') actions.selectCandidate(row.id)
  if (action.id === 'start-truth') actions.createTruthPacket()
  if (action.id === 'start-images') actions.createShotLabHandoffPacket()
  if (action.id === 'start-seo') actions.createSeoPacket()
  if (action.id === 'prepare-draft') actions.createDraftPayload()
  if (action.id === 'request-approval') actions.createDraftApprovalPacket()
}

function ProductThumb({ row }: { row: EtsyProductMissionRow }) {
  const primaryRef = row.thumbnailRef ?? row.imageRefs.at(0)
  const fallbackRef = row.sourceDetails.find((detail) => detail.localImageRef === primaryRef)?.imageUrl
    ?? row.sourceDetails.find((detail) => detail.imageUrl)?.imageUrl
  const hasImage = Boolean(imageSource(primaryRef) ?? imageSource(fallbackRef))
  return (
    <div className="etsy-mission__thumb" data-has-image={hasImage ? 'true' : 'false'}>
      {hasImage ? <ProductSourceImage key={`${primaryRef ?? ''}|${fallbackRef ?? ''}`} primaryRef={primaryRef} fallbackRef={fallbackRef} alt={`${row.title} source`} fallback={<HugeiconsIcon icon={Package01Icon} size={24} strokeWidth={1.6} />} /> : <HugeiconsIcon icon={Package01Icon} size={24} strokeWidth={1.6} />}
    </div>
  )
}

function MissionStageRail({ row, onSelectStation }: { row: EtsyProductMissionRow; onSelectStation: MissionWorkspaceActions['onSelectStation'] }) {
  return (
    <div className="etsy-mission__row-stages" aria-label={`${row.title} stage progress`}>
      {row.stages.map((stage, index) => (
        <button
          key={stage.id}
          type="button"
          data-mission-stage={stage.id}
          data-mission-stage-status={stage.status}
          title={`${stage.label} · ${stage.operator} · ${stage.receipt}`}
          onClick={() => onSelectStation(stage.stationId)}
        >
          <span>{stage.status === 'complete' ? '✓' : index + 1}</span>
          <b>{stage.label}</b>
          <small>{stage.operator}</small>
        </button>
      ))}
    </div>
  )
}

function MissionRow({ row, actions }: { row: EtsyProductMissionRow; actions: MissionWorkspaceActions }) {
  return (
    <article
      className={`etsy-mission__row ${row.selected ? 'is-selected' : ''}`}
      data-product-mission-id={row.id}
      data-product-mission-selected={row.selected ? 'true' : 'false'}
      data-product-mission-stage={row.currentStageId}
    >
      <div className="etsy-mission__row-product">
        <ProductThumb row={row} />
        <div>
          <span>{row.origin.replace(/-/g, ' ')}</span>
          <h3>{row.title}</h3>
          <small>{row.niche} · packet <bdi dir="ltr">{row.packetId}</bdi></small>
        </div>
      </div>
      <MissionStageRail row={row} onSelectStation={actions.onSelectStation} />
      <div className="etsy-mission__row-progress">
        <strong>{row.progressPercent}%</strong>
        <div><span style={{ width: `${row.progressPercent}%` }} /></div>
        <small>{row.warnings.length ? `${row.warnings.length} warning${row.warnings.length === 1 ? '' : 's'}` : 'packet clean'}</small>
      </div>
      <div className="etsy-mission__row-action">
        <span data-action-ready={row.nextAction.enabled ? 'true' : 'false'}>
          <HugeiconsIcon icon={row.nextAction.enabled ? PlayIcon : LockIcon} size={15} strokeWidth={1.8} />
          {row.nextAction.enabled ? 'Manual start' : 'Blocked'}
        </span>
        <button
          type="button"
          disabled={!row.nextAction.enabled}
          data-mission-next-action={row.nextAction.id}
          onClick={() => runMissionAction(row, actions)}
        >
          {row.nextAction.label}
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.8} />
        </button>
      </div>
      {(row.warnings.length > 0 || row.nextAction.blocker) && (
        <div className="etsy-mission__row-warning" data-warning-blocking={row.hasBlockingError ? 'true' : 'false'}>
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={1.7} />
          <span>{row.nextAction.blocker ?? row.warnings[0]}</span>
          {!row.hasBlockingError && <small>warning only · stage may be started manually</small>}
        </div>
      )}
    </article>
  )
}

function ProductPacketInbox({ row, roomState, onOpenOpportunityResearch }: {
  row?: EtsyProductMissionRow
  roomState: EtsyRoomState
  onOpenOpportunityResearch: () => void
}) {
  if (!row) {
    return (
      <section className="etsy-mission__packet-empty" data-product-packet-inbox="v1">
        <div className="etsy-mission__empty-icon"><HugeiconsIcon icon={InboxIcon} size={30} strokeWidth={1.5} /></div>
        <div>
          <span>PRODUCT PACKET INBOX</span>
          <h3>Waiting for an external product intake packet</h3>
          <p>Use Goblin Research, Sheet Intake, Smart Intake, or an approved local handoff. Etsy Market Lab begins after intake.</p>
        </div>
        <button type="button" data-open-research-lab="goblin-opportunity-room" onClick={onOpenOpportunityResearch}>Open Goblin Research</button>
      </section>
    )
  }
  const candidate = roomState.candidates.find((item) => item.candidateId === row.id)
  const facts = [
    ['Origin', row.origin.replace(/-/g, ' ')],
    ['Evidence', `${candidate?.evidenceIds.length ?? 0} linked records`],
    ['Sources', `${candidate?.sourceRecordIds.length ?? 0} source records`],
    ['Score', row.score == null ? 'not measured' : `${row.score}/100`],
  ]
  return (
    <section className="etsy-mission__packet-inbox" data-product-packet-inbox="v1">
      <div className="etsy-mission__packet-hero">
        <ProductThumb row={row} />
        <div>
          <span>SELECTED PRODUCT PACKET</span>
          <h3>{row.title}</h3>
          <p>Intake is complete. The next stage starts only when you press <b>{row.nextAction.label}</b>.</p>
        </div>
      </div>
      <div className="etsy-mission__packet-facts">
        {facts.map(([label, value]) => <article key={label}><span>{label}</span><b>{value}</b></article>)}
      </div>
      <div className="etsy-mission__packet-warnings">
        <b>Packet notes</b>
        {row.warnings.length ? row.warnings.slice(0, 6).map((warning) => <span key={warning}><HugeiconsIcon icon={Alert02Icon} size={14} />{warning}</span>) : <span><HugeiconsIcon icon={CheckListIcon} size={14} />No visible packet warnings.</span>}
      </div>
    </section>
  )
}

function MediaWorkbench({ row, pipeline, roomState, actions }: {
  row: EtsyProductMissionRow
  pipeline: EtsyPipelineState
  roomState: EtsyRoomState
  actions: MissionWorkspaceActions
}) {
  const imageRefs = row.imageRefs.length ? row.imageRefs : (roomState.shotLabHandoffPacket ? roomState.shotLabHandoffPacket.imageRefs : [])
  const selectedShots = selectedShotTypes(roomState.shotLabDraft.sourceImageRequirements)
  const selectedVariants = selectedVariantOptions(roomState.shotLabDraft.variantNotes)
  const slots = Array.from({ length: Math.max(4, Math.min(Math.max(roomState.shotLabDraft.imageCount, imageRefs.length), 12)) }, (_, index) => {
    const qa = pipeline.qaItems.at(index)
    const ref = imageRefs.at(index)
    const source = row.sourceDetails.find((detail) => detail.localImageRef === ref || detail.imageUrl === ref)
    const sourceLabel = source?.label ?? (ref?.includes('/supplier-') ? 'Supplier reference' : ref ? 'Etsy reference' : 'Source missing')
    return {
      id: `slot-${index + 1}`,
      ref,
      fallbackRef: source?.imageUrl,
      qa,
      label: qa?.label ?? sourceLabel,
      sourceLabel,
    }
  })
  return (
    <section className="etsy-mission__media-workbench" data-product-media-workbench="v1">
      <div className="etsy-mission__media-board">
        <div className="etsy-mission__section-heading">
          <div><span>IMAGE PACKET</span><h4>Source media & visual QA</h4></div>
          <small>{imageRefs.length} source refs · {pipeline.qaItems.length} QA cards</small>
        </div>
        <div className="etsy-mission__media-grid">
          {slots.map((slot, index) => {
            const src = imageSource(slot.ref) ?? imageSource(slot.fallbackRef)
            const qaItem = slot.qa
            const qaStatus = qaItem ? qaItem.status : 'unreviewed'
            return (
              <article key={slot.id} data-media-slot={index + 1} data-qa-status={qaStatus}>
                <div className="etsy-mission__media-preview">
                  {src ? <ProductSourceImage key={`${slot.ref ?? ''}|${slot.fallbackRef ?? ''}`} primaryRef={slot.ref} fallbackRef={slot.fallbackRef} alt={slot.label} fallback={<HugeiconsIcon icon={Image02Icon} size={28} strokeWidth={1.4} />} /> : <HugeiconsIcon icon={Image02Icon} size={28} strokeWidth={1.4} />}
                  <span>{index + 1}</span>
                </div>
                <div><b>{slot.label}</b><small>{qaItem ? qaItem.status : (src ? slot.sourceLabel : 'source missing')}</small></div>
                {qaItem && (
                  <div className="etsy-mission__qa-actions">
                    <button type="button" onClick={() => actions.updateQaItemStatus(qaItem.qaItemId, 'approved')}>Approve</button>
                    <button type="button" onClick={() => actions.updateQaItemStatus(qaItem.qaItemId, 'rejected')}>Reject</button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </div>
      <aside className="etsy-mission__recipe-panel">
        <div><span>SHOTLAB HANDOFF</span><h4>Image plan</h4><p>Choose the exact image types and variants. This saves the local/shared packet; it does not run paid generation.</p></div>
        <div className="etsy-mission__sync-status" data-media-sync-status="shared-room">
          <span><HugeiconsIcon icon={Refresh01Icon} size={14} /> Shared room state</span>
          <b>{imageRefs.length} media · {row.variantOptions.length} variants</b>
          <small>{roomState.lastReceipt ?? 'Waiting for the first saved recipe change.'}</small>
        </div>
        <label><span>Preset</span><select value={roomState.shotLabDraft.preset} onChange={(event) => actions.setShotLabPreset(event.target.value as EtsyShotLabHandoffPacket['preset'])}><option>Boutique Premium</option><option>Minimalist Zen</option><option>Earthy Organic</option></select></label>
        <div className="etsy-mission__count-picker"><span>Image count</span><div>{[6, 9, 12].map((count) => <button key={count} type="button" className={roomState.shotLabDraft.imageCount === count ? 'is-active' : ''} onClick={() => actions.setShotLabImageCount(count)}>{count}</button>)}</div></div>
        <div className="etsy-mission__choice-group">
          <span>Shot types</span>
          <div>{shotTypeOptions.map((option) => {
            const active = selectedShots.includes(option.label)
            return <button key={option.label} type="button" data-shot-type={option.label} className={active ? 'is-active' : ''} aria-pressed={active} title={option.hint} onClick={() => actions.setShotLabSourceImageRequirements((current) => toggleShotType(current, option.label))}><b>{option.label}</b><small>{option.hint}</small></button>
          })}</div>
        </div>
        <div className="etsy-mission__choice-group" data-variant-selector="v1">
          <span>Product variants</span>
          {row.variantOptions.length ? <div>{row.variantOptions.map((option) => {
            const active = selectedVariants.includes(option)
            return <button key={option} type="button" data-variant-option={option} className={active ? 'is-active' : ''} aria-pressed={active} onClick={() => actions.setShotLabVariantNotes((current) => toggleVariantOption(current, option))}><b>{option}</b></button>
          })}</div> : <small>No structured variants in this packet yet.</small>}
        </div>
        <button type="button" className="etsy-mission__primary" disabled={row.nextAction.id !== 'start-images' || !row.nextAction.enabled} onClick={() => runMissionAction(row, actions)}>{roomState.shotLabHandoffPacket ? 'Handoff ready' : 'Create local handoff'}</button>
        <small><HugeiconsIcon icon={LockIcon} size={13} /> Paid generation · supplier send · Etsy upload locked</small>
      </aside>
    </section>
  )
}

function AgentTimeline({ row, roomState, operatorLabel, operatorStatus }: {
  row?: EtsyProductMissionRow
  roomState: EtsyRoomState
  operatorLabel: string
  operatorStatus: string
}) {
  const events = roomState.events.slice(-4).reverse()
  return (
    <section className="etsy-mission__timeline" data-agent-timeline="manual-handoff-v1">
      <div className="etsy-mission__section-heading"><div><span>AGENT TIMELINE</span><h4>Receipts, not auto-progress</h4></div><small>{operatorLabel} · {operatorStatus}</small></div>
      <div className="etsy-mission__timeline-list">
        {events.length ? events.map((event) => (
          <article key={event.eventId}><span><HugeiconsIcon icon={UserIcon} size={14} /></span><div><b>{event.stationId ? event.stationId.replace('etsy-', '').replace(/-/g, ' ') : 'local packet'}</b><p>{event.readback}</p><small><bdi dir="ltr">{event.eventId}</bdi></small></div></article>
        )) : <article><span><HugeiconsIcon icon={InboxIcon} size={14} /></span><div><b>Packet inbox</b><p>No local stage event has run yet.</p></div></article>}
        <article className="is-waiting"><span><HugeiconsIcon icon={PlayIcon} size={14} /></span><div><b>Manual handoff gate</b><p>{row ? actionWaitingCopy(row.nextAction.id) : 'Waiting for an external product packet.'}</p></div></article>
      </div>
    </section>
  )
}

export function EtsyProductMissionWorkspace({
  selectedStationId,
  workspaceState,
  operatorLabel,
  operatorStatus,
  stationSurface,
  stationReceipt,
  actions,
}: EtsyProductMissionWorkspaceProps) {
  const pipeline = workspaceState.pipelineState
  const roomState = workspaceState.roomState
  const model = useMemo(() => buildEtsyProductMissionList(roomState, pipeline), [workspaceState])
  const selectedRow: EtsyProductMissionRow | undefined = model.rows.find((row) => row.selected) ?? model.rows.at(0)
  const activeStageId = stageForStation(selectedStationId, selectedRow)
  const activeStage = stageCopy[activeStageId]
  const showPacketInbox = selectedStationId === 'etsy-loki-product-hunt'
  const showMediaWorkbench = Boolean(selectedRow && (selectedStationId === 'etsy-thor-shotlab-prep' || selectedStationId === 'etsy-thor-qa-review'))

  return (
    <section
      className="etsy-mission"
      data-product-mission-workspace="v1"
      data-product-mission-style="modern-graphite"
      data-room-ownership="etsy-execution-only"
      data-research-lab-primary="moved-to-goblin"
      data-manual-stage-start="required"
      data-selected-station-id={selectedStationId}
    >
      <header className="etsy-mission__appbar">
        <div className="etsy-mission__brand"><span><HugeiconsIcon icon={WorkflowSquare01Icon} size={24} strokeWidth={1.5} /></span><div><b>ETSY MARKET LAB</b><small>PRODUCT MISSION LIST · LOCAL EXECUTION</small></div></div>
        <div className="etsy-mission__app-status">
          <span><HugeiconsIcon icon={InboxIcon} size={15} />{model.summary.total} packet{model.summary.total === 1 ? '' : 's'}</span>
          <span><HugeiconsIcon icon={PlayIcon} size={15} />Manual stage start</span>
          <span className="is-locked"><HugeiconsIcon icon={LockIcon} size={15} />Live actions locked</span>
          <button type="button" data-open-research-lab="goblin-opportunity-room" onClick={actions.onOpenOpportunityResearch}>Open Goblin Research</button>
        </div>
      </header>

      <main className="etsy-mission__scroll">
        <section className="etsy-mission__list" data-product-mission-list="v1">
          <div className="etsy-mission__list-heading">
            <div><span>PRODUCT OPERATIONS</span><h2>Product Mission List</h2><p>One row per real intake packet. Every stage waits for a manual start.</p></div>
            <div><strong>{model.summary.active}</strong><span>active</span><strong>{model.summary.waitingApproval}</strong><span>approval</span><strong>{model.summary.warnings}</strong><span>warnings</span></div>
          </div>
          {model.rows.length ? <div className="etsy-mission__rows">{model.rows.map((row) => <MissionRow key={row.id} row={row} actions={actions} />)}</div> : <ProductPacketInbox roomState={roomState} onOpenOpportunityResearch={actions.onOpenOpportunityResearch} />}
        </section>

        <section className="etsy-mission__workbench" data-product-mission-workbench="stage-specific-v1" data-active-product-stage={activeStageId}>
          <div className="etsy-mission__workbench-heading">
            <div><span>{activeStage.eyebrow}</span><h2>{activeStage.label}</h2><p>{activeStage.description}</p></div>
            {selectedRow && <div className="etsy-mission__selected-context"><ProductThumb row={selectedRow} /><div><span>SELECTED PRODUCT</span><b>{selectedRow.title}</b><small>{selectedRow.progressPercent}% complete · {selectedRow.warnings.length} warnings</small></div></div>}
          </div>

          <nav className="etsy-mission__station-nav" aria-label="Product workbench tools">
            {stationNavigation.map((station) => (
              <button key={station.id} type="button" className={selectedStationId === station.id ? 'is-active' : ''} data-etsy-stage-link={station.id} onClick={() => actions.onSelectStation(station.id)} title={station.label}>
                <HugeiconsIcon icon={station.icon} size={18} strokeWidth={1.6} /><span>{station.shortLabel}</span>
              </button>
            ))}
          </nav>

          <div className="etsy-mission__workbench-grid">
            <div className="etsy-mission__primary-surface">
              {showPacketInbox && <ProductPacketInbox row={selectedRow} roomState={roomState} onOpenOpportunityResearch={actions.onOpenOpportunityResearch} />}
              {showMediaWorkbench && selectedRow && <MediaWorkbench row={selectedRow} pipeline={pipeline} roomState={roomState} actions={actions} />}
              {!showPacketInbox && !showMediaWorkbench && <div className="etsy-mission__station-surface" data-stage-specific-station-surface={selectedStationId}>{stationSurface}</div>}
              {showMediaWorkbench && <details className="etsy-mission__station-details"><summary>Stage packet controls & proof</summary>{stationSurface}</details>}
              {stationReceipt && <div className="etsy-mission__receipt" role="status"><HugeiconsIcon icon={CheckListIcon} size={16} />{stationReceipt}</div>}
            </div>

            <aside className="etsy-mission__side-panel">
              <section className="etsy-mission__next-card" data-next-action-ready={selectedRow?.nextAction.enabled ? 'true' : 'false'}>
                <span>NEXT MANUAL ACTION</span>
                <h3>{selectedRow?.nextAction.label ?? 'Waiting for intake'}</h3>
                <p>{selectedRow?.nextAction.blocker ?? (selectedRow ? actionWaitingCopy(selectedRow.nextAction.id) : 'Send a product packet from the approved intake surface.')}</p>
                {selectedRow ? <button type="button" className="etsy-mission__primary" disabled={!selectedRow.nextAction.enabled} onClick={() => runMissionAction(selectedRow, actions)}>{selectedRow.nextAction.label}<HugeiconsIcon icon={ArrowRight01Icon} size={17} /></button> : <button type="button" className="etsy-mission__primary" onClick={actions.onOpenOpportunityResearch}>Open Goblin Research</button>}
              </section>
              <AgentTimeline row={selectedRow} roomState={roomState} operatorLabel={operatorLabel} operatorStatus={operatorStatus} />
            </aside>
          </div>
        </section>
      </main>

      <details className="etsy-mission__proof" data-etsy-context-collapsed="true">
        <summary><span>Context, proof & local controls</span><small>{roomState.lastReceipt ?? pipeline.lastReceipt ?? 'No run yet'}</small></summary>
        <div><article><span>Run</span><b><bdi dir="ltr">{roomState.run.runId}</bdi></b></article><article><span>Packet</span><b><bdi dir="ltr">{selectedRow?.packetId ?? 'none'}</bdi></b></article><article><span>Boundary</span><b>Research in Goblin · media packet local · Etsy publish locked</b></article><button type="button" onClick={() => window.confirm('Reset the local Etsy pipeline and remove its saved browser state?') && actions.onResetPipeline()}><HugeiconsIcon icon={Refresh01Icon} size={15} />Reset local pipeline</button></div>
      </details>
    </section>
  )
}
