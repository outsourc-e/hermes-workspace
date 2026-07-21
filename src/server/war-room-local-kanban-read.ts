import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const LOCAL_KANBAN_TIMEOUT_MS = 3_000
const BOARD_SLUG_PATTERN = /^[a-z0-9_-]+$/i

export type LocalHermesKanbanTaskRow = {
  id: string
  title: string
  body?: string | null
  status?: string | null
  assignee?: string | null
  priority?: number | null
  created_at?: number | null
  started_at?: number | null
  completed_at?: number | null
  last_heartbeat_at?: number | null
  current_run_id?: number | null
  result?: string | null
  last_failure_error?: string | null
  current_run_status?: string | null
  current_run_started_at?: number | null
  current_run_ended_at?: number | null
  current_run_last_heartbeat_at?: number | null
  current_run_summary?: string | null
  current_run_metadata?: string | null
  current_run_error?: string | null
  latest_run_id?: number | null
  latest_run_status?: string | null
  latest_run_started_at?: number | null
  latest_run_ended_at?: number | null
  latest_run_last_heartbeat_at?: number | null
  latest_run_summary?: string | null
  latest_run_metadata?: string | null
  latest_run_error?: string | null
  parent_ids?: string | null
  child_ids?: string | null
  comment_excerpt?: string | null
}

function hermesRoot() {
  const configured = process.env.HERMES_HOME
  if (!configured) return path.join(homedir(), '.hermes')
  const directBoardRoot = path.join(configured, 'kanban')
  if (fs.existsSync(directBoardRoot) || fs.existsSync(path.join(configured, 'kanban.db'))) return configured
  const profileParentRoot = path.dirname(path.dirname(configured))
  if (path.basename(path.dirname(configured)) === 'profiles' && (fs.existsSync(path.join(profileParentRoot, 'kanban')) || fs.existsSync(path.join(profileParentRoot, 'kanban.db')))) {
    return profileParentRoot
  }
  return configured
}

export function localHermesKanbanDbPath(board: string): string {
  if (!BOARD_SLUG_PATTERN.test(board)) throw new Error('Invalid local Kanban board slug.')
  if (board === 'default') return path.join(hermesRoot(), 'kanban.db')
  return path.join(hermesRoot(), 'kanban', 'boards', board, 'kanban.db')
}

function sqliteQuoted(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function localReadQuery(limit: number) {
  const boundedLimit = Math.max(1, Math.min(25, Math.trunc(limit)))
  return `
    with latest_runs as (
      select tr.*
      from task_runs tr
      join (
        select task_id, max(id) as latest_run_id
        from task_runs
        group by task_id
      ) latest on latest.latest_run_id = tr.id
    )
    select
      t.id,
      t.title,
      t.body,
      t.status,
      t.assignee,
      t.priority,
      t.created_at,
      t.started_at,
      t.completed_at,
      t.last_heartbeat_at,
      t.current_run_id,
      t.result,
      t.last_failure_error,
      cr.status as current_run_status,
      cr.started_at as current_run_started_at,
      cr.ended_at as current_run_ended_at,
      cr.last_heartbeat_at as current_run_last_heartbeat_at,
      cr.summary as current_run_summary,
      cr.metadata as current_run_metadata,
      cr.error as current_run_error,
      lr.id as latest_run_id,
      lr.status as latest_run_status,
      lr.started_at as latest_run_started_at,
      lr.ended_at as latest_run_ended_at,
      lr.last_heartbeat_at as latest_run_last_heartbeat_at,
      lr.summary as latest_run_summary,
      lr.metadata as latest_run_metadata,
      lr.error as latest_run_error,
      (select group_concat(parent_id, ',') from task_links where child_id = t.id) as parent_ids,
      (select group_concat(child_id, ',') from task_links where parent_id = t.id) as child_ids,
      (select body from task_comments where task_id = t.id order by created_at desc limit 1) as comment_excerpt
    from tasks t
    left join task_runs cr on cr.id = t.current_run_id
    left join latest_runs lr on lr.task_id = t.id
    order by
      case t.status
        when 'running' then 0
        when 'blocked' then 1
        when 'ready' then 2
        when 'todo' then 3
        when 'triage' then 4
        else 5
      end,
      coalesce(t.last_heartbeat_at, t.started_at, t.completed_at, t.created_at) desc,
      t.priority desc,
      t.created_at desc
    limit ${sqliteQuoted(String(boundedLimit))};
  `
}

export async function readLocalHermesKanbanBoard(board: 'warroom', limit = 12): Promise<Array<LocalHermesKanbanTaskRow>> {
  const dbPath = localHermesKanbanDbPath(board)
  const { stdout } = await execFileAsync('sqlite3', ['-json', dbPath, localReadQuery(limit)], {
    encoding: 'utf8',
    timeout: LOCAL_KANBAN_TIMEOUT_MS,
    maxBuffer: 512 * 1024,
    shell: false,
  })
  const parsed = stdout.trim() ? JSON.parse(stdout) : []
  if (!Array.isArray(parsed)) throw new Error('Local Hermes Kanban read returned a non-array result.')
  return parsed.filter((row): row is LocalHermesKanbanTaskRow => typeof row?.id === 'string' && typeof row?.title === 'string')
}
