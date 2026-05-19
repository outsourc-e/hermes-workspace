import { existsSync, readFileSync } from 'node:fs'

export type ParsedSwarmCheckpoint = {
  stateLabel: 'DONE' | 'BLOCKED' | 'NEEDS_INPUT' | 'HANDOFF' | 'IN_PROGRESS'
  runtimeState: 'idle' | 'blocked' | 'waiting' | 'executing'
  checkpointStatus: 'done' | 'blocked' | 'needs_input' | 'handoff' | 'in_progress'
  filesChanged: string | null
  commandsRun: string | null
  result: string | null
  blocker: string | null
  nextAction: string | null
  raw: string
}

const LABELS = ['STATE', 'FILES_CHANGED', 'COMMANDS_RUN', 'RESULT', 'BLOCKER', 'NEXT_ACTION'] as const

type Label = typeof LABELS[number]

const STATE_MAP: Record<ParsedSwarmCheckpoint['stateLabel'], Pick<ParsedSwarmCheckpoint, 'runtimeState' | 'checkpointStatus'>> = {
  DONE: { runtimeState: 'idle', checkpointStatus: 'done' },
  BLOCKED: { runtimeState: 'blocked', checkpointStatus: 'blocked' },
  NEEDS_INPUT: { runtimeState: 'waiting', checkpointStatus: 'needs_input' },
  HANDOFF: { runtimeState: 'idle', checkpointStatus: 'handoff' },
  IN_PROGRESS: { runtimeState: 'executing', checkpointStatus: 'in_progress' },
}

function normalizeLabel(value: string): Label | null {
  const upper = value.trim().toUpperCase().replace(/[ -]/g, '_')
  return (LABELS as readonly string[]).includes(upper) ? upper as Label : null
}

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  return trimmed.replace(/^none$/i, 'none')
}

export function parseSwarmCheckpoint(text: string): ParsedSwarmCheckpoint | null {
  if (!/\bSTATE\s*:/i.test(text)) return null
  const fields: Partial<Record<Label, string>> = {}
  let current: Label | null = null
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  for (const line of lines) {
    // Handle both plain (STATE:) and bold markdown (**STATE:**) formats.
    // Strip Markdown bold markers so the label always sits at start-of-value
    // position regardless of formatting.
    const cleanLine = line.replace(/\*\*/g, '')
    const match = cleanLine.match(/^\s*([A-Z_ -]{3,24})\s*:\s*(.*)$/i)
    const label = match ? normalizeLabel(match[1]) : null
    if (label) {
      current = label
      fields[current] = match?.[2] ?? ''
      continue
    }
    if (current) fields[current] = `${fields[current] ?? ''}\n${line}`
  }

  for (const label of LABELS) {
    if (!(label in fields)) return null
  }
  const stateRaw = clean(fields.STATE)?.toUpperCase().split(/\s+/)[0]
  if (!stateRaw || !(stateRaw in STATE_MAP)) return null
  const stateLabel = stateRaw as ParsedSwarmCheckpoint['stateLabel']
  const mapped = STATE_MAP[stateLabel]

  return {
    stateLabel,
    runtimeState: mapped.runtimeState,
    checkpointStatus: mapped.checkpointStatus,
    filesChanged: clean(fields.FILES_CHANGED),
    commandsRun: clean(fields.COMMANDS_RUN),
    result: clean(fields.RESULT),
    blocker: clean(fields.BLOCKER),
    nextAction: clean(fields.NEXT_ACTION),
    raw: text.trim(),
  }
}

export function newestCheckpointFromMessages(messages: Array<{ role?: string; content: string; timestamp?: number | null }>): ParsedSwarmCheckpoint | null {
  for (const message of [...messages].reverse()) {
    if (message.role && message.role !== 'assistant') continue
    const parsed = parseSwarmCheckpoint(message.content)
    if (parsed) return parsed
  }
  return null
}

export function readRuntimeJson(runtimePath: string): Record<string, unknown> {
  if (!existsSync(runtimePath)) return {}
  try {
    return JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}
