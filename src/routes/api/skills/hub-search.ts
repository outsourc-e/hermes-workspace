import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  BEARER_TOKEN,
  HERMES_API,
  ensureGatewayProbed,
} from '../../../server/gateway-capabilities'

type HubSkillSource = 'clawhub' | 'official' | 'github'

type HubSkill = {
  id: string
  name: string
  description: string
  author: string
  category: string
  tags: Array<string>
  downloads?: number
  stars?: number
  source: HubSkillSource
  installCommand?: string
  homepage?: string
  installed: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown): Array<string> {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => readString(entry))
    .filter(Boolean)
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

function normalizeInstalledId(value: unknown): string {
  const record = asRecord(value)
  return (
    readString(record.id) ||
    readString(record.slug) ||
    readString(record.name)
  ).toLowerCase()
}

async function fetchInstalledSkills(): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`${HERMES_API}/api/skills`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(5_000),
  })

  if (!response.ok) {
    throw new Error(`Hermes skills request failed (${response.status})`)
  }

  const payload = (await response.json()) as unknown
  if (Array.isArray(payload)) return payload.map((entry) => asRecord(entry))

  const record = asRecord(payload)
  const items = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.skills)
      ? record.skills
      : []

  return items.map((entry) => asRecord(entry))
}

function guessCategory(record: Record<string, unknown>): string {
  return (
    readString(record.category) ||
    readString(record.group) ||
    readString(record.section) ||
    'Productivity'
  )
}

function normalizeHubSkill(
  value: unknown,
  installedIds: Set<string>,
): HubSkill | null {
  const record = asRecord(value)
  const id =
    readString(record.id) ||
    readString(record.slug) ||
    readString(record.name)

  if (!id) return null

  const rawSource = readString(record.source).toLowerCase()
  const source: HubSkillSource =
    rawSource === 'official' || rawSource === 'github' || rawSource === 'clawhub'
      ? rawSource
      : 'clawhub'

  return {
    id,
    name: readString(record.name) || id,
    description: readString(record.description),
    author:
      readString(record.author) ||
      readString(record.owner) ||
      readString(record.publisher) ||
      'Unknown',
    category: guessCategory(record),
    tags: readStringArray(record.tags),
    downloads:
      readNumber(record.downloads) ?? readNumber(record.download_count),
    stars: readNumber(record.stars) ?? readNumber(record.star_count),
    source,
    installCommand:
      readString(record.installCommand) || `hermes skills install ${id}`,
    homepage:
      readString(record.homepage) ||
      readString(record.url) ||
      readString(record.html_url) ||
      undefined,
    installed: installedIds.has(id.toLowerCase()),
  }
}

function matchesQuery(skill: HubSkill, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return true

  return [
    skill.id,
    skill.name,
    skill.description,
    skill.author,
    skill.category,
    ...skill.tags,
  ]
    .join('\n')
    .toLowerCase()
    .includes(query)
}

async function searchClawhub(
  query: string,
  limit: number,
  installedIds: Set<string>,
): Promise<Array<HubSkill>> {
  const url = new URL('https://clawhub.ai/api/skills/search')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(5_000),
  })

  if (!response.ok) {
    throw new Error(`ClawHub search failed (${response.status})`)
  }

  const payload = (await response.json()) as unknown
  const record = asRecord(payload)
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(record.results)
      ? record.results
      : Array.isArray(record.items)
        ? record.items
        : Array.isArray(record.skills)
          ? record.skills
          : Array.isArray(record.data)
            ? record.data
            : []

  return items
    .map((entry) => normalizeHubSkill(entry, installedIds))
    .filter((entry): entry is HubSkill => entry !== null)
    .slice(0, limit)
}

function fallbackToInstalledSearch(
  installedSkills: Array<Record<string, unknown>>,
  query: string,
  limit: number,
): Array<HubSkill> {
  const installedIds = new Set(installedSkills.map((skill) => normalizeInstalledId(skill)))

  return installedSkills
    .map((skill) => normalizeHubSkill({ ...skill, source: 'official' }, installedIds))
    .filter((entry): entry is HubSkill => entry !== null)
    .filter((entry) => matchesQuery(entry, query))
    .slice(0, limit)
}

export const Route = createFileRoute('/api/skills/hub-search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          await ensureGatewayProbed()

          const url = new URL(request.url)
          const query = (url.searchParams.get('q') || '').trim()
          const requestedSource = (url.searchParams.get('source') || 'all').trim()
          const limit = Math.min(
            50,
            Math.max(1, Number(url.searchParams.get('limit') || '20')),
          )

          if (!query) {
            return json({ results: [], source: 'idle' })
          }

          const installedSkills = await fetchInstalledSkills().catch(() => [])
          const installedIds = new Set(
            installedSkills.map((skill) => normalizeInstalledId(skill)).filter(Boolean),
          )

          let results: Array<HubSkill> = []
          let source = 'fallback'

          if (requestedSource === 'all' || requestedSource === 'clawhub') {
            try {
              results = await searchClawhub(query, limit, installedIds)
              source = 'clawhub'
            } catch {
              results = []
            }
          }

          if (results.length === 0) {
            results = fallbackToInstalledSearch(installedSkills, query, limit)
            source = results.length > 0 ? 'installed-fallback' : source
          }

          const filteredResults =
            requestedSource === 'all'
              ? results
              : results.filter((skill) => skill.source === requestedSource)

          return json({
            results: filteredResults,
            source,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error ? error.message : 'Failed to search skills hub',
              results: [],
              source: 'error',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
