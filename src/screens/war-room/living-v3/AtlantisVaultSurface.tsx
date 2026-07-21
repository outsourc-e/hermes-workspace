import { useEffect, useMemo, useState } from 'react'
import { RoomWorkbenchCommandTable, RoomWorkbenchPillRow } from './RoomWorkbenchPrimitives'
import { WorkspaceStationCta } from './WorkspaceStationCta'
import type { CSSProperties, ReactNode } from 'react'

import type {
  AtlantisVaultFlowEdge,
  AtlantisVaultSnapshot,
  AtlantisVaultStoreNode,
} from '../../../lib/war-room/living-v3/atlantis-vault-contract'
import type { RoomWorkbenchCommandRow } from './RoomWorkbenchPrimitives'
import './atlantis-vault-surface.css'

const goodTone = 'good' satisfies RoomWorkbenchCommandRow['tone']
const warnTone = 'warn' satisfies RoomWorkbenchCommandRow['tone']

type AtlantisVaultApiState =
  | { status: 'loading'; snapshot: AtlantisVaultSnapshot | null; error: null }
  | { status: 'ready'; snapshot: AtlantisVaultSnapshot; error: null }
  | { status: 'error'; snapshot: AtlantisVaultSnapshot | null; error: string }

function formatTime(value: number | null | undefined) {
  if (!value) return 'not written yet'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

function stateLabel(state: AtlantisVaultStoreNode['state'] | AtlantisVaultFlowEdge['state']) {
  if (state === 'ready') return 'ready'
  if (state === 'empty') return 'empty'
  if (state === 'warn') return 'needs check'
  if (state === 'blocked') return 'blocked'
  return 'failed'
}

function stateTone(state: AtlantisVaultStoreNode['state'] | AtlantisVaultFlowEdge['state']) {
  if (state === 'ready') return 'good'
  if (state === 'empty') return 'quiet'
  if (state === 'warn') return 'warn'
  return 'bad'
}

function truthStoreLabel(store: AtlantisVaultSnapshot['database']['activeTruthStore']) {
  if (store === 'local-json') return 'Local on this Mac'
  return 'Supabase Workspace Core'
}

function percent(value: number, total: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}

const NODE_POSITIONS = [
  ['50%', '6%'],
  ['88%', '31%'],
  ['78%', '78%'],
  ['22%', '78%'],
  ['12%', '31%'],
  ['50%', '50%'],
] as const

function humanizeToken(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function storeKindLabel(kind: AtlantisVaultStoreNode['kind']) {
  if (kind === 'workspace-kernel') return 'Workspace memory'
  if (kind === 'etsy-room') return 'Etsy workflow'
  if (kind === 'council-board') return 'Council decisions'
  if (kind === 'obsidian-allowlist') return 'Obsidian context'
  if (kind === 'poseidon-asset') return 'Poseidon assets'
  return 'Supabase setup'
}

function artifactKindLabel(kind: AtlantisVaultSnapshot['recentArtifacts'][number]['kind']) {
  if (kind === 'live-product-candidate-packet') return 'Product candidate'
  if (kind === 'selected-product-packet') return 'Selected product'
  if (kind === 'seo-packet') return 'SEO packet'
  if (kind === 'shotlab-handoff-packet') return 'ShotLab handoff'
  if (kind === 'etsy-draft-preview-packet') return 'Draft preview'
  if (kind === 'approval-packet') return 'Approval packet'
  if (kind === 'data-vault-audit-packet') return 'Vault audit'
  return humanizeToken(kind)
}

function dataOriginLabel(value: string) {
  if (value === 'local-only') return 'Local only'
  if (value === 'live-readonly-research') return 'Live read-only research'
  if (value === 'server-real-readback') return 'Server readback'
  return humanizeToken(value)
}

function flowWidth(edge: AtlantisVaultFlowEdge, maxValue: number) {
  if (maxValue <= 0) return '6%'
  const ratio = Math.max(0.08, Math.min(1, edge.value / maxValue))
  return `${Math.round(ratio * 100)}%`
}

export function AtlantisVaultSurface({
  variant = 'primary',
  navigationSlot,
}: {
  variant?: 'primary' | 'station'
  navigationSlot?: ReactNode
}) {
  const [apiState, setApiState] = useState<AtlantisVaultApiState>({ status: 'loading', snapshot: null, error: null })
  const [activeStoreId, setActiveStoreId] = useState('workspace-kernel')
  const [noteFilter, setNoteFilter] = useState<'all' | 'loaded' | 'needs-check'>('all')
  const [detailsOpen, setDetailsOpen] = useState(false)

  async function refreshSnapshot() {
    setApiState((current) => ({ status: 'loading', snapshot: current.snapshot, error: null }))
    try {
      const response = await fetch('/api/war-room/atlantis-vault/status', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const payload = await response.json() as AtlantisVaultSnapshot | { ok: false; error?: string }
      if (!response.ok || !payload.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : `Atlantis status failed: ${response.status}`)
      }
      setApiState({ status: 'ready', snapshot: payload, error: null })
      setActiveStoreId((current) => payload.stores.some((store) => store.id === current) ? current : payload.stores[0]?.id ?? 'workspace-kernel')
    } catch (error) {
      setApiState((current) => ({
        status: 'error',
        snapshot: current.snapshot,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  useEffect(() => {
    void refreshSnapshot()
  }, [])

  const snapshot = apiState.snapshot
  const atlantisCtaStatus = apiState.status === 'loading' ? 'running' : apiState.status === 'error' ? 'blocked' : 'ready'
  const activeStore = useMemo(() => snapshot?.stores.find((store) => store.id === activeStoreId) ?? snapshot?.stores[0] ?? null, [activeStoreId, snapshot])
  const maxFlowValue = useMemo(() => Math.max(0, ...(snapshot?.flow.map((edge) => edge.value) ?? [0])), [snapshot])
  const visibleNotes = useMemo(() => {
    const notes = snapshot?.obsidian.notes ?? []
    if (noteFilter === 'loaded') return notes.filter((note) => note.status === 'loaded')
    if (noteFilter === 'needs-check') return notes.filter((note) => note.status !== 'loaded')
    return notes
  }, [noteFilter, snapshot])
  const vaultHealth = snapshot ? percent(snapshot.counts.storesReady, snapshot.counts.stores) : 0
  const knowledgeHealth = snapshot ? percent(snapshot.counts.obsidianLoadedNotes, snapshot.obsidian.allowlistedNotes) : 0
  const poseidonHealth = snapshot ? percent(snapshot.counts.poseidonRuntimeFiles, 15) : 0
  const waitingApprovals = snapshot?.counts.approvalsWaiting ?? 0
  const commandRows: Array<RoomWorkbenchCommandRow> = snapshot ? [
    {
      id: 'database-spine',
      label: 'Database spine',
      value: snapshot.database.supabaseRuntimeConnected
        ? `${snapshot.database.workspaceCoreRunCount} runs · ${snapshot.database.workspaceCoreApprovalCount} approvals`
        : `${snapshot.database.localStoreFiles} local stores`,
      status: snapshot.database.supabaseRuntimeConnected ? 'DB connected' : 'Local fallback',
      next: snapshot.database.supabaseRuntimeConnected ? 'Use approvals; live senders stay locked' : 'Connect Workspace Core mirror before live executors',
      tone: snapshot.database.supabaseRuntimeConnected ? goodTone : warnTone,
    },
    {
      id: 'decision-queue',
      label: 'Decision queue',
      value: `${waitingApprovals} waiting`,
      status: waitingApprovals > 0 ? 'Needs DLV OK' : 'No waiting approvals',
      next: waitingApprovals > 0 ? 'Open approval cards' : 'Ready for the next action request',
      tone: waitingApprovals > 0 ? warnTone : goodTone,
    },
    {
      id: 'knowledge-shelf',
      label: 'Knowledge shelf',
      value: `${snapshot.counts.obsidianLoadedNotes}/${snapshot.obsidian.allowlistedNotes} notes`,
      status: `${knowledgeHealth}% context loaded`,
      next: snapshot.counts.obsidianMissingNotes + snapshot.counts.obsidianBlockedNotes > 0 ? 'Review missing notes' : 'Context shelf ready',
      tone: knowledgeHealth >= 80 ? goodTone : warnTone,
    },
    {
      id: 'asset-operator',
      label: 'Poseidon operator',
      value: `${snapshot.counts.poseidonRuntimeFiles}/15 files`,
      status: `${poseidonHealth}% visual runtime`,
      next: poseidonHealth >= 100 ? 'Operator art ready' : 'Fix missing runtime states',
      tone: poseidonHealth >= 100 ? goodTone : warnTone,
    },
  ] : []

  return (
    <section
      className={`atlantis-vault ${variant === 'primary' ? 'atlantis-vault--primary' : 'atlantis-vault--station'}`}
      data-atlantis-vault-surface="v1"
      data-atlantis-api-status={apiState.status}
      data-atlantis-source={snapshot?.source ?? 'pending'}
      data-live-actions-locked="true"
      data-read-only="true"
      aria-label="Atlantis Vault live data room"
    >
      <header className="atlantis-vault__header">
        <div className="atlantis-vault__identity">
          {snapshot ? <img src={snapshot.poseidon.portraitPath} alt="" /> : <span className="atlantis-vault__portrait-skeleton" aria-hidden="true" />}
          <div>
            <span>POSEIDON · ATLANTIS VAULT</span>
            <h2>כספת מקור האמת</h2>
            <p>{snapshot ? 'רואים מה אמין, מה חסר ואיזו חבילת מידע מוכנה — בלי לשנות את המקור.' : 'טוען מקורות קריאים עבור Hermes…'}</p>
          </div>
        </div>
        <div className="atlantis-vault__header-actions">
          {navigationSlot}
          <WorkspaceStationCta
            actionId="atlantis.refresh-source-index"
            label={apiState.status === 'loading' ? 'Refreshing index' : 'Refresh index'}
            sublabel={apiState.status === 'error' ? 'Readback blocked — check source proof' : 'Read-only source snapshot'}
            status={atlantisCtaStatus}
            ownerAgentId="poseidon"
            ownerLabel="Poseidon"
            targetRoomId="atlantis-vault"
            targetStationId="atlantis-index"
            targetToolLabel="Source Index"
            motionSignal={apiState.status === 'loading' ? 'work-at-tool' : apiState.status === 'error' ? 'blocked-at-gate' : 'standby'}
            className="atlantis-vault__refresh-cta"
            onPrimaryAction={refreshSnapshot}
            disabled={apiState.status === 'loading'}
            proofSummary="Reads current local/bridge/runtime sources. No DB, Obsidian, Etsy, or marketplace writes."
            proofItems={[
              `source: ${snapshot?.source ?? 'pending'}`,
              `truth store: ${snapshot ? truthStoreLabel(snapshot.database.activeTruthStore) : 'pending'}`,
            ]}
          />
        </div>
      </header>

      {apiState.status === 'error' && (
        <div className="atlantis-vault__error" role="status">
          <b>Atlantis could not refresh.</b>
          <span>{apiState.error}</span>
        </div>
      )}

      {!snapshot ? (
        <div className="atlantis-vault__loading" role="status">Reading live local stores…</div>
      ) : (
        <>
          <section className="atlantis-vault__command-deck" data-atlantis-visual-workbench="truth-vault-v3" aria-label="Poseidon truth vault overview">
            <div className="atlantis-vault__ocean-map" aria-label="Vault command map">
              <div className="atlantis-vault__map-copy">
                <span>בריאות מקור האמת</span>
                <h3>{snapshot.database.supabaseRuntimeConnected ? 'המקורות זמינים לקריאה' : 'פועל כרגע מהמקור המקומי'}</h3>
                <p>{snapshot.database.supabaseRuntimeConnected ? 'מקורות מקומיים, חבילות מידע והערות. הכתיבה נשארת נעולה.' : 'פועל רק מהמקור המקומי. חיבור חי למסד הנתונים עדיין לא מוכן.'}</p>
              </div>
              <div
                className="atlantis-vault__sonar"
                style={{ '--vault-health': `${vaultHealth * 3.6}deg` } as CSSProperties}
                aria-label={`Vault health ${vaultHealth}%`}
              >
                <strong>{vaultHealth}%</strong>
                <span>stores ready</span>
                {snapshot.stores.slice(0, NODE_POSITIONS.length).map((store, index) => {
                  const [nodeX, nodeY] = NODE_POSITIONS[index]
                  return (
                    <button
                      key={store.id}
                      type="button"
                      className="atlantis-vault__sonar-node"
                      data-node-state={store.state}
                      style={{ '--node-x': nodeX, '--node-y': nodeY } as CSSProperties}
                      onClick={() => setActiveStoreId(store.id)}
                      aria-label={`${store.label}: ${stateLabel(store.state)}`}
                    >
                      <b>{store.recordCount}</b>
                      <span>{store.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="atlantis-vault__brief-stack" aria-label="Atlantis decision brief">
              <article data-brief-tone={snapshot.database.supabaseRuntimeConnected ? 'good' : 'warn'}>
                <span>מצב ב־3 שניות</span>
                <h3>{snapshot.database.supabaseRuntimeConnected ? 'מקור האמת קריא. הביצוע נשאר נעול.' : 'החיבור למסד הנתונים עדיין לא פעיל.'}</h3>
                <p>{snapshot.database.supabaseRuntimeConnected ? `${snapshot.counts.runs} ריצות נקראו · ${snapshot.counts.approvalsWaiting} אישורים ממתינים · קריאה בלבד.` : snapshot.database.statement}</p>
              </article>
              <RoomWorkbenchPillRow
                ariaLabel="Safety locks"
                tone={snapshot.database.supabaseRuntimeConnected ? 'good' : 'warn'}
                items={[
                  snapshot.database.supabaseRuntimeConnected ? 'DB readback live' : 'Local fallback',
                  'Read-only API',
                  'No live sends',
                  'Executors locked',
                ]}
              />
            </div>
          </section>

          <div className="atlantis-vault__metrics" aria-label="Atlantis live counters">
            <article>
              <span>מקורות מוכנים</span>
              <strong>{snapshot.counts.storesReady}/{snapshot.counts.stores}</strong>
            </article>
            <article>
              <span>חבילות מידע</span>
              <strong>{snapshot.counts.artifacts}</strong>
            </article>
            <article>
              <span>הערות Obsidian</span>
              <strong>{snapshot.counts.obsidianLoadedNotes}/{snapshot.obsidian.allowlistedNotes}</strong>
            </article>
            <article>
              <span>ממתין לאישור</span>
              <strong>{snapshot.counts.approvalsWaiting}</strong>
            </article>
          </div>

          <div className="atlantis-vault__view-control">
            <div>
              <span>POSEIDON READBACK</span>
              <b>{detailsOpen ? 'מציג גם מקורות טכניים' : 'מציג רק את המידע שצריך להחלטה'}</b>
            </div>
            <button type="button" onClick={() => setDetailsOpen((current) => !current)} aria-expanded={detailsOpen} data-atlantis-toggle-details="true">
              {detailsOpen ? 'הסתר פרטים' : 'מקורות ופרטים'}
            </button>
          </div>

          <div className={`atlantis-vault__secondary-health ${detailsOpen ? 'is-open' : ''}`} data-atlantis-details-open={detailsOpen ? 'true' : 'false'}>
            <RoomWorkbenchCommandTable title="Source health" rows={commandRows} />
          </div>

          <main className="atlantis-vault__grid" data-atlantis-details-open={detailsOpen ? 'true' : 'false'}>
            <section className="atlantis-vault__map" aria-label="Live vault flow diagram">
              <div className="atlantis-vault__section-title">
                <span>זרימת ראיות</span>
                <b>{truthStoreLabel(snapshot.database.activeTruthStore)}</b>
              </div>
              <div className="atlantis-vault__flow-list">
                {snapshot.flow.map((edge) => (
                  <article key={edge.id} data-flow-state={edge.state}>
                    <div>
                      <b>{edge.from}</b>
                      <span>{edge.to}</span>
                    </div>
                    <div className="atlantis-vault__flow-track" aria-label={`${edge.label}: ${edge.value}`}>
                      <span style={{ width: flowWidth(edge, maxFlowValue) }} />
                    </div>
                    <em>{edge.value} · {edge.label}</em>
                  </article>
                ))}
              </div>
            </section>

            <section className="atlantis-vault__stores" aria-label="Live stores">
              <div className="atlantis-vault__section-title">
                <span>Stores</span>
                <b>{snapshot.counts.warnings + snapshot.counts.blocked} need check</b>
              </div>
              <div className="atlantis-vault__store-list">
                {snapshot.stores.map((store) => (
                  <button
                    type="button"
                    key={store.id}
                    className={activeStore?.id === store.id ? 'is-active' : ''}
                    data-store-state={store.state}
                    onClick={() => setActiveStoreId(store.id)}
                  >
                    <span>{store.label}</span>
                    <b>{store.recordCount}</b>
                    <em>{stateLabel(store.state)}</em>
                  </button>
                ))}
              </div>
              {activeStore && (
                <article className="atlantis-vault__store-detail" data-active-store={activeStore.id} data-store-tone={stateTone(activeStore.state)}>
                  <div>
                    <span>{storeKindLabel(activeStore.kind)}</span>
                    <h3>{activeStore.label}</h3>
                    <p>{activeStore.detail}</p>
                    <small>Updated: {formatTime(activeStore.updatedAtMs)}</small>
                  </div>
                  <details className="atlantis-vault__store-proof">
                    <summary>{activeStore.proof.length ? `${activeStore.proof.length} proof paths` : 'No proof path yet'}</summary>
                    {activeStore.proof.length ? (
                      <ul>
                        {activeStore.proof.slice(0, 8).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <p>No file path exists for this store yet.</p>
                    )}
                  </details>
                </article>
              )}
            </section>

            <section className="atlantis-vault__obsidian" aria-label="Obsidian allowlisted notes">
              <div className="atlantis-vault__section-title">
                <span>Obsidian shelf</span>
                <b>{snapshot.counts.obsidianMissingNotes + snapshot.counts.obsidianBlockedNotes} need check</b>
              </div>
              <div className="atlantis-vault__tabs" role="tablist" aria-label="Obsidian note filter">
                <button type="button" className={noteFilter === 'all' ? 'is-active' : ''} onClick={() => setNoteFilter('all')}>All</button>
                <button type="button" className={noteFilter === 'loaded' ? 'is-active' : ''} onClick={() => setNoteFilter('loaded')}>Loaded</button>
                <button type="button" className={noteFilter === 'needs-check' ? 'is-active' : ''} onClick={() => setNoteFilter('needs-check')}>Needs check</button>
              </div>
              <div className="atlantis-vault__note-list">
                {visibleNotes.length === 0 ? (
                  <p className="atlantis-vault__empty">No notes in this filter.</p>
                ) : visibleNotes.map((note) => (
                  <article key={note.noteId} data-note-status={note.status}>
                    <span>{note.kind}</span>
                    <b>{note.title}</b>
                    <small>{note.relativePath}</small>
                    <em>{note.status}{note.updatedAt ? ` · ${note.updatedAt.slice(0, 10)}` : ''}</em>
                  </article>
                ))}
              </div>
            </section>

            <section className="atlantis-vault__activity" aria-label="Recent Workspace packets">
              <div className="atlantis-vault__section-title">
                <span>חבילות אחרונות</span>
                <b>{snapshot.recentArtifacts.length} shown</b>
              </div>
              {snapshot.recentArtifacts.length === 0 ? (
                <p className="atlantis-vault__empty">No packets are stored yet in the local Kernel.</p>
              ) : (
                <div className="atlantis-vault__artifact-list">
                  {snapshot.recentArtifacts.map((artifact) => (
                    <article key={artifact.artifactId}>
                      <span>{artifactKindLabel(artifact.kind)}</span>
                      <b>{artifact.label}</b>
                      <small>{dataOriginLabel(artifact.dataOrigin)} · {formatTime(artifact.createdAtMs)}</small>
                      {artifact.missingFields.length > 0 && <em>Missing proof: {artifact.missingFields.slice(0, 3).map(humanizeToken).join(', ')}</em>}
                    </article>
                  ))}
                </div>
              )}
              <details className="atlantis-vault__proof" data-proof-collapsed="true">
                <summary>Source proof</summary>
                <dl>
                  <div><dt>Snapshot</dt><dd>{snapshot.schemaVersion}</dd></div>
                  <div><dt>Source</dt><dd>{snapshot.source}</dd></div>
                  <div><dt>Workspace Core</dt><dd>{snapshot.database.supabaseRuntimeConnected ? 'Supabase connected' : 'local fallback'}</dd></div>
                  <div><dt>DB rows</dt><dd>{snapshot.database.workspaceCoreRunCount} runs · {snapshot.database.workspaceCoreApprovalCount} approvals</dd></div>
                  <div><dt>Local store files</dt><dd>{snapshot.database.localStoreFiles}</dd></div>
                  <div><dt>Poseidon runtime files</dt><dd>{snapshot.counts.poseidonRuntimeFiles}</dd></div>
                </dl>
              </details>
            </section>
          </main>
        </>
      )}
    </section>
  )
}
