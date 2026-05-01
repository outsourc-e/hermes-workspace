import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isAuthenticated } from '../../server/auth-middleware'
import { getProfilesDir } from '../../server/claude-paths'
import { newestCheckpointFromMessages, readRuntimeJson, type ParsedSwarmCheckpoint } from '../../server/swarm-checkpoints'
import { readWorkerMessages } from '../../server/swarm-chat-reader'
import { getSwarmProfilePath, listSwarmWorkerIds } from '../../server/swarm-foundation'
import { appendMissionContinuation, markMissionAssignmentsReviewedByWorker, recordMissionCheckpoint } from '../../server/swarm-missions'
import { appendSwarmMemoryEvent } from '../../server/swarm-memory'
import { publishSwarmActionPrompt, publishSwarmCheckpointNotification } from '../../server/swarm-notifications'
import { applySwarmModeToLoopFlags, readSwarmMode } from '../../server/swarm-mode'
import { readSwarmRoster } from '../../server/swarm-roster'

type LoopRequest = {
  workerIds?: unknown
  staleMinutes?: unknown
  dryRun?: unknown
  autoContinue?: unknown
  reviewWorkerId?: unknown
  missionId?: unknown
  allowExecution?: unknown
}

type WorkerLoopResult = {
  workerId: string
  status: 'checkpointed' | 'already_processed' | 'stale' | 'waiting' | 'unavailable'
  checkpoint: ParsedSwarmCheckpoint | null
  action: string
  runtimePath: string
  notification?: { published: boolean; sessionKey: string }
  error?: string
}

function validWorkerIds(value: unknown): Array<string> {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => /^swarm\d+$/i.test(item))
}

function timestampFromRuntime(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function summarizeAction(checkpoint: ParsedSwarmCheckpoint): string {
  switch (checkpoint.stateLabel) {
    case 'DONE':
      return 'Worker completed its assigned task. Orchestrator should route review or next dependent task.'
    case 'BLOCKED':
      return 'Worker is blocked. Orchestrator should reroute, supply missing context, or escalate.'
    case 'NEEDS_INPUT':
      return 'Worker needs input. Orchestrator should answer if possible, otherwise ask user.'
    case 'HANDOFF':
      return 'Worker handed off context. Orchestrator should pass handoff to next lane.'
    case 'IN_PROGRESS':
      return 'Worker is still active. Orchestrator should monitor for staleness.'
  }
}

function runtimePatchFromCheckpoint(workerId: string, checkpoint: ParsedSwarmCheckpoint): Record<string, unknown> {
  return {
    workerId,
    state: checkpoint.runtimeState,
    phase: checkpoint.stateLabel.toLowerCase(),
    checkpointStatus: checkpoint.checkpointStatus,
    lastCheckIn: new Date().toISOString(),
    lastOutputAt: Date.now(),
    lastSummary: checkpoint.result,
    lastResult: checkpoint.result,
    lastRealSummary: checkpoint.result,
    lastRealResult: checkpoint.result,
    lastControlMessage: null,
    nextAction: checkpoint.nextAction,
    blockedReason: checkpoint.stateLabel === 'BLOCKED' || checkpoint.stateLabel === 'NEEDS_INPUT'
      ? checkpoint.blocker
      : null,
    needsHuman: checkpoint.stateLabel === 'NEEDS_INPUT',
    checkpointRaw: checkpoint.raw,
    orchestratorProcessedRaw: checkpoint.raw,
    checkpointFilesChanged: checkpoint.filesChanged,
    checkpointCommandsRun: checkpoint.commandsRun,
  }
}

function writeRuntimePatch(workerId: string, patch: Record<string, unknown>, dryRun: boolean): string {
  const profilePath = getSwarmProfilePath(workerId)
  const runtimePath = join(profilePath, 'runtime.json')
  if (dryRun) return runtimePath
  mkdirSync(profilePath, { recursive: true })
  const current = readRuntimeJson(runtimePath)
  writeFileSync(runtimePath, JSON.stringify({ ...current, ...patch }, null, 2) + '\n')
  return runtimePath
}

function runtimeString(current: Record<string, unknown>, key: string): string | null {
  const value = current[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function recordCheckpoint(input: {
  workerId: string
  checkpoint: ParsedSwarmCheckpoint
  current: Record<string, unknown>
  dryRun: boolean
}): { notification: { published: boolean; sessionKey: string }; missionRecorded: boolean } {
  const missionId = runtimeString(input.current, 'currentMissionId')
  const assignmentId = runtimeString(input.current, 'currentAssignmentId')
  const notifySessionKey = runtimeString(input.current, 'notifySessionKey')

  if (input.dryRun) {
    return { notification: { published: false, sessionKey: notifySessionKey ?? 'main' }, missionRecorded: false }
  }

  const mission = recordMissionCheckpoint({
    missionId,
    assignmentId,
    workerId: input.workerId,
    checkpoint: input.checkpoint,
    source: 'swarm-orchestrator-loop',
  })

  appendSwarmMemoryEvent({
    workerId: input.workerId,
    missionId,
    assignmentId,
    type: input.checkpoint.checkpointStatus === 'blocked' ? 'blocked' : 'checkpoint',
    summary: input.checkpoint.result ?? input.checkpoint.blocker ?? input.checkpoint.nextAction ?? 'Worker checkpoint processed',
    checkpoint: input.checkpoint,
    event: {
      state: input.checkpoint.stateLabel,
      filesChanged: input.checkpoint.filesChanged,
      commandsRun: input.checkpoint.commandsRun,
      nextAction: input.checkpoint.nextAction,
      source: 'swarm-orchestrator-loop',
    },
  })

  const notification = publishSwarmCheckpointNotification({
    workerId: input.workerId,
    checkpoint: input.checkpoint,
    missionId,
    assignmentId,
    notifySessionKey,
  })
  return { notification, missionRecorded: Boolean(mission) }
}

function runWorkerLoop(workerId: string, staleMs: number, dryRun: boolean): WorkerLoopResult {
  const profilePath = join(getProfilesDir(), workerId)
  const runtimePath = join(profilePath, 'runtime.json')
  const current = readRuntimeJson(runtimePath)
  const chat = readWorkerMessages(profilePath, 40)
  if (!chat.ok) {
    return {
      workerId,
      status: 'unavailable',
      checkpoint: null,
      action: 'Chat history unavailable; cannot parse checkpoint.',
      runtimePath,
      error: chat.error,
    }
  }

  const checkpoint = newestCheckpointFromMessages(chat.messages)
  if (checkpoint) {
    if (current.orchestratorProcessedRaw === checkpoint.raw) {
      return {
        workerId,
        status: 'already_processed',
        checkpoint,
        action: 'Checkpoint already processed by orchestrator; no continuation dispatched.',
        runtimePath,
      }
    }
    const savedPath = writeRuntimePatch(workerId, runtimePatchFromCheckpoint(workerId, checkpoint), dryRun)
    const recorded = recordCheckpoint({ workerId, checkpoint, current, dryRun })
    return {
      workerId,
      status: 'checkpointed',
      checkpoint,
      action: summarizeAction(checkpoint),
      runtimePath: savedPath,
      notification: recorded.notification,
    }
  }

  const last = timestampFromRuntime(current.lastOutputAt) ?? timestampFromRuntime(current.lastCheckIn) ?? timestampFromRuntime(current.lastDispatchAt)
  const stale = last ? Date.now() - last > staleMs : true
  const patch = stale
    ? {
        workerId,
        state: 'waiting',
        checkpointStatus: 'needs_input',
        needsHuman: false,
        blockedReason: 'No parseable checkpoint found before stale threshold.',
        nextAction: 'Orchestrator should re-prompt this worker with the required checkpoint format.',
        lastCheckIn: new Date().toISOString(),
      }
    : {}
  const savedPath = Object.keys(patch).length ? writeRuntimePatch(workerId, patch, dryRun) : runtimePath
  return {
    workerId,
    status: stale ? 'stale' : 'waiting',
    checkpoint: null,
    action: stale
      ? 'No checkpoint found and worker is stale; re-prompt with stricter checkpoint format.'
      : 'No checkpoint found yet; continue monitoring.',
    runtimePath: savedPath,
  }
}


function isReviewer(workerId: string, allWorkerIds: Array<string>): boolean {
  const worker = readSwarmRoster(allWorkerIds).workers.find((entry) => entry.id === workerId)
  return /review|qa|critic/i.test(`${worker?.role ?? ''} ${worker?.specialty ?? ''}`)
}

function chooseByRole(workerIds: Array<string>, pattern: RegExp): string | null {
  const roster = readSwarmRoster(workerIds)
  const worker = roster.workers.find((entry) => pattern.test(`${entry.role} ${entry.specialty}`))
  return worker?.id ?? null
}

function chooseReviewer(workerIds: Array<string>, requested: unknown): string | null {
  if (typeof requested === 'string' && /^swarm\d+$/i.test(requested.trim())) return requested.trim()
  if (workerIds.includes('swarm6')) return 'swarm6'
  return chooseByRole(workerIds, /review|qa|critic/i)
}

function buildReviewAssignment(results: Array<WorkerLoopResult>, reviewerId: string, allWorkerIds: Array<string>): { workerId: string; task: string; rationale: string } | null {
  const done = results.filter((item) => item.status === 'checkpointed' && item.checkpoint?.stateLabel === 'DONE' && !isReviewer(item.workerId, allWorkerIds))
  if (done.length === 0) return null
  const summary = done.map((item) => [
    `Worker: ${item.workerId}`,
    `Result: ${item.checkpoint?.result ?? 'none'}`,
    `Files: ${item.checkpoint?.filesChanged ?? 'none'}`,
    `Commands: ${item.checkpoint?.commandsRun ?? 'none'}`,
    `Next: ${item.checkpoint?.nextAction ?? 'none'}`,
  ].join('\n')).join('\n\n---\n\n')
  return {
    workerId: reviewerId,
    rationale: 'Autopilot review gate for completed worker checkpoints.',
    task: `Review these completed Swarm2 worker checkpoints. Do not edit files. Return the required checkpoint format. Decide if the workflow can continue, what the next task should be, and what regression risk remains.\n\n${summary}`,
  }
}

function buildNextActionAssignments(results: Array<WorkerLoopResult>, workerIds: Array<string>, allowExecution: boolean): Array<{ workerId: string; task: string; rationale: string }> {
  const assignments: Array<{ workerId: string; task: string; rationale: string }> = []
  for (const item of results) {
    const checkpoint = item.checkpoint
    if (item.status !== 'checkpointed' || !checkpoint || checkpoint.stateLabel !== 'DONE' || !checkpoint.nextAction) continue
    const next = checkpoint.nextAction
    const implementationLike = /builder|implement|patch|code|ship|execute|run|real execution/i.test(next)
    if (implementationLike && !allowExecution) continue
    const target = implementationLike
      ? chooseByRole(workerIds, /builder|backend|ui/i)
      : /research|investigate|options/i.test(next)
        ? chooseByRole(workerIds, /research/i)
        : /review|verify|test|gate/i.test(next)
          ? chooseReviewer(workerIds, null)
          : null
    if (!target || target === item.workerId) continue
    assignments.push({
      workerId: target,
      rationale: `Auto-continued from ${item.workerId} checkpoint next action.`,
      task: `Continue the Swarm2 workflow from ${item.workerId}'s checkpoint. Do not broaden scope. Return the required checkpoint format.

Previous result:
${checkpoint.result ?? 'none'}

Next action to execute:
${next}`,
    })
  }
  return assignments
}

function buildStaleAssignments(results: Array<WorkerLoopResult>): Array<{ workerId: string; task: string; rationale: string }> {
  return results
    .filter((item) => item.status === 'stale')
    .map((item) => ({
      workerId: item.workerId,
      rationale: 'Worker was stale or did not return a parseable checkpoint.',
      task: 'You were dispatched a Swarm2 task but no parseable checkpoint was found. Stop current exploration and return ONLY the required checkpoint format now: STATE, FILES_CHANGED, COMMANDS_RUN, RESULT, BLOCKER, NEXT_ACTION.',
    }))
}

function mergeAssignments(assignments: Array<{ workerId: string; task: string; rationale: string }>): Array<{ workerId: string; task: string; rationale: string }> {
  const byWorker = new Map<string, { workerId: string; tasks: Array<string>; rationales: Array<string> }>()
  for (const assignment of assignments) {
    const existing = byWorker.get(assignment.workerId) ?? { workerId: assignment.workerId, tasks: [], rationales: [] }
    existing.tasks.push(assignment.task)
    existing.rationales.push(assignment.rationale)
    byWorker.set(assignment.workerId, existing)
  }
  return [...byWorker.values()].map((entry) => ({
    workerId: entry.workerId,
    rationale: [...new Set(entry.rationales)].join(' + '),
    task: entry.tasks.length === 1
      ? entry.tasks[0]
      : `You have multiple orchestrator follow-ups. Execute them in order and return one complete checkpoint.\n\n${entry.tasks.map((task, index) => `## Follow-up ${index + 1}\n${task}`).join('\n\n')}`,
  }))
}

function buildMainSessionPrompt(results: Array<WorkerLoopResult>): string | null {
  const fresh = results.filter((item) => item.status === 'checkpointed' && item.checkpoint)
  if (fresh.length === 0) return null

  const lines = fresh.flatMap((item) => {
    const checkpoint = item.checkpoint!
    const needsHuman = checkpoint.stateLabel === 'NEEDS_INPUT' || checkpoint.stateLabel === 'BLOCKED'
    const heading = needsHuman
      ? `- ${item.workerId} needs attention (${checkpoint.stateLabel})`
      : `- ${item.workerId} reported ${checkpoint.stateLabel}`
    return [
      heading,
      `  Result: ${checkpoint.result ?? 'none'}`,
      checkpoint.blocker && checkpoint.blocker.toLowerCase() !== 'none' ? `  Blocker/question: ${checkpoint.blocker}` : null,
      checkpoint.nextAction && checkpoint.nextAction.toLowerCase() !== 'none' ? `  Suggested next: ${checkpoint.nextAction}` : null,
    ].filter((line): line is string => Boolean(line))
  })

  const hasQuestions = fresh.some((item) => item.checkpoint?.stateLabel === 'NEEDS_INPUT' || item.checkpoint?.stateLabel === 'BLOCKED')
  return [
    `${fresh.length} worker update${fresh.length === 1 ? '' : 's'} ready.`,
    ...lines,
    '',
    hasQuestions
      ? 'Main orchestrator: answer the blocker/question if you can; otherwise ask Eric. Then decide whether to continue, reroute, or send to reviewer.'
      : 'Main orchestrator: summarize status for Eric, route completed work through reviewer if needed, and ask whether to continue or hold.',
  ].join('\n')
}

async function dispatchAssignments(request: Request, assignments: Array<{ workerId: string; task: string; rationale: string }>, missionId?: string | null): Promise<unknown | null> {
  const merged = mergeAssignments(assignments)
  if (merged.length === 0) return null
  for (const assignment of merged) appendMissionContinuation({ missionId, ...assignment })
  const res = await fetch(new URL('/api/swarm-dispatch', request.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') as string } : {}),
    },
    body: JSON.stringify({ assignments: merged, timeoutSeconds: 90, missionId, waitForCheckpoint: true, checkpointPollSeconds: 90 }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) return { ok: false, status: res.status, data }
  return data
}

export const Route = createFileRoute('/api/swarm-orchestrator-loop')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: LoopRequest
        try {
          body = (await request.json()) as LoopRequest
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        const requested = validWorkerIds(body.workerIds)
        const workerIds = requested.length ? requested : listSwarmWorkerIds()
        const staleMinutes = typeof body.staleMinutes === 'number' && Number.isFinite(body.staleMinutes)
          ? Math.max(1, Math.min(240, body.staleMinutes))
          : 10
        const dryRun = body.dryRun === true
        const requestedAutoContinue = body.autoContinue === true
        const requestedAllowExecution = body.allowExecution === true
        const mode = readSwarmMode()
        const loopFlags = applySwarmModeToLoopFlags({
          mode: mode.mode,
          autoContinueRequested: requestedAutoContinue,
          allowExecutionRequested: requestedAllowExecution,
        })
        const autoContinue = loopFlags.autoContinue
        const allowExecution = loopFlags.allowExecution
        const missionId = typeof body.missionId === 'string' && body.missionId.trim() ? body.missionId.trim() : null
        const results = workerIds.map((workerId) => runWorkerLoop(workerId, staleMinutes * 60_000, dryRun))

        const summary = {
          checkpointed: results.filter((item) => item.status === 'checkpointed').length,
          stale: results.filter((item) => item.status === 'stale').length,
          waiting: results.filter((item) => item.status === 'waiting' || item.status === 'already_processed').length,
          unavailable: results.filter((item) => item.status === 'unavailable').length,
        }

        let orchestrationPrompt: { published: boolean; sessionKey: string } | null = null
        const promptText = !dryRun ? buildMainSessionPrompt(results) : null
        if (promptText) {
          orchestrationPrompt = publishSwarmActionPrompt({
            missionId,
            title: 'Worker updates ready',
            text: promptText,
            details: {
              source: 'swarm-orchestrator-loop',
              checkpointed: summary.checkpointed,
              stale: summary.stale,
              waiting: summary.waiting,
              workerIds: results.filter((item) => item.status === 'checkpointed').map((item) => item.workerId),
            },
          })
        }

        let continuation: unknown | null = null
        if (autoContinue && !dryRun) {
          const assignments = buildStaleAssignments(results)
          assignments.push(...buildNextActionAssignments(results, workerIds, allowExecution))
          const reviewerId = chooseReviewer(workerIds, body.reviewWorkerId)
          const hasReviewerDone = results.some((item) => item.status === 'checkpointed' && item.checkpoint?.stateLabel === 'DONE' && isReviewer(item.workerId, workerIds))
          const reviewAssignment = reviewerId && !hasReviewerDone ? buildReviewAssignment(results, reviewerId, workerIds) : null
          if (reviewAssignment && !assignments.some((item) => item.workerId === reviewAssignment.workerId && item.task === reviewAssignment.task)) assignments.push(reviewAssignment)
          continuation = await dispatchAssignments(request, assignments, missionId)
        }

        return json({
          ok: true,
          checkedAt: Date.now(),
          dryRun,
          mode,
          autoContinue,
          allowExecution,
          staleMinutes,
          missionId,
          summary,
          results,
          orchestrationPrompt,
          continuation,
        })
      },
    },
  },
})
