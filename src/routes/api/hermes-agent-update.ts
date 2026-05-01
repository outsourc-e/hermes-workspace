import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
} from '../../server/rate-limit'

type AgentReleaseNotes = {
  name: 'agent'
  label: 'Hermes Agent'
  from: string | null
  to: string | null
  commits: Array<string>
}

function exec(
  command: string,
  args: Array<string>,
  options: { cwd?: string; timeout?: number } = {},
): string | null {
  try {
    return (
      execFileSync(command, args, {
        cwd: options.cwd ?? process.cwd(),
        encoding: 'utf8',
        timeout: options.timeout ?? 8_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim() || null
    )
  } catch {
    return null
  }
}

function execOrThrow(
  command: string,
  args: Array<string>,
  options: { cwd?: string; timeout?: number } = {},
): string {
  return execFileSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    timeout: options.timeout ?? 300_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function agentRepoPath(): string | null {
  const candidates = [
    process.env.HERMES_AGENT_REPO,
    join(homedir(), '.hermes', 'hermes-agent'),
    join(homedir(), 'hermes-agent'),
  ].filter(Boolean) as Array<string>

  for (const candidate of candidates) {
    try {
      const resolved = realpathSync(candidate)
      if (existsSync(join(resolved, '.git'))) return resolved
    } catch {
      // ignore
    }
  }
  return null
}

function git(args: Array<string>, cwd: string): string | null {
  return exec('git', args, { cwd })
}

function remoteUrlMatchesHermesAgent(url: string | null): boolean {
  if (!url) return false
  const normalized = url
    .toLowerCase()
    .replace(/^git@github\.com:/, 'github.com/')
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
  return normalized.includes('hermes-agent')
}

function readCommitMessages(
  repoPath: string,
  from: string | null,
  to: string | null,
): Array<string> {
  if (!from || !to || from === to) return []
  const raw = git(
    ['log', '--pretty=format:%s (%h)', `${from}..${to}`],
    repoPath,
  )
  return (
    raw
      ?.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 12) ?? []
  )
}

function readStatus() {
  const versionOutput = exec('hermes', ['--version'], { timeout: 10_000 })
  const repoPath = agentRepoPath()
  const hermesPath = exec('which', ['hermes'])
  const currentHead = repoPath ? git(['rev-parse', 'HEAD'], repoPath) : null
  const branch = repoPath
    ? git(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)
    : null
  const dirty = repoPath
    ? Boolean(git(['status', '--porcelain'], repoPath))
    : false
  const remoteUrl = repoPath
    ? git(['remote', 'get-url', 'origin'], repoPath)
    : null
  const repoMatches = remoteUrlMatchesHermesAgent(remoteUrl)
  const rawRemote =
    repoPath && repoMatches
      ? exec('git', ['ls-remote', remoteUrl || 'origin', 'HEAD'], {
          cwd: repoPath,
          timeout: 10_000,
        })
      : null
  const remoteHead = rawRemote?.split(/\s+/)[0] ?? null
  const updateAvailable = Boolean(
    repoPath &&
    repoMatches &&
    currentHead &&
    remoteHead &&
    currentHead !== remoteHead,
  )

  return {
    ok: true,
    checkedAt: Date.now(),
    app: {
      name: 'Hermes Agent',
      version: versionOutput?.split('\n')[0] ?? 'unknown',
      path: hermesPath,
      repoPath,
      branch,
      currentHead,
      dirty,
    },
    remote: {
      label: 'Hermes Agent',
      url: remoteUrl,
      repoMatches,
      currentHead,
      remoteHead,
      updateAvailable,
      canUpdate: Boolean(repoPath && repoMatches && !dirty),
      error: !repoPath
        ? 'Hermes Agent git checkout was not found. Run `hermes update` manually from your terminal.'
        : !repoMatches
          ? 'Hermes Agent origin remote does not look like a hermes-agent repository.'
          : dirty
            ? 'Hermes Agent checkout has local changes. Commit or stash before updating.'
            : null,
    },
    updateAvailable,
    manualCommand: 'hermes update',
  }
}

export const Route = createFileRoute('/api/hermes-agent-update')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json(readStatus())
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const ip = getClientIp(request)
        if (!rateLimit(`hermes-agent-update-post:${ip}`, 3, 60_000)) {
          return rateLimitResponse()
        }

        const before = readStatus()
        if (!before.remote.canUpdate || !before.app.repoPath) {
          return json(
            {
              ok: false,
              error:
                before.remote.error ||
                'Hermes Agent cannot be safely updated automatically.',
            },
            { status: 409 },
          )
        }

        try {
          const output = execOrThrow('hermes', ['update'], { timeout: 300_000 })
          const after = readStatus()
          const notes: AgentReleaseNotes | null = after.app.repoPath
            ? {
                name: 'agent',
                label: 'Hermes Agent',
                from: before.app.currentHead,
                to: after.app.currentHead,
                commits: readCommitMessages(
                  after.app.repoPath,
                  before.app.currentHead,
                  after.app.currentHead,
                ),
              }
            : null

          return json({
            ok: true,
            output,
            restartRequired: true,
            releaseNotes: notes ? [notes] : [],
            status: after,
          })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
