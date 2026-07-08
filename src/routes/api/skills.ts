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
  'Web & Frontend',
  'Frontend',
  'Backend',
  'Coding Agents',
  'Agentic Systems',
  'Git & GitHub',
  'DevOps & Cloud',
  'Infrastructure Engineering',
  'Infrastructure & Platform',
  'Platform Engineering',
  'Reliability Engineering',
  'Reliability & Observability',
  'Browser & Automation',
  'Automation',
  'Image & Video',
  'Multimodal',
  'Multimodal & Voice',
  'Spatial / AR-VR',
  'Search & Research',
  'Research',
  'AI & LLMs',
  'Data & Analytics',
  'Data & ML',
  'Security Engineering',
  'Security & Compliance',
  'Compliance & Governance',
  'Quality Engineering',
  'Quality & Testing',
  'Performance Engineering',
  'Performance',
  'Accessibility & Localization',
  'Accessibility',
  'i18n & Localization',
  'Content Engineering',
  'Content',
  'Growth Engineering',
  'Growth',
  'Developer Experience',
  'DevEx & Tooling',
  'Marketplace & Trust',
  'Web3 & Economy',
  'Web3',
  'Edge & IoT',
  'Sustainability Engineering',
  'Sustainability',
  'Productivity',
  'Marketing & Sales',
  'Communication',
  'Finance & Crypto',
  'Identity & Access',
  'Secrets',
  'Feature Flags',
  'Developer Portal',
  'Service Mesh',
  'Event-Driven',
  'Governance & Trust',
  'Federation & Interop',
  'Design',
  'Documentation',
  'Writing',
  'Media',
  'Creative',
  'Business',
  'Finance',
  'Product',
  'Planning',
  'Collaboration',
  'Testing',
] as const

const FEATURED_SKILLS: Array<{ id: string; group: string }> = [
  { id: 'dbalve/fast-io', group: 'Most Popular' },
  { id: 'okoddcat/gitflow', group: 'Most Popular' },
  { id: 'atomtanstudio/craft-do', group: 'Most Popular' },
  { id: 'multi-agent-task-orchestrator', group: 'Agentic Systems' },
  { id: 'web3-testing', group: 'Web3' },
  { id: 'fda-medtech-compliance-auditor', group: 'Security & Compliance' },
  { id: 'bro3886/gtasks-cli', group: 'New This Week' },
  { id: 'vvardhan14/pokerpal', group: 'New This Week' },
  {
    id: 'veeramanikandanr48/docker-containerization',
    group: 'DevEx & Platform',
  },
  { id: 'veeramanikandanr48/azure-auth', group: 'DevEx & Platform' },
  { id: 'dbalve/fastio-skills', group: 'Productivity' },
  { id: 'gillberto1/moltwallet', group: 'Marketplace & Trust' },
  { id: 'veeramanikandanr48/backtest-expert', group: 'Finance & Crypto' },
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
  research: 'Search & Research',
  'search-and-research': 'Search & Research',
  search: 'Search & Research',
  feeds: 'Search & Research',
  'web-frontend': 'Web & Frontend',
  frontend: 'Frontend',
  web: 'Web & Frontend',
  backend: 'Backend',
  'software-development': 'DevEx & Tooling',
  coding: 'Coding Agents',
  development: 'DevEx & Tooling',
  'developer-tools': 'DevEx & Tooling',
  'core-dev': 'DevEx & Tooling',
  'tool-quality': 'DevEx & Tooling',
  'context-optimization': 'DevEx & Tooling',
  'prompt-engineering': 'DevEx & Tooling',
  agent: 'Agentic Systems',
  agents: 'Agentic Systems',
  swarm: 'Agentic Systems',
  orchestration: 'Agentic Systems',
  'multi-agent': 'Agentic Systems',
  'multiagent': 'Agentic Systems',
  devops: 'DevOps & Cloud',
  cloud: 'DevOps & Cloud',
  'devops-cloud': 'DevOps & Cloud',
  platform: 'Infrastructure & Platform',
  'platform-engineering': 'Platform Engineering',
  'infrastructure-platform': 'Infrastructure & Platform',
  infrastructure: 'Infrastructure & Platform',
  mlops: 'Data & ML',
  'data-science': 'Data & ML',
  'data-engineering': 'Data & ML',
  'data-ai': 'Data & ML',
  'machine-learning': 'Data & ML',
  'devex': 'DevEx & Tooling',
  'developer-experience': 'Developer Experience',
  git: 'Git & GitHub',
  github: 'Git & GitHub',
  'git-github': 'Git & GitHub',
  browser: 'Browser & Automation',
  automation: 'Automation',
  'browser-automation': 'Browser & Automation',
  image: 'Image & Video',
  video: 'Image & Video',
  media: 'Media',
  creative: 'Creative',
  'image-video': 'Image & Video',
  gifs: 'Image & Video',
  diagramming: 'Image & Video',
  'voice': 'Multimodal & Voice',
  audio: 'Multimodal & Voice',
  speech: 'Multimodal & Voice',
  vision: 'Multimodal & Voice',
  multimodal: 'Multimodal',
  'multimodal-voice': 'Multimodal & Voice',
  spatial: 'Spatial / AR-VR',
  ar: 'Spatial / AR-VR',
  vr: 'Spatial / AR-VR',
  'ar-vr': 'Spatial / AR-VR',
  arvr: 'Spatial / AR-VR',
  'threejs': 'Spatial / AR-VR',
  spline: 'Spatial / AR-VR',
  'autonomous-ai-agents': 'AI & LLMs',
  ai: 'AI & LLMs',
  llm: 'AI & LLMs',
  mcp: 'AI & LLMs',
  'inference-sh': 'AI & LLMs',
  data: 'Data & Analytics',
  analytics: 'Data & Analytics',
  security: 'Security & Compliance',
  appsec: 'Security & Compliance',
  compliance: 'Security & Compliance',
  governance: 'Governance & Trust',
  quality: 'Quality & Testing',
  testing: 'Quality & Testing',
  performance: 'Performance',
  a11y: 'Accessibility',
  accessibility: 'Accessibility',
  localization: 'i18n & Localization',
  i18n: 'i18n & Localization',
  l10n: 'i18n & Localization',
  content: 'Content',
  cms: 'Content',
  growth: 'Growth',
  onboarding: 'Growth',
  activation: 'Growth',
  referral: 'Growth',
  marketplace: 'Marketplace & Trust',
  pricing: 'Marketplace & Trust',
  monetization: 'Marketplace & Trust',
  wallet: 'Marketplace & Trust',
  trust: 'Governance & Trust',
  web3: 'Web3',
  blockchain: 'Web3',
  solidity: 'Web3',
  defi: 'Web3',
  edge: 'Edge & IoT',
  iot: 'Edge & IoT',
  sensor: 'Edge & IoT',
  sustainability: 'Sustainability',
  green: 'Sustainability',
  carbon: 'Sustainability',
  'social-media': 'Marketing & Sales',
  social: 'Marketing & Sales',
  email: 'Communication',
  'note-taking': 'Productivity',
  notetaking: 'Productivity',
  notes: 'Productivity',
  'smart-home': 'Productivity',
  apple: 'Productivity',
  leisure: 'Productivity',
  gaming: 'Productivity',
  'red-teaming': 'Security Engineering',
  domain: 'Productivity',
  dogfood: 'Productivity',
  productivity: 'Productivity',
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
  const haystack = [
    readString(record.slug),
    readString(record.name),
    readString(record.description),
    ...tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const has = (...terms: string[]) => terms.some((term) => haystack.includes(term))

  if (has('accessibility', 'a11y', 'wcag', 'screen-reader', 'aria')) {
    return 'Accessibility'
  }
  if (has('i18n', 'l10n', 'localization', 'translation', 'locale', 'rtl')) {
    return 'i18n & Localization'
  }
  if (has('security', 'appsec', 'threat', 'zeroize', 'sast', 'cve', 'vulnerability')) {
    return 'Security & Compliance'
  }
  if (has('iam', 'identity', 'auth', 'oauth', 'sso', 'rbac', 'permission')) {
    return 'Identity & Access'
  }
  if (has('secret', 'vault', 'keyvault', 'rotation', 'credential')) {
    return 'Secrets'
  }
  if (has('service mesh', 'service-mesh', 'istio', 'linkerd', 'mtls')) {
    return 'Service Mesh'
  }
  if (has('event-driven', 'eventhub', 'eventgrid', 'pubsub', 'kafka', 'cqrs', 'saga', 'streaming')) {
    return 'Event-Driven'
  }
  if (has('agent', 'swarm', 'orchestr', 'multi-agent', 'evolution', 'subagent')) {
    return 'Agentic Systems'
  }
  if (has('voice', 'audio', 'speech', 'tts', 'asr', 'multimodal')) {
    return 'Multimodal'
  }
  if (has('vision', 'image', 'video', 'media', 'creative')) {
    return 'Multimodal'
  }
  if (has('ar/', 'ar-vr', 'arvr', 'vr', 'visionos', 'threejs', 'spline', 'unity', 'quest')) {
    return 'Spatial / AR-VR'
  }
  if (has('edge', 'iot', 'sensor', 'matter', 'embedded', 'smart-home')) {
    return 'Edge & IoT'
  }
  if (has('web3', 'blockchain', 'solidity', 'defi', 'nft', 'token')) {
    return 'Web3'
  }
  if (has('sustainability', 'climate', 'energy', 'carbon', 'esg')) {
    return 'Sustainability'
  }
  if (has('reliability', 'sre', 'incident', 'on-call', 'observability', 'uptime', 'monitoring')) {
    return 'Reliability & Observability'
  }
  if (has('performance', 'latency', 'throughput', 'profiling', 'optimization', 'perf')) {
    return 'Performance'
  }
  if (has('quality', 'qa', 'mutation', 'property', 'test', 'testing', 'regression')) {
    return 'Quality & Testing'
  }
  if (has('growth', 'onboarding', 'activation', 'referral', 'acquisition', 'retention')) {
    return 'Growth'
  }
  if (has('content', 'cms', 'editorial', 'copy', 'writing', 'narrative')) {
    return 'Content'
  }
  if (has('developer-portal', 'developer portal', 'api-management', 'apicenter', 'openapi')) {
    return 'Developer Portal'
  }
  if (has('feature-flag', 'feature flags', 'featureflags', 'launchdarkly')) {
    return 'Feature Flags'
  }
  if (has('governance', 'policy', 'guardrail', 'audit', 'trust')) {
    return 'Governance & Trust'
  }
  if (has('federation', 'interop', 'multi-cloud', 'cross-company')) {
    return 'Federation & Interop'
  }
  if (has('platform', 'platforming', 'infra', 'cloud', 'kubernetes', 'terraform', 'deployment')) {
    return 'Infrastructure & Platform'
  }
  if (has('devex', 'developer experience', 'developer-tools', 'prompt-engineering', 'context-optimization', 'tool-quality')) {
    return 'DevEx & Tooling'
  }
  if (has('ml', 'model', 'training', 'feature-store', 'experiment', 'forecast', 'llmops', 'data-engineering', 'data-science', 'mlops')) {
    return 'Data & ML'
  }
  if (has('frontend', 'react', 'vue', 'svelte', 'next', 'tailwind')) {
    return 'Web & Frontend'
  }
  if (has('backend', 'api', 'server', 'service', 'database')) {
    return 'Backend'
  }
  if (has('research', 'search', 'literature', 'arxiv')) {
    return 'Search & Research'
  }
  if (has('documentation', 'docs', 'readme', 'api-doc')) {
    return 'Documentation'
  }
  if (has('automation', 'workflow', 'script', 'bot', 'scheduled')) {
    return 'Automation'
  }
  if (has('business', 'strategy', 'market', 'pricing', 'monetization', 'sales')) {
    return 'Business'
  }
  if (has('finance', 'wallet', 'billing', 'accounting', 'backtest')) {
    return 'Finance'
  }
  if (has('product', 'roadmap', 'product-management', 'planning')) {
    return 'Product'
  }
  if (has('collaboration', 'team', 'shared', 'workflow')) {
    return 'Collaboration'
  }

  if (tags.some((tag) => tag.includes('ai') || tag.includes('llm'))) {
    return 'AI & LLMs'
  }
  if (tags.some((tag) => tag.includes('data'))) {
    return 'Data & Analytics'
  }
  return 'Productivity'
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
