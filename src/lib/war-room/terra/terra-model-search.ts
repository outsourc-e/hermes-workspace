export type TerraInternetModelSearchRequest = {
  query?: string
  limit?: number
  categoryId?: string
  days?: number
}

export type TerraInternetModelCandidate = {
  id: string
  title: string
  source: 'Printables'
  sourceUrl: string
  imageUrl?: string
  publishedAt?: string
  likes: number
  downloads: number
  rating?: number
  category?: string
  license?: string
  score: number
  fitNotes: Array<string>
  riskFlags: Array<string>
  proof: Array<string>
}

export type TerraInternetModelSearchResult =
  | {
      ok: true
      mode: 'read_only_printables_search'
      status: 'completed' | 'blocked'
      searchedAtMs: number
      query: string
      limit: number
      totalCount: number
      candidates: Array<TerraInternetModelCandidate>
      filters: {
        paid: 'free'
        aiGenerated: false
        ordering: 'popular'
        publishedDateLimitDays: number
        categoryId?: string
      }
      skillBasis: string
      sourceNote: string
      lockedActions: Array<string>
      error?: string
    }
  | { ok: false; status: number; error: string }

type FetchLike = typeof fetch

type PrintablesImage = {
  filePath?: unknown
  imageWidth?: unknown
  imageHeight?: unknown
}

type PrintablesItem = {
  id?: unknown
  name?: unknown
  slug?: unknown
  datePublished?: unknown
  firstPublish?: unknown
  likesCount?: unknown
  downloadCount?: unknown
  ratingAvg?: unknown
  aiGenerated?: unknown
  price?: unknown
  image?: PrintablesImage | null
  category?: unknown
  license?: unknown
}

const PRINTABLES_GRAPHQL_ENDPOINT = 'https://api.printables.com/graphql/'
const DEFAULT_LIMIT = 12
const DEFAULT_DAYS = 60
const MAX_LIMIT = 24
const LOCKED_ACTIONS = ['download_model_file', 'redistribute_model', 'slice_model', 'printer_upload', 'printer_start']
const SKILL_BASIS = 'openscad-3d-print-factory/references/free-trending-printable-model-discovery.md'

const PRINTABLES_SEARCH_QUERY = `query TerraPrintableModelSearch($limit:Int,$offset:Int,$cat:ID,$days:Int,$ordering:SearchChoicesEnum,$paid:PaidEnum,$ai:Boolean,$query:String!){
  searchPrints2(query:$query,limit:$limit,offset:$offset,categoryId:$cat,publishedDateLimitDays:$days,ordering:$ordering,paid:$paid,aiGenerated:$ai){
    totalCount
    items{
      id name slug datePublished firstPublish likesCount downloadCount ratingAvg aiGenerated price
      image{filePath imageWidth imageHeight}
      category{id nameEn path{id nameEn}}
      license{name abbreviation}
    }
  }
}`

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return fallback
}

function boolValue(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function safeLimit(value: unknown) {
  const parsed = numberValue(value, DEFAULT_LIMIT)
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)))
}

function safeDays(value: unknown) {
  const parsed = numberValue(value, DEFAULT_DAYS)
  return Math.max(7, Math.min(365, Math.floor(parsed)))
}

function normalizeTerraSearchQuery(raw: string) {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, 90)
  if (!text) return ''
  const lowered = text.toLowerCase()
  const hasHebrew = /[\u0590-\u05ff]/.test(text)
  if (!hasHebrew) return text

  const normalizedTerms: Array<string> = []
  if (/פידג|פיג['׳]?ט|ספינר|סנסור|לחיץ|צעצוע/.test(lowered)) normalizedTerms.push('fidget toy')
  if (/כבל|חוט/.test(lowered) && /קליפ|תופסן|מחזיק|מסדר|ארגוני?/.test(lowered)) normalizedTerms.push('cable clip')
  if (/מעמד|סטנד/.test(lowered) && /טלפון|אייפון|סמארטפון|נייד/.test(lowered)) normalizedTerms.push('phone stand')
  if (/קופס|אחסון|ארגונית|מגירה/.test(lowered)) normalizedTerms.push('storage box organizer')
  if (/מחזיק/.test(lowered) && /מפתח|מפתחות/.test(lowered)) normalizedTerms.push('key holder')
  if (/צעצוע|ילד|ילדים/.test(lowered) && !normalizedTerms.length) normalizedTerms.push('toy')
  if (/מודל|תלת|הדפס|הדפסה|stl|3mf/.test(lowered) && !normalizedTerms.length) normalizedTerms.push('3d printable model')

  return Array.from(new Set(normalizedTerms)).join(' ') || text
}

function safeQuery(value: unknown) {
  return normalizeTerraSearchQuery(typeof value === 'string' ? value : '')
}

function safeCategoryId(value: unknown) {
  const text = stringValue(value)
  return text && /^\d+$/.test(text) ? text : undefined
}

function slugifyFallback(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function printablesModelUrl(id: string, slug: string | undefined, title: string) {
  const finalSlug = slug || slugifyFallback(title)
  return finalSlug ? `https://www.printables.com/model/${id}-${finalSlug}` : `https://www.printables.com/model/${id}`
}

function printablesMediaUrl(filePath: unknown) {
  const raw = stringValue(filePath)
  if (!raw) return undefined
  if (/^https?:\/\//i.test(raw)) return raw
  const clean = raw.replace(/^\/+/, '')
  return `https://media.printables.com/${clean}`
}

function categoryLabel(category: unknown) {
  if (!isRecord(category)) return undefined
  const direct = stringValue(category.nameEn)
  if (direct) return direct
  const path = Array.isArray(category.path) ? category.path : []
  const names = path.map((part) => isRecord(part) ? stringValue(part.nameEn) : undefined).filter(Boolean) as Array<string>
  return names.join(' / ') || undefined
}

function licenseLabel(license: unknown) {
  if (!isRecord(license)) return undefined
  const abbreviation = stringValue(license.abbreviation)
  const name = stringValue(license.name)
  return abbreviation && name ? `${abbreviation} · ${name}` : abbreviation ?? name
}

function recencyScore(dateText?: string) {
  if (!dateText) return 0
  const ms = Date.parse(dateText)
  if (!Number.isFinite(ms)) return 0
  const daysAgo = Math.max(0, (Date.now() - ms) / 86_400_000)
  if (daysAgo <= 14) return 20
  if (daysAgo <= 60) return 12
  if (daysAgo <= 180) return 5
  return 0
}

function normalizeCandidate(item: PrintablesItem): TerraInternetModelCandidate | undefined {
  const idNumber = numberValue(item.id, NaN)
  const id = Number.isFinite(idNumber) ? String(Math.trunc(idNumber)) : stringValue(item.id)
  const title = stringValue(item.name)
  if (!id || !title) return undefined
  const slug = stringValue(item.slug)
  const publishedAt = stringValue(item.datePublished) ?? stringValue(item.firstPublish)
  const likes = Math.max(0, Math.round(numberValue(item.likesCount, 0)))
  const downloads = Math.max(0, Math.round(numberValue(item.downloadCount, 0)))
  const ratingRaw = numberValue(item.ratingAvg, NaN)
  const rating = Number.isFinite(ratingRaw) ? Math.round(ratingRaw * 10) / 10 : undefined
  const category = categoryLabel(item.category)
  const license = licenseLabel(item.license)
  const price = numberValue(item.price, 0)
  const aiGenerated = boolValue(item.aiGenerated)
  const score = Math.round(likes * 2 + downloads / 45 + (rating ?? 0) * 14 + recencyScore(publishedAt))
  const riskFlags = [
    !license ? 'license missing' : undefined,
    aiGenerated ? 'AI-generated flag' : undefined,
    price > 0 ? 'not free despite filter' : undefined,
    downloads < 25 && likes < 5 ? 'low adoption signal' : undefined,
  ].filter(Boolean) as Array<string>
  const fitNotes = [
    `${likes} likes / ${downloads} downloads`,
    rating ? `rating ${rating}` : 'rating not shown',
    category ? `category ${category}` : 'category not shown',
    license ? `license ${license}` : 'check license before commercial use',
  ]
  return {
    id,
    title,
    source: 'Printables',
    sourceUrl: printablesModelUrl(id, slug, title),
    imageUrl: printablesMediaUrl(item.image?.filePath),
    publishedAt,
    likes,
    downloads,
    rating,
    category,
    license,
    score,
    fitNotes,
    riskFlags,
    proof: [
      'Printables GraphQL searchPrints2',
      'paid=free',
      'aiGenerated=false',
      'ordering=popular',
      'No file download or printer action',
    ],
  }
}

export async function searchTerraInternetModels(
  request: TerraInternetModelSearchRequest = {},
  nowMs = Date.now(),
  fetcher: FetchLike = fetch,
): Promise<TerraInternetModelSearchResult> {
  const query = safeQuery(request.query)
  const limit = safeLimit(request.limit)
  const days = safeDays(request.days)
  const categoryId = safeCategoryId(request.categoryId)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8500)
  const filters = {
    paid: 'free' as const,
    aiGenerated: false as const,
    ordering: 'popular' as const,
    publishedDateLimitDays: days,
    ...(categoryId ? { categoryId } : {}),
  }
  try {
    const response = await fetcher(PRINTABLES_GRAPHQL_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'Hermes-Terra-Workspace/1.0 read-only model search',
      },
      body: JSON.stringify({
        query: PRINTABLES_SEARCH_QUERY,
        variables: {
          limit: Math.min(50, Math.max(limit * 3, limit)),
          offset: 0,
          cat: categoryId,
          days,
          ordering: 'popular',
          paid: 'free',
          ai: false,
          query,
        },
      }),
    })
    if (!response.ok) {
      return {
        ok: true,
        mode: 'read_only_printables_search',
        status: 'blocked',
        searchedAtMs: nowMs,
        query,
        limit,
        totalCount: 0,
        candidates: [],
        filters,
        skillBasis: SKILL_BASIS,
        sourceNote: 'Printables GraphQL read-only search was attempted; no download/slice/print action ran.',
        lockedActions: LOCKED_ACTIONS,
        error: `Printables search blocked: HTTP ${response.status}`,
      }
    }
    const payload = await response.json() as unknown
    const searchNode = isRecord(payload) && isRecord(payload.data) && isRecord(payload.data.searchPrints2)
      ? payload.data.searchPrints2
      : undefined
    const items = searchNode && Array.isArray(searchNode.items) ? searchNode.items : []
    const candidates = items
      .map((item) => isRecord(item) ? normalizeCandidate(item as PrintablesItem) : undefined)
      .filter(Boolean) as Array<TerraInternetModelCandidate>
    candidates.sort((a, b) => b.score - a.score || b.likes - a.likes || b.downloads - a.downloads)
    return {
      ok: true,
      mode: 'read_only_printables_search',
      status: 'completed',
      searchedAtMs: nowMs,
      query,
      limit,
      totalCount: searchNode ? numberValue(searchNode.totalCount, candidates.length) : candidates.length,
      candidates: candidates.slice(0, limit),
      filters,
      skillBasis: SKILL_BASIS,
      sourceNote: 'Read-only Printables search. It shows candidates and proof only; downloads, slicing, uploads, and print start stay locked.',
      lockedActions: LOCKED_ACTIONS,
    }
  } catch (error) {
    return {
      ok: true,
      mode: 'read_only_printables_search',
      status: 'blocked',
      searchedAtMs: nowMs,
      query,
      limit,
      totalCount: 0,
      candidates: [],
      filters,
      skillBasis: SKILL_BASIS,
      sourceNote: 'Printables GraphQL read-only search could not complete. No download/slice/print action ran.',
      lockedActions: LOCKED_ACTIONS,
      error: (error as Error).message,
    }
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}
