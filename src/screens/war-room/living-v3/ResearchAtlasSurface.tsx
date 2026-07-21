import { useEffect, useMemo, useState } from 'react'

import {
  RESEARCH_DEPTH_PRESETS,
  researchDepthPreset,
} from '../../../lib/war-room/living-v3/research-atlas-contract'
import type {
  ResearchAtlasSnapshot,
  ResearchDepth,
  ResearchMissionResponse,
  ResearchModuleId,
  ResearchTargetType,
} from '../../../lib/war-room/living-v3/research-atlas-contract'
import './research-atlas-surface.css'

type ResearchAtlasApiState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: ResearchAtlasSnapshot }
  | { status: 'failed'; error: string }

type ResearchMissionUiState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'staged'; result: ResearchMissionResponse }
  | { status: 'failed'; error: string }

type ResearchLabView = 'atlas' | 'new'

type ResearchAtlasSurfaceProps = {
  onReturnToProducts: () => void
  onMissionStaged?: (result: ResearchMissionResponse) => void
  returnLabel?: string
  embedded?: boolean
}

const TARGET_TYPES: Array<{ id: ResearchTargetType; label: string; hint: string }> = [
  { id: 'product', label: 'מוצר', hint: 'מוצר, נישה או listing' },
  { id: 'shop', label: 'חנות', hint: 'חנות Etsy אחת' },
  { id: 'market', label: 'כמה חנויות', hint: 'השוואה ומטא־אנליזה' },
]

const MODULE_LABELS: Record<ResearchModuleId, { label: string; hint: string }> = {
  'official-shop': { label: 'נתונים רשמיים', hint: 'Shop, listings, sales, rating' },
  catalog: { label: 'קטלוג', hint: 'מוצרים, משפחות ומחירים' },
  demand: { label: 'ביקוש', hint: 'אותות מכירה, מועדפים וריכוז' },
  reviews: { label: 'ביקורות', hint: 'קול לקוח וסיכונים חוזרים' },
  competitors: { label: 'מתחרים', hint: 'חנויות ומוצרים מקבילים' },
  'supplier-visual': { label: 'ספקים חזותיים', hint: 'Image search + micro-detail QA' },
  pricing: { label: 'מחיר ומרווח', hint: 'מחירי Etsy מול ספק, עם caveats' },
  seo: { label: 'SEO', hint: 'מילות מפתח, tags ו־competition' },
  risk: { label: 'סיכונים', hint: 'Truth gates, זכויות ומקור' },
  'meta-analysis': { label: 'מטא־אנליזה', hint: 'השוואה רוחבית ואתר מאוחד' },
}

function numberLabel(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function moneyLabel(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function fileSizeLabel(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function isResearchAtlasSnapshot(value: unknown): value is ResearchAtlasSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const snapshot = value as Partial<ResearchAtlasSnapshot>
  return snapshot.ok === true
    && snapshot.schemaVersion === 'war-room-research-atlas-v1'
    && Array.isArray(snapshot.shops)
    && Array.isArray(snapshot.downloads)
    && Boolean(snapshot.meta)
    && snapshot.safety?.readOnlySources === true
}

function isMissionResponse(value: unknown): value is ResearchMissionResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const response = value as {
    ok?: unknown
    packet?: {
      schemaVersion?: unknown
      safety?: { externalResearchStarted?: unknown }
    }
  }
  return response.ok === true
    && response.packet?.schemaVersion === 'war-room-research-mission-v1'
    && response.packet.safety?.externalResearchStarted === false
}

async function readJsonResponse(response: Response, label: string): Promise<unknown> {
  const readable = response as unknown as {
    status: number
    headers?: { get: (name: string) => string | null }
    json: () => Promise<unknown>
    text?: () => Promise<string>
  }
  const contentType = readable.headers?.get('content-type') ?? 'application/json'
  if (!contentType.includes('json')) {
    const detail = readable.text ? (await readable.text()).trim().slice(0, 180) : ''
    throw new Error(detail || `${label} unavailable (${readable.status})`)
  }
  try {
    return await readable.json()
  } catch {
    throw new Error(`${label} returned invalid JSON (${readable.status})`)
  }
}

export function ResearchAtlasSurface({ onReturnToProducts, onMissionStaged, returnLabel = 'חזרה למוצרים', embedded = false }: ResearchAtlasSurfaceProps) {
  const [apiState, setApiState] = useState<ResearchAtlasApiState>({ status: 'loading' })
  const [view, setView] = useState<ResearchLabView>('atlas')
  const [siteOpen, setSiteOpen] = useState(false)
  const [targetType, setTargetType] = useState<ResearchTargetType>('shop')
  const [target, setTarget] = useState('')
  const [depth, setDepth] = useState<ResearchDepth>('standard')
  const [modules, setModules] = useState<Array<ResearchModuleId>>(() => [...researchDepthPreset('standard').modules])
  const [notes, setNotes] = useState('')
  const [mission, setMission] = useState<ResearchMissionUiState>({ status: 'idle' })

  async function loadAtlas() {
    setApiState({ status: 'loading' })
    try {
      const response = await fetch('/api/war-room/research-atlas', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const payload = await readJsonResponse(response, 'Research Atlas')
      if (!response.ok || !isResearchAtlasSnapshot(payload)) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error?: unknown }).error)
          : `Research Atlas failed (${response.status})`
        throw new Error(message)
      }
      setApiState({ status: 'ready', snapshot: payload })
    } catch (error) {
      setApiState({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
    }
  }

  useEffect(() => {
    void loadAtlas()
  }, [])

  const selectedPreset = researchDepthPreset(depth)
  const canStage = target.trim().length >= 2 && modules.length > 0 && mission.status !== 'saving'
  const builderStep = mission.status === 'staged' ? 3 : canStage ? 2 : 1
  const builderStepLabel = builderStep === 3
    ? 'Packet saved · awaiting operator handoff'
    : builderStep === 2
      ? 'Review depth and modules'
      : 'Define the research target'
  const sourceSummary = useMemo(() => {
    if (apiState.status !== 'ready') return 'טוען מקורות מאומתים…'
    return `${apiState.snapshot.meta.shops} מחקרים · ${numberLabel(apiState.snapshot.meta.listings)} listings · QA עבר`
  }, [apiState])

  function selectDepth(nextDepth: ResearchDepth) {
    setDepth(nextDepth)
    setModules([...researchDepthPreset(nextDepth).modules])
    setMission({ status: 'idle' })
  }

  function toggleModule(moduleId: ResearchModuleId) {
    setModules((current) => current.includes(moduleId)
      ? current.filter((item) => item !== moduleId)
      : [...current, moduleId])
    setMission({ status: 'idle' })
  }

  async function stageMission() {
    if (!canStage) return
    setMission({ status: 'saving' })
    try {
      const response = await fetch('/api/war-room/research-atlas', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType, target: target.trim(), depth, modules, notes }),
      })
      const payload = await readJsonResponse(response, 'Research mission')
      if (!response.ok || !isMissionResponse(payload)) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error?: unknown }).error)
          : `Research mission failed (${response.status})`
        throw new Error(message)
      }
      setMission({ status: 'staged', result: payload })
      onMissionStaged?.(payload)
    } catch (error) {
      setMission({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <section
      className="research-atlas"
      dir="rtl"
      data-research-atlas-surface="v1"
      data-research-atlas-state={apiState.status}
      data-research-lab-view={view}
      aria-label="מעבדת מחקר מוצרים וחנויות"
    >
      {!embedded && (
        <header className="research-atlas__header">
          <div className="research-atlas__identity">
            <button type="button" className="research-atlas__back" onClick={onReturnToProducts}>{returnLabel}</button>
            <div>
              <p>LOKI · RESEARCH LAB</p>
              <h2>מחקר מוצרים, חנויות ושווקים</h2>
              <span>
                {apiState.status === 'ready' ? (
                  <>
                    {apiState.snapshot.meta.shops} מחקרים ·{' '}
                    <bdi dir="ltr">{numberLabel(apiState.snapshot.meta.listings)} listings</bdi>
                    {' '}· QA עבר
                  </>
                ) : sourceSummary}
              </span>
            </div>
          </div>
          <div className="research-atlas__safety" aria-label="מצב בטיחות">
            <span>Read-only sources</span>
            <span>No Etsy writes</span>
            <span>No supplier messages</span>
          </div>
        </header>
      )}

      <nav className="research-atlas__views" aria-label="Research Lab views">
        <button type="button" aria-pressed={view === 'atlas'} className={view === 'atlas' ? 'is-active' : ''} onClick={() => setView('atlas')}>
          <b>מחקרים קיימים</b><span>3 חנויות + האתר המלא</span>
        </button>
        <button type="button" aria-pressed={view === 'new'} className={view === 'new' ? 'is-active' : ''} onClick={() => setView('new')}>
          <b>מחקר חדש</b><span>מוצר, חנות או מטא־אנליזה</span>
        </button>
      </nav>

      {apiState.status === 'loading' && (
        <div className="research-atlas__state" role="status"><b>טוען את Research Atlas…</b><span>קורא את האתר, ה־workbooks ודוח ה־QA המקוריים.</span></div>
      )}
      {apiState.status === 'failed' && (
        <div className="research-atlas__state is-error" role="alert">
          <b>לא הצלחתי לקרוא את המחקרים</b><span>{apiState.error}</span><button type="button" onClick={() => void loadAtlas()}>נסה שוב</button>
        </div>
      )}

      {apiState.status === 'ready' && view === 'atlas' && (
        <div className="research-atlas__atlas">
          <section className="research-atlas__shop-section" aria-label="שלושת מחקרי החנויות">
            <div className="research-atlas__section-head">
              <div><p>VERIFIED STUDIES</p><h3>שלוש החנויות שכבר נחקרו</h3></div>
              <span>נאסף {apiState.snapshot.meta.generated}</span>
            </div>
            <div className="research-atlas__shops">
              {apiState.snapshot.shops.map((shop) => (
                <article key={shop.key} className="research-atlas__shop-card" data-research-shop={shop.key}>
                  <div className="research-atlas__shop-top">
                    <span>{shop.kind}</span>
                    <b>{shop.strongSupplierMatches}/{shop.supplierChecks} התאמות חזקות</b>
                  </div>
                  <h4>{shop.name}</h4>
                  <p>{shop.headline}</p>
                  <div className="research-atlas__shop-metrics">
                    <span><b>{numberLabel(shop.listings)}</b>מוצרים</span>
                    <span><b>{numberLabel(shop.officialSales)}</b>מכירות</span>
                    <span><b>{shop.rating || '—'}</b>דירוג</span>
                    <span><b>{moneyLabel(shop.medianPrice)}</b>חציון</span>
                  </div>
                  <div className="research-atlas__shop-actions">
                    {shop.workbookUrl ? <a className="is-primary" href={shop.workbookUrl}>פתח Workbook ↓</a> : <span>Workbook חסר</span>}
                    <a className="is-secondary" href={shop.url} target="_blank" rel="noreferrer">חנות Etsy ↗</a>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="research-atlas__kpis" aria-label="Research Atlas summary">
            <article><span>חנויות</span><strong>{apiState.snapshot.meta.shops}</strong><small>מחקרים מלאים</small></article>
            <article><span>Listings</span><strong>{numberLabel(apiState.snapshot.meta.listings)}</strong><small>קטלוגים שנקראו</small></article>
            <article><span>מכירות רשמיות</span><strong>{numberLabel(apiState.snapshot.meta.sales)}</strong><small>Shop totals</small></article>
            <article><span>ביקורות</span><strong>{numberLabel(apiState.snapshot.meta.reviews)}</strong><small>Official reviews</small></article>
          </section>

          <section className="research-atlas__site-panel" data-research-site-open={siteOpen ? 'true' : 'false'}>
            <div>
              <p>INTERACTIVE META ANALYSIS</p>
              <h3>האתר המלא — בתוך ה־War Room</h3>
              <span>השוואה רוחבית, Dive-in לכל חנות, מוצרים, ביקורות וספקים.</span>
            </div>
            <button type="button" onClick={() => setSiteOpen((current) => !current)}>
              {siteOpen ? 'סגור אתר' : 'פתח אתר אינטראקטיבי'}
            </button>
            {siteOpen && (
              <iframe
                title="DLDrop Etsy Research Atlas"
                src={apiState.snapshot.siteUrl}
                loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"
              />
            )}
          </section>

          <section className="research-atlas__downloads" aria-label="קבצי מחקר להורדה">
            <div className="research-atlas__section-head"><div><p>SOURCE FILES</p><h3>Workbooks מקוריים</h3></div></div>
            <div>
              {apiState.snapshot.downloads.map((file) => (
                <a key={file.id} href={file.url}>
                  <span><b>{file.label}</b><small>{file.fileName}</small></span><em>{fileSizeLabel(file.sizeBytes)} ↓</em>
                </a>
              ))}
            </div>
          </section>

          <details className="research-atlas__proof" data-research-proof-collapsed="true">
            <summary>מקורות, QA ושער אמת</summary>
            <p>{apiState.snapshot.qa.summary}</p>
            <strong>{apiState.snapshot.qa.truthBoundary}</strong>
            <a href={apiState.snapshot.qa.reportUrl} target="_blank" rel="noreferrer">פתח דוח QA ↗</a>
          </details>
        </div>
      )}

      {apiState.status === 'ready' && view === 'new' && (
        <form className="research-atlas__builder" onSubmit={(event) => { event.preventDefault(); void stageMission() }}>
          <section className="research-atlas__builder-intro">
            <div><p>NEW RESEARCH MISSION</p><h3>מה אתה רוצה לחקור?</h3><span>בחר יעד, עומק ומודולים. Loki ישמור packet שחוזר על אותה מתודולוגיה.</span></div>
            <span>שלב {builderStep} מתוך 3 · {builderStepLabel}</span>
          </section>

          <section className="research-atlas__target-types" aria-label="סוג מחקר">
            {TARGET_TYPES.map((item) => (
              <button key={item.id} type="button" aria-pressed={targetType === item.id} className={targetType === item.id ? 'is-active' : ''} onClick={() => { setTargetType(item.id); setMission({ status: 'idle' }) }}>
                <b>{item.label}</b><span>{item.hint}</span>
              </button>
            ))}
          </section>

          <label className="research-atlas__target-input">
            <span>מה לחקור?</span>
            <input
              dir="auto"
              value={target}
              onChange={(event) => { setTarget(event.target.value); setMission({ status: 'idle' }) }}
              placeholder={targetType === 'product' ? 'שם מוצר, נישה או URL' : targetType === 'shop' ? 'שם חנות או URL של Etsy' : 'רשימת חנויות / שוק להשוואה'}
            />
            <small>אפשר להדביק URL, שם חנות, מוצר או תיאור חופשי.</small>
          </label>

          <section className="research-atlas__depths" aria-label="רמת חקירה">
            <div className="research-atlas__section-head"><div><p>INVESTIGATION DEPTH</p><h3>רמת החקירה</h3></div><span>{selectedPreset.expectedOutput}</span></div>
            <div>
              {RESEARCH_DEPTH_PRESETS.map((preset) => (
                <button key={preset.id} type="button" aria-pressed={depth === preset.id} className={depth === preset.id ? 'is-active' : ''} onClick={() => selectDepth(preset.id)}>
                  <b>{preset.shortLabel}</b><span>{preset.description}</span><small>{preset.modules.length} מודולים</small>
                </button>
              ))}
            </div>
          </section>

          <section className="research-atlas__modules" aria-label="מודולי חקירה">
            <div className="research-atlas__section-head"><div><p>RESEARCH MODULES</p><h3>מה לכלול?</h3></div><span>{modules.length} נבחרו</span></div>
            <div>
              {(Object.entries(MODULE_LABELS) as Array<[ResearchModuleId, { label: string; hint: string }]>).map(([moduleId, item]) => (
                <label key={moduleId} className={modules.includes(moduleId) ? 'is-active' : ''}>
                  <input type="checkbox" checked={modules.includes(moduleId)} onChange={() => toggleModule(moduleId)} />
                  <span><b>{item.label}</b><small>{item.hint}</small></span>
                </label>
              ))}
            </div>
          </section>

          <label className="research-atlas__notes">
            <span>הערות מיוחדות</span>
            <textarea dir="auto" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="למשל: להתמקד בחנויות צעירות, לבדוק מקור מסין, לא להשתמש ב־Alura…" rows={3} />
          </label>

          <section className="research-atlas__submit">
            <div><b>{selectedPreset.label}</b><span>{modules.length} מודולים · Local mission packet בלבד</span></div>
            <button type="submit" disabled={!canStage}>{mission.status === 'saving' ? 'שומר…' : 'שמור משימת מחקר'}</button>
          </section>

          {mission.status === 'failed' && <div className="research-atlas__mission is-error" role="alert"><b>המשימה לא נשמרה</b><span>{mission.error}</span></div>}
          {mission.status === 'staged' && (
            <section className="research-atlas__mission" data-research-mission-state="staged" role="status" aria-live="polite">
              <div><p>MISSION STAGED</p><h3><bdi dir="ltr">{mission.result.packet.missionId}</bdi></h3><span>{mission.result.readback}</span></div>
              <div className="research-atlas__mission-summary" aria-label="Mission handoff summary">
                <span><small>Owner</small><b>{mission.result.packet.owner.agentId} · Product Search</b></span>
                <span><small>Progress</small><b>0 / {mission.result.packet.steps.length} complete</b></span>
                <span><small>Blocker</small><b>External research not started</b></span>
                <span><small>Next action</small><b>Review the packet before any external run</b></span>
              </div>
              <ol>{mission.result.packet.steps.map((step) => <li key={step.id} data-step-state={step.state}><b>{step.label}</b><span>ממתין</span></li>)}</ol>
              <details data-research-proof-collapsed="true">
                <summary>Packet ו־readback</summary>
                <span><bdi dir="ltr">{mission.result.savedPath}</bdi></span>
                <span><bdi dir="ltr">externalResearchStarted:false</bdi></span>
                <span><bdi dir="ltr">noMarketplaceWrites:true</bdi></span>
              </details>
            </section>
          )}
        </form>
      )}
    </section>
  )
}
