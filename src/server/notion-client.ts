/**
 * Notion API client for Hermes Workspace.
 *
 * Reads NOTION_API_KEY from ~/.hermes/.env at request time.
 * The token is never exposed to the client — all requests go through
 * server-side route handlers.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DEFAULT_MANIFEST_PATH =
  '/Users/escher/Documents/Obsidian Vault/Bethanys Second Brain/03_Projects/SEO-AEO-Service/Tools_Systems/notion_command_center_manifest.json'

const NOTION_API_VERSION = '2025-09-03'
const NOTION_BASE = 'https://api.notion.com/v1'
const DEFAULT_CACHE_TTL_MS = 60_000
const MIN_REQUEST_SPACING_MS = 350

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const queryCache = new Map<string, CacheEntry<NotionQueryResponse>>()
const inFlightQueries = new Map<string, Promise<NotionQueryResponse>>()
let notionQueue: Promise<void> = Promise.resolve()
let lastNotionRequestAt = 0

export class NotionClientError extends Error {
  statusCode: number
  publicMessage: string

  constructor(statusCode: number, publicMessage: string) {
    super(publicMessage)
    this.name = 'NotionClientError'
    this.statusCode = statusCode
    this.publicMessage = publicMessage
  }
}

function readEnvFile(filePath: string): Record<string, string> {
  try {
    if (!fs.existsSync(filePath)) return {}
    const env: Record<string, string> = {}
    for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      env[key] = value
    }
    return env
  } catch {
    return {}
  }
}

function getToken(): string {
  const hermesHome = process.env.HERMES_HOME?.trim() || path.join(os.homedir(), '.hermes')
  const envPath = path.join(hermesHome, '.env')
  const env = readEnvFile(envPath)
  return env.NOTION_API_KEY || env.NOTION_API_TOKEN || process.env.NOTION_API_KEY || ''
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  if (!token) {
    throw new NotionClientError(503, 'Notion is not configured on this Workspace server.')
  }
  return {
    Authorization: ['Bearer', token].join(' '),
    'Notion-Version': NOTION_API_VERSION,
    'Content-Type': 'application/json',
  }
}

function manifestPath(): string {
  return process.env.NOTION_MANIFEST_PATH?.trim() || DEFAULT_MANIFEST_PATH
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const rendered = JSON.stringify(value)
    return rendered === undefined ? 'undefined' : rendered
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(',')}}`
}

async function waitForNotionTurn(): Promise<void> {
  const run = notionQueue.then(async () => {
    const elapsed = Date.now() - lastNotionRequestAt
    if (elapsed < MIN_REQUEST_SPACING_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_SPACING_MS - elapsed))
    }
    lastNotionRequestAt = Date.now()
  })
  notionQueue = run.catch(() => undefined)
  return run
}

function safeNotionMessage(status: number, bodyText: string): string {
  let notionMessage = ''
  try {
    const parsed = JSON.parse(bodyText) as { message?: string; code?: string }
    notionMessage = parsed.message || parsed.code || ''
  } catch {
    notionMessage = ''
  }

  if (status === 401 || status === 403) {
    return 'Notion credentials are missing, invalid, or not allowed to access this workspace.'
  }
  if (status === 404) {
    return 'Notion data source not found or not shared with the integration.'
  }
  if (status === 429) {
    return 'Notion rate limit reached. The Workspace will retry after the cache window.'
  }
  if (notionMessage) return `Notion API error ${status}: ${notionMessage.slice(0, 160)}`
  return `Notion API error ${status}`
}

async function notionFetch(url: string, init: RequestInit, attempt = 1): Promise<Response> {
  await waitForNotionTurn()
  const res = await fetch(url, init)
  if (res.status === 429 && attempt <= 2) {
    const retryAfter = Number(res.headers.get('retry-after') || '1')
    await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter, 1) * 1000))
    return notionFetch(url, init, attempt + 1)
  }
  return res
}

export interface NotionProperty {
  id: string
  type: string
  title?: Array<{ plain_text: string }>
  rich_text?: Array<{ plain_text: string }>
  select?: { name: string; color: string } | null
  multi_select?: Array<{ name: string; color: string }>
  date?: { start: string; end?: string } | null
  checkbox?: boolean
  number?: number | null
  url?: string | null
  email?: string | null
  phone_number?: string | null
  relation?: Array<{ id: string }>
  formula?: {
    string?: string | null
    number?: number | null
    boolean?: boolean | null
    date?: { start: string; end?: string } | null
  }
  rollup?: unknown
  status?: { name: string; color: string } | null
}

export interface NotionRecord {
  id: string
  properties: Record<string, NotionProperty>
  created_time: string
  last_edited_time: string
  url: string
}

export interface NotionQueryResponse {
  results: NotionRecord[]
  has_more: boolean
  next_cursor: string | null
}

export async function queryDataSource(
  dataSourceId: string,
  options: {
    filter?: Record<string, unknown>
    sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>
    page_size?: number
    cacheTtlMs?: number
  } = {},
): Promise<NotionQueryResponse> {
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const cacheKey = stableStringify({
    dataSourceId,
    filter: options.filter,
    sorts: options.sorts,
    page_size: options.page_size ?? 100,
  })
  const cached = queryCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const inFlight = inFlightQueries.get(cacheKey)
  if (inFlight) return inFlight

  const promise = (async (): Promise<NotionQueryResponse> => {
    const results: NotionRecord[] = []
    let startCursor: string | undefined
    let nextCursor: string | null = null

    do {
      const body: Record<string, unknown> = {
        page_size: options.page_size ?? 100,
      }
      if (options.filter) body.filter = options.filter
      if (options.sorts) body.sorts = options.sorts
      if (startCursor) body.start_cursor = startCursor

      const res = await notionFetch(`${NOTION_BASE}/data_sources/${dataSourceId}/query`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new NotionClientError(res.status, safeNotionMessage(res.status, text))
      }

      const page = (await res.json()) as NotionQueryResponse
      results.push(...page.results)
      nextCursor = page.next_cursor
      startCursor = page.has_more && page.next_cursor ? page.next_cursor : undefined
    } while (startCursor)

    const value = { results, has_more: false, next_cursor: nextCursor }
    queryCache.set(cacheKey, { value, expiresAt: Date.now() + cacheTtlMs })
    return value
  })()

  inFlightQueries.set(cacheKey, promise)
  try {
    return await promise
  } finally {
    inFlightQueries.delete(cacheKey)
  }
}

export function extractTitle(properties: Record<string, NotionProperty>): string {
  for (const prop of Object.values(properties)) {
    if (prop.type === 'title' && prop.title && prop.title.length > 0) {
      return prop.title[0].plain_text
    }
  }
  return ''
}

export function extractRichText(properties: Record<string, NotionProperty>, key: string): string {
  const prop = properties[key]
  if (!prop || prop.type !== 'rich_text') return ''
  return prop.rich_text?.map((t) => t.plain_text).join('') ?? ''
}

export function extractSelect(properties: Record<string, NotionProperty>, key: string): string {
  const prop = properties[key]
  if (!prop) return ''
  if (prop.type === 'select') return prop.select?.name ?? ''
  if (prop.type === 'status') return prop.status?.name ?? ''
  return ''
}

export function extractDate(properties: Record<string, NotionProperty>, key: string): string {
  const prop = properties[key]
  if (!prop || prop.type !== 'date') return ''
  return prop.date?.start ?? ''
}

export function extractNumber(properties: Record<string, NotionProperty>, key: string): number | null {
  const prop = properties[key]
  if (!prop || prop.type !== 'number') return null
  return prop.number ?? null
}

export function extractUrl(properties: Record<string, NotionProperty>, key: string): string {
  const prop = properties[key]
  if (!prop || prop.type !== 'url') return ''
  return prop.url ?? ''
}

export function extractEmail(properties: Record<string, NotionProperty>, key: string): string {
  const prop = properties[key]
  if (!prop || prop.type !== 'email') return ''
  return prop.email ?? ''
}

export function extractPhone(properties: Record<string, NotionProperty>, key: string): string {
  const prop = properties[key]
  if (!prop) return ''
  if (prop.type === 'phone_number') return prop.phone_number ?? ''
  if (prop.type === 'rich_text') return prop.rich_text?.map((t) => t.plain_text).join('') ?? ''
  return ''
}

export function extractCheckbox(properties: Record<string, NotionProperty>, key: string): boolean {
  const prop = properties[key]
  if (!prop || prop.type !== 'checkbox') return false
  return prop.checkbox === true
}

export function extractRelationIds(properties: Record<string, NotionProperty>, key: string): string[] {
  const prop = properties[key]
  if (!prop || prop.type !== 'relation') return []
  return prop.relation?.map((r) => r.id) ?? []
}

export type FlattenedNotionValue = string | number | boolean | string[] | null

export function flattenProperty(prop: NotionProperty): FlattenedNotionValue {
  switch (prop.type) {
    case 'title':
      return prop.title?.map((t) => t.plain_text).join('') ?? ''
    case 'rich_text':
      return prop.rich_text?.map((t) => t.plain_text).join('') ?? ''
    case 'select':
      return prop.select?.name ?? null
    case 'status':
      return prop.status?.name ?? null
    case 'multi_select':
      return prop.multi_select?.map((item) => item.name) ?? []
    case 'date':
      return prop.date?.start ?? null
    case 'checkbox':
      return prop.checkbox === true
    case 'number':
      return prop.number ?? null
    case 'url':
      return prop.url ?? null
    case 'email':
      return prop.email ?? null
    case 'phone_number':
      return prop.phone_number ?? null
    case 'relation':
      return prop.relation?.map((r) => r.id) ?? []
    case 'formula':
      return prop.formula?.string ?? prop.formula?.number ?? prop.formula?.boolean ?? prop.formula?.date?.start ?? null
    default:
      return null
  }
}

export function flattenRecord(record: NotionRecord): Record<string, FlattenedNotionValue> {
  const flat: Record<string, FlattenedNotionValue> = {}
  for (const [key, prop] of Object.entries(record.properties)) {
    flat[key] = flattenProperty(prop)
  }
  return flat
}

export function summarizeRecord(record: NotionRecord): string {
  const title = extractTitle(record.properties)
  if (title) return title
  const firstUseful = Object.values(flattenRecord(record)).find((value) => {
    if (Array.isArray(value)) return value.length > 0
    return value !== null && value !== '' && value !== false
  })
  return Array.isArray(firstUseful) ? firstUseful.join(', ') : String(firstUseful || 'Untitled Notion record')
}

export function notionExternalRecordUrl(record: Pick<NotionRecord, 'id' | 'url'>): string {
  if (record.url && /^https:\/\/www\.notion\.so\//.test(record.url)) return record.url
  return `https://www.notion.so/${record.id.replace(/-/g, '')}`
}

export function workspaceNotionRecordUrl(sourceName: string, recordId: string): string {
  const params = new URLSearchParams({ source: sourceName, record: recordId })
  return `/notion?${params.toString()}`
}

export interface ManifestData {
  pages: Record<string, string>
  data_sources: Record<string, { id: string; database_id?: string; page_parent_or_database_id?: string }>
}

export function loadManifest(): ManifestData {
  const currentManifestPath = manifestPath()
  if (!fs.existsSync(currentManifestPath)) {
    throw new NotionClientError(503, 'Notion manifest is not available on this Workspace server.')
  }
  return JSON.parse(fs.readFileSync(currentManifestPath, 'utf8')) as ManifestData
}

export function notionRouteError(err: unknown, fallback: string): { status: number; body: { ok: false; error: string } } {
  if (err instanceof NotionClientError) {
    return { status: err.statusCode, body: { ok: false, error: err.publicMessage } }
  }
  return { status: 500, body: { ok: false, error: fallback } }
}
