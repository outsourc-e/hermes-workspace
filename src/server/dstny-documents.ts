import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

export const DSTNY_DOCUMENT_COLLECTIONS = [
  'dstny_catalogues',
  'dstny_produits',
  'metacentrex_alianza',
  'concurrence',
  'sales_enablement',
  'pricing',
  'mydstny_si',
  'github_pdfengine',
  'livrables_valides',
  'decisions',
] as const

export const DSTNY_DOCUMENT_CHANNELS = [
  'direct',
  'ambassadeur',
  'operateur',
  'interne',
  'tous',
] as const

export const DSTNY_DOCUMENT_TYPES = [
  'catalogue',
  'fiche_produit',
  'contrat',
  'slide',
  'email',
  'export_bi',
  'pricing',
  'procedure',
  'benchmark',
  'livrable',
  'decision',
  'autre',
] as const

export const DSTNY_BUSINESS_STATUSES = [
  'brouillon',
  'actif',
  'valide',
  'obsolete',
  'archive',
] as const

export const DSTNY_CONFIDENCE_LEVELS = ['faible', 'moyen', 'fort'] as const

export const DSTNY_INGESTION_STATUSES = [
  'uploaded',
  'ready',
  'ingesting',
  'indexed',
  'error',
  'archived',
] as const

export type DstnyDocumentCollection = typeof DSTNY_DOCUMENT_COLLECTIONS[number]
export type DstnyDocumentChannel = typeof DSTNY_DOCUMENT_CHANNELS[number]
export type DstnyDocumentType = typeof DSTNY_DOCUMENT_TYPES[number]
export type DstnyBusinessStatus = typeof DSTNY_BUSINESS_STATUSES[number]
export type DstnyConfidenceLevel = typeof DSTNY_CONFIDENCE_LEVELS[number]
export type DstnyIngestionStatus = typeof DSTNY_INGESTION_STATUSES[number]

export type DstnyDocumentRecord = {
  id: string
  title: string
  originalName: string
  storedName: string
  filePath: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  collection: DstnyDocumentCollection
  product: string | null
  channel: DstnyDocumentChannel
  docType: DstnyDocumentType
  businessStatus: DstnyBusinessStatus
  confidence: DstnyConfidenceLevel
  documentDate: string | null
  supplier: string | null
  owner: string | null
  version: string | null
  summary: string | null
  keywords: Array<string>
  ingestionStatus: DstnyIngestionStatus
  ragDocId: string | null
  ragCollection: string | null
  lastError: string | null
  uploadedAt: string
  updatedAt: string
  ingestedAt: string | null
}

export type CreateDstnyDocumentInput = {
  title: string
  filePath: string
  originalName?: string | null
  storedName?: string | null
  mimeType?: string | null
  collection: DstnyDocumentCollection
  product?: string | null
  channel: DstnyDocumentChannel
  docType: DstnyDocumentType
  businessStatus: DstnyBusinessStatus
  confidence: DstnyConfidenceLevel
  documentDate?: string | null
  supplier?: string | null
  owner?: string | null
  version?: string | null
  summary?: string | null
  keywords?: Array<string> | string | null
}

export type UpdateDstnyDocumentInput = Partial<Omit<
  DstnyDocumentRecord,
  | 'id'
  | 'originalName'
  | 'storedName'
  | 'filePath'
  | 'mimeType'
  | 'sizeBytes'
  | 'checksumSha256'
  | 'uploadedAt'
>>

export type DstnyDocumentFilters = {
  collection?: string | null
  product?: string | null
  channel?: string | null
  businessStatus?: string | null
  ingestionStatus?: string | null
  q?: string | null
  includeArchived?: boolean
}

function hermesRoot(): string {
  return resolve(
    process.env.HERMES_HOME?.trim() ||
      process.env.CLAUDE_HOME?.trim() ||
      join(homedir(), '.hermes'),
  )
}

export function getDstnyDocumentRoot(): string {
  return resolve(
    process.env.DSTNY_DOCUMENT_ROOT?.trim() ||
      join(hermesRoot(), 'documents', 'dstny-inbox'),
  )
}

export function getDstnyDocumentRegistryPath(): string {
  return resolve(
    process.env.DSTNY_DOCUMENT_REGISTRY?.trim() ||
      join(hermesRoot(), 'documents', 'dstny-documents.jsonl'),
  )
}

function ensureRegistryDir(): void {
  mkdirSync(dirname(getDstnyDocumentRegistryPath()), { recursive: true })
  mkdirSync(getDstnyDocumentRoot(), { recursive: true })
}

function cleanString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function requireString(value: string | null | undefined, field: string): string {
  const cleaned = cleanString(value)
  if (!cleaned) throw new Error(`${field} is required`)
  return cleaned
}

function assertOneOf<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T[number]
  }
  throw new Error(`${field} must be one of: ${allowed.join(', ')}`)
}

export function sanitizeDstnyFileName(value: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'document'
}

export function normalizeDstnyKeywords(value: Array<string> | string | null | undefined): Array<string> {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return Array.from(new Set(raw.map((item) => item.trim()).filter(Boolean))).slice(0, 50)
}

export function checksumFileSha256(filePath: string): string {
  const hash = createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}

function readRegistryLines(): Array<DstnyDocumentRecord> {
  const registry = getDstnyDocumentRegistryPath()
  if (!existsSync(registry)) return []
  const rows: Array<DstnyDocumentRecord> = []
  for (const line of readFileSync(registry, 'utf-8').split('\n')) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line) as DstnyDocumentRecord)
    } catch {
      // Ignore corrupt lines; the append-only registry should remain readable.
    }
  }
  return rows
}

function latestById(): Map<string, DstnyDocumentRecord> {
  const docs = new Map<string, DstnyDocumentRecord>()
  for (const row of readRegistryLines()) {
    if (row?.id) docs.set(row.id, row)
  }
  return docs
}

export function appendDstnyDocumentRecord(record: DstnyDocumentRecord): DstnyDocumentRecord {
  ensureRegistryDir()
  appendFileSync(getDstnyDocumentRegistryPath(), `${JSON.stringify(record)}\n`, 'utf-8')
  return record
}

export function createDstnyDocumentRecord(input: CreateDstnyDocumentInput): DstnyDocumentRecord {
  const filePath = resolve(requireString(input.filePath, 'filePath'))
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
  const stats = statSync(filePath)
  if (!stats.isFile()) throw new Error(`Not a file: ${filePath}`)

  const now = new Date().toISOString()
  const originalName = cleanString(input.originalName) || basename(filePath)
  const storedName = cleanString(input.storedName) || sanitizeDstnyFileName(originalName)

  return appendDstnyDocumentRecord({
    id: `doc_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    title: requireString(input.title, 'title'),
    originalName,
    storedName,
    filePath,
    mimeType: cleanString(input.mimeType) || 'application/octet-stream',
    sizeBytes: stats.size,
    checksumSha256: checksumFileSha256(filePath),
    collection: assertOneOf(input.collection, DSTNY_DOCUMENT_COLLECTIONS, 'collection'),
    product: cleanString(input.product),
    channel: assertOneOf(input.channel, DSTNY_DOCUMENT_CHANNELS, 'channel'),
    docType: assertOneOf(input.docType, DSTNY_DOCUMENT_TYPES, 'docType'),
    businessStatus: assertOneOf(input.businessStatus, DSTNY_BUSINESS_STATUSES, 'businessStatus'),
    confidence: assertOneOf(input.confidence, DSTNY_CONFIDENCE_LEVELS, 'confidence'),
    documentDate: cleanString(input.documentDate),
    supplier: cleanString(input.supplier),
    owner: cleanString(input.owner),
    version: cleanString(input.version),
    summary: cleanString(input.summary),
    keywords: normalizeDstnyKeywords(input.keywords),
    ingestionStatus: 'uploaded',
    ragDocId: null,
    ragCollection: null,
    lastError: null,
    uploadedAt: now,
    updatedAt: now,
    ingestedAt: null,
  })
}

function normalizeUpdatedRecord(current: DstnyDocumentRecord, updates: UpdateDstnyDocumentInput): DstnyDocumentRecord {
  const next: DstnyDocumentRecord = {
    ...current,
    ...updates,
    id: current.id,
    originalName: current.originalName,
    storedName: current.storedName,
    filePath: current.filePath,
    mimeType: current.mimeType,
    sizeBytes: current.sizeBytes,
    checksumSha256: current.checksumSha256,
    uploadedAt: current.uploadedAt,
    updatedAt: new Date().toISOString(),
  }

  next.title = requireString(next.title, 'title')
  next.collection = assertOneOf(next.collection, DSTNY_DOCUMENT_COLLECTIONS, 'collection')
  next.channel = assertOneOf(next.channel, DSTNY_DOCUMENT_CHANNELS, 'channel')
  next.docType = assertOneOf(next.docType, DSTNY_DOCUMENT_TYPES, 'docType')
  next.businessStatus = assertOneOf(next.businessStatus, DSTNY_BUSINESS_STATUSES, 'businessStatus')
  next.confidence = assertOneOf(next.confidence, DSTNY_CONFIDENCE_LEVELS, 'confidence')
  next.ingestionStatus = assertOneOf(next.ingestionStatus, DSTNY_INGESTION_STATUSES, 'ingestionStatus')
  next.product = cleanString(next.product)
  next.documentDate = cleanString(next.documentDate)
  next.supplier = cleanString(next.supplier)
  next.owner = cleanString(next.owner)
  next.version = cleanString(next.version)
  next.summary = cleanString(next.summary)
  next.ragDocId = cleanString(next.ragDocId)
  next.ragCollection = cleanString(next.ragCollection)
  next.lastError = cleanString(next.lastError)
  next.ingestedAt = cleanString(next.ingestedAt)
  next.keywords = normalizeDstnyKeywords(next.keywords)
  return next
}

export function updateDstnyDocumentRecord(id: string, updates: UpdateDstnyDocumentInput): DstnyDocumentRecord | null {
  const current = latestById().get(id)
  if (!current) return null
  return appendDstnyDocumentRecord(normalizeUpdatedRecord(current, updates))
}

export function getDstnyDocumentRecord(id: string): DstnyDocumentRecord | null {
  return latestById().get(id) ?? null
}

export function listDstnyDocuments(filters: DstnyDocumentFilters = {}): Array<DstnyDocumentRecord> {
  let docs = Array.from(latestById().values())
  if (!filters.includeArchived) {
    docs = docs.filter((doc) => doc.businessStatus !== 'archive' && doc.ingestionStatus !== 'archived')
  }
  if (filters.collection) docs = docs.filter((doc) => doc.collection === filters.collection)
  if (filters.product) docs = docs.filter((doc) => doc.product === filters.product)
  if (filters.channel) docs = docs.filter((doc) => doc.channel === filters.channel)
  if (filters.businessStatus) docs = docs.filter((doc) => doc.businessStatus === filters.businessStatus)
  if (filters.ingestionStatus) docs = docs.filter((doc) => doc.ingestionStatus === filters.ingestionStatus)
  const q = filters.q?.trim().toLowerCase()
  if (q) {
    docs = docs.filter((doc) => [
      doc.title,
      doc.originalName,
      doc.product,
      doc.supplier,
      doc.summary,
      ...doc.keywords,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)))
  }
  return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title))
}
