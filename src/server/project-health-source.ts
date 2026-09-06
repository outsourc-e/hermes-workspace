/**
 * SSH into the home PC and walk the CliniTrack-Suite worktrees to
 * surface per-worktree git state and (best-effort) PR counts on the
 * Workspace dashboard.
 *
 * One SSH invocation runs a small remote shell script that loops over
 * every direct subdir under `/home/.../active/CliniTrack`, calls
 * `git status --porcelain`, `git rev-parse`, `git rev-list`, and an
 * optional `gh pr list`. Each worktree's data is emitted as a single
 * `JSON__<...>` line so the local parser can tolerate stderr noise
 * from gh / git interleaved with the data lines.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile) as (
  file: string,
  args: ReadonlyArray<string>,
  options: { input?: string; timeout?: number; maxBuffer?: number },
) => Promise<{ stdout: string; stderr: string }>

export type WorktreeHealth = {
  name: string
  branch: string | null
  dirtyCount: number
  ahead: number | null
  behind: number | null
  lastCommit: string | null
  lastCommitAt: string | null
  /** PR count from `gh pr list` if gh was available, else null. */
  prCount: number | null
}

export type ProjectHealthSnapshot = {
  project: string
  host: string
  rootPath: string
  fetchedAt: string
  worktrees: Array<WorktreeHealth>
  totalDirty: number
  totalPrs: number | null
  /** When the SSH command failed entirely; UI surfaces this. */
  error: string | null
}

export type ProjectHealthOptions = {
  host?: string
  user?: string
  identityFile?: string
  rootPath?: string
  projectName?: string
  /** Hard timeout for the ssh child process, in ms. */
  timeoutMs?: number
}

const DEFAULTS: Required<Omit<ProjectHealthOptions, 'timeoutMs'>> & {
  timeoutMs: number
} = {
  host: '100.92.120.31',
  user: 'nick-weiland-oc381816',
  identityFile: '/root/.ssh/home_pc_key',
  rootPath: '/home/nick-weiland-oc381816/Projects/Praxentis/active/CliniTrack',
  projectName: 'CliniTrack-Suite',
  timeoutMs: 12_000,
}

/**
 * Remote shell script. Kept inline so deployment doesn't need to ship
 * a sidecar. Uses single quotes only for the outer SSH wrapper; the
 * script body uses double quotes for paths and unquoted vars.
 */
const REMOTE_SCRIPT = `set -u
root="$ROOT_PATH"
if [ ! -d "$root" ]; then
  printf 'JSON__ROOT_MISSING %s\\n' "$root"
  exit 0
fi
have_gh=0
if command -v gh >/dev/null 2>&1; then have_gh=1; fi
for d in "$root"/*/; do
  [ -d "$d/.git" ] || [ -f "$d/.git" ] || continue
  name=$(basename "$d")
  cd "$d" || continue
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  ahead=""
  behind=""
  if [ -n "$branch" ] && git rev-parse --abbrev-ref "@{u}" >/dev/null 2>&1; then
    counts=$(git rev-list --left-right --count "@{u}...HEAD" 2>/dev/null || echo "")
    if [ -n "$counts" ]; then
      behind=$(printf '%s' "$counts" | awk '{print $1}')
      ahead=$(printf '%s' "$counts" | awk '{print $2}')
    fi
  fi
  last_subj=$(git log -1 --pretty=%s 2>/dev/null || echo "")
  last_date=$(git log -1 --pretty=%cI 2>/dev/null || echo "")
  pr_count=""
  if [ "$have_gh" = "1" ]; then
    pr_count=$(gh pr list --state open --limit 100 --json number 2>/dev/null | tr -d '\\n' | awk -F'"number"' '{print NF-1}')
  fi
  # Emit one JSON-ish line. We encode field-by-field with sentinels to
  # dodge needing jq on the remote.
  printf 'JSON__WT name=%s|branch=%s|dirty=%s|ahead=%s|behind=%s|last_subj=%s|last_date=%s|pr_count=%s\\n' \\
    "$name" "$branch" "$dirty" "$ahead" "$behind" "$last_subj" "$last_date" "$pr_count"
done
`

function parseRecord(line: string): WorktreeHealth | null {
  // Line format: JSON__WT key=value|key=value|...
  const m = line.match(/^JSON__WT\s+(.*)$/)
  if (!m) return null
  const fields = new Map<string, string>()
  for (const pair of m[1].split('|')) {
    const idx = pair.indexOf('=')
    if (idx === -1) continue
    fields.set(pair.slice(0, idx), pair.slice(idx + 1))
  }
  const name = fields.get('name') ?? ''
  if (!name) return null
  const numOrNull = (key: string): number | null => {
    const raw = fields.get(key)
    if (!raw || raw === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const dirty = numOrNull('dirty') ?? 0
  return {
    name,
    branch: fields.get('branch') || null,
    dirtyCount: dirty,
    ahead: numOrNull('ahead'),
    behind: numOrNull('behind'),
    lastCommit: fields.get('last_subj') || null,
    lastCommitAt: fields.get('last_date') || null,
    prCount: numOrNull('pr_count'),
  }
}

export async function readProjectHealth(
  options: ProjectHealthOptions = {},
): Promise<ProjectHealthSnapshot> {
  const opts = { ...DEFAULTS, ...options }
  const sshTarget = `${opts.user}@${opts.host}`
  const args = [
    '-i',
    opts.identityFile,
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    `ConnectTimeout=${Math.max(2, Math.floor(opts.timeoutMs / 2000))}`,
    sshTarget,
    `ROOT_PATH=${JSON.stringify(opts.rootPath)} bash -s`,
  ]

  const fetchedAt = new Date().toISOString()
  let stdout = ''
  let error: string | null = null
  try {
    const result = await execFileAsync('ssh', args, {
      timeout: opts.timeoutMs,
      input: REMOTE_SCRIPT,
      maxBuffer: 1024 * 1024,
    })
    stdout = result.stdout
  } catch (err: unknown) {
    // exec timeout / non-zero exit / ssh failure all land here.
    const e = err as { stdout?: string; stderr?: string; message?: string }
    stdout = typeof e.stdout === 'string' ? e.stdout : ''
    const stderr = typeof e.stderr === 'string' ? e.stderr.trim() : ''
    error =
      stderr || (typeof e.message === 'string' ? e.message : 'ssh exec failed')
  }

  if (stdout.includes('JSON__ROOT_MISSING')) {
    return {
      project: opts.projectName,
      host: opts.host,
      rootPath: opts.rootPath,
      fetchedAt,
      worktrees: [],
      totalDirty: 0,
      totalPrs: null,
      error: `root path missing on host: ${opts.rootPath}`,
    }
  }

  const worktrees: Array<WorktreeHealth> = []
  for (const line of stdout.split('\n')) {
    const rec = parseRecord(line.trim())
    if (rec) worktrees.push(rec)
  }
  worktrees.sort((a, b) => a.name.localeCompare(b.name))

  let totalDirty = 0
  let totalPrsAccum = 0
  let sawPrs = false
  for (const w of worktrees) {
    totalDirty += w.dirtyCount
    if (w.prCount !== null) {
      totalPrsAccum += w.prCount
      sawPrs = true
    }
  }

  return {
    project: opts.projectName,
    host: opts.host,
    rootPath: opts.rootPath,
    fetchedAt,
    worktrees,
    totalDirty,
    totalPrs: sawPrs ? totalPrsAccum : null,
    error: worktrees.length === 0 ? error : null,
  }
}

// Re-export defaults so the API route can avoid duplicating them.
export const PROJECT_HEALTH_DEFAULTS = DEFAULTS
