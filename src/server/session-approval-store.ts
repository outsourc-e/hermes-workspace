import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getHermesRoot } from './claude-paths'

type SessionApprovalRule = {
  sessionKey: string
  actionKey: string
  actionLabel: string
  createdAt: number
  lastUsedAt?: number
  useCount?: number
}

type PendingApproval = {
  runId: string
  sessionKey: string
  actionKey: string
  actionLabel: string
  requestedAt: number
}

type ApprovalStore = {
  version: 1
  rules: Array<SessionApprovalRule>
  pending: Array<PendingApproval>
}

const STORE_DIR = path.join(getHermesRoot(), 'webui-mvp')
const STORE_FILE = path.join(STORE_DIR, 'session-approvals.json')
const pendingApprovals = new Map<string, PendingApproval>()
let storeQueue: Promise<unknown> = Promise.resolve()

function normalizePart(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function approvalActionLabel(approval: Record<string, unknown>): string {
  const command = readString(approval.command)
  const direct =
    readString(approval.tool) ||
    readString(approval.name) ||
    readString(approval.action)
  if (direct) return direct
  if (command) return command.split(/\s+/, 1)[0] || command

  const input = readRecord(approval.input) ?? readRecord(approval.args)
  return (
    readString(input?.tool) ||
    readString(input?.name) ||
    readString(input?.action) ||
    'tool_call'
  )
}

function approvalActionKey(actionLabel: string): string {
  return normalizePart(actionLabel)
}

function normalizeSessionKey(sessionKey: string): string {
  return normalizePart(sessionKey || 'main')
}

async function readStore(): Promise<ApprovalStore> {
  try {
    const raw = await readFile(STORE_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<ApprovalStore>
    return {
      version: 1,
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      pending: Array.isArray(parsed.pending) ? parsed.pending : [],
    }
  } catch {
    return { version: 1, rules: [], pending: [] }
  }
}

async function writeStore(store: ApprovalStore): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true })
  const tempPath = `${STORE_FILE}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  await rename(tempPath, STORE_FILE)
}

function enqueueStoreUpdate<T>(work: () => Promise<T>): Promise<T> {
  const current = storeQueue.catch(() => undefined).then(work)
  storeQueue = current.then(
    () => undefined,
    () => undefined,
  )
  return current
}

export async function registerPendingSessionApproval(input: {
  runId: string
  sessionKey: string
  approval: Record<string, unknown>
}): Promise<PendingApproval> {
  const actionLabel = approvalActionLabel(input.approval)
  const pending: PendingApproval = {
    runId: input.runId,
    sessionKey: normalizeSessionKey(input.sessionKey),
    actionKey: approvalActionKey(actionLabel),
    actionLabel,
    requestedAt: Date.now(),
  }
  pendingApprovals.set(input.runId, pending)
  await enqueueStoreUpdate(async () => {
    const store = await readStore()
    const pendingRows = store.pending.filter((row) => row.runId !== input.runId)
    pendingRows.push(pending)
    await writeStore({ ...store, pending: pendingRows.slice(-100) })
  })
  return pending
}

export async function shouldAutoApproveSessionApproval(input: {
  sessionKey: string
  approval: Record<string, unknown>
}): Promise<boolean> {
  const actionLabel = approvalActionLabel(input.approval)
  const sessionKey = normalizeSessionKey(input.sessionKey)
  const actionKey = approvalActionKey(actionLabel)
  const store = await readStore()
  return store.rules.some(
    (rule) => rule.sessionKey === sessionKey && rule.actionKey === actionKey,
  )
}

export async function rememberSessionApprovalForRun(
  runId: string,
): Promise<PendingApproval | null> {
  return enqueueStoreUpdate(async () => {
    const store = await readStore()
    const pending =
      pendingApprovals.get(runId) ??
      store.pending.find((row) => row.runId === runId) ??
      null
    if (!pending) return null

    const rules = store.rules.filter(
      (rule) =>
        rule.sessionKey !== pending.sessionKey ||
        rule.actionKey !== pending.actionKey,
    )
    rules.push({
      sessionKey: pending.sessionKey,
      actionKey: pending.actionKey,
      actionLabel: pending.actionLabel,
      createdAt: Date.now(),
    })
    const nextPending = store.pending.filter((row) => row.runId !== runId)
    pendingApprovals.delete(runId)
    await writeStore({
      version: 1,
      rules: rules.slice(-200),
      pending: nextPending.slice(-100),
    })
    return pending
  })
}

export async function clearPendingSessionApproval(runId: string): Promise<void> {
  pendingApprovals.delete(runId)
  await enqueueStoreUpdate(async () => {
    const store = await readStore()
    await writeStore({
      ...store,
      pending: store.pending.filter((row) => row.runId !== runId),
    })
  })
}

export async function markSessionApprovalRuleUsed(input: {
  sessionKey: string
  approval: Record<string, unknown>
}): Promise<void> {
  await enqueueStoreUpdate(async () => {
    const store = await readStore()
    const sessionKey = normalizeSessionKey(input.sessionKey)
    const actionKey = approvalActionKey(approvalActionLabel(input.approval))
    const rules = store.rules.map((rule) =>
      rule.sessionKey === sessionKey && rule.actionKey === actionKey
        ? {
            ...rule,
            lastUsedAt: Date.now(),
            useCount: (rule.useCount ?? 0) + 1,
          }
        : rule,
    )
    await writeStore({ ...store, rules })
  })
}
