import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  BEARER_TOKEN,
  CLAUDE_API,
  CLAUDE_UPGRADE_INSTRUCTIONS,
  dashboardFetch,
  ensureGatewayProbed,
  getCapabilities,
} from '../../server/gateway-capabilities'
import { requireJsonContentType } from '../../server/rate-limit'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'

function getSkillsDir(): string {
  return (
    process.env.HERMES_SKILLS_DIR ||
    path.join(
      process.env.HERMES_HOME || path.join(os.homedir(), '.hermes'),
      'skills',
    )
  )
}

type LocalSkillMeta = { path: string; author: string }

async function readSkillAuthor(skillDir: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf-8')
    const fmEnd = raw.indexOf('\n---', 4)
    const fm = fmEnd > 0 ? raw.slice(0, fmEnd) : raw.slice(0, 1024)
    const match = fm.match(/^author:\s*(.+?)\s*$/m)
    return match?.[1]?.trim().replace(/^["']|["']$/g, '') || ''
  } catch {
    return ''
  }
}

async function buildLocalSkillPathMap(): Promise<Map<string, LocalSkillMeta>> {
  const root = getSkillsDir()
  const map = new Map<string, LocalSkillMeta>()
  let categoryEntries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    categoryEntries = (await fs.readdir(root, {
      withFileTypes: true,
    })) as unknown as Array<{
      name: string
      isDirectory: () => boolean
    }>
  } catch {
    return map
  }

  const collect: Array<Promise<void>> = []
  for (const cat of categoryEntries) {
    if (!cat.isDirectory() || cat.name.startsWith('.')) continue
    const catPath = path.join(root, cat.name)
    let skillEntries: Array<{
      name: string
      isDirectory: () => boolean
    }>
    try {
      skillEntries = (await fs.readdir(catPath, {
        withFileTypes: true,
      })) as unknown as Array<{
        name: string
        isDirectory: () => boolean
      }>
    } catch {
      continue
    }
    for (const skill of skillEntries) {
      if (!skill.isDirectory() || skill.name.startsWith('.')) continue
      const fullPath = path.join(catPath, skill.name)
      if (map.has(skill.name)) continue
      collect.push(
        readSkillAuthor(fullPath).then((author) => {
          map.set(skill.name, { path: fullPath, author })
        }),
      )
    }
  }
  await Promise.all(collect)
  return map
}

async function loadBundledManifest(): Promise<Set<string>> {
  const manifestPath = path.join(getSkillsDir(), '.bundled_manifest')
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8')
    return new Set(
      raw
        .split('\n')
        .map((line) => line.split(':')[0]?.trim() || '')
        .filter(Boolean),
    )
  } catch {
    return new Set()
  }
}

function deriveOrigin(
  skill: SkillSummary,
  bundled: Set<string>,
): SkillSummary['origin'] {
  if (bundled.has(skill.id) || bundled.has(skill.slug)) return 'builtin'
  if (skill.author === 'Hermes Agent' && skill.sourcePath) return 'agent-created'
  return 'marketplace'
}

type SkillsTab = 'installed' | 'marketplace' | 'featured'
type SkillsSort = 'name' | 'category'

type SecurityRisk = {
  level: 'safe' | 'low' | 'medium' | 'high'
  flags: Array<string>
  score: number
}

type SkillSummary = {
  id: string
  slug: string
  name: string
  description: string
  author: string
  triggers: Array<string>
  tags: Array<string>
  homepage: string | null
  category: string
  icon: string
  content: string
  fileCount: number
  sourcePath: string
  installed: boolean
  enabled: boolean
  builtin?: boolean
  featuredGroup?: string
  security: SecurityRisk
  origin: 'builtin' | 'agent-created' | 'marketplace'
}

const KNOWN_CATEGORIES = [
  'All',
  'Веб и фронтенд',
  'Агенты для кода',
  'Git и GitHub',
  'DevOps и облако',
  'Браузер и автоматизация',
  'Изображения и видео',
  'Поиск и исследования',
  'ИИ и LLM',
  'Продуктивность',
  'Маркетинг и продажи',
  'Коммуникации',
  'Данные и аналитика',
  'Финансы и крипто',
] as const

const FEATURED_SKILLS: Array<{ id: string; group: string }> = [
  { id: 'dbalve/fast-io', group: 'Most Popular' },
  { id: 'okoddcat/gitflow', group: 'Most Popular' },
  { id: 'atomtanstudio/craft-do', group: 'Most Popular' },
  { id: 'bro3886/gtasks-cli', group: 'New This Week' },
  { id: 'vvardhan14/pokerpal', group: 'New This Week' },
  {
    id: 'veeramanikandanr48/docker-containerization',
    group: 'Developer Tools',
  },
  { id: 'veeramanikandanr48/azure-auth', group: 'Developer Tools' },
  { id: 'dbalve/fastio-skills', group: 'Продуктивность' },
  { id: 'gillberto1/moltwallet', group: 'Продуктивность' },
  { id: 'veeramanikandanr48/backtest-expert', group: 'Продуктивность' },
]

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
  return value.map((entry) => readString(entry)).filter(Boolean)
}

function slugify(input: string): string {
  const result = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
  return result || 'skill'
}

function normalizeSecurity(value: unknown): SecurityRisk {
  const record = asRecord(value)
  const level = readString(record.level)
  return {
    level:
      level === 'low' ||
      level === 'medium' ||
      level === 'high' ||
      level === 'safe'
        ? level
        : 'safe',
    flags: readStringArray(record.flags),
    score:
      typeof record.score === 'number' && Number.isFinite(record.score)
        ? record.score
        : 0,
  }
}

const CATEGORY_ALIASES: Record<string, string> = {
  research: 'Поиск и исследования',
  'search-and-research': 'Поиск и исследования',
  search: 'Поиск и исследования',
  feeds: 'Поиск и исследования',
  'web-frontend': 'Веб и фронтенд',
  frontend: 'Веб и фронтенд',
  web: 'Веб и фронтенд',
  'software-development': 'Агенты для кода',
  coding: 'Агенты для кода',
  development: 'Агенты для кода',
  devops: 'DevOps и облако',
  cloud: 'DevOps и облако',
  'devops-cloud': 'DevOps и облако',
  mlops: 'DevOps и облако',
  git: 'Git и GitHub',
  github: 'Git и GitHub',
  'git-github': 'Git и GitHub',
  browser: 'Браузер и автоматизация',
  automation: 'Браузер и автоматизация',
  'browser-automation': 'Браузер и автоматизация',
  image: 'Изображения и видео',
  video: 'Изображения и видео',
  media: 'Изображения и видео',
  creative: 'Изображения и видео',
  'image-video': 'Изображения и видео',
  gifs: 'Изображения и видео',
  diagramming: 'Изображения и видео',
  'autonomous-ai-agents': 'ИИ и LLM',
  ai: 'ИИ и LLM',
  llm: 'ИИ и LLM',
  agents: 'ИИ и LLM',
  mcp: 'ИИ и LLM',
  'inference-sh': 'ИИ и LLM',
  'data-science': 'Данные и аналитика',
  data: 'Данные и аналитика',
  'social-media': 'Маркетинг и продажи',
  social: 'Маркетинг и продажи',
  email: 'Коммуникации',
  'note-taking': 'Продуктивность',
  notetaking: 'Продуктивность',
  notes: 'Продуктивность',
  'smart-home': 'Продуктивность',
  apple: 'Продуктивность',
  leisure: 'Продуктивность',
  gaming: 'Продуктивность',
  'red-teaming': 'ИИ и LLM',
  domain: 'Продуктивность',
  dogfood: 'Продуктивность',
  productivity: 'Продуктивность',
}

const KNOWN_CATEGORY_SET = new Set<string>(
  KNOWN_CATEGORIES.filter((c) => c !== 'All'),
)
const KNOWN_CATEGORY_LOWER = new Map<string, string>(
  Array.from(KNOWN_CATEGORY_SET).map((c) => [c.toLowerCase(), c]),
)

function normalizeCategoryLabel(raw: string): string {
  if (KNOWN_CATEGORY_SET.has(raw)) return raw
  const lower = raw.toLowerCase()
  const caseMatch = KNOWN_CATEGORY_LOWER.get(lower)
  if (caseMatch) return caseMatch
  const key = lower.replace(/[\s&]+/g, '-').replace(/-+/g, '-')
  return CATEGORY_ALIASES[key] ?? CATEGORY_ALIASES[lower] ?? raw
}

function guessCategory(record: Record<string, unknown>): string {
  const direct =
    readString(record.category) ||
    readString(record.group) ||
    readString(record.section)
  if (direct) return normalizeCategoryLabel(direct)
  const tags = readStringArray(record.tags).map((tag) => tag.toLowerCase())
  if (tags.some((tag) => tag.includes('frontend') || tag.includes('react'))) {
    return 'Веб и фронтенд'
  }
  if (tags.some((tag) => tag.includes('browser'))) {
    return 'Браузер и автоматизация'
  }
  if (tags.some((tag) => tag.includes('git'))) {
    return 'Git и GitHub'
  }
  if (tags.some((tag) => tag.includes('research') || tag.includes('search'))) {
    return 'Поиск и исследования'
  }
  if (tags.some((tag) => tag.includes('ai') || tag.includes('llm'))) {
    return 'ИИ и LLM'
  }
  return 'Продуктивность'
}

function normalizeSkill(value: unknown): SkillSummary | null {
  const record = asRecord(value)
  const id =
    readString(record.id) || readString(record.slug) || readString(record.name)
  if (!id) return null

  const name = readString(record.name) || id
  const sourcePath =
    readString(record.sourcePath) ||
    readString(record.path) ||
    readString(record.file) ||
    ''

  return {
    id,
    slug: readString(record.slug) || slugify(id),
    name,
    description: readString(record.description),
    author:
      readString(record.author) ||
      readString(record.owner) ||
      readString(record.publisher),
    triggers: readStringArray(record.triggers),
    tags: readStringArray(record.tags),
    homepage: readString(record.homepage) || null,
    category: guessCategory(record),
    icon: readString(record.icon) || '✨',
    content:
      readString(record.content) ||
      readString(record.readme) ||
      readString(record.prompt),
    fileCount:
      typeof record.fileCount === 'number' && Number.isFinite(record.fileCount)
        ? record.fileCount
        : 0,
    sourcePath,
    // Claude /api/skills returns the installed skill inventory. Older payloads
    // omit explicit installed/enabled flags, so default to installed=true.
    installed: Boolean(record.installed ?? true),
    enabled: Boolean(record.enabled ?? record.installed ?? true),
    builtin: Boolean(record.builtin),
    featuredGroup: undefined,
    security: normalizeSecurity(record.security),
    origin: 'marketplace' as const,
  }
}

async function fetchClaudeSkills(): Promise<Array<SkillSummary>> {
  const capabilities = getCapabilities()
  const headers: Record<string, string> = {}
  if (BEARER_TOKEN) headers['Authorization'] = `Bearer ${BEARER_TOKEN}`

  const response = capabilities.dashboard.available
    ? await dashboardFetch('/api/skills')
    : await fetch(`${CLAUDE_API}/api/skills`, { headers })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Claude skills request failed (${response.status})`)
  }

  const payload = (await response.json()) as unknown
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).items)
      ? (asRecord(payload).items as Array<unknown>)
      : Array.isArray(asRecord(payload).skills)
        ? (asRecord(payload).skills as Array<unknown>)
        : []

  return items
    .map((entry) => normalizeSkill(entry))
    .filter((entry): entry is SkillSummary => entry !== null)
}

function matchesSearch(skill: SkillSummary, rawSearch: string): boolean {
  const search = rawSearch.trim().toLowerCase()
  if (!search) return true

  return [
    skill.id,
    skill.name,
    skill.description,
    skill.author,
    skill.category,
    ...skill.tags,
    ...skill.triggers,
  ]
    .join('\n')
    .toLowerCase()
    .includes(search)
}

function sortSkills(skills: Array<SkillSummary>, sort: SkillsSort) {
  return [...skills].sort((left, right) => {
    if (sort === 'category') {
      const categoryCompare = left.category.localeCompare(right.category)
      if (categoryCompare !== 0) return categoryCompare
    }
    return left.name.localeCompare(right.name)
  })
}

export const Route = createFileRoute('/api/skills')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.skills) {
          return json({
            ...createCapabilityUnavailablePayload('skills'),
            items: [],
            skills: [],
            total: 0,
            page: 1,
            categories: KNOWN_CATEGORIES,
          })
        }

        try {
          const url = new URL(request.url)
          const tabParam = url.searchParams.get('tab')
          const tab: SkillsTab =
            tabParam === 'installed' ||
            tabParam === 'marketplace' ||
            tabParam === 'featured'
              ? tabParam
              : 'installed'
          const rawSearch = (url.searchParams.get('search') || '').trim()
          const category = (url.searchParams.get('category') || 'All').trim()
          const origin = (url.searchParams.get('origin') || 'All').trim()
          const sortParam = (url.searchParams.get('sort') || 'name').trim()
          const sort: SkillsSort =
            sortParam === 'category' || sortParam === 'name'
              ? sortParam
              : 'name'
          const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
          const limit = Math.min(
            60,
            Math.max(1, Number(url.searchParams.get('limit') || '30')),
          )

          const [sourceItems, localPathMap, bundledManifest] = await Promise.all([
            fetchClaudeSkills(),
            buildLocalSkillPathMap(),
            loadBundledManifest(),
          ])
          for (const skill of sourceItems) {
            if (skill.installed) {
              const meta =
                localPathMap.get(skill.id) || localPathMap.get(skill.slug)
              if (meta) {
                if (!skill.sourcePath) skill.sourcePath = meta.path
                if (!skill.author) skill.author = meta.author
              }
            }
            skill.origin = deriveOrigin(skill, bundledManifest)
          }
          const installedLookup = new Set(
            sourceItems
              .filter((skill) => skill.installed)
              .map((skill) => skill.id),
          )

          const filteredByTab = sourceItems.filter((skill) => {
            if (tab === 'featured') return true
            if (tab === 'installed') return skill.installed
            return true
          })

          const featuredLookup = new Map(
            FEATURED_SKILLS.map((entry) => [entry.id, entry.group]),
          )

          const filtered = sortSkills(
            filteredByTab
              .map((skill) => ({
                ...skill,
                installed: installedLookup.has(skill.id),
                featuredGroup: featuredLookup.get(skill.id),
              }))
              .filter((skill) => {
                if (tab === 'featured' && !skill.featuredGroup) return false
                if (!matchesSearch(skill, rawSearch)) return false
                if (category !== 'All' && skill.category !== category) {
                  return false
                }
                if (origin !== 'All' && skill.origin !== origin) return false
                return true
              }),
            sort,
          )

          const total = filtered.length
          const start = (page - 1) * limit
          const skills = filtered.slice(start, start + limit)

          return json({
            skills,
            total,
            page,
            categories: KNOWN_CATEGORIES,
          })
        } catch (err) {
          return json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          )
        }
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.skills) {
          return json(
            {
              ...createCapabilityUnavailablePayload('skills', {
                error: `Gateway does not support /api/skills. ${CLAUDE_UPGRADE_INSTRUCTIONS}`,
              }),
            },
            { status: 503 },
          )
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json()) as {
            action?: string
            identifier?: string
            name?: string
            category?: string
            force?: boolean
            enabled?: boolean
          }
          const action = (body.action || 'install').trim()

          let endpoint: string
          let payload: Record<string, unknown>

          if (action === 'uninstall') {
            endpoint = '/api/skills/uninstall'
            payload = { name: body.name || body.identifier || '' }
          } else if (action === 'toggle') {
            endpoint = '/api/skills/toggle'
            payload = {
              name: body.name || body.identifier || '',
              enabled: body.enabled,
            }
          } else {
            endpoint = '/api/skills/install'
            payload = {
              identifier: body.identifier || '',
              category: body.category || '',
              force: Boolean(body.force),
            }
          }

          if (capabilities.dashboard.available) {
            if (action !== 'toggle') {
              return json(
                {
                  ok: false,
                  error:
                    'Skill install/uninstall is only available on the legacy enhanced fork right now. Zero-fork mode supports listing and toggling installed skills.',
                },
                { status: 501 },
              )
            }

            const response = await dashboardFetch('/api/skills/toggle', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(30_000),
            })

            const result = await response.json()
            return json(result, { status: response.status })
          }

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          }
          if (BEARER_TOKEN) headers['Authorization'] = `Bearer ${BEARER_TOKEN}`

          const response = await fetch(`${CLAUDE_API}${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(120_000),
          })

          const result = await response.json()
          return json(result, { status: response.status })
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
