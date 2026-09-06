/**
 * GET /api/projects/list
 *
 * Returns GitHub repo dashboard data for each repo in HUD_TRACKED_REPOS env.
 * Uses gh CLI for all GitHub operations (already installed + authed on VM).
 * 5-min disk cache at /root/.hermes/hud-cache/projects.json
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { HUDCache } from '../../../server/hud/cache'

const execFileAsync = promisify(execFile)

const cache = new HUDCache()
const CACHE_KEY = 'projects'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min

export type RepoCIStatus = 'success' | 'failure' | 'cancelled' | 'unknown'

export interface RepoData {
  owner: string
  name: string
  openPRs: number
  prTitles: Array<string>
  latestCI: RepoCIStatus
  latestCIWorkflow?: string
  lastCommit?: {
    sha: string
    message: string
    date: string
    author: string
  }
}

function getTrackedRepos(): Array<string> {
  const env = process.env.HUD_TRACKED_REPOS ?? 'SPACEMAN1898/CliniTrack-Suite'
  return env
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
}

function isLocalRequest(request: Request): boolean {
  const maybeAddress = (request as unknown as { remoteAddress?: string })
    .remoteAddress
  const ip = (maybeAddress && maybeAddress.trim()) || '127.0.0.1'
  if (['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'].includes(ip))
    return true
  if (/^100\.\d+\.\d+\.\d+$/.test(ip)) return true
  if (/^192\.168\./.test(ip)) return true
  if (/^10\./.test(ip)) return true
  return false
}

async function fetchRepoData(fullName: string): Promise<RepoData> {
  const [owner, name] = fullName.split('/')
  const repo = `${owner}/${name}`

  const [prsResult, ciResult, commitResult] = await Promise.allSettled([
    execFileAsync('gh', [
      'pr',
      'list',
      '-R',
      repo,
      '--state',
      'open',
      '--json',
      'number,title,reviewDecision',
    ]),
    execFileAsync('gh', [
      'run',
      'list',
      '-R',
      repo,
      '--limit',
      '1',
      '--json',
      'conclusion,name',
    ]),
    execFileAsync('gh', [
      'api',
      `repos/${repo}/commits/HEAD`,
      '--jq',
      '{sha: .sha[0:7], message: .commit.message, date: .commit.author.date, author: .commit.author.name}',
    ]),
  ])

  // Parse PRs
  let openPRs = 0
  let prTitles: Array<string> = []
  if (prsResult.status === 'fulfilled') {
    try {
      const prs = JSON.parse(prsResult.value.stdout) as Array<{
        number: number
        title: string
      }>
      openPRs = prs.length
      prTitles = prs.slice(0, 3).map((p) => p.title)
    } catch {
      // leave defaults
    }
  }

  // Parse CI
  let latestCI: RepoCIStatus = 'unknown'
  let latestCIWorkflow: string | undefined
  if (ciResult.status === 'fulfilled') {
    try {
      const runs = JSON.parse(ciResult.value.stdout) as Array<{
        conclusion: string
        name: string
      }>
      if (runs.length > 0) {
        const run = runs[0]
        latestCIWorkflow = run.name
        const c = run.conclusion.toLowerCase()
        if (c === 'success') latestCI = 'success'
        else if (c === 'failure') latestCI = 'failure'
        else if (c === 'cancelled') latestCI = 'cancelled'
        else latestCI = 'unknown'
      }
    } catch {
      // leave defaults
    }
  }

  // Parse last commit
  let lastCommit: RepoData['lastCommit']
  if (commitResult.status === 'fulfilled') {
    try {
      lastCommit = JSON.parse(commitResult.value.stdout.trim())
    } catch {
      // leave undefined
    }
  }

  return {
    owner,
    name,
    openPRs,
    prTitles,
    latestCI,
    latestCIWorkflow,
    lastCommit,
  }
}

async function projectsListHandler({
  request,
}: {
  request: Request
}): Promise<Response> {
  if (!isAuthenticated(request) && !isLocalRequest(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Serve from cache if fresh
  try {
    const cached = await cache.get<Array<RepoData>>(CACHE_KEY)
    if (cached && !cached.isStale) {
      return new Response(
        JSON.stringify({ repos: cached.data, cachedAt: cached.fetchedAt }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        },
      )
    }
  } catch {
    // ignore cache errors
  }

  const repos = getTrackedRepos()
  const results = await Promise.allSettled(repos.map(fetchRepoData))

  const data: Array<RepoData> = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    const [owner, name] = (repos[i] ?? '/').split('/')
    return {
      owner,
      name,
      openPRs: 0,
      prTitles: [],
      latestCI: 'unknown' as RepoCIStatus,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    }
  })

  // Cache results
  try {
    await cache.set(CACHE_KEY, data, CACHE_TTL_MS)
  } catch {
    // ignore cache errors
  }

  return new Response(JSON.stringify({ repos: data, cachedAt: Date.now() }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

export const Route = createFileRoute('/api/projects/list')({
  server: {
    handlers: {
      GET: projectsListHandler,
    },
  },
})
