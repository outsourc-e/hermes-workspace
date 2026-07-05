import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

export const receiptStatusSchema = z.enum([
  'building',
  'blocked',
  'needs_tom',
  'done',
  'verified',
  'stale',
])

export const receiptClassificationSchema = z.enum([
  'live',
  'self_reported',
  'stale',
  'sample',
])

export const agentWorkReceiptSchema = z.object({
  receipt_id: z.string().min(1),
  schema_version: z.literal('agent-work-receipt/v1'),
  issue_links: z.array(z.object({ system: z.string().min(1), id: z.string().min(1), url: z.string().url().optional() })).default([]),
  system_links: z.array(z.object({ system: z.string().min(1), id: z.string().min(1), path_or_url: z.string().min(1) })).default([]),
  venture: z.string().min(1),
  company: z.string().min(1),
  builder: z.object({ name: z.string().min(1), runtime: z.string().min(1), model: z.string().optional() }),
  repo: z.object({ name: z.string().min(1), branch: z.string().min(1), path: z.string().min(1), commit: z.string().optional() }),
  status: receiptStatusSchema,
  classification: receiptClassificationSchema,
  timestamps: z.object({ started_at: z.string().datetime(), updated_at: z.string().datetime(), completed_at: z.string().datetime().optional() }),
  current_activity: z.string().min(1),
  changed_files: z.array(z.object({ path: z.string().min(1), change_type: z.enum(['added', 'modified', 'deleted', 'renamed']) })).default([]),
  diff_summary: z.string().min(1),
  verification_evidence: z.array(z.object({ command: z.string().min(1), outcome: z.string().min(1), passed: z.boolean() })).default([]),
  blockers: z.array(z.object({ description: z.string().min(1), owner: z.string().min(1), tom_needed: z.boolean().default(false) })).default([]),
  tom_needed: z.boolean(),
  next_action: z.string().min(1),
  sample: z.boolean().default(false),
})

export type AgentWorkReceipt = z.infer<typeof agentWorkReceiptSchema>

export type OpsSectionName =
  | 'NOW'
  | 'NEEDS_TOM'
  | 'BUILDING'
  | 'WAITING_OR_BLOCKED'
  | 'CHANGED'
  | 'STALE_OR_UNVERIFIED'

export type OpsItem = {
  receipt_id: string
  title: string
  venture: string
  company: string
  status: AgentWorkReceipt['status']
  classification: AgentWorkReceipt['classification']
  builder: string
  runtime: string
  repo: AgentWorkReceipt['repo']
  updated_at: string
  current_activity: string
  next_action: string
  tom_needed: boolean
  blockers: AgentWorkReceipt['blockers']
  changed_files: AgentWorkReceipt['changed_files']
  diff_summary: string
  verification_summary: { passed: number; failed: number; commands: string[] }
  issue_links: AgentWorkReceipt['issue_links']
  system_links: AgentWorkReceipt['system_links']
}

export type NormalizedOpsState = {
  schema_version: 'normalized-ops-state/v1'
  generated_at: string
  source: { receipts_dir: string; receipt_count: number; sample_only: boolean }
  sections: Record<OpsSectionName, OpsItem[]>
  daily_ops_review_contract: {
    categories: string[]
    top_actions: Array<{ category: string; receipt_id: string; action: string; evidence: string[] }>
  }
}

export async function loadReceiptsFromDir(receiptsDir: string): Promise<AgentWorkReceipt[]> {
  const entries = await fs.readdir(receiptsDir, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(receiptsDir, entry.name))
    .sort((a, b) => a.localeCompare(b))

  const receipts = await Promise.all(files.map(async (file) => parseReceiptFile(file)))
  return receipts.sort(compareReceipts)
}

export async function parseReceiptFile(filePath: string): Promise<AgentWorkReceipt> {
  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  return agentWorkReceiptSchema.parse(parsed)
}

export function aggregateReceipts(
  receipts: AgentWorkReceipt[],
  options: { receiptsDir: string; generatedAt?: string },
): NormalizedOpsState {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const items = receipts.sort(compareReceipts).map(toOpsItem)
  const sections: Record<OpsSectionName, OpsItem[]> = {
    NOW: items.filter((item) => item.tom_needed || item.status === 'blocked' || item.status === 'needs_tom' || item.status === 'building'),
    NEEDS_TOM: items.filter((item) => item.tom_needed || item.status === 'needs_tom'),
    BUILDING: items.filter((item) => item.status === 'building'),
    WAITING_OR_BLOCKED: items.filter((item) => item.status === 'blocked' || item.blockers.length > 0),
    CHANGED: items.filter((item) => item.changed_files.length > 0),
    STALE_OR_UNVERIFIED: items.filter(
      (item) =>
        item.status === 'stale' ||
        item.classification === 'stale' ||
        item.classification === 'self_reported' ||
        item.verification_summary.failed > 0 ||
        item.verification_summary.commands.length === 0,
    ),
  }

  for (const section of Object.keys(sections) as OpsSectionName[]) {
    sections[section] = sortOpsItems(sections[section])
  }

  return {
    schema_version: 'normalized-ops-state/v1',
    generated_at: generatedAt,
    source: {
      receipts_dir: options.receiptsDir,
      receipt_count: receipts.length,
      sample_only: receipts.length > 0 && receipts.every((receipt) => receipt.sample || receipt.classification === 'sample'),
    },
    sections,
    daily_ops_review_contract: buildDailyOpsReviewContract(sections),
  }
}

export function buildDailyOpsReviewContract(sections: Record<OpsSectionName, OpsItem[]>): NormalizedOpsState['daily_ops_review_contract'] {
  const categories = ['NEEDS_TOM', 'BUILDING', 'BLOCKED', 'STALE_OR_DRIFTING', 'SHIP_READY']
  const candidates = [
    ...sections.NEEDS_TOM.map((item) => actionFor('NEEDS_TOM', item)),
    ...sections.WAITING_OR_BLOCKED.map((item) => actionFor('BLOCKED', item)),
    ...sections.BUILDING.map((item) => actionFor('BUILDING', item)),
    ...sections.STALE_OR_UNVERIFIED.map((item) => actionFor('STALE_OR_DRIFTING', item)),
    ...sections.CHANGED.filter((item) => item.status === 'done' || item.status === 'verified').map((item) => actionFor('SHIP_READY', item)),
  ]

  const seen = new Set<string>()
  const top_actions = candidates
    .filter((candidate) => {
      if (seen.has(candidate.receipt_id)) return false
      seen.add(candidate.receipt_id)
      return true
    })
    .slice(0, 6)

  return { categories, top_actions }
}

function actionFor(category: string, item: OpsItem): { category: string; receipt_id: string; action: string; evidence: string[] } {
  return {
    category,
    receipt_id: item.receipt_id,
    action: item.next_action,
    evidence: [item.current_activity, item.diff_summary, ...item.verification_summary.commands].filter(Boolean).slice(0, 4),
  }
}

function toOpsItem(receipt: AgentWorkReceipt): OpsItem {
  const passed = receipt.verification_evidence.filter((evidence) => evidence.passed).length
  const failed = receipt.verification_evidence.filter((evidence) => !evidence.passed).length
  return {
    receipt_id: receipt.receipt_id,
    title: `${receipt.venture}: ${receipt.current_activity}`,
    venture: receipt.venture,
    company: receipt.company,
    status: receipt.status,
    classification: receipt.classification,
    builder: receipt.builder.name,
    runtime: receipt.builder.runtime,
    repo: receipt.repo,
    updated_at: receipt.timestamps.updated_at,
    current_activity: receipt.current_activity,
    next_action: receipt.next_action,
    tom_needed: receipt.tom_needed,
    blockers: receipt.blockers,
    changed_files: receipt.changed_files,
    diff_summary: receipt.diff_summary,
    verification_summary: {
      passed,
      failed,
      commands: receipt.verification_evidence.map((evidence) => `${evidence.passed ? 'PASS' : 'FAIL'} ${evidence.command}: ${evidence.outcome}`),
    },
    issue_links: receipt.issue_links,
    system_links: receipt.system_links,
  }
}

function compareReceipts(a: AgentWorkReceipt, b: AgentWorkReceipt): number {
  const time = b.timestamps.updated_at.localeCompare(a.timestamps.updated_at)
  return time || a.receipt_id.localeCompare(b.receipt_id)
}

function sortOpsItems(items: OpsItem[]): OpsItem[] {
  const priority: Record<AgentWorkReceipt['status'], number> = {
    needs_tom: 0,
    blocked: 1,
    building: 2,
    verified: 3,
    done: 4,
    stale: 5,
  }
  return [...items].sort((a, b) => priority[a.status] - priority[b.status] || b.updated_at.localeCompare(a.updated_at) || a.receipt_id.localeCompare(b.receipt_id))
}
