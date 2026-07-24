import { execFileSync } from 'node:child_process'
import {  existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  ETSY_OPS_ACTION_POLICIES,
  ETSY_OPS_AGENT_ANIMATION_MANIFESTS,
  ETSY_OPS_ROOM_ID,
  ETSY_OPS_ROOM_PLUGIN,
  ETSY_OPS_ROUTES,
  ETSY_OPS_STATIONS,









  etsyOpsActionPolicyById,
  etsyOpsJuliusAgentAssetPath,
  etsyOpsStationById,
  etsyOpsV4AgentAssetPath
} from '../lib/war-room/etsy-ops-room-contract'
import { createKanbanCard } from './kanban-backend'
import { getProductIntelligence } from './product-intelligence-data'
import type {EtsyOpsActionId, EtsyOpsAgentState, EtsyOpsKeywordSummary, EtsyOpsMediaFile, EtsyOpsMediaSource, EtsyOpsProductSummary, EtsyOpsRoomState, EtsyOpsStationId, EtsyOpsSupplierLink} from '../lib/war-room/etsy-ops-room-contract';
import type {Dirent} from 'node:fs';

type ProductIntelligencePayload = ReturnType<typeof getProductIntelligence> & {
  ok?: boolean
  counts?: Record<string, unknown>
  products?: Array<Record<string, unknown>>
  opportunities?: Array<Record<string, unknown>>
  keywords?: Array<Record<string, unknown>>
  keyword_opportunities?: Array<Record<string, unknown>>
}

export type EtsyOpsActionInput = {
  actionId: EtsyOpsActionId
  stationId: EtsyOpsStationId
  productId?: string | null
  agentId?: string | null
  note?: string
}

export type EtsyOpsActionResult = {
  ok: boolean
  actionId: EtsyOpsActionId
  mode: 'read-only-preview' | 'safe-local-write' | 'manual-approval-packet' | 'blocked-packet'
  riskClass: 'read-only' | 'local-write' | 'approval-required' | 'blocked'
  message: string
  card?: unknown
  error?: string | null
}

type MediaRoot = {
  id: string
  label: string
  rootPath: string
  purpose: string
}

const PRODUCT_RESEARCH_ROOT = path.join(homedir(), '.hermes', 'product-research')
const MAX_MEDIA_SCAN_DEPTH = 4
const MAX_MEDIA_FILES_PER_KIND = 36
const MAX_TEXT_PREVIEW_BYTES = 256 * 1024
const MAX_IMAGE_PREVIEW_BYTES = 8 * 1024 * 1024

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])
const SOURCE_EXTENSIONS = new Set(['.csv', '.tsv', '.json', '.jsonl', '.md', '.txt', '.xlsx'])

function asText(value: unknown, fallback = '') {
  return String(value ?? fallback).trim()
}

function asNullableText(value: unknown) {
  const text = asText(value)
  return text ? text : null
}

function asNumber(value: unknown, fallback: number | null = null) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function compactText(value: unknown, maxLength = 180) {
  const text = asText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

function sqliteQuote(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function dbPath(workspaceRoot = process.cwd()) {
  return path.join(workspaceRoot, 'data', 'product-intelligence', 'product_intelligence.db')
}

function mediaUrl(absPath: string) {
  return `/api/war-room-etsy-ops?mediaPath=${encodeURIComponent(absPath)}`
}

export function getEtsyOpsMediaRoots(workspaceRoot = process.cwd(), homeDir = homedir()): Array<MediaRoot> {
  const configured = (process.env.HERMES_ETSY_MEDIA_ROOTS ?? '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean)

  return [
    ...configured.map((rootPath, index) => ({
      id: `configured-${index + 1}`,
      label: `Configured media ${index + 1}`,
      rootPath: path.resolve(rootPath),
      purpose: 'Operator-approved product media/source folder from HERMES_ETSY_MEDIA_ROOTS.',
    })),
    {
      id: 'product-research',
      label: 'Hermes product research',
      rootPath: path.join(homeDir, '.hermes', 'product-research'),
      purpose: 'Read-only Alura/Product Intelligence exports and source research files.',
    },
    {
      id: 'product-intelligence-db',
      label: 'Product Intelligence DB',
      rootPath: path.join(workspaceRoot, 'data', 'product-intelligence'),
      purpose: 'Local imported DB and summary files for DolaroBoutique.',
    },
    {
      id: 'operator-pictures',
      label: 'Operator Etsy media',
      rootPath: path.join(homeDir, 'Pictures', 'Hermes Etsy Media'),
      purpose: 'Optional real product/mockup media folder you can add later.',
    },
    {
      id: 'operator-downloads',
      label: 'Downloaded Etsy media',
      rootPath: path.join(homeDir, 'Downloads', 'hermes-etsy-media'),
      purpose: 'Optional staging folder for downloaded real product/mockup images.',
    },
  ]
}

export function isAllowedEtsyOpsMediaPath(absPath: string, roots = getEtsyOpsMediaRoots()) {
  const resolved = path.resolve(absPath)
  return roots.some((root) => {
    const rootPath = path.resolve(root.rootPath)
    const relative = path.relative(rootPath, resolved)
    return relative === '' || Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  })
}

function toMediaFile(filePath: string, root: MediaRoot, kind: EtsyOpsMediaFile['kind']): EtsyOpsMediaFile | null {
  try {
    const stats = statSync(filePath)
    if (!stats.isFile()) return null
    const extension = path.extname(filePath).toLowerCase()
    return {
      id: `${root.id}:${path.relative(root.rootPath, filePath)}`,
      name: path.basename(filePath),
      path: filePath,
      relativePath: path.relative(root.rootPath, filePath),
      kind,
      extension,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      previewUrl: kind === 'image' ? mediaUrl(filePath) : null,
    }
  } catch {
    return null
  }
}

function scanRoot(root: MediaRoot, depth = 0, images: Array<EtsyOpsMediaFile>, sourceFiles: Array<EtsyOpsMediaFile>) {
  if (depth > MAX_MEDIA_SCAN_DEPTH) return
  if (images.length >= MAX_MEDIA_FILES_PER_KIND && sourceFiles.length >= MAX_MEDIA_FILES_PER_KIND) return
  let entries: Array<Dirent<string>>
  try {
    entries = readdirSync(root.rootPath, { withFileTypes: true, encoding: 'utf8' })
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const fullPath = path.join(root.rootPath, entry.name)
    if (entry.isDirectory()) {
      scanRoot({ ...root, rootPath: fullPath }, depth + 1, images, sourceFiles)
      continue
    }
    const extension = path.extname(entry.name).toLowerCase()
    if (IMAGE_EXTENSIONS.has(extension) && images.length < MAX_MEDIA_FILES_PER_KIND) {
      const file = toMediaFile(fullPath, root, 'image')
      if (file) images.push(file)
    } else if (SOURCE_EXTENSIONS.has(extension) && sourceFiles.length < MAX_MEDIA_FILES_PER_KIND) {
      const file = toMediaFile(fullPath, root, 'source-file')
      if (file) sourceFiles.push(file)
    }
  }
}

export function scanEtsyOpsMediaSources(workspaceRoot = process.cwd()) {
  const roots = getEtsyOpsMediaRoots(workspaceRoot)
  const images: Array<EtsyOpsMediaFile> = []
  const sourceFiles: Array<EtsyOpsMediaFile> = []
  const sourceSummaries: Array<EtsyOpsMediaSource> = []

  for (const root of roots) {
    const beforeImages = images.length
    const beforeSources = sourceFiles.length
    scanRoot(root, 0, images, sourceFiles)
    sourceSummaries.push({
      id: root.id,
      label: root.label,
      rootPath: root.rootPath,
      exists: existsSync(root.rootPath),
      purpose: root.purpose,
      imageCount: images.length - beforeImages,
      sourceFileCount: sourceFiles.length - beforeSources,
    })
  }

  return { sources: sourceSummaries, images, sourceFiles }
}

export function readEtsyOpsMediaFile(absPath: string, workspaceRoot = process.cwd()) {
  const resolved = path.resolve(absPath)
  const roots = getEtsyOpsMediaRoots(workspaceRoot)
  if (!isAllowedEtsyOpsMediaPath(resolved, roots)) {
    return { ok: false as const, status: 403, error: 'Forbidden media path' }
  }
  if (!existsSync(resolved)) return { ok: false as const, status: 404, error: 'Media file not found' }
  const stats = statSync(resolved)
  if (!stats.isFile()) return { ok: false as const, status: 400, error: 'Media path is not a file' }
  const extension = path.extname(resolved).toLowerCase()
  const isImage = IMAGE_EXTENSIONS.has(extension)
  const maxBytes = isImage ? MAX_IMAGE_PREVIEW_BYTES : MAX_TEXT_PREVIEW_BYTES
  if (stats.size > maxBytes) return { ok: false as const, status: 413, error: 'Media file too large for preview' }
  return {
    ok: true as const,
    body: readFileSync(resolved),
    mime: mimeForExtension(extension),
  }
}

function mimeForExtension(extension: string) {
  switch (extension) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    case '.json':
    case '.jsonl':
      return 'application/json; charset=utf-8'
    case '.csv':
      return 'text/csv; charset=utf-8'
    case '.tsv':
    case '.txt':
    case '.md':
      return 'text/plain; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

function normalizeProducts(payload: ProductIntelligencePayload): Array<EtsyOpsProductSummary> {
  const rows = (payload.products?.length ? payload.products : payload.opportunities ?? []).slice(0, 24)
  return rows.map((row, index) => ({
    id: asText(row.id, `product-${index + 1}`),
    title: compactText(row.title ?? 'Untitled product', 110),
    niche: asNullableText(row.niche),
    status: compactText(row.status ?? 'unknown', 120),
    currentRoom: asNullableText(row.current_room),
    etsyAngle: compactText(row.etsy_angle, 180) || null,
    shotlabStatus: compactText(row.shotlab_status, 180) || null,
    sourceFile: asNullableText(row.source_file),
    supplierLinkCount: asNumber(row.supplier_link_count, 0) ?? 0,
    keywords: asText(row.keywords).split(',').map((keyword) => keyword.trim()).filter(Boolean).slice(0, 8),
    opportunityScore: asNumber(row.opportunity_score),
    nextAction: compactText(row.next_action, 180) || null,
    priority: asNullableText(row.priority),
  }))
}

function normalizeKeywords(payload: ProductIntelligencePayload): Array<EtsyOpsKeywordSummary> {
  const rows = (payload.keyword_opportunities?.length ? payload.keyword_opportunities : payload.keywords ?? []).slice(0, 18)
  return rows.map((row) => ({
    keyword: compactText(row.keyword ?? 'keyword', 90),
    signalScore: asNumber(row.signal_score),
    score: asNumber(row.score),
    avgSales: asNumber(row.avg_sales),
    competitionLevel: asNullableText(row.competition_level),
    avgPrice: asNumber(row.avg_price),
    nextAction: compactText(row.next_action, 140) || null,
  }))
}

function readSupplierLinks(productIds: Array<string>, workspaceRoot = process.cwd()): Array<EtsyOpsSupplierLink> {
  if (!productIds.length) return []
  const database = dbPath(workspaceRoot)
  if (!existsSync(database)) return []
  const ids = productIds.slice(0, 24).map(sqliteQuote).join(',')
  const sql = `SELECT product_id AS productId, platform, url, status FROM supplier_links WHERE product_id IN (${ids}) ORDER BY product_id ASC, platform ASC LIMIT 80`
  try {
    const raw = execFileSync('sqlite3', [database, '-json', sql], {
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    }).trim()
    if (!raw) return []
    return (JSON.parse(raw) as Array<Record<string, unknown>>).map((row) => ({
      productId: asText(row.productId),
      platform: asText(row.platform, 'supplier'),
      url: asText(row.url),
      status: asText(row.status, 'needs_review'),
    })).filter((row) => row.productId && row.url)
  } catch {
    return []
  }
}

function countFromPayload(payload: ProductIntelligencePayload, key: string, fallback: number) {
  return asNumber(payload.counts?.[key], fallback) ?? fallback
}

function buildAgents(): Array<EtsyOpsAgentState> {
  return [
    {
      id: 'athena-market-strategist',
      label: 'Athena',
      shortLabel: 'ATH',
      role: 'Product strategy, SEO signal reading, and supplier proof triage for DolaroBoutique.',
      persona: 'Calm, sharp, protective, and evidence-first. She challenges weak products before anyone spends time or money.',
      mythology: 'Athena, goddess of strategy and craft intelligence.',
      historicalMirror: 'Sun Tzu style patience: win with preparation before the market sees the move.',
      modelProfileId: 'chatgpt-5.5',
      stationId: 'product-intake',
      targetStationId: 'seo-oracle',
      homeStationId: 'product-intake',
      primaryStationIds: ['product-intake', 'seo-oracle', 'supplier-proof'],
      movementState: 'working',
      spriteUrl: etsyOpsV4AgentAssetPath('athena-market-strategist', 'portrait.png'),
      portraitUrl: etsyOpsV4AgentAssetPath('athena-market-strategist', 'portrait.png'),
      accent: '#73e2d5',
      carryingPacket: 'Opportunity scroll',
      speech: 'I am checking product evidence before anyone drafts or spends.',
      capabilities: ['Product Intelligence triage', 'keyword signal reading', 'supplier proof review', 'block weak opportunities'],
      route: [
        { id: 'athena-to-intake', label: 'Walk to Product Intake', stationId: 'product-intake', point: { x: 24, y: 30 }, path: [{ x: 50, y: 96 }, { x: 50, y: 88 }, { x: 24, y: 88 }, { x: 24, y: 39 }], durationMs: 9_400, activity: 'walking', carryingPacket: null, message: 'Moving back from Rest Hall to Product Intake.' },
        { id: 'athena-intake-work', label: 'Score product packet', stationId: 'product-intake', point: { x: 24, y: 30 }, durationMs: 13_600, activity: 'working', carryingPacket: 'Opportunity scroll', message: 'Reading Product Intelligence rows and weak-signal traps.', actionId: 'inspect-product' },
        { id: 'athena-to-seo', label: 'Carry to SEO Oracle', stationId: 'seo-oracle', point: { x: 49, y: 24 }, path: [{ x: 35, y: 30 }, { x: 35, y: 24 }], durationMs: 8_800, activity: 'carrying', carryingPacket: 'Opportunity scroll', message: 'Handing the product packet to SEO Oracle.' },
        { id: 'athena-seo-work', label: 'Read keyword constellation', stationId: 'seo-oracle', point: { x: 49, y: 24 }, durationMs: 15_200, activity: 'working', carryingPacket: 'Keyword signal orb', message: 'Matching keywords to buyer intent, not just volume.', actionId: 'prepare-listing-draft' },
        { id: 'athena-to-proof', label: 'Supplier proof patrol', stationId: 'supplier-proof', point: { x: 77, y: 31 }, path: [{ x: 61, y: 24 }, { x: 61, y: 31 }], durationMs: 10_400, activity: 'walking', carryingPacket: null, message: 'Cross-checking supplier proof before the forge receives work.' },
        { id: 'athena-proof-talk', label: 'Warn approval lane', stationId: 'supplier-proof', point: { x: 77, y: 31 }, durationMs: 11_200, activity: 'talking', carryingPacket: 'Supplier proof note', message: 'Supplier action stays proof-only until DLV approval.', actionId: 'request-dlv-approval' },
        { id: 'athena-to-rest', label: 'Return to Rest Hall', stationId: 'rest-lounge', point: { x: 50, y: 115 }, path: [{ x: 77, y: 39 }, { x: 50, y: 39 }, { x: 50, y: 96 }], durationMs: 10_600, activity: 'walking', carryingPacket: null, message: 'Leaving Etsy Ops through the south door for Rest Hall.' },
        { id: 'athena-rest', label: 'Quiet review', stationId: 'rest-lounge', point: { x: 50, y: 115 }, durationMs: 10_800, activity: 'resting', carryingPacket: null, message: 'Resting in the separate hall with the shortlist closed.' },
      ],
      animation: ETSY_OPS_AGENT_ANIMATION_MANIFESTS['athena-market-strategist'],
      chat: {
        workerId: 'seoagent',
        modelProfileId: 'chatgpt-5.5',
        systemPrompt: 'You are Athena in the DolaroBoutique Etsy Ops room. Answer as an evidence-first product strategist. Never claim live Etsy or supplier actions ran.',
        suggestedPrompts: [
          'Which product in the queue is actually worth pushing today?',
          'What keyword risk would block this listing?',
          'What proof do you need before this goes to ShotLab?',
        ],
      },
    },
    {
      id: 'hephaestus-shotlab-artificer',
      label: 'Hephaestus',
      shortLabel: 'HEP',
      role: 'ShotLab/media forge operator who turns real media and product evidence into visual prep packets.',
      persona: 'Warm, stubborn, maker-brained, and practical. He wants usable briefs, not pretty fantasy placeholders.',
      mythology: 'Hephaestus, master smith of the forge.',
      historicalMirror: 'Leonardo da Vinci workshop discipline: sketch, test, refine, then hand off.',
      modelProfileId: 'chatgpt-5.5',
      stationId: 'media-sources',
      targetStationId: 'shotlab-prep',
      homeStationId: 'shotlab-prep',
      primaryStationIds: ['media-sources', 'shotlab-prep'],
      movementState: 'working',
      spriteUrl: etsyOpsV4AgentAssetPath('hephaestus-shotlab-artificer', 'portrait.png'),
      portraitUrl: etsyOpsV4AgentAssetPath('hephaestus-shotlab-artificer', 'portrait.png'),
      accent: '#ff8b4a',
      carryingPacket: 'ShotLab brief',
      speech: 'I only forge from real media or an honest empty state.',
      capabilities: ['real media preview', 'ShotLab prompt pack', 'mockup QA checklist', 'paid generation approval packet'],
      route: [
        { id: 'hephaestus-to-media', label: 'Inspect media shelf', stationId: 'media-sources', point: { x: 29, y: 68 }, path: [{ x: 50, y: 96 }, { x: 50, y: 68 }, { x: 29, y: 68 }], durationMs: 8_700, activity: 'walking', carryingPacket: null, message: 'Walking to approved Media Sources.' },
        { id: 'hephaestus-media-work', label: 'Sort source images', stationId: 'media-sources', point: { x: 29, y: 68 }, durationMs: 12_600, activity: 'working', carryingPacket: 'Media crate', message: 'Checking real files; no fake product previews.', actionId: 'open-media-source' },
        { id: 'hephaestus-to-shotlab', label: 'Carry brief to forge', stationId: 'shotlab-prep', point: { x: 57, y: 68 }, path: [{ x: 29, y: 68 }, { x: 43, y: 68 }], durationMs: 9_400, activity: 'carrying', carryingPacket: 'Media crate', message: 'Carrying media evidence into ShotLab Prep.' },
        { id: 'hephaestus-shotlab-work', label: 'Forge prompt pack', stationId: 'shotlab-prep', point: { x: 57, y: 68 }, durationMs: 16_400, activity: 'working', carryingPacket: 'ShotLab brief', message: 'Building prompt pack, QA checklist, and paid-generation lock.', actionId: 'queue-shotlab-prep' },
        { id: 'hephaestus-to-draft', label: 'Send visual prep', stationId: 'listing-draft', point: { x: 70, y: 68 }, path: [{ x: 57, y: 68 }, { x: 66, y: 68 }], durationMs: 9_800, activity: 'carrying', carryingPacket: 'ShotLab brief', message: 'Handing visual prep to Listing Draft.' },
        { id: 'hephaestus-draft-talk', label: 'Explain missing media', stationId: 'listing-draft', point: { x: 70, y: 68 }, durationMs: 9_400, activity: 'talking', carryingPacket: null, message: 'If no real images are mapped, the listing waits instead of inventing assets.' },
        { id: 'hephaestus-to-rest', label: 'Return to Rest Hall', stationId: 'rest-lounge', point: { x: 53, y: 116 }, path: [{ x: 70, y: 68 }, { x: 50, y: 68 }, { x: 50, y: 96 }], durationMs: 10_900, activity: 'walking', carryingPacket: null, message: 'Walking out to the separate Rest Hall until the forge has real inputs.' },
        { id: 'hephaestus-rest', label: 'Bench idle', stationId: 'rest-lounge', point: { x: 53, y: 116 }, durationMs: 12_200, activity: 'resting', carryingPacket: null, message: 'Resting in the separate hall until real media arrives.' },
      ],
      animation: ETSY_OPS_AGENT_ANIMATION_MANIFESTS['hephaestus-shotlab-artificer'],
      chat: {
        workerId: 'assetcreator',
        modelProfileId: 'chatgpt-5.5',
        systemPrompt: 'You are Hephaestus in the DolaroBoutique Etsy Ops room. Answer as a practical media forge operator. Use real files only and create approval packets for paid generation.',
        suggestedPrompts: [
          'Prepare a ShotLab brief from the current product evidence.',
          'What real images are missing before mockups?',
          'Build the QA checklist for this product image set.',
        ],
      },
    },
    {
      id: 'caesar-hermes-approval-commander',
      label: 'Caesar Hermes',
      shortLabel: 'CAH',
      role: 'Listing scribe, workflow courier, margin guard, and manual approval commander.',
      persona: 'Direct, decisive, charming, and strict about gates. He can move fast, but never skips your approval.',
      mythology: 'Hermes as messenger and boundary keeper.',
      historicalMirror: 'Julius Caesar command cadence: summarize, decide, record, then dispatch.',
      modelProfileId: 'chatgpt-5.5',
      stationId: 'listing-draft',
      targetStationId: 'dlv-approval',
      homeStationId: 'listing-draft',
      primaryStationIds: ['listing-draft', 'price-margin', 'dlv-approval', 'archive-vault', 'rest-lounge'],
      movementState: 'waiting-approval',
      spriteUrl: etsyOpsJuliusAgentAssetPath('portrait.png'),
      portraitUrl: etsyOpsJuliusAgentAssetPath('portrait.png'),
      accent: '#f1c36f',
      carryingPacket: 'Approval seal',
      speech: 'I can draft and route, but the gate stays locked until you approve.',
      capabilities: ['listing draft packet', 'margin review', 'approval packet creation', 'archive evidence handoff'],
      route: [
        { id: 'caesar-to-draft', label: 'Walk to Listing Draft', stationId: 'listing-draft', point: { x: 76, y: 58 }, path: [{ x: 50, y: 96 }, { x: 50, y: 88 }, { x: 76, y: 88 }, { x: 76, y: 66 }], durationMs: 12_400, activity: 'walking', carryingPacket: null, message: 'Moving to Listing Draft.' },
        { id: 'caesar-draft-work', label: 'Write local draft', stationId: 'listing-draft', point: { x: 76, y: 58 }, durationMs: 15_600, activity: 'working', carryingPacket: 'Listing tablet', message: 'Drafting title, tags, description, and upload preview locally.', actionId: 'prepare-listing-draft' },
        { id: 'caesar-to-margin', label: 'Review margin', stationId: 'price-margin', point: { x: 35, y: 81 }, path: [{ x: 76, y: 66 }, { x: 58, y: 66 }, { x: 58, y: 88 }, { x: 35, y: 88 }], durationMs: 11_200, activity: 'carrying', carryingPacket: 'Listing tablet', message: 'Routing draft through margin evidence.' },
        { id: 'caesar-margin-work', label: 'Margin gate', stationId: 'price-margin', point: { x: 35, y: 81 }, durationMs: 11_400, activity: 'working', carryingPacket: 'Margin seal', message: 'Checking price evidence before approval.', actionId: 'request-dlv-approval' },
        { id: 'caesar-to-approval', label: 'Manual approval march', stationId: 'dlv-approval', point: { x: 59, y: 83 }, path: [{ x: 46, y: 81 }, { x: 51, y: 83 }], durationMs: 9_200, activity: 'carrying', carryingPacket: 'Approval seal', message: 'Carrying the packet to your approval gate.' },
        { id: 'caesar-wait-approval', label: 'Wait for DLV', stationId: 'dlv-approval', point: { x: 59, y: 83 }, durationMs: 16_200, activity: 'waiting-approval', carryingPacket: 'Approval seal', message: 'No Etsy publish, edit, supplier message, purchase, or paid generation runs without you.', actionId: 'request-dlv-approval' },
        { id: 'caesar-to-archive', label: 'Archive result', stationId: 'archive-vault', point: { x: 82, y: 83 }, path: [{ x: 67, y: 83 }, { x: 75, y: 83 }], durationMs: 9_700, activity: 'carrying', carryingPacket: 'Evidence folder', message: 'Archiving the decision trail for the next cycle.' },
        { id: 'caesar-to-rest', label: 'Return to Rest Hall', stationId: 'rest-lounge', point: { x: 47, y: 116 }, path: [{ x: 82, y: 88 }, { x: 50, y: 88 }, { x: 50, y: 96 }], durationMs: 12_200, activity: 'walking', carryingPacket: null, message: 'Leaving command through the south door for Rest Hall.' },
        { id: 'caesar-rest', label: 'Command pause', stationId: 'rest-lounge', point: { x: 47, y: 116 }, durationMs: 11_600, activity: 'resting', carryingPacket: null, message: 'Standing down in Rest Hall until a packet reaches command.' },
      ],
      animation: ETSY_OPS_AGENT_ANIMATION_MANIFESTS['caesar-hermes-approval-commander'],
      chat: {
        workerId: 'warroomagent',
        modelProfileId: 'chatgpt-5.5',
        systemPrompt: 'You are Caesar Hermes in the DolaroBoutique Etsy Ops room. Answer as a concise approval commander. Convert any live external intent into a manual approval packet.',
        suggestedPrompts: [
          'Summarize what needs my approval right now.',
          'Prepare a local listing draft packet.',
          'What would be blocked if I tried to publish now?',
        ],
      },
    },
  ]
}

export function buildEtsyOpsRoomState(workspaceRoot = process.cwd()): EtsyOpsRoomState {
  const payload = getProductIntelligence({ limit: 40, minScore: 0 }) as ProductIntelligencePayload
  const products = payload.ok === false ? [] : normalizeProducts(payload)
  const keywords = payload.ok === false ? [] : normalizeKeywords(payload)
  const supplierLinks = readSupplierLinks(products.map((product) => product.id), workspaceRoot)
  const media = scanEtsyOpsMediaSources(workspaceRoot)

  return {
    ok: true,
    mode: 'etsy-ops-room-v2',
    store: { id: 'dolaro_boutique', name: 'DolaroBoutique', status: 'active-local-control' },
    generatedAt: new Date().toISOString(),
    plugin: ETSY_OPS_ROOM_PLUGIN,
    room: {
      id: ETSY_OPS_ROOM_ID,
      label: 'DolaroBoutique Etsy Ops Room',
      theme: 'Living direct top-down stone, bronze, lapis, and mythic military tabletop room; overlay stays minimal and all heavy detail opens on click.',
      stations: ETSY_OPS_STATIONS,
      routes: ETSY_OPS_ROUTES,
      actions: ETSY_OPS_ACTION_POLICIES,
    },
    safety: {
      liveEtsyEnabled: false,
      supplierMessagesEnabled: false,
      paidGenerationEnabled: false,
      accountWritesEnabled: false,
      workspaceWritesAllowed: true,
      allowedWriteClasses: ['workspace-kanban-card-create', 'workspace-kanban-card-update', 'local-preview-read'],
      blockedWriteClasses: ['etsy-publish', 'etsy-listing-edit', 'supplier-message', 'purchase', 'paid-generation', 'refund', 'renewal', 'account-edit', 'delete'],
    },
    products,
    keywords,
    supplierLinks,
    media,
    agents: buildAgents(),
    counts: {
      products: countFromPayload(payload, 'products', products.length),
      keywords: countFromPayload(payload, 'keywords', keywords.length),
      supplierLinks: countFromPayload(payload, 'supplier_links', supplierLinks.length),
      mediaImages: media.images.length,
      mediaSourceFiles: media.sourceFiles.length,
    },
    notes: [
      payload.ok === false ? compactText((payload as { error?: unknown }).error, 180) || 'Product Intelligence is unavailable.' : 'Product Intelligence connected read-only.',
      media.images.length === 0 ? 'No real product/mockup images are currently mapped. Media Sources shows the real empty state instead of fake products.' : 'Real media images are available from approved local roots.',
      'Live Etsy, supplier, paid, and account actions are represented as manual approval packets only.',
      'V2 room route now consumes the V4 from-scratch generated runtime assets: 96 declared agent frames, animated stations, and approval-only Hermes gates.',
    ],
  }
}

export function classifyEtsyOpsAction(actionId: EtsyOpsActionId) {
  const policy = etsyOpsActionPolicyById(actionId)
  if (!policy) return null
  return {
    actionId,
    riskClass: policy.riskClass,
    mode: policy.mode,
    liveExternalMutation: false as const,
    createsKanbanCard: policy.createsKanbanCard,
    targetSystem: policy.targetSystem,
  }
}

function specForAction(input: EtsyOpsActionInput, product: EtsyOpsProductSummary | null) {
  const station = etsyOpsStationById(input.stationId)
  const policy = etsyOpsActionPolicyById(input.actionId)
  return [
    `War Room Etsy Ops action: ${policy?.label ?? input.actionId}`,
    `Store: DolaroBoutique`,
    `Room: ${ETSY_OPS_ROOM_ID}`,
    `Station: ${station?.label ?? input.stationId}`,
    input.agentId ? `Agent: ${input.agentId}` : null,
    product ? `Product: ${product.title} (${product.id})` : 'Product: no product selected',
    product?.etsyAngle ? `Etsy angle: ${product.etsyAngle}` : null,
    product?.shotlabStatus ? `ShotLab status: ${product.shotlabStatus}` : null,
    `Mode: ${policy?.mode ?? 'unknown'}`,
    `Safety: no Etsy publish/edit, supplier message, purchase, paid generation, account edit, refund, renewal, delete, or external write is performed by this action.`,
    input.note?.trim() ? `DLV note: ${input.note.trim()}` : null,
  ].filter(Boolean).join('\n')
}

export async function runEtsyOpsAction(input: EtsyOpsActionInput, workspaceRoot = process.cwd()): Promise<EtsyOpsActionResult> {
  const policy = etsyOpsActionPolicyById(input.actionId)
  if (!policy) {
    return { ok: false, actionId: input.actionId, mode: 'blocked-packet', riskClass: 'blocked', message: 'Unsupported Etsy Ops action.', error: 'Unsupported action' }
  }
  const station = etsyOpsStationById(input.stationId)
  if (!station) {
    return { ok: false, actionId: input.actionId, mode: policy.mode, riskClass: policy.riskClass, message: 'Unsupported Etsy Ops station.', error: 'Unsupported station' }
  }

  const state = buildEtsyOpsRoomState(workspaceRoot)
  const product = state.products.find((item) => item.id === input.productId) ?? state.products.at(0)

  if (!policy.createsKanbanCard) {
    return {
      ok: true,
      actionId: input.actionId,
      mode: policy.mode,
      riskClass: policy.riskClass,
      message: input.actionId === 'open-media-source'
        ? `Media Sources inspected: ${state.counts.mediaImages} images, ${state.counts.mediaSourceFiles} source files.`
        : product
          ? `Read-only evidence loaded for ${product.title}.`
          : 'Read-only Etsy Ops evidence loaded.',
      error: null,
    }
  }

  const status = policy.mode === 'manual-approval-packet' ? 'review' : input.actionId === 'hold-for-review' ? 'blocked' : 'ready'
  const card = await createKanbanCard({
    title: `[Etsy Ops] ${policy.label}${product ? ` · ${product.title}` : ''}`,
    spec: specForAction(input, product ?? null),
    acceptanceCriteria: [
      'Workspace/local packet only; no external marketplace or paid action performed.',
      'Product, media, supplier, keyword, and pricing evidence attached or explicitly marked missing.',
      'DLV approval required before any Etsy publish/edit, supplier contact, purchase, or paid generation.',
    ],
    assignedWorker: input.agentId?.trim() || station.agentId,
    reviewer: 'chatgptheavy',
    status,
    missionId: 'war-room-etsy-ops-room-v2',
    createdBy: 'war-room-etsy-ops',
  })

  return {
    ok: true,
    actionId: input.actionId,
    mode: policy.mode,
    riskClass: policy.riskClass,
    message: policy.mode === 'manual-approval-packet'
      ? `${policy.label} converted into a manual approval packet. No live action ran.`
      : `${policy.label} queued as a safe local workspace card.`,
    card,
    error: null,
  }
}
