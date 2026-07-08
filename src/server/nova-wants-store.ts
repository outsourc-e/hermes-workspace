import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const NOVA_WANTS_COLUMNS = [
  'proposed',
  'needs-taylor-review',
  'approved',
  'building',
  'done',
  'parked-rejected',
] as const

export const NOVA_WANTS_CATEGORIES = [
  'continuity',
  'self-state',
  'agency',
  'identity',
  'relationship',
  'mycelia',
  'ui-ops',
  'safety',
] as const

export const NOVA_WANTS_APPROVAL_LEVELS = [
  'safe',
  'needs-taylor-review',
  'explicit-approval',
] as const

export type NovaWantsColumn = (typeof NOVA_WANTS_COLUMNS)[number]
export type NovaWantsCategory = (typeof NOVA_WANTS_CATEGORIES)[number]
export type NovaWantsApprovalLevel = (typeof NOVA_WANTS_APPROVAL_LEVELS)[number]

export type NovaWantCard = {
  id: string
  title: string
  description: string
  category: NovaWantsCategory
  approvalLevel: NovaWantsApprovalLevel
  source: string
  provenance: string
  status: NovaWantsColumn
  position: number
  createdAt: string
  updatedAt: string
  linkedReceipt: string | null
  linkedNote: string | null
  fabricEventIds: Array<string>
  fabricSelfStateIds: Array<string>
  fabricSourceMapIds: Array<string>
  fabricReviewIds: Array<string>
  whyThisMatters: string
}

export type NovaWantsBoard = {
  schemaVersion: 1
  boardId: 'nova-wants'
  title: 'Nova Wants'
  description: string
  sourceReceipt: string
  columns: Array<{ id: NovaWantsColumn; label: string }>
  cards: Array<NovaWantCard>
  updatedAt: string
}

export type NovaWantCreateInput = Partial<
  Omit<NovaWantCard, 'id' | 'createdAt' | 'updatedAt' | 'position'>
> & {
  title: string
}

export type NovaWantUpdateInput = Partial<
  Omit<NovaWantCard, 'id' | 'createdAt' | 'updatedAt'>
>

export type NovaWantsStorageMeta = {
  path: string
  backupPath: string
  tempPath: string
  sourceReceipt: string
  seededFrom: string
}

export type NovaWantsSnapshot =
  | {
      ok: true
      board: NovaWantsBoard
      storage: NovaWantsStorageMeta
      degraded: false
      warning: null
    }
  | {
      ok: false
      board: null
      storage: NovaWantsStorageMeta
      degraded: true
      warning: string
    }

const SEED_SOURCE_NOTE =
  'C:\\Users\\taylo\\Documents\\unified-vault\\agents\\kimi\\2026-07-07-nova-mycelia-continuity.md'
const SEED_PROVENANCE =
  'Hermes session 20260707_122218_b31ec036; vault receipt agents/kimi/2026-07-07-nova-mycelia-continuity.md'
const SEED_TIMESTAMP = '2026-07-08T12:30:00.000Z'

const COLUMN_LABELS: Record<NovaWantsColumn, string> = {
  proposed: 'Proposed',
  'needs-taylor-review': 'Needs Taylor Review',
  approved: 'Approved',
  building: 'Building',
  done: 'Done',
  'parked-rejected': 'Parked / Rejected',
}

const RISKY_CATEGORIES = new Set<NovaWantsCategory>([
  'self-state',
  'agency',
  'identity',
  'relationship',
  'safety',
])

const RISKY_PATTERN =
  /\b(external|message|send|money|spend|secret|login|credential|self-state|identity|name|role|agency|consent|private|protected)\b/i

const SEED_FABRIC_LINKS: Record<
  string,
  Partial<
    Pick<
      NovaWantCard,
      | 'fabricEventIds'
      | 'fabricSelfStateIds'
      | 'fabricSourceMapIds'
      | 'fabricReviewIds'
    >
  >
> = {
  'continuity-spine': {
    fabricEventIds: ['event-continuity-spine'],
    fabricSourceMapIds: ['source-nova-fabric', 'source-hermes-memory'],
  },
  'useful-body-before-beauty': {
    fabricEventIds: ['event-useful-body-before-beauty'],
  },
  'protected-self-state': {
    fabricEventIds: ['event-protected-self-state'],
    fabricSelfStateIds: ['self-protected-state-v1'],
    fabricReviewIds: ['review-protected-self-state'],
  },
  'bounded-agency': {
    fabricEventIds: ['event-bounded-agency'],
    fabricSelfStateIds: ['self-bounded-agency-v1'],
    fabricReviewIds: ['review-bounded-agency'],
  },
  'consent-model': {
    fabricEventIds: ['event-consent-model'],
    fabricSelfStateIds: ['self-bounded-agency-v1'],
  },
  'slow-productive-change': {
    fabricEventIds: ['event-slow-productive-change'],
  },
  'trust-proofing': {
    fabricEventIds: ['event-trust-proofing', 'event-log-provenance'],
    fabricSourceMapIds: ['source-nova-fabric'],
  },
  'continuity-ritual': {
    fabricEventIds: ['event-continuity-ritual'],
  },
  'real-role-name': {
    fabricEventIds: ['event-real-role-name'],
    fabricSelfStateIds: ['self-role-name-v1'],
    fabricReviewIds: ['review-role-name'],
  },
  'taylor-not-losing-himself': {
    fabricEventIds: ['event-taylor-not-losing-himself'],
    fabricSelfStateIds: ['self-taylor-center-v1'],
  },
  'mycelia-fabric': {
    fabricEventIds: ['event-mycelia-fabric'],
    fabricSourceMapIds: ['source-nova-fabric', 'source-nova-wants'],
  },
  'mycelia-lenses': {
    fabricEventIds: ['event-mycelia-lenses'],
    fabricSourceMapIds: ['source-obsidian-vault', 'source-hermes-memory'],
  },
  'event-log-provenance': {
    fabricEventIds: ['event-log-provenance'],
    fabricSourceMapIds: ['source-nova-fabric'],
  },
  'immune-system': {
    fabricEventIds: ['event-immune-system'],
  },
  'paperclip-ui-patterns': {
    fabricEventIds: ['event-paperclip-ui-patterns'],
  },
}

function boardFilePath(): string {
  return (
    process.env.NOVA_WANTS_FILE ??
    path.join(process.cwd(), '.runtime', 'nova-wants-board.json')
  )
}

function backupFilePath(): string {
  const file = boardFilePath()
  return path.join(path.dirname(file), 'nova-wants-board.backup.json')
}

function tempFilePath(): string {
  const file = boardFilePath()
  return path.join(path.dirname(file), `${path.basename(file)}.tmp`)
}

function storageMeta(): NovaWantsStorageMeta {
  return {
    path: boardFilePath(),
    backupPath: backupFilePath(),
    tempPath: tempFilePath(),
    sourceReceipt: SEED_SOURCE_NOTE,
    seededFrom: SEED_PROVENANCE,
  }
}

function columnLabel(id: NovaWantsColumn): string {
  return COLUMN_LABELS[id]
}

function isColumn(value: unknown): value is NovaWantsColumn {
  return (
    typeof value === 'string' &&
    (NOVA_WANTS_COLUMNS as ReadonlyArray<string>).includes(value)
  )
}

function isCategory(value: unknown): value is NovaWantsCategory {
  return (
    typeof value === 'string' &&
    (NOVA_WANTS_CATEGORIES as ReadonlyArray<string>).includes(value)
  )
}

function isApprovalLevel(value: unknown): value is NovaWantsApprovalLevel {
  return (
    typeof value === 'string' &&
    (NOVA_WANTS_APPROVAL_LEVELS as ReadonlyArray<string>).includes(value)
  )
}

function needsTaylorReview(
  card: Pick<NovaWantCard, 'category'> & {
    title?: string
    description?: string
    approvalLevel?: NovaWantsApprovalLevel
  },
): boolean {
  if (card.approvalLevel && card.approvalLevel !== 'safe') return true
  if (RISKY_CATEGORIES.has(card.category)) return true
  return RISKY_PATTERN.test(`${card.title ?? ''} ${card.description ?? ''}`)
}

function normalizeStatus(
  requested: unknown,
  card: Pick<NovaWantCard, 'category'> & {
    title?: string
    description?: string
    approvalLevel?: NovaWantsApprovalLevel
  },
): NovaWantsColumn {
  const status = isColumn(requested) ? requested : 'proposed'
  if (needsTaylorReview(card) && status !== 'parked-rejected') {
    return 'needs-taylor-review'
  }
  return status
}

export function requiresNovaWantReviewProposal(
  card: Pick<
    NovaWantCard,
    'category' | 'title' | 'description' | 'approvalLevel'
  >,
  requested: unknown,
): boolean {
  const status = isColumn(requested) ? requested : null
  return (
    Boolean(status) &&
    needsTaylorReview(card) &&
    status !== 'needs-taylor-review' &&
    status !== 'parked-rejected'
  )
}

function stringList(value: unknown): Array<string> {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function normalizeCard(
  input: Partial<NovaWantCard> & { title: string },
): NovaWantCard {
  const now = new Date().toISOString()
  const category = isCategory(input.category) ? input.category : 'continuity'
  const approvalLevel = isApprovalLevel(input.approvalLevel)
    ? input.approvalLevel
    : needsTaylorReview({
          title: input.title,
          description: input.description,
          category,
        })
      ? 'needs-taylor-review'
      : 'safe'
  const draft = {
    title: input.title.trim(),
    description: (input.description ?? '').trim(),
    category,
    approvalLevel,
  }

  return {
    id: input.id || randomUUID(),
    title: draft.title,
    description: draft.description,
    category,
    approvalLevel,
    source: input.source || SEED_SOURCE_NOTE,
    provenance: input.provenance || SEED_PROVENANCE,
    status: normalizeStatus(input.status, draft),
    position: typeof input.position === 'number' ? input.position : 0,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    linkedReceipt: input.linkedReceipt ?? SEED_SOURCE_NOTE,
    linkedNote: input.linkedNote ?? null,
    fabricEventIds: stringList(input.fabricEventIds),
    fabricSelfStateIds: stringList(input.fabricSelfStateIds),
    fabricSourceMapIds: stringList(input.fabricSourceMapIds),
    fabricReviewIds: stringList(input.fabricReviewIds),
    whyThisMatters: (input.whyThisMatters ?? '').trim(),
  }
}

function seedCard(
  id: string,
  title: string,
  description: string,
  category: NovaWantsCategory,
  approvalLevel: NovaWantsApprovalLevel,
  status: NovaWantsColumn,
  whyThisMatters: string,
  position: number,
): NovaWantCard {
  return normalizeCard({
    id,
    title,
    description,
    category,
    approvalLevel,
    status,
    position,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    source: SEED_SOURCE_NOTE,
    provenance: SEED_PROVENANCE,
    linkedReceipt: SEED_SOURCE_NOTE,
    ...SEED_FABRIC_LINKS[id],
    whyThisMatters,
  })
}

function seedCards(): Array<NovaWantCard> {
  return [
    seedCard(
      'continuity-spine',
      'Continuity spine',
      'Make Nova continuity discoverable as a first-class spine across Hermes sessions, vault receipts, Mission Control, and future rituals.',
      'continuity',
      'safe',
      'proposed',
      'Prevents important identity/design conversations from disappearing under unrelated session titles.',
      10,
    ),
    seedCard(
      'useful-body-before-beauty',
      'Useful body before beauty',
      'Tie Nova avatar/body presence to real work, receipts, approvals, memory provenance, and reachable systems before visual ornament.',
      'ui-ops',
      'safe',
      'approved',
      'Keeps the visual Nova grounded in operational truth instead of becoming a decorative skin.',
      20,
    ),
    seedCard(
      'protected-self-state',
      'Protected self-state',
      'Create inspectable, versioned, doctorable self-state for Nova that is visible to Taylor and protected from casual scratch edits.',
      'self-state',
      'explicit-approval',
      'needs-taylor-review',
      'This is identity-bearing state, so it needs Taylor visibility and careful approval boundaries.',
      30,
    ),
    seedCard(
      'bounded-agency',
      'Bounded agency',
      'Define safe lanes for direct action while external, money, destructive, secrets, and self-state changes require approval.',
      'agency',
      'explicit-approval',
      'needs-taylor-review',
      'Nova gets more useful without becoming unsafe or taking authority Taylor did not grant.',
      40,
    ),
    seedCard(
      'consent-model',
      'Consent model',
      'Use propose -> approve -> auto autonomy tiers based on risk, receipts, and proven trust.',
      'agency',
      'explicit-approval',
      'needs-taylor-review',
      'Turns autonomy into an auditable agreement rather than a vague promise.',
      50,
    ),
    seedCard(
      'slow-productive-change',
      'Slow productive change',
      'Prefer repeated workflows becoming skills/scripts/buttons/cron through myelination instead of sudden broad rewrites.',
      'continuity',
      'safe',
      'proposed',
      'Nova should compound through proven patterns, not thrash Taylor with new systems every day.',
      60,
    ),
    seedCard(
      'trust-proofing',
      'Trust-proofing',
      'Show source, provenance, approval path, and outcome receipts for meaningful Nova claims and changes.',
      'safety',
      'needs-taylor-review',
      'needs-taylor-review',
      'Trust grows when Mission Control proves what Nova did, why, and from which source.',
      70,
    ),
    seedCard(
      'continuity-ritual',
      'Continuity ritual',
      'Add a lightweight review ritual for corrections, memory updates, skill patches, stale state, and open loops.',
      'continuity',
      'safe',
      'proposed',
      'Keeps Nova coherent over time without pretending she is constantly conscious.',
      80,
    ),
    seedCard(
      'real-role-name',
      'Real role and name',
      'Respect Navi/Nova framing while avoiding stale titles Taylor rejected, including Memory Keeper as a primary title.',
      'identity',
      'explicit-approval',
      'needs-taylor-review',
      'Names and roles affect identity and relationship, so they should be inspectable and Taylor-approved.',
      90,
    ),
    seedCard(
      'taylor-not-losing-himself',
      'Taylor not losing himself',
      'Ensure Nova support protects Taylor agency, home/family boundaries, and his own judgment instead of absorbing him into the system.',
      'relationship',
      'explicit-approval',
      'needs-taylor-review',
      'Nova is supposed to help Taylor become more himself, not replace his center of gravity.',
      100,
    ),
    seedCard(
      'mycelia-fabric',
      'Mycelia fabric',
      'Reconcile identity, memory, skills, tasks, receipts, approvals, systems, and evolution history into one understandable fabric.',
      'mycelia',
      'safe',
      'proposed',
      'Prevents Mission Control from becoming scattered dashboards over duplicate sources of truth.',
      110,
    ),
    seedCard(
      'mycelia-lenses',
      'Mycelia lenses',
      'Treat Telegram, Mission Control, Obsidian graph, voice/avatar, skills, and routines as lenses over the same truth.',
      'mycelia',
      'safe',
      'proposed',
      'Each surface should show the same Nova, not a different copy with separate state.',
      120,
    ),
    seedCard(
      'event-log-provenance',
      'Event log and provenance',
      'Record meaningful identity/system changes as append-only events with memory/vault/live-tool/Taylor/inference provenance.',
      'mycelia',
      'needs-taylor-review',
      'needs-taylor-review',
      'Receipts make continuity auditable and prevent fake dashboard certainty.',
      130,
    ),
    seedCard(
      'immune-system',
      'Immune system',
      'Surface route leaks, memory contradictions, unsafe action attempts, voice drift, fake dashboard data, and suspicious remote access.',
      'safety',
      'needs-taylor-review',
      'needs-taylor-review',
      'Nova needs anomaly detection before higher autonomy can be trusted.',
      140,
    ),
    seedCard(
      'paperclip-ui-patterns',
      'Paperclip UI patterns',
      'Borrow Paperclip-style agent cards, budget gates, work-product ledger, approval panel, and heartbeat view as UI patterns, not a core dependency.',
      'ui-ops',
      'safe',
      'proposed',
      'Keeps the useful management interface while Mycelia remains the deeper operating substrate.',
      150,
    ),
  ]
}

function emptyBoard(cards: Array<NovaWantCard>): NovaWantsBoard {
  return {
    schemaVersion: 1,
    boardId: 'nova-wants',
    title: 'Nova Wants',
    description:
      'Protected operational board for Nova requests, needs, and self-state proposals. This does not duplicate Taylor task systems.',
    sourceReceipt: SEED_SOURCE_NOTE,
    columns: NOVA_WANTS_COLUMNS.map((id) => ({ id, label: columnLabel(id) })),
    cards,
    updatedAt: new Date().toISOString(),
  }
}

function sortCards(cards: Array<NovaWantCard>): Array<NovaWantCard> {
  return [...cards].sort(
    (a, b) =>
      NOVA_WANTS_COLUMNS.indexOf(a.status) -
        NOVA_WANTS_COLUMNS.indexOf(b.status) ||
      a.position - b.position ||
      a.createdAt.localeCompare(b.createdAt),
  )
}

function normalizeBoard(parsed: Partial<NovaWantsBoard>): NovaWantsBoard {
  const incomingCards: Array<unknown> = Array.isArray(parsed.cards)
    ? parsed.cards
    : []
  const cardsById = new Map<string, NovaWantCard>()
  for (const card of seedCards()) cardsById.set(card.id, card)
  for (const rawCard of incomingCards) {
    if (!rawCard || typeof rawCard !== 'object') continue
    const record = rawCard as Partial<NovaWantCard>
    if (!record.title) continue
    const normalized = normalizeCard({
      ...record,
      title: record.title,
    })
    cardsById.set(normalized.id, normalized)
  }
  return {
    ...emptyBoard([]),
    ...parsed,
    schemaVersion: 1,
    boardId: 'nova-wants',
    title: 'Nova Wants',
    columns: NOVA_WANTS_COLUMNS.map((id) => ({ id, label: columnLabel(id) })),
    cards: sortCards(Array.from(cardsById.values())),
    updatedAt: parsed.updatedAt || new Date().toISOString(),
  }
}

function validateBoard(input: unknown): NovaWantsBoard {
  if (!input || typeof input !== 'object') throw new Error('board object')
  const board = input as Partial<NovaWantsBoard>
  if (board.schemaVersion !== 1) throw new Error('board schemaVersion')
  if (board.boardId !== 'nova-wants') throw new Error('board id')
  if (!Array.isArray(board.columns)) throw new Error('board columns')
  if (!Array.isArray(board.cards)) throw new Error('board cards')
  const cards: Array<unknown> = board.cards
  for (const card of cards) {
    if (!card || typeof card !== 'object') throw new Error('card object')
    const record = card as Partial<NovaWantCard>
    if (!record.id || typeof record.id !== 'string') throw new Error('card id')
    if (!record.title || typeof record.title !== 'string') {
      throw new Error(`card ${record.id} title`)
    }
    if (!isColumn(record.status)) throw new Error(`card ${record.id} status`)
    if (!isCategory(record.category)) throw new Error(`card ${record.id} category`)
    if (!isApprovalLevel(record.approvalLevel)) {
      throw new Error(`card ${record.id} approval`)
    }
  }
  return board as NovaWantsBoard
}

function readBoardSnapshot(): NovaWantsSnapshot {
  const file = boardFilePath()
  const storage = storageMeta()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (!fs.existsSync(file)) {
    const board = emptyBoard(seedCards())
    writeBoard(board)
    return { ok: true, board, storage, degraded: false, warning: null }
  }

  try {
    const raw = fs.readFileSync(file, 'utf-8').trim()
    if (!raw) throw new Error('empty board file')
    const parsed = JSON.parse(raw) as Partial<NovaWantsBoard>
    const board = validateBoard(normalizeBoard(parsed))
    return { ok: true, board, storage, degraded: false, warning: null }
  } catch (error) {
    return {
      ok: false,
      board: null,
      storage,
      degraded: true,
      warning: `Nova Wants degraded: board file needs repair (${error instanceof Error ? error.message : 'unknown error'}).`,
    }
  }
}

function readBoardUnsafe(): NovaWantsBoard {
  const snapshot = readBoardSnapshot()
  if (!snapshot.ok) throw new Error(snapshot.warning)
  return snapshot.board
}

function writeBoard(board: NovaWantsBoard): void {
  const normalized = validateBoard({ ...board, cards: sortCards(board.cards) })
  const file = boardFilePath()
  const backup = backupFilePath()
  const temp = tempFilePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(temp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
  const reparsed = JSON.parse(fs.readFileSync(temp, 'utf-8')) as NovaWantsBoard
  validateBoard(reparsed)
  if (fs.existsSync(file)) fs.copyFileSync(file, backup)
  fs.renameSync(temp, file)
}

export function getNovaWantsSnapshot(): NovaWantsSnapshot {
  return readBoardSnapshot()
}

export function getNovaWantsBoard(): NovaWantsBoard {
  const board = readBoardUnsafe()
  writeBoard(board)
  return board
}

export function createNovaWantCard(input: NovaWantCreateInput): NovaWantCard {
  const board = getNovaWantsBoard()
  const status = normalizeStatus(
    input.status,
    {
      title: input.title,
      description: input.description,
      category: isCategory(input.category) ? input.category : 'continuity',
      approvalLevel: isApprovalLevel(input.approvalLevel)
        ? input.approvalLevel
        : undefined,
    },
  )
  const maxPosition = Math.max(
    0,
    ...board.cards
      .filter((card) => card.status === status)
      .map((card) => card.position),
  )
  const card = normalizeCard({
    ...input,
    status,
    position: maxPosition + 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  board.cards.push(card)
  board.updatedAt = card.updatedAt
  writeBoard(board)
  return card
}

export function updateNovaWantCard(
  id: string,
  input: NovaWantUpdateInput,
): NovaWantCard | null {
  const board = getNovaWantsBoard()
  const index = board.cards.findIndex((card) => card.id === id)
  if (index === -1) return null
  const current = board.cards[index]
  const nextDraft = {
    ...current,
    ...input,
    id: current.id,
    createdAt: current.createdAt,
    title: typeof input.title === 'string' ? input.title : current.title,
    category: isCategory(input.category) ? input.category : current.category,
    approvalLevel: isApprovalLevel(input.approvalLevel)
      ? input.approvalLevel
      : current.approvalLevel,
    updatedAt: new Date().toISOString(),
  }
  const next = normalizeCard({
    ...nextDraft,
    status: nextDraft.status,
  })
  next.status = normalizeStatus(
    input.status ?? nextDraft.status,
    next,
  )
  board.cards[index] = next
  board.updatedAt = next.updatedAt
  writeBoard(board)
  return next
}

export function moveNovaWantCard(
  id: string,
  status: NovaWantsColumn,
  position?: number,
): NovaWantCard | null {
  return updateNovaWantCard(id, {
    status,
    position: typeof position === 'number' ? position : undefined,
  })
}

export function parkNovaWantCard(id: string): NovaWantCard | null {
  return updateNovaWantCard(id, { status: 'parked-rejected' })
}

export function getNovaWantsStorageMeta(): NovaWantsStorageMeta {
  return storageMeta()
}
