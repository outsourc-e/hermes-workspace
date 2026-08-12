import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { SWARM_CANONICAL_REPO } from './swarm-environment'

export type ImprovementStatus =
  | 'proposed'
  | 'evaluating'
  | 'canary'
  | 'promoted'
  | 'reverted'
  | 'rejected'

export type ImprovementProposal = {
  id: string
  targetKind: string
  target: string
  hypothesis: string
  proposedChange: string
  risk: string
  status: ImprovementStatus
  createdBy: string
  createdAt: number
}

const DB_PATH = join(SWARM_CANONICAL_REPO, '.runtime', 'self-improvement.db')

function db(): DatabaseSync {
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const instance = new DatabaseSync(DB_PATH)
  instance.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY, target_kind TEXT NOT NULL, target TEXT NOT NULL,
      hypothesis TEXT NOT NULL, proposed_change TEXT NOT NULL, risk TEXT NOT NULL,
      status TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, proposal_id TEXT NOT NULL,
      benchmark TEXT NOT NULL, baseline REAL, candidate REAL, min_delta REAL NOT NULL,
      status TEXT NOT NULL, evidence TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, proposal_id TEXT NOT NULL,
      stage TEXT NOT NULL, critic_approved INTEGER NOT NULL, canary_passed INTEGER NOT NULL,
      decision TEXT NOT NULL, decided_by TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `)
  return instance
}

function proposal(row: Record<string, unknown>): ImprovementProposal {
  return {
    id: String(row.id),
    targetKind: String(row.target_kind),
    target: String(row.target),
    hypothesis: String(row.hypothesis),
    proposedChange: String(row.proposed_change),
    risk: String(row.risk),
    status: String(row.status) as ImprovementStatus,
    createdBy: String(row.created_by),
    createdAt: Number(row.created_at),
  }
}

export function createImprovementProposal(
  input: Omit<ImprovementProposal, 'status' | 'createdAt'>,
): ImprovementProposal {
  const createdAt = Date.now()
  const value = { ...input, status: 'proposed' as const, createdAt }
  const instance = db()
  try {
    instance
      .prepare(
        'INSERT INTO proposals (id,target_kind,target,hypothesis,proposed_change,risk,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        value.id,
        value.targetKind,
        value.target,
        value.hypothesis,
        value.proposedChange,
        value.risk,
        value.status,
        value.createdBy,
        value.createdAt,
      )
    return value
  } finally {
    instance.close()
  }
}

export function listImprovementProposals(): Array<ImprovementProposal> {
  const instance = db()
  try {
    return (
      instance
        .prepare('SELECT * FROM proposals ORDER BY created_at DESC')
        .all() as Array<Record<string, unknown>>
    ).map(proposal)
  } finally {
    instance.close()
  }
}

export function recordImprovementEvaluation(input: {
  proposalId: string
  benchmark: string
  baseline: number | null
  candidate: number | null
  minDelta: number
  status: 'passed' | 'failed'
  evidence?: string
}): void {
  const instance = db()
  try {
    instance
      .prepare(
        'INSERT INTO evaluations (proposal_id,benchmark,baseline,candidate,min_delta,status,evidence,created_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        input.proposalId,
        input.benchmark,
        input.baseline,
        input.candidate,
        input.minDelta,
        input.status,
        input.evidence ?? null,
        Date.now(),
      )
    instance
      .prepare('UPDATE proposals SET status = ? WHERE id = ?')
      .run(input.status === 'passed' ? 'canary' : 'reverted', input.proposalId)
  } finally {
    instance.close()
  }
}

export function decideImprovementPromotion(input: {
  proposalId: string
  criticApproved: boolean
  canaryPassed: boolean
  decidedBy: string
}): { decision: 'promoted' | 'reverted'; reason: string } {
  const decision =
    input.criticApproved && input.canaryPassed ? 'promoted' : 'reverted'
  const reason =
    decision === 'promoted'
      ? 'Independent critic approval and canary passed.'
      : 'Promotion gate failed: critic approval and canary pass are both required.'
  const instance = db()
  try {
    instance
      .prepare(
        'INSERT INTO promotions (proposal_id,stage,critic_approved,canary_passed,decision,decided_by,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(
        input.proposalId,
        'promotion',
        input.criticApproved ? 1 : 0,
        input.canaryPassed ? 1 : 0,
        decision,
        input.decidedBy,
        Date.now(),
      )
    instance
      .prepare('UPDATE proposals SET status = ? WHERE id = ?')
      .run(decision, input.proposalId)
  } finally {
    instance.close()
  }
  return { decision, reason }
}
