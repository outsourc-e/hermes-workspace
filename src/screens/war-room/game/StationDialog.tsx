import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {   archiveCollectionsForRoom, archiveRecordsForRoom, archiveRecordsForStation, warRoomOpsState } from './ops-model'
import type {WarRoomArchiveCollection, WarRoomArchiveRecord} from './ops-model';
import type { WarRoomActionPermission, WarRoomApprovalGate, WarRoomDesignNorthStar, WarRoomWorkflowPacket } from './ops-contracts'
import type { DialogLayout, OlympusStation } from './types'

export type StationLiveFeedItem = {
  id: string
  title: string
  subtitle?: string
  state?: string
  summary?: string
  updatedAt?: number | string | null
}

type StationDialogProps = {
  station: OlympusStation
  roomId: string
  layout: DialogLayout
  liveFeed?: Array<StationLiveFeedItem>
  liveLinks?: Array<{ label: string; href: string }>
  sourceLine?: string
  godAdvisor?: {
    name: string
    rolePrompt: string
    suggestions: Array<{ tone: 'next' | 'review' | 'safe' | 'learn'; text: string }>
  } | null
  workflowSteps?: Array<{
    id: string
    order: number
    title: string
    shortLabel: string
    state: string
    owner: string
    summary: string
  }>
  workflowPackets?: Array<WarRoomWorkflowPacket>
  focusedWorkflowPacket?: WarRoomWorkflowPacket | null
  actionPermissions?: Array<WarRoomActionPermission>
  approvalGates?: Array<WarRoomApprovalGate>
  designNorthStar?: WarRoomDesignNorthStar | null
  onClose: () => void
}

type WarRoomKnowledgeRouteRecord = WarRoomArchiveRecord & {
  relevance?: number
  reason?: string
}

type WarRoomKnowledgeRouteData = {
  ok?: boolean
  error?: string
  routerName?: string
  mode?: string
  databaseName?: string
  records?: Array<WarRoomKnowledgeRouteRecord>
  workflowPacket?: {
    id: string
    sourceRoomId: string
    targetRoomId: string
    stationId: string
    title: string
    state: string
    artifactType: string
    input: string
    output: string
    risk: string
    nextHandoff: string
    ownerWorkerId: string
    lockedActions: Array<string>
    sourceRecordIds?: Array<string>
  }
  handoff?: {
    summary?: string
    nextUses?: Array<string>
    lockedActions?: Array<string>
    allowedNow?: Array<string>
    lockedUntilApproved?: Array<string>
  }
  generatedAt?: string
}

type KnowledgeRouterContextValue = {
  route: WarRoomKnowledgeRouteData | null
  loading: boolean
  error: string | null
  focusedPacket: WarRoomWorkflowPacket | null
}

const KnowledgeRouterContext = createContext<KnowledgeRouterContextValue>({ route: null, loading: false, error: null, focusedPacket: null })

type ShellProps = {
  station: OlympusStation
  appName: string
  tag: string
  accent: string
  onClose: () => void
  children: React.ReactNode
  data: string
  showKnowledgeRouter?: boolean
  compactHeader?: boolean
}

const panel = 'rounded-[30px] border border-white/12 bg-black/42 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_22px_60px_rgba(0,0,0,.28)]'
const toolPanel = `${panel} relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/35 before:to-transparent`
const tinyLabel = 'text-[10px] font-black uppercase tracking-[.28em] text-white/50'
const primaryButton = 'rounded-full px-4 py-3 text-[11px] font-black uppercase tracking-[.16em] transition active:scale-[.98]'

const archiveApps = [
  { id: 'brief', asset: '/war-room/vNext/forge/stations/layered/prompt-anvil-pro.png', name: 'Brief Builder', hint: 'structured brief', body: 'Source idea, buyer, constraints.' },
  { id: 'variants', asset: '/war-room/vNext/stations/agora/niche-scroll-rack.png', name: 'Variant Lab', hint: 'prompt angles', body: 'Variants, photo plan, safe wording.' },
  { id: 'locks', asset: '/war-room/vNext/forge/stations/layered/approval-shrine-pro.png', name: 'Safety Locks', hint: 'blocked actions', body: 'Publish, paid generation, supplier messages locked.' },
  { id: 'handoff', asset: '/war-room/vNext/stations/atlantis-vault/crystal-archive.png', name: 'Approval Packet', hint: 'archive handoff', body: 'Local packet waits for DLV approval.' },
]

const promptAnvilAssets = {
  frame: '/war-room/vNext/ui/chatgpt-prompt-anvil-workbench-frame.png?v=chatgpt-frame-1',
  anvil: '/war-room/vNext/forge/stations/layered/prompt-anvil-pro.png?v=chatgpt-prop-1',
  archive: '/war-room/vNext/stations/atlantis-vault/crystal-archive.png?v=chatgpt-archive-1',
  approval: '/war-room/vNext/forge/stations/layered/approval-shrine-pro.png?v=chatgpt-shrine-1',
  plaque: '/war-room/vNext/ui/station-label-plaque.png?v=chatgpt-plaque-1',
}

const theoreticalIntegrationLocks = [
  { id: 'etsy', name: 'Etsy bridge', state: 'sealed mock', detail: 'preview copy, SEO, images, variations — no publish/edit/renew/order/message API' },
  { id: 'alura', name: 'Alura signals', state: 'theory feed', detail: 'candidate scoring and keyword assumptions only; not a live paid scrape or account session' },
  { id: 'shop', name: 'Shop actions', state: 'DLV gate', detail: 'pricing, inventory, ads, supplier contact, spend, refunds, and account settings stay disabled' },
]

const skillFiles = [
  { icon: '▣', name: 'Prompt Anvil.md', type: 'prompt app', status: 'needs backup before edit' },
  { icon: '▧', name: 'SEO DB Rules.md', type: 'database rules', status: 'read-only loaded' },
  { icon: '◫', name: 'Etsy Safety Gate.md', type: 'approval lock', status: 'protected' },
  { icon: '▤', name: 'Supplier Verification.md', type: 'workflow', status: 'missing proof review' },
]

const approvalPackets = [
  { id: 'seo', title: 'SEO wording packet', risk: 'low', state: 'review', action: 'approve draft wording' },
  { id: 'supplier', title: 'Supplier proof gap', risk: 'medium', state: 'hold', action: 'request proof first' },
  { id: 'publish', title: 'Etsy publish action', risk: 'blocked', state: 'locked', action: 'requires explicit DLV approval' },
]

const rankingItems = [
  { label: 'Finished product fit', score: 88, lane: 'winner', color: 'from-lime-300 to-emerald-200' },
  { label: 'SEO opportunity', score: 74, lane: 'maybe', color: 'from-yellow-200 to-orange-200' },
  { label: 'Supplier proof', score: 41, lane: 'gap', color: 'from-sky-200 to-cyan-200' },
  { label: 'False-claim risk', score: 18, lane: 'reject', color: 'from-rose-300 to-red-200' },
]

function improvedPromptFrom(input: string) {
  const clean = input.trim() || 'Describe the task, target audience, constraints, output format, and safety locks.'
  return [
    'ROLE: You are Hermes Workspace creative/operator assistant.',
    `TASK: ${clean}`,
    'ASK FIRST IF MISSING: product family, shop, target buyer, source links, exact materials, image count, approval owner.',
    'OUTPUT: short brief; improved production prompt; 3 variants; risks/blocked actions; one approval question for DLV.',
    'SAFETY: draft-only. Do not publish, buy, message suppliers, claim unknown materials, or spend money without explicit approval.',
  ].join('\n')
}

function KnowledgeRouterStrip() {
  const { route, loading, error, focusedPacket } = useContext(KnowledgeRouterContext)
  const records = route?.records?.slice(0, 3) ?? []
  const packet = focusedPacket ?? route?.workflowPacket
  const statusLine = focusedPacket ? 'Opened from Atlantis packet' : loading ? 'Routing…' : error ? 'Router error' : `${records.length} DB links ready`
  const shortGate = packet?.lockedActions[0] ?? 'External actions locked'
  return (
    <div className="mt-3 rounded-[20px] border border-cyan-100/14 bg-cyan-300/[.045] px-3 py-2" data-atlantis-knowledge-router-strip="true">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-100/60">Atlantis DB</span>
          <span className="truncate text-[11px] font-black text-cyan-50">{statusLine}</span>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-100/16 bg-emerald-300/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[.14em] text-emerald-50">read-only</span>
      </div>
      {packet ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[16px] border border-amber-100/14 bg-amber-300/[.055] px-2.5 py-2" data-atlantis-live-workflow-packet="true" data-focused-workflow-packet={focusedPacket ? packet.id : undefined}>
          <span className="rounded-full bg-amber-200 px-2.5 py-1 text-[8px] font-black uppercase tracking-[.14em] text-black">{focusedPacket ? 'opened packet' : 'packet'}</span>
          <span className="max-w-[360px] truncate text-[11px] font-black text-white" title={packet.title}>{packet.title}</span>
          <span className="rounded-full border border-white/12 bg-black/24 px-2 py-1 text-[8px] font-black uppercase tracking-[.1em] text-amber-50">{packet.state}</span>
          <span className="max-w-[260px] truncate text-[10px] font-bold text-rose-50/82" title={packet.risk}>Gate: {shortGate}</span>
          <span className="max-w-[320px] truncate rounded-full border border-cyan-100/14 bg-black/24 px-2 py-1 text-[8px] font-black uppercase tracking-[.08em] text-cyan-50" title={`${packet.sourceRoomId} → ${packet.targetRoomId} • ${packet.ownerWorkerId}`}>{packet.sourceRoomId} → {packet.targetRoomId} • {packet.ownerWorkerId}</span>
          {records.length ? records.map((record) => (
            <span key={record.id} className="max-w-[190px] truncate rounded-full border border-cyan-100/14 bg-black/24 px-2 py-1 text-[8px] font-black uppercase tracking-[.08em] text-cyan-50" title={record.title}>{record.title}</span>
          )) : null}
        </div>
      ) : null}
    </div>
  )
}

function focusedPacketPreviewLabel(packet: WarRoomWorkflowPacket) {
  const labels: Record<WarRoomWorkflowPacket['artifactType'], { title: string; action: string }> = {
    opportunity: { title: 'Opportunity card preview', action: 'Send to Agora review' },
    keyword: { title: 'Keyword / SEO cluster preview', action: 'Attach to listing draft' },
    'supplier-proof': { title: 'Supplier proof packet preview', action: 'Hold until proof is strong' },
    draft: { title: 'Draft artifact preview', action: 'Prepare local draft only' },
    approval: { title: 'Approval decision card preview', action: 'DLV approve / hold / reject' },
    archive: { title: 'Evidence archive record preview', action: 'Seal read-only record' },
  }
  return labels[packet.artifactType]
}

function FocusedPacketOutputPreview() {
  const { focusedPacket } = useContext(KnowledgeRouterContext)
  if (!focusedPacket) return null
  const preview = focusedPacketPreviewLabel(focusedPacket)
  return (
    <section className="mt-2 grid gap-2 rounded-[18px] border border-violet-100/16 bg-violet-300/[.055] p-3 md:grid-cols-[1.1fr_1fr_auto]" data-station-output-preview="true" data-output-artifact-type={focusedPacket.artifactType}>
      <div className="min-w-0">
        <div className="text-[8px] font-black uppercase tracking-[.22em] text-violet-100/62">Station output preview</div>
        <div className="mt-1 truncate text-[13px] font-black text-white" title={preview.title}>{preview.title}</div>
        <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-snug text-violet-50/76" title={focusedPacket.output}>{focusedPacket.output}</p>
      </div>
      <div className="min-w-0 rounded-[14px] border border-white/10 bg-black/22 px-3 py-2">
        <div className="text-[8px] font-black uppercase tracking-[.18em] text-white/42">next handoff</div>
        <div className="mt-1 truncate text-[11px] font-black text-cyan-50" title={focusedPacket.nextHandoff}>{focusedPacket.nextHandoff}</div>
        <div className="mt-1 truncate text-[10px] font-semibold text-white/54" title={focusedPacket.input}>Input: {focusedPacket.input}</div>
      </div>
      <div className="flex min-w-[180px] flex-col justify-center gap-1 rounded-[14px] border border-rose-100/14 bg-rose-400/10 px-3 py-2">
        <div className="text-[8px] font-black uppercase tracking-[.18em] text-rose-100/62">locked</div>
        <div className="truncate text-[10px] font-black uppercase tracking-[.08em] text-rose-50" title={focusedPacket.lockedActions.join(' • ')}>{focusedPacket.lockedActions[0] ?? 'external actions locked'}</div>
        <div className="text-[9px] font-black uppercase tracking-[.10em] text-emerald-50/70">{preview.action}</div>
      </div>
    </section>
  )
}

function LockedIntegrationStrip({ station }: { station: OlympusStation }) {
  const relevant = station.kind === 'listing' || station.kind === 'supplier' || station.kind === 'signals' || station.kind === 'finance' || station.kind === 'approval'
  const lead = relevant
    ? `${station.name} can simulate the business handoff, but every external connector is intentionally sealed.`
    : 'Station cockpit is local/read-only; business bridges remain theoretical until DLV explicitly approves a real connection.'
  return (
    <section className="mt-2 rounded-[22px] border border-rose-100/16 bg-[linear-gradient(135deg,rgba(244,63,94,.13),rgba(251,191,36,.055),rgba(14,165,233,.06))] p-2.5 shadow-[inset_0_0_34px_rgba(244,63,94,.04)]" data-jarvis-theoretical-integration-locks="true">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[8px] font-black uppercase tracking-[.24em] text-rose-100/62">JARVIS theoretical integration guard</div>
          <p className="mt-0.5 truncate text-[11px] font-bold text-rose-50/82" title={lead}>{lead}</p>
        </div>
        <span className="rounded-full border border-rose-100/22 bg-rose-500/14 px-3 py-1.5 text-[8px] font-black uppercase tracking-[.16em] text-rose-50">not connected</span>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        {theoreticalIntegrationLocks.map((lock) => (
          <div key={lock.id} className="rounded-[16px] border border-white/10 bg-black/28 px-3 py-2" data-locked-theory-bridge={lock.id}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[10px] font-black uppercase tracking-[.12em] text-white/78">{lock.name}</span>
              <span className="shrink-0 rounded-full bg-black/38 px-2 py-0.5 text-[7px] font-black uppercase tracking-[.10em] text-amber-100/82">{lock.state}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[9px] font-semibold leading-snug text-white/48" title={lock.detail}>{lock.detail}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function AppShell({ station, appName, tag, accent, onClose, children, data, showKnowledgeRouter = true, compactHeader = false }: ShellProps) {
  const { focusedPacket } = useContext(KnowledgeRouterContext)
  return (
    <div className="fixed inset-0 isolate z-[200] flex items-center justify-center px-2 py-2 md:px-3" data-war-room-station-dialog={station.id}>
      <button aria-label={`Close ${station.name} backdrop`} className="absolute inset-0 bg-[#010206]/94 backdrop-blur-[10px]" onClick={onClose} type="button" />
      <section
        className="relative h-[calc(100dvh-18px)] max-h-[860px] w-[min(98vw,1480px)] overflow-hidden rounded-[34px] border border-white/16 bg-[#02070d] text-white shadow-[0_34px_140px_rgba(0,0,0,.9),inset_0_0_120px_rgba(255,255,255,.05)]"
        data-station-app={data}
        dir="ltr"
      >
        <div className={`pointer-events-none absolute inset-0 ${accent}`} />
        <div className="pointer-events-none absolute inset-0 opacity-[.22] [background-image:linear-gradient(rgba(255,255,255,.17)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.10)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(255,255,255,.22),transparent_24%),linear-gradient(180deg,rgba(255,255,255,.06),transparent_20%,rgba(0,0,0,.42))]" />
        <div className="pointer-events-none absolute inset-3 rounded-[32px] border border-white/10" />
        <button
          aria-label={`Close ${station.name}`}
          className="absolute right-5 top-5 z-40 grid h-11 w-11 place-items-center rounded-[18px] border border-white/22 bg-black/52 text-[18px] font-black text-white shadow-[0_12px_30px_rgba(0,0,0,.35)] transition hover:bg-white hover:text-black"
          onClick={onClose}
          type="button"
        >
          ✕
        </button>
        <div className="relative z-10 flex h-full min-h-0 flex-col p-3 md:p-4">
          <header className="shrink-0 border-b border-white/12 pb-2 pr-14">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[.34em] text-white/55">{tag}</div>
                <h2 className="mt-1 truncate text-[clamp(25px,3vw,48px)] font-black uppercase leading-none tracking-[-.055em]">{appName}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[10px] font-black uppercase tracking-[.16em]">
                <span className="rounded-full bg-emerald-300 px-3 py-1.5 text-black shadow-[0_0_28px_rgba(110,231,183,.28)]">local</span>
                <span className="rounded-full border border-rose-200/20 bg-rose-400/10 px-3 py-1.5 text-rose-100">external locked</span>
                <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-white/68">DLV gate</span>
              </div>
            </div>
            {!compactHeader && (showKnowledgeRouter || focusedPacket) ? <KnowledgeRouterStrip /> : null}
            {!compactHeader ? <FocusedPacketOutputPreview /> : null}
            <LockedIntegrationStrip station={station} />
          </header>
          {children}
        </div>
      </section>
    </div>
  )
}

export function SkillForgeManager() {
  return <SkillsForgeSurface embedded />
}

function SkillsForgeSurface({ embedded = false }: { embedded?: boolean }) {
  const [selected, setSelected] = useState(skillFiles[0])
  const body = (
    <div className="grid min-h-0 flex-1 gap-4 pt-4 lg:grid-cols-[310px_1fr_310px]" data-skills-file-app="true">
      <section className={`${toolPanel} min-h-0 overflow-auto p-4`}>
        <div className={tinyLabel}>file cabinet</div>
        <div className="mt-4 space-y-3">
          {skillFiles.map((file) => (
            <button
              key={file.name}
              type="button"
              onClick={() => setSelected(file)}
              className={`group flex w-full items-center gap-3 rounded-[24px] border p-3 text-left transition ${selected.name === file.name ? 'border-emerald-200/55 bg-emerald-200/16 shadow-[0_0_34px_rgba(52,211,153,.16)]' : 'border-white/10 bg-white/[.045] hover:border-emerald-100/30 hover:bg-white/10'}`}
              aria-label={`Open skill file ${file.name}`}
            >
              <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-gradient-to-br from-emerald-200 to-teal-300 text-2xl text-black shadow-[0_0_22px_rgba(52,211,153,.24)]">{file.icon}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-black">{file.name}</span><span className="block text-[11px] font-semibold text-white/52">{file.type}</span></span>
            </button>
          ))}
        </div>
      </section>
      <section className={`${toolPanel} grid min-h-0 grid-rows-[auto_1fr_auto] bg-[#03110f]/88 p-5`}>
        <div><div className="text-[10px] font-black uppercase tracking-[.28em] text-emerald-100/58">selected file</div><h3 className="mt-2 text-3xl font-black uppercase tracking-[-.04em]">{selected.name}</h3></div>
        <div className="mt-4 min-h-0 overflow-auto rounded-[24px] border border-emerald-100/14 bg-[#020806]/82 p-5 font-mono text-[13px] font-semibold leading-relaxed text-emerald-50/82 shadow-[inset_0_0_46px_rgba(16,185,129,.06)]">
          # {selected.name}\n\nStatus: {selected.status}\n\nSearch, open, inspect, backup, then edit only behind explicit safety gates. Next pass wires real skill file APIs and backup-before-save.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={`${primaryButton} bg-emerald-200 text-black`}>backup first</button>
          <button className={`${primaryButton} border border-white/15 text-white/75`}>open read-only</button>
          <button className={`${primaryButton} border border-rose-200/20 bg-rose-400/10 text-rose-100`}>delete locked</button>
        </div>
      </section>
      <section className={`${toolPanel} p-4`}>
        <div className={tinyLabel}>chat/context</div>
        <div className="mt-4 space-y-3 text-sm font-semibold text-white/72">
          <p className="rounded-[20px] border border-emerald-100/12 bg-emerald-300/10 p-3">Ask what this skill does, where it is used, or what changed before editing.</p>
          <p className="rounded-[20px] border border-white/10 bg-white/8 p-3">No destructive file action without explicit approval and backup.</p>
        </div>
      </section>
    </div>
  )
  if (embedded) return <div className="h-full rounded-[28px] bg-[#020b09] p-3 text-white">{body}</div>
  return body
}

function PromptStudio({ station, onClose }: { station: OlympusStation; onClose: () => void }) {
  const { route, loading, error, focusedPacket } = useContext(KnowledgeRouterContext)
  const [promptInput, setPromptInput] = useState('כתוב פרומפט למוצר עגילים גוטיים ברקע של מרתף')
  const [selectedFileId, setSelectedFileId] = useState('brief')
  const [chatInput, setChatInput] = useState('')
  const [localChat, setLocalChat] = useState<Array<string>>(['Tell me the product, buyer, and blocked claims. I will forge a local draft only.'])
  const selectedFile = archiveApps.find((file) => file.id === selectedFileId) ?? archiveApps[0]
  const improvedPrompt = useMemo(() => improvedPromptFrom(promptInput), [promptInput])
  const packet = focusedPacket ?? route?.workflowPacket
  const records = route?.records?.slice(0, 2) ?? []
  const dbStatus = loading ? 'routing' : error ? 'review' : `${records.length} links`
  return (
    <AppShell station={station} onClose={onClose} appName="Prompt Anvil" tag="Forge of Hephaestus • generated workbench" data="prompt-studio-os" showKnowledgeRouter={false} accent="bg-[radial-gradient(circle_at_50%_16%,rgba(251,146,60,.22),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(45,212,191,.14),transparent_26%),linear-gradient(135deg,#100703,#03050a_62%,#000)]">
      <main className="grid min-h-0 flex-1 gap-4 pt-4 xl:grid-cols-[96px_minmax(760px,1fr)_310px]" data-prompt-studio-os="true">
        <nav className="flex min-h-0 flex-col items-center gap-3 rounded-[34px] border border-amber-100/12 bg-black/42 px-3 py-4 shadow-[inset_0_0_40px_rgba(251,146,60,.05)]" aria-label="Prompt Anvil generated tools">
          {archiveApps.map((file) => (
            <button key={file.id} type="button" onClick={() => setSelectedFileId(file.id)} className={`group grid h-[74px] w-[74px] place-items-center overflow-hidden rounded-[24px] border transition ${selectedFileId === file.id ? 'border-amber-100/58 bg-amber-200/18 shadow-[0_0_42px_rgba(251,191,36,.26)]' : 'border-white/10 bg-black/36 hover:border-amber-100/28 hover:bg-white/8'}`} aria-label={`Open ${file.name}`}>
              <img src={`${file.asset}?v=prompt-nav-asset-1`} alt="" className="h-16 w-16 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,.55)] transition group-hover:scale-105" />
            </button>
          ))}
        </nav>

        <section className="relative min-h-0 overflow-hidden rounded-[36px] border border-amber-100/16 bg-[#050302] shadow-[0_30px_90px_rgba(0,0,0,.62)]" aria-label="Generated Prompt Anvil workbench">
          <img src={promptAnvilAssets.frame} alt="ChatGPT generated Prompt Anvil workbench frame" className="absolute inset-0 h-full w-full object-cover opacity-95" data-chatgpt-prompt-anvil-frame="true" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(0,0,0,.10),transparent_42%),linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.22))]" />

          <div className="relative z-10 grid h-full grid-rows-[74px_1fr_62px] gap-3 p-5">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]" data-generated-artifact-deck="true">
              <div className="flex items-center gap-2 rounded-[20px] border border-amber-100/10 bg-black/24 p-2 backdrop-blur-[1px]">
                <img src={promptAnvilAssets.archive} alt="Generated Atlantis archive crystal" className="h-14 w-14 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,.55)]" />
                <div className="min-w-0"><div className="text-[8px] font-black uppercase tracking-[.2em] text-cyan-100/54">Atlantis DB</div><div className="truncate text-[14px] font-black text-white">{dbStatus}</div></div>
              </div>
              <div className="flex items-center gap-2 rounded-[20px] border border-amber-100/10 bg-black/24 p-2 backdrop-blur-[1px]">
                <img src={promptAnvilAssets.anvil} alt="Generated Prompt Anvil" className="h-14 w-14 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,.55)]" />
                <div className="min-w-0"><div className="text-[8px] font-black uppercase tracking-[.2em] text-amber-100/58">Packet</div><div className="truncate text-[14px] font-black text-white">{packet?.state ?? 'draft-ready'}</div></div>
              </div>
              <div className="flex items-center gap-2 rounded-[20px] border border-amber-100/10 bg-black/24 p-2 backdrop-blur-[1px]">
                <img src={promptAnvilAssets.approval} alt="Generated approval shrine" className="h-14 w-14 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,.55)]" />
                <div className="min-w-0"><div className="text-[8px] font-black uppercase tracking-[.2em] text-rose-100/58">Gate</div><div className="truncate text-[14px] font-black text-white">{packet?.lockedActions[0] ?? 'external locked'}</div></div>
              </div>
            </div>

            <div className="grid min-h-0 gap-3 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="grid min-h-0 grid-rows-[auto_1fr_auto] gap-2 rounded-[22px] border border-cyan-100/10 bg-black/30 p-4 shadow-[inset_0_0_34px_rgba(34,211,238,.045)]">
                <div><div className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-100/54">Idea Ore</div><div className="text-[18px] font-black">Rough prompt</div></div>
                <textarea value={promptInput} onChange={(event) => setPromptInput(event.target.value)} className="min-h-0 resize-none rounded-[20px] border border-cyan-100/10 bg-black/42 p-4 font-mono text-[14px] font-semibold leading-relaxed text-cyan-50 outline-none focus:border-cyan-200/55" placeholder="כתוב כאן פרומפט גולמי..." aria-label="Rough prompt input" />
                <div className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-50/54">local • {promptInput.trim().length} chars</div>
              </div>

              <div className="grid min-h-0 grid-rows-[auto_1fr_auto] gap-2 rounded-[22px] border border-fuchsia-100/10 bg-black/30 p-4 shadow-[inset_0_0_38px_rgba(217,70,239,.045)]">
                <div className="flex items-center justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[.24em] text-fuchsia-100/54">Prompt Mold</div><div className="text-[20px] font-black uppercase tracking-[-.03em]">Forged draft</div></div><button type="button" onClick={() => navigator.clipboard.writeText(improvedPrompt).catch(() => undefined)} className={`${primaryButton} bg-amber-200 px-5 py-2 text-black`}>copy</button></div>
                <pre className="min-h-0 overflow-auto whitespace-pre-wrap rounded-[20px] border border-fuchsia-100/10 bg-black/42 p-4 font-mono text-[12px] font-semibold leading-relaxed text-fuchsia-50/90">{improvedPrompt}</pre>
                <div className="grid gap-2 sm:grid-cols-2"><button type="button" className={`${primaryButton} bg-fuchsia-200 py-2 text-black`}>save local draft</button><button type="button" className={`${primaryButton} border border-amber-100/18 bg-black/32 py-2 text-amber-50`}>refresh context</button></div>
              </div>
            </div>

            <div className="flex min-h-0 items-center justify-between gap-3 rounded-[20px] border border-amber-100/10 bg-black/30 px-4 py-2 backdrop-blur-[1px]">
              <div className="flex min-w-0 items-center gap-3">
                <img src={promptAnvilAssets.plaque} alt="Generated station plaque" className="h-11 w-20 object-contain opacity-90" />
                <div className="min-w-0"><div className="text-[8px] font-black uppercase tracking-[.22em] text-amber-100/52">Selected tool</div><div className="truncate text-[15px] font-black text-white">{selectedFile.name} · {selectedFile.hint}</div></div>
              </div>
              <div className="hidden max-w-[300px] truncate text-right text-[11px] font-bold text-white/58 md:block">{selectedFile.body}</div>
            </div>
          </div>
        </section>

        <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 rounded-[34px] border border-white/10 bg-black/44 p-3 shadow-[inset_0_0_44px_rgba(255,255,255,.035)]" aria-label="Prompt Anvil archive and chat">
          <div className="rounded-[24px] border border-amber-100/12 bg-black/40 p-3">
            <div className={tinyLabel}>archive file</div>
            <div className="mt-2 flex items-center gap-3"><img src={`${selectedFile.asset}?v=archive-card-1`} alt="" className="h-16 w-16 object-contain" /><div className="min-w-0"><div className="truncate text-[16px] font-black">{selectedFile.name}</div><div className="text-[11px] font-semibold text-white/52">{selectedFile.hint}</div></div></div>
          </div>
          <div className="min-h-0 overflow-auto rounded-[24px] border border-white/10 bg-black/34 p-3"><div className={tinyLabel}>assistant chat</div><div className="mt-3 space-y-2 text-[12px] font-semibold leading-snug">{localChat.map((line, index) => <div key={`${line}-${index}`} className={`${index % 2 ? 'rounded-[20px_20px_6px_20px] bg-white/12 text-white/82' : 'rounded-[20px_20px_20px_6px] bg-cyan-300/14 text-cyan-50'} px-3 py-2`}>{line}</div>)}<div className="rounded-[20px_20px_20px_6px] bg-emerald-300/12 px-3 py-2 text-emerald-50">Idle. External actions stay locked.</div></div></div>
          <div className="flex gap-2 rounded-full border border-white/10 bg-black/42 p-2"><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 text-[12px] font-semibold text-white outline-none placeholder:text-white/32" placeholder="Ask the prompt app..." aria-label="Prompt Studio chat input" /><button type="button" onClick={() => { if (chatInput.trim()) { setLocalChat((items) => [...items, chatInput.trim(), 'Forging local context and safety locks.']); setChatInput('') } }} className="rounded-full bg-amber-200 px-4 text-[11px] font-black uppercase text-black">send</button></div>
        </section>
      </main>
    </AppShell>
  )
}

function ModelBellowsApp({ station, onClose }: { station: OlympusStation; onClose: () => void }) {
  const lanes = ['Manager', 'Kimi worker', 'Gemma scout', 'Reviewer']
  return (
    <AppShell station={station} onClose={onClose} appName="Model routing furnace" tag="Model Bellows • graph + worker lanes" data="model-bellows-app" accent="bg-[radial-gradient(circle_at_16%_78%,rgba(251,146,60,.26),transparent_28%),radial-gradient(circle_at_72%_22%,rgba(59,130,246,.22),transparent_32%),linear-gradient(135deg,#140905,#050914_65%,#000)]">
      <main className="grid min-h-0 flex-1 gap-4 pt-4 lg:grid-cols-[1fr_340px]" data-model-bellows-app="true">
        <section className={`${toolPanel} relative overflow-hidden border-orange-100/16 p-6`}>
          <div className="flex items-center justify-between"><div className="text-[10px] font-black uppercase tracking-[.28em] text-orange-100/62">routing graph</div><div className="rounded-full border border-orange-100/16 bg-orange-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.14em] text-orange-100">safe dispatch simulation</div></div>
          <div className="relative mt-6 h-[560px] overflow-hidden rounded-[28px] border border-white/10 bg-[#080b11] shadow-[inset_0_0_80px_rgba(251,146,60,.06)]">
            <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle,rgba(251,146,60,.22)_1px,transparent_1px)] [background-size:26px_26px]" />
            <svg className="absolute inset-0 h-full w-full" aria-hidden="true" viewBox="0 0 960 560" preserveAspectRatio="none">
              {lanes.map((lane, i) => <path key={lane} d={`M 160 292 C 360 ${95 + i * 118}, 630 ${95 + i * 118}, 835 ${95 + i * 118}`} fill="none" stroke={i === 0 ? '#fdba74' : '#7dd3fc'} strokeWidth="5" strokeLinecap="round" strokeDasharray={i === 2 ? '12 12' : undefined} opacity="0.85" />)}
            </svg>
            <div className="absolute left-[7%] top-[42%] grid h-32 w-32 place-items-center rounded-full bg-gradient-to-br from-orange-200 to-amber-500 text-center text-sm font-black text-black shadow-[0_0_70px_rgba(251,146,60,.55)]">TASK<br />INTAKE</div>
            {lanes.map((lane, i) => <div key={lane} className="absolute right-[7%] grid h-20 w-48 place-items-center rounded-[24px] border border-sky-100/24 bg-sky-300/14 text-center text-sm font-black text-sky-50 shadow-[0_0_32px_rgba(56,189,248,.13)]" style={{ top: `${9 + i * 21}%` }}>{lane}<span className="text-[10px] text-sky-100/55">fit {82 - i * 13}%</span></div>)}
          </div>
        </section>
        <section className={`${toolPanel} grid min-h-0 grid-rows-[auto_1fr_auto] gap-3 p-4`}>
          <div><div className={tinyLabel}>dispatch controls</div><h3 className="mt-1 text-2xl font-black uppercase">choose worker path</h3></div>
          <div className="min-h-0 space-y-3 overflow-auto">{lanes.map((lane, i) => <button key={lane} className="w-full rounded-[24px] border border-white/10 bg-black/36 p-4 text-left transition hover:border-sky-100/30 hover:bg-sky-300/8"><div className="text-sm font-black">{lane}</div><div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-sky-300 to-orange-200" style={{ width: `${82 - i * 13}%` }} /></div><div className="mt-2 text-[11px] font-semibold text-white/55">context fit {82 - i * 13}% • safe local route</div></button>)}</div>
          <button className={`${primaryButton} bg-orange-300 text-black`}>stage dispatch packet</button>
        </section>
      </main>
    </AppShell>
  )
}

function SortingRackApp({ station, onClose }: { station: OlympusStation; onClose: () => void }) {
  return (
    <AppShell station={station} onClose={onClose} appName="Opportunity ranking rack" tag="Sorting Rack • graph + shelves" data="sorting-rack-app" accent="bg-[radial-gradient(circle_at_20%_16%,rgba(250,204,21,.21),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(34,197,94,.18),transparent_32%),linear-gradient(135deg,#100d03,#06120b_60%,#000)]">
      <main className="grid min-h-0 flex-1 gap-4 pt-4 lg:grid-cols-[360px_1fr]" data-sorting-rack-app="true">
        <section className={`${toolPanel} border-yellow-100/16 p-4`}>
          <div className="text-[10px] font-black uppercase tracking-[.28em] text-yellow-100/62">decision shelves</div>
          <div className="mt-5 space-y-4">{['winner', 'maybe', 'proof gap', 'reject'].map((lane, i) => <div key={lane} className="relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[.045] p-4"><div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-yellow-200 to-lime-300 opacity-70" /><div className="text-lg font-black uppercase">{lane}</div><div className="mt-2 h-12 rounded-[18px] bg-gradient-to-r from-yellow-200/30 to-transparent"><div className="h-full rounded-[18px] bg-black/20" style={{ width: `${20 + i * 17}%` }} /></div></div>)}</div>
        </section>
        <section className={`${toolPanel} grid min-h-0 grid-rows-[auto_1fr_auto] p-5`}>
          <div><div className={tinyLabel}>score graph</div><h3 className="mt-1 text-3xl font-black uppercase tracking-[-.04em]">Rank evidence before action</h3></div>
          <div className="mt-6 min-h-0 space-y-5">{rankingItems.map((item) => <div key={item.label} className="grid grid-cols-[180px_1fr_70px] items-center gap-4 rounded-[20px] border border-white/8 bg-white/[.035] p-3"><div><div className="text-sm font-black">{item.label}</div><div className="text-[10px] font-bold uppercase tracking-[.14em] text-white/38">{item.lane}</div></div><div className="h-5 rounded-full bg-white/10"><div className={`h-5 rounded-full bg-gradient-to-r ${item.color} shadow-[0_0_22px_rgba(250,204,21,.18)]`} style={{ width: `${item.score}%` }} /></div><div className="text-right text-xl font-black">{item.score}</div></div>)}</div>
          <div className="flex gap-2"><button className={`${primaryButton} bg-lime-300 text-black`}>promote winner</button><button className={`${primaryButton} border border-rose-200/20 bg-rose-400/10 text-rose-100`}>block false claim</button></div>
        </section>
      </main>
    </AppShell>
  )
}

function ListingEaselApp({ station, onClose }: { station: OlympusStation; onClose: () => void }) {
  return (
    <AppShell station={station} onClose={onClose} appName="Listing canvas builder" tag="Listing Easel • photos + SEO + publish lock" data="listing-easel-app" accent="bg-[radial-gradient(circle_at_18%_22%,rgba(244,114,182,.22),transparent_30%),radial-gradient(circle_at_78%_74%,rgba(45,212,191,.18),transparent_32%),linear-gradient(135deg,#140712,#041211_65%,#000)]">
      <main className="grid min-h-0 flex-1 gap-4 pt-4 lg:grid-cols-[1fr_360px]" data-listing-easel-app="true">
        <section className={`${toolPanel} grid min-h-0 grid-rows-[auto_1fr_auto] border-pink-100/16 p-5`}>
          <div><div className="text-[10px] font-black uppercase tracking-[.28em] text-pink-100/58">draft canvas</div><h3 className="text-3xl font-black uppercase tracking-[-.04em]">Etsy-safe listing draft</h3></div>
          <div className="mt-4 grid min-h-0 gap-4 md:grid-cols-[260px_1fr]">
            <div className="grid grid-cols-2 gap-3">{['Hero', 'Detail', 'Scale', 'Packaging'].map((slot) => <div key={slot} className="grid aspect-square place-items-center rounded-[24px] border border-dashed border-pink-100/25 bg-gradient-to-br from-pink-300/12 to-teal-300/8 text-center text-sm font-black text-pink-50 shadow-[inset_0_0_38px_rgba(244,114,182,.08)]">{slot}<br />photo</div>)}</div>
            <div className="grid min-h-0 grid-rows-[auto_1fr] gap-3"><input aria-label="Listing title draft" className="rounded-[20px] border border-white/10 bg-white/8 px-4 py-3 text-sm font-bold outline-none focus:border-pink-100/35" defaultValue="Gold tone necklace — truthful materials pending" /><textarea aria-label="Listing description draft" className="min-h-0 resize-none rounded-[24px] border border-white/10 bg-white/8 p-4 text-sm font-semibold leading-relaxed outline-none focus:border-pink-100/35" defaultValue={'Draft description area. Keeps unknown material/stone claims blocked until proof exists. Includes buyer-facing benefits, dimensions, photo plan, and SEO notes.'} /></div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_1fr]"><button className={`${primaryButton} bg-pink-200 text-black`}>save local preview</button><button disabled className={`${primaryButton} cursor-not-allowed border border-rose-200/25 bg-rose-500/10 text-rose-100 opacity-75`} aria-disabled="true">publish sealed</button><button disabled className={`${primaryButton} cursor-not-allowed border border-amber-100/20 bg-amber-300/10 text-amber-50 opacity-75`} aria-disabled="true">sync shop disabled</button></div>
        </section>
        <section className={`${toolPanel} p-4`}>
          <div className={tinyLabel}>mock SEO / shop readiness</div>
          <div className="mt-5 space-y-5">{['title clarity', 'tag coverage', 'truthfulness', 'photo plan'].map((metric, i) => <div key={metric}><div className="mb-2 flex justify-between text-sm font-black"><span>{metric}</span><span>{76 - i * 9}%</span></div><div className="h-4 rounded-full bg-white/10"><div className="h-4 rounded-full bg-gradient-to-r from-pink-300 to-teal-200" style={{ width: `${76 - i * 9}%` }} /></div></div>)}</div>
          <div className="mt-6 rounded-[24px] border border-rose-200/16 bg-rose-500/10 p-4 text-sm font-bold leading-relaxed text-rose-50">Publishing, renewal, price edits, supplier messages, and paid actions remain locked.</div>
        </section>
      </main>
    </AppShell>
  )
}

function ApprovalShrineApp({ station, onClose }: { station: OlympusStation; onClose: () => void }) {
  const { focusedPacket, route } = useContext(KnowledgeRouterContext)
  const [selectedPacketId, setSelectedPacketId] = useState(approvalPackets[0]?.id ?? '')
  const [decision, setDecision] = useState<'hold' | 'approve-local' | 'revise' | 'reject'>('hold')
  const [note, setNote] = useState('צריך לוודא ספק/עלות/SEO לפני שמתקדמים. אין פעולה חיצונית בלי OK מפורש.')
  const selectedPacket = approvalPackets.find((packet) => packet.id === selectedPacketId) ?? approvalPackets[0]
  const sourcePacket = focusedPacket ?? route?.workflowPacket ?? null
  const evidenceRows = [
    { id: 'source', label: 'source proof', value: sourcePacket?.input ?? 'supplier/product evidence not attached yet', state: sourcePacket ? 'ready' : 'missing' },
    { id: 'output', label: 'draft output', value: sourcePacket?.output ?? selectedPacket.action, state: selectedPacket.state === 'locked' ? 'locked' : 'review' },
    { id: 'risk', label: 'risk line', value: sourcePacket?.risk ?? 'external marketplace / spend / account actions locked', state: 'locked' },
    { id: 'handoff', label: 'next handoff', value: sourcePacket?.nextHandoff ?? 'Treasury or Atlantis archive after DLV decision', state: decision === 'hold' ? 'waiting' : 'ready' },
  ]
  const decisionCopy = {
    hold: { title: 'HOLD', subtitle: 'wait for missing proof', tone: 'border-amber-100/30 bg-amber-300/12 text-amber-50', output: 'Creates a local hold packet and keeps every live action sealed.' },
    'approve-local': { title: 'APPROVE LOCAL DRAFT', subtitle: 'only internal Workspace handoff', tone: 'border-emerald-100/30 bg-emerald-300/12 text-emerald-50', output: 'Allows the next local draft step only. Still no publish, purchase, paid generation, messages, or account edit.' },
    revise: { title: 'REVISE', subtitle: 'send back to Forge/Harbor', tone: 'border-cyan-100/30 bg-cyan-300/12 text-cyan-50', output: 'Returns the packet with concrete missing inputs before any approval.' },
    reject: { title: 'REJECT', subtitle: 'archive reason, stop line', tone: 'border-rose-100/30 bg-rose-400/12 text-rose-50', output: 'Stops the candidate and sends the reason trail to Atlantis.' },
  }[decision]
  return (
    <AppShell station={station} onClose={onClose} appName="DLV Decision Console" tag="Approval Shrine • local decision OS" data="approval-shrine-app" showKnowledgeRouter={false} compactHeader accent="bg-[radial-gradient(circle_at_48%_4%,rgba(251,191,36,.30),transparent_28%),radial-gradient(circle_at_80%_82%,rgba(248,113,113,.18),transparent_34%),radial-gradient(circle_at_14%_78%,rgba(45,212,191,.13),transparent_28%),linear-gradient(135deg,#120c02,#11050a_58%,#000)]">
      <main className="grid h-full min-h-0 flex-1 gap-2 overflow-hidden pt-2 xl:grid-cols-[minmax(235px,300px)_minmax(420px,1fr)_minmax(235px,300px)]" data-approval-shrine-app="true" data-local-decision={decision}>
        <section className={`${toolPanel} min-h-0 overflow-auto border-amber-100/18 p-3`} aria-label="Approval packet inbox">
          <div className={tinyLabel}>decision inbox</div>
          <h3 className="mt-2 text-xl font-black uppercase tracking-[-.04em]">Packets waiting for DLV</h3>
          <div className="mt-3 space-y-2">
            {approvalPackets.map((packet) => (
              <button key={packet.id} type="button" onClick={() => setSelectedPacketId(packet.id)} className={`w-full rounded-[22px] border p-3 text-left transition ${selectedPacketId === packet.id ? 'border-amber-100/60 bg-amber-200/14 shadow-[0_0_36px_rgba(251,191,36,.20)]' : 'border-white/10 bg-white/[.045] hover:border-amber-100/28 hover:bg-white/[.075]'}`} aria-label={`Inspect approval packet ${packet.title}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="truncate text-[16px] font-black">{packet.title}</div><div className="mt-1 text-[10px] font-black uppercase tracking-[.14em] text-white/42">risk {packet.risk} • {packet.state}</div></div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[.12em] ${packet.risk === 'blocked' ? 'border-rose-100/28 bg-rose-400/12 text-rose-50' : packet.risk === 'medium' ? 'border-amber-100/28 bg-amber-300/12 text-amber-50' : 'border-emerald-100/24 bg-emerald-300/10 text-emerald-50'}`}>{packet.risk}</span>
                </div>
                <p className="mt-3 line-clamp-2 text-[12px] font-bold leading-snug text-amber-50/72">{packet.action}</p>
              </button>
            ))}
          </div>
        </section>

        <section className={`${toolPanel} grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden border-amber-100/18 p-2.5 [@media(max-height:700px)]:p-2`} aria-label="DLV decision workbench">
          <div className="grid gap-2 [@media(max-height:700px)]:gap-1.5 lg:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[.28em] text-amber-100/62">current decision</div>
              <h3 className="mt-1 max-w-[470px] text-[clamp(22px,2.3vw,34px)] font-black uppercase leading-[.92] tracking-[-.055em] [@media(max-height:700px)]:text-[20px]">{selectedPacket.title}</h3>
              <p className="mt-2 max-w-3xl text-[12px] font-bold leading-relaxed text-white/62 [@media(max-height:700px)]:mt-1 [@media(max-height:700px)]:line-clamp-1 [@media(max-height:700px)]:text-[10px]">{selectedPacket.action}</p>
            </div>
            <div className={`min-w-[168px] rounded-[22px] border p-2.5 text-center [@media(max-height:700px)]:p-2 ${decisionCopy.tone}`} data-approval-decision-badge="true">
              <div className="text-[9px] font-black uppercase tracking-[.22em] opacity-70">decision</div>
              <div className="mt-2 text-[21px] font-black uppercase leading-none tracking-[-.04em] [@media(max-height:700px)]:mt-1 [@media(max-height:700px)]:text-[16px]">{decisionCopy.title}</div>
              <div className="mt-1 text-[11px] font-black uppercase tracking-[.12em] opacity-72 [@media(max-height:700px)]:text-[9px]">{decisionCopy.subtitle}</div>
            </div>
          </div>

          <div className="mt-1.5 max-h-[154px] overflow-hidden rounded-[22px] border border-amber-100/22 bg-[radial-gradient(circle_at_50%_16%,rgba(251,191,36,.18),transparent_30%),linear-gradient(135deg,rgba(42,22,3,.55),rgba(3,7,10,.78))] p-2.5 shadow-[inset_0_0_70px_rgba(251,191,36,.06),0_18px_38px_rgba(0,0,0,.38)] [@media(max-height:700px)]:hidden" data-approval-shrine-artifact-surface="true">
            <div className="grid gap-2 md:grid-cols-[108px_1fr_124px] md:items-center">
              <div className="grid place-items-center rounded-[20px] border border-amber-100/20 bg-black/32 p-2 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-full border border-amber-100/32 bg-amber-300/10 shadow-[0_0_55px_rgba(251,191,36,.18)]">
                  <div className="text-3xl">⚿</div>
                </div>
                <div className="mt-2 text-[8px] font-black uppercase tracking-[.16em] text-amber-100/72">DLV seal waits</div>
              </div>
              <div className="min-w-0 rounded-[18px] border border-cyan-100/16 bg-black/30 p-2.5">
                <div className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-100/70">living artifact packet</div>
                <div className="mt-1 truncate text-[clamp(18px,1.8vw,26px)] font-black uppercase leading-none tracking-[-.045em] text-amber-50">{sourcePacket?.title ?? selectedPacket.title}</div>
                <div className="mt-1.5 grid gap-1.5 text-[9px] font-bold leading-snug text-stone-200/78 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/[.045] p-1.5"><span className="block text-[7px] font-black uppercase text-cyan-100/62">input</span><span className="line-clamp-2">{sourcePacket?.input ?? 'source evidence pending'}</span></div>
                  <div className="rounded-xl border border-white/10 bg-white/[.045] p-1.5"><span className="block text-[7px] font-black uppercase text-emerald-100/62">output</span><span className="line-clamp-2">{sourcePacket?.output ?? selectedPacket.action}</span></div>
                  <div className="rounded-xl border border-rose-100/14 bg-rose-500/[.08] p-1.5 text-rose-50"><span className="block text-[7px] font-black uppercase text-rose-100/70">locked</span><span className="line-clamp-2">{sourcePacket?.lockedActions[0] ?? 'live external action'}</span></div>
                </div>
              </div>
              <div className="rounded-[18px] border border-rose-100/18 bg-rose-500/10 p-2 text-center">
                <div className="text-[8px] font-black uppercase tracking-[.20em] text-rose-100/70">cannot execute</div>
                <div className="mt-2 text-2xl font-black uppercase leading-none text-rose-50">sealed</div>
                <div className="mt-2 text-[9px] font-bold leading-snug text-rose-50/76">This screen records local review intent only. No marketplace, supplier, paid, or account side effect.</div>
              </div>
            </div>
          </div>

          <div className="mt-1.5 min-h-0 overflow-auto rounded-[22px] border border-white/10 bg-black/30 p-2 shadow-[inset_0_0_70px_rgba(251,191,36,.045)] [@media(max-height:700px)]:mt-1 [@media(max-height:700px)]:p-1.5" data-war-room-scroll-panel="approval-main">
            <div className="grid gap-1.5 md:grid-cols-2">
              {evidenceRows.map((row) => (
                <div key={row.id} className="rounded-[16px] border border-white/10 bg-white/[.045] p-2 [@media(max-height:700px)]:p-1.5" data-approval-evidence-row={row.id}>
                  <div className="flex items-center justify-between gap-2"><div className="text-[8px] font-black uppercase tracking-[.18em] text-white/45">{row.label}</div><span className={`rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[.10em] ${row.state === 'locked' ? 'bg-rose-300/14 text-rose-50' : row.state === 'missing' ? 'bg-amber-300/14 text-amber-50' : 'bg-emerald-300/14 text-emerald-50'}`}>{row.state}</span></div>
                  <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-snug text-white/72" title={row.value}>{row.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-1.5 rounded-[18px] border border-cyan-100/14 bg-cyan-300/[.055] p-2 [@media(max-height:700px)]:mt-1 [@media(max-height:700px)]:p-1.5">
              <div className={tinyLabel}>DLV note / reason trail</div>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 min-h-[44px] w-full resize-none rounded-[14px] border border-cyan-100/12 bg-black/38 p-2 text-[11px] font-semibold leading-snug text-cyan-50 outline-none focus:border-cyan-100/50 [@media(max-height:700px)]:min-h-[32px] [@media(max-height:700px)]:p-1.5 [@media(max-height:700px)]:text-[10px]" aria-label="DLV approval note" />
            </div>
          </div>

          <div className="mt-1.5 grid shrink-0 gap-1.5 md:grid-cols-4 [@media(max-height:700px)]:mt-1" aria-label="Local decision controls">
            <button type="button" onClick={() => setDecision('approve-local')} className={`${primaryButton} bg-emerald-300 text-black [@media(max-height:700px)]:px-3 [@media(max-height:700px)]:py-2 [@media(max-height:700px)]:text-[10px]`}>approve local</button>
            <button type="button" onClick={() => setDecision('hold')} className={`${primaryButton} bg-amber-300 text-black [@media(max-height:700px)]:px-3 [@media(max-height:700px)]:py-2 [@media(max-height:700px)]:text-[10px]`}>hold</button>
            <button type="button" onClick={() => setDecision('revise')} className={`${primaryButton} border border-cyan-100/22 bg-cyan-300/10 text-cyan-50 [@media(max-height:700px)]:px-3 [@media(max-height:700px)]:py-2 [@media(max-height:700px)]:text-[10px]`}>revise</button>
            <button type="button" onClick={() => setDecision('reject')} className={`${primaryButton} border border-rose-200/24 bg-rose-500/12 text-rose-100 [@media(max-height:700px)]:px-3 [@media(max-height:700px)]:py-2 [@media(max-height:700px)]:text-[10px]`}>reject</button>
          </div>
        </section>

        <section className={`${toolPanel} grid min-h-0 grid-rows-[auto_1fr_auto] overflow-hidden border-rose-100/16 p-3`} aria-label="Approval safety lock and output">
          <div>
            <div className={tinyLabel}>gate law</div>
            <div className="mt-2 grid h-16 place-items-center rounded-[24px] border border-amber-200/28 bg-amber-300/10 text-center shadow-[0_0_70px_rgba(251,191,36,.12)]"><div><div className="text-2xl">⚿</div><div className="text-sm font-black uppercase">DLV decides</div></div></div>
          </div>
          <div className="mt-2 min-h-0 overflow-auto space-y-2" data-war-room-scroll-panel="approval-locks">
            <div className="rounded-[22px] border border-rose-100/18 bg-rose-500/10 p-3" data-approval-external-lock-console="true">
              <div className={tinyLabel}>always locked</div>
              <div className="mt-2 grid gap-2">
                {['Open Etsy API', 'Send supplier message', 'Spend / paid generation'].map((action) => (
                  <button key={action} type="button" disabled aria-disabled="true" className="cursor-not-allowed rounded-2xl border border-rose-100/18 bg-black/36 px-3 py-1.5 text-left text-[9px] font-black uppercase tracking-[.10em] text-rose-50/70 opacity-80">
                    🔒 {action} — disabled / not connected
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-[24px] border border-emerald-100/16 bg-emerald-300/10 p-3" data-local-approval-output="true">
              <div className={tinyLabel}>local output</div>
              <p className="mt-2 line-clamp-3 text-xs font-black leading-relaxed text-emerald-50">{decisionCopy.output}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[.045] p-4">
              <div className={tinyLabel}>decision packet preview</div>
              <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-[18px] bg-black/36 p-3 font-mono text-[11px] font-semibold leading-relaxed text-white/68">{`decision: ${decision}\npacket: ${selectedPacket.title}\nnote: ${note}\nexternal: locked\nnext: ${decision === 'reject' ? 'Atlantis rejection archive' : decision === 'revise' ? 'return to responsible room brother' : 'local draft handoff only'}`}</pre>
            </div>
          </div>
          <button type="button" onClick={() => navigator.clipboard.writeText(`Decision: ${decision}\nPacket: ${selectedPacket.title}\nNote: ${note}\nExternal actions: locked`).catch(() => undefined)} className={`${primaryButton} mt-3 bg-amber-200 text-black`}>copy decision packet</button>
        </section>
      </main>
    </AppShell>
  )
}

function VaultRecordCard({ record, active, onClick }: { record: WarRoomArchiveRecord; active: boolean; onClick: () => void }) {
  const stateTone = record.state === 'locked' ? 'border-rose-200/30 bg-rose-500/10 text-rose-50' : record.state === 'needs-proof' ? 'border-amber-200/30 bg-amber-400/10 text-amber-50' : record.state === 'draft' ? 'border-cyan-200/30 bg-cyan-400/10 text-cyan-50' : 'border-emerald-200/30 bg-emerald-400/10 text-emerald-50'
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-[24px] border p-4 text-left transition ${active ? 'border-cyan-100/60 bg-cyan-200/14 shadow-[0_0_34px_rgba(34,211,238,.20)]' : 'border-white/10 bg-white/[.045] hover:border-cyan-100/30 hover:bg-white/[.075]'}`} aria-label={`Open archive record ${record.title}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="truncate text-[15px] font-black">{record.title}</div><div className="mt-1 text-[10px] font-black uppercase tracking-[.16em] text-white/42">{record.kind} • {record.owner}</div></div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[.12em] ${stateTone}`}>{record.state}</span>
      </div>
      <p className="mt-3 line-clamp-2 text-[12px] font-semibold leading-snug text-white/58">{record.summary}</p>
    </button>
  )
}

function VaultCollectionTab({ collection, active, count, onClick }: { collection: WarRoomArchiveCollection; active: boolean; count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-[22px] border px-4 py-3 text-left transition ${active ? 'border-cyan-100/55 bg-cyan-200/16 text-cyan-50' : 'border-white/10 bg-black/30 text-white/68 hover:bg-white/8'}`} aria-label={`Open collection ${collection.label}`}>
      <div className="text-[13px] font-black uppercase tracking-[-.02em]">{collection.label}</div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-[.14em] text-white/42">{count} live records</div>
      <div className="mt-2 line-clamp-2 text-[10px] font-semibold leading-snug text-white/42">{collection.description}</div>
    </button>
  )
}

function AtlantisVaultApp({ station, onClose }: { station: OlympusStation; onClose: () => void }) {
  const collections = archiveCollectionsForRoom('atlantis-vault')
  const stationRecords = archiveRecordsForStation(station.id)
  const roomRecords = archiveRecordsForRoom('atlantis-vault')
  const allRecords = stationRecords.length ? stationRecords : roomRecords
  const recordCountForCollection = (collection: WarRoomArchiveCollection) => allRecords.filter((record) => collection.recordKinds.includes(record.kind)).length
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? 'all')
  const filteredRecords = useMemo(() => {
    const collection = warRoomOpsState.databaseVault.collections.find((item) => item.id === collectionId)
    if (!collection) return allRecords
    const ids = new Set(collection.recordKinds)
    const subset = allRecords.filter((record) => ids.has(record.kind))
    return subset.length ? subset : allRecords
  }, [allRecords, collectionId])
  const [selectedRecordId, setSelectedRecordId] = useState(filteredRecords[0]?.id ?? allRecords[0]?.id)
  const selectedRecord =
    filteredRecords.find((record) => record.id === selectedRecordId) ??
    filteredRecords.at(0)
  return (
    <AppShell station={station} onClose={onClose} appName="Olympus Data Vault" tag="Atlantis DB • collections → records → room handoffs" data="atlantis-vault-database-app" accent="bg-[radial-gradient(circle_at_18%_18%,rgba(45,212,191,.24),transparent_30%),radial-gradient(circle_at_82%_74%,rgba(59,130,246,.22),transparent_32%),linear-gradient(135deg,#03131a,#020812_64%,#000)]">
      <main className="grid min-h-0 flex-1 gap-4 pt-4 xl:grid-cols-[320px_390px_1fr]" data-atlantis-vault-database-app="true">
        <section className={`${toolPanel} min-h-0 overflow-auto border-cyan-100/16 p-4`}>
          <div className={tinyLabel}>database backbone</div>
          <h3 className="mt-2 text-2xl font-black uppercase tracking-[-.04em]">{warRoomOpsState.databaseVault.databaseName}</h3>
          <p className="mt-2 text-[12px] font-semibold leading-snug text-white/58">{warRoomOpsState.databaseVault.pathLabel}</p>
          <div className="mt-5 grid gap-2">
            {collections.map((collection) => <VaultCollectionTab key={collection.id} collection={collection} count={recordCountForCollection(collection)} active={collection.id === collectionId} onClick={() => { setCollectionId(collection.id); const next = allRecords.find((record) => collection.recordKinds.includes(record.kind)); if (next) setSelectedRecordId(next.id) }} />)}
          </div>
          <div className="mt-5 rounded-[24px] border border-rose-200/18 bg-rose-500/10 p-4">
            <div className="text-[10px] font-black uppercase tracking-[.22em] text-rose-100/70">safety locks</div>
            <div className="mt-3 space-y-2">{warRoomOpsState.databaseVault.safetyLocks.map((lock) => <div key={lock} className="rounded-full border border-rose-100/12 bg-black/24 px-3 py-2 text-[11px] font-black uppercase tracking-[.08em] text-rose-50/88">{lock}</div>)}</div>
          </div>
        </section>
        <section className={`${toolPanel} min-h-0 overflow-auto p-4`}>
          <div className={tinyLabel}>records</div>
          <div className="mt-4 space-y-3">{filteredRecords.map((record) => <VaultRecordCard key={record.id} record={record} active={record.id === selectedRecord?.id} onClick={() => setSelectedRecordId(record.id)} />)}</div>
        </section>
        <section className={`${toolPanel} grid min-h-0 grid-rows-[auto_1fr_auto] border-teal-100/16 p-5`}>
          {selectedRecord ? <>
            <div>
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-teal-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.14em] text-black">{selectedRecord.kind}</span><span className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.14em] text-white/62">{selectedRecord.source}</span></div>
              <h3 className="mt-3 text-[clamp(24px,3vw,44px)] font-black uppercase leading-none tracking-[-.055em]">{selectedRecord.title}</h3>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed text-white/68">{selectedRecord.summary}</p>
            </div>
            <div className="mt-5 min-h-0 overflow-auto rounded-[28px] border border-cyan-100/12 bg-[#03111a]/70 p-5 shadow-[inset_0_0_60px_rgba(45,212,191,.07)]">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[24px] border border-white/10 bg-white/[.045] p-4"><div className={tinyLabel}>next use</div><p className="mt-3 text-sm font-bold leading-relaxed text-cyan-50/86">{selectedRecord.nextUse}</p></div>
                <div className="rounded-[24px] border border-white/10 bg-white/[.045] p-4"><div className={tinyLabel}>owner / room</div><p className="mt-3 text-sm font-bold leading-relaxed text-emerald-50/86">{selectedRecord.owner} • {selectedRecord.roomId} • {selectedRecord.stationId}</p></div>
              </div>
              <div className="mt-4 rounded-[24px] border border-rose-200/16 bg-rose-500/10 p-4"><div className={tinyLabel}>locked actions</div><div className="mt-3 flex flex-wrap gap-2">{selectedRecord.lockedActions.map((action) => <span key={action} className="rounded-full border border-rose-100/18 bg-black/26 px-3 py-2 text-[11px] font-black uppercase tracking-[.08em] text-rose-50">{action}</span>)}</div></div>
              <div className="mt-4 rounded-[24px] border border-sky-200/16 bg-sky-500/10 p-4"><div className={tinyLabel}>linked records</div><div className="mt-3 flex flex-wrap gap-2">{selectedRecord.linkedRecords.length ? selectedRecord.linkedRecords.map((id) => <button key={id} type="button" onClick={() => setSelectedRecordId(id)} className="rounded-full border border-sky-100/18 bg-black/26 px-3 py-2 text-[11px] font-black uppercase tracking-[.08em] text-sky-50">{id}</button>) : <span className="text-sm font-semibold text-white/50">No links yet</span>}</div></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><button className={`${primaryButton} bg-teal-200 text-black`}>open read-only record</button><button className={`${primaryButton} border border-cyan-100/20 bg-cyan-300/10 text-cyan-50`}>stage review packet</button><button className={`${primaryButton} border border-rose-200/22 bg-rose-500/10 text-rose-100`}>external action locked</button></div>
          </> : <div className="grid h-full place-items-center text-white/50">No archive record indexed for this station yet.</div>}
        </section>
      </main>
    </AppShell>
  )
}

function FallbackApp({ station, onClose, liveFeed, sourceLine }: { station: OlympusStation; onClose: () => void; liveFeed: Array<StationLiveFeedItem>; sourceLine?: string }) {
  return (
    <AppShell station={station} onClose={onClose} appName={`${station.name} app`} tag={`${station.kind} • pending dedicated app`} data="fallback-app" accent="bg-[linear-gradient(135deg,#0d0a05,#05070d_65%,#000)]">
      <main className="min-h-0 flex-1 overflow-auto pt-4"><div className={`${toolPanel} p-6`}><h3 className="text-3xl font-black uppercase tracking-[-.04em]">Needs a custom surface next</h3><p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed text-white/68">{sourceLine || 'This station is intentionally not using the old cockpit. It waits for a purpose-built app surface matching its job.'}</p><div className="mt-5 grid gap-3 md:grid-cols-2">{liveFeed.slice(0, 4).map((item) => <div key={item.id} className="rounded-[24px] border border-white/10 bg-black/36 p-4"><div className="text-sm font-black">{item.title}</div><p className="mt-1 text-sm font-semibold text-white/58">{item.summary || item.subtitle}</p></div>)}</div></div></main>
    </AppShell>
  )
}

export function StationDialog({ station, roomId, liveFeed = [], sourceLine, focusedWorkflowPacket = null, onClose }: StationDialogProps) {
  const [knowledgeRoute, setKnowledgeRoute] = useState<WarRoomKnowledgeRouteData | null>(null)
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null)
  const stationFeed = liveFeed.length ? liveFeed.slice(0, 4) : [
    { id: 'idle', title: 'Ready', state: 'idle', summary: 'No external action. Local Workspace surface only.' },
    { id: 'approval', title: 'Approval lock', state: 'locked', summary: 'DLV must approve before publish, buy, message, or spend.' },
  ]
  useEffect(() => {
    let cancelled = false
    const refreshKnowledgeRoute = async () => {
      setKnowledgeLoading(true)
      setKnowledgeError(null)
      try {
        const params = new URLSearchParams({ roomId, stationId: station.id, stationKind: station.kind, limit: '6' })
        const response = await fetch(`/api/war-room-knowledge-router?${params.toString()}`, { credentials: 'same-origin' })
        const payload = await response.json() as WarRoomKnowledgeRouteData
        if (cancelled) return
        setKnowledgeRoute(payload)
        if (!response.ok || !payload.ok) setKnowledgeError(payload.error ?? `knowledge-router ${response.status}`)
      } catch (error) {
        if (!cancelled) setKnowledgeError(error instanceof Error ? error.message : String(error))
      } finally {
        if (!cancelled) setKnowledgeLoading(false)
      }
    }
    void refreshKnowledgeRoute()
    return () => {
      cancelled = true
    }
  }, [roomId, station.id, station.kind])

  const renderApp = () => {
    if (station.id === 'prompt-anvil' || station.kind === 'prompt') return <PromptStudio station={station} onClose={onClose} />
    if (station.id === 'model-bellows' || station.kind === 'model') return <ModelBellowsApp station={station} onClose={onClose} />
    if (station.id === 'sorting-rack' || station.kind === 'sorting') return <SortingRackApp station={station} onClose={onClose} />
    if (station.id === 'listing-easel' || station.kind === 'listing') return <ListingEaselApp station={station} onClose={onClose} />
    if (station.id === 'approval-shrine' || station.kind === 'approval') return <ApprovalShrineApp station={station} onClose={onClose} />
    if (station.dialogLayout === 'atlantisVaultDialog' || station.id === 'dataset-pool' || station.id === 'crystal-archive') return <AtlantisVaultApp station={station} onClose={onClose} />
    if (station.id === 'skills-forge' || station.kind === 'skills') return (
      <AppShell station={station} onClose={onClose} appName="Skills file workspace" tag="Skills Forge • file manager" data="skills-forge-app" accent="bg-[radial-gradient(circle_at_18%_20%,rgba(52,211,153,.22),transparent_30%),linear-gradient(135deg,#03110f,#02060c_65%,#000)]"><SkillsForgeSurface /></AppShell>
    )
    return <FallbackApp station={station} onClose={onClose} liveFeed={stationFeed} sourceLine={sourceLine} />
  }

  return (
    <KnowledgeRouterContext.Provider value={{ route: knowledgeRoute, loading: knowledgeLoading, error: knowledgeError, focusedPacket: focusedWorkflowPacket }}>
      {renderApp()}
    </KnowledgeRouterContext.Provider>
  )
}
