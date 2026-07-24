import { useEffect, useMemo, useRef, useState } from 'react'
import { bidiClassNameFor, textDirectionFor } from '../../../lib/war-room/living-v3/bidi-text'
import { CouncilGroupChatWorkbench } from './CouncilGroupChatWorkbench'
import type { CouncilGroupChatMember, CouncilGroupChatMessage } from './CouncilGroupChatWorkbench'
import type { CSSProperties, ReactNode } from 'react'
import './council-chamber-surface.css'
import './council-group-chat-workbench.css'

type CouncilVote = 'support' | 'neutral' | 'against' | 'abstain'
type CouncilMotionState = 'roaming' | 'convening' | 'seated'
type CouncilMinimalView = 'council' | 'advisor'
type CouncilFlowStage = 'discussion' | 'team-selection' | 'plan-drafting' | 'ready-for-hermes'

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
  chatSummary?: string
  thought: string
  vote: CouncilVote
  voteReason: string
  recommendedOption?: string
  reactions: Array<CouncilReaction>
  personaLabel: string
  replyTo?: string
  replySnippet?: string
  realStatus?: 'completed_local_only' | 'blocked' | 'failed'
  phase?: 'opinion' | 'council-turn' | 'peer-vote' | 'synthesis' | 'single-follow-up'
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
  discussionId?: string
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
  sourcesUsed?: Array<string>
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
  flowStage?: CouncilFlowStage
  selectedPlanningGeneralIds?: Array<string>
}

type CouncilArchivedSession = {
  packetId: string
  discussionId?: string
  topic: string
  verdict: string
  archivedAtLabel: string
  session: CouncilSession
}

type CouncilGeneralStats = {
  generalId: string
  label: string
  strengths: Array<string>
  traits: Array<string>
  memoryNotes: Array<string>
  participated: number
  votes: number
  wins: number
  lastSeenAtMs?: number
}

type CouncilDrawingBoardApiResponse = {
  ok: boolean
  activeDiscussionId?: string
  discussions?: Array<{
    discussionId: string
    topic: string
    status: 'thinking' | 'ready' | 'blocked'
    updatedAtMs: number
    result?: RealCouncilApiResponse
    rounds?: Array<{
      roundId: string
      kind: 'opening' | 'reconsideration' | 'follow-up' | 'private-follow-up'
      question: string
      targetAgentId?: string
      status: 'thinking' | 'ready' | 'blocked'
      startedAtMs: number
      completedAtMs?: number
      turns: Array<RealCouncilApiTurn>
    }>
  }>
  generalStats?: Record<string, CouncilGeneralStats>
}

export type CouncilDecisionHandoff = {
  packetId: string
  topic: string
  verdict: string
  summary: string
  voteLine: string
  prompt: string
  planningGeneralIds: Array<string>
  planningGeneralNames: Array<string>
}

export type CouncilLaunchRequest = {
  requestId: string
  topic: string
  autoStart: true
}

const COUNCIL_ASSET_VERSION = 'petdex-fixed-20260626-v8-png-council-v1'
const COUNCIL_CHAIR_ASSET_VERSION = 'petdex-fixed-20260626-v8-png-chatgpt-rowwise-v2'
const COUNCIL_ATLAS_ROOT = '/war-room/living-v3/generals-council'
const COUNCIL_WALK_FRAMES = 8
const COUNCIL_CHAIR_FRAMES = 6
const COUNCIL_LOCAL_THINKING_MIN_MS = 1_450
const COUNCIL_LOCAL_THINKING_MAX_MS = 4_600
const COUNCIL_REAL_AI_TIMEOUT_MS = 90_000
const COUNCIL_FULL_COUNCIL_AGENT_TIMEOUT_MS = 45_000
const COUNCIL_FULL_COUNCIL_HTTP_TIMEOUT_MS = 160_000
const COUNCIL_FOLLOW_UP_AGENT_TIMEOUT_MS = 45_000
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

const COUNCIL_CHAIR_GENERAL_ID = 'julius'

function isKnownCouncilGeneralId(value: unknown): value is string {
  return typeof value === 'string' && councilGenerals.some((general) => general.id === value)
}

function orderedCouncilGeneralIds(generalIds: Array<string> = councilGenerals.map((general) => general.id)) {
  const unique = generalIds.filter((id, index, list) => isKnownCouncilGeneralId(id) && list.indexOf(id) === index)
  return [...unique.filter((id) => id !== COUNCIL_CHAIR_GENERAL_ID), ...unique.filter((id) => id === COUNCIL_CHAIR_GENERAL_ID)]
}

function normalizeCouncilMotionState(value: unknown, session: CouncilSession | null): CouncilMotionState {
  if (session) return 'seated'
  return value === 'convening' || value === 'seated' || value === 'roaming' ? value : 'roaming'
}

function normalizeCouncilHandoffState(value: unknown, session: CouncilSession | null): CouncilHandoffState {
  if (!session) return 'idle'
  return value === 'unlocked' || value === 'sent' || value === 'idle' ? value : 'idle'
}

function normalizeCouncilFlowStage(value: unknown, session: CouncilSession | null, handoffState: CouncilHandoffState): CouncilFlowStage {
  if (!session) return 'discussion'
  if (handoffState === 'unlocked' || handoffState === 'sent') return 'ready-for-hermes'
  return value === 'discussion' || value === 'team-selection' || value === 'plan-drafting' || value === 'ready-for-hermes'
    ? value
    : 'discussion'
}

function normalizeSelectedPlanningGeneralIds(value: unknown): Array<string> {
  if (!Array.isArray(value)) return []
  return value
    .filter(isKnownCouncilGeneralId)
    .filter((id, index, list) => list.indexOf(id) === index)
    .slice(0, councilGenerals.length)
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

const COUNCIL_RAW_RUNNER_LEAK_PATTERN = /(Command failed:|Warning:\s+Unknown toolsets|session_id:|reported\s+usage|reported\s+cost|cost:\s*\$|usage:\s*\d|--profile\s+|--ignore-rules|--max-turns|IMPORTANT IDENTITY RULES|Return JSON only|\/Users\/mac\/\.hermes|\s-q\s+You are\s+|Controlled Hermes runner failed|Technical command\/prompt|No real AI answer returned|no fake response|rawStdout|rawStderr|toolsets=|Hermes CLI|runner failed)/i

function containsCouncilRunnerLeak(value: unknown) {
  return typeof value === 'string' && COUNCIL_RAW_RUNNER_LEAK_PATTERN.test(value)
}

function cleanCouncilUiText(value: unknown, fallback: string, max = 900) {
  if (containsCouncilRunnerLeak(value)) return fallback
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!text) return fallback
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function failedCouncilTurnText(generalName: string) {
  return `לא התקבלה תשובה נקייה מ-${generalName}. זה לא נספר כדעה; אפשר לנסות שוב עם שאלה קצרה יותר.`
}

function failedCouncilChatSummary(generalName: string) {
  return `${generalName} לא החזיר תשובה נקייה כרגע.`
}

function failedCouncilVoteReason(generalName: string) {
  return `${generalName} לא נספר כי לא חזרה תשובה אמיתית.`
}

function sanitizeCouncilTurnForUi(turn: CouncilTurn): CouncilTurn {
  const general = councilGenerals.find((item) => item.id === turn.generalId)
  const generalName = general?.shortName ?? turn.generalName
  const answerLeak = containsCouncilRunnerLeak(turn.thought)
    || containsCouncilRunnerLeak(turn.chatSummary)
    || containsCouncilRunnerLeak(turn.voteReason)
    || containsCouncilRunnerLeak(turn.suggestedFollowUp)
  const metadataLeak = (turn.riskFlags ?? []).some(containsCouncilRunnerLeak)
    || (turn.contextUsed ?? []).some(containsCouncilRunnerLeak)
    || (turn.peerReadback ?? []).some(containsCouncilRunnerLeak)
    || containsCouncilRunnerLeak(turn.usageReadback)
  if (answerLeak || (turn.realStatus && turn.realStatus !== 'completed_local_only')) {
    return {
      ...turn,
      thought: failedCouncilTurnText(generalName),
      chatSummary: failedCouncilChatSummary(generalName),
      vote: 'abstain',
      voteReason: failedCouncilVoteReason(generalName),
      realStatus: turn.realStatus ?? 'failed',
      contextUsed: [],
      peerReadback: [],
      riskFlags: [],
      usageReadback: undefined,
      suggestedFollowUp: `נסה שוב את ${generalName} עם שאלה אחת קצרה וברורה.`,
    }
  }

  return {
    ...turn,
    thought: cleanCouncilUiText(turn.thought, failedCouncilTurnText(generalName), 1_800),
    chatSummary: cleanCouncilUiText(turn.chatSummary, compactDecisionText(turn.thought, turn.voteReason, 180), 220),
    voteReason: cleanCouncilUiText(turn.voteReason, 'סיבת הצבעה לא דווחה.', 500),
    contextUsed: metadataLeak ? (turn.contextUsed ?? []).filter((item) => !containsCouncilRunnerLeak(item)) : turn.contextUsed,
    peerReadback: metadataLeak ? (turn.peerReadback ?? []).filter((item) => !containsCouncilRunnerLeak(item)) : turn.peerReadback,
    riskFlags: metadataLeak ? (turn.riskFlags ?? []).filter((item) => !containsCouncilRunnerLeak(item)) : turn.riskFlags,
    usageReadback: metadataLeak ? undefined : turn.usageReadback,
    suggestedFollowUp: turn.suggestedFollowUp ? cleanCouncilUiText(turn.suggestedFollowUp, 'שאל שאלה ממוקדת נוספת.', 240) : undefined,
  }
}

function sanitizeCouncilSessionForUi(session: CouncilSession): CouncilSession {
  const turns = session.turns.map(sanitizeCouncilTurnForUi)
  const discussionRounds = session.discussionRounds.map((round) => ({
    ...round,
    operatorOpinion: cleanCouncilUiText(round.operatorOpinion, 'שאלת המשך', 1_200),
    answers: round.answers.map(sanitizeCouncilTurnForUi),
  }))
  return {
    ...session,
    topic: cleanCouncilUiText(session.topic, 'דיון מועצה', 1_200),
    verdict: cleanCouncilUiText(session.verdict, 'מסקנה מוכנה', 280),
    summary: cleanCouncilUiText(session.summary, 'המועצה סיימה. פתח את הפירוט אם צריך.', 900),
    voteLine: cleanCouncilUiText(session.voteLine, 'אין הצבעות נקיות עדיין', 180),
    turns,
    discussionRounds,
    error: containsCouncilRunnerLeak(session.error) ? 'לא חזרה תשובה נקייה מהמנוע. הפרטים הטכניים הוסתרו.' : session.error,
  }
}

function loadStoredCouncilState(): CouncilPersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(COUNCIL_PERSISTENCE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CouncilPersistedState>
    if (parsed.version !== 1) return null
    const session = isCouncilSessionLike(parsed.session)
      ? sanitizeCouncilSessionForUi(parsed.session)
      : null
    const topic = typeof parsed.topic === 'string'
      ? parsed.topic
      : session?.topic ?? ''
    const operatorOpinion = typeof parsed.operatorOpinion === 'string' ? parsed.operatorOpinion : ''
    const selectedPlanningGeneralIds = normalizeSelectedPlanningGeneralIds(parsed.selectedPlanningGeneralIds)
    const legacyHandoffState = normalizeCouncilHandoffState(parsed.handoffState, session)
    const handoffState = selectedPlanningGeneralIds.length ? legacyHandoffState : 'idle'
    return {
      version: 1,
      topic,
      operatorOpinion,
      session,
      activeGeneralId: isKnownCouncilGeneralId(parsed.activeGeneralId)
        ? parsed.activeGeneralId
        : session?.turns[0]?.generalId ?? councilGenerals[0].id,
      motionState: normalizeCouncilMotionState(parsed.motionState, session),
      handoffState,
      flowStage: normalizeCouncilFlowStage(parsed.flowStage, session, handoffState),
      selectedPlanningGeneralIds: normalizeSelectedPlanningGeneralIds(parsed.selectedPlanningGeneralIds),
    }
  } catch {
    return null
  }
}

function saveStoredCouncilState(state: Omit<CouncilPersistedState, 'version'>): void {
  if (typeof window === 'undefined') return
  try {
    const session = state.session ? sanitizeCouncilSessionForUi(state.session) : null
    const payload: CouncilPersistedState = {
      version: 1,
      topic: cleanCouncilUiText(state.topic, '', 1_200),
      operatorOpinion: cleanCouncilUiText(state.operatorOpinion, '', 1_200),
      session,
      activeGeneralId: state.activeGeneralId,
      motionState: normalizeCouncilMotionState(state.motionState, session),
      handoffState: normalizeCouncilHandoffState(state.handoffState, session),
      flowStage: normalizeCouncilFlowStage(state.flowStage, session, state.handoffState),
      selectedPlanningGeneralIds: normalizeSelectedPlanningGeneralIds(state.selectedPlanningGeneralIds),
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
      .map((item): CouncilArchivedSession | null => {
        const candidate = item as Partial<CouncilArchivedSession> | null
        if (!(
          candidate
          && typeof candidate.packetId === 'string'
          && typeof candidate.topic === 'string'
          && typeof candidate.verdict === 'string'
          && typeof candidate.archivedAtLabel === 'string'
          && isCouncilSessionLike(candidate.session)
          && candidate.session.sourceMode !== 'running-real-ai'
        )) return null
        const session = sanitizeCouncilSessionForUi(candidate.session)
        return {
          packetId: candidate.packetId,
          discussionId: candidate.discussionId,
          topic: cleanCouncilUiText(candidate.topic, session.topic, 1_200),
          verdict: cleanCouncilUiText(candidate.verdict, session.verdict, 280),
          archivedAtLabel: candidate.archivedAtLabel,
          session,
        }
      })
      .filter((item): item is CouncilArchivedSession => Boolean(item))
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
  const cleanSession = sanitizeCouncilSessionForUi(session)
  const entry: CouncilArchivedSession = {
    packetId: cleanSession.packetId,
    discussionId: cleanSession.discussionId,
    topic: cleanSession.topic,
    verdict: cleanSession.verdict,
    archivedAtLabel: new Date().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }),
    session: cleanSession,
  }
  const archive = loadCouncilArchive().filter((item) => item.packetId !== cleanSession.packetId)
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

function allCouncilTurnsForSession(session: CouncilSession) {
  return [...session.turns, ...session.discussionRounds.flatMap((round) => round.answers)]
}

function liveStatsFromTurns(turns: Array<CouncilTurn>, total = councilGenerals.length): NonNullable<CouncilSession['stats']> {
  const cleanTurns = turns.filter((turn) => !isFailedCouncilTurnForUi(turn))
  const counts = voteCountsFromTurns(cleanTurns)
  const top = Math.max(counts.support, counts.neutral, counts.against, counts.abstain)
  const topVotes = [counts.support, counts.neutral, counts.against, counts.abstain].filter((value) => value === top).length
  const consensus = cleanTurns.length === 0
    ? 'blocked'
    : topVotes > 1
      ? 'split'
      : top === counts.support
        ? 'for'
        : top === counts.neutral
          ? 'neutral'
          : top === counts.against
            ? 'against'
            : 'split'
  return {
    total,
    completed: cleanTurns.length,
    blocked: turns.filter((turn) => turn.realStatus === 'blocked').length,
    failed: turns.filter(isFailedCouncilTurnForUi).length,
    for: counts.support,
    neutral: counts.neutral,
    against: counts.against,
    abstain: counts.abstain,
    consensus,
  }
}

function sessionWithLiveStats(session: CouncilSession, done: boolean): CouncilSession {
  const allTurns = allCouncilTurnsForSession(session)
  const stats = liveStatsFromTurns(allTurns)
  const base: CouncilSession = {
    ...session,
    sourceMode: done ? 'controlled-real-ai-one-shot' : 'running-real-ai',
    stats,
    voteLine: voteLineHebrew(stats),
    sourcesUsed: simpleSourceLabelsFromTurns(allTurns),
  }
  return sanitizeCouncilSessionForUi({
    ...base,
    verdict: done
      ? consensusHeadingFor({ ...base, sourceMode: 'controlled-real-ai-one-shot' })
      : `דיון חי: ${stats.completed}/${councilGenerals.length} גנרלים ענו`,
    summary: done
      ? `הדיון הסתיים עם ${voteLineHebrew(stats)}. הסיכום מופיע בסוף השרשור.`
      : stats.completed > 0
        ? `${allTurns[allTurns.length - 1]?.generalName ?? 'היועץ האחרון'} ענה. הדובר הבא יקרא אותו ויגיב.`
        : 'המועצה התחילה לחשוב. כל תשובה תיכנס לצ׳אט כשהיא חוזרת.',
  })
}

function appendLiveCouncilTurn(session: CouncilSession, turn: CouncilTurn, done: boolean, roundId?: string): CouncilSession {
  if (roundId) {
    const withRoundAnswer: CouncilSession = {
      ...session,
      discussionRounds: session.discussionRounds.map((round) => round.id === roundId
        ? { ...round, answers: [...round.answers.filter((item) => item.generalId !== turn.generalId), turn] }
        : round),
    }
    return sessionWithLiveStats(withRoundAnswer, done)
  }
  return sessionWithLiveStats({
    ...session,
    turns: [...session.turns.filter((item) => item.generalId !== turn.generalId), turn],
  }, done)
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

function mainChatTextForTurn(turn: CouncilTurn) {
  return cleanCouncilUiText(turn.chatSummary, compactDecisionText(turn.thought, turn.voteReason, 180), 220)
}

function shortCouncilOutcome(session: CouncilSession | null) {
  return compactDecisionText(consensusHeadingFor(session), 'מסקנה מוכנה', 72)
}

function isFailedCouncilTurnForUi(turn: CouncilTurn) {
  return turn.realStatus === 'failed'
    || turn.realStatus === 'blocked'
    || /לא התקבלה תשובת AI אמיתית|runner נכשל|AI נחסם/i.test(turn.thought)
}

function mainChatTurnsFor(turns: Array<CouncilTurn>) {
  return [...turns].sort((left, right) => {
    const failureOrder = Number(isFailedCouncilTurnForUi(left)) - Number(isFailedCouncilTurnForUi(right))
    if (failureOrder !== 0) return failureOrder
    return councilGenerals.findIndex((general) => general.id === left.generalId) - councilGenerals.findIndex((general) => general.id === right.generalId)
  })
}

function firstUsableCouncilGeneralId(turns: Array<CouncilTurn>) {
  const chairTurn = turns.find((turn) => turn.generalId === COUNCIL_CHAIR_GENERAL_ID && !isFailedCouncilTurnForUi(turn))
  if (chairTurn) return chairTurn.generalId
  return turns.find((turn) => !isFailedCouncilTurnForUi(turn))?.generalId ?? turns.at(0)?.generalId ?? councilGenerals[0].id
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
  if (session.sourceMode === 'running-real-ai') return 'המועצה קוראת את ההודעה ומחזירה תשובה אמיתית.'
  if (session.sourceMode === 'blocked-real-ai') return 'ה־runner נכשל; הפרטים הטכניים הוסתרו מהצ׳אט.'
  if (session.recommendation?.nextStep) return `הצעד הבא: ${compactDecisionText(session.recommendation.nextStep, session.summary, 170)}`
  if (session.recommendation?.reason) return compactDecisionText(session.recommendation.reason, session.summary, 190)
  if (session.recommendation?.summary) return compactDecisionText(session.recommendation.summary, session.summary, 190)
  return compactDecisionText(session.summary, 'המועצה סיימה להצביע.', 190)
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
  const next = councilGenerals.at((index + 1 + councilGenerals.length) % councilGenerals.length)
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

function handoffPromptFor(session: CouncilSession, planningGeneralNames: Array<string>) {
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
  const planningTeam = planningGeneralNames.length ? planningGeneralNames.join(', ') : 'No planning team selected'
  return `Council decision packet ${session.packetId}\n\nTopic:\n${session.topic}\n\nVerdict:\n${session.verdict}\n\nSummary:\n${session.summary}\n\nVotes:\n${session.voteLine}\n\nSelected planning team:\n${planningTeam}\n\nOpening general notes:\n${advice}\n\nDLV discussion and planning before handoff:\n${discussion}\n\nHermes: DLV approved this local council packet after discussion and a planning-team breakdown. Use the selected generals' plan as decision context, then discuss execution with DLV in the Workspace. Keep it scoped, tool-first, local-only by default, and ask before any external/live/money/customer/supplier action.`
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
  phase: 'opinion' | 'council-turn' | 'peer-vote' | 'synthesis' | 'single-follow-up'
  status: 'completed_local_only' | 'blocked' | 'failed'
  chatSummary?: string
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
  replyTo?: string
  replySnippet?: string
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
  drawingBoard?: {
    discussionId: string
    database?: string
    stateVersion?: string
  }
  generalStats?: Record<string, CouncilGeneralStats>
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
  return allCouncilTurnsForSession(session)
    .filter((turn) => turn.realStatus === 'completed_local_only')
    .map((turn) => ({
      generalId: turn.generalId,
      label: turn.generalName,
      chatSummary: turn.chatSummary,
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
  const chatSummary = apiTurn.status === 'completed_local_only'
    ? apiTurn.chatSummary ?? apiTurn.opinion
    : `לא התקבלה תשובה נקייה מ-${apiTurn.label}.`
  return sanitizeCouncilTurnForUi({
    generalId: apiTurn.generalId,
    generalName: general?.shortName ?? apiTurn.label,
    title: general?.title ?? 'Council AI advisor',
    accent: general?.accent ?? '#f6c56f',
    chatSummary,
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
    replyTo: apiTurn.replyTo,
    replySnippet: apiTurn.replySnippet,
  })
}

function simpleSourceLabelsFromTurns(turns: Array<CouncilTurn>) {
  const values = turns.flatMap((turn) => turn.contextUsed ?? [])
  const labels = ['Obsidian', ...values.map((item) => {
    const lower = item.toLowerCase()
    if (lower.includes('obsidian') || lower.endsWith('.md')) return 'Obsidian'
    if (lower.includes('http') || lower.includes('web')) return 'Web'
    if (lower.includes('supabase') || lower.includes('database')) return 'Supabase'
    if (lower.includes('file') || lower.includes('src/')) return 'Project files'
    return item.length > 24 ? `${item.slice(0, 21)}…` : item
  })]
  return labels.filter((item, index, list) => item && list.indexOf(item) === index).slice(0, 5)
}

function pendingCouncilSession(topic: string, discussionId?: string): CouncilSession {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return {
    packetId: `council-running-${Date.now().toString(36)}`,
    discussionId,
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

function blockedCouncilSession(topic: string, error: string, discussionId?: string): CouncilSession {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const safeError = cleanCouncilUiText(error, 'המנוע לא החזיר תשובה נקייה. הפרטים הטכניים הוסתרו.', 420)
  return {
    packetId: `council-blocked-${Date.now().toString(36)}`,
    discussionId,
    topic: cleanCouncilUiText(topic, 'דיון מועצה', 1_200),
    verdict: 'לא התקבלה מסקנה',
    summary: safeError,
    voteLine: '0 בעד · 0 ניטרלי · 0 נגד · 0 נמנע',
    turns: [],
    discussionRounds: [],
    createdAtLabel: now,
    sourceMode: 'blocked-real-ai',
    noFakeResponses: true,
    error: safeError,
    stats: { total: 6, completed: 0, blocked: 0, failed: 6, for: 0, neutral: 0, against: 0, abstain: 0, consensus: 'blocked' },
  }
}

function sessionFromRealCouncil(data: RealCouncilApiResponse): CouncilSession {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const openingTurns = Array.isArray(data.openingTurns) ? data.openingTurns : []
  const voteTurns = Array.isArray(data.voteTurns) ? data.voteTurns : []
  const realTurns = [...openingTurns, ...voteTurns].map(turnFromRealCouncil)
  return sanitizeCouncilSessionForUi({
    packetId: data.decisionPacket?.packetId ?? data.runId,
    discussionId: data.drawingBoard?.discussionId,
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
    sourcesUsed: simpleSourceLabelsFromTurns(realTurns),
    error: data.error,
  })
}

type CouncilDrawingBoardDiscussionPayload = NonNullable<CouncilDrawingBoardApiResponse['discussions']>[number]
type CouncilDrawingBoardRoundPayload = NonNullable<CouncilDrawingBoardDiscussionPayload['rounds']>[number]

function councilRoundTargetForUi(round: CouncilDrawingBoardRoundPayload): string | undefined {
  const target = round.targetAgentId
  if (target === 'council' || target === 'planning-team') return target
  const generalId = target?.replace(/^council-/, '')
  if (isKnownCouncilGeneralId(generalId)) return generalId
  if (round.kind === 'reconsideration' || round.kind === 'follow-up') return 'council'
  return undefined
}

function discussionRoundFromDrawingBoard(round: CouncilDrawingBoardRoundPayload): CouncilDiscussionRound | null {
  if (!round.roundId) return null
  const answers = Array.isArray(round.turns) ? round.turns.map(turnFromRealCouncil) : []
  return {
    id: round.roundId,
    operatorOpinion: cleanCouncilUiText(round.question, 'שאלת המשך', 1_200),
    answers,
    createdAtLabel: new Date(round.completedAtMs ?? round.startedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    targetGeneralId: councilRoundTargetForUi(round),
  }
}

function sessionFromDrawingBoardDiscussion(item: CouncilDrawingBoardDiscussionPayload): CouncilSession | null {
  const cleanTopic = cleanCouncilUiText(item.topic, 'דיון מועצה', 1_200)
  const discussionRounds = (item.rounds ?? [])
    .map(discussionRoundFromDrawingBoard)
    .filter((round): round is CouncilDiscussionRound => Boolean(round))

  if (!item.result?.runId) {
    if (item.status === 'thinking') return pendingCouncilSession(cleanTopic, item.discussionId)
    if (item.status === 'blocked') return blockedCouncilSession(cleanTopic, 'הדיון האחרון נחסם לפני שחזרה תשובת AI נקייה.', item.discussionId)
    return null
  }

  const base = sessionFromRealCouncil({
    ...item.result,
    drawingBoard: item.result.drawingBoard ?? { discussionId: item.discussionId },
  })
  return sanitizeCouncilSessionForUi({
    ...base,
    discussionId: item.discussionId,
    topic: cleanTopic,
    sourceMode: item.status === 'thinking' ? 'running-real-ai' : base.sourceMode,
    discussionRounds,
    sourcesUsed: [...new Set([...(base.sourcesUsed ?? []), ...discussionRounds.flatMap((round) => round.answers.flatMap((turn) => turn.contextUsed ?? []))])].slice(0, 5),
  })
}

function archivedSessionFromDrawingBoard(item: NonNullable<CouncilDrawingBoardApiResponse['discussions']>[number]): CouncilArchivedSession | null {
  const session = sessionFromDrawingBoardDiscussion(item)
  if (!session || session.sourceMode === 'running-real-ai') return null
  const cleanTopic = cleanCouncilUiText(item.topic || session.topic, session.topic, 1_200)
  return {
    packetId: session.packetId,
    discussionId: item.discussionId,
    topic: cleanTopic,
    verdict: session.verdict,
    archivedAtLabel: new Date(item.updatedAtMs).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }),
    session: sanitizeCouncilSessionForUi({
      ...session,
      discussionId: item.discussionId,
      topic: cleanTopic,
    }),
  }
}

async function fetchCouncilDrawingBoardState(): Promise<CouncilDrawingBoardApiResponse> {
  const response = await fetch('/api/war-room/council/run', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  })
  return await response.json() as CouncilDrawingBoardApiResponse
}

async function fetchCouncilJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs = COUNCIL_REAL_AI_TIMEOUT_MS): Promise<{ response: Response; data: T }> {
  const controller = new AbortController()
  const timeoutState = { didTimeout: false }
  const timeout = window.setTimeout(() => {
    timeoutState.didTimeout = true
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const data = await response.json() as T
    return { response, data }
  } catch (error) {
    if (timeoutState.didTimeout) throw new Error(`Council API timed out after ${Math.round(timeoutMs / 1000)}s`)
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

function activeCouncilRoundIdForTurn(session: CouncilSession) {
  const latestGroupRound = [...session.discussionRounds].reverse().find((round) => round.targetGeneralId === 'council' || round.targetGeneralId === 'planning-team')
  return latestGroupRound?.id
}

function liveCouncilTopicForTurn(baseTopic: string, session: CouncilSession) {
  const interventions = session.discussionRounds
    .filter((round) => round.targetGeneralId === 'council' || round.targetGeneralId === 'planning-team')
    .map((round, index) => `${index + 1}. ${round.operatorOpinion}`)
  if (!interventions.length) return baseTopic
  return `${baseTopic}\n\nDLV התערב באמצע הדיון. הדוברים הבאים חייבים להגיב גם להודעות האלה לפי הסדר:\n${interventions.join('\n')}`
}

async function fetchRealCouncilSession(topic: string, options: { discussionId?: string; roundId?: string; agentIds?: Array<string>; previousOpinions?: ReturnType<typeof peerOpinionsFromSession> } = {}): Promise<CouncilSession> {
  const { response, data } = await fetchCouncilJsonWithTimeout<RealCouncilApiResponse>('/api/war-room/council/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      topic,
      includePeerVote: true,
      agentIds: options.agentIds,
      previousOpinions: options.previousOpinions,
      timeoutMs: COUNCIL_FULL_COUNCIL_AGENT_TIMEOUT_MS,
      discussionId: options.discussionId,
      roundId: options.roundId,
    }),
  }, COUNCIL_FULL_COUNCIL_HTTP_TIMEOUT_MS)
  const hasRoundPayload = typeof data.runId === 'string' && Array.isArray(data.openingTurns) && Boolean(data.stats)
  if (!response.ok || !data.ok) {
    const message = data.error ?? data.summary
    return hasRoundPayload
      ? sessionFromRealCouncil({ ...data, error: message, summary: data.summary })
      : blockedCouncilSession(topic, message)
  }
  return sessionFromRealCouncil(data)
}

async function fetchRealCouncilFollowUp(input: {
  session: CouncilSession
  generalId: string
  question: string
  roundId?: string
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
      discussionId: input.session.discussionId,
      roundId: input.roundId,
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
    voteReason: 'לא חזרה תשובת המשך נקייה; לא נוצרה תשובה מזויפת.',
    confidence: 0,
    personalitySignal: 'שיחת ההמשך נכשלה סגור.',
    contextUsed: [],
    peerReadback: [],
    riskFlags: ['שיחת ההמשך לא החזירה תשובה נקייה'],
    suggestedFollowUp: 'נסה שוב עם שאלה אחת קצרה וברורה.',
    usageReadback: 'לא דווח שימוש',
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

function messageBelongsToMainCouncil(message: CouncilChatMessage) {
  if (message.type === 'operator') return message.round.targetGeneralId === 'council' || message.round.targetGeneralId === 'planning-team'
  return message.turn.phase !== 'single-follow-up'
}

function advisorChatMessagesFor(session: CouncilSession, generalId: string): Array<CouncilChatMessage> {
  return chatMessagesFor(session).filter((message) => messageBelongsToAdvisor(message, generalId))
}

function typingLabelFor(message: CouncilChatMessage | null) {
  if (!message) return ''
  if (message.type === 'operator') return 'השאלה שלך נכנסה לצ׳אט המועצה...'
  const general = councilGenerals.find((item) => item.id === message.turn.generalId)
  return `${general?.shortName ?? message.turn.generalName} כותב תשובה נקייה...`
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
  onTransferToHermes,
  launchRequest,
  navigationSlot,
}: {
  onTransferToHermes: (handoff: CouncilDecisionHandoff) => void
  launchRequest?: CouncilLaunchRequest | null
  navigationSlot?: ReactNode
}) {
  const [initialCouncilState] = useState(() => loadStoredCouncilState())
  const [topic, setTopic] = useState(() => initialCouncilState?.topic ?? '')
  const [operatorOpinion, setOperatorOpinion] = useState(() => initialCouncilState?.operatorOpinion ?? '')
  const [session, setSession] = useState<CouncilSession | null>(() => initialCouncilState?.session ?? null)
  const [activeGeneralId, setActiveGeneralId] = useState(() => initialCouncilState?.activeGeneralId ?? councilGenerals[0].id)
  const [motionState, setMotionState] = useState<CouncilMotionState>(() => initialCouncilState?.motionState ?? 'roaming')
  const [handoffState, setHandoffState] = useState<CouncilHandoffState>(() => initialCouncilState?.handoffState ?? 'idle')
  const [flowStage, setFlowStage] = useState<CouncilFlowStage>(() => initialCouncilState?.flowStage ?? 'discussion')
  const [selectedPlanningGeneralIds, setSelectedPlanningGeneralIds] = useState<Array<string>>(() => initialCouncilState?.selectedPlanningGeneralIds ?? [])
  const [visibleMessageCount, setVisibleMessageCount] = useState(() => initialCouncilState?.session ? chatMessagesFor(initialCouncilState.session).length : 0)
  const [councilRunPending, setCouncilRunPending] = useState(() => initialCouncilState?.session?.sourceMode === 'running-real-ai')
  const [minimalView, setMinimalView] = useState<CouncilMinimalView>('council')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveEntries, setArchiveEntries] = useState<Array<CouncilArchivedSession>>(() => loadCouncilArchive())
  const [drawingBoardStats, setDrawingBoardStats] = useState<Partial<Record<string, CouncilGeneralStats>>>({})
  const [drawingBoardStatus, setDrawingBoardStatus] = useState('Loading saved discussions')
  const mainChatRef = useRef<HTMLDivElement | null>(null)
  const chatRef = useRef<HTMLDivElement | null>(null)
  const advisorChatRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<CouncilSession | null>(initialCouncilState?.session ?? null)
  const consumedLaunchRequestRef = useRef<string | null>(null)
  const handoffUnlocked = Boolean(session && handoffState !== 'idle')
  const activeGeneral = councilGenerals.find((general) => general.id === activeGeneralId) ?? councilGenerals[0]
  const latestRound = session?.discussionRounds[session.discussionRounds.length - 1] ?? null
  const latestCouncilRound = [...(session?.discussionRounds ?? [])].reverse().find((round) => round.targetGeneralId === 'council') ?? null
  const activeTurn = latestRound?.answers.find((turn) => turn.generalId === activeGeneral.id)
    ?? session?.turns.find((turn) => turn.generalId === activeGeneral.id)
    ?? null
  const activeGeneralStats = drawingBoardStats[activeGeneral.id]
  const statLineForGeneral = (general: CouncilGeneral) => {
    const stats = drawingBoardStats[general.id]
    return stats ? `${stats.participated} chats · ${stats.wins} wins` : 'new profile'
  }
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
  const selectedPlanningGeneralNames = selectedPlanningGeneralIds
    .map((id) => councilGenerals.find((general) => general.id === id)?.shortName)
    .filter((name): name is string => Boolean(name))
  const handoff = useMemo<CouncilDecisionHandoff | null>(() => session
    ? {
      packetId: session.packetId,
      topic: session.topic,
      verdict: session.verdict,
      summary: session.summary,
      voteLine: session.voteLine,
      prompt: handoffPromptFor(session, selectedPlanningGeneralNames),
      planningGeneralIds: selectedPlanningGeneralIds,
      planningGeneralNames: selectedPlanningGeneralNames,
    }
    : null,
  [selectedPlanningGeneralIds, selectedPlanningGeneralNames, session])
  const chatMessages = useMemo(() => session ? chatMessagesFor(session) : [], [session])
  const advisorChatMessages = useMemo(() => session ? advisorChatMessagesFor(session, activeGeneral.id) : [], [activeGeneral.id, session])
  const visibleChatMessages = chatMessages.slice(0, visibleMessageCount)
  const visibleMainChatMessages = visibleChatMessages.filter(messageBelongsToMainCouncil)
  const visibleAdvisorChatMessages = visibleChatMessages.filter((message) => messageBelongsToAdvisor(message, activeGeneral.id))
  const pendingChatMessage = visibleMessageCount < chatMessages.length ? chatMessages[visibleMessageCount] : null
  const pendingMainChatMessage = pendingChatMessage && messageBelongsToMainCouncil(pendingChatMessage) ? pendingChatMessage : null
  const advisorPendingMessage = pendingChatMessage && messageBelongsToAdvisor(pendingChatMessage, activeGeneral.id) ? pendingChatMessage : null
  const currentDecisionTurns = latestCouncilRound ? latestCouncilRound.answers : session?.turns ?? []
  const currentDecisionTurnByGeneral = new Map(currentDecisionTurns.map((turn) => [turn.generalId, turn]))
  const currentDecisionMessageIds = new Set(latestCouncilRound
    ? latestCouncilRound.answers.map((turn) => `${latestCouncilRound.id}-${turn.generalId}`)
    : session?.turns.map((turn) => `opening-${turn.generalId}`) ?? [])
  const visibleVoteGeneralIds = new Set(visibleChatMessages
    .filter((message): message is Extract<CouncilChatMessage, { type: 'turn' }> => message.type === 'turn' && currentDecisionMessageIds.has(message.id))
    .map((message) => message.turn.generalId))
  const pendingVoteGeneralId = pendingChatMessage?.type === 'turn' && currentDecisionMessageIds.has(pendingChatMessage.id) ? pendingChatMessage.turn.generalId : ''
  const voteCounts = latestCouncilRound
    ? voteCountsFromTurns(currentDecisionTurns)
    : session?.stats
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
  const primaryCouncilAnswer = shortCouncilOutcome(session)
  const councilReadbackSources = session?.sourcesUsed?.join(', ') || 'no sources listed'
  const influentialTurn = currentDecisionTurns.find((turn) => (turn.peerReadback?.length ?? 0) > 0)
    ?? currentDecisionTurns.find((turn) => Boolean(turn.replyTo))
    ?? null
  const rethinkSignal = councilRunPending
    ? 'המועצה חושבת עכשיו.'
    : pendingMainChatMessage?.type === 'turn'
      ? `${pendingMainChatMessage.turn.generalName} כותב עכשיו.`
      : influentialTurn
        ? `${influentialTurn.generalName} העלה נקודה שהמועצה בדקה.`
        : latestCouncilRound
          ? 'סבב מועצה חדש נוסף לאותו דיון.'
          : 'אין עדיין סבב נוסף.'
  const groupChatMembers: Array<CouncilGroupChatMember> = councilGenerals.map((general) => {
    const turn = currentDecisionTurnByGeneral.get(general.id)
    const stats = drawingBoardStats[general.id]
    const isChair = general.id === COUNCIL_CHAIR_GENERAL_ID
    return {
      id: general.id,
      name: general.shortName,
      personaLabel: isChair ? 'ראש המועצה · מסכם ושומר מחלוקות' : general.personaLabel,
      memoryLine: stats?.memoryNotes[0],
      statLine: stats ? `${stats.participated} דיונים · ${stats.wins} הובלות` : 'פרופיל חדש',
      isChair,
      accent: general.accent,
      portraitUrl: generalPortraitPath(general.assetSlug),
      voteLabel: turn ? voteLabel(turn.vote) : 'ממתין',
      voteTone: turn ? voteTone(turn.vote) : 'pending',
      selectedForPlanning: selectedPlanningGeneralIds.includes(general.id),
      answered: Boolean(turn && !isFailedCouncilTurnForUi(turn)),
    }
  })
  const groupChatMessages: Array<CouncilGroupChatMessage> = visibleMainChatMessages.map((message) => {
    if (message.type === 'operator') {
      return {
        id: message.id,
        senderType: 'operator',
        senderId: 'dlv',
        senderName: 'DLV',
        text: message.round.operatorOpinion,
        timeLabel: message.round.targetGeneralId === 'planning-team'
          ? `${message.round.createdAtLabel} · לצוות הפירוק`
          : `${message.round.createdAtLabel} · למועצה`,
      }
    }
    const general = councilGenerals.find((item) => item.id === message.turn.generalId)
    return {
      id: message.id,
      senderType: 'general',
      senderId: message.turn.generalId,
      senderName: message.turn.generalName,
      portraitUrl: general ? generalPortraitPath(general.assetSlug) : undefined,
      accent: message.turn.accent,
      text: mainChatTextForTurn(message.turn),
      voteLabel: voteLabel(message.turn.vote),
      voteTone: voteTone(message.turn.vote),
      replyTo: message.turn.replyTo,
      replySnippet: message.turn.replySnippet,
      failed: isFailedCouncilTurnForUi(message.turn),
      phaseLabel: message.turn.phase === 'single-follow-up'
        ? 'שיחת יועץ'
        : message.turn.phase === 'synthesis'
          ? 'יוליוס · ראש המועצה'
          : message.turn.phase === 'council-turn'
            ? 'תגובה לדיון'
            : 'דעה עצמאית',
    }
  })
  const latestGroupRound = [...(session?.discussionRounds ?? [])].reverse()
    .find((round) => round.targetGeneralId === 'council' || round.targetGeneralId === 'planning-team')
  const pendingQueueIds = latestGroupRound?.targetGeneralId === 'planning-team'
    ? orderedCouncilGeneralIds(selectedPlanningGeneralIds)
    : orderedCouncilGeneralIds()
  const answeredQueueIds = new Set((latestGroupRound ? latestGroupRound.answers : session?.turns ?? []).map((turn) => turn.generalId))
  const pendingGroupMember = councilRunPending
    ? groupChatMembers.find((member) => pendingQueueIds.includes(member.id) && !answeredQueueIds.has(member.id)) ?? null
    : null

  function applyRestoredCouncilSession(restoredSession: CouncilSession) {
    const currentSession = sessionRef.current
    const sameDiscussion = Boolean(
      restoredSession.discussionId
        && currentSession?.discussionId
        && restoredSession.discussionId === currentSession.discussionId,
    )
    if (
      currentSession
      && currentSession.sourceMode !== 'running-real-ai'
      && restoredSession.sourceMode === 'running-real-ai'
      && sameDiscussion
    ) return

    sessionRef.current = restoredSession
    setTopic(restoredSession.topic)
    setOperatorOpinion('')
    setSession(restoredSession)
    setMotionState('seated')
    setMinimalView('council')
    setCouncilRunPending(restoredSession.sourceMode === 'running-real-ai')
    if (restoredSession.sourceMode !== 'running-real-ai') {
      setActiveGeneralId(firstUsableCouncilGeneralId(allCouncilTurnsForSession(restoredSession)))
      setVisibleMessageCount(chatMessagesFor(restoredSession).length)
    } else {
      setVisibleMessageCount((count) => Math.min(count, chatMessagesFor(restoredSession).length))
    }
  }

  function applyDrawingBoardPayload(payload: CouncilDrawingBoardApiResponse) {
    setDrawingBoardStats(payload.generalStats ?? {})
    const databaseEntries = (payload.discussions ?? [])
      .map(archivedSessionFromDrawingBoard)
      .filter((entry): entry is CouncilArchivedSession => Boolean(entry))
    if (databaseEntries.length) {
      const localEntries = loadCouncilArchive()
      const merged = [...databaseEntries, ...localEntries]
        .filter((entry, index, list) => list.findIndex((candidate) => candidate.packetId === entry.packetId) === index)
        .slice(0, COUNCIL_ARCHIVE_LIMIT)
      setArchiveEntries(merged)
      saveCouncilArchive(merged)
    }

    const activeDiscussion = payload.activeDiscussionId
      ? payload.discussions?.find((item) => item.discussionId === payload.activeDiscussionId)
      : undefined
    const restoredSession = activeDiscussion ? sessionFromDrawingBoardDiscussion(activeDiscussion) : null
    const currentSession = sessionRef.current
    const shouldRestore = Boolean(
      restoredSession
        && (!currentSession
          || currentSession.sourceMode === 'running-real-ai'
          || currentSession.discussionId === restoredSession.discussionId),
    )
    if (restoredSession && shouldRestore) applyRestoredCouncilSession(restoredSession)
  }

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    saveStoredCouncilState({
      topic,
      operatorOpinion,
      session,
      activeGeneralId,
      motionState,
      handoffState,
      flowStage,
      selectedPlanningGeneralIds,
    })
  }, [activeGeneralId, councilRunPending, flowStage, handoffState, motionState, operatorOpinion, selectedPlanningGeneralIds, session, topic])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const payload = await fetchCouncilDrawingBoardState()
        if (controller.signal.aborted) return
        applyDrawingBoardPayload(payload)
        setDrawingBoardStatus(payload.ok ? 'נשמר מקומית במחשב' : 'נשמר רק בדפדפן')
      } catch {
        if (!controller.signal.aborted) setDrawingBoardStatus('ארכיון מקומי בלבד')
      }
    })()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!session?.discussionId || session.sourceMode !== 'running-real-ai') return undefined
    let cancelled = false
    const pollActiveDiscussion = async () => {
      try {
        const payload = await fetchCouncilDrawingBoardState()
        if (cancelled) return
        applyDrawingBoardPayload(payload)
        setDrawingBoardStatus(payload.ok ? 'ממשיך דיון שמור' : 'ממשיך מהדפדפן')
      } catch {
        if (!cancelled) setDrawingBoardStatus('ממשיך מקומית · מחכה לשרת')
      }
    }
    void pollActiveDiscussion()
    const interval = window.setInterval(() => void pollActiveDiscussion(), 4_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [session?.discussionId, session?.sourceMode])

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
    const mainNode = mainChatRef.current
    if (mainNode) mainNode.scrollTop = mainNode.scrollHeight
    const node = chatRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [visibleMessageCount, pendingChatMessage?.id, visibleMainChatMessages.length, session?.packetId])

  useEffect(() => {
    const node = advisorChatRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [activeGeneral.id, advisorPendingMessage?.id, session?.packetId, visibleAdvisorChatMessages.length])

  useEffect(() => {
    const request = launchRequest
    if (!request || consumedLaunchRequestRef.current === request.requestId || councilRunPending) return
    const askedTopic = request.topic.trim()
    if (!askedTopic) return
    consumedLaunchRequestRef.current = request.requestId
    const currentSession = sessionRef.current
    if (currentSession) setArchiveEntries(upsertCouncilArchiveSession(currentSession))
    clearStoredCouncilState()
    sessionRef.current = null
    setSession(null)
    setTopic(askedTopic)
    setOperatorOpinion('')
    setHandoffState('idle')
    setFlowStage('discussion')
    setSelectedPlanningGeneralIds([])
    setVisibleMessageCount(0)
    setMinimalView('council')
    setArchiveOpen(false)
    void (async () => {
      await fetch('/api/war-room/council/run', {
        method: 'DELETE',
        cache: 'no-store',
        credentials: 'same-origin',
      }).catch(() => undefined)
      if (consumedLaunchRequestRef.current === request.requestId) {
        await conveneCouncilTopic(askedTopic)
      }
    })()
  }, [councilRunPending, launchRequest?.requestId])

  const stateLabel = handoffState === 'sent'
    ? 'נשלח להרמס'
    : handoffUnlocked
      ? 'מסקנה מוכנה להרמס'
      : session
        ? session.sourceMode === 'running-real-ai'
          ? 'קורא Obsidian ומריץ גנרלים אמיתיים'
          : session.sourceMode === 'blocked-real-ai'
            ? 'AI נחסם · אין תשובות מזויפות'
              : latestRound?.targetGeneralId && latestRound.targetGeneralId !== 'council'
                ? `שיחת תכנון 1:1 · ${activeGeneral.shortName}`
                : latestCouncilRound
                  ? 'סבב מועצה נוסף'
                : visibleMessageCount < chatMessages.length
                ? 'מציג תשובות AI אמיתיות בהדרגה'
                : 'המועצה פתוחה לתכנון'
        : 'רדומים · מסתובבים בחדר'
  const needsYouLabel = !session
    ? 'כתוב נושא'
    : handoffUnlocked
      ? 'תוכנית מוכנה לשליחה'
      : 'בחר יועץ, דלג, או פרט שלב'

  async function runCouncilAgentQueue(seedSession: CouncilSession, baseTopic: string, requestedGeneralIds: Array<string> = councilGenerals.map((general) => general.id)): Promise<CouncilSession> {
    const sessionBeforeRequest = sessionRef.current ?? seedSession
    const queueGeneralIds = orderedCouncilGeneralIds(requestedGeneralIds)
    const requestAgentIds = queueGeneralIds.map(councilAgentIdForGeneral)
    const appendRoundId = activeCouncilRoundIdForTurn(sessionBeforeRequest)
    const requestTopic = liveCouncilTopicForTurn(baseTopic, sessionBeforeRequest)
    const next = await fetchRealCouncilSession(requestTopic, {
      discussionId: sessionBeforeRequest.discussionId,
      roundId: appendRoundId,
      agentIds: requestAgentIds,
      previousOpinions: peerOpinionsFromSession(sessionBeforeRequest),
    })

    const nextSession = appendRoundId
      ? sanitizeCouncilSessionForUi({
        ...sessionWithLiveStats({
          ...sessionBeforeRequest,
          sourceMode: next.sourceMode,
          contextPacketId: next.contextPacketId ?? sessionBeforeRequest.contextPacketId,
          recommendation: next.recommendation ?? sessionBeforeRequest.recommendation,
          discussionRounds: sessionBeforeRequest.discussionRounds.map((round) => round.id === appendRoundId
            ? { ...round, answers: next.turns }
            : round),
        }, next.sourceMode !== 'running-real-ai'),
        verdict: next.verdict,
        summary: next.summary,
        voteLine: next.voteLine,
        stats: next.stats,
        recommendation: next.recommendation,
        sourcesUsed: [...new Set([...(sessionBeforeRequest.sourcesUsed ?? []), ...(next.sourcesUsed ?? [])])].slice(0, 5),
      })
      : sanitizeCouncilSessionForUi({
        ...next,
        discussionId: sessionBeforeRequest.discussionId ?? next.discussionId,
        topic: seedSession.topic,
      })

    sessionRef.current = nextSession
    setSession(nextSession)
    setActiveGeneralId(firstUsableCouncilGeneralId(allCouncilTurnsForSession(nextSession)))
    setVisibleMessageCount((count) => Math.min(count, chatMessagesFor(nextSession).length))
    return nextSession
  }

  async function conveneCouncilTopic(askedTopicInput: string) {
    const askedTopic = askedTopicInput.trim()
    if (!askedTopic || councilRunPending) {
      setMotionState('roaming')
      return
    }
    const discussionId = `discussion-${Date.now().toString(36)}`
    setCouncilRunPending(true)
    const pendingSession = pendingCouncilSession(askedTopic, discussionId)
    sessionRef.current = pendingSession
    setTopic(askedTopic)
    setSession(pendingSession)
    setActiveGeneralId(councilGenerals[0].id)
    setMotionState('seated')
    setHandoffState('idle')
    setFlowStage('discussion')
    setSelectedPlanningGeneralIds([])
    setOperatorOpinion('')
    setVisibleMessageCount(0)
    setMinimalView('council')
    try {
      const finalSession = await runCouncilAgentQueue(pendingSession, askedTopic)
      setActiveGeneralId(firstUsableCouncilGeneralId(allCouncilTurnsForSession(finalSession)))
      void fetchCouncilDrawingBoardState().then((payload) => setDrawingBoardStats(payload.generalStats ?? {})).catch(() => undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const blocked = blockedCouncilSession(askedTopic, message)
      sessionRef.current = blocked
      setSession(blocked)
      setVisibleMessageCount(0)
    } finally {
      setCouncilRunPending(false)
    }
  }

  async function conveneCouncil() {
    await conveneCouncilTopic(topic)
  }

  function releaseCouncilToRoam() {
    if (session) setArchiveEntries(upsertCouncilArchiveSession(session))
    clearStoredCouncilState()
    setTopic('')
    sessionRef.current = null
    setSession(null)
    setMotionState('roaming')
    setHandoffState('idle')
    setFlowStage('discussion')
    setSelectedPlanningGeneralIds([])
    setOperatorOpinion('')
    setVisibleMessageCount(0)
    setCouncilRunPending(false)
    setMinimalView('council')
    setArchiveOpen(false)
  }

  function startNewDiscussion() {
    if (session) setArchiveEntries(upsertCouncilArchiveSession(session))
    clearStoredCouncilState()
    void fetch('/api/war-room/council/run', {
      method: 'DELETE',
      cache: 'no-store',
      credentials: 'same-origin',
    }).catch(() => undefined)
    setTopic('')
    sessionRef.current = null
    setSession(null)
    setActiveGeneralId(councilGenerals[0].id)
    setMotionState('roaming')
    setHandoffState('idle')
    setFlowStage('discussion')
    setSelectedPlanningGeneralIds([])
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
    const restoredSession = sanitizeCouncilSessionForUi(entry.session)
    clearStoredCouncilState()
    setTopic(restoredSession.topic)
    setOperatorOpinion('')
    sessionRef.current = restoredSession
    setSession(restoredSession)
    setActiveGeneralId(firstUsableCouncilGeneralId(restoredSession.turns))
    setMotionState('seated')
    setHandoffState('idle')
    setFlowStage('discussion')
    setSelectedPlanningGeneralIds([])
    setVisibleMessageCount(chatMessagesFor(restoredSession).length)
    setCouncilRunPending(false)
    setMinimalView('council')
    setArchiveOpen(false)
  }

  async function askWholeCouncilFollowUp(promptOverride?: string) {
    const currentSession = sessionRef.current ?? session
    const question = (promptOverride ?? operatorOpinion).trim()
    if (!currentSession || !question) return
    const roundId = `round-${Date.now().toString(36)}`
    const createdAtLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const pendingRound: CouncilDiscussionRound = {
      id: roundId,
      operatorOpinion: question,
      answers: [],
      createdAtLabel,
      targetGeneralId: 'council',
    }
    const pendingSession = sessionWithLiveStats({
      ...currentSession,
      sourceMode: 'running-real-ai',
      discussionRounds: [...currentSession.discussionRounds, pendingRound],
    }, false)
    sessionRef.current = pendingSession
    setSession(pendingSession)
    setMinimalView('council')
    setMotionState('seated')
    setHandoffState('idle')
    setFlowStage('discussion')
    setSelectedPlanningGeneralIds([])
    setOperatorOpinion('')
    setVisibleMessageCount((count) => Math.min(count, Math.max(0, chatMessagesFor(pendingSession).length - 1)))

    if (councilRunPending) {
      return
    }

    setCouncilRunPending(true)
    try {
      const finalSession = await runCouncilAgentQueue(pendingSession, currentSession.topic)
      setActiveGeneralId(firstUsableCouncilGeneralId(allCouncilTurnsForSession(finalSession)))
      void fetchCouncilDrawingBoardState().then((payload) => setDrawingBoardStats(payload.generalStats ?? {})).catch(() => undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const blocked = blockedCouncilSession(liveCouncilTopicForTurn(currentSession.topic, pendingSession), message)
      const failedSession = sessionWithLiveStats({
        ...pendingSession,
        discussionRounds: pendingSession.discussionRounds.map((round) => round.id === roundId
          ? { ...round, answers: blocked.turns }
          : round),
      }, true)
      sessionRef.current = failedSession
      setSession(failedSession)
      setVisibleMessageCount((count) => Math.min(count, chatMessagesFor(failedSession).length))
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
    const pendingSession: CouncilSession = {
      ...session,
      discussionRounds: [...session.discussionRounds, pendingRound],
    }
    setSession(pendingSession)
    setVisibleMessageCount(chatMessagesFor(pendingSession).length)
    setMotionState('seated')
    setHandoffState('idle')
    setOperatorOpinion('')
    try {
      const answer = await fetchRealCouncilFollowUp({ session, generalId: activeGeneral.id, question: opinion, roundId })
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
      void fetchCouncilDrawingBoardState().then((payload) => setDrawingBoardStats(payload.generalStats ?? {})).catch(() => undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedAnswer = turnFromRealCouncil({
        generalId: activeGeneral.id,
        label: activeGeneral.shortName,
        phase: 'single-follow-up',
        status: 'failed',
        opinion: '',
        vote: 'abstain',
        voteReason: 'לא חזרה תשובת המשך נקייה; לא נוצרה תשובה מזויפת.',
        confidence: 0,
        personalitySignal: activeGeneral.strength,
        contextUsed: [],
        peerReadback: [],
        riskFlags: ['שליחת ההמשך מהמסך לא החזירה תשובה נקייה'],
        suggestedFollowUp: 'נסה שוב את היועץ הזה עם שאלה אחת קצרה.',
        usageReadback: 'לא דווח שימוש',
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

  function beginPlanningTeamSelection() {
    if (!session || councilRunPending) return
    setFlowStage('team-selection')
    setHandoffState('idle')
    setSelectedPlanningGeneralIds([])
  }

  function togglePlanningGeneral(generalId: string) {
    if (!isKnownCouncilGeneralId(generalId) || councilRunPending) return
    setSelectedPlanningGeneralIds((current) => current.includes(generalId)
      ? current.filter((id) => id !== generalId)
      : [...current, generalId])
  }

  function continueCouncilDiscussion() {
    if (councilRunPending || handoffState === 'sent') return
    setFlowStage('discussion')
    setHandoffState('idle')
  }

  async function requestPlanningTeamBreakdown() {
    const currentSession = sessionRef.current ?? session
    if (!currentSession || !selectedPlanningGeneralIds.length || councilRunPending) return
    const roundId = `planning-${Date.now().toString(36)}`
    const selectedNames = selectedPlanningGeneralIds
      .map((id) => councilGenerals.find((general) => general.id === id)?.shortName)
      .filter((name): name is string => Boolean(name))
    const planningQuestion = `${COUNCIL_STEP_PLAN_PROMPT}\n\nDLV בחר בצוות הפירוק: ${selectedNames.join(', ')}. כל אחד חייב לתרום מהעדשה העצמאית שלו, לקרוא את הקודמים, ולהשאיר תוכנית אחת קריאה ומעשית.`
    const pendingRound: CouncilDiscussionRound = {
      id: roundId,
      operatorOpinion: `בחרתי את ${selectedNames.join(', ')} לצוות הפירוק. תפרקו את הכיוון לתוכנית ברורה לפני שנעביר להרמס.`,
      answers: [],
      createdAtLabel: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      targetGeneralId: 'planning-team',
    }
    const pendingSession = sessionWithLiveStats({
      ...currentSession,
      sourceMode: 'running-real-ai',
      discussionRounds: [...currentSession.discussionRounds, pendingRound],
    }, false)
    const planningTopic = `${currentSession.topic}\n\n${planningQuestion}`
    sessionRef.current = pendingSession
    setSession(pendingSession)
    setFlowStage('plan-drafting')
    setHandoffState('idle')
    setMinimalView('council')
    setOperatorOpinion('')
    setVisibleMessageCount(chatMessagesFor(pendingSession).length)
    setCouncilRunPending(true)
    try {
      const plannedSession = await runCouncilAgentQueue(pendingSession, planningTopic, selectedPlanningGeneralIds)
      sessionRef.current = plannedSession
      setSession(plannedSession)
      setFlowStage('ready-for-hermes')
      setHandoffState('unlocked')
      setVisibleMessageCount(chatMessagesFor(plannedSession).length)
    } catch {
      setFlowStage('team-selection')
      setHandoffState('idle')
    } finally {
      setCouncilRunPending(false)
    }
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
      data-professional-workbench="v1"
      data-room-ownership="council-decision-only"
      data-scroll-surface="true"
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
      data-council-summary-first="false"
      data-council-user-prompt-visible="true"
      data-council-static-copy="details-only"
      data-council-vote-labels="for-neutral-against-abstain"
      data-council-persistence="local-json-plus-drawing-board-v2"
      data-council-resume-until-new-discussion="true"
      data-council-persisted-state={councilHasPersistableState ? 'true' : 'false'}
      data-council-design-pass="group-chat-v1"
      data-council-primary-ui="canonical-group-chat-only-v1"
      data-council-ux-rescue="group-conversation-v1"
      data-council-chat-native="live-group-thread-v2"
      data-council-chat-polish="purpose-built-group-v1"
      data-council-flow-stage={flowStage}
      data-council-planning-general-ids={selectedPlanningGeneralIds.join(',')}
      data-council-pro-layout="generals-room-v1"
      data-council-independent-opinions="first-pass-no-forced-conflict-v1"
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
      data-council-profile-count={councilGenerals.length}
      data-council-runtime-agent-scope="five-independent-advisors-plus-julius-chair"
      data-council-consultation-count={completedConsultations}
      data-council-min-thinking-ms={COUNCIL_LOCAL_THINKING_MIN_MS}
      data-council-max-thinking-ms={COUNCIL_LOCAL_THINKING_MAX_MS}
      data-council-rethink-visual={councilRunPending || Boolean(influentialTurn) || Boolean(latestRound) ? 'true' : 'false'}
      aria-label="Council of Strategists planning workspace"
    >
      <header className="council-chamber__header" dir="rtl">
        <div className="council-chamber__header-copy" dir="rtl">
          <span>חדר עבודה</span>
          <h2>חדר מועצת הגנרלים</h2>
          <p>כתוב נושא, קבל תשובה קצרה ועצמאית מכל גנרל, ואז פתח פרטי אם צריך פירוט.</p>
        </div>
        <div className="council-chamber__session-actions" dir="rtl" aria-label="פעולות חדר המועצה">
          {navigationSlot}
          <button type="button" onClick={startNewDiscussion} disabled={councilRunPending} data-council-start-new-discussion="true">דיון חדש</button>
          <button type="button" onClick={toggleArchive} disabled={councilRunPending} data-council-archive-toggle="true" aria-expanded={archiveOpen}>
            {archiveOpen ? 'סגור ארכיון' : `ארכיון${archiveEntries.length ? ` (${archiveEntries.length})` : ''}`}
          </button>
          <span className="council-chamber__db-status">{drawingBoardStatus}</span>
        </div>
      </header>

      {archiveOpen && (
        <section className="council-chamber__archive" data-council-archive-panel="true" dir="rtl" aria-label="ארכיון דיוני מועצה">
          <div className="council-chamber__archive-head">
            <span>ארכיון מקומי</span>
            <b>בחר דיון קודם וחזור לצ׳אט נקי.</b>
            <button type="button" onClick={() => setArchiveOpen(false)} data-council-archive-close="true">סגור</button>
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

      <div className="council-chamber__grid" data-council-canonical-surface="desktop-group-chat-v1">
        <div className="council-chamber__tool" aria-label="Council planning tool">
          {!session || minimalView === 'council' ? (
            <CouncilGroupChatWorkbench
              sessionActive={Boolean(session)}
              topic={session ? displayedQuestion : topic}
              members={groupChatMembers}
              messages={groupChatMessages}
              pendingMember={pendingGroupMember}
              running={councilRunPending}
              stage={flowStage}
              composerValue={session ? operatorOpinion : topic}
              summaryTitle={primaryCouncilAnswer}
              summaryBody={consensusSummary}
              voteLine={voteReadout}
              handoffSent={handoffState === 'sent'}
              onComposerChange={session ? updateOperatorOpinion : setTopic}
              onSendToCouncil={() => { if (session) void askWholeCouncilFollowUp(); else void conveneCouncil() }}
              onOpenAdvisor={selectAdvisor}
              onBeginTeamSelection={beginPlanningTeamSelection}
              onTogglePlanningMember={togglePlanningGeneral}
              onRequestPlan={() => void requestPlanningTeamBreakdown()}
              onContinueDiscussion={continueCouncilDiscussion}
              onSendToHermes={transferDecision}
            />
          ) : (
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
              <button
                type="button"
                className="council-chamber__advisor-back"
                data-council-back-to-decision="true"
                onClick={() => setMinimalView('council')}
                disabled={councilRunPending}
              >
                חזור להחלטה
              </button>
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
              <button type="button" onClick={() => updateOperatorOpinion(activeAdvisorPrompt)} disabled={councilRunPending}>{activeAdvisorPrompt}</button>
              {planningPromptChips.slice(0, 3).map((chip) => (
                <button key={chip.label} type="button" onClick={() => updateOperatorOpinion(chip.prompt)} disabled={councilRunPending}>{chip.label}</button>
              ))}
            </div>
            <div className="council-chamber__actions council-chamber__actions--consult">
              <button type="button" onClick={discussOperatorOpinion} disabled={!operatorOpinion.trim() || councilRunPending}>
                {councilRunPending ? 'מחכה…' : 'שלח ליועץ'}
              </button>
              <button type="button" onClick={() => selectAdvisor(nextGeneral.id)} disabled={councilRunPending}>
                דלג ליועץ הבא
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
    </section>
  )
}
