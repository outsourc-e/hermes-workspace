'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

export type SwarmInboxFilter = 'all' | 'needs_review' | 'blocked' | 'ready_for_eric' | 'lab'
export type SwarmInboxState = 'DONE' | 'BLOCKED' | 'HANDOFF' | 'IN_PROGRESS' | 'NEEDS_INPUT'
export type SwarmInboxKind = 'checkpoint' | 'aurora_dispatch'

export type SwarmInboxEntry = {
  hash: string
  kind: SwarmInboxKind
  author: 'worker' | 'aurora'
  missionId: string | null
  assignmentId: string | null
  workerId: string
  workerName: string
  roleLabel: string
  state: SwarmInboxState
  summary: string
  fullOutput: string
  filesChanged: Array<string>
  nextAction: string | null
  ts: number
  ageLabel: string
  checkpointText: string
  task: string | null
  result: string | null
  blocker: string | null
  reviewRequired: boolean
}

type RuntimeEntry = {
  workerId: string
  displayName?: string | null
  role?: string | null
}

type MissionCheckpoint = {
  stateLabel?: string | null
  filesChanged?: string | null
  commandsRun?: string | null
  result?: string | null
  blocker?: string | null
  nextAction?: string | null
  raw?: string | null
}

type MissionAssignment = {
  id?: string
  workerId?: string
  task?: string
  state?: string
  reviewRequired?: boolean
  completedAt?: number | null
  dispatchedAt?: number | null
  checkpoint?: MissionCheckpoint | null
}

type MissionEvent = {
  id: string
  type: string
  at: number
  workerId?: string
  assignmentId?: string
  message: string
  data?: Record<string, unknown>
}

type MissionSummary = {
  id: string
  title: string
  updatedAt: number
  assignments?: Array<MissionAssignment>
  events?: Array<MissionEvent>
}

const FILTERS: Array<{ id: SwarmInboxFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'needs_review', label: 'Needs Review' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'ready_for_eric', label: 'Ready for Eric' },
  { id: 'lab', label: 'Lab' },
]

function clean(value: string | null | undefined, fallback = ''): string {
  const text = value?.trim()
  return text ? text : fallback
}

function compact(value: string | null | undefined, max = 140): string {
  const text = clean(value)
  if (!text) return 'No summary available.'
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function splitFiles(value: string | null | undefined): Array<string> {
  return clean(value)
    .split(/\n|,/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function formatAge(ts: number, now: number): string {
  const diff = Math.max(0, now - ts)
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function sha1Hex(input: string): string {
  function rotateLeft(n: number, s: number) {
    return (n << s) | (n >>> (32 - s))
  }
  function cvtHex(val: number) {
    let out = ''
    for (let i = 7; i >= 0; i -= 1) out += ((val >>> (i * 4)) & 0x0f).toString(16)
    return out
  }

  const words: number[] = []
  const msg = unescape(encodeURIComponent(input))
  const msgLen = msg.length
  for (let i = 0; i < msgLen - 3; i += 4) {
    const j = (msg.charCodeAt(i) << 24)
      | (msg.charCodeAt(i + 1) << 16)
      | (msg.charCodeAt(i + 2) << 8)
      | msg.charCodeAt(i + 3)
    words.push(j)
  }
  let tail = 0
  switch (msgLen % 4) {
    case 0:
      tail = 0x080000000
      break
    case 1:
      tail = (msg.charCodeAt(msgLen - 1) << 24) | 0x0800000
      break
    case 2:
      tail = (msg.charCodeAt(msgLen - 2) << 24) | (msg.charCodeAt(msgLen - 1) << 16) | 0x08000
      break
    case 3:
      tail = (msg.charCodeAt(msgLen - 3) << 24) | (msg.charCodeAt(msgLen - 2) << 16) | (msg.charCodeAt(msgLen - 1) << 8) | 0x80
      break
  }
  words.push(tail)
  while ((words.length % 16) !== 14) words.push(0)
  words.push(msgLen >>> 29)
  words.push((msgLen << 3) & 0x0ffffffff)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const w = new Array<number>(80)
  for (let blockstart = 0; blockstart < words.length; blockstart += 16) {
    for (let i = 0; i < 16; i += 1) w[i] = words[blockstart + i]
    for (let i = 16; i < 80; i += 1) w[i] = rotateLeft(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i += 1) {
      let f = 0
      let k = 0
      if (i < 20) {
        f = (b & c) | ((~b) & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const temp = (rotateLeft(a, 5) + f + e + k + w[i]) & 0x0ffffffff
      e = d
      d = c
      c = rotateLeft(b, 30) & 0x0ffffffff
      b = a
      a = temp
    }
    h0 = (h0 + a) & 0x0ffffffff
    h1 = (h1 + b) & 0x0ffffffff
    h2 = (h2 + c) & 0x0ffffffff
    h3 = (h3 + d) & 0x0ffffffff
    h4 = (h4 + e) & 0x0ffffffff
  }

  return `${cvtHex(h0)}${cvtHex(h1)}${cvtHex(h2)}${cvtHex(h3)}${cvtHex(h4)}`
}

export function buildInboxCheckpointHash(workerId: string, checkpointText: string, ts: number): string {
  return sha1Hex(`${workerId}${checkpointText}${ts}`)
}

export function buildInboxReplyDispatchPayload(input: {
  workerId: string
  missionId: string | null
  priorTask: string | null
  priorResult: string | null
  replyText: string
}): {
  assignments: Array<{ workerId: string; task: string; rationale: string; dependsOn: Array<string> }>
} {
  const reply = input.replyText.trim()
  const task = [
    'Inbox reply follow-up. Preserve prior context and execute only this follow-up.',
    '',
    `Prior task: ${clean(input.priorTask, 'none')}`,
    `Prior result: ${clean(input.priorResult, 'none')}`,
    '',
    'User follow-up:',
    reply,
  ].join('\n')
  return {
    assignments: [{
      workerId: input.workerId,
      task,
      rationale: 'Inbox reply',
      dependsOn: input.missionId ? [input.missionId] : [],
    }],
  }
}

export function buildSwarmInboxEntries({
  missions,
  runtimes,
  now = Date.now(),
}: {
  missions: Array<MissionSummary>
  runtimes: Array<RuntimeEntry>
  now?: number
}): Array<SwarmInboxEntry> {
  const runtimeByWorker = new Map(runtimes.map((entry) => [entry.workerId, entry]))
  const entries: Array<SwarmInboxEntry> = []

  for (const mission of missions) {
    for (const assignment of mission.assignments ?? []) {
      const workerId = clean(assignment.workerId, 'unknown')
      const runtime = runtimeByWorker.get(workerId)
      const checkpoint = assignment.checkpoint
      if (!checkpoint?.stateLabel) continue
      const checkpointText = checkpoint.raw ?? [
        `STATE: ${checkpoint.stateLabel}`,
        `FILES_CHANGED: ${clean(checkpoint.filesChanged, 'none')}`,
        `COMMANDS_RUN: ${clean(checkpoint.commandsRun, 'none')}`,
        `RESULT: ${clean(checkpoint.result, 'none')}`,
        `BLOCKER: ${clean(checkpoint.blocker, 'none')}`,
        `NEXT_ACTION: ${clean(checkpoint.nextAction, 'none')}`,
      ].join('\n')
      const ts = assignment.completedAt ?? assignment.dispatchedAt ?? mission.updatedAt
      entries.push({
        hash: buildInboxCheckpointHash(workerId, checkpointText, ts),
        kind: 'checkpoint',
        author: 'worker',
        missionId: mission.id,
        assignmentId: assignment.id ?? null,
        workerId,
        workerName: clean(runtime?.displayName, workerId),
        roleLabel: clean(runtime?.role, 'Worker'),
        state: checkpoint.stateLabel as SwarmInboxState,
        summary: compact(checkpoint.result ?? checkpoint.blocker ?? checkpoint.nextAction ?? assignment.task),
        fullOutput: checkpointText,
        filesChanged: splitFiles(checkpoint.filesChanged),
        nextAction: clean(checkpoint.nextAction, '') || null,
        ts,
        ageLabel: formatAge(ts, now),
        checkpointText,
        task: clean(assignment.task, '') || null,
        result: clean(checkpoint.result, '') || null,
        blocker: clean(checkpoint.blocker, '') || null,
        reviewRequired: assignment.reviewRequired === true,
      })
    }

    for (const event of mission.events ?? []) {
      if (event.type !== 'assignment_dispatched') continue
      const author = clean(typeof event.data?.author === 'string' ? event.data.author : '', '')
      if (author !== 'aurora') continue
      const workerId = clean(event.workerId, 'unknown')
      const runtime = runtimeByWorker.get(workerId)
      const task = clean(typeof event.data?.task === 'string' ? event.data.task : event.message)
      const checkpointText = task.slice(0, 200)
      entries.push({
        hash: buildInboxCheckpointHash(workerId, checkpointText, event.at),
        kind: 'aurora_dispatch',
        author: 'aurora',
        missionId: mission.id,
        assignmentId: event.assignmentId ?? null,
        workerId,
        workerName: clean(runtime?.displayName, workerId),
        roleLabel: clean(runtime?.role, 'Worker'),
        state: 'IN_PROGRESS',
        summary: compact(task, 160),
        fullOutput: task,
        filesChanged: [],
        nextAction: null,
        ts: event.at,
        ageLabel: formatAge(event.at, now),
        checkpointText,
        task,
        result: null,
        blocker: null,
        reviewRequired: false,
      })
    }
  }

  return entries.sort((a, b) => b.ts - a.ts || a.workerId.localeCompare(b.workerId))
}

function readKey(hash: string): string {
  return `swarm-inbox:read:${hash}`
}

function dismissKey(hash: string): string {
  return `swarm-inbox:dismissed:${hash}`
}

function badgeClass(state: SwarmInboxState): string {
  switch (state) {
    case 'DONE':
      return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700'
    case 'BLOCKED':
      return 'border-red-400/40 bg-red-500/10 text-red-700'
    case 'NEEDS_INPUT':
      return 'border-amber-400/40 bg-amber-500/10 text-amber-700'
    case 'HANDOFF':
      return 'border-sky-400/40 bg-sky-500/10 text-sky-700'
    case 'IN_PROGRESS':
      return 'border-primary-300 bg-primary-100 text-primary-800'
  }
}

function matchesFilter(entry: SwarmInboxEntry, filter: SwarmInboxFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'needs_review':
      return entry.kind === 'checkpoint' && entry.reviewRequired
    case 'blocked':
      return entry.state === 'BLOCKED' || entry.state === 'NEEDS_INPUT'
    case 'ready_for_eric':
      return entry.kind === 'checkpoint' && ['DONE', 'HANDOFF'].includes(entry.state)
    case 'lab':
      return entry.author === 'aurora'
  }
}

export function Swarm2InboxView({
  entries,
  onApprove,
  onReply,
}: {
  entries: Array<SwarmInboxEntry>
  onApprove: (entry: SwarmInboxEntry) => Promise<void> | void
  onReply: (payload: ReturnType<typeof buildInboxReplyDispatchPayload>) => Promise<void> | void
}) {
  const [filter, setFilter] = useState<SwarmInboxFilter>('all')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [readMap, setReadMap] = useState<Record<string, boolean>>({})
  const [dismissedUntil, setDismissedUntil] = useState<Record<string, number>>({})

  useEffect(() => {
    if (typeof window === 'undefined') return
    const nextRead: Record<string, boolean> = {}
    const nextDismissed: Record<string, number> = {}
    for (const entry of entries) {
      nextRead[entry.hash] = window.localStorage.getItem(readKey(entry.hash)) === '1'
      const dismissed = Number(window.localStorage.getItem(dismissKey(entry.hash)) ?? 0)
      if (Number.isFinite(dismissed) && dismissed > Date.now()) nextDismissed[entry.hash] = dismissed
    }
    setReadMap(nextRead)
    setDismissedUntil(nextDismissed)
  }, [entries])

  function markRead(hash: string) {
    setReadMap((current) => ({ ...current, [hash]: true }))
    if (typeof window !== 'undefined') window.localStorage.setItem(readKey(hash), '1')
  }

  function dismiss(hash: string) {
    const until = Date.now() + (4 * 60 * 60 * 1000)
    setDismissedUntil((current) => ({ ...current, [hash]: until }))
    if (typeof window !== 'undefined') window.localStorage.setItem(dismissKey(hash), String(until))
    markRead(hash)
  }

  const visibleEntries = useMemo(() => entries.filter((entry) => {
    const snoozed = (dismissedUntil[entry.hash] ?? 0) > Date.now()
    return !snoozed && matchesFilter(entry, filter)
  }), [dismissedUntil, entries, filter])

  return (
    <section className="rounded-[1.75rem] border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-[0_18px_50px_var(--theme-shadow)]">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              filter === chip.id
                ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)]'
                : 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visibleEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-6 text-sm text-[var(--theme-muted)]">
            Inbox clear.
          </div>
        ) : visibleEntries.map((entry) => {
          const isUnread = !readMap[entry.hash]
          return (
            <article
              key={entry.hash}
              data-testid={`inbox-card-${entry.state.toLowerCase()}`}
              className={cn(
                'rounded-2xl border bg-[var(--theme-bg)] p-4 shadow-sm',
                entry.author === 'aurora'
                  ? 'border-l-4 border-l-fuchsia-500 border-[var(--theme-border2)]'
                  : 'border-l-4 border-l-[var(--theme-accent)] border-[var(--theme-border)]',
                isUnread && 'ring-1 ring-[var(--theme-accent)]/35',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--theme-muted)]">
                    <span className="font-semibold text-[var(--theme-text)]">{entry.workerId}</span>
                    <span>{entry.roleLabel}</span>
                    {entry.author === 'aurora' ? (
                      <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-2 py-0.5 text-fuchsia-700">[aurora]</span>
                    ) : null}
                    <span className={cn('rounded-full border px-2 py-0.5 font-semibold', badgeClass(entry.state))}>{entry.state}</span>
                    {isUnread ? <span className="rounded-full bg-[var(--theme-accent)] px-2 py-0.5 text-primary-950">Unread</span> : null}
                  </div>
                  <div className="text-sm font-semibold text-[var(--theme-text)]">{entry.summary}</div>
                  {entry.nextAction ? <div className="text-xs text-[var(--theme-muted)]">Next: {entry.nextAction}</div> : null}
                  {entry.filesChanged.length ? <div className="text-xs text-[var(--theme-muted)]">Files: {entry.filesChanged.join(', ')}</div> : null}
                </div>
                <div className="shrink-0 text-xs text-[var(--theme-muted)]">{entry.ageLabel}</div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {entry.kind === 'checkpoint' ? (
                  <button
                    type="button"
                    onClick={async () => {
                      markRead(entry.hash)
                      await onApprove(entry)
                    }}
                    className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                  >
                    Approve
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => dismiss(entry.hash)}
                  className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-muted)]"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => {
                    markRead(entry.hash)
                    setReplyOpen((current) => ({ ...current, [entry.hash]: !current[entry.hash] }))
                  }}
                  className="rounded-lg border border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-accent-strong)]"
                >
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => {
                    markRead(entry.hash)
                    setExpanded((current) => ({ ...current, [entry.hash]: !current[entry.hash] }))
                  }}
                  className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-muted)]"
                >
                  {expanded[entry.hash] ? 'Hide output' : 'Show output'}
                </button>
              </div>

              {replyOpen[entry.hash] ? (
                <div className="mt-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
                  <textarea
                    value={replyDrafts[entry.hash] ?? ''}
                    onChange={(event) => setReplyDrafts((current) => ({ ...current, [entry.hash]: event.target.value }))}
                    rows={4}
                    placeholder="Send follow-up to this worker"
                    className="w-full resize-none rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={async () => {
                        const replyText = clean(replyDrafts[entry.hash])
                        if (!replyText) return
                        markRead(entry.hash)
                        await onReply(buildInboxReplyDispatchPayload({
                          workerId: entry.workerId,
                          missionId: entry.missionId,
                          priorTask: entry.task,
                          priorResult: entry.result,
                          replyText,
                        }))
                        setReplyDrafts((current) => ({ ...current, [entry.hash]: '' }))
                        setReplyOpen((current) => ({ ...current, [entry.hash]: false }))
                      }}
                      className="rounded-lg bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-semibold text-primary-950"
                    >
                      Send reply
                    </button>
                  </div>
                </div>
              ) : null}

              {expanded[entry.hash] ? (
                <pre className="mt-3 overflow-x-auto rounded-xl border border-[var(--theme-border)] bg-primary-950 px-3 py-3 text-xs text-primary-50">{entry.fullOutput}</pre>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
