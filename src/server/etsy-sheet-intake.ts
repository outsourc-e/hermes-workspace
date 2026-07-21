import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ETSY_ROOM_LOCKED_ACTIONS } from '../lib/war-room/living-v3/etsy-room-contracts'
import {


  buildSheetIntakeDossierMarkdown,
  createSheetIntakeManifest,
  normalizeSheetIntakeRows,
  parseSheetIntakeText,
  slugifySheetProduct
} from '../lib/war-room/living-v3/etsy-sheet-intake'
import type {EtsySheetIntakeRunManifest, EtsySheetIntakeSourceDescriptor} from '../lib/war-room/living-v3/etsy-sheet-intake';

export type EtsySheetIntakeRequest = {
  sourceType: 'pasted_text' | 'local_file' | 'public_csv_url'
  pastedText?: string
  localPath?: string
  publicCsvUrl?: string
}

export type EtsySheetIntakeResult =
  | { ok: true; run: EtsySheetIntakeRunManifest }
  | { ok: false; error: string; googleAuthRequired?: boolean }

const MAX_TEXT_BYTES = 1024 * 1024
const PUBLIC_CSV_TIMEOUT_MS = 7_000
const ARTIFACT_ROOT_SEGMENTS = ['data', 'etsy-market-lab', 'sheet-intake'] as const
const SAFE_IMPORT_SEGMENTS = ['data', 'etsy-market-lab', 'imports'] as const
const LOCAL_EXTENSIONS = new Set(['.csv', '.tsv', '.json', '.txt'])
const BLOCKED_PUBLIC_HOST_FRAGMENTS = [
  'etsy.',
  'alura.',
  'aliexpress.',
  'alibaba.',
  'discord.',
  'shotlab.',
  'seller.',
  'openapi.',
]

function isInside(parent: string, child: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === '' || Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function byteLength(value: string) {
  return Buffer.byteLength(value, 'utf8')
}

function newRunId(nowMs = Date.now()) {
  return `sheet-intake-${nowMs.toString(36)}`
}

export function etsySheetIntakeArtifactRoot(workspaceRoot = process.cwd()) {
  return path.join(workspaceRoot, ...ARTIFACT_ROOT_SEGMENTS)
}

export function etsySheetIntakeSafeImportRoot(workspaceRoot = process.cwd()) {
  return path.join(workspaceRoot, ...SAFE_IMPORT_SEGMENTS)
}

export function validateEtsySheetIntakeLocalPath(inputPath: string, workspaceRoot = process.cwd()) {
  const safeRoot = etsySheetIntakeSafeImportRoot(workspaceRoot)
  const resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(workspaceRoot, inputPath)
  if (!isInside(safeRoot, resolved)) {
    return { ok: false as const, error: `Local imports must be inside ${path.relative(workspaceRoot, safeRoot)}.` }
  }
  const extension = path.extname(resolved).toLowerCase()
  if (!LOCAL_EXTENSIONS.has(extension)) {
    return { ok: false as const, error: 'Sheet Intake V1 supports CSV, TSV, JSON, and TXT only.' }
  }
  return { ok: true as const, path: resolved, root: safeRoot }
}

function validatePublicCsvUrl(rawUrl: string) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false as const, error: 'Public CSV URL is invalid.' }
  }
  if (url.protocol !== 'https:') {
    return { ok: false as const, error: 'Public CSV URL must use HTTPS.' }
  }
  const host = url.hostname.toLowerCase()
  if (BLOCKED_PUBLIC_HOST_FRAGMENTS.some((fragment) => host.includes(fragment))) {
    return { ok: false as const, error: 'Marketplace/live-service URLs are blocked for Sheet Intake V1.' }
  }
  const isGoogleSheet = host.includes('google.') || host === 'docs.google.com'
  if (isGoogleSheet) {
    const csvish = url.pathname.includes('/export') || url.searchParams.get('output') === 'csv' || url.searchParams.get('format') === 'csv'
    if (!csvish) {
      return { ok: false as const, error: 'Google auth not connected.', googleAuthRequired: true }
    }
  }
  return { ok: true as const, url, isGoogleSheet }
}

async function readLocalText(localPath: string, workspaceRoot: string) {
  const validated = validateEtsySheetIntakeLocalPath(localPath, workspaceRoot)
  if (!validated.ok) return validated
  const fileStat = await stat(validated.path).catch(() => null)
  if (!fileStat?.isFile()) return { ok: false as const, error: 'Local import file not found.' }
  if (fileStat.size > MAX_TEXT_BYTES) return { ok: false as const, error: 'Local import file is too large for Sheet Intake V1.' }
  const text = await readFile(validated.path, 'utf8')
  return {
    ok: true as const,
    text,
    source: {
      type: 'local_file',
      label: path.basename(validated.path),
      sourceRef: path.relative(workspaceRoot, validated.path),
      originalName: path.basename(validated.path),
    } satisfies EtsySheetIntakeSourceDescriptor,
  }
}

async function fetchPublicCsvText(
  publicCsvUrl: string,
  fetchImpl: typeof fetch = fetch,
) {
  const validated = validatePublicCsvUrl(publicCsvUrl)
  if (!validated.ok) return validated
  const response = await fetchImpl(validated.url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(PUBLIC_CSV_TIMEOUT_MS),
    headers: {
      accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1',
    },
  })
  if ((response.status === 401 || response.status === 403) && validated.isGoogleSheet) {
    return { ok: false as const, error: 'Google auth not connected.', googleAuthRequired: true }
  }
  if (!response.ok) return { ok: false as const, error: `Public CSV fetch failed with HTTP ${response.status}.` }
  const text = await response.text()
  if (byteLength(text) > MAX_TEXT_BYTES) return { ok: false as const, error: 'Public CSV is too large for Sheet Intake V1.' }
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const looksHtml = /^\s*</.test(text) || contentType.includes('text/html')
  if (looksHtml && validated.isGoogleSheet) return { ok: false as const, error: 'Google auth not connected.', googleAuthRequired: true }
  if (looksHtml) return { ok: false as const, error: 'Public CSV URL returned HTML, not CSV text.' }
  return {
    ok: true as const,
    text,
    source: {
      type: 'public_csv_url',
      label: validated.url.hostname,
      sourceRef: validated.url.toString(),
      originalName: path.basename(validated.url.pathname) || validated.url.hostname,
    } satisfies EtsySheetIntakeSourceDescriptor,
  }
}

async function loadInputText(
  input: EtsySheetIntakeRequest,
  workspaceRoot: string,
  fetchImpl?: typeof fetch,
) {
  if (input.sourceType === 'pasted_text') {
    const text = input.pastedText?.trim() ?? ''
    if (!text) return { ok: false as const, error: 'Paste CSV, TSV, or JSON text before importing.' }
    if (byteLength(text) > MAX_TEXT_BYTES) return { ok: false as const, error: 'Pasted text is too large for Sheet Intake V1.' }
    return {
      ok: true as const,
      text,
      source: {
        type: 'pasted_text',
        label: 'Pasted intake text',
        sourceRef: 'operator-paste',
      } satisfies EtsySheetIntakeSourceDescriptor,
    }
  }
  if (input.sourceType === 'local_file') {
    if (!input.localPath?.trim()) return { ok: false as const, error: 'Enter a local import path inside data/etsy-market-lab/imports/.' }
    return readLocalText(input.localPath.trim(), workspaceRoot)
  }
  if (!input.publicCsvUrl?.trim()) return { ok: false as const, error: 'Enter a public CSV URL.' }
  return fetchPublicCsvText(input.publicCsvUrl.trim(), fetchImpl)
}

function uniqueDossierPath(productSlug: string, index: number, used: Set<string>) {
  const base = slugifySheetProduct(productSlug)
  let fileName = `${base}.md`
  let counter = index + 1
  while (used.has(fileName)) {
    fileName = `${base}-${counter}.md`
    counter += 1
  }
  used.add(fileName)
  return fileName
}

export async function runEtsySheetIntake(
  input: EtsySheetIntakeRequest,
  options: { workspaceRoot?: string; nowMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<EtsySheetIntakeResult> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd()
  const nowMs = options.nowMs ?? Date.now()
  const runId = newRunId(nowMs)
  const loaded = await loadInputText(input, workspaceRoot, options.fetchImpl)
  if (!loaded.ok) return loaded

  let parsed
  try {
    parsed = parseSheetIntakeText(loaded.text)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  const normalized = normalizeSheetIntakeRows(parsed.rows, loaded.source)
  const runRoot = path.join(etsySheetIntakeArtifactRoot(workspaceRoot), runId)
  const productRoot = path.join(runRoot, 'products')
  await mkdir(productRoot, { recursive: true })

  const usedFileNames = new Set<string>()
  const products = await Promise.all(normalized.products.map(async (product, index) => {
    const fileName = uniqueDossierPath(product.slug, index, usedFileNames)
    const dossierPath = path.join(productRoot, fileName)
    const relativeDossierPath = path.relative(workspaceRoot, dossierPath)
    const dossierMarkdown = buildSheetIntakeDossierMarkdown({
      ...product,
      dossierPath: relativeDossierPath,
    })
    await writeFile(dossierPath, dossierMarkdown.endsWith('\n') ? dossierMarkdown : `${dossierMarkdown}\n`, 'utf8')
    return {
      ...product,
      dossierPath: relativeDossierPath,
      dossierMarkdown,
    }
  }))

  const manifest = createSheetIntakeManifest({
    runId,
    createdAtMs: nowMs,
    source: loaded.source,
    artifactRoot: path.relative(workspaceRoot, runRoot),
    products,
    rejectedRows: normalized.rejectedRows,
    warnings: products.flatMap((product) => product.warnings),
    lockedActions: [...ETSY_ROOM_LOCKED_ACTIONS],
  })

  await writeFile(path.join(runRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return { ok: true, run: manifest }
}
