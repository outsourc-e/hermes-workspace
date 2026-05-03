import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'
import { getSwarmProfilePath } from './swarm-foundation'
import { publishChatEvent } from './chat-event-bus'

const ORCHESTRATOR_WORKER_ID = process.env.SWARM_ORCHESTRATOR_WORKER_ID?.trim() || 'swarm3'
const ORCHESTRATOR_TMUX_SESSION = `swarm-${ORCHESTRATOR_WORKER_ID}`
const MAIN_SESSION_KEY = process.env.SWARM_MAIN_SESSION_KEY?.trim() || 'main'

function tmuxSessionExists(session: string): boolean {
  try {
    execFileSync('tmux', ['has-session', '-t', session], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function tmuxSendText(session: string, text: string): { sent: boolean; error?: string } {
  if (!tmuxSessionExists(session)) {
    return { sent: false, error: `tmux session ${session} not found` }
  }
  try {
    // Use literal mode so multi-line content sends without shell interpretation, then send Enter to submit.
    execFileSync('tmux', ['send-keys', '-t', session, '-l', text], { stdio: 'ignore' })
    execFileSync('tmux', ['send-keys', '-t', session, 'Enter'], { stdio: 'ignore' })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function orchestratorPromptForCheckpoint(input: {
  workerId: string
  checkpoint: ParsedSwarmCheckpoint
  missionId?: string | null
}): string {
  const lines: Array<string> = [
    `## Checkpoint from ${input.workerId}`,
    `STATE: ${input.checkpoint.stateLabel}`,
  ]
  if (input.missionId) lines.push(`Mission: ${input.missionId}`)
  if (input.checkpoint.result) lines.push(`Result: ${input.checkpoint.result}`)
  if (input.checkpoint.blocker && input.checkpoint.blocker.toLowerCase() !== 'none') {
    lines.push(`Blocker: ${input.checkpoint.blocker}`)
  }
  if (input.checkpoint.nextAction && input.checkpoint.nextAction.toLowerCase() !== 'none') {
    lines.push(`Next: ${input.checkpoint.nextAction}`)
  }
  lines.push('')
  lines.push(`Decide next action per the swarm review spec for ${input.workerId} and the swarm auto-repair playbook:`)
  lines.push(`- DONE → mark mission complete, assign next from lane priority`)
  lines.push(`- HANDOFF → dispatch to named worker per next_action`)
  lines.push(`- BLOCKED → consult auto-repair.yaml; if not in playbook, escalate to the main agent (publish to '${MAIN_SESSION_KEY}')`)
  lines.push(`- NEEDS_INPUT → escalate to the main agent`)
  lines.push(`- NEEDS_REVIEW → queue Inbox card, route to Eric`)
  lines.push('')
  lines.push(`Reply with the dispatch you fired (POST /api/swarm-dispatch on http://localhost:3002) OR the escalation summary.`)
  return lines.join('\n')
}

export function publishCheckpointToOrchestrator(input: {
  workerId: string
  checkpoint: ParsedSwarmCheckpoint
  missionId?: string | null
}): { sent: boolean; session: string; error?: string; skippedSelf?: boolean } {
  // Don't echo a checkpoint into the orchestrator's own pane.
  if (input.workerId === ORCHESTRATOR_WORKER_ID) {
    return { sent: false, session: ORCHESTRATOR_TMUX_SESSION, skippedSelf: true }
  }
  const text = orchestratorPromptForCheckpoint(input)
  const result = tmuxSendText(ORCHESTRATOR_TMUX_SESSION, text)
  return { ...result, session: ORCHESTRATOR_TMUX_SESSION }
}

function publishChatStatus(sessionKey: string, text: string): void {
  publishChatEvent('status', {
    type: 'status',
    sessionKey,
    transport: 'chat-events',
    text,
  })
}

function readRuntime(runtimePath: string): Record<string, unknown> {
  if (!existsSync(runtimePath)) return {}
  try {
    return JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeRuntime(runtimePath: string, value: Record<string, unknown>): void {
  writeFileSync(runtimePath, JSON.stringify(value, null, 2) + '\n')
}

function checkpointSummary(checkpoint: ParsedSwarmCheckpoint): string {
  const parts = [
    checkpoint.result,
    checkpoint.blocker && checkpoint.blocker.toLowerCase() !== 'none' ? `Blocker: ${checkpoint.blocker}` : null,
    checkpoint.nextAction && checkpoint.nextAction.toLowerCase() !== 'none' ? `Next: ${checkpoint.nextAction}` : null,
  ].filter(Boolean)
  return parts.join(' | ')
}

export function publishSwarmActionPrompt(input: {
  sessionKey?: string | null
  missionId?: string | null
  title: string
  text: string
  details?: Record<string, unknown>
}): { published: boolean; sessionKey: string } {
  const sessionKey = input.sessionKey?.trim() || 'main'
  const headline = input.missionId ? `[Swarm] ${input.title} — Mission: ${input.missionId}` : `[Swarm] ${input.title}`
  const messageText = [headline, input.text].filter(Boolean).join('\n')

  publishChatEvent('message', {
    type: 'message',
    sessionKey,
    transport: 'chat-events',
    message: {
      role: 'assistant',
      timestamp: Date.now(),
      content: [{ type: 'text', text: messageText }],
      details: {
        source: 'swarm-orchestrator',
        missionId: input.missionId ?? null,
        ...input.details,
      },
    },
  })

  publishChatStatus(sessionKey, `${headline} — ${input.text}`)
  return { published: true, sessionKey }
}

function shouldEscalateToMain(stateLabel: string): boolean {
  // Only NEEDS_INPUT escalates to the main agent directly.
  // BLOCKED/HANDOFF/DONE go to the orchestrator first; orchestrator escalates if needed.
  return stateLabel === 'NEEDS_INPUT'
}

export function publishSwarmCheckpointNotification(input: {
  workerId: string
  checkpoint: ParsedSwarmCheckpoint
  missionId?: string | null
  assignmentId?: string | null
  notifySessionKey?: string | null
}): { published: boolean; sessionKey: string; route: 'orchestrator' | 'main' | 'noop'; orchestrator?: { sent: boolean; session: string; error?: string; skippedSelf?: boolean } } {
  const profilePath = getSwarmProfilePath(input.workerId)
  const runtimePath = join(profilePath, 'runtime.json')
  const current = readRuntime(runtimePath)
  const currentRaw = typeof current.lastNotifiedCheckpointRaw === 'string' ? current.lastNotifiedCheckpointRaw : null
  const currentSig = typeof current.lastNotifiedCheckpointSignature === 'string' ? current.lastNotifiedCheckpointSignature : null
  const checkpointRaw = input.checkpoint.raw?.trim() || ''
  const sessionKey = input.notifySessionKey?.trim() || (typeof current.notifySessionKey === 'string' && current.notifySessionKey.trim()) || MAIN_SESSION_KEY

  // Build a checkpoint signature that includes state + status + raw + result, so dedupe
  // doesn't suppress a notification when raw text is empty/recycled but the semantic
  // state actually changed (e.g. worker went executing -> done with same scraped raw).
  const checkpointSignature = [
    input.checkpoint.stateLabel,
    input.checkpoint.checkpointStatus ?? '',
    input.checkpoint.result ?? '',
    input.checkpoint.blocker ?? '',
    input.checkpoint.nextAction ?? '',
    checkpointRaw,
  ].join('|')

  if (currentSig && currentSig === checkpointSignature) {
    return { published: false, sessionKey, route: 'noop' }
  }
  // Backwards-compat: if no signature was ever stored but raw matches AND nothing else
  // could have changed (raw is non-empty + state matches a 'no progress' shape), still skip.
  // Otherwise, fall through and publish.
  if (!currentSig && checkpointRaw && currentRaw === checkpointRaw && (input.checkpoint.stateLabel === 'IN_PROGRESS' || !input.checkpoint.stateLabel)) {
    return { published: false, sessionKey, route: 'noop' }
  }

  const headline = `[${input.workerId}] ${input.checkpoint.stateLabel}`
  const text = [
    headline,
    input.missionId ? `Mission: ${input.missionId}` : null,
    checkpointSummary(input.checkpoint),
  ].filter(Boolean).join(' — ')

  // 1. Route to orchestrator (swarm3) by default.
  const orchestratorResult = publishCheckpointToOrchestrator({
    workerId: input.workerId,
    checkpoint: input.checkpoint,
    missionId: input.missionId,
  })

  // 2. Escalate to the main agent only on NEEDS_INPUT, or when the orchestrator is unreachable.
  const mustEscalate = shouldEscalateToMain(input.checkpoint.stateLabel) || (!orchestratorResult.sent && !orchestratorResult.skippedSelf)
  let publishedToMain = false

  if (mustEscalate) {
    publishChatEvent('message', {
      type: 'message',
      sessionKey,
      transport: 'chat-events',
      message: {
        role: 'assistant',
        timestamp: Date.now(),
        content: [{ type: 'text', text }],
        details: {
          source: 'swarm-checkpoint',
          workerId: input.workerId,
          missionId: input.missionId ?? null,
          assignmentId: input.assignmentId ?? null,
          checkpointState: input.checkpoint.stateLabel,
          escalationReason: shouldEscalateToMain(input.checkpoint.stateLabel)
            ? `state ${input.checkpoint.stateLabel} requires main-agent input`
            : `orchestrator unreachable: ${orchestratorResult.error ?? 'unknown'}`,
        },
      },
    })
    publishChatStatus(sessionKey, text)
    publishedToMain = true
  }

  writeRuntime(runtimePath, {
    ...current,
    notifySessionKey: sessionKey,
    lastNotifiedCheckpointRaw: checkpointRaw || null,
    lastNotifiedCheckpointSignature: checkpointSignature,
    lastNotifiedAt: new Date().toISOString(),
    lastCheckpointRoute: publishedToMain ? 'main' : 'orchestrator',
    lastOrchestratorSendOk: orchestratorResult.sent,
  })

  const route: 'orchestrator' | 'main' | 'noop' = publishedToMain ? 'main' : (orchestratorResult.sent || orchestratorResult.skippedSelf ? 'orchestrator' : 'noop')
  return { published: publishedToMain || orchestratorResult.sent, sessionKey, route, orchestrator: orchestratorResult }
}
