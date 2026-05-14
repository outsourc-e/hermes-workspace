import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'

export const SWARM_KANBAN_LANES = ['backlog', 'todo', 'ready', 'running', 'review', 'blocked', 'done'] as const
export type SwarmKanbanLane = (typeof SWARM_KANBAN_LANES)[number]

export type SwarmKanbanCard = {
  id: string
  title: string
  spec: string
  acceptanceCriteria: string[]
  assignedWorker: string | null
  reviewer: string | null
  status: SwarmKanbanLane | string
  missionId: string | null
  reportPath: string | null
  createdBy: string
  createdAt: number
  updatedAt: number
  parents?: string[]
  children?: string[]
  latestRun?: { summary?: string | null; outcome?: string | null; status?: string | null } | null
  source?: string
}

type SwarmKanbanFile = { cards: SwarmKanbanCard[] }

type ListFilters = {
  status?: string | null
  assignedWorker?: string | null
  reviewer?: string | null
  missionId?: string | null
}

export type CreateSwarmKanbanCardInput = {
  title: string
  spec?: string
  acceptanceCriteria?: string[]
  assignedWorker?: string | null
  reviewer?: string | null
  status?: SwarmKanbanLane | null
  missionId?: string | null
  reportPath?: string | null
  createdBy?: string | null
  parents?: string[]
  idempotencyKey?: string | null
}

export type UpdateSwarmKanbanCardInput = Partial<Omit<CreateSwarmKanbanCardInput, 'createdBy'>>

const HERMES_HOME = process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.hermes')
export const SWARM_KANBAN_FILE = path.join(HERMES_HOME, 'swarm2-kanban.json')

function ensureKanbanFile(): void {
  fs.mkdirSync(HERMES_HOME, { recursive: true })
  if (!fs.existsSync(SWARM_KANBAN_FILE)) {
    fs.writeFileSync(SWARM_KANBAN_FILE, JSON.stringify({ cards: [] }, null, 2) + '\n', 'utf-8')
  }
}

function readKanbanFile(): SwarmKanbanFile {
  ensureKanbanFile()
  try {
    const raw = fs.readFileSync(SWARM_KANBAN_FILE, 'utf-8').trim()
    if (!raw) return { cards: [] }
    const parsed = JSON.parse(raw) as Partial<SwarmKanbanFile>
    return { cards: Array.isArray(parsed.cards) ? parsed.cards.map(normalizeCard) : [] }
  } catch {
    return { cards: [] }
  }
}

function writeKanbanFile(data: SwarmKanbanFile): void {
  ensureKanbanFile()
  fs.writeFileSync(SWARM_KANBAN_FILE, JSON.stringify({ cards: data.cards.map(normalizeCard) }, null, 2) + '\n', 'utf-8')
}

function normalizeStatus(value: unknown): SwarmKanbanLane {
  if (value === 'in_progress' || value === 'doing') return 'running'
  return SWARM_KANBAN_LANES.includes(value as SwarmKanbanLane) ? (value as SwarmKanbanLane) : 'backlog'
}

function normalizeCriteria(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
  if (typeof value === 'string') return value.split('\n').map((item) => item.trim()).filter(Boolean)
  return []
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeCard(card: (Partial<Omit<SwarmKanbanCard, 'status'>> & { id?: string; title?: string; status?: SwarmKanbanLane | string | null })): SwarmKanbanCard {
  const now = Date.now()
  return {
    id: typeof card.id === 'string' && card.id ? card.id : randomUUID(),
    title: typeof card.title === 'string' && card.title.trim() ? card.title.trim() : 'Untitled task',
    spec: typeof card.spec === 'string' ? card.spec : '',
    acceptanceCriteria: normalizeCriteria(card.acceptanceCriteria),
    assignedWorker: optionalString(card.assignedWorker),
    reviewer: optionalString(card.reviewer),
    status: normalizeStatus(card.status),
    missionId: optionalString(card.missionId),
    reportPath: optionalString(card.reportPath),
    createdBy: typeof card.createdBy === 'string' && card.createdBy ? card.createdBy : 'swarm2-kanban',
    createdAt: typeof card.createdAt === 'number' ? card.createdAt : now,
    updatedAt: typeof card.updatedAt === 'number' ? card.updatedAt : now,
  }
}

export function listSwarmKanbanCards(filters: ListFilters = {}): SwarmKanbanCard[] {
  let cards = readKanbanFile().cards
  if (filters.status) cards = cards.filter((card) => card.status === normalizeStatus(filters.status))
  if (filters.assignedWorker) cards = cards.filter((card) => card.assignedWorker === filters.assignedWorker)
  if (filters.reviewer) cards = cards.filter((card) => card.reviewer === filters.reviewer)
  if (filters.missionId) cards = cards.filter((card) => card.missionId === filters.missionId)
  return [...cards].sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title))
}

export function createSwarmKanbanCard(input: CreateSwarmKanbanCardInput): SwarmKanbanCard {
  const file = readKanbanFile()
  const now = Date.now()
  const card = normalizeCard({
    id: randomUUID(),
    title: input.title,
    spec: input.spec,
    acceptanceCriteria: input.acceptanceCriteria,
    assignedWorker: input.assignedWorker,
    reviewer: input.reviewer,
    status: input.status ?? 'backlog',
    missionId: input.missionId,
    reportPath: input.reportPath,
    createdBy: input.createdBy ?? 'swarm2-kanban',
    createdAt: now,
    updatedAt: now,
  })
  file.cards.push(card)
  writeKanbanFile(file)
  return card
}

export function updateSwarmKanbanCard(cardId: string, updates: UpdateSwarmKanbanCardInput): SwarmKanbanCard | null {
  const file = readKanbanFile()
  const index = file.cards.findIndex((card) => card.id === cardId)
  if (index === -1) return null
  const current = normalizeCard(file.cards[index])
  const next = normalizeCard({
    ...current,
    ...updates,
    id: current.id,
    createdAt: current.createdAt,
    createdBy: current.createdBy,
    title: typeof updates.title === 'string' ? updates.title : current.title,
    updatedAt: Date.now(),
  })
  file.cards[index] = next
  writeKanbanFile(file)
  return next
}
