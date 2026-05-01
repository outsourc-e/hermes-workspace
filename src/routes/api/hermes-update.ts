import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isAuthenticated } from '../../server/auth-middleware'

type RemoteName = 'origin' | 'upstream'

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
  error: string | null
}

type RemoteDefinition = {
  name: RemoteName
  label: string
  expectedRepo: string
  aliases: Array<string>
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
    return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8', timeout }).trim() || null
  } catch {
    return null
  }
}

function pkgVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function remoteUrlMatchesExpectedRepo(url: string | null, aliases: Array<string>): boolean {
  if (!url) return false
  const normalizedUrl = url
    .toLowerCase()
    .replace(/^git@github\.com:/, 'github.com/')
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
  return aliases.some((alias) => normalizedUrl.includes(alias.toLowerCase().replace(/\.git$/, '')))
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

  return {
    name: input.name,
    label: input.label,
    url: input.url,
    expectedRepo: input.expectedRepo,
    expectedAliases: input.aliases,
    repoMatches,
    remoteHead: repoMatches ? input.remoteHead : null,
    currentHead: input.currentHead,
    updateAvailable: Boolean(repoMatches && input.currentHead && input.remoteHead && input.currentHead !== input.remoteHead),
    error,
  }
}

function remoteStatus(definition: RemoteDefinition, currentHead: string | null): RemoteStatus {
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

export const Route = createFileRoute('/api/hermes-update')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const currentHead = git(['rev-parse', 'HEAD'])
        const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
        const dirty = Boolean(git(['status', '--porcelain']))
        const remotes = UPDATE_REMOTE_DEFINITIONS.map((definition) => remoteStatus(definition, currentHead))

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
    },
  },
})
