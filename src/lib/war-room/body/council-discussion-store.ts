import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  ControlledCouncilFollowUpResult,
  ControlledCouncilRoundResult,
  ControlledCouncilTurn,
} from './controlled-council-runner'
import type { ControlledCouncilAgentId } from './controlled-athena-runner'

export const COUNCIL_DRAWING_BOARD_SCHEMA_VERSION = 'council-drawing-board-v1'
export const COUNCIL_DRAWING_BOARD_STORE_DIR = path.join(process.cwd(), 'data', 'war-room-council')
export const COUNCIL_DRAWING_BOARD_STATE_FILE = 'drawing-board.json'
export const COUNCIL_DRAWING_BOARD_MAX_DISCUSSIONS = 40

export type CouncilDrawingBoardStatus = 'thinking' | 'ready' | 'blocked'

export type CouncilDrawingBoardRound = {
  roundId: string
  kind: 'opening' | 'reconsideration' | 'follow-up' | 'private-follow-up'
  question: string
  targetAgentId?: ControlledCouncilAgentId | 'council'
  status: CouncilDrawingBoardStatus
  startedAtMs: number
  completedAtMs?: number
  turns: Array<ControlledCouncilTurn>
}

export type CouncilDrawingBoardDiscussion = {
  discussionId: string
  topic: string
  status: CouncilDrawingBoardStatus
  createdAtMs: number
  updatedAtMs: number
  result?: ControlledCouncilRoundResult
  rounds: Array<CouncilDrawingBoardRound>
  sourcesUsed: Array<string>
}

export type CouncilGeneralDrawingBoardStats = {
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

export type CouncilDrawingBoardStore = {
  schemaVersion: typeof COUNCIL_DRAWING_BOARD_SCHEMA_VERSION
  stateVersion: string
  updatedAtMs: number
  activeDiscussionId?: string
  activeDiscussionClearedAtMs?: number
  discussions: Array<CouncilDrawingBoardDiscussion>
  generalStats: Record<string, CouncilGeneralDrawingBoardStats>
}

export type CouncilDrawingBoardStoreOptions = {
  rootDir?: string
  nowMs?: number
}

const GENERAL_META: Record<string, Omit<CouncilGeneralDrawingBoardStats, 'participated' | 'votes' | 'wins' | 'lastSeenAtMs'>> = {
  julius: {
    generalId: 'julius',
    label: 'Julius',
    strengths: ['chair synthesis', 'structure', 'ownership', 'clear decisions'],
    traits: ['council chair', 'organized', 'decisive', 'governance-first'],
    memoryNotes: ['ראש המועצה: מסכם אחרי הדעות העצמאיות ושומר גם התנגדויות.'],
  },
  alexander: {
    generalId: 'alexander',
    label: 'Alexander',
    strengths: ['vision', 'momentum', 'morale'],
    traits: ['bold', 'expansion-minded', 'show-the-win'],
    memoryNotes: ['בודק אם התוכנית נותנת תנופה וניצחון נראה לעין.'],
  },
  napoleon: {
    generalId: 'napoleon',
    label: 'Napoleon',
    strengths: ['execution order', 'logistics', 'QA gates'],
    traits: ['fast', 'practical', 'milestone-driven'],
    memoryNotes: ['מפרק לרצף ביצוע, בדיקות ו-fallback.'],
  },
  saladin: {
    generalId: 'saladin',
    label: 'Saladin',
    strengths: ['trust', 'truthfulness', 'restraint'],
    traits: ['careful', 'fair', 'reputation-aware'],
    memoryNotes: ['שומר על אמת, אמון, אישורים וגבולות בטוחים.'],
  },
  genghis: {
    generalId: 'genghis',
    label: 'Genghis',
    strengths: ['scale', 'routing', 'repeatable systems'],
    traits: ['simple rules', 'delegation-first', 'operational scale'],
    memoryNotes: ['דוחס את ההחלטה לחוק עבודה פשוט שאפשר לשכפל.'],
  },
  hannibal: {
    generalId: 'hannibal',
    label: 'Hannibal',
    strengths: ['hidden risk', 'flanking paths', 'unexpected failure modes'],
    traits: ['creative', 'skeptical', 'risk-hunting'],
    memoryNotes: ['מחפש סיכון נסתר, איגוף ודרך שבה התוכנית תישבר.'],
  },
}

function storeDir(options?: CouncilDrawingBoardStoreOptions) {
  return options?.rootDir ?? process.env.COUNCIL_DRAWING_BOARD_STORE_DIR ?? COUNCIL_DRAWING_BOARD_STORE_DIR
}

function storePath(options?: CouncilDrawingBoardStoreOptions) {
  return path.join(storeDir(options), COUNCIL_DRAWING_BOARD_STATE_FILE)
}

function stateVersion(nowMs: number) {
  return `${COUNCIL_DRAWING_BOARD_SCHEMA_VERSION}:${nowMs}`
}

function emptyStats(): Record<string, CouncilGeneralDrawingBoardStats> {
  return Object.fromEntries(Object.values(GENERAL_META).map((meta) => [
    meta.generalId,
    {
      ...meta,
      participated: 0,
      votes: 0,
      wins: 0,
    },
  ]))
}

export function createEmptyCouncilDrawingBoardStore(nowMs = Date.now()): CouncilDrawingBoardStore {
  return {
    schemaVersion: COUNCIL_DRAWING_BOARD_SCHEMA_VERSION,
    stateVersion: stateVersion(nowMs),
    updatedAtMs: nowMs,
    discussions: [],
    generalStats: emptyStats(),
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function turnsForDiscussion(discussion: CouncilDrawingBoardDiscussion) {
  return [
    ...(discussion.result?.openingTurns ?? []),
    ...(discussion.result?.voteTurns ?? []),
    ...discussion.rounds.flatMap((round) => round.turns),
  ]
}

function winnerLabelsForDiscussion(discussion: CouncilDrawingBoardDiscussion) {
  const supportedBy = discussion.result?.recommendation.supportedBy ?? []
  return new Set(supportedBy.map((label) => label.toLowerCase()))
}

function compactMemoryNote(value: string, fallback: string) {
  const text = value.trim().replace(/\s+/g, ' ')
  const safe = text || fallback
  return safe.length > 130 ? `${safe.slice(0, 129)}…` : safe
}

function memoryNoteForTurn(turn: ControlledCouncilTurn) {
  if (turn.status !== 'completed_local_only') return undefined
  const prefix = turn.generalId === 'julius' && turn.phase === 'synthesis'
    ? 'סיכום יו״ר אחרון'
    : turn.phase === 'council-turn'
      ? 'תגובה אחרונה בדיון'
      : 'דעה עצמאית אחרונה'
  const text = turn.chatSummary || turn.suggestedDecisionPatch || turn.voteReason || turn.opinion
  return compactMemoryNote(`${prefix}: ${text}`, `${prefix}: לא נרשמה תובנה קצרה.`)
}

function addMemoryNote(item: CouncilGeneralDrawingBoardStats, note?: string) {
  if (!note) return
  const existingNotes = Array.isArray(item.memoryNotes) ? item.memoryNotes : []
  item.memoryNotes = [note, ...existingNotes.filter((existing) => existing !== note)].slice(0, 5)
}

function rebuildGeneralStats(discussions: Array<CouncilDrawingBoardDiscussion>): Record<string, CouncilGeneralDrawingBoardStats> {
  const stats = emptyStats()
  for (const discussion of discussions) {
    const seenInDiscussion = new Set<string>()
    const winnerLabels = winnerLabelsForDiscussion(discussion)
    for (const turn of turnsForDiscussion(discussion)) {
      const item = stats[turn.generalId] ?? {
        ...(GENERAL_META[turn.generalId] ?? {
          generalId: turn.generalId,
          label: turn.label,
          strengths: [],
          traits: [],
          memoryNotes: [],
        }),
        participated: 0,
        votes: 0,
        wins: 0,
      }
      if (!seenInDiscussion.has(turn.generalId)) {
        item.participated += 1
        seenInDiscussion.add(turn.generalId)
      }
      if (turn.status === 'completed_local_only') item.votes += 1
      if (winnerLabels.has(turn.label.toLowerCase()) || winnerLabels.has(item.label.toLowerCase())) item.wins += 1
      addMemoryNote(item, memoryNoteForTurn(turn))
      item.lastSeenAtMs = Math.max(item.lastSeenAtMs ?? 0, discussion.updatedAtMs)
      stats[turn.generalId] = item
    }
  }
  return stats
}

function normalizeDiscussion(raw: unknown): CouncilDrawingBoardDiscussion | null {
  if (!isObject(raw) || typeof raw.discussionId !== 'string' || typeof raw.topic !== 'string') return null
  const nowMs = Date.now()
  const rounds = Array.isArray(raw.rounds)
    ? raw.rounds.filter((round): round is CouncilDrawingBoardRound => isObject(round) && typeof round.roundId === 'string' && Array.isArray(round.turns))
    : []
  const status = raw.status === 'thinking' || raw.status === 'ready' || raw.status === 'blocked' ? raw.status : 'ready'
  return {
    discussionId: raw.discussionId,
    topic: raw.topic,
    status,
    createdAtMs: typeof raw.createdAtMs === 'number' ? raw.createdAtMs : nowMs,
    updatedAtMs: typeof raw.updatedAtMs === 'number' ? raw.updatedAtMs : nowMs,
    result: isObject(raw.result) ? raw.result as ControlledCouncilRoundResult : undefined,
    rounds,
    sourcesUsed: Array.isArray(raw.sourcesUsed) ? raw.sourcesUsed.filter((item): item is string => typeof item === 'string') : [],
  }
}

function normalizeStore(raw: unknown, nowMs = Date.now()): CouncilDrawingBoardStore {
  if (!isObject(raw)) return createEmptyCouncilDrawingBoardStore(nowMs)
  const discussions = (Array.isArray(raw.discussions) ? raw.discussions : [])
    .map(normalizeDiscussion)
    .filter((item): item is CouncilDrawingBoardDiscussion => Boolean(item))
    .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
    .slice(0, COUNCIL_DRAWING_BOARD_MAX_DISCUSSIONS)
  const activeDiscussionClearedAtMs = typeof raw.activeDiscussionClearedAtMs === 'number'
    ? raw.activeDiscussionClearedAtMs
    : undefined
  const activeDiscussionId = typeof raw.activeDiscussionId === 'string'
    ? raw.activeDiscussionId
    : activeDiscussionClearedAtMs
      ? undefined
      : discussions[0]?.discussionId
  return {
    schemaVersion: COUNCIL_DRAWING_BOARD_SCHEMA_VERSION,
    stateVersion: typeof raw.stateVersion === 'string' ? raw.stateVersion : stateVersion(nowMs),
    updatedAtMs: typeof raw.updatedAtMs === 'number' ? raw.updatedAtMs : nowMs,
    activeDiscussionId,
    activeDiscussionClearedAtMs,
    discussions,
    generalStats: rebuildGeneralStats(discussions),
  }
}

async function atomicWriteJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${randomUUID()}.tmp`
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tmpPath, filePath)
}

export async function loadCouncilDrawingBoardStore(options?: CouncilDrawingBoardStoreOptions): Promise<CouncilDrawingBoardStore> {
  const nowMs = options?.nowMs ?? Date.now()
  try {
    const text = await readFile(storePath(options), 'utf8')
    return normalizeStore(JSON.parse(text), nowMs)
  } catch {
    return createEmptyCouncilDrawingBoardStore(nowMs)
  }
}

export async function saveCouncilDrawingBoardStore(
  store: CouncilDrawingBoardStore,
  options?: CouncilDrawingBoardStoreOptions,
): Promise<CouncilDrawingBoardStore> {
  const nowMs = options?.nowMs ?? Date.now()
  const normalized = normalizeStore({
    ...store,
    updatedAtMs: nowMs,
    stateVersion: stateVersion(nowMs),
  }, nowMs)
  await atomicWriteJson(storePath(options), normalized)
  return normalized
}

function upsertDiscussion(store: CouncilDrawingBoardStore, discussion: CouncilDrawingBoardDiscussion) {
  const discussions = [
    discussion,
    ...store.discussions.filter((item) => item.discussionId !== discussion.discussionId),
  ]
    .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
    .slice(0, COUNCIL_DRAWING_BOARD_MAX_DISCUSSIONS)
  return {
    ...store,
    activeDiscussionId: discussion.discussionId,
    activeDiscussionClearedAtMs: undefined,
    discussions,
    generalStats: rebuildGeneralStats(discussions),
  }
}

export async function clearActiveCouncilDiscussion(options?: CouncilDrawingBoardStoreOptions) {
  const nowMs = options?.nowMs ?? Date.now()
  const store = await loadCouncilDrawingBoardStore(options)
  return saveCouncilDrawingBoardStore({
    ...store,
    activeDiscussionId: undefined,
    activeDiscussionClearedAtMs: nowMs,
  }, { ...options, nowMs })
}

export async function markCouncilDiscussionRunning(input: {
  discussionId: string
  topic: string
  nowMs?: number
}, options?: CouncilDrawingBoardStoreOptions) {
  const nowMs = input.nowMs ?? options?.nowMs ?? Date.now()
  const store = await loadCouncilDrawingBoardStore(options)
  const existing = store.discussions.find((item) => item.discussionId === input.discussionId)
  const discussion: CouncilDrawingBoardDiscussion = {
    discussionId: input.discussionId,
    topic: input.topic,
    status: 'thinking',
    createdAtMs: existing?.createdAtMs ?? nowMs,
    updatedAtMs: nowMs,
    result: existing?.result,
    rounds: existing?.rounds ?? [],
    sourcesUsed: existing?.sourcesUsed ?? [],
  }
  return saveCouncilDrawingBoardStore(upsertDiscussion(store, discussion), { ...options, nowMs })
}

export async function recordCouncilRoundResult(input: {
  discussionId: string
  result: ControlledCouncilRoundResult
  nowMs?: number
}, options?: CouncilDrawingBoardStoreOptions) {
  const nowMs = input.nowMs ?? options?.nowMs ?? Date.now()
  const store = await loadCouncilDrawingBoardStore(options)
  const existing = store.discussions.find((item) => item.discussionId === input.discussionId)
  const sourcesUsed = [
    'Obsidian',
    ...input.result.openingTurns.flatMap((turn) => turn.contextUsed),
    ...input.result.voteTurns.flatMap((turn) => turn.contextUsed),
  ].filter((item, index, list) => item && list.indexOf(item) === index).slice(0, 12)
  const discussion: CouncilDrawingBoardDiscussion = {
    discussionId: input.discussionId,
    topic: input.result.topic,
    status: input.result.ok ? 'ready' : 'blocked',
    createdAtMs: existing?.createdAtMs ?? nowMs,
    updatedAtMs: nowMs,
    result: input.result,
    rounds: existing?.rounds ?? [],
    sourcesUsed,
  }
  return saveCouncilDrawingBoardStore(upsertDiscussion(store, discussion), { ...options, nowMs })
}

export async function recordCouncilReconsiderationRoundResult(input: {
  discussionId: string
  roundId: string
  question: string
  result: ControlledCouncilRoundResult
  nowMs?: number
}, options?: CouncilDrawingBoardStoreOptions) {
  const nowMs = input.nowMs ?? options?.nowMs ?? Date.now()
  const store = await loadCouncilDrawingBoardStore(options)
  const existing = store.discussions.find((item) => item.discussionId === input.discussionId)
  if (!existing) return store
  const round: CouncilDrawingBoardRound = {
    roundId: input.roundId,
    kind: 'reconsideration',
    question: input.question,
    targetAgentId: 'council',
    status: input.result.ok ? 'ready' : 'blocked',
    startedAtMs: nowMs,
    completedAtMs: nowMs,
    turns: input.result.voteTurns.length ? input.result.voteTurns : input.result.openingTurns,
  }
  const discussion: CouncilDrawingBoardDiscussion = {
    ...existing,
    status: input.result.ok ? 'ready' : 'blocked',
    updatedAtMs: nowMs,
    rounds: [
      ...existing.rounds.filter((item) => item.roundId !== input.roundId),
      round,
    ],
    sourcesUsed: [
      ...existing.sourcesUsed,
      'Obsidian',
      ...input.result.openingTurns.flatMap((turn) => turn.contextUsed),
      ...input.result.voteTurns.flatMap((turn) => turn.contextUsed),
    ].filter((item, index, list) => item && list.indexOf(item) === index).slice(0, 12),
  }
  return saveCouncilDrawingBoardStore(upsertDiscussion(store, discussion), { ...options, nowMs })
}

export async function recordCouncilFollowUpResult(input: {
  discussionId: string
  roundId: string
  question: string
  targetAgentId: ControlledCouncilAgentId | 'council'
  result: ControlledCouncilFollowUpResult
  nowMs?: number
}, options?: CouncilDrawingBoardStoreOptions) {
  const nowMs = input.nowMs ?? options?.nowMs ?? Date.now()
  const store = await loadCouncilDrawingBoardStore(options)
  const existing = store.discussions.find((item) => item.discussionId === input.discussionId)
  if (!existing) return store
  const round: CouncilDrawingBoardRound = {
    roundId: input.roundId,
    kind: 'private-follow-up',
    question: input.question,
    targetAgentId: input.targetAgentId,
    status: input.result.ok ? 'ready' : 'blocked',
    startedAtMs: nowMs,
    completedAtMs: nowMs,
    turns: [input.result.turn],
  }
  const discussion: CouncilDrawingBoardDiscussion = {
    ...existing,
    status: input.result.ok ? existing.status : 'blocked',
    updatedAtMs: nowMs,
    rounds: [
      ...existing.rounds.filter((item) => item.roundId !== input.roundId),
      round,
    ],
    sourcesUsed: [
      ...existing.sourcesUsed,
      'Obsidian',
      ...(Array.isArray(input.result.turn.contextUsed) ? input.result.turn.contextUsed : []),
    ].filter((item, index, list) => item && list.indexOf(item) === index).slice(0, 12),
  }
  return saveCouncilDrawingBoardStore(upsertDiscussion(store, discussion), { ...options, nowMs })
}
