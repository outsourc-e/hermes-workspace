import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
} from '../../server/rate-limit'

type RemoteName = 'origin' | 'upstream'
type UpdateTarget = RemoteName | 'all'

type RemoteStatus = {
  name: RemoteName
  label: string
  url: string | null
  expectedRepo: string
  expectedAliases: Array<string>
  repoMatches: boolean
  remoteHead: string | null
  currentHead: string | null
  updateAvailable: boolean
  autoUpdateSupported: boolean
  error: string | null
}

type RemoteDefinition = {
  name: RemoteName
  label: string
  expectedRepo: string
  aliases: Array<string>
}

type ReleaseNoteSection = {
  name: RemoteName
  label: string
  from: string | null
  to: string | null
  commits: Array<string>
}

type UpdateResult = {
  ok: boolean
  updated: Array<RemoteName>
  skipped: Array<{ name: RemoteName; reason: string }>
  restartRequired: boolean
  output: string
  releaseNotes: Array<ReleaseNoteSection>
  error?: string
}

export const UPDATE_REMOTE_DEFINITIONS: Array<RemoteDefinition> = [
  {
    name: 'origin',
    label: 'Hermes Workspace',
    expectedRepo: 'hermes-workspace',
    aliases: ['hermes-workspace', 'outsourc-e/hermes-workspace'],
  },
  {
    name: 'upstream',
    label: 'Hermes Agent',
    expectedRepo: 'hermes-agent',
    aliases: ['hermes-agent', 'NousResearch/hermes-agent'],
  },
]

function git(args: string[], timeout = 5000): string | null {
  try {
    return (
      execFileSync('git', args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout,
      }).trim() || null
    )
  } catch {
    return null
  }
}

function execOrThrow(
  command: string,
  args: string[],
  timeout = 30_000,
): string {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function gitOrThrow(args: string[], timeout = 30_000): string {
  return execOrThrow('git', args, timeout)
}

function pkgVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function remoteUrlMatchesExpectedRepo(
  url: string | null,
  aliases: Array<string>,
): boolean {
  if (!url) return false
  const normalizedUrl = url
    .toLowerCase()
    .replace(/^git@github\.com:/, 'github.com/')
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
  return aliases.some((alias) =>
    normalizedUrl.includes(alias.toLowerCase().replace(/\.git$/, '')),
  )
}

export function createRemoteStatus(input: {
  name: RemoteName
  label: string
  expectedRepo: string
  aliases: Array<string>
  url: string | null
  currentHead: string | null
  remoteHead: string | null
  lsRemoteFailed?: boolean
}): RemoteStatus {
  const repoMatches = remoteUrlMatchesExpectedRepo(input.url, input.aliases)
  let error: string | null = null
  if (!input.url) {
    error = 'Remote is not configured.'
  } else if (!repoMatches) {
    error = `Remote URL does not match expected ${input.expectedRepo} repo.`
  } else if (!input.remoteHead || input.lsRemoteFailed) {
    error = 'Unable to read remote HEAD.'
  }

  const changed = Boolean(
    repoMatches &&
    input.currentHead &&
    input.remoteHead &&
    input.currentHead !== input.remoteHead,
  )
  const autoUpdateSupported = input.name === 'origin'

  return {
    name: input.name,
    label: input.label,
    url: input.url,
    expectedRepo: input.expectedRepo,
    expectedAliases: input.aliases,
    repoMatches,
    remoteHead: repoMatches ? input.remoteHead : null,
    currentHead: input.currentHead,
    updateAvailable: changed && autoUpdateSupported,
    autoUpdateSupported,
    error:
      !autoUpdateSupported && changed
        ? 'Upstream Hermes Agent changes require a manual sync/rebase; one-click fast-forward is disabled for this remote.'
        : error,
  }
}

function remoteStatus(
  definition: RemoteDefinition,
  currentHead: string | null,
): RemoteStatus {
  const url = git(['remote', 'get-url', definition.name])
  const repoMatches = remoteUrlMatchesExpectedRepo(url, definition.aliases)
  let remoteHead: string | null = null
  let lsRemoteFailed = false

  if (url && repoMatches) {
    const raw = git(['ls-remote', url, 'HEAD'], 8000)
    remoteHead = raw?.split(/\s+/)[0] ?? null
    lsRemoteFailed = !remoteHead
  }

  return createRemoteStatus({
    name: definition.name,
    label: definition.label,
    expectedRepo: definition.expectedRepo,
    aliases: definition.aliases,
    url,
    currentHead,
    remoteHead,
    lsRemoteFailed,
  })
}

export function normalizeUpdateTarget(value: unknown): UpdateTarget {
  return value === 'origin' || value === 'upstream' || value === 'all'
    ? value
    : 'origin'
}

function selectedDefinitions(target: UpdateTarget): Array<RemoteDefinition> {
  if (target === 'all') return UPDATE_REMOTE_DEFINITIONS
  return UPDATE_REMOTE_DEFINITIONS.filter(
    (definition) => definition.name === target,
  )
}

async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  return request.json().catch(() => ({})) as Promise<Record<string, unknown>>
}

function readCommitMessages(
  from: string | null,
  to: string | null,
): Array<string> {
  if (!from || !to || from === to) return []
  const raw = git(['log', '--pretty=format:%s (%h)', `${from}..${to}`], 10_000)
  return (
    raw
      ?.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 12) ?? []
  )
}

function applyFastForwardUpdate(target: UpdateTarget): UpdateResult {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || 'main'
  const startHead = git(['rev-parse', 'HEAD'])
  const currentHead = startHead
  const dirty = Boolean(git(['status', '--porcelain']))

  if (dirty) {
    return {
      ok: false,
      updated: [],
      skipped: [],
      restartRequired: false,
      output: '',
      releaseNotes: [],
      error:
        'Working tree has local changes. Commit, stash, or discard them before updating.',
    }
  }

  const updated: Array<RemoteName> = []
  const skipped: UpdateResult['skipped'] = []
  const output: Array<string> = []
  const releaseNotes: Array<ReleaseNoteSection> = []

  for (const definition of selectedDefinitions(target)) {
    const status = remoteStatus(definition, currentHead)
    if (!status.repoMatches) {
      skipped.push({
        name: definition.name,
        reason: status.error || 'Remote does not match expected repo.',
      })
      continue
    }
    if (!status.updateAvailable) {
      skipped.push({
        name: definition.name,
        reason: status.error || 'Already up to date.',
      })
      continue
    }

    const ref = definition.name === 'origin' ? branch : 'HEAD'
    const beforeMergeHead = git(['rev-parse', 'HEAD'])
    output.push(`Fetching ${definition.name}...`)
    output.push(gitOrThrow(['fetch', definition.name], 60_000))

    if (definition.name !== 'origin') {
      skipped.push({
        name: definition.name,
        reason:
          'Manual upstream sync required. Hermes Agent upstream is not applied with one-click Workspace updates.',
      })
      continue
    }

    const remoteRef = `${definition.name}/${ref}`
    const canFastForward = execFileSync(
      'git',
      ['merge-base', '--is-ancestor', 'HEAD', remoteRef],
      {
        cwd: process.cwd(),
        stdio: 'ignore',
      },
    )
    void canFastForward

    output.push(`Fast-forwarding from ${remoteRef}...`)
    output.push(gitOrThrow(['merge', '--ff-only', remoteRef], 60_000))
    const afterMergeHead = git(['rev-parse', 'HEAD'])
    updated.push(definition.name)
    releaseNotes.push({
      name: definition.name,
      label: definition.label,
      from: beforeMergeHead,
      to: afterMergeHead,
      commits: readCommitMessages(beforeMergeHead, afterMergeHead),
    })
  }

  if (updated.length > 0) {
    const endHead = git(['rev-parse', 'HEAD'])
    const changedFiles =
      startHead && endHead
        ? (git(['diff', '--name-only', startHead, endHead], 10_000)
            ?.split('\n')
            .filter(Boolean) ?? [])
        : []
    const dependenciesChanged = changedFiles.some(
      (file) => file === 'package.json' || file === 'pnpm-lock.yaml',
    )
    const shouldVerifyBuild = changedFiles.some(
      (file) =>
        file.startsWith('src/') ||
        file.startsWith('scripts/') ||
        file === 'package.json' ||
        file === 'pnpm-lock.yaml' ||
        file.startsWith('vite') ||
        file.startsWith('tsconfig'),
    )

    if (dependenciesChanged) {
      output.push('Installing updated dependencies...')
      output.push(
        execOrThrow('pnpm', ['install', '--no-frozen-lockfile'], 180_000),
      )
    }

    if (shouldVerifyBuild) {
      output.push('Verifying updated Workspace build...')
      output.push(execOrThrow('pnpm', ['build'], 240_000))
    }
  }

  return {
    ok: true,
    updated,
    skipped,
    restartRequired: updated.length > 0,
    output: output.filter(Boolean).join('\n'),
    releaseNotes,
  }
}

export const Route = createFileRoute('/api/claude-update')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const currentHead = git(['rev-parse', 'HEAD'])
        const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
        const dirty = Boolean(git(['status', '--porcelain']))
        const remotes = UPDATE_REMOTE_DEFINITIONS.map((definition) =>
          remoteStatus(definition, currentHead),
        )

        return json({
          ok: true,
          checkedAt: Date.now(),
          app: {
            name: 'Hermes Workspace',
            version: pkgVersion(),
            branch,
            currentHead,
            dirty,
          },
          remotes,
          updateAvailable: remotes.some((remote) => remote.updateAvailable),
          manualConfirmRequired: true,
        })
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const ip = getClientIp(request)
        if (!rateLimit(`claude-update-post:${ip}`, 5, 60_000)) {
          return rateLimitResponse()
        }

        try {
          const body = await readJsonBody(request)
          const target = normalizeUpdateTarget(body.target)
          const result = applyFastForwardUpdate(target)
          return json(result, { status: result.ok ? 200 : 409 })
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
