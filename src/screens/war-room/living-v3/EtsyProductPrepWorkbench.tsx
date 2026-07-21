import { useEffect, useMemo, useState } from 'react'

import { etsyRoomStageLabels } from '../../../lib/war-room/living-v3/etsy-room-contracts'
import { WorkspacePipelineWorkbench } from './WorkspacePipelineWorkbench'
import { WorkspaceStationCta } from './WorkspaceStationCta'
import type { CSSProperties } from 'react'
import type {
  EtsyPipelineState,
  EtsyProductSearchMode,
  EtsyProductCandidate as PipelineCandidate,
} from '../../../lib/war-room/living-v3/etsy-pipeline'
import type {
  EtsyRoomState,
  EtsyShotLabHandoffPacket,
  EtsyProductCandidate as RoomCandidate,
} from '../../../lib/war-room/living-v3/etsy-room-contracts'
import type { EtsyLiveResearchRun } from '../../../lib/war-room/living-v3/etsy-live-research'
import type { LivingV3AgentId, LivingV3StationId } from '../../../lib/war-room/living-v3/living-v3-contract'
import './etsy-product-prep-workbench.css'

export type EtsyProductPrepLiveScoutState = {
  status: 'idle' | 'running' | 'completed' | 'blocked' | 'failed'
  result?: { liveRun: EtsyLiveResearchRun }
  error?: string
  receipt?: string
}

export type EtsyProductPrepWorkbenchActions = {
  updateSearchInput: (value: string) => void
  updateSearchMode: (value: EtsyProductSearchMode) => void
  createSearchPacket: () => void
  prepareScoutPacket: () => void
  runScoutWorker: () => void
  runLiveScout: (options?: { keepSurface?: boolean }) => void
  selectCandidate: (candidateId: string) => void
  addCandidateToVisualBoard: (candidateId: string) => void
  rejectCandidate: (candidateId: string) => void
  setShotLabPreset: (value: EtsyRoomState['shotLabDraft']['preset']) => void
  setShotLabImageCount: (value: number) => void
  setShotLabSourceImageRequirements: (value: string) => void
  setShotLabVariantNotes: (value: string) => void
  createShotLabHandoffPacket: () => void
  createSeoPacket: () => void
  createDraftPayload: () => void
  createDraftApprovalPacket: () => void
  resetPipeline?: () => void
}

export type EtsyProductPrepWorkbenchProps = {
  pipeline: EtsyPipelineState
  roomState: EtsyRoomState
  liveScout: EtsyProductPrepLiveScoutState
  evidenceLoading: boolean
  actions: EtsyProductPrepWorkbenchActions
  chatMemory?: Array<EtsyPrepChatMemorySnippet>
}

type CandidateView = {
  id: string
  title: string
  niche: string
  score: number | null
  confidence: number | null
  sourceType: string
  dataOrigin: string
  evidenceQuality: string
  evidenceCount: number
  missingFields: Array<string>
  riskNotes: Array<string>
  tags: Array<string>
  sourceRecordIds: Array<string>
  evidenceIds: Array<string>
  selected: boolean
  rejected: boolean
  board: boolean
  source: 'room' | 'pipeline'
}

type StationToolStory = {
  id: string
  sigil: string
  name: string
  role: string
  mood: string
  status: string
  hint: string
  accent: string
  asset: EtsyPrepWindowAsset
}

type StationToolAction = {
  primaryLabel: string
  primaryRun?: () => void
  primaryDisabled?: boolean
  blockedReason?: string
  secondary?: Array<{
    label: string
    run?: () => void
    disabled?: boolean
  }>
}

type EtsyToolOwnership = {
  ownerAgentId: LivingV3AgentId
  ownerLabel: string
  targetStationId: LivingV3StationId
}

export type EtsyPrepChatMemorySnippet = {
  id: string
  agentId: string
  from: 'operator' | 'agent'
  text: string
}

type EtsyPrepMemoryKind = 'search' | 'action' | 'packet' | 'chat' | 'system'

type EtsyPrepMemoryEvent = {
  id: string
  kind: EtsyPrepMemoryKind
  label: string
  detail: string
  createdAtMs: number
  entityId?: string
}

type EtsyPrepWindowAsset = {
  id: string
  src: string
  alt: string
  accent: string
}

const ETSY_PREP_MEMORY_STORAGE_KEY = 'war-room-etsy-product-prep-memory-history-v1'
const ETSY_PREP_MEMORY_LIMIT = 18
const ETSY_PREP_WINDOW_ASSETS = {
  search: {
    id: 'product-search',
    src: '/war-room/living-v3/window-assets/product-search.png',
    alt: 'Loki product hunter search asset',
    accent: '#1f8f75',
  },
  candidates: {
    id: 'candidate-sorting',
    src: '/war-room/living-v3/window-assets/candidate-sorting.png',
    alt: 'Candidate sorting board asset',
    accent: '#8b6f2a',
  },
  truth: {
    id: 'source-truth',
    src: '/war-room/living-v3/window-assets/source-truth.png',
    alt: 'Thor source truth forge asset',
    accent: '#a76018',
  },
  shotlab: {
    id: 'shotlab-prep',
    src: '/war-room/living-v3/window-assets/shotlab-prep.png',
    alt: 'Hephaestus ShotLab prep easel asset',
    accent: '#8c5bd6',
  },
  seo: {
    id: 'seo-workbench',
    src: '/war-room/living-v3/window-assets/seo-workbench.png',
    alt: 'Oracle SEO metrics asset',
    accent: '#2f79a8',
  },
  approval: {
    id: 'draft-approval',
    src: '/war-room/living-v3/window-assets/draft-approval.png',
    alt: 'Odin approval draft approval throne asset',
    accent: '#315d9c',
  },
  memory: {
    id: 'memory-history',
    src: '/war-room/living-v3/window-assets/memory-history.png',
    alt: 'Workspace memory history archive asset',
    accent: '#7b5bd6',
  },
} satisfies Record<string, EtsyPrepWindowAsset>

const searchModes: Array<{ id: EtsyProductSearchMode; label: string }> = [
  { id: 'niche', label: 'Niche' },
  { id: 'exact', label: 'Exact' },
  { id: 'style', label: 'Style' },
]

const sourceModeLabels = [
  'local',
  'oracle',
  'live-readonly',
]

const supplierTableLinks = [
  {
    id: 'approval-list',
    label: 'DLV Approval list',
    status: 'GREEN products first',
    href: '/product-intelligence',
    note: 'Research ledger / approval table before supplier handoff.',
  },
  {
    id: 'supplier-quote',
    label: 'Supplier quote sheet',
    status: 'V/✓ rows only',
    href: 'https://docs.google.com/spreadsheets/d/1Zfjc7-xMbRzB2MH0JhLhf_j6Lz5Q3MMBntoTzGBPKm4/edit?pli=1&gid=0#gid=0',
    note: 'Supplier-facing: Product, 2 images, Can Supply, Price, Notes.',
  },
  {
    id: 'visual-verification',
    label: 'Competitor ↔ supplier QA',
    status: 'visual proof',
    href: 'https://docs.google.com/spreadsheets/d/14ri1qDkrRJMxasnqQdYkkp2xtrB4X5Mh-WPru3kUK-s/edit?gid=0#gid=0',
    note: 'Internal comparison sheet for exact/near-exact supplier match.',
  },
] as const

const stageSteps = [
  { id: 'search', label: 'Search' },
  { id: 'candidates', label: 'Pick' },
  { id: 'source_truth', label: 'Facts' },
  { id: 'shotlab', label: 'Images' },
  { id: 'seo', label: 'SEO' },
  { id: 'draft', label: 'Draft' },
  { id: 'approval', label: 'Approval' },
] as const

type PrepStageStepId = typeof stageSteps[number]['id']

function styleVars(vars: Record<string, string | number>): CSSProperties {
  return vars as CSSProperties
}

function loadStoredPrepMemory(): Array<EtsyPrepMemoryEvent> {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ETSY_PREP_MEMORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Array<EtsyPrepMemoryEvent>
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((event) => event && typeof event.id === 'string' && typeof event.label === 'string')
      .slice(0, ETSY_PREP_MEMORY_LIMIT)
  } catch {
    return []
  }
}

function memoryTime(createdAtMs: number) {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(createdAtMs))
  } catch {
    return '--:--'
  }
}

function memoryKindLabel(kind: EtsyPrepMemoryKind) {
  if (kind === 'search') return 'Search'
  if (kind === 'chat') return 'Chat'
  if (kind === 'packet') return 'Packet'
  if (kind === 'action') return 'Action'
  return 'System'
}

function WindowAssetBadge({ asset, compact = false }: { asset: EtsyPrepWindowAsset; compact?: boolean }) {
  return (
    <span
      className={`etsy-prep__asset-badge ${compact ? 'etsy-prep__asset-badge--compact' : ''}`}
      style={styleVars({ '--prep-asset-accent': asset.accent })}
      data-etsy-window-asset={asset.id}
      aria-label={asset.alt}
    >
      <img src={asset.src} alt="" aria-hidden="true" loading="lazy" />
    </span>
  )
}

function compactList(values: Array<string>, fallback: string, limit = 4) {
  const cleaned = values.map((item) => item.trim()).filter(Boolean)
  return cleaned.length ? cleaned.slice(0, limit) : [fallback]
}

function scoreText(value: number | null | undefined) {
  return value === null || value === undefined ? 'missing' : String(value)
}

function readinessLabel(missingCount: number, evidenceCount: number) {
  if (!evidenceCount) return 'blocked until evidence exists'
  if (missingCount > 4) return 'needs source truth'
  if (missingCount > 0) return 'partial local prep'
  return 'ready for local handoff'
}

function clampPercent(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return 0
  return Math.max(0, Math.min(100, Math.round(value as number)))
}

function metricTone(value: number) {
  if (value >= 75) return 'good'
  if (value >= 45) return 'warn'
  return 'bad'
}

function isLegacyDemoCandidate(candidate: Pick<CandidateView, 'title' | 'dataOrigin' | 'evidenceQuality' | 'sourceRecordIds' | 'evidenceIds'>) {
  const title = candidate.title.toLowerCase()
  const legacyTitle = title.includes('initial necklace gift necklace') || title.includes('gold initial necklace opportunities')
  const fallbackInitial = title.includes('initial necklace') && (candidate.dataOrigin === 'fallback-local-mock' || candidate.evidenceQuality === 'fallback-local-mock')
  const noRealProof = title.includes('initial necklace') && candidate.sourceRecordIds.length === 0 && candidate.evidenceIds.length === 0
  return legacyTitle || fallbackInitial || noRealProof
}


function currentPrepStage(roomState: EtsyRoomState, candidateCount: number): PrepStageStepId {
  if (roomState.approvalPacket || roomState.stage === 'approval_waiting') return 'approval'
  if (roomState.draftPayload || roomState.stage === 'draft_payload_ready') return 'draft'
  if (roomState.seoPacket || roomState.stage === 'seo_packet_ready') return 'seo'
  if (roomState.shotLabHandoffPacket || roomState.stage === 'shotlab_packet_ready') return 'shotlab'
  if (roomState.selectedProductPacket || roomState.stage === 'candidate_selected') return 'source_truth'
  if (candidateCount || roomState.stage === 'candidates_ready') return 'candidates'
  return 'search'
}

function activeToolIdForStage(stage: PrepStageStepId) {
  switch (stage) {
    case 'search':
      return 'product-search'
    case 'candidates':
      return 'source-truth'
    case 'source_truth':
      return 'shotlab-prep'
    case 'shotlab':
      return 'seo-workbench'
    case 'seo':
    case 'draft':
    case 'approval':
      return 'draft-approval'
    default:
      return 'product-search'
  }
}

function stageWorkbenchCopy(stage: PrepStageStepId) {
  switch (stage) {
    case 'search':
      return {
        eyebrow: 'Start',
        title: 'Find a product worth preparing',
        detail: 'Search once. Then move fast: pick, verify, plan images, write SEO, draft.',
      }
    case 'candidates':
      return {
        eyebrow: 'Decision',
        title: 'Pick the best product',
        detail: 'Compare score, evidence, missing proof, and risk. One click should choose the winner.',
      }
    case 'source_truth':
      return {
        eyebrow: 'Evidence',
        title: 'Product chosen. Prepare visual evidence next',
        detail: 'Only source-backed facts survive. Anything missing stays blocked before copy or media.',
      }
    case 'shotlab':
      return {
        eyebrow: 'Images',
        title: 'Image brief is ready. Write SEO next',
        detail: 'The gallery plan is local-only. Now turn verified facts into title, tags, and warnings.',
      }
    case 'seo':
      return {
        eyebrow: 'Copy',
        title: 'SEO packet ready. Build the draft',
        detail: 'Use paste-ready titles/tags, keep missing metrics visible, and prepare a reviewable listing.',
      }
    case 'draft':
      return {
        eyebrow: 'Gate',
        title: 'Draft is ready for DLV approval',
        detail: 'Review the preview, blockers, tags, image order, and locked live actions before approval.',
      }
    case 'approval':
      return {
        eyebrow: 'Waiting',
        title: 'Approval packet is waiting',
        detail: 'No upload, publish, supplier, paid generation, or sheet write can happen from this screen.',
      }
  }
}

function nextActionForStage(input: {
  stage: PrepStageStepId
  candidates: Array<CandidateView>
  selectedCandidate?: CandidateView
  roomState: EtsyRoomState
  actions: EtsyProductPrepWorkbenchActions
}) {
  if (input.stage === 'approval') return { label: 'Review', run: undefined }
  if (input.roomState.draftPayload) return { label: 'Ask approval', run: input.actions.createDraftApprovalPacket }
  if (input.roomState.seoPacket) return { label: 'Make draft', run: input.actions.createDraftPayload }
  if (input.roomState.shotLabHandoffPacket) return { label: 'Write SEO', run: input.actions.createSeoPacket }
  if (input.roomState.selectedProductPacket) return { label: 'Plan images', run: input.actions.createShotLabHandoffPacket }
  if (input.candidates.length && input.selectedCandidate) {
    const candidateId = input.selectedCandidate.id
    return { label: 'Pick product', run: () => input.actions.selectCandidate(candidateId) }
  }
  return { label: 'Search products', run: input.actions.createSearchPacket }
}

function initials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? 'P'
  const second = words[1]?.[0] ?? words[0]?.[1] ?? 'R'
  return `${first}${second}`.toUpperCase()
}

function LocalProductThumb({ title, origin }: { title: string; origin: string }) {
  const tone = origin === 'live-readonly-research'
    ? '#4f8cff'
    : origin === 'oracle-local-alura'
      ? '#20a794'
      : origin.includes('fallback')
        ? '#c9862f'
        : '#7c8a4a'
  const shape = /ring/i.test(title)
    ? 'ring'
    : /bow/i.test(title)
      ? 'bow'
      : /bracelet|chain/i.test(title)
        ? 'chain'
        : /earring/i.test(title)
          ? 'drop'
          : 'pendant'
  return (
    <div
      className="etsy-prep__product-photo"
      style={styleVars({ '--prep-thumb': tone })}
      data-product-image-placeholder={shape}
      data-product-origin={origin}
      aria-label={`${title} visual placeholder`}
    >
      <i aria-hidden="true" />
      <span className="etsy-prep__sr-only">{title}</span>
    </div>
  )
}

function normalizeRoomCandidate(candidate: RoomCandidate): CandidateView {
  return {
    id: candidate.candidateId,
    title: candidate.title,
    niche: candidate.niche,
    score: candidate.score,
    confidence: candidate.score,
    sourceType: candidate.sourceType,
    dataOrigin: candidate.dataOrigin,
    evidenceQuality: candidate.dataOrigin === 'fallback-local-mock'
      ? 'fallback local'
      : candidate.evidenceIds.length >= 4
        ? 'source linked'
        : candidate.evidenceIds.length
          ? 'partial source'
          : 'missing evidence',
    evidenceCount: candidate.evidenceIds.length,
    missingFields: candidate.missingFields,
    riskNotes: candidate.riskNotes,
    tags: compactList([candidate.niche, candidate.sourceType, candidate.dataOrigin], 'jewelry'),
    sourceRecordIds: candidate.sourceRecordIds,
    evidenceIds: candidate.evidenceIds,
    selected: candidate.selected,
    rejected: false,
    board: false,
    source: 'room',
  }
}

function normalizePipelineCandidate(candidate: PipelineCandidate, state: EtsyPipelineState): CandidateView {
  return {
    id: candidate.candidateId,
    title: candidate.title,
    niche: candidate.niche,
    score: candidate.metricRows[0]?.keywordScore ?? null,
    confidence: candidate.confidence,
    sourceType: candidate.sourceLabels.join(', ') || candidate.dataOrigin,
    dataOrigin: candidate.dataOrigin,
    evidenceQuality: candidate.evidenceQuality,
    evidenceCount: candidate.evidenceCount,
    missingFields: candidate.evidenceQuality === 'missing-evidence' || candidate.evidenceQuality === 'fallback-local-mock'
      ? ['source proof', 'supplier proof', 'materials proof', 'source product images']
      : [],
    riskNotes: [
      candidate.signal,
      candidate.evidenceQuality === 'fallback-local-mock' ? 'Fallback candidate; treat as a planning stub only.' : '',
    ].filter(Boolean),
    tags: candidate.tags,
    sourceRecordIds: candidate.sourceRecordIds,
    evidenceIds: candidate.evidenceIds,
    selected: state.selectedCandidateId === candidate.candidateId,
    rejected: candidate.status === 'rejected' || state.rejectedCandidateIds.includes(candidate.candidateId),
    board: candidate.status === 'visual_board' || state.visualBoardCandidateIds.includes(candidate.candidateId),
    source: 'pipeline',
  }
}

function buildCandidateViews(roomState: EtsyRoomState, pipeline: EtsyPipelineState) {
  const views = [
    ...roomState.candidates.map(normalizeRoomCandidate),
    ...pipeline.candidates
      .filter((candidate) => candidate.status !== 'rejected' && !pipeline.rejectedCandidateIds.includes(candidate.candidateId))
      .map((candidate) => normalizePipelineCandidate(candidate, pipeline)),
  ]
  const seen = new Set<string>()
  return views.filter((candidate) => {
    if (seen.has(candidate.id)) return false
    seen.add(candidate.id)
    return true
  })
}

function findSelectedCandidate(candidates: Array<CandidateView>, roomState: EtsyRoomState, pipeline: EtsyPipelineState, focusedId?: string) {
  return candidates.find((candidate) => candidate.id === focusedId)
    ?? candidates.find((candidate) => candidate.id === roomState.selectedCandidateId)
    ?? candidates.find((candidate) => candidate.id === pipeline.selectedCandidateId)
    ?? candidates.find((candidate) => candidate.selected)
    ?? candidates[0]
}

function WorkbenchButton({
  children,
  onClick,
  disabled,
  variant = 'secondary',
}: {
  children: string
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'quiet'
}) {
  return (
    <button className={`etsy-prep__button etsy-prep__button--${variant}`} type="button" disabled={disabled} onClick={onClick} data-button-variant={variant}>
      <span>{children}</span>
    </button>
  )
}

function FieldList({ title, values, fallback }: { title: string; values: Array<string>; fallback: string }) {
  const rows = compactList(values, fallback, 6)
  return (
    <div className="etsy-prep__field-list" data-field-state={values.length ? 'filled' : 'empty'}>
      <p>{title}</p>
      <ul>
        {rows.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}
      </ul>
    </div>
  )
}

function buildStationToolStories(roomState: EtsyRoomState, liveScout: EtsyProductPrepLiveScoutState): Array<StationToolStory> {
  return [
    {
      id: 'product-search',
      sigil: '1',
      name: 'Search',
      role: 'Find product',
      mood: 'Type an idea and get options.',
      status: roomState.candidates.length ? `${roomState.candidates.length} options` : liveScout.status === 'running' ? 'searching' : 'ready',
      hint: 'Start here.',
      accent: '#1f8f75',
      asset: ETSY_PREP_WINDOW_ASSETS.search,
    },
    {
      id: 'source-truth',
      sigil: '2',
      name: 'Check',
      role: 'Facts',
      mood: 'Keep only claims we can prove.',
      status: roomState.selectedProductPacket ? 'product picked' : 'after pick',
      hint: 'Check before copy.',
      accent: '#a76018',
      asset: ETSY_PREP_WINDOW_ASSETS.truth,
    },
    {
      id: 'shotlab-prep',
      sigil: '3',
      name: 'Images',
      role: 'Media brief',
      mood: 'List shots and variants needed.',
      status: roomState.shotLabHandoffPacket ? 'brief ready' : `${roomState.shotLabDraft.imageCount} planned`,
      hint: 'No paid generation.',
      accent: '#8c5bd6',
      asset: ETSY_PREP_WINDOW_ASSETS.shotlab,
    },
    {
      id: 'seo-workbench',
      sigil: '4',
      name: 'SEO',
      role: 'Tags and title',
      mood: 'Build paste-ready SEO only after truth checks.',
      status: roomState.seoPacket ? `${roomState.seoPacket.tagCandidates.length} tags` : 'after product pick',
      hint: 'Metrics explicit.',
      accent: '#2f79a8',
      asset: ETSY_PREP_WINDOW_ASSETS.seo,
    },
    {
      id: 'draft-approval',
      sigil: '5',
      name: 'Draft',
      role: 'Review',
      mood: 'Package preview and approve later.',
      status: roomState.approvalPacket ? 'waiting' : roomState.draftPayload ? 'ready' : 'locked',
      hint: 'Upload stays locked.',
      accent: '#315d9c',
      asset: ETSY_PREP_WINDOW_ASSETS.approval,
    },
  ]
}

function etsyToolOwnership(toolId: string): EtsyToolOwnership {
  if (toolId === 'product-search') {
    return { ownerAgentId: 'loki', ownerLabel: 'Loki', targetStationId: 'etsy-loki-product-hunt' }
  }
  if (toolId === 'source-truth') {
    return { ownerAgentId: 'loki', ownerLabel: 'Loki', targetStationId: 'etsy-loki-source-leads' }
  }
  if (toolId === 'shotlab-prep') {
    return { ownerAgentId: 'thor', ownerLabel: 'Thor', targetStationId: 'etsy-thor-shotlab-prep' }
  }
  if (toolId === 'seo-workbench') {
    return { ownerAgentId: 'thor', ownerLabel: 'Thor', targetStationId: 'etsy-thor-seo-metrics' }
  }
  return { ownerAgentId: 'odin', ownerLabel: 'Odin', targetStationId: 'etsy-odin-draft-approval' }
}

function StationToolCard({ tool, action, active }: { tool: StationToolStory; action?: StationToolAction; active?: boolean }) {
  const ownership = etsyToolOwnership(tool.id)
  const ctaStatus = !action
    ? 'locked'
    : action.primaryDisabled || !action.primaryRun
      ? action.blockedReason ? 'blocked' : 'locked'
      : 'ready'
  const motionSignal = active
    ? ctaStatus === 'blocked' || ctaStatus === 'locked' ? 'blocked-at-gate' : 'work-at-tool'
    : 'standby'

  return (
    <article
      className={`etsy-prep__tool-card etsy-prep__tool-card--${tool.id} ${active ? 'is-active' : ''}`}
      style={styleVars({ '--prep-tool': tool.accent })}
      data-etsy-tool-personality={tool.id}
      data-etsy-tool-cta={action?.primaryLabel ?? 'status-only'}
      data-etsy-active-tool={active ? 'true' : 'false'}
      data-component-source="stage-command-card"
      aria-label={`${tool.name}: ${tool.hint}`}
    >
      <span className="etsy-prep__tool-sigil" aria-hidden="true">{tool.sigil}</span>
      <div className="etsy-prep__tool-visual" data-etsy-window-asset={tool.asset.id} aria-hidden="true">
        <img src={tool.asset.src} alt="" loading="lazy" />
      </div>
      <div>
        <p>{tool.role}</p>
        <h3>{tool.name}</h3>
        <span>{tool.mood}</span>
      </div>
      <footer>
        <WorkspaceStationCta
          actionId={`etsy.${tool.id}`}
          label={action?.primaryLabel ?? 'Locked'}
          sublabel={action?.blockedReason ?? tool.status}
          status={ctaStatus}
          ownerAgentId={ownership.ownerAgentId}
          ownerLabel={ownership.ownerLabel}
          targetRoomId="etsy-market-lab"
          targetStationId={ownership.targetStationId}
          targetToolLabel={tool.name}
          motionSignal={motionSignal}
          position="standard-dock-right"
          onPrimaryAction={action?.primaryRun}
          disabled={action?.primaryDisabled || !action?.primaryRun}
          secondaryActions={(action?.secondary ?? []).slice(0, 2).map((item) => ({
            id: `${tool.id}-${item.label}`,
            label: item.label,
            onClick: item.run,
            disabled: item.disabled || !item.run,
          }))}
          proofSummary="Local Etsy workspace action. Live Etsy writes stay locked until DLV approval."
          proofItems={[tool.role, tool.hint]}
        />
      </footer>
    </article>
  )
}

export function EtsyProductPrepWorkbench({
  pipeline,
  roomState,
  liveScout,
  evidenceLoading,
  actions,
  chatMemory = [],
}: EtsyProductPrepWorkbenchProps) {
  const [focusedCandidateId, setFocusedCandidateId] = useState<string>()
  const [debugOpen, setDebugOpen] = useState(false)
  const [prepMemory, setPrepMemory] = useState<Array<EtsyPrepMemoryEvent>>(loadStoredPrepMemory)
  const candidates = useMemo(() => buildCandidateViews(roomState, pipeline).filter((candidate) => !isLegacyDemoCandidate(candidate)), [roomState, pipeline])
  const selectedCandidate = findSelectedCandidate(candidates, roomState, pipeline, focusedCandidateId)
  const storedSelectedTitle = roomState.selectedProductPacket && !isLegacyDemoCandidate({
    title: roomState.selectedProductPacket.selectedProductTitle,
    dataOrigin: roomState.selectedProductPacket.dataOrigin,
    evidenceQuality: roomState.selectedProductPacket.evidenceIds.length ? 'partial' : 'missing',
    sourceRecordIds: roomState.selectedProductPacket.sourceRecordIds,
    evidenceIds: roomState.selectedProductPacket.evidenceIds,
  }) ? roomState.selectedProductPacket.selectedProductTitle : undefined
  const selectedTitle = storedSelectedTitle ?? selectedCandidate?.title ?? 'Choose a candidate'
  const selectedMissing = selectedCandidate?.missingFields ?? []
  const selectedEvidence = selectedCandidate?.evidenceIds ?? []
  const selectedSources = selectedCandidate?.sourceRecordIds ?? []
  const draftTitle = roomState.draftPayload?.title ?? roomState.seoPacket?.titleCandidates[0] ?? `${selectedTitle} draft preview`
  const canCreateShotLab = Boolean(roomState.selectedProductPacket)
  const canCreateSeo = Boolean(roomState.selectedProductPacket)
  const canCreateDraft = Boolean(roomState.seoPacket)
  const canRequestApproval = Boolean(roomState.draftPayload)
  const liveBlocked = liveScout.status === 'blocked' || liveScout.status === 'failed'
  const currentStage = currentPrepStage(roomState, candidates.length)
  const currentStageIndex = stageSteps.findIndex((stage) => stage.id === currentStage)
  const nextAction = nextActionForStage({ stage: currentStage, candidates, selectedCandidate, roomState, actions })
  const stationTools = buildStationToolStories(roomState, liveScout)
  const latestChat = chatMemory[chatMemory.length - 1]
  const lastSearchMemory = prepMemory.find((event) => event.kind === 'search')
  const lastActionMemory = prepMemory.find((event) => event.kind === 'packet' || event.kind === 'action')

  function rememberEvent(input: Omit<EtsyPrepMemoryEvent, 'createdAtMs'> & { createdAtMs?: number }) {
    const createdAtMs = input.createdAtMs ?? Date.now()
    setPrepMemory((current) => {
      if (current.some((event) => event.id === input.id)) return current
      return [{ ...input, createdAtMs }, ...current].slice(0, ETSY_PREP_MEMORY_LIMIT)
    })
  }

  function runRememberedAction(label: string, detail: string, run: () => void) {
    rememberEvent({
      id: `action-${label}-${Date.now()}`,
      kind: 'action',
      label,
      detail,
      entityId: label,
    })
    run()
  }

  const stationToolActions: Record<string, StationToolAction> = {
    'product-search': {
      primaryLabel: evidenceLoading ? 'Searching...' : 'Search',
      primaryDisabled: evidenceLoading,
      primaryRun: () => runRememberedAction('Search products', pipeline.searchInput || 'Empty search prompt', actions.createSearchPacket),
      secondary: [
        { label: 'Loki packet', run: () => runRememberedAction('Prepare Loki scout packet', pipeline.searchInput || 'No query typed yet', actions.prepareScoutPacket) },
        { label: 'Scout V2', run: () => runRememberedAction('Run Loki Scout V2', selectedTitle, actions.runScoutWorker) },
      ],
    },
    'source-truth': {
      primaryLabel: 'Choose product',
      primaryDisabled: !selectedCandidate,
      primaryRun: selectedCandidate ? () => {
        setFocusedCandidateId(selectedCandidate.id)
        runRememberedAction('Choose candidate', selectedCandidate.title, () => actions.selectCandidate(selectedCandidate.id))
      } : undefined,
      blockedReason: selectedCandidate ? undefined : 'Search first.',
      secondary: [
        { label: 'Shortlist', disabled: !selectedCandidate, run: selectedCandidate ? () => runRememberedAction('Shortlist candidate', selectedCandidate.title, () => actions.addCandidateToVisualBoard(selectedCandidate.id)) : undefined },
        { label: 'Reject', disabled: !selectedCandidate, run: selectedCandidate ? () => runRememberedAction('Reject candidate', selectedCandidate.title, () => actions.rejectCandidate(selectedCandidate.id)) : undefined },
      ],
    },
    'shotlab-prep': {
      primaryLabel: 'Plan images',
      primaryDisabled: !canCreateShotLab,
      primaryRun: canCreateShotLab ? () => runRememberedAction('Create local ShotLab handoff packet', selectedTitle, actions.createShotLabHandoffPacket) : undefined,
      blockedReason: canCreateShotLab ? undefined : 'Pick a product first.',
    },
    'seo-workbench': {
      primaryLabel: 'Write SEO',
      primaryDisabled: !canCreateSeo,
      primaryRun: canCreateSeo ? () => runRememberedAction('Create local SEO packet', selectedTitle, actions.createSeoPacket) : undefined,
      blockedReason: canCreateSeo ? undefined : 'Needs selected product.',
      secondary: [
        { label: 'Make draft', disabled: !canCreateDraft, run: canCreateDraft ? () => runRememberedAction('Create local draft preview', draftTitle, actions.createDraftPayload) : undefined },
      ],
    },
    'draft-approval': {
      primaryLabel: canRequestApproval ? 'Ask approval' : 'Make draft',
      primaryDisabled: canRequestApproval ? false : !canCreateDraft,
      primaryRun: canRequestApproval
        ? () => runRememberedAction('Request local DLV approval packet', draftTitle, actions.createDraftApprovalPacket)
        : canCreateDraft
          ? () => runRememberedAction('Create local draft preview', draftTitle, actions.createDraftPayload)
          : undefined,
      blockedReason: canRequestApproval || canCreateDraft ? undefined : 'Needs SEO packet.',
      secondary: [
        { label: 'Live locked', disabled: true },
      ],
    },
  }

  const activeToolId = activeToolIdForStage(currentStage)
  const activeTool = stationTools.find((tool) => tool.id === activeToolId) ?? stationTools[0]
  const activeToolAction = stationToolActions[activeTool.id]
  const activeStageCopy = stageWorkbenchCopy(currentStage)
  const activeActionDisabled = Boolean(activeToolAction?.primaryDisabled || !activeToolAction?.primaryRun)
  const activeStatus = activeActionDisabled
    ? activeToolAction?.blockedReason ?? 'Waiting for previous step.'
    : 'Ready now'
  const surfaceCards = [
    {
      label: 'Candidates',
      value: candidates.length ? String(candidates.length) : '0',
      detail: candidates.length ? 'pick one winner' : 'run search first',
      active: currentStage === 'search' || currentStage === 'candidates',
    },
    {
      label: 'Dossier',
      value: selectedCandidate ? `${selectedEvidence.length} proof` : 'empty',
      detail: selectedMissing.length ? `${selectedMissing.length} missing` : 'truth clean',
      active: currentStage === 'source_truth',
    },
    {
      label: 'Gallery',
      value: `${roomState.shotLabDraft.imageCount} shots`,
      detail: roomState.shotLabHandoffPacket ? 'brief ready' : 'needs plan',
      active: currentStage === 'shotlab',
    },
    {
      label: 'SEO',
      value: roomState.seoPacket ? `${roomState.seoPacket.tagCandidates.length} tags` : 'pending',
      detail: roomState.seoPacket ? 'copy staged' : 'write after proof',
      active: currentStage === 'seo',
    },
    {
      label: 'Draft',
      value: roomState.approvalPacket ? 'approval' : roomState.draftPayload ? 'ready' : 'locked',
      detail: roomState.approvalPacket ? 'DLV gate' : 'local preview',
      active: currentStage === 'draft' || currentStage === 'approval',
    },
  ]

  useEffect(() => {
    try {
      window.localStorage.setItem(ETSY_PREP_MEMORY_STORAGE_KEY, JSON.stringify(prepMemory))
    } catch {
      // Browser-only local memory is best-effort; the studio continues without persistence.
    }
  }, [prepMemory])

  useEffect(() => {
    const packet = pipeline.searchPacket
    if (!packet) return
    rememberEvent({
      id: `search-${packet.packetId}`,
      kind: 'search',
      label: 'Product search remembered',
      detail: `${packet.requestText} · ${packet.dataOrigin}`,
      entityId: packet.packetId,
      createdAtMs: packet.createdAtMs,
    })
  }, [pipeline.searchPacket?.packetId])

  useEffect(() => {
    if (!roomState.selectedProductPacket) return
    rememberEvent({
      id: `packet-${roomState.selectedProductPacket.packetId}`,
      kind: 'packet',
      label: 'Selected product remembered',
      detail: roomState.selectedProductPacket.selectedProductTitle,
      entityId: roomState.selectedProductPacket.packetId,
      createdAtMs: roomState.selectedProductPacket.createdAtMs,
    })
  }, [roomState.selectedProductPacket?.packetId])

  useEffect(() => {
    const packet = roomState.shotLabHandoffPacket
    if (!packet) return
    rememberEvent({
      id: `packet-${packet.packetId}`,
      kind: 'packet',
      label: 'ShotLab handoff remembered',
      detail: `${packet.preset} · ${packet.imageCount} images planned`,
      entityId: packet.packetId,
      createdAtMs: packet.createdAtMs,
    })
  }, [roomState.shotLabHandoffPacket?.packetId])

  useEffect(() => {
    const packet = roomState.seoPacket
    if (!packet) return
    rememberEvent({
      id: `packet-${packet.packetId}`,
      kind: 'packet',
      label: 'SEO packet remembered',
      detail: `${packet.tagCandidates.length} tags · score ${scoreText(packet.metrics.score)}`,
      entityId: packet.packetId,
      createdAtMs: packet.createdAtMs,
    })
  }, [roomState.seoPacket?.packetId])

  useEffect(() => {
    const packet = roomState.draftPayload
    if (!packet) return
    rememberEvent({
      id: `packet-${packet.packetId}`,
      kind: 'packet',
      label: 'Draft preview remembered',
      detail: packet.title,
      entityId: packet.packetId,
      createdAtMs: packet.createdAtMs,
    })
  }, [roomState.draftPayload?.packetId])

  useEffect(() => {
    const packet = roomState.approvalPacket
    if (!packet) return
    rememberEvent({
      id: `packet-${packet.packetId}`,
      kind: 'packet',
      label: 'Approval packet remembered',
      detail: `${packet.approvalStatus} · live actions still locked`,
      entityId: packet.packetId,
      createdAtMs: packet.createdAtMs,
    })
  }, [roomState.approvalPacket?.packetId])

  useEffect(() => {
    if (!latestChat) return
    rememberEvent({
      id: `chat-${latestChat.id}`,
      kind: 'chat',
      label: `${latestChat.from === 'operator' ? 'You' : latestChat.agentId} chat remembered`,
      detail: latestChat.text,
      entityId: latestChat.agentId,
    })
  }, [latestChat?.id])

  const productCards = candidates.filter((candidate) => !candidate.rejected && !isLegacyDemoCandidate(candidate))
  const visibleProductCards = productCards.slice(0, 8)
  const hiddenProductCardCount = Math.max(0, productCards.length - visibleProductCards.length)
  const oracleSignalLabel = roomState.oracleSignalPacket?.selectedKeyword
    ?? pipeline.oracleSignalPacket?.selectedKeyword
    ?? roomState.scoutPacket?.query
    ?? ''
  const boardState = productCards.length ? 'has-products' : 'waiting-oracle'
  const selectedOrigin = selectedCandidate?.dataOrigin ?? 'none'
  const selectedSupplierBlockers = selectedMissing.filter((field) => /supplier|source|image|material|variant|proof/i.test(field))
  const supplierGateState = !selectedCandidate
    ? 'waiting'
    : selectedSupplierBlockers.length
      ? 'blocked'
      : 'green'
  const supplierGateLabel = supplierGateState === 'green'
    ? 'GREEN'
    : supplierGateState === 'blocked'
      ? 'NEEDS SUPPLIER'
      : 'WAITING'
  const supplierGateDetail = supplierGateState === 'green'
    ? 'Supplier/product truth can move toward draft prep.'
    : supplierGateState === 'blocked'
      ? `${selectedSupplierBlockers.length} blocker${selectedSupplierBlockers.length === 1 ? '' : 's'} before draft.`
      : 'Search and choose one product first.'
  const draftGateLabel = roomState.draftPayload
    ? 'DRAFT READY'
    : roomState.seoPacket
      ? 'MAKE DRAFT'
      : 'LOCKED'
  const draftGateDetail = roomState.draftPayload
    ? 'Local draft payload exists; Etsy upload still needs your click.'
    : roomState.seoPacket
      ? 'SEO exists. One click builds the local draft payload.'
      : 'Needs selected product, supplier proof, ShotLab plan, and SEO.'
  const tableGateDetail = roomState.approvalPacket
    ? 'Approval packet is waiting; supplier sheet move still needs your mark/request.'
    : 'Open/edit tables from here; no supplier-facing write is automatic.'
  const commandCenterSteps = [
    {
      id: 'search-results',
      label: '1 Search',
      status: productCards.length ? `${productCards.length} result${productCards.length === 1 ? '' : 's'}` : 'empty',
      detail: productCards.length ? 'Choose one winner.' : 'Run Oracle/search first.',
      tone: productCards.length ? 'green' : 'waiting',
    },
    {
      id: 'supplier-filter',
      label: '2 Supplier filter',
      status: supplierGateLabel,
      detail: supplierGateDetail,
      tone: supplierGateState,
    },
    {
      id: 'approval-table',
      label: '3 Approval table',
      status: roomState.approvalPacket ? 'DLV GATE' : selectedCandidate ? 'READY TO REVIEW' : 'WAITING',
      detail: tableGateDetail,
      tone: roomState.approvalPacket ? 'green' : selectedCandidate ? 'waiting' : 'blocked',
    },
    {
      id: 'draft-prep',
      label: '4 Draft prep',
      status: draftGateLabel,
      detail: draftGateDetail,
      tone: roomState.draftPayload ? 'green' : canCreateDraft ? 'waiting' : 'blocked',
    },
  ]
  const nextVisualSteps = [
    {
      id: 'truth',
      label: 'Truth',
      ready: Boolean(roomState.selectedProductPacket),
      value: selectedCandidate ? `${selectedEvidence.length} proof` : 'pick product',
      action: 'Choose',
      disabled: !selectedCandidate,
      run: selectedCandidate ? () => runRememberedAction('Choose candidate', selectedCandidate.title, () => actions.selectCandidate(selectedCandidate.id)) : undefined,
    },
    {
      id: 'shotlab',
      label: 'ShotLab',
      ready: Boolean(roomState.shotLabHandoffPacket),
      value: roomState.shotLabHandoffPacket ? 'brief ready' : `${roomState.shotLabDraft.imageCount} slots`,
      action: 'Plan images',
      disabled: !canCreateShotLab,
      run: canCreateShotLab ? () => runRememberedAction('Create local ShotLab handoff packet', selectedTitle, actions.createShotLabHandoffPacket) : undefined,
    },
    {
      id: 'seo',
      label: 'SEO',
      ready: Boolean(roomState.seoPacket),
      value: roomState.seoPacket ? `${roomState.seoPacket.tagCandidates.length} tags` : 'metrics locked',
      action: 'Write SEO',
      disabled: !canCreateSeo,
      run: canCreateSeo ? () => runRememberedAction('Create local SEO packet', selectedTitle, actions.createSeoPacket) : undefined,
    },
    {
      id: 'draft',
      label: 'Draft',
      ready: Boolean(roomState.draftPayload || roomState.approvalPacket),
      value: roomState.approvalPacket ? 'approval' : roomState.draftPayload ? 'ready' : 'local only',
      action: canRequestApproval ? 'Ask approval' : 'Make draft',
      disabled: canRequestApproval ? false : !canCreateDraft,
      run: canRequestApproval
        ? () => runRememberedAction('Request local DLV approval packet', draftTitle, actions.createDraftApprovalPacket)
        : canCreateDraft
          ? () => runRememberedAction('Create local draft preview', draftTitle, actions.createDraftPayload)
          : undefined,
    },
  ]
  const readinessPercent = clampPercent(
    (roomState.approvalPacket ? 100 : roomState.draftPayload ? 86 : roomState.seoPacket ? 72 : roomState.shotLabHandoffPacket ? 56 : roomState.selectedProductPacket ? 38 : productCards.length ? 22 : 8)
      - Math.min(28, selectedMissing.length * 4),
  )
  const proofPercent = clampPercent(Math.min(100, selectedEvidence.length * 18 + selectedSources.length * 10))
  const seoPercent = clampPercent(roomState.seoPacket?.metrics.score ?? selectedCandidate?.score ?? 0)
  const demandPercent = clampPercent(selectedCandidate?.score ?? roomState.seoPacket?.metrics.score ?? 0)
  const cockpitMetrics = [
    { id: 'demand', label: 'Demand', value: demandPercent, detail: selectedCandidate ? scoreText(selectedCandidate.score) : 'search first' },
    { id: 'evidence', label: 'Evidence', value: proofPercent, detail: selectedEvidence.length ? `${selectedEvidence.length} evidence` : 'pending' },
    { id: 'seo', label: 'SEO', value: seoPercent, detail: roomState.seoPacket ? `${roomState.seoPacket.tagCandidates.length} tags` : 'not written' },
    { id: 'readiness', label: 'Draft ready', value: readinessPercent, detail: roomState.approvalPacket ? 'approval gate' : roomState.draftPayload ? 'local draft' : 'locked' },
  ]
  const comparisonRows = productCards.slice(0, 4)
  const nextActionState = activeActionDisabled ? 'blocked' : 'ready'
  const pipelineOsSteps = stageSteps.map((stage, index) => {
    const copy = stageWorkbenchCopy(stage.id)
    return {
      id: stage.id,
      label: stage.label,
      status: index < currentStageIndex ? 'done' as const : index === currentStageIndex ? 'active' as const : stage.id === 'approval' ? 'locked' as const : 'waiting' as const,
      value: surfaceCards.find((card) => card.label.toLowerCase().includes(String(stage.label).toLowerCase()))?.value ?? (index < currentStageIndex ? 'done' : index === currentStageIndex ? 'now' : 'next'),
      detail: copy.detail,
      action: stage.id === currentStage ? nextAction.label : undefined,
    }
  })
  const pipelineInputMedia = productCards.slice(0, 6).map((candidate) => ({
    id: candidate.id,
    label: candidate.title,
    meta: `${candidate.dataOrigin} · ${candidate.missingFields.length ? `${candidate.missingFields.length} missing` : 'ready'}`,
    tone: candidate.selected ? 'active' as const : candidate.board ? 'ready' as const : 'waiting' as const,
    selected: candidate.id === selectedCandidate?.id,
    src: undefined,
  }))
  const shotLabOutputLabel = roomState.shotLabHandoffPacket
    ? `${roomState.shotLabHandoffPacket.imageCount} planned ShotLab inputs`
    : `${roomState.shotLabDraft.imageCount} ShotLab slots`
  const pipelineOutputMedia = [
    {
      id: 'shotlab-brief',
      label: shotLabOutputLabel,
      meta: roomState.shotLabHandoffPacket ? `${roomState.shotLabHandoffPacket.preset} · local handoff ready` : 'choose product, filter images, then create local handoff',
      tone: roomState.shotLabHandoffPacket ? 'ready' as const : canCreateShotLab ? 'waiting' as const : 'locked' as const,
      src: ETSY_PREP_WINDOW_ASSETS.shotlab.src,
    },
    {
      id: 'shotlab-output-review',
      label: 'ShotLab output review',
      meta: 'generated images appear here only after an approved/connected ShotLab run',
      tone: 'locked' as const,
      src: undefined,
    },
    {
      id: 'seo-packet',
      label: 'SEO packet',
      meta: roomState.seoPacket ? `${roomState.seoPacket.tagCandidates.length} tags · score ${scoreText(roomState.seoPacket.metrics.score)}` : 'not written yet',
      tone: roomState.seoPacket ? 'ready' as const : canCreateSeo ? 'waiting' as const : 'locked' as const,
      src: ETSY_PREP_WINDOW_ASSETS.seo.src,
    },
    {
      id: 'draft-approval',
      label: 'Draft / approval',
      meta: roomState.approvalPacket ? 'approval packet waiting' : roomState.draftPayload ? 'draft payload ready' : 'locked until SEO exists',
      tone: roomState.approvalPacket ? 'active' as const : roomState.draftPayload ? 'ready' as const : 'locked' as const,
      src: ETSY_PREP_WINDOW_ASSETS.approval.src,
    },
  ]

  return (
    <section
      className="etsy-prep etsy-prep--visual-board"
      data-product-prep-workbench="v1"
      data-workbench-mode="visual-receiving-board"
      data-etsy-studio-layout="image-first"
      data-etsy-library-pass="v3-oracle-split"
      data-etsy-station-redesign="v3"
      data-component-source="oracle-to-etsy-image-board"
      data-etsy-live-room="v1"
      data-current-prep-stage={currentStage}
      data-active-tool-id={activeToolId}
      data-etsy-live-scout-status={liveScout.status}
      data-etsy-product-board-state={boardState}
      data-live-actions-locked="true"
      data-live-actions-allowed="false"
      data-worker-fanout-allowed="false"
    >
      <section className="etsy-prep__visual-hero" data-product-search-surface="moved-to-oracle" data-oracle-search-required="true">
        <div className="etsy-prep__oracle-gate-visual" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="etsy-prep__visual-hero-copy">
          <p>ETSY MARKET LAB</p>
          <h2>{productCards.length ? `${productCards.length} product card${productCards.length === 1 ? '' : 's'}` : 'Waiting for Oracle products'}</h2>
          <span>{oracleSignalLabel || 'Search text lives in Oracle. Etsy only receives visual product cards.'}</span>
        </div>
        <div className="etsy-prep__visual-hero-actions">
          <button type="button" disabled>Search in Oracle</button>
          {actions.resetPipeline && <button type="button" onClick={actions.resetPipeline}>Reset board</button>}
        </div>
      </section>

      {roomState.researchMissionPacket && (
        <section className="etsy-prep__research-handoff" data-research-mission-handoff="staged" role="status">
          <div>
            <p>RESEARCH MISSION STAGED</p>
            <h3><bdi dir="auto">{roomState.researchMissionPacket.target}</bdi></h3>
            <span>
              {roomState.researchMissionPacket.depth} · {roomState.researchMissionPacket.modules.length} modules · External research not started
            </span>
          </div>
          <div>
            <b><bdi dir="ltr">{roomState.researchMissionPacket.missionId}</bdi></b>
            <small>Saved locally · review before any external run</small>
          </div>
        </section>
      )}

      <section className="etsy-prep__cockpit" data-etsy-product-prep-cockpit="v1" aria-label="Etsy Product Prep Cockpit">
        <article className="etsy-prep__cockpit-artifact" data-etsy-active-artifact={selectedCandidate ? 'product' : 'empty'}>
          <div className="etsy-prep__cockpit-artifact-media">
            {selectedCandidate ? <LocalProductThumb title={selectedTitle} origin={selectedOrigin} /> : <WindowAssetBadge asset={ETSY_PREP_WINDOW_ASSETS.search} />}
            <span>{supplierGateLabel}</span>
          </div>
          <div>
            <p>Active product artifact</p>
            <h2>{selectedCandidate ? selectedTitle : 'No product selected'}</h2>
            <span>{selectedCandidate ? `${selectedCandidate.niche} · ${selectedOrigin}` : 'Run search, then pick one product before ShotLab/SEO/draft.'}</span>
          </div>
          <div className="etsy-prep__cockpit-locks">
            <span>DB/readback only</span>
            <span>No Etsy upload</span>
            <span>No supplier send</span>
          </div>
        </article>

        <article className="etsy-prep__next-action" data-etsy-next-action={nextActionState}>
          <p>Next best action</p>
          <h3>{nextAction.label}</h3>
          <span>{activeStatus}</span>
          <button type="button" disabled={activeActionDisabled || !nextAction.run} onClick={() => nextAction.run?.()}>
            {nextAction.label}
          </button>
          <small>{activeStageCopy.title}</small>
        </article>

        <div className="etsy-prep__metric-radar" data-etsy-readiness-radar="v1" aria-label="Demand proof SEO readiness radar">
          {cockpitMetrics.map((metric) => (
            <article key={metric.id} data-metric-tone={metricTone(metric.value)}>
              <div className="etsy-prep__metric-dial" style={styleVars({ '--prep-metric': `${metric.value}%` })}>
                <b>{metric.value}</b>
              </div>
              <span>{metric.label}</span>
              <small>{metric.detail}</small>
            </article>
          ))}
        </div>

        <div className="etsy-prep__comparison-table" data-etsy-candidate-comparison="v1" aria-label="Candidate comparison table">
          <div className="etsy-prep__comparison-head">
            <b>Candidate comparison</b>
            <span>{comparisonRows.length ? `${comparisonRows.length} visible` : 'waiting for search'}</span>
          </div>
          {comparisonRows.length ? comparisonRows.map((candidate) => {
            const rowProof = clampPercent(Math.min(100, candidate.evidenceCount * 22))
            const rowScore = clampPercent(candidate.score ?? 0)
            return (
              <button key={candidate.id} type="button" className={candidate.id === selectedCandidate?.id ? 'is-selected' : ''} onClick={() => setFocusedCandidateId(candidate.id)}>
                <span>{candidate.title}</span>
                <b>{scoreText(candidate.score)}</b>
                <em style={styleVars({ '--prep-row-score': `${rowScore}%`, '--prep-row-proof': `${rowProof}%` })} />
                <small>{candidate.missingFields.length ? `${candidate.missingFields.length} missing` : 'clean'}</small>
              </button>
            )
          }) : (
            <p>Search in Oracle first. No mock products are displayed.</p>
          )}
        </div>
      </section>

      <WorkspacePipelineWorkbench
        id="etsy-product-prep"
        eyebrow="Pipeline OS · Etsy"
        title="Research → ShotLab → SEO → Draft"
        subtitle="A teachable board: choose products, see source media, review ShotLab inputs/outputs, filter packets, then move only approved work forward."
        activeArtifact={{
          label: 'Active pipeline item',
          title: selectedCandidate ? selectedTitle : 'No product selected',
          meta: selectedCandidate ? `${selectedCandidate.niche} · ${selectedOrigin}` : 'Start in Oracle/search, then choose one product.',
          emptyLabel: 'ETSY',
        }}
        steps={pipelineOsSteps}
        inputMedia={pipelineInputMedia}
        outputMedia={pipelineOutputMedia}
        filters={[
          { id: 'visible-products', label: 'Products', value: productCards.length, active: Boolean(productCards.length) },
          { id: 'selected-proof', label: 'Evidence', value: selectedEvidence.length, active: Boolean(selectedEvidence.length) },
          { id: 'missing-fields', label: 'Missing', value: selectedMissing.length, active: selectedMissing.length === 0 },
          { id: 'shotlab-state', label: 'ShotLab', value: roomState.shotLabHandoffPacket ? 'ready' : 'not yet', active: Boolean(roomState.shotLabHandoffPacket) },
        ]}
        actions={[
          { id: 'choose-product', label: selectedCandidate ? 'Choose product' : 'Find product', detail: selectedCandidate ? selectedTitle : 'Search first', disabled: !selectedCandidate, onClick: selectedCandidate ? () => runRememberedAction('Choose candidate', selectedCandidate.title, () => actions.selectCandidate(selectedCandidate.id)) : undefined },
          { id: 'plan-shotlab', label: 'Plan ShotLab', detail: roomState.shotLabHandoffPacket ? 'handoff ready' : 'source images only', disabled: !canCreateShotLab, onClick: canCreateShotLab ? () => runRememberedAction('Create local ShotLab handoff packet', selectedTitle, actions.createShotLabHandoffPacket) : undefined },
          { id: 'write-seo', label: 'Write SEO', detail: roomState.seoPacket ? `${roomState.seoPacket.tagCandidates.length} tags` : 'after product truth', disabled: !canCreateSeo, onClick: canCreateSeo ? () => runRememberedAction('Create local SEO packet', selectedTitle, actions.createSeoPacket) : undefined },
          { id: 'request-approval', label: 'Approval gate', detail: roomState.approvalPacket ? 'waiting for DLV' : 'local only', disabled: !canRequestApproval, onClick: canRequestApproval ? () => runRememberedAction('Request local DLV approval packet', draftTitle, actions.createDraftApprovalPacket) : undefined },
        ]}
        locks={['No Etsy publish', 'No supplier send', 'No paid ShotLab generation', 'No live sheet write']}
        readback={<span>Scout: {roomState.scoutPacket?.packetId ?? pipeline.searchPacket?.packetId ?? 'none'} · Selected: {roomState.selectedProductPacket?.packetId ?? 'none'} · ShotLab: {roomState.shotLabHandoffPacket?.packetId ?? 'none'} · SEO: {roomState.seoPacket?.packetId ?? 'none'} · Draft: {roomState.draftPayload?.packetId ?? 'none'}</span>}
        accent="#8c5bd6"
      />

      <section className="etsy-prep__command-center" data-etsy-product-command-center="v1" aria-label="Product search to draft command center">
        <div className="etsy-prep__command-center-header">
          <div>
            <p>3-second status</p>
            <h3>{selectedCandidate ? selectedTitle : 'Search → Supplier filter → Draft'}</h3>
          </div>
          <span data-gate-state={supplierGateState}>{supplierGateLabel}</span>
        </div>
        <div className="etsy-prep__table-access" aria-label="Supplier and product approval tables">
          <div className="etsy-prep__table-access-title">
            <b>Tables</b>
            <span>Open/edit here. Writes still require your manual action.</span>
          </div>
          {supplierTableLinks.map((link) => (
            <a
              key={link.id}
              href={link.href}
              target={link.href.startsWith('http') ? '_blank' : undefined}
              rel={link.href.startsWith('http') ? 'noreferrer' : undefined}
              data-table-link={link.id}
            >
              <strong>{link.label}</strong>
              <small>{link.status}</small>
              <span>{link.note}</span>
            </a>
          ))}
        </div>
        <div className="etsy-prep__command-steps">
          {commandCenterSteps.map((step) => (
            <article key={step.id} data-step-tone={step.tone}>
              <small>{step.label}</small>
              <b>{step.status}</b>
              <span>{step.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="etsy-prep__product-heart" data-candidate-board="v1" aria-label="Etsy visual product receiving board">
        <div className="etsy-prep__board-orbit" aria-hidden="true" />
        <div className="etsy-prep__board-center">
          {productCards.length ? (
            <>
              {visibleProductCards.map((candidate, index) => (
            <article
              key={candidate.id}
              className={`etsy-prep__visual-product-card ${candidate.selected ? 'is-selected' : ''} ${candidate.board ? 'is-boarded' : ''}`}
              data-product-card-index={index + 1}
              data-product-card-origin={candidate.dataOrigin}
              data-etsy-live-candidate-id={candidate.dataOrigin === 'live-readonly-research' ? candidate.id : undefined}
              data-etsy-live-data-origin={candidate.dataOrigin === 'live-readonly-research' ? 'live-readonly-research' : undefined}
              data-workspace-kernel-artifact={candidate.dataOrigin === 'live-readonly-research' ? 'live-product-candidate-packet' : undefined}
            >
              <LocalProductThumb title={candidate.title} origin={candidate.dataOrigin} />
              <div className="etsy-prep__visual-product-overlay">
                <span>{candidate.dataOrigin === 'oracle-local-alura' ? 'Oracle' : candidate.dataOrigin}</span>
                <h3>{candidate.title}</h3>
                <div className="etsy-prep__visual-metrics">
                  <b>{scoreText(candidate.score)}</b>
                  <small>score</small>
                  <b>{candidate.evidenceCount}</b>
                  <small>proof</small>
                </div>
              </div>
              <div className="etsy-prep__visual-card-actions">
                <button type="button" onClick={() => runRememberedAction(candidate.board ? 'Shortlisted candidate' : 'Shortlist candidate', candidate.title, () => actions.addCandidateToVisualBoard(candidate.id))}>
                  {candidate.board ? 'Shortlisted' : 'Shortlist'}
                </button>
                <button type="button" onClick={() => { setFocusedCandidateId(candidate.id); runRememberedAction('Choose candidate', candidate.title, () => actions.selectCandidate(candidate.id)) }}>
                  Choose
                </button>
                <button type="button" onClick={() => runRememberedAction(candidate.rejected ? 'Rejected candidate' : 'Reject candidate', candidate.title, () => actions.rejectCandidate(candidate.id))}>
                  Reject
                </button>
              </div>
              <details className="etsy-prep__card-proof">
                <summary>proof</summary>
                <span>{candidate.niche}</span>
                <span>{readinessLabel(candidate.missingFields.length, candidate.evidenceCount)}</span>
                <span>{compactList(candidate.sourceRecordIds, 'source pending', 2).join(' · ')}</span>
              </details>
            </article>
              ))}
              {hiddenProductCardCount > 0 && (
                <div className="etsy-prep__visual-product-card etsy-prep__visual-product-card--more" data-hidden-product-card-count={hiddenProductCardCount}>
                  <b>+{hiddenProductCardCount}</b>
                  <span>more candidates kept off-DOM</span>
                  <small>Use filters/search to narrow before rendering more cards.</small>
                </div>
              )}
            </>
          ) : (
            <div className="etsy-prep__empty-gallery" data-empty-product-board="oracle-required">
              <div className="etsy-prep__empty-gallery-art" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <b>Oracle → product cards → Etsy</b>
              <small>No local mock products are shown here.</small>
            </div>
          )}
        </div>
      </section>

      <section className="etsy-prep__station-portals" data-etsy-visual-surfaces="v1" aria-label="Etsy production gates">
        {nextVisualSteps.map((step) => (
          <article
            key={step.id}
            className={`etsy-prep__portal-card etsy-prep__portal-card--${step.id} ${step.ready ? 'is-ready' : ''}`}
            data-product-dossier={step.id === 'truth' ? 'v1' : undefined}
            data-shotlab-prep-board={step.id === 'shotlab' ? 'v1' : undefined}
            data-seo-workbench={step.id === 'seo' ? 'v1' : undefined}
            data-approval-console={step.id === 'draft' ? 'v1' : undefined}
          >
            <div className="etsy-prep__portal-art" aria-hidden="true">
              <span />
              <i />
            </div>
            <div>
              <p>{step.label}</p>
              <h3>{step.value}</h3>
            </div>
            <button type="button" disabled={step.disabled || !step.run} onClick={() => step.run && step.run()}>
              {step.action}
            </button>
          </article>
        ))}
      </section>

      {liveScout.status !== 'idle' && (
        <div
          className={`etsy-prep__live-status ${liveBlocked ? 'is-blocked' : ''}`}
          data-workspace-kernel-artifact="live-product-candidate-packet"
          data-live-actions-allowed="false"
          data-worker-fanout-allowed="false"
        >
          <b>Live read-only connector</b>
          <span>{liveBlocked ? liveScout.error ?? liveScout.receipt ?? 'Connector blocked.' : `Status: ${liveScout.status}`}</span>
        </div>
      )}

      <details
        className="etsy-prep__debug etsy-prep__proof-drawer"
        data-debug-proof-collapsed={debugOpen ? 'false' : 'true'}
        onToggle={(event) => setDebugOpen(event.currentTarget.open)}
      >
        <summary>Readback / packets</summary>
        {debugOpen ? (
          <div className="etsy-prep__debug-grid">
            <div>
              <b>Selected</b>
              <span>{selectedTitle}</span>
              <span>{selectedOrigin}</span>
            </div>
            <div>
              <b>Source proof</b>
              <span>{selectedSources.length ? selectedSources.slice(0, 4).join(', ') : 'source proof pending'}</span>
              <span>{selectedEvidence.length ? selectedEvidence.slice(0, 4).join(', ') : 'evidence IDs pending'}</span>
            </div>
            <div>
              <b>Packets</b>
              <span>Scout: {roomState.scoutPacket?.packetId ?? pipeline.searchPacket?.packetId ?? 'none'}</span>
              <span>Selected: {roomState.selectedProductPacket?.packetId ?? 'none'}</span>
              <span>ShotLab: {roomState.shotLabHandoffPacket?.packetId ?? 'none'}</span>
              <span>SEO: {roomState.seoPacket?.packetId ?? 'none'}</span>
              <span>Draft: {roomState.draftPayload?.packetId ?? 'none'}</span>
            </div>
            <div>
              <b>Safety</b>
              <span>liveActionsAllowed:false</span>
              <span>workerFanoutAllowed:false</span>
              <span>mockProductsShown:false</span>
            </div>
          </div>
        ) : null}
      </details>
    </section>
  )
}
