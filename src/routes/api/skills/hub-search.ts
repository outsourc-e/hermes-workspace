import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { BEARER_TOKEN, HERMES_API } from '../../../server/gateway-capabilities'

const execFileAsync = promisify(execFile)

type HubSkill = {
  id: string
  name: string
  description: string
  author: string
  category: string
  tags: Array<string>
  downloads?: number
  stars?: number
  source: 'clawhub' | 'installed-fallback'
  installCommand?: string
  homepage?: string
  installed: boolean
}

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok)
    throw new Error(`Hermes skills request failed (${response.status})`)
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

function matchesQuery(skill: HubSkill, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
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
    .includes(q)
}

function fallbackToInstalledSearch(
  installedSkills: Array<Record<string, unknown>>,
  query: string,
  limit: number,
): Array<HubSkill> {
  const mapped: Array<HubSkill> = []
  for (const skill of installedSkills) {
    const id =
      readString(skill.id) || readString(skill.slug) || readString(skill.name)
    if (!id) continue
    mapped.push({
      id,
      name: readString(skill.name) || id,
      description: readString(skill.description),
      author: readString(skill.author) || 'Unknown',
      category: readString(skill.category) || 'installed',
      tags: Array.isArray(skill.tags) ? skill.tags.map((t) => String(t)) : [],
      source: 'installed-fallback',
      installCommand: `clawhub install ${id} --workdir ~/.hermes --dir skills`,
      homepage: undefined,
      installed: true,
    })
  }
  return mapped.filter((entry) => matchesQuery(entry, query)).slice(0, limit)
}

async function searchSkillHub(
  query: string,
  limit: number,
  installedIds: Set<string>,
): Promise<Array<HubSkill>> {
  const { stdout } = await execFileAsync(
    'clawhub',
    ['search', query, '--limit', String(limit)],
    {
      cwd: os.homedir(),
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    },
  )

  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('- Searching'))

  const results: Array<HubSkill> = []
  for (const line of lines) {
    const match = line.match(
      /^([a-z0-9._-]+)\s{2,}(.+?)(?:\s{2,}\(([0-9.]+)\))?$/i,
    )
    if (!match) continue
    const slug = match[1]
    const title = match[2]?.trim() || slug
    const score = match[3] ? Number(match[3]) : undefined
    results.push({
      id: slug,
      name: title,
      description: '',
      author: 'Skills Hub',
      category: 'marketplace',
      tags: [],
      stars: Number.isFinite(score) ? score : undefined,
      source: 'clawhub',
      installCommand: `clawhub install ${slug} --workdir ~/.hermes --dir skills`,
      homepage: `https://clawhub.ai/skills/${slug}`,
      installed: installedIds.has(slug.toLowerCase()),
    })
  }
  return results
}

export const Route = createFileRoute('/api/skills/hub-search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const query = (url.searchParams.get('q') || '').trim()
          const limit = Math.min(
            50,
            Math.max(1, Number(url.searchParams.get('limit') || '20')),
          )
          if (!query) return json({ results: [], source: 'idle' })

          const installedSkills = await fetchInstalledSkills().catch(() => [])
          const installedIds = new Set(
            installedSkills
              .map((skill) => normalizeInstalledId(skill))
              .filter(Boolean),
          )

          let results: Array<HubSkill> = []
          let source = 'clawhub'
          try {
            results = await searchSkillHub(query, limit, installedIds)
          } catch {
            results = []
          }

          if (results.length === 0) {
            results = fallbackToInstalledSearch(installedSkills, query, limit)
            source = 'installed-fallback'
          }

          return json({ results, source })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to search skills hub',
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
