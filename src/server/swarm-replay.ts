/**
 * Session replay: full transcript of every dispatch, browsable later.
 *
 * finalizeDispatch appends one JSONL record (task, worker, full output,
 * checkpoint fields) to .runtime/swarm-replays.jsonl. The list view returns
 * light headers; the detail view returns the whole transcript. Capped by
 * rewrite, same pattern as outcome memory.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { SWARM_CANONICAL_REPO } from './swarm-environment'

export function replaysPath(): string {
  return (
    process.env.HERMES_SWARM_REPLAYS_PATH ||
    join(SWARM_CANONICAL_REPO, '.runtime', 'swarm-replays.jsonl')
  )
}

const MAX_RECORDS = 400
const COMPACT_THRESHOLD = MAX_RECORDS * 2
/** Full transcripts are big; keep each record bounded. */
const MAX_OUTPUT_CHARS = 60_000

export type SwarmReplayRecord = {
  id: string
  at: number
  workerId: string
  task: string
  ok: boolean
  durationMs: number
  mode: 'tmux' | 'oneshot'
  output: string
  checkpointState: string | null
  checkpointResult: string | null
}

export type SwarmReplayHeader = Omit<
  SwarmReplayRecord,
  'output' | 'checkpointResult'
> & { taskPreview: string }

function readAll(): Array<SwarmReplayRecord> {
  try {
    if (!existsSync(replaysPath())) return []
    return readFileSync(replaysPath(), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as SwarmReplayRecord
        } catch {
          return null
        }
      })
      .filter((r): r is SwarmReplayRecord => r !== null)
  } catch {
    return []
  }
}

export function saveReplay(
  record: Omit<SwarmReplayRecord, 'id' | 'at'>,
): string {
  const id = `rp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const full: SwarmReplayRecord = {
    ...record,
    id,
    at: Date.now(),
    task: record.task.slice(0, 4000),
    output: record.output.slice(-MAX_OUTPUT_CHARS),
    checkpointResult: record.checkpointResult?.slice(0, 8000) ?? null,
  }
  mkdirSync(dirname(replaysPath()), { recursive: true })
  appendFileSync(replaysPath(), `${JSON.stringify(full)}\n`)
  const lines = readAll()
  if (lines.length > COMPACT_THRESHOLD) {
    writeFileSync(
      replaysPath(),
      lines
        .slice(-MAX_RECORDS)
        .map((r) => JSON.stringify(r))
        .join('\n') + '\n',
    )
  }
  return id
}

export function listReplays(limit = 100): Array<SwarmReplayHeader> {
  return readAll()
    .slice(-limit)
    .reverse()
    .map(({ output: _o, checkpointResult: _c, ...rest }) => ({
      ...rest,
      taskPreview: rest.task.slice(0, 160),
    }))
}

export function getReplay(id: string): SwarmReplayRecord | null {
  return readAll().find((r) => r.id === id) ?? null
}
