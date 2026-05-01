import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, join } from 'node:path'
import { isAuthenticated } from '../../server/auth-middleware'
import { getProfilesDir } from '../../server/claude-paths'

type PreviewSource = 'runtime' | 'script-port' | 'none'

type ProjectResponse = {
  workerId: string
  cwd: string | null
  projectName: string | null
  branch: string | null
  changedFiles: Array<string>
  previewUrls: Array<string>
  packageScripts: Array<string>
  previewSource: PreviewSource
  fetchedAt: number
  error?: string
}

const PORT_CANDIDATES = [
  3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007,
  5173, 5174, 5175, 5176, 5177,
  8000, 8080, 8888, 4173,
]

function isValidWorkerId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)
}

type RuntimeMeta = {
  cwd: string | null
  previewUrls: Array<string>
  previewPort: number | null
}

function readRuntimeMeta(profilePath: string): RuntimeMeta {
  const file = join(profilePath, 'runtime.json')
  if (!existsSync(file)) return { cwd: null, previewUrls: [], previewPort: null }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>
    const cwd = typeof raw.cwd === 'string' ? raw.cwd : null
    const previewUrls = Array.isArray(raw.previewUrls)
      ? raw.previewUrls.filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0,
        )
      : []
    const previewPort =
      typeof raw.previewPort === 'number' &&
      Number.isInteger(raw.previewPort) &&
      raw.previewPort > 0
        ? raw.previewPort
        : null
    return {
      cwd: cwd && existsSync(cwd) ? cwd : null,
      previewUrls,
      previewPort,
    }
  } catch {
    return { cwd: null, previewUrls: [], previewPort: null }
  }
}

function gitBranch(cwd: string): string | null {
  try {
    const out = execFileSync(
      'git',
      ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'],
      { encoding: 'utf-8', timeout: 1500 },
    )
    const branch = out.trim()
    return branch && branch !== 'HEAD' ? branch : null
  } catch {
    return null
  }
}

function gitChangedFiles(cwd: string, max = 25): Array<string> {
  try {
    const out = execFileSync('git', ['-C', cwd, 'status', '--porcelain'], {
      encoding: 'utf-8',
      timeout: 2000,
    })
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, max)
      .map((line) => {
        const m = line.match(/^[A-Z?! ]{1,2}\s+(.+)$/)
        return m ? m[1].replace(/^"|"$/g, '') : line
      })
  } catch {
    return []
  }
}

type PackageScripts = {
  scriptNames: Array<string>
  scripts: Record<string, string> | undefined
}

function readPackageScripts(cwd: string): PackageScripts {
  const file = join(cwd, 'package.json')
  if (!existsSync(file)) return { scriptNames: [], scripts: undefined }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as {
      scripts?: Record<string, string>
    }
    return {
      scriptNames: raw.scripts ? Object.keys(raw.scripts) : [],
      scripts: raw.scripts,
    }
  } catch {
    return { scriptNames: [], scripts: undefined }
  }
}

async function probePort(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      resolve(false)
    }, timeoutMs)
    fetch(`http://127.0.0.1:${port}/`, {
      signal: controller.signal,
      method: 'HEAD',
    })
      .then(() => {
        clearTimeout(timer)
        resolve(true)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(false)
      })
  })
}

function normalizePathForCompare(value: string): string {
  try {
    return realpathSync(value)
  } catch {
    return value
  }
}

function listenerPidsForPort(port: number): Array<number> {
  try {
    const out = execFileSync(
      'lsof',
      ['-nP', '-sTCP:LISTEN', `-iTCP:${port}`, '-F', 'p'],
      { encoding: 'utf-8', timeout: 800 },
    )
    const pids = new Set<number>()
    for (const line of out.split('\n')) {
      if (!line.startsWith('p')) continue
      const n = parseInt(line.slice(1), 10)
      if (Number.isFinite(n) && n > 0) pids.add(n)
    }
    return [...pids]
  } catch {
    return []
  }
}

function cwdForPid(pid: number): string | null {
  try {
    const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-F', 'n'], {
      encoding: 'utf-8',
      timeout: 800,
    })
    for (const line of out.split('\n')) {
      if (line.startsWith('n')) return line.slice(1).trim() || null
    }
    return null
  } catch {
    return null
  }
}

function portMatchesWorkerCwd(port: number, workerCwd: string): boolean {
  const wanted = normalizePathForCompare(workerCwd)
  const pids = listenerPidsForPort(port)
  for (const pid of pids) {
    const owner = cwdForPid(pid)
    if (!owner) continue
    const ownerNorm = normalizePathForCompare(owner)
    if (ownerNorm === wanted) return true
    if (ownerNorm.startsWith(wanted + '/')) return true
    if (wanted.startsWith(ownerNorm + '/')) return true
  }
  return false
}

function parsePortFromDevScript(scripts: Record<string, string> | undefined): number | null {
  if (!scripts) return null
  const candidates = ['dev', 'start:dev', 'start']
  for (const key of candidates) {
    const value = scripts[key]
    if (typeof value !== 'string') continue
    const flag = value.match(/--port[\s=](\d{2,5})/)
    if (flag && flag[1]) {
      const n = parseInt(flag[1], 10)
      if (Number.isFinite(n) && n > 0) return n
    }
    const env = value.match(/\bPORT=(\d{2,5})\b/)
    if (env && env[1]) {
      const n = parseInt(env[1], 10)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

type PreviewMatch = {
  urls: Array<string>
  source: 'script-port' | 'none'
}

async function detectPreviewUrls(
  cwd: string,
  scripts: Record<string, string> | undefined,
): Promise<PreviewMatch> {
  const hasPackageJson = existsSync(join(cwd, 'package.json'))
  const hasVite = existsSync(join(cwd, 'vite.config.ts'))
  const hasSrc = existsSync(join(cwd, 'src'))

  if (!(hasPackageJson && (hasVite || hasSrc))) {
    return { urls: [], source: 'none' }
  }

  // 1. If the dev script declares a port, only accept that port if the
  //    listener's cwd matches the worker's cwd.
  const scriptPort = parsePortFromDevScript(scripts)
  if (scriptPort) {
    if (await probePort(scriptPort)) {
      if (portMatchesWorkerCwd(scriptPort, cwd)) {
        return { urls: [`http://localhost:${scriptPort}`], source: 'script-port' }
      }
    }
  }

  // 2. No explicit per-worker preview signal. Do not guess based on a generic
  //    cwd-owned dev server, because that causes false positives like showing
  //    the workspace app (3002) for agents that are not actually exposing a
  //    meaningful preview surface. Cards should stay on "No preview" until
  //    the worker publishes one explicitly.
  return { urls: [], source: 'none' }
}

async function buildProject(workerId: string): Promise<ProjectResponse> {
  const profilePath = join(getProfilesDir(), workerId)
  const runtime = readRuntimeMeta(profilePath)
  const cwd = runtime.cwd
  if (!cwd) {
    return {
      workerId,
      cwd: null,
      projectName: null,
      branch: null,
      changedFiles: [],
      previewUrls: [],
      packageScripts: [],
      previewSource: 'none',
      fetchedAt: Date.now(),
      error: 'cwd missing in runtime.json or path no longer exists',
    }
  }
  const projectName = basename(cwd)
  const branch = gitBranch(cwd)
  const changedFiles = gitChangedFiles(cwd)
  const pkg = readPackageScripts(cwd)

  let previewUrls: Array<string> = []
  let previewSource: PreviewSource = 'none'

  if (runtime.previewUrls.length > 0) {
    previewUrls = runtime.previewUrls
    previewSource = 'runtime'
  } else if (runtime.previewPort) {
    if (
      (await probePort(runtime.previewPort)) &&
      portMatchesWorkerCwd(runtime.previewPort, cwd)
    ) {
      previewUrls = [`http://localhost:${runtime.previewPort}`]
      previewSource = 'runtime'
    }
  }

  if (previewUrls.length === 0) {
    const detected = await detectPreviewUrls(cwd, pkg.scripts)
    previewUrls = detected.urls
    previewSource = detected.source
  }

  return {
    workerId,
    cwd,
    projectName,
    branch,
    changedFiles,
    previewUrls,
    packageScripts: pkg.scriptNames,
    previewSource,
    fetchedAt: Date.now(),
  }
}

export const Route = createFileRoute('/api/swarm-project')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const workerIdRaw = (url.searchParams.get('workerId') ?? '').trim()
        if (!workerIdRaw || !isValidWorkerId(workerIdRaw)) {
          return json({ error: 'workerId required' }, { status: 400 })
        }
        const result = await buildProject(workerIdRaw)
        return json(result)
      },
    },
  },
})
