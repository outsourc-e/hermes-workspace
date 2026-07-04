import {  useEffect, useMemo, useRef, useState } from 'react'
import { bidiClassNameFor, textDirectionFor } from '../../../lib/war-room/living-v3/bidi-text'
import type {CSSProperties, ReactNode} from 'react';
import './council-chamber-surface.css'

type CouncilVote = 'support' | 'neutral' | 'against' | 'abstain'
type CouncilMotionState = 'roaming' | 'convening' | 'seated'
type CouncilMinimalView = 'council' | 'advisor'

const COUNCIL_STEP_PLAN_PROMPT = 'פרק את ההחלטה הזו לתוכנית מפורטת של שלבים: מה עושים ראשון, מי הבעלים, איך בודקים שזה עבד, מה הסיכון, ומה ה־fallback אם זה נכשל.'

type CouncilPoint = {
  x: number
  y: number
  flip?: -1 | 1
  scale?: number
  layer?: number
}

type CouncilRoamPoint = CouncilPoint & {
  driftX: string
  driftY: string
  duration: string
  delay: string
}

type CouncilGeneral = {
  id: string
  name: string
  shortName: string
  title: string
  assetSlug: string
  chairRow: number
  accent: string
  seat: CouncilPoint
  roam: CouncilRoamPoint
  mind: string
  strength: string
  caution: string
  quote: string
  personaLabel: string
  chatVoice: string
}

type CouncilTurn = {
  generalId: string
  generalName: string
  title: string
  accent: string
  thought: string
  vote: CouncilVote
  voteReason: string
  recommendedOption?: string
  reactions: Array<CouncilReaction>
  personaLabel: string
  replyTo?: string
  replySnippet?: string
  realStatus?: 'completed_local_only' | 'blocked' | 'failed'
  phase?: 'opinion' | 'peer-vote' | 'single-follow-up'
  contextUsed?: Array<string>
  peerReadback?: Array<string>
  riskFlags?: Array<string>
  usageReadback?: string
  suggestedFollowUp?: string
}

type CouncilChatMessage =
  | { id: string; type: 'turn'; turn: CouncilTurn }
  | { id: string; type: 'operator'; round: CouncilDiscussionRound }

type CouncilReaction = {
  emoji: string
  label: string
  by: Array<string>
}

type CouncilDiscussionRound = {
  id: string
  operatorOpinion: string
  answers: Array<CouncilTurn>
  createdAtLabel: string
  targetGeneralId?: string
}

type CouncilRecommendation = {
  title: string
  summary: string
  supportLine: string
  nextStep: string
  reason: string
  supportedBy: Array<string>
  options: Array<{
    label: string
    support: number
    voters: Array<string>
    voteBreakdown: {
      for: number
      neutral: number
      against: number
      abstain: number
    }
  }>
}

type CouncilSession = {
  packetId: string
  topic: string
  verdict: string
  summary: string
  voteLine: string
  turns: Array<CouncilTurn>
  discussionRounds: Array<CouncilDiscussionRound>
  createdAtLabel: string
  sourceMode: 'controlled-real-ai-one-shot' | 'running-real-ai' | 'blocked-real-ai' | 'legacy-local-preview'
  noFakeResponses: boolean
  contextPacketId?: string
  stats?: {
    total: number
    completed: number
    blocked: number
    failed: number
    for: number
    neutral?: number
    against: number
    guarded?: number
    abstain: number
    consensus: string
  }
  recommendation?: CouncilRecommendation
  error?: string
}

type CouncilHandoffState = 'idle' | 'unlocked' | 'sent'

type CouncilPersistedState = {
  version: 1
  topic: string
  operatorOpinion: string
  session: CouncilSession | null
  activeGeneralId: string
  motionState: CouncilMotionState
  handoffState: CouncilHandoffState
}

type CouncilArchivedSession = {
  packetId: string
  topic: string
  verdict: string
  archivedAtLabel: string
  session: CouncilSession
}

export type CouncilDecisionHandoff = {
  packetId: string
  topic: string
  verdict: string
  summary: string
  voteLine: string
  prompt: string
}

const COUNCIL_ASSET_VERSION = 'petdex-fixed-20260626-v8-png-council-v1'
const COUNCIL_CHAIR_ASSET_VERSION = 'petdex-fixed-20260626-v8-png-chatgpt-rowwise-v2'
const COUNCIL_ATLAS_ROOT = '/war-room/living-v3/generals-council'
const COUNCIL_WALK_FRAMES = 8
const COUNCIL_CHAIR_FRAMES = 6
const COUNCIL_LOCAL_THINKING_MIN_MS = 1_450
const COUNCIL_LOCAL_THINKING_MAX_MS = 4_600
const COUNCIL_REAL_AI_TIMEOUT_MS = 60_000
const COUNCIL_FAST_PASS_AGENT_TIMEOUT_MS = 45_000
const COUNCIL_FOLLOW_UP_AGENT_TIMEOUT_MS = 45_000
const COUNCIL_FAST_PASS_AGENT_IDS = ['council-julius', 'council-alexander', 'council-hannibal']
const COUNCIL_PERSISTENCE_STORAGE_KEY = 'hermes:war-room:council:decision-table:v1'
const COUNCIL_ARCHIVE_STORAGE_KEY = 'hermes:war-room:council:archive:v1'
const COUNCIL_ARCHIVE_LIMIT = 18

const councilGenerals: Array<CouncilGeneral> = [
  {
    id: 'julius',
    name: 'Julius Caesar',
    shortName: 'Julius',
    title: 'Chair · command discipline',
    assetSlug: 'julius-caesar-general-v1',
    chairRow: 0,
    accent: '#f6c56f',
    seat: { x: 50, y: 15, scale: 1.02, layer: 4 },
    roam: { x: 31, y: 31, scale: 1.02, layer: 4, driftX: '18px', driftY: '-10px', duration: '13s', delay: '-1.4s' },
    mind: 'decisive chain of command, one clear owner, visible mandate',
    strength: 'turns discussion into a concrete order of march',
    caution: 'will block chaos, duplicate leaders, or unclear authority',
    quote: 'No Rubicon crossing without naming the commander and the first mile.',
    personaLabel: 'מפקד מסודר',
    chatVoice: 'חותך רעש, מבקש בעלים וצעד ראשון',
  },
  {
    id: 'alexander',
    name: 'Alexander',
    shortName: 'Alexander',
    title: 'Expansion · bold momentum',
    assetSlug: 'alexander-general-v1',
    chairRow: 2,
    accent: '#ffb36b',
    seat: { x: 70, y: 31, flip: -1, scale: 1, layer: 3 },
    roam: { x: 73, y: 22, flip: -1, scale: 1, layer: 3, driftX: '-16px', driftY: '12px', duration: '12s', delay: '-3.5s' },
    mind: 'speed, visible progress, morale, and taking the hill before it cools',
    strength: 'pushes for the inspiring version that can be shown proudly',
    caution: 'hates timid incrementalism that produces no visible win',
    quote: 'If the gate is open, take the city — but make the banner worth seeing.',
    personaLabel: 'נועז ומהיר',
    chatVoice: 'דוחף לתקוף מהר ולהראות ניצחון',
  },
  {
    id: 'napoleon',
    name: 'Napoleon',
    shortName: 'Napoleon',
    title: 'Operations · logistics and cadence',
    assetSlug: 'napoleon-bonaparte-general-v1',
    chairRow: 2,
    accent: '#80d9ff',
    seat: { x: 80, y: 56, flip: -1, scale: 0.94, layer: 5 },
    roam: { x: 78, y: 73, flip: -1, scale: 0.94, layer: 5, driftX: '14px', driftY: '-18px', duration: '15s', delay: '-5.2s' },
    mind: 'timelines, manpower, sequence, acceptance criteria, and fallback paths',
    strength: 'compresses big ambition into a manageable execution plan',
    caution: 'will not approve a campaign without supply lines and QA gates',
    quote: 'An army marches on build, browser QA, and a clean next action.',
    personaLabel: 'איש ביצוע ו-QA',
    chatVoice: 'מוריד רעיונות לרצף, בדיקה וfallback',
  },
  {
    id: 'saladin',
    name: 'Saladin',
    shortName: 'Saladin',
    title: 'Integrity · trust and restraint',
    assetSlug: 'saladin-general-v1',
    chairRow: 3,
    accent: '#90e0a8',
    seat: { x: 62, y: 80, scale: 0.98, layer: 6 },
    roam: { x: 52, y: 86, scale: 0.98, layer: 6, driftX: '-20px', driftY: '-8px', duration: '14s', delay: '-2.3s' },
    mind: 'fairness, reputation, safety locks, user trust, and truthful claims',
    strength: 'keeps action clean enough to survive real-world consequences',
    caution: 'will force approval gates for money, customers, shops, or suppliers',
    quote: 'Victory that breaks trust is not victory; it is debt.',
    personaLabel: 'שומר אמון',
    chatVoice: 'עוצר זיוף, מגזים פחות, שומר אמת ואישור',
  },
  {
    id: 'genghis',
    name: 'Genghis Khan',
    shortName: 'Genghis',
    title: 'Scale · delegation and simple laws',
    assetSlug: 'genghis-khan-general-v1',
    chairRow: 0,
    accent: '#d0a66b',
    seat: { x: 38, y: 80, scale: 0.98, layer: 6 },
    roam: { x: 28, y: 76, scale: 0.98, layer: 6, driftX: '18px', driftY: '10px', duration: '16s', delay: '-4.4s' },
    mind: 'simple rules, fast messengers, strong routing, and reusable systems',
    strength: 'makes the plan scale beyond one manual hero action',
    caution: 'will reject complex procedures that cannot travel to another room',
    quote: 'Write the law once, then let the riders carry it everywhere.',
    personaLabel: 'מפשט למערכת',
    chatVoice: 'מחפש חוק קצר שאפשר לשכפל',
  },
  {
    id: 'hannibal',
    name: 'Hannibal Barca',
    shortName: 'Hannibal',
    title: 'Flank · risk and impossible routes',
    assetSlug: 'hannibal-barca-general-v1',
    chairRow: 6,
    accent: '#ff7d6e',
    seat: { x: 20, y: 56, scale: 0.96, layer: 5 },
    roam: { x: 20, y: 42, scale: 0.96, layer: 5, driftX: '22px', driftY: '-14px', duration: '13.5s', delay: '-6.1s' },
    mind: 'hidden risks, bot blockers, brittle flows, enemy terrain, and Plan B',
    strength: 'finds the path over the mountain when the obvious road is blocked',
    caution: 'will not trust a plan that has no failure mode or escape route',
    quote: 'The straight road is where the ambush waits. Show me the flank.',
    personaLabel: 'סקפטי ומחפש מארבים',
    chatVoice: 'מחפש איפה זה ירגיש מזויף ומה יישבר',
  },
]

function isKnownCouncilGeneralId(value: unknown): value is string {
  return typeof value === 'string' && councilGenerals.some((general) => general.id === value)
}

function normalizeCouncilMotionState(value: unknown, session: CouncilSession | null): CouncilMotionState {
  if (session) return 'seated'
  return value === 'convening' || value === 'seated' || value === 'roaming' ? value : 'roaming'
}

function normalizeCouncilHandoffState(value: unknown, session: CouncilSession | null): CouncilHandoffState {
  if (!session) return 'idle'
  return value === 'unlocked' || value === 'sent' || value === 'idle' ? value : 'idle'
}

function isCouncilSessionLike(value: unknown): value is CouncilSession {
  const session = value as Partial<CouncilSession> | null
  return Boolean(
    session
    && typeof session.packetId === 'string'
    && typeof session.topic === 'string'
    && typeof session.summary === 'string'
    && Array.isArray(session.turns)
    && Array.isArray(session.discussionRounds),
  )
}

function loadStoredCouncilState(): CouncilPersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(COUNCIL_PERSISTENCE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CouncilPersistedState>
    if (parsed.version !== 1) return null
    const session = isCouncilSessionLike(parsed.session) && parsed.session.sourceMode !== 'running-real-ai'
      ? parsed.session
      : null
    const topic = typeof parsed.topic === 'string'
      ? parsed.topic
      : session?.topic ?? ''
    const operatorOpinion = typeof parsed.operatorOpinion === 'string' ? parsed.operatorOpinion : ''
    return {
      version: 1,
      topic,
      operatorOpinion,
      session,
      activeGeneralId: isKnownCouncilGeneralId(parsed.activeGeneralId)
        ? parsed.activeGeneralId
        : session?.turns[0]?.generalId ?? councilGenerals[0].id,
      motionState: normalizeCouncilMotionState(parsed.motionState, session),
      handoffState: normalizeCouncilHandoffState(parsed.handoffState, session),
    }
  } catch {
    return null
  }
}

function saveStoredCouncilState(state: Omit<CouncilPersistedState, 'version'>): void {
  if (typeof window === 'undefined') return
  try {
    const session = state.session?.sourceMode === 'running-real-ai' ? null : state.session
    const payload: CouncilPersistedState = {
      version: 1,
      topic: state.topic,
      operatorOpinion: state.operatorOpinion,
      session,
      activeGeneralId: state.activeGeneralId,
      motionState: normalizeCouncilMotionState(state.motionState, session),
      handoffState: normalizeCouncilHandoffState(state.handoffState, session),
    }
    if (!payload.topic.trim() && !payload.operatorOpinion.trim() && !payload.session) {
      window.localStorage.removeItem(COUNCIL_PERSISTENCE_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(COUNCIL_PERSISTENCE_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Best-effort browser persistence. The Council still works if localStorage is unavailable.
  }
}

function clearStoredCouncilState(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(COUNCIL_PERSISTENCE_STORAGE_KEY)
  } catch {
    // Ignore storage failures; clearing the in-memory table is still safe.
  }
}

function loadCouncilArchive(): Array<CouncilArchivedSession> {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(COUNCIL_ARCHIVE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is CouncilArchivedSession => {
        const candidate = item as Partial<CouncilArchivedSession> | null
        return Boolean(
          candidate
          && typeof candidate.packetId === 'string'
          && typeof candidate.topic === 'string'
          && typeof candidate.verdict === 'string'
          && typeof candidate.archivedAtLabel === 'string'
          && isCouncilSessionLike(candidate.session)
          && candidate.session.sourceMode !== 'running-real-ai',
        )
      })
      .slice(0, COUNCIL_ARCHIVE_LIMIT)
  } catch {
    return []
  }
}

function saveCouncilArchive(entries: Array<CouncilArchivedSession>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(COUNCIL_ARCHIVE_STORAGE_KEY, JSON.stringify(entries.slice(0, COUNCIL_ARCHIVE_LIMIT)))
  } catch {
    // Best-effort only. The live Council session is unaffected if archive persistence fails.
  }
}

function upsertCouncilArchiveSession(session: CouncilSession): Array<CouncilArchivedSession> {
  if (session.sourceMode === 'running-real-ai') return loadCouncilArchive()
  const entry: CouncilArchivedSession = {
    packetId: session.packetId,
    topic: session.topic,
    verdict: session.verdict,
    archivedAtLabel: new Date().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }),
    session,
  }
  const archive = loadCouncilArchive().filter((item) => item.packetId !== session.packetId)
  const next = [entry, ...archive].slice(0, COUNCIL_ARCHIVE_LIMIT)
  saveCouncilArchive(next)
  return next
}

function voteLabel(vote: CouncilVote) {
  if (vote === 'support') return 'בעד'
  if (vote === 'neutral') return 'ניטרלי'
  if (vote === 'against') return 'נגד'
  return 'נמנע'
}

function voteTone(vote: CouncilVote) {
  if (vote === 'support') return 'support'
  if (vote === 'neutral') return 'neutral'
  if (vote === 'against') return 'against'
  return 'abstain'
}

function voteVisualLabel(vote?: CouncilVote) {
  if (!vote) return 'ממתין'
  return voteLabel(vote)
}

function votePhaseLabel(phase: 'idle' | 'queued' | 'thinking' | 'voted') {
  if (phase === 'thinking') return 'חושב עכשיו'
  if (phase === 'voted') return 'הצביע'
  if (phase === 'queued') return 'בתור להצגה'
  return 'ממתין'
}

function voteCountsFromTurns(turns: Array<CouncilTurn>) {
  return turns.reduce(
    (counts, turn) => {
      counts[turn.vote] += 1
      return counts
    },
    { support: 0, neutral: 0, against: 0, abstain: 0 } as Record<CouncilVote, number>,
  )
}

function neutralCount(stats?: CouncilSession['stats']) {
  return stats?.neutral ?? stats?.guarded ?? 0
}

function voteLineHebrew(stats?: CouncilSession['stats']) {
  if (!stats) return 'אין הצבעות עדיין'
  return `${stats.for} בעד · ${neutralCount(stats)} ניטרלי · ${stats.against} נגד · ${stats.abstain} נמנע`
}

function compactDecisionText(value: string, fallback: string, max = 96) {
  const oldNeutralHebrew = new RegExp('\\u05de\\u05e1\\u05d5\\u05d9\\u05d2(?:/\\u05de\\u05d5\\u05ea\\u05e0\\u05d4)?', 'g')
  const text = value.trim().replace(/\s+/g, ' ')
    .replace(/^נטיית המועצה:\s*/i, '')
    .replace(oldNeutralHebrew, 'ניטרלי')
    .replace(/guarded/gi, 'neutral')
  const safe = text || fallback
  return safe.length <= max ? safe : `${safe.slice(0, max - 1)}…`
}

function consensusHeadingFor(session: CouncilSession | null) {
  if (!session) return 'כתוב שאלה ונקבל מסקנה קצרה'
  if (session.sourceMode === 'running-real-ai') return 'מכין מסקנה קצרה…'
  if (session.sourceMode === 'blocked-real-ai') return 'לא התקבלה מסקנה'
  if (session.recommendation?.title) return compactDecisionText(session.recommendation.title, 'המלצה מוכנה', 96)
  const consensus = session.stats?.consensus
  if (consensus === 'for') return 'להמשיך'
  if (consensus === 'neutral' || consensus === 'guarded') return 'להמשיך רק אחרי בדיקה קצרה'
  if (consensus === 'against') return 'לא להתקדם כרגע'
  if (consensus === 'blocked') return 'לא התקבלה מסקנה'
  if (consensus === 'split') return 'אין רוב ברור'
  return compactDecisionText(session.verdict, 'מסקנה מוכנה')
}

function summaryForSession(session: CouncilSession | null) {
  if (!session) return 'כתוב שאלה אחת. המסקנה תופיע כאן קודם.'
  if (session.recommendation?.summary) return compactDecisionText(session.recommendation.summary, session.summary, 220)
  return compactDecisionText(session.summary, 'המועצה סיימה להצביע.', 220)
}

function nextStepFor(session: CouncilSession | null) {
  if (!session) return 'פתח נושא, ואז בחר יועץ או שאל את כל המועצה.'
  if (session.sourceMode === 'running-real-ai') return 'מחכה לקריאות AI אמיתיות.'
  if (session.sourceMode === 'blocked-real-ai') return 'בדוק את ה־runner או נסה שוב.'
  if (session.recommendation?.nextStep) return compactDecisionText(session.recommendation.nextStep, 'בחר יועץ, פרט את השלב הבא, ואז עבור ליועץ אחר.', 150)
  const firstSuggested = session.turns.find((turn) => turn.suggestedFollowUp)?.suggestedFollowUp
  return compactDecisionText(firstSuggested ?? 'בחר יועץ, פרט את השלב הבא, ואז עבור ליועץ אחר.', 'בחר יועץ, פרט את השלב הבא, ואז עבור ליועץ אחר.', 120)
}

function nextGeneralId(currentId: string) {
  const index = councilGenerals.findIndex((general) => general.id === currentId)
  const next = councilGenerals[(index + 1 + councilGenerals.length) % councilGenerals.length]
  return next?.id ?? councilGenerals[0].id
}

function followUpPromptFor(general: CouncilGeneral, turn: CouncilTurn | null) {
  if (turn?.suggestedFollowUp) return compactDecisionText(turn.suggestedFollowUp, `מה לשאול את ${general.shortName}?`, 118)
  if (general.id === 'julius') return 'מה ההחלטה, מי הבעלים, ומה הצעד הראשון?'
  if (general.id === 'alexander') return 'מה יגרום לזה להרגיש מרשים ולא חצי־כוח?'
  if (general.id === 'napoleon') return 'פרק את זה לשלבים, בדיקות ו-fallback.'
  if (general.id === 'saladin') return 'איפה צריך אמת, אישור או הגבלת פעולה?'
  if (general.id === 'genghis') return 'איזה כלל קצר יהפוך את זה למערכת שחוזרת על עצמה?'
  return 'מה יכול להישבר, ומה התוכנית העוקפת?'
}

function planningStageLabel(session: CouncilSession | null) {
  if (!session) return 'שלב 1 · פתח נושא'
  if (session.sourceMode === 'running-real-ai') return 'שלב 2 · המועצה קוראת וחושבת'
  if (session.sourceMode === 'blocked-real-ai') return 'חסום · נסה שוב או בדוק runner'
  const rounds = session.discussionRounds.filter((round) => round.answers.length > 0).length
  return rounds > 0 ? `שלב ${rounds + 2} · ממשיכים לפרט` : 'שלב 2 · בחר יועץ לשיחה'
}

function planningHintFor(session: CouncilSession | null, activeGeneral: CouncilGeneral) {
  if (!session) return 'זה לא חייב להיות ניסוח מושלם. כתוב מטרה, התלבטות או “מה לעשות קודם”.'
  if (session.sourceMode === 'blocked-real-ai') return 'אין תשובה מזויפת. נסה שוב רק אחרי שה־runner תקין.'
  return `עכשיו אפשר להתייעץ עם ${activeGeneral.shortName}, לדלג ליועץ הבא, או לשאול את כל המועצה מחדש עם ניסוח מדויק יותר.`
}

function topicSignals(topic: string) {
  const lower = topic.toLowerCase()
  const risky = /(publish|upload|buy|purchase|supplier|message|refund|renew|etsy|alura|live|money|customer|api|external|שלח|פרסם|קנייה|ספק|כסף|לקוח|חי|לייב|חיצונ)/i.test(topic)
  const visual = /(ui|visual|screen|page|workspace|war room|room|asset|animation|design|עמוד|חדר|אנימ|מסך|ויזואל|עיצוב|נראה|יפה|מסך)/i.test(topic)
  const strategic = /(plan|strategy|roadmap|decide|architecture|kernel|workflow|תכנון|אסטרטג|החלט|ארכיטקט|וורקפלואו|מסקנה|הרמס)/i.test(topic)
  const clarity = /(real|authentic|opinion|reaction|whatsapp|chat|אמיתי|דעה|ריאקש|וואטסאפ|צ'?אט|תגובה|תגובות)/i.test(topic)
  const unclear = topic.trim().length < 8
  return { lower, risky, visual, strategic, clarity, unclear }
}

function compactSubject(topic: string) {
  const compact = topic.trim().replace(/\s+/g, ' ')
  if (!compact) return 'הנושא הזה'
  if (compact.length <= 86) return compact
  return `${compact.slice(0, 83)}...`
}

function voteForGeneral(general: CouncilGeneral, topic: string): { vote: CouncilVote; reason: string } {
  const signals = topicSignals(topic)
  if (signals.unclear) return { vote: 'against', reason: 'השאלה קצרה מדי בשביל החלטה טובה' }
  if (general.id === 'saladin' && signals.risky) return { vote: 'neutral', reason: 'צריך אישור ברור לפני פעולה חיצונית או כספית' }
  if (general.id === 'hannibal' && signals.risky) return { vote: 'neutral', reason: 'יש סיכון גלוי; צריך דרך חזרה לפני פעולה' }
  if (general.id === 'napoleon' && !signals.strategic && !signals.visual) return { vote: 'neutral', reason: 'צריך scope ו-QA לפני ביצוע' }
  if (general.id === 'alexander' && signals.visual && !signals.risky) return { vote: 'support', reason: 'visible momentum is the right morale move' }
  if (general.id === 'genghis' && signals.strategic) return { vote: 'support', reason: 'the task can become a reusable operating law' }
  if (general.id === 'julius') return { vote: signals.risky ? 'neutral' : 'support', reason: signals.risky ? 'אפשר רק עם מנעולים ברורים' : 'המנדט ברור מספיק' }
  return { vote: signals.risky ? 'neutral' : 'support', reason: signals.risky ? 'להשאיר כ-packet מקומי עד אישור DLV' : 'מתאים לדחיפה מקומית ממוקדת' }
}

function compactOperatorOpinion(opinion: string) {
  const trimmed = opinion.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= 150) return trimmed
  return `${trimmed.slice(0, 147)}...`
}

function reaction(emoji: string, label: string, by: Array<string>, general: CouncilGeneral): CouncilReaction {
  return { emoji, label, by: by.filter((name) => name !== general.shortName).slice(0, 4) }
}

function reactionsForTurn(general: CouncilGeneral, vote: CouncilVote, mode: 'opening' | 'reply'): Array<CouncilReaction> {
  const voteReaction = vote === 'support'
    ? reaction('👍', 'מסכימים עם הכיוון', ['Julius', 'Alexander', 'Genghis'], general)
    : vote === 'neutral'
      ? reaction('🛡️', 'רוצים בדיקה קצרה', ['Napoleon', 'Saladin', 'Hannibal'], general)
      : reaction('⛔', 'דורשים עצירה והבהרה', ['Julius', 'Napoleon', 'Saladin'], general)

  const personality = general.id === 'julius'
    ? reaction('🫡', mode === 'opening' ? 'מנדט ברור' : 'קיבל את ניסוח DLV', ['Napoleon', 'Saladin'], general)
    : general.id === 'alexander'
      ? reaction('⚡', mode === 'opening' ? 'צריך להיראות חי' : 'דוחף לגרסה יותר נראית', ['Julius', 'Genghis'], general)
      : general.id === 'napoleon'
        ? reaction('📋', mode === 'opening' ? 'סדר ו-QA' : 'רוצה קריטריון קבלה', ['Julius', 'Hannibal'], general)
        : general.id === 'saladin'
          ? reaction('🤝', mode === 'opening' ? 'אמון לפני ניצחון' : 'שומר על אמון המשתמש', ['Napoleon', 'Hannibal'], general)
          : general.id === 'genghis'
            ? reaction('🐎', mode === 'opening' ? 'חוק שנוסע לכל החדרים' : 'פישט את המסר לחוק', ['Alexander', 'Julius'], general)
            : reaction('🐘', mode === 'opening' ? 'מצא את השטח המסוכן' : 'מצא פלנק/Plan B', ['Saladin', 'Napoleon'], general)

  const chatReaction = mode === 'reply'
    ? reaction('💬', 'תגובה לסבב הצ׳אט', ['DLV', 'Julius', 'Alexander', 'Napoleon', 'Saladin', 'Genghis', 'Hannibal'], general)
    : reaction('👀', 'נקרא בקבוצה', ['DLV', 'Julius', 'Alexander', 'Napoleon', 'Saladin', 'Genghis', 'Hannibal'], general)

  return [voteReaction, personality, chatReaction]
}

function openingThoughtForGeneral(general: CouncilGeneral, topic: string) {
  const subject = compactSubject(topic)
  const risky = topicSignals(topic).risky
  if (general.id === 'julius') {
    return `אני בעד להתחיל, אבל בלי הצגה. בשביל “${subject}” אני רוצה בעלים ברור, צעד ראשון קטן, וכפתור חזרה אם זה יוצא לא טוב.`
  }
  if (general.id === 'alexander') {
    return `אני בעד לתקוף את זה ישר, לא לחכות. הדרך: לבנות קודם צ׳אט חי קטן — תמונות, typing, ריאקשנס — ואז לשפר. אם זה לא נראה חי במסך, זה לא שווה.`
  }
  if (general.id === 'napoleon') {
    return `אלכסנדר, כן למהירות — אבל מסודר. אני רוצה acceptance קצר: רואים מי כותב, רואים שהוא חושב, יש 2–3 תגובות ביניהם, ואז סיכום. לא נאום.`
  }
  if (general.id === 'saladin') {
    return risky
      ? 'אני עוצר כל חיבור החוצה. קודם מוכיחים מקומית שזה אמיתי, ורק אחרי אישור של DLV מעבירים משהו להרמס.'
      : 'אני מסכים עם נפוליאון: לא למכור את זה כאילו אלו אייג׳נטים חיים אם זה עדיין local. עדיף להיות אמיתי: פרופילים שונים, דעות שונות, והכול מסומן מקומי.'
  }
  if (general.id === 'genghis') {
    return 'סלאח צודק. החוק צריך להיות פשוט: פרופיל אישיות → חושב/כותב → הודעה קצרה → ריאקשנס → תגובת DLV → סיכום אחד להרמס.'
  }
  return 'אני קצת מתנגד לאלכסנדר: אם הכול מופיע אינסטנט זה ירגיש מזויף. הפלנק שלי: להאט את זה בכוונה, להראות typing, ולתת להם לענות אחד לשני במקום רק ל-DLV.'
}

function openingReplyMeta(general: CouncilGeneral): Pick<CouncilTurn, 'replyTo' | 'replySnippet'> {
  if (general.id === 'alexander') return { replyTo: 'Julius', replySnippet: 'בעלים וצעד ראשון — כן, אבל מהר.' }
  if (general.id === 'napoleon') return { replyTo: 'Alexander', replySnippet: 'מהירות בלי QA תיראה כמו הצגה.' }
  if (general.id === 'saladin') return { replyTo: 'Napoleon', replySnippet: 'לא למכור את זה כחי אם זה מקומי.' }
  if (general.id === 'genghis') return { replyTo: 'Saladin', replySnippet: 'נהפוך את זה לחוק פשוט.' }
  if (general.id === 'hannibal') return { replyTo: 'Alexander', replySnippet: 'האינסטנט הוא המארב.' }
  return {}
}

function discussionThoughtForGeneral(general: CouncilGeneral, _session: CouncilSession, opinion: string) {
  const excerpt = compactOperatorOpinion(opinion)
  if (general.id === 'julius') {
    return `קיבלתי: “${excerpt}”. אני מוריד את ההצגה: תגובה קצרה, רגילה, ואז מסקנה אחת. אם אין בעלים וצעד הבא — לא מעבירים להרמס.`
  }
  if (general.id === 'alexander') {
    return `אני עם DLV פה. אם זה מרגיש תבניתי, צריך לתקוף את הבעיה בפרונט: avatar לכל שולח, “כותב...” לפני הודעה, ודעות חדות יותר.`
  }
  if (general.id === 'napoleon') {
    return `אלכסנדר, מסכים — אבל לא להפוך את זה לסרט. מספיק 6 הודעות קצרות, סבב תגובה אחד, וסיכום. המדד: מבינים את המסקנה תוך 10 שניות.`
  }
  if (general.id === 'saladin') {
    return `נפוליאון צודק. וגם צריך להגיד אמת: זה פרופיל מקומי עם אישיות, לא אייג׳נט עצמאי חי. אם נחבר אייג׳נטים אמיתיים, זה שלב נפרד ומאושר.`
  }
  if (general.id === 'genghis') {
    return `אני מסכם את החוק: כל פרופיל חייב להיות מובחן בשורה אחת — נועז, מסודר, שומר אמון, מפשט, סקפטי. בלי שפה היסטורית.`
  }
  return `הפלנק שלי: לא לתת לכולם להסכים. לפחות אחד חייב להגיד “רגע, זה עדיין מזויף אם...” ואז להציע תיקון קצר. זה מה שיהפוך את הדיון לאמין.`
}

function discussionReplyMeta(general: CouncilGeneral): Pick<CouncilTurn, 'replyTo' | 'replySnippet'> {
  if (general.id === 'julius') return { replyTo: 'DLV', replySnippet: 'פחות הצגה, יותר החלטה.' }
  if (general.id === 'alexander') return { replyTo: 'DLV', replySnippet: 'לתקוף את בעיית הזיוף בפרונט.' }
  if (general.id === 'napoleon') return { replyTo: 'Alexander', replySnippet: 'מהיר, אבל קצר ומדיד.' }
  if (general.id === 'saladin') return { replyTo: 'Napoleon', replySnippet: 'להיות אמתיים לגבי local profiles.' }
  if (general.id === 'genghis') return { replyTo: 'Saladin', replySnippet: 'להפוך את זה לחוק.' }
  return { replyTo: 'Alexander', replySnippet: 'לא כולם חייבים להסכים.' }
}

function discussionSummaryFor(session: CouncilSession, round: CouncilDiscussionRound) {
  const neutral = round.answers.filter((turn) => turn.vote === 'neutral').length
  const against = round.answers.filter((turn) => turn.vote === 'against').length
  const note = compactOperatorOpinion(round.operatorOpinion)
  if (against > 0) return `מסקנת ביניים: צריך לחדד לפני Hermes. כתבת: “${note}”.`
  if (neutral >= 2 || topicSignals(`${session.topic}\n${round.operatorOpinion}`).risky) {
    return `מסקנת ביניים: ממשיכים רק אחרי בדיקה קצרה ואישור ברור. כתבת: “${note}”.`
  }
  return `מסקנת ביניים: יש רוב להתקדם ל-slice קטן וברור. כתבת: “${note}”.`
}

function buildDiscussionRound(session: CouncilSession, rawOpinion: string): CouncilDiscussionRound {
  const opinion = rawOpinion.trim() || 'DLV wants one more local discussion round before sending anything to Hermes.'
  const answers = councilGenerals.map<CouncilTurn>((general) => {
    const vote = voteForGeneral(general, `${session.topic}\n${opinion}`)
    const meta = discussionReplyMeta(general)
    return {
      generalId: general.id,
      generalName: general.shortName,
      title: general.title,
      accent: general.accent,
      thought: discussionThoughtForGeneral(general, session, opinion),
      vote: vote.vote,
      voteReason: vote.reason,
      reactions: reactionsForTurn(general, vote.vote, 'reply'),
      personaLabel: general.personaLabel,
      replyTo: meta.replyTo,
      replySnippet: meta.replySnippet,
    }
  })
  return {
    id: `round-${Date.now().toString(36)}`,
    operatorOpinion: opinion,
    answers,
    createdAtLabel: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }
}

function buildCouncilSession(rawTopic: string): CouncilSession {
  const topic = rawTopic.trim() || 'What should the Workspace council decide next?'
  const turns = councilGenerals.map<CouncilTurn>((general) => {
    const vote = voteForGeneral(general, topic)
    const meta = openingReplyMeta(general)
    return {
      generalId: general.id,
      generalName: general.shortName,
      title: general.title,
      accent: general.accent,
      thought: openingThoughtForGeneral(general, topic),
      vote: vote.vote,
      voteReason: vote.reason,
      reactions: reactionsForTurn(general, vote.vote, 'opening'),
      personaLabel: general.personaLabel,
      replyTo: meta.replyTo,
      replySnippet: meta.replySnippet,
    }
  })
  const support = turns.filter((turn) => turn.vote === 'support').length
  const neutral = turns.filter((turn) => turn.vote === 'neutral').length
  const against = turns.filter((turn) => turn.vote === 'against').length
  const signals = topicSignals(topic)
  const verdict = against > 0
    ? 'לא להתקדם כרגע — צריך לחדד'
    : neutral >= 2 || signals.risky
      ? 'להמשיך רק אחרי בדיקה קצרה ואישור ברור'
      : 'ממשיכים — לבנות slice קטן, נראה, ומאומת'
  const summary = against > 0
    ? 'המועצה רוצה ניסוח חד יותר לפני שהיא מצביעה לביצוע.'
    : signals.risky
      ? 'המועצה תומכת רק כ-packet מקומי עם אישור מפורש לפני כל פעולה חיצונית, כספית, חנותית או מול לקוח.'
      : 'המועצה תומכת ב-slice ממוקד עם דעות נראות, ריאקשנס, ו-QA לפני הרחבה.'
  return {
    packetId: `council-${Date.now().toString(36)}`,
    topic,
    verdict,
    summary,
    voteLine: `${support} בעד · ${neutral} ניטרלי · ${against} נגד · 0 נמנע`,
    turns,
    discussionRounds: [],
    createdAtLabel: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    sourceMode: 'legacy-local-preview',
    noFakeResponses: false,
  }
}

function handoffPromptFor(session: CouncilSession) {
  const reactionLine = (turn: CouncilTurn) => turn.reactions
    .map((item) => `${item.emoji}${item.by.length} ${item.label}`)
    .join(' · ')
  const advice = session.turns
    .map((turn) => `- ${turn.generalName}: ${voteLabel(turn.vote)} — ${turn.voteReason}. ${turn.thought} Reactions: ${reactionLine(turn)}`)
    .join('\n')
  const discussion = session.discussionRounds.length > 0
    ? session.discussionRounds.map((round, index) => {
      const answers = round.answers
        .map((turn) => `  - ${turn.generalName}: ${voteLabel(turn.vote)} — ${turn.thought} Reactions: ${reactionLine(turn)}`)
        .join('\n')
      return `Round ${index + 1} · DLV opinion (${round.createdAtLabel}):\n${round.operatorOpinion}\nCouncil replies:\n${answers}`
    }).join('\n\n')
    : 'DLV did not add a separate discussion round before approving this packet.'
  return `Council decision packet ${session.packetId}\n\nTopic:\n${session.topic}\n\nVerdict:\n${session.verdict}\n\nSummary:\n${session.summary}\n\nVotes:\n${session.voteLine}\n\nOpening general notes:\n${advice}\n\nDLV discussion before handoff:\n${discussion}\n\nHermes: DLV approved this local council packet for discussion. Discuss with me how to execute this best in the Workspace. Keep it scoped, tool-first, local-only by default, and ask before any external/live/money/customer/supplier action.`
}

function generalSpritePath(assetSlug: string) {
  return `${COUNCIL_ATLAS_ROOT}/${assetSlug}/spritesheet.png?v=${COUNCIL_ASSET_VERSION}`
}

function generalChairSpritePath(assetSlug: string) {
  return `${COUNCIL_ATLAS_ROOT}/${assetSlug}/chair-sheet.png?v=${COUNCIL_CHAIR_ASSET_VERSION}`
}

function generalPortraitPath(assetSlug: string) {
  return `${COUNCIL_ATLAS_ROOT}/${assetSlug}/runtime/portrait.png?v=${COUNCIL_CHAIR_ASSET_VERSION}`
}

type RealCouncilApiTurn = {
  generalId: string
  label: string
  phase: 'opinion' | 'peer-vote' | 'single-follow-up'
  status: 'completed_local_only' | 'blocked' | 'failed'
  opinion: string
  vote: 'for' | 'neutral' | 'against' | 'guarded' | 'abstain'
  voteReason: string
  recommendedOption?: string
  confidence: number
  personalitySignal: string
  contextUsed: Array<string>
  peerReadback: Array<string>
  riskFlags: Array<string>
  suggestedFollowUp: string
  usageReadback: string
  error?: string
}

type RealCouncilApiResponse = {
  ok: boolean
  runId: string
  topic: string
  noFakeResponses: true
  contextPacket?: { packetId: string }
  openingTurns: Array<RealCouncilApiTurn>
  voteTurns: Array<RealCouncilApiTurn>
  stats: NonNullable<CouncilSession['stats']>
  recommendation?: CouncilRecommendation
  summary: string
  decisionPacket?: {
    packetId: string
    verdict: string
    voteLine: string
    summary: string
    recommendation?: CouncilRecommendation
    sourceContextPacketId: string
  }
  error?: string
}

type RealCouncilFollowUpResponse = {
  ok: boolean
  runId: string
  topic: string
  question: string
  noFakeResponses: true
  turn?: RealCouncilApiTurn
  error?: string
}

function councilAgentIdForGeneral(generalId: string) {
  return `council-${generalId}`
}

function peerOpinionsFromSession(session: CouncilSession | null) {
  if (!session) return []
  return session.turns
    .filter((turn) => turn.realStatus === 'completed_local_only')
    .map((turn) => ({
      generalId: turn.generalId,
      label: turn.generalName,
      opinion: turn.thought,
      vote: turn.vote === 'support' ? 'for' : turn.vote === 'neutral' ? 'neutral' : turn.vote === 'abstain' ? 'abstain' : 'against',
      voteReason: turn.voteReason,
    }))
}

function voteFromRealCouncil(vote: RealCouncilApiTurn['vote']): CouncilVote {
  if (vote === 'for') return 'support'
  if (vote === 'neutral' || vote === 'guarded') return 'neutral'
  if (vote === 'against') return 'against'
  return 'abstain'
}

function realCouncilVoteLabel(stats?: CouncilSession['stats']) {
  return voteLineHebrew(stats)
}

function turnFromRealCouncil(apiTurn: RealCouncilApiTurn): CouncilTurn {
  const general = councilGenerals.find((item) => item.id === apiTurn.generalId)
  const vote = voteFromRealCouncil(apiTurn.vote)
  const thought = apiTurn.status === 'completed_local_only'
    ? apiTurn.opinion
    : `לא התקבלה תשובת AI אמיתית מ-${apiTurn.label}. ${apiTurn.error ?? 'הקריאה נחסמה או נכשלה.'}`
  return {
    generalId: apiTurn.generalId,
    generalName: general?.shortName ?? apiTurn.label,
    title: general?.title ?? 'Council AI advisor',
    accent: general?.accent ?? '#f6c56f',
    thought,
    vote,
    voteReason: apiTurn.voteReason,
    recommendedOption: apiTurn.recommendedOption,
    reactions: [],
    personaLabel: general?.personaLabel ?? 'יועץ AI',
    realStatus: apiTurn.status,
    phase: apiTurn.phase,
    contextUsed: apiTurn.contextUsed,
    peerReadback: apiTurn.peerReadback,
    riskFlags: apiTurn.riskFlags,
    usageReadback: apiTurn.usageReadback,
    suggestedFollowUp: apiTurn.suggestedFollowUp,
  }
}

function pendingCouncilSession(topic: string): CouncilSession {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return {
    packetId: `council-running-${Date.now().toString(36)}`,
    topic,
    verdict: 'מכין מסקנה קצרה',
    summary: 'אם AI ייכשל — נראה חסימה, לא תשובה מזויפת.',
    voteLine: 'ממתין להצבעות אמיתיות',
    turns: [],
    discussionRounds: [],
    createdAtLabel: now,
    sourceMode: 'running-real-ai',
    noFakeResponses: true,
  }
}

function blockedCouncilSession(topic: string, error: string): CouncilSession {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return {
    packetId: `council-blocked-${Date.now().toString(36)}`,
    topic,
    verdict: 'לא התקבלה מסקנה',
    summary: error,
    voteLine: '0 בעד · 0 ניטרלי · 0 נגד · 0 נמנע',
    turns: [],
    discussionRounds: [],
    createdAtLabel: now,
    sourceMode: 'blocked-real-ai',
    noFakeResponses: true,
    error,
    stats: { total: 6, completed: 0, blocked: 0, failed: 6, for: 0, neutral: 0, against: 0, abstain: 0, consensus: 'blocked' },
  }
}

function sessionFromRealCouncil(data: RealCouncilApiResponse): CouncilSession {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const realTurns = (data.voteTurns?.length ? data.voteTurns : data.openingTurns).map(turnFromRealCouncil)
  return {
    packetId: data.decisionPacket?.packetId ?? data.runId,
    topic: data.topic,
    verdict: data.decisionPacket?.verdict ?? data.summary,
    summary: data.summary,
    voteLine: realCouncilVoteLabel(data.stats),
    turns: realTurns,
    discussionRounds: [],
    createdAtLabel: now,
    sourceMode: data.ok ? 'controlled-real-ai-one-shot' : 'blocked-real-ai',
    noFakeResponses: true,
    contextPacketId: data.decisionPacket?.sourceContextPacketId ?? data.contextPacket?.packetId,
    stats: data.stats,
    recommendation: data.decisionPacket?.recommendation ?? data.recommendation,
    error: data.error,
  }
}

async function fetchCouncilJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs = COUNCIL_REAL_AI_TIMEOUT_MS): Promise<{ response: Response; data: T }> {
  const controller = new AbortController()
  let didTimeout = false
  const timeout = window.setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const data = await response.json() as T
    return { response, data }
  } catch (error) {
    if (didTimeout) throw new Error(`Council API timed out after ${Math.round(timeoutMs / 1000)}s`)
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

async function fetchRealCouncilSession(topic: string): Promise<CouncilSession> {
  const { response, data } = await fetchCouncilJsonWithTimeout<RealCouncilApiResponse>('/api/war-room/council/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      topic,
      includePeerVote: false,
      timeoutMs: COUNCIL_FAST_PASS_AGENT_TIMEOUT_MS,
      agentIds: COUNCIL_FAST_PASS_AGENT_IDS,
    }),
  })
  if (!response.ok) {
    return blockedCouncilSession(topic, data.error ?? `Council API failed with HTTP ${response.status}`)
  }
  return sessionFromRealCouncil(data)
}

async function fetchRealCouncilFollowUp(input: {
  session: CouncilSession
  generalId: string
  question: string
}): Promise<CouncilTurn> {
  const { response, data } = await fetchCouncilJsonWithTimeout<RealCouncilFollowUpResponse>('/api/war-room/council/follow-up', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      topic: input.session.topic,
      question: input.question,
      agentId: councilAgentIdForGeneral(input.generalId),
      previousOpinions: peerOpinionsFromSession(input.session),
      timeoutMs: COUNCIL_FOLLOW_UP_AGENT_TIMEOUT_MS,
    }),
  })
  if (response.ok && data.turn) {
    return turnFromRealCouncil(data.turn)
  }
  const returnedError = data.turn?.error ?? data.error
  if (data.turn) {
    return turnFromRealCouncil({
      ...data.turn,
      error: returnedError ?? data.turn.error,
    })
  }
  return turnFromRealCouncil({
    generalId: input.generalId,
    label: councilGenerals.find((general) => general.id === input.generalId)?.shortName ?? input.generalId,
    phase: 'single-follow-up',
    status: 'failed',
    opinion: '',
    vote: 'abstain',
    voteReason: 'No real AI follow-up returned; no fake response was generated.',
    confidence: 0,
    personalitySignal: 'Real AI follow-up failed closed.',
    contextUsed: [],
    peerReadback: [],
    riskFlags: ['follow-up AI call failed'],
    suggestedFollowUp: 'Retry after checking the controlled runner.',
    usageReadback: 'no usage reported',
    error: returnedError ?? `Council follow-up failed with HTTP ${response.status}`,
  })
}

function chatMessagesFor(session: CouncilSession): Array<CouncilChatMessage> {
  const opening = session.turns.map((turn) => ({ id: `opening-${turn.generalId}`, type: 'turn' as const, turn }))
  const rounds = session.discussionRounds.flatMap<CouncilChatMessage>((round) => [
    { id: `${round.id}-dlv`, type: 'operator', round },
    ...round.answers.map((turn) => ({ id: `${round.id}-${turn.generalId}`, type: 'turn' as const, turn })),
  ])
  return [...opening, ...rounds]
}

function messageBelongsToAdvisor(message: CouncilChatMessage, generalId: string) {
  if (message.type === 'turn') return message.turn.generalId === generalId
  return message.round.targetGeneralId === generalId
    || message.round.targetGeneralId === 'council'
    || message.round.answers.some((turn) => turn.generalId === generalId)
}

function advisorChatMessagesFor(session: CouncilSession, generalId: string): Array<CouncilChatMessage> {
  return chatMessagesFor(session).filter((message) => messageBelongsToAdvisor(message, generalId))
}

function typingLabelFor(message: CouncilChatMessage | null) {
  if (!message) return ''
  if (message.type === 'operator') return 'השאלה שלך נכנסה לצ׳אט המועצה...'
  const general = councilGenerals.find((item) => item.id === message.turn.generalId)
  return `${general?.shortName ?? message.turn.generalName} מציג תשובת AI אמיתית...`
}

function delayForChatMessage(message: CouncilChatMessage | null, messageIndex: number) {
  if (!message) return 0
  if (message.type === 'operator') return 680
  const wordCount = message.turn.thought.trim().split(/\s+/).filter(Boolean).length
  const draftTime = Math.min(COUNCIL_LOCAL_THINKING_MAX_MS - COUNCIL_LOCAL_THINKING_MIN_MS, wordCount * 92)
  const roundStagger = (messageIndex % councilGenerals.length) * 210
  return COUNCIL_LOCAL_THINKING_MIN_MS + draftTime + roundStagger
}

function councilGeneralStyle(general: CouncilGeneral, motionState: CouncilMotionState): CSSProperties {
  const point = motionState === 'roaming' ? general.roam : general.seat
  return {
    '--general-x': `${point.x}%`,
    '--general-y': `${point.y}%`,
    '--general-accent': general.accent,
    '--general-layer': point.layer ?? general.seat.layer ?? 3,
    '--sprite-scale': point.scale ?? general.seat.scale ?? 1,
    '--chair-row-y': `${(general.chairRow / 7) * 100}%`,
    '--roam-drift-x': general.roam.driftX,
    '--roam-drift-y': general.roam.driftY,
    '--roam-duration': general.roam.duration,
    '--roam-delay': general.roam.delay,
  } as CSSProperties
}

function CouncilTurnBubble({ turn }: { turn: CouncilTurn }) {
  const general = councilGenerals.find((item) => item.id === turn.generalId)
  return (
    <article
      className={`council-chamber__bubble is-${voteTone(turn.vote)}`}
      style={{ '--general-accent': turn.accent } as CSSProperties}
      data-council-opinion={turn.generalId}
      data-council-reactions={turn.reactions.length}
      data-council-persona={turn.personaLabel}
      data-council-avatar={general ? 'true' : 'false'}
    >
      <div className="council-chamber__message-row">
        <span
          className="council-chamber__avatar council-chamber__avatar--portrait"
          style={general ? {
            backgroundImage: `url("${generalPortraitPath(general.assetSlug)}")`,
          } as CSSProperties : undefined}
          data-council-avatar-source={general ? 'runtime-portrait' : 'initials'}
          aria-hidden="true"
        >
          {!general && turn.generalName.slice(0, 2)}
        </span>
        <div className="council-chamber__message-body">
          <div className="council-chamber__bubble-head">
            <span>{turn.generalName}</span>
            <em>{turn.personaLabel}</em>
            <b>{voteLabel(turn.vote)}</b>
          </div>
          {turn.replyTo && (
            <div className="council-chamber__reply-context">
              <span>↪ {turn.replyTo}</span>
              <p>{turn.replySnippet}</p>
            </div>
          )}
          <p className={bidiClassNameFor(turn.thought)} dir={textDirectionFor(turn.thought)}>{turn.thought}</p>
          <div className="council-chamber__reactions" aria-label={`Reactions to ${turn.generalName}`}>
            {turn.reactions.map((item) => (
              <span key={`${turn.generalId}-${item.emoji}-${item.label}`} title={`${item.label}: ${item.by.join(', ')}`}>
                <em aria-hidden="true">{item.emoji}</em>
                <b>{item.by.length}</b>
              </span>
            ))}
          </div>
          <small>{turn.voteReason}</small>
        </div>
      </div>
    </article>
  )
}

function OperatorRoundBubble({ round, fallbackGeneral }: { round: CouncilDiscussionRound; fallbackGeneral: CouncilGeneral }) {
  const targetGeneral = councilGenerals.find((general) => general.id === round.targetGeneralId)
  const targetLabel = round.targetGeneralId === 'council'
    ? 'המועצה'
    : targetGeneral?.shortName ?? fallbackGeneral.shortName
  return (
    <article className="council-chamber__bubble council-chamber__bubble--dlv" data-council-operator-reply="true">
      <div className="council-chamber__message-row">
        <span className="council-chamber__avatar council-chamber__avatar--dlv" aria-hidden="true">DLV</span>
        <div className="council-chamber__message-body">
          <div className="council-chamber__bubble-head">
            <span>DLV · {round.createdAtLabel}</span>
            <em>שאלה שלך</em>
            <b>{targetLabel}</b>
          </div>
          <p className={bidiClassNameFor(round.operatorOpinion)} dir={textDirectionFor(round.operatorOpinion)}>{round.operatorOpinion}</p>
          <div className="council-chamber__read-receipts">✓ נשלח אל {targetLabel}</div>
        </div>
      </div>
    </article>
  )
}

function TypingBubble({ message }: { message: CouncilChatMessage | null }) {
  if (!message || message.type === 'operator') return null
  const general = councilGenerals.find((item) => item.id === message.turn.generalId)
  return (
    <article className="council-chamber__typing" data-council-typing="true" data-council-typing-general={message.turn.generalId}>
      <span
        className="council-chamber__avatar council-chamber__avatar--portrait"
        style={general ? {
          backgroundImage: `url("${generalPortraitPath(general.assetSlug)}")`,
        } as CSSProperties : undefined}
        data-council-avatar-source={general ? 'runtime-portrait' : 'initials'}
        aria-hidden="true"
      />
      <div>
        <b>{typingLabelFor(message)}</b>
        <span aria-hidden="true"><i /> <i /> <i /></span>
      </div>
    </article>
  )
}

export function CouncilChamberSurface({
  onClose,
  onTransferToHermes,
  navigationSlot,
}: {
  onClose: () => void
  onTransferToHermes: (handoff: CouncilDecisionHandoff) => void
  navigationSlot?: ReactNode
}) {
  const [initialCouncilState] = useState(() => loadStoredCouncilState())
  const [topic, setTopic] = useState(() => initialCouncilState?.topic ?? '')
  const [operatorOpinion, setOperatorOpinion] = useState(() => initialCouncilState?.operatorOpinion ?? '')
  const [session, setSession] = useState<CouncilSession | null>(() => initialCouncilState?.session ?? null)
  const [activeGeneralId, setActiveGeneralId] = useState(() => initialCouncilState?.activeGeneralId ?? councilGenerals[0].id)
  const [motionState, setMotionState] = useState<CouncilMotionState>(() => initialCouncilState?.motionState ?? 'roaming')
  const [handoffState, setHandoffState] = useState<CouncilHandoffState>(() => initialCouncilState?.handoffState ?? 'idle')
  const [visibleMessageCount, setVisibleMessageCount] = useState(() => initialCouncilState?.session ? chatMessagesFor(initialCouncilState.session).length : 0)
  const [councilRunPending, setCouncilRunPending] = useState(false)
  const [minimalView, setMinimalView] = useState<CouncilMinimalView>('council')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveEntries, setArchiveEntries] = useState<Array<CouncilArchivedSession>>(() => loadCouncilArchive())
  const chatRef = useRef<HTMLDivElement | null>(null)
  const advisorChatRef = useRef<HTMLDivElement | null>(null)
  const handoffUnlocked = Boolean(session && handoffState !== 'idle')
  const activeGeneral = councilGenerals.find((general) => general.id === activeGeneralId) ?? councilGenerals[0]
  const latestRound = session?.discussionRounds[session.discussionRounds.length - 1] ?? null
  const activeTurn = latestRound?.answers.find((turn) => turn.generalId === activeGeneral.id)
    ?? session?.turns.find((turn) => turn.generalId === activeGeneral.id)
    ?? null
  const nextGeneral = councilGenerals.find((general) => general.id === nextGeneralId(activeGeneral.id)) ?? councilGenerals[0]
  const activeAdvisorPrompt = followUpPromptFor(activeGeneral, activeTurn)
  const planningStage = planningStageLabel(session)
  const planningHint = planningHintFor(session, activeGeneral)
  const completedConsultations = session?.discussionRounds.filter((round) => round.answers.length > 0).length ?? 0
  const planningPromptChips = [
    { label: 'השלב הבא', prompt: 'מה השלב הבא המדויק שכדאי לעשות?' },
    { label: 'תוכנית עבודה', prompt: 'פרק את זה לתוכנית עבודה קצרה לפי שלבים.' },
    { label: 'סיכונים', prompt: 'מה יכול להישבר ומה ה־fallback?' },
    { label: 'להראות לחברים', prompt: 'מה צריך להשתנות כדי שזה יהיה ברור ומרשים למישהו שרואה פעם ראשונה?' },
  ]
  const handoff = useMemo<CouncilDecisionHandoff | null>(() => session
    ? {
      packetId: session.packetId,
      topic: session.topic,
      verdict: session.verdict,
      summary: session.summary,
      voteLine: session.voteLine,
      prompt: handoffPromptFor(session),
    }
    : null,
  [session])
  const chatMessages = useMemo(() => session ? chatMessagesFor(session) : [], [session])
  const advisorChatMessages = useMemo(() => session ? advisorChatMessagesFor(session, activeGeneral.id) : [], [activeGeneral.id, session])
  const visibleChatMessages = chatMessages.slice(0, visibleMessageCount)
  const visibleAdvisorChatMessages = visibleChatMessages.filter((message) => messageBelongsToAdvisor(message, activeGeneral.id))
  const pendingChatMessage = visibleMessageCount < chatMessages.length ? chatMessages[visibleMessageCount] : null
  const advisorPendingMessage = pendingChatMessage && messageBelongsToAdvisor(pendingChatMessage, activeGeneral.id) ? pendingChatMessage : null
  const currentDecisionTurns = latestRound?.answers.length ? latestRound.answers : session?.turns ?? []
  const currentDecisionTurnByGeneral = new Map(currentDecisionTurns.map((turn) => [turn.generalId, turn]))
  const visibleVoteGeneralIds = new Set(visibleChatMessages
    .filter((message): message is Extract<CouncilChatMessage, { type: 'turn' }> => message.type === 'turn')
    .map((message) => message.turn.generalId))
  const pendingVoteGeneralId = pendingChatMessage?.type === 'turn' ? pendingChatMessage.turn.generalId : ''
  const voteCounts = session?.stats
    ? {
      support: session.stats.for,
      neutral: neutralCount(session.stats),
      against: session.stats.against,
      abstain: session.stats.abstain,
    }
    : voteCountsFromTurns(currentDecisionTurns)
  const voteTotal = Math.max(1, voteCounts.support + voteCounts.neutral + voteCounts.against + voteCounts.abstain)
  const voteMeterStyle = {
    '--vote-support-pct': `${(voteCounts.support / voteTotal) * 100}%`,
    '--vote-neutral-pct': `${(voteCounts.neutral / voteTotal) * 100}%`,
    '--vote-against-pct': `${(voteCounts.against / voteTotal) * 100}%`,
    '--vote-abstain-pct': `${(voteCounts.abstain / voteTotal) * 100}%`,
  } as CSSProperties
  const canWakeCouncil = topic.trim().length > 0
  const councilResponsesVisible = Boolean(session && session.turns.length > 0)
  const councilAiMode = session?.sourceMode ?? 'controlled-real-ai-ready-idle'
  const councilResponseMode = session?.sourceMode === 'controlled-real-ai-one-shot'
    ? 'real-ai-one-shot-results'
    : session?.sourceMode === 'running-real-ai'
      ? 'real-ai-running-no-fake-responses'
      : session?.sourceMode === 'blocked-real-ai'
        ? 'real-ai-blocked-no-fake-response'
        : 'real-ai-ready-no-local-fallback'
  const displayedQuestion = session?.topic ?? topic.trim()
  const consensusTitle = consensusHeadingFor(session)
  const consensusSummary = summaryForSession(session)
  const consensusNextStep = nextStepFor(session)
  const voteReadout = session ? voteLineHebrew(session.stats) : '0 בעד · 0 ניטרלי · 0 נגד · 0 נמנע'
  const visibleVoteCount = visibleVoteGeneralIds.size
  const liveDecisionTimeline = [
    {
      key: 'input',
      label: 'נושא',
      state: displayedQuestion ? 'done' : 'waiting',
      detail: displayedQuestion ? compactDecisionText(displayedQuestion, 'נושא פתוח', 44) : 'מחכה לשאלה',
    },
    {
      key: 'thinking',
      label: 'חשיבה',
      state: councilRunPending || pendingChatMessage ? 'active' : session ? 'done' : 'waiting',
      detail: councilRunPending ? 'היועצים חושבים' : session ? 'הדעות נאספו' : 'טרם התחיל',
    },
    {
      key: 'vote',
      label: 'הצבעה',
      state: session ? visibleVoteCount < currentDecisionTurns.length ? 'active' : 'done' : 'waiting',
      detail: session ? `${visibleVoteCount}/${currentDecisionTurns.length || councilGenerals.length} קולות נחשפו` : 'עוד אין קולות',
    },
    {
      key: 'decision',
      label: 'מסקנה',
      state: session && visibleMessageCount >= chatMessages.length ? 'done' : session ? 'active' : 'waiting',
      detail: session ? compactDecisionText(consensusTitle, session.verdict, 44) : 'תופיע אחרי ההצבעה',
    },
  ]
  const councilHasPersistableState = Boolean(session || topic.trim() || operatorOpinion.trim())
  const minimalMode = session ? minimalView : 'start'
  const primaryCouncilAnswer = session?.recommendation?.supportLine
    ?? consensusNextStep
    ?? consensusTitle

  useEffect(() => {
    if (councilRunPending) return
    saveStoredCouncilState({
      topic,
      operatorOpinion,
      session,
      activeGeneralId,
      motionState,
      handoffState,
    })
  }, [activeGeneralId, councilRunPending, handoffState, motionState, operatorOpinion, session, topic])

  useEffect(() => {
    if (!session || session.sourceMode === 'running-real-ai') return
    setArchiveEntries(upsertCouncilArchiveSession(session))
  }, [session])

  useEffect(() => {
    if (!session) {
      setVisibleMessageCount(0)
      return undefined
    }
    if (visibleMessageCount >= chatMessages.length) return undefined
    const nextMessage = chatMessages[visibleMessageCount]
    const delayMs = delayForChatMessage(nextMessage, visibleMessageCount)
    const timeout = window.setTimeout(() => {
      setVisibleMessageCount((count) => Math.min(count + 1, chatMessages.length))
    }, delayMs)
    return () => window.clearTimeout(timeout)
  }, [session, chatMessages, visibleMessageCount])

  useEffect(() => {
    const node = chatRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [visibleMessageCount, pendingChatMessage?.id, session?.packetId])

  useEffect(() => {
    const node = advisorChatRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [activeGeneral.id, advisorPendingMessage?.id, session?.packetId, visibleAdvisorChatMessages.length])

  const stateLabel = handoffState === 'sent'
    ? 'נשלח להרמס'
    : handoffUnlocked
      ? 'מסקנה מוכנה להרמס'
      : session
        ? session.sourceMode === 'running-real-ai'
          ? 'קורא Obsidian ומריץ גנרלים אמיתיים'
          : session.sourceMode === 'blocked-real-ai'
            ? 'AI נחסם · אין תשובות מזויפות'
              : latestRound
                ? `שיחת תכנון 1:1 · ${activeGeneral.shortName}`
                : visibleMessageCount < chatMessages.length
                ? 'מציג תשובות AI אמיתיות בהדרגה'
                : 'המועצה פתוחה לתכנון'
        : 'רדומים · מסתובבים בחדר'
  const needsYouLabel = !session
    ? 'כתוב נושא'
    : handoffUnlocked
      ? 'תוכנית מוכנה לשליחה'
      : 'בחר יועץ, דלג, או פרט שלב'

  async function conveneCouncil() {
    if (!canWakeCouncil || councilRunPending) {
      setMotionState('roaming')
      return
    }
    const askedTopic = topic.trim()
    setCouncilRunPending(true)
    setSession(pendingCouncilSession(askedTopic))
    setActiveGeneralId(councilGenerals[0].id)
    setMotionState('seated')
    setHandoffState('idle')
    setOperatorOpinion('')
    setVisibleMessageCount(0)
    setMinimalView('council')
    try {
      const next = await fetchRealCouncilSession(askedTopic)
      setSession(next)
      setActiveGeneralId(next.turns[0]?.generalId ?? councilGenerals[0].id)
      setVisibleMessageCount(0)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSession(blockedCouncilSession(askedTopic, message))
      setVisibleMessageCount(0)
    } finally {
      setCouncilRunPending(false)
    }
  }

  function releaseCouncilToRoam() {
    if (session) setArchiveEntries(upsertCouncilArchiveSession(session))
    clearStoredCouncilState()
    setTopic('')
    setSession(null)
    setMotionState('roaming')
    setHandoffState('idle')
    setOperatorOpinion('')
    setVisibleMessageCount(0)
    setCouncilRunPending(false)
    setMinimalView('council')
    setArchiveOpen(false)
  }

  function startNewDiscussion() {
    if (session) setArchiveEntries(upsertCouncilArchiveSession(session))
    clearStoredCouncilState()
    setTopic('')
    setSession(null)
    setActiveGeneralId(councilGenerals[0].id)
    setMotionState('roaming')
    setHandoffState('idle')
    setOperatorOpinion('')
    setVisibleMessageCount(0)
    setCouncilRunPending(false)
    setMinimalView('council')
    setArchiveOpen(false)
  }

  function toggleArchive() {
    setArchiveEntries(loadCouncilArchive())
    setArchiveOpen((open) => !open)
  }

  function restoreArchivedDiscussion(entry: CouncilArchivedSession) {
    const restoredSession = entry.session
    clearStoredCouncilState()
    setTopic(restoredSession.topic)
    setOperatorOpinion('')
    setSession(restoredSession)
    setActiveGeneralId(restoredSession.turns[0]?.generalId ?? councilGenerals[0].id)
    setMotionState('seated')
    setHandoffState('unlocked')
    setVisibleMessageCount(chatMessagesFor(restoredSession).length)
    setCouncilRunPending(false)
    setMinimalView('council')
    setArchiveOpen(false)
  }

  async function askWholeCouncilFollowUp(promptOverride?: string) {
    const currentSession = session
    const question = (promptOverride ?? operatorOpinion).trim()
    if (!currentSession || !question || councilRunPending) return
    const roundId = `round-${Date.now().toString(36)}`
    const createdAtLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const requestTopic = `${currentSession.topic}\n\nשאלת המשך למועצה: ${question}`
    const pendingRound: CouncilDiscussionRound = {
      id: roundId,
      operatorOpinion: question,
      answers: [],
      createdAtLabel,
      targetGeneralId: 'council',
    }
    setCouncilRunPending(true)
    setMinimalView('council')
    setMotionState('seated')
    setHandoffState('idle')
    setOperatorOpinion('')
    setSession({
      ...currentSession,
      sourceMode: 'running-real-ai',
      summary: 'המועצה קוראת את הודעת ההמשך. אין תשובה מזויפת אם ה־runner נכשל.',
      voteLine: 'ממתין להצבעות אמיתיות',
      discussionRounds: [...currentSession.discussionRounds, pendingRound],
    })
    try {
      const next = await fetchRealCouncilSession(requestTopic)
      const nextRound: CouncilDiscussionRound = {
        ...pendingRound,
        answers: next.turns,
      }
      setSession({
        ...next,
        topic: currentSession.topic,
        discussionRounds: [...currentSession.discussionRounds, nextRound],
      })
      setActiveGeneralId(next.turns[0]?.generalId ?? activeGeneralId)
      setVisibleMessageCount(0)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const blocked = blockedCouncilSession(requestTopic, message)
      const failedRound: CouncilDiscussionRound = {
        ...pendingRound,
        answers: blocked.turns,
      }
      setSession({
        ...blocked,
        topic: currentSession.topic,
        discussionRounds: [...currentSession.discussionRounds, failedRound],
      })
      setVisibleMessageCount(0)
    } finally {
      setCouncilRunPending(false)
    }
  }

  function askCouncilForStepPlan() {
    void askWholeCouncilFollowUp(COUNCIL_STEP_PLAN_PROMPT)
  }

  async function discussOperatorOpinion() {
    const opinion = operatorOpinion.trim()
    if (!opinion || !session || councilRunPending) return
    const roundId = `round-${Date.now().toString(36)}`
    const createdAtLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const pendingRound: CouncilDiscussionRound = {
      id: roundId,
      operatorOpinion: opinion,
      answers: [],
      createdAtLabel,
      targetGeneralId: activeGeneral.id,
    }
    setCouncilRunPending(true)
    setMinimalView('advisor')
    setSession({
      ...session,
      discussionRounds: [...session.discussionRounds, pendingRound],
    })
    setMotionState('seated')
    setHandoffState('idle')
    setOperatorOpinion('')
    try {
      const answer = await fetchRealCouncilFollowUp({ session, generalId: activeGeneral.id, question: opinion })
      setSession((current) => {
        if (!current) return current
        return {
          ...current,
          discussionRounds: current.discussionRounds.map((round) => round.id === roundId
            ? { ...round, answers: [answer] }
            : round),
        }
      })
      setActiveGeneralId(answer.generalId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedAnswer = turnFromRealCouncil({
        generalId: activeGeneral.id,
        label: activeGeneral.shortName,
        phase: 'single-follow-up',
        status: 'failed',
        opinion: '',
        vote: 'abstain',
        voteReason: 'No real AI follow-up returned; no fake response was generated.',
        confidence: 0,
        personalitySignal: activeGeneral.strength,
        contextUsed: [],
        peerReadback: [],
        riskFlags: ['follow-up UI call failed'],
        suggestedFollowUp: 'Retry this one general after checking the controlled runner.',
        usageReadback: 'no usage reported',
        error: message,
      })
      setSession((current) => current
        ? {
          ...current,
          discussionRounds: current.discussionRounds.map((round) => round.id === roundId
            ? { ...round, answers: [failedAnswer] }
            : round),
        }
        : current)
    } finally {
      setCouncilRunPending(false)
    }
  }

  function markSatisfiedForHermes() {
    if (!session) return
    setHandoffState('unlocked')
  }

  function updateOperatorOpinion(value: string) {
    setOperatorOpinion(value)
    setHandoffState('idle')
  }

  function selectAdvisor(generalId: string) {
    setActiveGeneralId(generalId)
    if (session) setMinimalView('advisor')
  }

  function transferDecision() {
    if (!handoff || !handoffUnlocked) return
    onTransferToHermes(handoff)
    setHandoffState('sent')
  }

  return (
    <section
      className="council-chamber"
      data-council-room="strategists-v1"
      data-council-generals={councilGenerals.length}
      data-council-decision-packet={session?.packetId ?? ''}
      data-council-handoff-state={handoffState}
      data-council-handoff-unlocked={handoffUnlocked ? 'true' : 'false'}
      data-council-motion-state={motionState}
      data-council-discussion-rounds={session?.discussionRounds.length ?? 0}
      data-council-responses-visible={councilResponsesVisible ? 'true' : 'false'}
      data-council-reactions-visible={session?.turns.some((turn) => turn.reactions.length > 0) ? 'true' : 'false'}
      data-council-idle-state={session ? 'awake' : 'dormant-roaming'}
      data-council-personality-profiles="controlled-real-ai-v1"
      data-council-ai-mode={councilAiMode}
      data-council-ready-for-real-ai="true"
      data-council-no-fake-responses={session?.noFakeResponses ? 'true' : 'true'}
      data-council-visible-messages={visibleMessageCount}
      data-council-typing-active={pendingChatMessage?.type === 'turn' ? 'true' : 'false'}
      data-council-response-mode={councilResponseMode}
      data-council-context-packet={session?.contextPacketId ?? ''}
      data-council-real-ai-pending={councilRunPending ? 'true' : 'false'}
      data-council-summary-first="true"
      data-council-user-prompt-visible="true"
      data-council-static-copy="details-only"
      data-council-vote-labels="for-neutral-against-abstain"
      data-council-persistence="local-storage-v1"
      data-council-persisted-state={councilHasPersistableState ? 'true' : 'false'}
      data-council-design-pass="command-rail-v2"
      data-council-planning-workspace="true"
      data-council-command-rail="v2"
      data-council-live-decision-visual="vote-board-v1"
      data-council-live-vote-count={`${voteCounts.support}-${voteCounts.neutral}-${voteCounts.against}-${voteCounts.abstain}`}
      data-council-archive="local-restore-v1"
      data-council-new-discussion="true"
      data-council-archive-open={archiveOpen ? 'true' : 'false'}
      data-council-minimal-rescue="true"
      data-council-minimal-mode={minimalMode}
      data-council-input-first="true"
      data-council-close-only-header="true"
      data-council-primary-action={minimalMode === 'start' ? 'open-council' : minimalMode === 'council' ? 'continue-council-or-plan' : 'continue-advisor-chat'}
      data-council-active-advisor={activeGeneral.id}
      data-council-consultation-count={completedConsultations}
      data-council-min-thinking-ms={COUNCIL_LOCAL_THINKING_MIN_MS}
      data-council-max-thinking-ms={COUNCIL_LOCAL_THINKING_MAX_MS}
      aria-label="Council of Strategists planning workspace"
    >
      <header className="council-chamber__header">
        <div className="council-chamber__header-copy">
          <span>{minimalMode === 'start' ? 'פתח נושא' : minimalMode === 'advisor' ? `שיחה עם ${activeGeneral.shortName}` : 'החלטה + המשך'}</span>
          <h2 dir="rtl">חדר מועצה</h2>
          <p dir="rtl">דיון חי, ארכיון מקומי, ופקודת המשך אחת ברורה.</p>
        </div>
        <div className="council-chamber__session-actions" dir="rtl">
          {navigationSlot}
          <button type="button" className="council-chamber__close" onClick={onClose} aria-label="סגור את חדר המועצה">סגור</button>
        </div>
      </header>

      <details className="council-chamber__session-menu" dir="rtl">
        <summary>ניהול דיון</summary>
        <div>
          <button type="button" onClick={startNewDiscussion} disabled={councilRunPending} data-council-start-new-discussion="true">דיון חדש</button>
          <button type="button" onClick={toggleArchive} disabled={councilRunPending} data-council-archive-toggle="true">
            {archiveOpen ? 'סגור ארכיון' : `ארכיון דיונים${archiveEntries.length ? ` (${archiveEntries.length})` : ''}`}
          </button>
        </div>
      </details>

      {archiveOpen && (
        <section className="council-chamber__archive" data-council-archive-panel="true" dir="rtl" aria-label="ארכיון דיוני מועצה">
          <div className="council-chamber__archive-head">
            <span>ארכיון מקומי</span>
            <b>שלוף דיון קודם וחזור לעבוד עליו.</b>
          </div>
          {archiveEntries.length ? (
            <div className="council-chamber__archive-list">
              {archiveEntries.map((entry) => (
                <article key={entry.packetId} className="council-chamber__archive-item">
                  <div>
                    <b>{entry.topic}</b>
                    <span>{entry.verdict} · {entry.archivedAtLabel}</span>
                  </div>
                  <button type="button" onClick={() => restoreArchivedDiscussion(entry)} data-council-restore-archive="true">פתח</button>
                </article>
              ))}
            </div>
          ) : (
            <p>אין עדיין דיונים בארכיון. אחרי דיון ראשון הוא יישמר כאן אוטומטית.</p>
          )}
        </section>
      )}

      <div className="council-chamber__grid">
        <div className="council-chamber__room" aria-label="Council chamber with roaming generals and a clickable strategy table">
          <div className="council-chamber__floor" />
          <button
            type="button"
            className="council-chamber__table"
            onClick={canWakeCouncil ? conveneCouncil : releaseCouncilToRoam}
            aria-label={canWakeCouncil ? 'Wake the Council of Strategists at the decision table' : 'Council is dormant until DLV writes a topic'}
          >
            <div className="council-chamber__table-core">
              <span>{session ? session.sourceMode === 'running-real-ai' ? 'רץ' : 'פעיל' : canWakeCouncil ? 'מוכן' : 'ממתין'}</span>
              <b>{session ? consensusHeadingFor(session) : canWakeCouncil ? 'שאל עכשיו' : 'כתוב שאלה'}</b>
              <small>{session ? voteLineHebrew(session.stats) : canWakeCouncil ? 'AI אמיתי' : ''}</small>
            </div>
          </button>
          {councilGenerals.map((general, index) => {
            const turn = currentDecisionTurnByGeneral.get(general.id)
            const selected = activeGeneralId === general.id
            const point = motionState === 'roaming' ? general.roam : general.seat
            return (
              <button
                key={general.id}
                type="button"
                className={`council-chamber__general is-${motionState} ${selected ? 'is-selected' : ''}`}
                style={councilGeneralStyle(general, motionState)}
                onClick={() => selectAdvisor(general.id)}
                aria-pressed={selected}
                aria-label={`Select ${general.name}`}
                data-council-general-motion={motionState}
                data-council-general-spot={motionState === 'roaming' ? 'roam' : 'seat'}
              >
                <span
                  className="council-chamber__sprite"
                  style={{
                    backgroundImage: `url("${motionState === 'seated' ? generalChairSpritePath(general.assetSlug) : generalSpritePath(general.assetSlug)}")`,
                    animationDelay: motionState === 'roaming' ? general.roam.delay : `${index * -180}ms`,
                    transform: `scaleX(${motionState === 'seated' ? 1 : point.flip ?? general.seat.flip ?? 1}) scale(${point.scale ?? general.seat.scale ?? 1})`,
                  }}
                  data-sprite-row={motionState === 'seated' ? `chair-${general.chairRow}` : 'walk'}
                  data-sprite-frames={motionState === 'seated' ? COUNCIL_CHAIR_FRAMES : COUNCIL_WALK_FRAMES}
                  aria-hidden="true"
                />
                <span className="council-chamber__nameplate">
                  <b>{general.shortName}</b>
                  <small>{turn ? voteLabel(turn.vote) : motionState === 'roaming' ? 'ממתין' : 'מוכן'}</small>
                </span>
                {turn && <span className={`council-chamber__vote-dot is-${voteTone(turn.vote)}`} aria-hidden="true" />}
              </button>
            )
          })}
        </div>

        <div className="council-chamber__tool" aria-label="Council planning tool">
          <section className="council-chamber__question-card" data-council-question-card="true" data-council-minimal-start="true">
            <span>מה מתכננים?</span>
            <p className={displayedQuestion ? bidiClassNameFor(displayedQuestion) : undefined} dir={displayedQuestion ? textDirectionFor(displayedQuestion) : 'rtl'}>
              {displayedQuestion || 'כתוב מטרה או התלבטות. המועצה תענה קצר, ואז אפשר לדבר עם יועץ אחד.'}
            </p>
            <label>
              <textarea
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                dir="auto"
                placeholder="מה אתה רוצה לתכנן?"
              />
            </label>
            <div className="council-chamber__actions">
              <button type="button" onClick={conveneCouncil} disabled={!canWakeCouncil || councilRunPending}>{councilRunPending ? 'פותח מועצה…' : session ? 'שאל מחדש' : 'פתח מועצה'}</button>
              {councilHasPersistableState && (
                <button type="button" onClick={releaseCouncilToRoam} disabled={councilRunPending}>אפס</button>
              )}
            </div>
          </section>

          <section className="council-chamber__planning-guide" data-council-planning-guide="true" dir="rtl">
            <span>{planningStage}</span>
            <div>
              <b>{planningHint}</b>
              <small>{completedConsultations > 0 ? `${completedConsultations} שיחות יועץ נשמרו בפרוטוקול` : 'אפשר לדלג בין היועצים בלי לסכם עדיין'}</small>
            </div>
          </section>

          <section className="council-chamber__consensus" data-council-consensus-card="true" data-council-minimal-council="true" role="status">
            <span>מסקנת מועצה</span>
            <h3 dir="rtl">{primaryCouncilAnswer}</h3>
            <p dir="rtl">{consensusSummary}</p>
            {session?.recommendation && (
              <div className="council-chamber__recommendation-proof" data-council-recommendation-card="true" dir="rtl">
                <b>{session.recommendation.supportLine}</b>
                <span>{compactDecisionText(session.recommendation.reason, 'זו האפשרות שקיבלה הכי הרבה תמיכה.', 150)}</span>
                {session.recommendation.options.length > 1 && (
                  <div className="council-chamber__option-rank" aria-label="דירוג אפשרויות">
                    {session.recommendation.options.slice(0, 3).map((option) => (
                      <em key={option.label}>{option.label}: {option.support}</em>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="council-chamber__vote-summary" aria-label="Council vote summary">
              <b>{voteReadout}</b>
              <small>{stateLabel} · {needsYouLabel}</small>
            </div>
            <div className="council-chamber__next-step" dir="rtl">
              <span>הצעד הבא</span>
              <b>{consensusNextStep}</b>
            </div>
            <section
              className="council-chamber__live-vote-board"
              data-council-live-vote-board="true"
              data-council-visual-voting="decision-table-live-v1"
              data-council-live-vote-placement="right-panel"
              dir="rtl"
              aria-label="לוח הצבעה חי של המועצה"
            >
              <div className="council-chamber__live-vote-head">
                <span>הצבעת המועצה</span>
                <b>{session ? voteReadout : 'עוד אין הצבעה'}</b>
              </div>
              <div className="council-chamber__vote-meter" style={voteMeterStyle} data-council-decision-ring="support-neutral-against-abstain">
                <i className="is-support" aria-hidden="true" />
                <i className="is-neutral" aria-hidden="true" />
                <i className="is-against" aria-hidden="true" />
                <i className="is-abstain" aria-hidden="true" />
              </div>
              <ol className="council-chamber__decision-timeline" data-council-decision-timeline="live-vote-flow-v1" aria-label="רצף החלטת המועצה">
                {liveDecisionTimeline.map((step) => (
                  <li
                    key={step.key}
                    className={`is-${step.state}`}
                    data-council-timeline-step={step.key}
                    data-council-timeline-state={step.state}
                  >
                    <span>{step.label}</span>
                    <small>{step.detail}</small>
                  </li>
                ))}
              </ol>
              <div className="council-chamber__vote-lanes" data-council-vote-lanes="true">
                {councilGenerals.map((general) => {
                  const turn = currentDecisionTurnByGeneral.get(general.id)
                  const phase = !session
                    ? 'idle'
                    : pendingVoteGeneralId === general.id || (councilRunPending && !turn)
                      ? 'thinking'
                      : turn && visibleVoteGeneralIds.has(general.id)
                        ? 'voted'
                        : turn
                          ? 'queued'
                          : 'idle'
                  return (
                    <button
                      key={`vote-lane-${general.id}`}
                      type="button"
                      className={`council-chamber__vote-lane is-${phase} is-${turn ? voteTone(turn.vote) : 'pending'}`}
                      onClick={() => selectAdvisor(general.id)}
                      style={{ '--general-accent': general.accent } as CSSProperties}
                      data-council-vote-lane={general.id}
                      data-council-vote-phase={phase}
                      data-council-vote-value={turn ? voteLabel(turn.vote) : 'ממתין'}
                    >
                      <span
                        className="council-chamber__vote-lane-avatar"
                        style={{ backgroundImage: `url("${generalPortraitPath(general.assetSlug)}")` } as CSSProperties}
                        aria-hidden="true"
                      />
                      <span className="council-chamber__vote-lane-copy">
                        <b>{general.shortName}</b>
                        <small>{votePhaseLabel(phase)}</small>
                      </span>
                      <em>{voteVisualLabel(turn?.vote)}</em>
                    </button>
                  )
                })}
              </div>
            </section>
            <section className="council-chamber__command-rail" data-council-command-rail-panel="v2" dir="rtl">
              <div className="council-chamber__command-rail-head">
                <span>המשך עבודה</span>
                <b>כתוב למועצה, או בקש פירוק לשלבים.</b>
              </div>
              <label className="council-chamber__command-input">
                <textarea
                  value={operatorOpinion}
                  onChange={(event) => updateOperatorOpinion(event.target.value)}
                  dir="auto"
                  placeholder="כתוב הודעת המשך למועצה… למשל: תפרקו לי את זה לשלבים, או מה הסיכון פה?"
                />
              </label>
              <div className="council-chamber__command-actions">
                <button type="button" data-council-ask-whole-council="true" onClick={() => void askWholeCouncilFollowUp()} disabled={!session || !operatorOpinion.trim() || councilRunPending}>
                  {councilRunPending ? 'המועצה חושבת…' : 'שאל את המועצה'}
                </button>
                <button type="button" data-council-step-plan="true" onClick={askCouncilForStepPlan} disabled={!session || councilRunPending}>
                  פרק לתוכנית שלבים
                </button>
                <button type="button" data-council-open-advisor-chat="true" onClick={() => setMinimalView('advisor')} disabled={!session || councilRunPending}>
                  שאל יועץ אחד
                </button>
              </div>
              <div className="council-chamber__handoff-strip">
                <button type="button" onClick={markSatisfiedForHermes} disabled={!session || councilRunPending}>סיימתי</button>
                <button type="button" onClick={transferDecision} disabled={!handoffUnlocked || councilRunPending}>{handoffState === 'sent' ? 'נשלח' : 'שלח להרמס'}</button>
              </div>
            </section>
            <section className="council-chamber__advisor-dock" data-council-right-space-fill="advisor-dock-v1" dir="rtl" aria-label="יועצים זמינים לשיחה אחת על אחת">
              <div className="council-chamber__advisor-dock-head">
                <span>שיחה עם גנרל אחד</span>
                <b>בחר דמות ופתח צ׳אט נקי עם האייקון שלה.</b>
              </div>
              <div className="council-chamber__advisor-dock-grid">
                {councilGenerals.map((general) => {
                  const turn = currentDecisionTurnByGeneral.get(general.id)
                  return (
                    <button
                      key={`dock-${general.id}`}
                      type="button"
                      className={`council-chamber__advisor-dock-card is-${turn ? voteTone(turn.vote) : 'pending'} ${activeGeneralId === general.id ? 'is-active' : ''}`}
                      onClick={() => selectAdvisor(general.id)}
                      style={{ '--general-accent': general.accent } as CSSProperties}
                      data-council-advisor-dock-card={general.id}
                      data-council-advisor-vote-state={turn ? voteTone(turn.vote) : 'pending'}
                      data-council-advisor-vote-label={turn ? voteLabel(turn.vote) : 'ממתין'}
                    >
                      <span
                        className="council-chamber__advisor-dock-avatar"
                        style={{ backgroundImage: `url("${generalPortraitPath(general.assetSlug)}")` } as CSSProperties}
                        data-council-advisor-avatar="right-space"
                        aria-hidden="true"
                      />
                      <span className="council-chamber__advisor-dock-copy">
                        <b>{general.shortName}</b>
                        <small>{turn ? compactDecisionText(turn.thought, turn.voteReason, 72) : general.chatVoice}</small>
                      </span>
                      <em className="council-chamber__advisor-dock-vote">{turn ? voteLabel(turn.vote) : 'ממתין'}</em>
                    </button>
                  )
                })}
              </div>
            </section>
          </section>

          <section className="council-chamber__general-summary" data-council-collapsed-generals="true">
            <span>בחר יועץ לשיחה</span>
            <div>
              {councilGenerals.map((general) => {
                const turn = currentDecisionTurnByGeneral.get(general.id)
                return (
                  <button
                    key={general.id}
                    type="button"
                    className={`council-chamber__general-card is-${turn ? voteTone(turn.vote) : 'pending'} ${activeGeneralId === general.id ? 'is-active' : ''}`}
                    onClick={() => selectAdvisor(general.id)}
                    data-council-general-card={general.id}
                    data-council-general-vote={turn ? voteLabel(turn.vote) : 'ממתין'}
                  >
                    <span
                      className="council-chamber__general-card-avatar"
                      style={{ backgroundImage: `url("${generalPortraitPath(general.assetSlug)}")` } as CSSProperties}
                      data-council-advisor-avatar="dock"
                      aria-hidden="true"
                    />
                    <span className="council-chamber__general-card-copy">
                      <b>{general.shortName}</b>
                      <em>{turn ? voteLabel(turn.vote) : 'ממתין'}</em>
                      <small>{turn ? compactDecisionText(turn.thought, turn.voteReason, 86) : general.chatVoice}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <div
            className="council-chamber__operator"
            data-council-advisor-consultation="true"
            data-council-minimal-advisor="true"
            data-council-advisor-chat="portrait-bubbles-v1"
            data-council-advisor-chat-count={advisorChatMessages.length}
            style={{ '--general-accent': activeGeneral.accent } as CSSProperties}
          >
            <div className="council-chamber__advisor-chat-head" dir="rtl">
              <span
                className="council-chamber__advisor-chat-portrait"
                style={{ backgroundImage: `url("${generalPortraitPath(activeGeneral.assetSlug)}")` } as CSSProperties}
                data-council-advisor-avatar="active-chat"
                aria-hidden="true"
              />
              <div>
                <span>שיחה עם יועץ</span>
                <b>{activeGeneral.shortName}</b>
                <small>{activeTurn ? compactDecisionText(activeTurn.thought, activeTurn.voteReason, 130) : activeGeneral.chatVoice}</small>
              </div>
            </div>
            <div className="council-chamber__advisor-chat-log" data-council-advisor-chat-log="true" ref={advisorChatRef} aria-label={`צ׳אט עם ${activeGeneral.shortName}`}>
              {visibleAdvisorChatMessages.length ? (
                visibleAdvisorChatMessages.map((message) => message.type === 'turn' ? (
                  <CouncilTurnBubble key={`advisor-${message.id}`} turn={message.turn} />
                ) : (
                  <OperatorRoundBubble key={`advisor-${message.id}`} round={message.round} fallbackGeneral={activeGeneral} />
                ))
              ) : (
                <div className="council-chamber__advisor-empty" dir="rtl">
                  <b>{activeGeneral.shortName} מוכן לשיחה.</b>
                  <span>כתוב שאלה קצרה למטה. התשובה תחזור כאן עם האייקון שלו, בלי לפתוח עוד פאנלים.</span>
                </div>
              )}
              <TypingBubble message={advisorPendingMessage} />
            </div>
            <label className="council-chamber__advisor-composer" data-council-advisor-composer="true" dir="rtl">
              <span>כתוב ל־{activeGeneral.shortName}</span>
              <textarea
                value={operatorOpinion}
                onChange={(event) => updateOperatorOpinion(event.target.value)}
                dir="auto"
                placeholder={`שאל את ${activeGeneral.shortName} על השלב הבא, הסיכון, או התוכנית…`}
              />
            </label>
            <div className="council-chamber__prompt-chips" aria-label="הצעות לשאלת המשך">
              <button type="button" onClick={() => updateOperatorOpinion(activeAdvisorPrompt)} disabled={!session || councilRunPending}>{activeAdvisorPrompt}</button>
              {planningPromptChips.slice(0, 3).map((chip) => (
                <button key={chip.label} type="button" onClick={() => updateOperatorOpinion(chip.prompt)} disabled={!session || councilRunPending}>{chip.label}</button>
              ))}
            </div>
            <div className="council-chamber__actions council-chamber__actions--consult">
              <button type="button" onClick={discussOperatorOpinion} disabled={!session || !operatorOpinion.trim() || councilRunPending}>
                {councilRunPending ? 'מחכה…' : 'שלח ליועץ'}
              </button>
              <button type="button" onClick={() => selectAdvisor(nextGeneral.id)} disabled={councilRunPending}>
                דלג ליועץ הבא
              </button>
              <button type="button" onClick={() => setMinimalView('council')} disabled={!session || councilRunPending}>
                חזור למועצה
              </button>
            </div>
          </div>

          <details className="council-chamber__selected" style={{ '--general-accent': activeGeneral.accent } as CSSProperties} data-council-drilldown="true" open>
            <summary>
              <span>היועץ הפעיל</span>
              <b>{activeGeneral.shortName} · {activeTurn ? voteLabel(activeTurn.vote) : 'בחר לשיחה'}</b>
            </summary>
            <h3>{activeGeneral.name}</h3>
            <p>{activeTurn?.thought ?? activeGeneral.strength}</p>
            <small>{activeTurn ? `${voteLabel(activeTurn.vote)} · ${activeTurn.voteReason}` : `${activeGeneral.caution} · אפשר לשאול אותו 1:1 למטה.`}</small>
            {activeTurn && (
              <div className="council-chamber__selected-meta">
                <span>Context: {(activeTurn.contextUsed?.length ? activeTurn.contextUsed : ['לא דווח context ספציפי']).slice(0, 3).join(' · ')}</span>
                <span>Peers: {(activeTurn.peerReadback?.length ? activeTurn.peerReadback : ['אין peer readback נוסף']).slice(0, 2).join(' · ')}</span>
                <span>Risks: {(activeTurn.riskFlags?.length ? activeTurn.riskFlags : ['לא דווחו סיכונים']).slice(0, 3).join(' · ')}</span>
                <span>Usage: {activeTurn.usageReadback ?? 'usage לא דווח'}</span>
              </div>
            )}
          </details>

          <details className="council-chamber__transcript" data-council-full-transcript="collapsed">
            <summary>פרוטוקול מלא</summary>
            <div className="council-chamber__chat" aria-label="Council debate chat" ref={chatRef}>
              {session ? (
                <>
                  <div className="council-chamber__round-label">AI אמיתי · Obsidian · {session.createdAtLabel}</div>
                  {visibleChatMessages.map((message) => message.type === 'turn' ? (
                    <CouncilTurnBubble key={message.id} turn={message.turn} />
                  ) : (
                    <OperatorRoundBubble key={message.id} round={message.round} fallbackGeneral={activeGeneral} />
                  ))}
                  <TypingBubble message={pendingChatMessage} />
                </>
              ) : (
                <div className="council-chamber__empty"><b>אין פרוטוקול עדיין</b></div>
              )}
            </div>
          </details>
        </div>
      </div>
    </section>
  )
}
