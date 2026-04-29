import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'
import { getSwarmProfilePath } from './swarm-foundation'
import { publishChatEvent } from './chat-event-bus'

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

export function publishSwarmCheckpointNotification(input: {
  workerId: string
  checkpoint: ParsedSwarmCheckpoint
  missionId?: string | null
  assignmentId?: string | null
  notifySessionKey?: string | null
}): { published: boolean; sessionKey: string } {
  const profilePath = getSwarmProfilePath(input.workerId)
  const runtimePath = join(profilePath, 'runtime.json')
  const current = readRuntime(runtimePath)
  const currentRaw = typeof current.lastNotifiedCheckpointRaw === 'string' ? current.lastNotifiedCheckpointRaw : null
  const checkpointRaw = input.checkpoint.raw?.trim() || ''
  const sessionKey = input.notifySessionKey?.trim() || (typeof current.notifySessionKey === 'string' && current.notifySessionKey.trim()) || 'main'

  if (checkpointRaw && currentRaw === checkpointRaw) {
    return { published: false, sessionKey }
  }

  const headline = `[${input.workerId}] ${input.checkpoint.stateLabel}`
  const text = [
    headline,
    input.missionId ? `Mission: ${input.missionId}` : null,
    checkpointSummary(input.checkpoint),
  ].filter(Boolean).join(' — ')

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
      },
    },
  })

  publishChatEvent('status', {
    type: 'status',
    sessionKey,
    transport: 'chat-events',
    text,
  })

  writeRuntime(runtimePath, {
    ...current,
    notifySessionKey: sessionKey,
    lastNotifiedCheckpointRaw: checkpointRaw || null,
    lastNotifiedAt: new Date().toISOString(),
  })

  return { published: true, sessionKey }
}
