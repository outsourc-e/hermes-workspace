import {   useEffect, useMemo, useState } from 'react'
import {
  ETSY_OPS_ACTION_POLICIES,
  ETSY_OPS_STATIONS,









  etsyOpsActionPolicyById
} from '../../../lib/war-room/etsy-ops-room-contract'
import {

  buildAgentRuntimeSnapshots,
  buildRuntimeSummary
} from '../../../lib/war-room/etsy-ops-living-runtime'
import type {CSSProperties, FormEvent} from 'react';
import type {EtsyOpsActionId, EtsyOpsAgentState, EtsyOpsKeywordSummary, EtsyOpsProductSummary, EtsyOpsRoomState, EtsyOpsStationId, EtsyOpsStationSpec, EtsyOpsStationVisualState, EtsyOpsSupplierLink} from '../../../lib/war-room/etsy-ops-room-contract';
import type {EtsyOpsAgentRuntimeSnapshot} from '../../../lib/war-room/etsy-ops-living-runtime';
import './etsy-ops-room.css'

type ActionResult = {
  ok: boolean
  actionId: EtsyOpsActionId
  mode: string
  riskClass: string
  message: string
  error?: string | null
  state?: EtsyOpsRoomState
}

type Selection =
  | { type: 'station'; id: EtsyOpsStationId }
  | { type: 'agent'; id: string }
  | null

type ChatLine = {
  id: string
  role: 'operator' | 'assistant' | 'system'
  text: string
}

type DirectAgentChatResponse = {
  ok: boolean
  delivered: boolean
  error?: string | null
  messages?: Array<{ id: string; role: string; content: string }>
}

type StationAssetSpec = {
  src: string
  frameCount: number
  durationMs: number
  scale?: number
}

type WorldRoomSpec = {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  kind: 'active' | 'future' | 'rest'
}

type WorldBridgeSpec = {
  id: string
  x: number
  y: number
  w: number
  rotation: number
  kind?: 'primary' | 'rest'
}

const STATION_ASSETS: Partial<Record<EtsyOpsStationId, StationAssetSpec>> = {
  'product-intake': { src: '/war-room/etsy-ops-v4/stations/product-intake-strip.png', frameCount: 8, durationMs: 1900, scale: 1.24 },
  'seo-oracle': { src: '/war-room/etsy-ops-v4/stations/seo-oracle-strip.png', frameCount: 8, durationMs: 1800, scale: 1.18 },
  'supplier-proof': { src: '/war-room/etsy-ops-v4/stations/supplier-proof-strip.png', frameCount: 8, durationMs: 2000, scale: 1.2 },
  'media-sources': { src: '/war-room/etsy-ops-v4/stations/media-sources-strip.png', frameCount: 8, durationMs: 1900, scale: 1.2 },
  'shotlab-prep': { src: '/war-room/etsy-ops-v4/stations/shotlab-prep-strip.png', frameCount: 8, durationMs: 1550, scale: 1.24 },
  'listing-draft': { src: '/war-room/etsy-ops-v4/stations/listing-draft-strip.png', frameCount: 8, durationMs: 1850, scale: 1.2 },
  'price-margin': { src: '/war-room/etsy-ops-v4/stations/price-margin-strip.png', frameCount: 8, durationMs: 1900, scale: 1.18 },
  'dlv-approval': { src: '/war-room/etsy-ops-v4/stations/dlv-approval-strip.png', frameCount: 8, durationMs: 1700, scale: 1.16 },
  'archive-vault': { src: '/war-room/etsy-ops-v4/stations/archive-vault-strip.png', frameCount: 8, durationMs: 2050, scale: 1.18 },
}

const WORLD_ROOMS: Array<WorldRoomSpec> = [
  { id: 'youtube', label: 'YouTube', x: -780, y: -430, w: 280, h: 132, kind: 'future' },
  { id: 'dropship', label: 'Dropship', x: 780, y: -430, w: 280, h: 132, kind: 'future' },
  { id: 'product-lab', label: 'Product Lab', x: -850, y: 40, w: 250, h: 126, kind: 'future' },
  { id: 'media-vault', label: 'Media Vault', x: 850, y: 70, w: 250, h: 126, kind: 'future' },
  { id: 'treasury', label: 'Treasury', x: -520, y: 620, w: 250, h: 126, kind: 'future' },
  { id: 'rest-hall', label: 'Rest Hall', x: 0, y: 720, w: 340, h: 150, kind: 'rest' },
  { id: 'archive-wing', label: 'Archive Wing', x: 520, y: 620, w: 250, h: 126, kind: 'future' },
]

const WORLD_BRIDGES: Array<WorldBridgeSpec> = [
  { id: 'bridge-youtube', x: -520, y: -300, w: 260, rotation: 18 },
  { id: 'bridge-dropship', x: 520, y: -300, w: 260, rotation: -18 },
  { id: 'bridge-product-lab', x: -560, y: 70, w: 300, rotation: 0 },
  { id: 'bridge-media-vault', x: 560, y: 70, w: 300, rotation: 0 },
  { id: 'bridge-rest', x: 0, y: 455, w: 440, rotation: 90, kind: 'rest' },
  { id: 'bridge-treasury', x: -310, y: 520, w: 260, rotation: -28 },
  { id: 'bridge-archive-wing', x: 310, y: 520, w: 260, rotation: 28 },
]

const CAMERA_LABELS = {
  world: 'Map',
  room: 'Room',
} as const

const PRODUCT_LIMIT = 8

function isRoomState(value: unknown): value is EtsyOpsRoomState {
  return Boolean(value && typeof value === 'object' && (value as { ok?: unknown }).ok === true)
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'None'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function productLabel(product: EtsyOpsProductSummary | null) {
  return product?.title ?? 'No product selected'
}

function keywordsForProduct(product: EtsyOpsProductSummary | null, keywords: Array<EtsyOpsKeywordSummary>) {
  if (!product) return keywords.slice(0, 8)
  const productKeywords = new Set(product.keywords.map((keyword) => keyword.toLowerCase()))
  const matched = keywords.filter((keyword) => productKeywords.has(keyword.keyword.toLowerCase()))
  return (matched.length ? matched : keywords).slice(0, 8)
}

function suppliersForProduct(product: EtsyOpsProductSummary | null, suppliers: Array<EtsyOpsSupplierLink>) {
  if (!product) return suppliers.slice(0, 8)
  return suppliers.filter((supplier) => supplier.productId === product.id).slice(0, 8)
}

function stationTone(station: EtsyOpsStationSpec) {
  if (station.riskClass === 'approval-required') return 'is-approval'
  if (station.kind === 'rest') return 'is-rest'
  if (station.kind === 'media' || station.kind === 'archive') return 'is-archive'
  if (station.kind === 'shotlab') return 'is-forge'
  return 'is-local'
}

function getPersistentWorldEpoch() {
  if (typeof window === 'undefined') return Date.now()
  const key = 'hermes:etsy-ops-v2:world-epoch'
  const existing = Number(window.sessionStorage.getItem(key))
  if (Number.isFinite(existing) && existing > 0) return existing
  const epoch = Date.now()
  window.sessionStorage.setItem(key, String(epoch))
  return epoch
}

function useWorldClock(epochMs: number) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    let animationFrame = 0
    let lastCommit = 0
    const tick = (timestamp: number) => {
      if (timestamp - lastCommit >= 66) {
        lastCommit = timestamp
        setNowMs(Date.now())
      }
      animationFrame = window.requestAnimationFrame(tick)
    }
    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [])

  return Math.max(0, nowMs - epochMs)
}

function clipForRuntime(agent: EtsyOpsAgentState, runtime: EtsyOpsAgentRuntimeSnapshot) {
  return agent.animation.clips.find((clip) => clip.state === runtime.animationState && clip.assetPath)
    ?? agent.animation.clips.find((clip) => clip.state === 'idle' && clip.assetPath)
    ?? null
}

function safeAgentActionStation(stationId: EtsyOpsStationId | undefined, fallback: EtsyOpsStationId) {
  return stationId === 'rest-lounge' ? fallback : (stationId ?? fallback)
}

function latestAssistantMessage(response: DirectAgentChatResponse) {
  return [...(response.messages ?? [])].reverse().find((message) => message.role === 'assistant' && message.content.trim())
}

function buildLiveAgentPrompt({
  agent,
  runtime,
  product,
  userText,
}: {
  agent: EtsyOpsAgentState
  runtime: EtsyOpsAgentRuntimeSnapshot | null
  product: EtsyOpsProductSummary | null
  userText: string
}) {
  return [
    agent.chat.systemPrompt,
    '',
    'Hermes Workspace context:',
    `Room: DolaroBoutique Etsy Ops V2`,
    `Persona: ${agent.persona}`,
    `Current state: ${runtime?.activity ?? agent.movementState} at ${runtime?.targetStationId ?? agent.targetStationId}`,
    product ? `Selected product: ${product.title} (${product.id})` : 'Selected product: none',
    product?.etsyAngle ? `Etsy angle: ${product.etsyAngle}` : null,
    product?.keywords.length ? `Keywords: ${product.keywords.join(', ')}` : null,
    'Safety: answer normally, but do not claim you performed Etsy publish/edit, supplier message, purchase, paid generation, account edit, delete, or any external mutation. If the operator asks for live action, describe the approval packet needed.',
    '',
    `Operator message: ${userText}`,
  ].filter(Boolean).join('\n')
}

function stationVisualStateFor(stationId: EtsyOpsStationId, snapshots: Array<EtsyOpsAgentRuntimeSnapshot>): EtsyOpsStationVisualState {
  const stationSnapshots = snapshots.filter((snapshot) => snapshot.targetStationId === stationId)
  if (stationSnapshots.some((snapshot) => snapshot.attention === 'approval' || snapshot.attention === 'blocked')) return 'approval'
  if (stationSnapshots.some((snapshot) => snapshot.activity === 'working')) return 'working'
  if (stationSnapshots.some((snapshot) => snapshot.activity === 'carrying')) return 'packet'
  if (stationSnapshots.some((snapshot) => snapshot.activity === 'talking')) return 'chat'
  return 'idle'
}

function doorStateFor(snapshots: Array<EtsyOpsAgentRuntimeSnapshot>) {
  return {
    north: snapshots.some((snapshot) => snapshot.y < 12),
    south: snapshots.some((snapshot) => snapshot.y > 88 || snapshot.targetStationId === 'rest-lounge' || snapshot.stationId === 'rest-lounge'),
    west: snapshots.some((snapshot) => snapshot.x < 12),
    east: snapshots.some((snapshot) => snapshot.x > 88),
  }
}

function latestLineFor(lines: Array<ChatLine>) {
  return lines.at(-1)?.text ?? ''
}

export function EtsyOpsRoom() {
  const [state, setState] = useState<EtsyOpsRoomState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cameraMode, setCameraMode] = useState<'world' | 'room'>('room')
  const [selection, setSelection] = useState<Selection>(null)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)
  const [isPostingAction, setIsPostingAction] = useState(false)
  const [agentNotes, setAgentNotes] = useState<Record<string, Array<ChatLine>>>({})
  const [chatDrafts, setChatDrafts] = useState<Record<string, string>>({})
  const [chattingAgentIds, setChattingAgentIds] = useState<Record<string, boolean>>({})
  const [worldEpoch] = useState(getPersistentWorldEpoch)
  const elapsedMs = useWorldClock(worldEpoch)

  useEffect(() => {
    let cancelled = false
    fetch('/api/war-room-etsy-ops', { headers: { accept: 'application/json' } })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok || !isRoomState(payload)) {
          throw new Error(payload?.error ?? 'Failed to load Etsy Ops room')
        }
        if (!cancelled) {
          setState(payload)
          setSelectedProductId(payload.products[0]?.id ?? null)
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Failed to load Etsy Ops room')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedProduct = useMemo(() => {
    if (!state) return null
    return state.products.find((product) => product.id === selectedProductId) ?? state.products[0]
  }, [selectedProductId, state])

  const runtimeSnapshots = useMemo(() => buildAgentRuntimeSnapshots(state?.agents ?? [], elapsedMs), [elapsedMs, state?.agents])
  const runtimeByAgent = useMemo(() => new Map(runtimeSnapshots.map((snapshot) => [snapshot.agentId, snapshot])), [runtimeSnapshots])
  const runtimeSummary = useMemo(() => buildRuntimeSummary(state?.agents ?? []), [state?.agents])
  const stationVisualStates = useMemo(() => {
    const entries = (state?.room.stations ?? []).map((station) => [station.id, stationVisualStateFor(station.id, runtimeSnapshots)] as const)
    return new Map<EtsyOpsStationId, EtsyOpsStationVisualState>(entries)
  }, [runtimeSnapshots, state?.room.stations])
  const openDoors = useMemo(() => doorStateFor(runtimeSnapshots), [runtimeSnapshots])
  const selectedAgent = selection?.type === 'agent' ? state?.agents.find((agent) => agent.id === selection.id) ?? null : null
  const selectedAgentRuntime = selectedAgent ? runtimeByAgent.get(selectedAgent.id) ?? null : null
  const activeStationId = selection?.type === 'station'
    ? selection.id
    : selectedAgentRuntime?.targetStationId ?? 'product-intake'
  const activeStation = state?.room.stations.find((station) => station.id === activeStationId) ?? ETSY_OPS_STATIONS[0]
  const stationKeywords = useMemo(() => keywordsForProduct(selectedProduct, state?.keywords ?? []), [selectedProduct, state?.keywords])
  const stationSuppliers = useMemo(() => suppliersForProduct(selectedProduct, state?.supplierLinks ?? []), [selectedProduct, state?.supplierLinks])
  const pendingApprovals = runtimeSnapshots.filter((snapshot) => snapshot.attention === 'approval' || snapshot.attention === 'blocked').length

  async function runAction(
    actionId: EtsyOpsActionId,
    options: { stationId?: EtsyOpsStationId; agentId?: string | null; note?: string } = {},
  ) {
    if (!state) return null
    setIsPostingAction(true)
    setActionResult(null)
    try {
      const response = await fetch('/api/war-room-etsy-ops', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          actionId,
          stationId: options.stationId ?? activeStationId,
          productId: selectedProduct?.id ?? null,
          agentId: options.agentId ?? selectedAgent?.id ?? null,
          note: options.note ?? '',
        }),
      })
      const payload = await response.json() as ActionResult
      if (payload.state) setState(payload.state)
      setActionResult(payload)
      return payload
    } catch (error) {
      const payload: ActionResult = {
        ok: false,
        actionId,
        mode: 'error',
        riskClass: 'blocked',
        message: error instanceof Error ? error.message : 'Action failed',
        error: 'network-error',
      }
      setActionResult(payload)
      return payload
    } finally {
      setIsPostingAction(false)
    }
  }

  async function sendAgentNote(agent: EtsyOpsAgentState, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = (chatDrafts[agent.id] ?? '').trim()
    if (!text) return
    setChatDrafts((drafts) => ({ ...drafts, [agent.id]: '' }))
    const localLine: ChatLine = { id: `${Date.now()}:operator`, role: 'operator', text }
    setAgentNotes((notes) => ({ ...notes, [agent.id]: [...(notes[agent.id] ?? []), localLine] }))
    setChattingAgentIds((ids) => ({ ...ids, [agent.id]: true }))

    try {
      const runtime = runtimeByAgent.get(agent.id) ?? null
      const response = await fetch('/api/swarm-direct-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          workerId: agent.chat.workerId,
          prompt: buildLiveAgentPrompt({ agent, runtime, product: selectedProduct, userText: text }),
          limit: 40,
          timeoutMs: 12_000,
          roomLocalFirst: true,
        }),
      })
      const payload = await response.json() as DirectAgentChatResponse
      const assistant = latestAssistantMessage(payload)

      if (response.ok && payload.ok && assistant) {
        setAgentNotes((notes) => ({
          ...notes,
          [agent.id]: [...(notes[agent.id] ?? []), { id: assistant.id, role: 'assistant', text: assistant.content }],
        }))
        return
      }

      const result = await runAction('agent-chat-note', {
        stationId: safeAgentActionStation(runtime?.targetStationId, agent.homeStationId),
        agentId: agent.id,
        note: text,
      })
      setAgentNotes((notes) => ({
        ...notes,
        [agent.id]: [
          ...(notes[agent.id] ?? []),
          {
            id: `${Date.now()}:system`,
            role: 'system',
            text: result?.ok
              ? `Live Hermes chat did not answer yet, so I staged this as a safe local packet for ${agent.label}.`
              : payload.error ?? result?.message ?? 'Live Hermes chat is unavailable and packet staging failed.',
          },
        ],
      }))
    } catch (error) {
      const runtime = runtimeByAgent.get(agent.id) ?? null
      const result = await runAction('agent-chat-note', {
        stationId: safeAgentActionStation(runtime?.targetStationId, agent.homeStationId),
        agentId: agent.id,
        note: text,
      })
      setAgentNotes((notes) => ({
        ...notes,
        [agent.id]: [
          ...(notes[agent.id] ?? []),
          {
            id: `${Date.now()}:system`,
            role: 'system',
            text: result?.ok
              ? `Live chat fallback: saved a safe Hermes packet because the worker did not respond (${error instanceof Error ? error.message : 'unknown error'}).`
              : 'Live chat and packet fallback both failed.',
          },
        ],
      }))
    } finally {
      setChattingAgentIds((ids) => ({ ...ids, [agent.id]: false }))
    }
  }

  if (loadError) {
    return (
      <main className="etsy-ops-shell is-v2">
        <section className="etsy-ops-loading" role="alert">
          <p>Could not load Etsy Ops Room</p>
          <strong>{loadError}</strong>
        </section>
      </main>
    )
  }

  if (!state) {
    return (
      <main className="etsy-ops-shell is-v2">
        <section className="etsy-ops-loading" aria-label="Loading Etsy Ops Room">
          <div className="etsy-ops-loading-gem" />
          <p>Opening living Etsy Ops room...</p>
        </section>
      </main>
    )
  }

  return (
    <main
      className="etsy-ops-shell is-v2"
      aria-label="DolaroBoutique Living Etsy Ops Room"
      data-etsy-ops-room="v2"
      data-live-etsy-enabled={String(state.safety.liveEtsyEnabled)}
      data-paid-generation-enabled={String(state.safety.paidGenerationEnabled)}
    >
      <section className={`etsy-ops-v2-stage-shell is-${cameraMode} ${selection ? 'has-detail' : ''}`} data-testid="etsy-ops-living-stage">
        <div className="etsy-ops-v2-map-controls" aria-label="Room controls">
          <div className="etsy-ops-v2-mode-toggle" role="group" aria-label="Camera mode">
            {(['world', 'room'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={cameraMode === mode ? 'is-active' : ''}
                onClick={() => setCameraMode(mode)}
                data-testid={`etsy-ops-camera-${mode}`}
              >
                {CAMERA_LABELS[mode]}
              </button>
            ))}
          </div>
          <button type="button" className="etsy-ops-v2-mini-status" onClick={() => setSelection({ type: 'station', id: 'dlv-approval' })}>
            <span>DLV</span>
            <strong>{pendingApprovals ? `${pendingApprovals} waiting` : 'locked safe'}</strong>
          </button>
          <button type="button" className="etsy-ops-v2-mini-status" onClick={() => setSelection({ type: 'station', id: 'media-sources' })}>
            <span>Media</span>
            <strong>{state.counts.mediaImages} real images</strong>
          </button>
        </div>

        <div className="etsy-ops-v2-world-canvas">
          {WORLD_ROOMS.map((room) => (
            <div
              key={room.id}
              className={`etsy-ops-v2-future-room is-${room.kind}`}
              style={{
                left: `calc(50% + ${room.x}px)`,
                top: `calc(50% + ${room.y}px)`,
                width: `${room.w}px`,
                height: `${room.h}px`,
              }}
            >
              {room.label}
            </div>
          ))}
          {WORLD_BRIDGES.map((bridge) => (
            <div
              key={bridge.id}
              className={`etsy-ops-v2-bridge is-${bridge.kind ?? 'primary'}`}
              style={{
                left: `calc(50% + ${bridge.x}px)`,
                top: `calc(50% + ${bridge.y}px)`,
                width: `${bridge.w}px`,
                transform: `translate(-50%, -50%) rotate(${bridge.rotation}deg)`,
              }}
            />
          ))}

          <div className="etsy-ops-v2-room" aria-label={state.room.label}>
            <div className="etsy-ops-v2-floor" />
            <div className="etsy-ops-v2-inner-wall" />
            <div className={`etsy-ops-v2-door north ${openDoors.north ? 'is-open' : ''}`} data-door-id="north" />
            <div className={`etsy-ops-v2-door south ${openDoors.south ? 'is-open' : ''}`} data-door-id="south" />
            <div className={`etsy-ops-v2-door west ${openDoors.west ? 'is-open' : ''}`} data-door-id="west" />
            <div className={`etsy-ops-v2-door east ${openDoors.east ? 'is-open' : ''}`} data-door-id="east" />

            {(state.room.routes).map((route) => (
              <button
                key={route.id}
                type="button"
                className={`etsy-ops-v2-route ${route.manualOnly ? 'is-manual' : ''}`}
                style={{
                  left: `${route.rail.x}%`,
                  top: `${route.rail.y}%`,
                  width: `${route.rail.w}%`,
                  height: `${route.rail.h}%`,
                }}
                aria-label={route.label}
                title={route.label}
                onClick={() => setSelection({ type: 'station', id: route.to })}
              />
            ))}

            {state.room.stations.map((station) => (
              <StationNode
                key={station.id}
                station={station}
                active={selection?.type === 'station' && selection.id === station.id}
                visualState={stationVisualStates.get(station.id) ?? 'idle'}
                alert={station.riskClass === 'approval-required'}
                elapsedMs={elapsedMs}
                onSelect={() => setSelection({ type: 'station', id: station.id })}
              />
            ))}

            {state.agents.map((agent) => {
              const runtime = runtimeByAgent.get(agent.id)
              if (!runtime) return null
              return (
                <AgentSprite
                  key={agent.id}
                  agent={agent}
                  runtime={runtime}
                  active={selection?.type === 'agent' && selection.id === agent.id}
                  onSelect={() => setSelection({ type: 'agent', id: agent.id })}
                />
              )
            })}
          </div>
        </div>

        <div className="etsy-ops-v2-agent-rail" aria-label="Living agents">
          {state.agents.map((agent) => {
            const runtime = runtimeByAgent.get(agent.id)
            return (
              <button
                key={agent.id}
                type="button"
                className={selection?.type === 'agent' && selection.id === agent.id ? 'is-active' : ''}
                style={{ '--agent-accent': agent.accent } as CSSProperties}
                onClick={() => setSelection({ type: 'agent', id: agent.id })}
              >
                <span>{agent.shortLabel}</span>
                <strong>{agent.label}</strong>
                <em>{runtime?.activity ?? agent.movementState}</em>
              </button>
            )
          })}
        </div>

        {selection ? (
          <DetailPanel
            selection={selection}
            station={activeStation}
            agent={selectedAgent}
            agentRuntime={selectedAgentRuntime}
            state={state}
            product={selectedProduct}
            keywords={stationKeywords}
            suppliers={stationSuppliers}
            actionResult={actionResult}
            isPostingAction={isPostingAction}
            isAgentChatting={selectedAgent ? chattingAgentIds[selectedAgent.id] === true : false}
            agentNotes={selectedAgent ? agentNotes[selectedAgent.id] ?? [] : []}
            chatDraft={selectedAgent ? chatDrafts[selectedAgent.id] ?? '' : ''}
            onClose={() => setSelection(null)}
            onRunAction={runAction}
            onSelectProduct={(productId) => setSelectedProductId(productId)}
            onDraftChange={(agentId, value) => setChatDrafts((drafts) => ({ ...drafts, [agentId]: value }))}
            onSendAgentNote={sendAgentNote}
          />
        ) : null}

        <div className="etsy-ops-v2-product-queue" aria-label="Product queue" hidden>
          {state.products.slice(0, PRODUCT_LIMIT).map((product) => (
            <button
              key={product.id}
              type="button"
              className={product.id === selectedProduct?.id ? 'is-active' : ''}
              onClick={() => {
                setSelectedProductId(product.id)
                setSelection({ type: 'station', id: 'product-intake' })
              }}
            >
              <span>{product.title}</span>
              <strong>{product.priority ?? 'candidate'}</strong>
            </button>
          ))}
        </div>

        <div className="etsy-ops-v2-runtime-seal" aria-label="Runtime status">
          <span>{runtimeSummary.agentCount} agents</span>
          <span>{runtimeSummary.targetFramesPerAgent}f target</span>
          <span>{runtimeSummary.styleLockRequired ? 'style lock' : 'runtime ready'}</span>
        </div>
      </section>
    </main>
  )
}

function StationNode({
  station,
  active,
  visualState,
  alert,
  elapsedMs,
  onSelect,
}: {
  station: EtsyOpsStationSpec
  active: boolean
  visualState: EtsyOpsStationVisualState
  alert: boolean
  elapsedMs: number
  onSelect: () => void
}) {
  const asset = STATION_ASSETS[station.id]
  const stationFrameCount = Math.max(1, asset?.frameCount ?? 1)
  const stationFrameIndex = asset ? Math.floor(elapsedMs / Math.max(90, asset.durationMs / stationFrameCount)) % stationFrameCount : 0
  const stationFramePct = stationFrameCount <= 1 ? 0 : (stationFrameIndex / (stationFrameCount - 1)) * 100
  return (
    <button
      type="button"
      className={`etsy-ops-v2-station ${stationTone(station)} is-activity-${visualState} ${active ? 'is-active' : ''}`}
      style={{
        left: `${station.grid.x}%`,
        top: `${station.grid.y}%`,
        width: `${station.size.w}%`,
        height: `${station.size.h}%`,
        '--station-scale': asset?.scale ?? 1,
      } as CSSProperties}
      onClick={onSelect}
      aria-label={`Open ${station.label}`}
      data-testid="etsy-ops-station"
      data-station-id={station.id}
      data-station-frame={stationFrameIndex}
      data-station-frame-count={stationFrameCount}
    >
      <span className="etsy-ops-v2-station-plaque">{station.shortLabel}</span>
      {asset ? (
        stationFrameCount > 1 ? (
          <span
            className="etsy-ops-v2-station-asset is-strip"
            style={{
              backgroundImage: `url(${asset.src})`,
              backgroundSize: `${stationFrameCount * 100}% 100%`,
              backgroundPosition: `${stationFramePct}% 0`,
            }}
          />
        ) : (
          <img src={asset.src} alt="" className="etsy-ops-v2-station-asset" draggable={false} />
        )
      ) : null}
      {alert || visualState === 'approval' ? <span className="etsy-ops-v2-alert-pin" aria-label="Needs approval" /> : null}
      {visualState === 'packet' ? <span className="etsy-ops-v2-station-packet" aria-hidden="true" /> : null}
    </button>
  )
}

function AgentCommsDock({
  agents,
  runtimeByAgent,
  agentNotes,
  chatDrafts,
  chattingAgentIds,
  onDraftChange,
  onSendAgentNote,
  onSelectAgent,
}: {
  agents: Array<EtsyOpsAgentState>
  runtimeByAgent: Map<string, EtsyOpsAgentRuntimeSnapshot>
  agentNotes: Record<string, Array<ChatLine>>
  chatDrafts: Record<string, string>
  chattingAgentIds: Record<string, boolean>
  onDraftChange: (agentId: string, value: string) => void
  onSendAgentNote: (agent: EtsyOpsAgentState, event: FormEvent<HTMLFormElement>) => void
  onSelectAgent: (agentId: string) => void
}) {
  return (
    <section className="etsy-ops-v2-comms-dock" aria-label="Parallel agent comms" data-testid="etsy-ops-comms-dock">
      {agents.map((agent) => {
        const lines = agentNotes[agent.id] ?? []
        const runtime = runtimeByAgent.get(agent.id)
        const isChatting = chattingAgentIds[agent.id] === true
        const draft = chatDrafts[agent.id] ?? ''
        return (
          <form
            key={agent.id}
            className={`etsy-ops-v2-comms-card ${isChatting ? 'is-thinking' : ''}`}
            style={{ '--agent-accent': agent.accent } as CSSProperties}
            onSubmit={(event) => onSendAgentNote(agent, event)}
          >
            <button type="button" className="etsy-ops-v2-comms-agent" onClick={() => onSelectAgent(agent.id)}>
              <span>{agent.shortLabel}</span>
              <strong>{agent.label}</strong>
              <em>{runtime?.activity ?? agent.movementState}</em>
            </button>
            <p>{isChatting ? 'Agent is thinking...' : latestLineFor(lines) || runtime?.message || agent.speech}</p>
            <div className="etsy-ops-v2-comms-row">
              <input
                value={draft}
                onChange={(event) => onDraftChange(agent.id, event.target.value)}
                placeholder={`Message ${agent.label}`}
              />
              <button type="submit" disabled={isChatting || !draft.trim()}>
                Ask
              </button>
            </div>
          </form>
        )
      })}
    </section>
  )
}

function AgentSprite({
  agent,
  runtime,
  active,
  onSelect,
}: {
  agent: EtsyOpsAgentState
  runtime: EtsyOpsAgentRuntimeSnapshot
  active: boolean
  onSelect: () => void
}) {
  const clip = clipForRuntime(agent, runtime)
  const frameCount = Math.max(1, runtime.spriteFrameCount)
  const framePct = frameCount <= 1 ? 0 : (runtime.spriteFrameIndex / (frameCount - 1)) * 100
  return (
    <button
      type="button"
      className={`etsy-ops-v2-agent is-${runtime.activity} is-${runtime.attention} ${active ? 'is-active' : ''}`}
      style={{
        left: `${runtime.x}%`,
        top: `${runtime.y}%`,
        '--agent-accent': agent.accent,
        '--agent-bob': `${runtime.bodyBobPx}px`,
        '--agent-lean': `${runtime.bodyLeanDeg}deg`,
      } as CSSProperties}
      onClick={onSelect}
      aria-label={`${agent.label}: ${runtime.message}`}
      data-testid="etsy-ops-agent"
      data-motion-frame={runtime.motionFrameIndex}
      data-motion-frame-count={runtime.motionFrameCount}
      data-sprite-frame={runtime.spriteFrameIndex}
      data-sprite-frame-count={runtime.spriteFrameCount}
      data-animation-state={runtime.animationState}
      data-direction={runtime.direction}
      data-agent-id={agent.id}
    >
      {clip?.assetPath ? (
        <span
          className="etsy-ops-v2-agent-strip"
          style={{
            backgroundImage: `url(${clip.assetPath})`,
            backgroundSize: `${frameCount * 100}% 100%`,
            backgroundPosition: `${framePct}% 0`,
          }}
        />
      ) : (
        <img src={agent.spriteUrl} alt="" draggable={false} />
      )}
      {runtime.carryingPacket ? <span className="etsy-ops-v2-agent-packet" /> : null}
      {runtime.attention !== 'none' ? <span className="etsy-ops-v2-agent-alert" /> : null}
      <span className="etsy-ops-v2-agent-name">{agent.shortLabel}</span>
      <span className="etsy-ops-v2-speech">{runtime.message}</span>
    </button>
  )
}

function DetailPanel({
  selection,
  station,
  agent,
  agentRuntime,
  state,
  product,
  keywords,
  suppliers,
  actionResult,
  isPostingAction,
  isAgentChatting,
  agentNotes,
  chatDraft,
  onClose,
  onRunAction,
  onSelectProduct,
  onDraftChange,
  onSendAgentNote,
}: {
  selection: Selection
  station: EtsyOpsStationSpec
  agent: EtsyOpsAgentState | null
  agentRuntime: EtsyOpsAgentRuntimeSnapshot | null
  state: EtsyOpsRoomState
  product: EtsyOpsProductSummary | null
  keywords: Array<EtsyOpsKeywordSummary>
  suppliers: Array<EtsyOpsSupplierLink>
  actionResult: ActionResult | null
  isPostingAction: boolean
  isAgentChatting: boolean
  agentNotes: Array<ChatLine>
  chatDraft: string
  onClose: () => void
  onRunAction: (actionId: EtsyOpsActionId, options?: { stationId?: EtsyOpsStationId; agentId?: string | null; note?: string }) => Promise<ActionResult | null>
  onSelectProduct: (productId: string) => void
  onDraftChange: (agentId: string, value: string) => void
  onSendAgentNote: (agent: EtsyOpsAgentState, event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <aside className="etsy-ops-v2-detail" aria-label="Selected Etsy Ops detail" data-testid="etsy-ops-detail-panel">
      <button type="button" className="etsy-ops-v2-close" onClick={onClose} aria-label="Close detail panel">x</button>
      {selection?.type === 'agent' && agent ? (
        <AgentPanel
          agent={agent}
          runtime={agentRuntime}
          notes={agentNotes}
          draft={chatDraft}
          actionResult={actionResult}
          isPostingAction={isPostingAction}
          isChatting={isAgentChatting}
          onDraftChange={onDraftChange}
          onSendAgentNote={onSendAgentNote}
          onRunAction={onRunAction}
        />
      ) : (
        <StationPanel
          station={station}
          product={product}
          keywords={keywords}
          suppliers={suppliers}
          state={state}
          actionResult={actionResult}
          isPostingAction={isPostingAction}
          onRunAction={onRunAction}
          onSelectProduct={onSelectProduct}
        />
      )}
    </aside>
  )
}

function AgentPanel({
  agent,
  runtime,
  notes,
  draft,
  actionResult,
  isPostingAction,
  isChatting,
  onDraftChange,
  onSendAgentNote,
  onRunAction,
}: {
  agent: EtsyOpsAgentState
  runtime: EtsyOpsAgentRuntimeSnapshot | null
  notes: Array<ChatLine>
  draft: string
  actionResult: ActionResult | null
  isPostingAction: boolean
  isChatting: boolean
  onDraftChange: (agentId: string, value: string) => void
  onSendAgentNote: (agent: EtsyOpsAgentState, event: FormEvent<HTMLFormElement>) => void
  onRunAction: (actionId: EtsyOpsActionId, options?: { stationId?: EtsyOpsStationId; agentId?: string | null; note?: string }) => Promise<ActionResult | null>
}) {
  return (
    <div className="etsy-ops-v2-panel-stack">
      <header className="etsy-ops-v2-agent-header" style={{ '--agent-accent': agent.accent } as CSSProperties}>
        <img src={agent.portraitUrl} alt="" draggable={false} />
        <div>
          <p>{agent.mythology}</p>
          <h2>{agent.label}</h2>
          <span>{agent.historicalMirror}</span>
        </div>
      </header>
      <MetricRow label="Current state" value={runtime ? `${runtime.activity} at ${runtime.targetStationId}` : agent.movementState} />
      <MetricRow label="Model profile" value={agent.chat.modelProfileId} />
      <MetricRow label="Personality" value={agent.persona} />
      <div className="etsy-ops-v2-chip-rack">
        {agent.capabilities.map((capability) => <span key={capability}>{capability}</span>)}
      </div>
      <form className="etsy-ops-v2-chat" onSubmit={(event) => onSendAgentNote(agent, event)}>
        <div className="etsy-ops-v2-chat-log">
          <p className="is-system">{runtime?.message ?? agent.speech}</p>
          {notes.map((line) => (
            <p key={line.id} className={line.role === 'operator' ? 'is-operator' : line.role === 'assistant' ? 'is-assistant' : 'is-system'}>{line.text}</p>
          ))}
          {isChatting ? <p className="is-system">Agent is thinking...</p> : null}
        </div>
        <div className="etsy-ops-v2-prompt-row">
          {agent.chat.suggestedPrompts.slice(0, 3).map((prompt) => (
            <button key={prompt} type="button" onClick={() => onDraftChange(agent.id, prompt)}>
              {prompt}
            </button>
          ))}
        </div>
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(agent.id, event.target.value)}
          placeholder={`Message ${agent.label}`}
          rows={3}
        />
        <button type="submit" disabled={isChatting || !draft.trim()}>
          {isChatting ? 'Waiting for agent' : 'Ask agent'}
        </button>
      </form>
      <div className="etsy-ops-v2-actions">
        <button
          type="button"
          disabled={isPostingAction}
          onClick={() => onRunAction('request-dlv-approval', { stationId: safeAgentActionStation(runtime?.targetStationId, agent.homeStationId), agentId: agent.id })}
        >
          Request approval packet
        </button>
        <button
          type="button"
          disabled={isPostingAction}
          onClick={() => onRunAction('hold-for-review', { stationId: safeAgentActionStation(runtime?.targetStationId, agent.homeStationId), agentId: agent.id })}
        >
          Hold worker
        </button>
      </div>
      {actionResult ? <ActionResultCard result={actionResult} /> : null}
    </div>
  )
}

function StationPanel({
  station,
  product,
  keywords,
  suppliers,
  state,
  actionResult,
  isPostingAction,
  onRunAction,
  onSelectProduct,
}: {
  station: EtsyOpsStationSpec
  product: EtsyOpsProductSummary | null
  keywords: Array<EtsyOpsKeywordSummary>
  suppliers: Array<EtsyOpsSupplierLink>
  state: EtsyOpsRoomState
  actionResult: ActionResult | null
  isPostingAction: boolean
  onRunAction: (actionId: EtsyOpsActionId, options?: { stationId?: EtsyOpsStationId; agentId?: string | null; note?: string }) => Promise<ActionResult | null>
  onSelectProduct: (productId: string) => void
}) {
  return (
    <div className="etsy-ops-v2-panel-stack">
      <header className="etsy-ops-v2-station-header">
        <span>{station.shortLabel}</span>
        <div>
          <p>{station.output}</p>
          <h2>{station.label}</h2>
        </div>
      </header>
      <MetricRow label="Station role" value={station.role} />
      <StationContent station={station} product={product} keywords={keywords} suppliers={suppliers} state={state} onSelectProduct={onSelectProduct} />
      <div className="etsy-ops-v2-actions">
        {station.actions.map((actionId) => {
          const policy = etsyOpsActionPolicyById(actionId) ?? ETSY_OPS_ACTION_POLICIES[0]
          return (
            <button
              key={actionId}
              type="button"
              className={`is-${policy.riskClass}`}
              disabled={isPostingAction}
              onClick={() => onRunAction(actionId, { stationId: station.id })}
            >
              <span>{policy.label}</span>
              <strong>{policy.mode.replace(/-/g, ' ')}</strong>
            </button>
          )
        })}
      </div>
      {actionResult ? <ActionResultCard result={actionResult} /> : null}
    </div>
  )
}

function StationContent({
  station,
  product,
  keywords,
  suppliers,
  state,
  onSelectProduct,
}: {
  station: EtsyOpsStationSpec
  product: EtsyOpsProductSummary | null
  keywords: Array<EtsyOpsKeywordSummary>
  suppliers: Array<EtsyOpsSupplierLink>
  state: EtsyOpsRoomState
  onSelectProduct: (productId: string) => void
}) {
  if (station.kind === 'seo') return <SeoPanel keywords={keywords} product={product} />
  if (station.kind === 'supplier') return <SupplierPanel suppliers={suppliers} product={product} />
  if (station.kind === 'shotlab') return <ShotLabPanel product={product} state={state} />
  if (station.kind === 'listing') return <ListingPanel product={product} keywords={keywords} />
  if (station.kind === 'finance') return <MarginPanel keywords={keywords} product={product} />
  if (station.kind === 'approval') return <ApprovalPanel state={state} product={product} />
  if (station.kind === 'media') return <MediaPanel state={state} />
  if (station.kind === 'archive') return <ArchivePanel state={state} />
  if (station.kind === 'rest') return <RestPanel agents={state.agents} />
  return <ProductPanel product={product} state={state} onSelectProduct={onSelectProduct} />
}

function ProductPanel({ product, state, onSelectProduct }: { product: EtsyOpsProductSummary | null; state: EtsyOpsRoomState; onSelectProduct: (productId: string) => void }) {
  return (
    <div className="etsy-ops-v2-data-stack">
      <MetricRow label="Selected product" value={productLabel(product)} />
      <MetricRow label="Opportunity score" value={formatNumber(product?.opportunityScore)} />
      <div className="etsy-ops-v2-mini-list">
        {state.products.slice(0, 6).map((item) => (
          <button key={item.id} type="button" onClick={() => onSelectProduct(item.id)}>
            <span>{item.title}</span>
            <strong>{formatNumber(item.opportunityScore)}</strong>
          </button>
        ))}
      </div>
    </div>
  )
}

function SeoPanel({ keywords, product }: { keywords: Array<EtsyOpsKeywordSummary>; product: EtsyOpsProductSummary | null }) {
  return (
    <div className="etsy-ops-v2-data-stack">
      <MetricRow label="Product" value={productLabel(product)} />
      <MetricRow label="Product keywords" value={product?.keywords.length ? product.keywords.join(', ') : 'No product keyword bridge'} />
      <div className="etsy-ops-v2-mini-list">
        {keywords.map((keyword) => (
          <p key={keyword.keyword}>
            <span>{keyword.keyword}</span>
            <strong>{formatNumber(keyword.signalScore ?? keyword.score)}</strong>
          </p>
        ))}
      </div>
    </div>
  )
}

function SupplierPanel({ suppliers, product }: { suppliers: Array<EtsyOpsSupplierLink>; product: EtsyOpsProductSummary | null }) {
  return (
    <div className="etsy-ops-v2-data-stack">
      <MetricRow label="Product" value={productLabel(product)} />
      <MetricRow label="Supplier links" value={String(suppliers.length || product?.supplierLinkCount || 0)} />
      <div className="etsy-ops-v2-link-list">
        {suppliers.length ? suppliers.map((supplier) => (
          <a key={`${supplier.productId}:${supplier.platform}:${supplier.url}`} href={supplier.url} target="_blank" rel="noreferrer">
            <span>{supplier.platform}</span>
            <strong>{supplier.status}</strong>
          </a>
        )) : <p>No supplier URL is mapped for this selected product.</p>}
      </div>
    </div>
  )
}

function ShotLabPanel({ product, state }: { product: EtsyOpsProductSummary | null; state: EtsyOpsRoomState }) {
  return (
    <div className="etsy-ops-v2-data-stack">
      <MetricRow label="ShotLab readiness" value={product?.shotlabStatus ?? 'No ShotLab status'} />
      <MetricRow label="Real images mapped" value={String(state.counts.mediaImages)} />
      <div className="etsy-ops-v2-preview-grid">
        {state.media.images.slice(0, 6).map((image) => (
          <img key={image.id} src={image.previewUrl ?? ''} alt={image.name} />
        ))}
        {state.media.images.length === 0 ? (
          <div className="etsy-ops-v2-empty-preview">
            <strong>No fake preview</strong>
            <span>Connect a real media folder and product images will appear here.</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ListingPanel({ product, keywords }: { product: EtsyOpsProductSummary | null; keywords: Array<EtsyOpsKeywordSummary> }) {
  const tags = product?.keywords.length ? product.keywords : keywords.map((keyword) => keyword.keyword)
  return (
    <div className="etsy-ops-v2-data-stack">
      <MetricRow label="Draft title seed" value={productLabel(product)} />
      <MetricRow label="Etsy angle" value={product?.etsyAngle ?? 'No Etsy angle'} />
      <div className="etsy-ops-v2-chip-rack">
        {tags.slice(0, 12).map((tag) => <span key={tag}>{tag}</span>)}
      </div>
    </div>
  )
}

function MarginPanel({ keywords, product }: { keywords: Array<EtsyOpsKeywordSummary>; product: EtsyOpsProductSummary | null }) {
  const avgPrices = keywords.map((keyword) => keyword.avgPrice).filter((value): value is number => typeof value === 'number')
  const avgPrice = avgPrices.length ? avgPrices.reduce((sum, value) => sum + value, 0) / avgPrices.length : null
  return (
    <div className="etsy-ops-v2-data-stack">
      <MetricRow label="Product" value={productLabel(product)} />
      <MetricRow label="Keyword avg price evidence" value={avgPrice === null ? 'No price evidence connected' : `$${formatNumber(avgPrice)}`} />
      <MetricRow label="Shop price write access" value="Locked: no Etsy edit connected" />
    </div>
  )
}

function ApprovalPanel({ state, product }: { state: EtsyOpsRoomState; product: EtsyOpsProductSummary | null }) {
  return (
    <div className="etsy-ops-v2-data-stack">
      <MetricRow label="Product" value={productLabel(product)} />
      <MetricRow label="Etsy live actions" value="Locked" />
      <MetricRow label="Supplier messages" value="Locked" />
      <MetricRow label="Paid generation" value="Locked" />
      <div className="etsy-ops-v2-chip-rack is-locks">
        {state.safety.blockedWriteClasses.map((item) => <span key={item}>{item}</span>)}
      </div>
    </div>
  )
}

function MediaPanel({ state }: { state: EtsyOpsRoomState }) {
  return (
    <div className="etsy-ops-v2-data-stack">
      {state.media.sources.map((source) => (
        <div key={source.id} className={`etsy-ops-v2-media-source ${source.exists ? 'exists' : 'missing'}`}>
          <strong>{source.label}</strong>
          <span>{source.exists ? `${source.imageCount} images / ${source.sourceFileCount} files` : 'Folder not found yet'}</span>
          <code>{source.rootPath}</code>
        </div>
      ))}
    </div>
  )
}

function ArchivePanel({ state }: { state: EtsyOpsRoomState }) {
  return (
    <div className="etsy-ops-v2-data-stack">
      <div className="etsy-ops-v2-mini-list">
        {state.media.sourceFiles.slice(0, 10).map((file) => (
          <p key={file.id}>
            <span>{file.name}</span>
            <strong>{formatBytes(file.size)}</strong>
          </p>
        ))}
      </div>
    </div>
  )
}

function RestPanel({ agents }: { agents: Array<EtsyOpsAgentState> }) {
  return (
    <div className="etsy-ops-v2-data-stack">
      <MetricRow label="Rest policy" value="Idle agents visibly rest instead of faking work" />
      <div className="etsy-ops-v2-mini-list">
        {agents.map((agent) => (
          <p key={agent.id}>
            <span>{agent.label}</span>
            <strong>{agent.movementState}</strong>
          </p>
        ))}
      </div>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="etsy-ops-v2-metric-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ActionResultCard({ result }: { result: ActionResult }) {
  return (
    <div className={`etsy-ops-v2-action-result ${result.ok ? 'is-ok' : 'is-error'}`} role="status">
      <strong>{result.ok ? 'Packet ready' : 'Action failed'}</strong>
      <p>{result.message}</p>
    </div>
  )
}
