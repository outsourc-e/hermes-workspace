export type EtsySheetIntakeSourceType = 'pasted_text' | 'local_file' | 'public_csv_url'

export type EtsySheetIntakeSourceDescriptor = {
  type: EtsySheetIntakeSourceType
  label: string
  sourceRef: string
  originalName?: string
}

export type EtsySheetIntakeRawRow = {
  rowId: string
  rowNumber: number
  values: Record<string, string>
}

export type EtsySheetIntakeWarningCode =
  | 'missing_title'
  | 'missing_image'
  | 'missing_source_url'
  | 'weak_evidence'
  | 'duplicate'
  | 'too_many_variants'
  | 'unsafe_handoff'

export type EtsySheetIntakeQaWarning = {
  code: EtsySheetIntakeWarningCode
  label: string
  severity: 'info' | 'warning' | 'blocker'
  rowId?: string
  productId?: string
}

export type EtsySheetIntakeReadiness = 'ready' | 'partial' | 'blocked'

export type EtsySheetIntakeNormalizedProduct = {
  productId: string
  rowId: string
  sourceRowId: string
  sourceLabel: string
  sourceRef: string
  slug: string
  title: string
  proposedTitle: string
  imageRefs: Array<string>
  thumbnailRef?: string
  sourceUrl?: string
  supplierUrl?: string
  variants: Array<string>
  priceFields: Record<string, string>
  costFields: Record<string, string>
  metricsFields: Record<string, string>
  demandFields: Record<string, string>
  evidenceIds: Array<string>
  notes: Array<string>
  missingFields: Array<string>
  riskFlags: Array<string>
  warnings: Array<EtsySheetIntakeQaWarning>
  duplicateOf?: string
  score: number
  scoreExplanation: string
  shotLabReadiness: EtsySheetIntakeReadiness
  seoReadiness: EtsySheetIntakeReadiness
  recommendedNextStep: string
  approvalNotes: string
  dossierPath?: string
  dossierMarkdown?: string
}

export type EtsySheetIntakeRejectedRow = {
  rowId: string
  rowNumber: number
  reason: string
  values: Record<string, string>
}

export type EtsySheetIntakeQaSummary = {
  totalRows: number
  validProducts: number
  rejectedRows: number
  duplicates: number
  missingImages: number
  missingSourceUrls: number
  weakEvidence: number
  tooManyVariants: number
  unsafeHandoff: number
  finalRecommendation: string
}

export type EtsySheetIntakeRunManifest = {
  runId: string
  createdAtMs: number
  source: EtsySheetIntakeSourceDescriptor
  artifactRoot: string
  products: Array<EtsySheetIntakeNormalizedProduct>
  dedupedProducts: Array<EtsySheetIntakeNormalizedProduct>
  rejectedRows: Array<EtsySheetIntakeRejectedRow>
  warnings: Array<EtsySheetIntakeQaWarning>
  qa: EtsySheetIntakeQaSummary
  lockedActions: Array<string>
}

export type EtsySheetIntakeGalleryFilter =
  | 'all'
  | 'ready'
  | 'missing-image'
  | 'weak-evidence'
  | 'duplicate'
  | 'needs-source'
  | 'shotlab-ready'

export type EtsySheetIntakeParseResult = {
  rows: Array<EtsySheetIntakeRawRow>
  detectedFormat: 'csv' | 'tsv' | 'json'
}

const titleAliases = new Set(['title', 'product', 'productname', 'name', 'item', 'itemtitle', 'listingtitle', 'producttitle'])
const imageAliases = new Set(['image', 'images', 'imageurl', 'imageurls', 'photo', 'photos', 'thumbnail', 'mainimage', 'mainimageurl'])
const sourceUrlAliases = new Set(['source', 'sourceurl', 'producturl', 'url', 'link', 'listingurl'])
const supplierUrlAliases = new Set(['supplier', 'supplierurl', 'supplierlink', 'sourcevendor', 'vendorurl'])
const variantAliases = new Set(['variant', 'variants', 'option', 'options', 'color', 'colors', 'size', 'sizes'])
const priceAliases = new Set(['price', 'saleprice', 'retailprice', 'targetprice', 'etsyprice'])
const costAliases = new Set(['cost', 'unitcost', 'suppliercost', 'shippingcost', 'landedcost'])
const metricAliases = new Set(['score', 'keywordscore', 'volume', 'searchvolume', 'competition', 'sales', 'views', 'revenue'])
const demandAliases = new Set(['demand', 'trend', 'trends', 'alura', 'alurasales', 'favorites', 'reviews'])
const evidenceAliases = new Set(['evidence', 'evidenceid', 'evidenceids', 'proof', 'proofurl', 'notes', 'note'])

const unsafeTerms = [
  'lookalike',
  'replica',
  'dupe',
  'inspired by cartier',
  'inspired by van cleef',
  'tiffany style',
  'branded',
  'designer copy',
]

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function slugifySheetProduct(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 58) || 'sheet-product'
}

function clean(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function compactList(values: Array<string | undefined | null>, limit = 12) {
  const output: Array<string> = []
  const seen = new Set<string>()
  for (const value of values) {
    const text = clean(value)
    if (!text || seen.has(text)) continue
    seen.add(text)
    output.push(text)
    if (output.length >= limit) break
  }
  return output
}

function splitList(value: string | undefined, limit = 12) {
  if (!value) return []
  return compactList(value.split(/[\n;|]+|,\s+(?=\S)/g), limit)
}

function fieldValue(row: Record<string, string>, aliases: Set<string>) {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.has(normalizeHeader(key)) && clean(value)) return clean(value)
  }
  return ''
}

function collectFields(row: Record<string, string>, aliases: Set<string>) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key, value]) => aliases.has(normalizeHeader(key)) && clean(value))
      .map(([key, value]) => [key, clean(value)]),
  )
}

function collectListFields(row: Record<string, string>, aliases: Set<string>, limit = 12) {
  return compactList(
    Object.entries(row)
      .filter(([key]) => aliases.has(normalizeHeader(key)))
      .flatMap(([, value]) => splitList(value, limit)),
    limit,
  )
}

function titleKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function isSafeThumbnailRef(value: string) {
  return value.startsWith('/') || value.startsWith('./') || value.startsWith('../') || value.startsWith('data:image/')
}

function warning(
  code: EtsySheetIntakeWarningCode,
  label: string,
  severity: EtsySheetIntakeQaWarning['severity'],
  rowId: string,
  productId?: string,
): EtsySheetIntakeQaWarning {
  return { code, label, severity, rowId, productId }
}

function scoreProduct(input: {
  imageRefs: Array<string>
  sourceUrl?: string
  supplierUrl?: string
  metricsFields: Record<string, string>
  demandFields: Record<string, string>
  evidenceIds: Array<string>
  variants: Array<string>
  duplicateOf?: string
  riskFlags: Array<string>
}) {
  const parts: Array<string> = []
  let score = 42
  if (input.imageRefs.length) {
    score += 18
    parts.push('image evidence present')
  } else {
    parts.push('missing image evidence')
  }
  if (input.sourceUrl || input.supplierUrl) {
    score += 16
    parts.push('source URL present')
  } else {
    parts.push('source URL missing')
  }
  if (Object.keys(input.metricsFields).length || Object.keys(input.demandFields).length) {
    score += 14
    parts.push('demand or metric fields present')
  } else {
    parts.push('weak demand evidence')
  }
  if (input.evidenceIds.length) {
    score += 8
    parts.push('evidence/proof notes present')
  }
  if (input.variants.length && input.variants.length <= 8) score += 4
  if (input.variants.length > 12) {
    score -= 12
    parts.push('too many variants for safe handoff')
  }
  if (input.duplicateOf) {
    score -= 22
    parts.push('duplicate row')
  }
  if (input.riskFlags.length) {
    score -= 24
    parts.push('unsafe claims or brand-risk language')
  }
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    scoreExplanation: parts.join('; '),
  }
}

function readiness(product: {
  imageRefs: Array<string>
  sourceUrl?: string
  supplierUrl?: string
  duplicateOf?: string
  riskFlags: Array<string>
  metricsFields: Record<string, string>
  demandFields: Record<string, string>
}) {
  const hasSource = Boolean(product.sourceUrl || product.supplierUrl)
  const unsafe = Boolean(product.riskFlags.length)
  const shotLabReadiness: EtsySheetIntakeReadiness = product.imageRefs.length && hasSource && !unsafe && !product.duplicateOf
    ? 'ready'
    : unsafe || product.duplicateOf
      ? 'blocked'
      : 'partial'
  const seoReadiness: EtsySheetIntakeReadiness = Object.keys(product.metricsFields).length || Object.keys(product.demandFields).length || hasSource
    ? unsafe ? 'blocked' : 'ready'
    : 'partial'
  return { shotLabReadiness, seoReadiness }
}

function warningCounts(products: Array<EtsySheetIntakeNormalizedProduct>, rejectedRows: Array<EtsySheetIntakeRejectedRow>) {
  const count = (code: EtsySheetIntakeWarningCode) => products.filter((product) => product.warnings.some((item) => item.code === code)).length
  const unsafeHandoff = count('unsafe_handoff')
  const readyCount = products.filter((product) => product.shotLabReadiness === 'ready').length
  const finalRecommendation = readyCount
    ? `${readyCount} product${readyCount === 1 ? '' : 's'} ready for local Loki/Thor prep.`
    : products.length
      ? 'Keep intake local and fix missing image/source/evidence before ShotLab prep.'
      : 'No valid products yet. Add a title column and at least one product row.'
  return {
    totalRows: products.length + rejectedRows.length,
    validProducts: products.length,
    rejectedRows: rejectedRows.length,
    duplicates: count('duplicate'),
    missingImages: count('missing_image'),
    missingSourceUrls: count('missing_source_url'),
    weakEvidence: count('weak_evidence'),
    tooManyVariants: count('too_many_variants'),
    unsafeHandoff,
    finalRecommendation,
  }
}

function detectFormat(text: string): 'csv' | 'tsv' | 'json' {
  const cleanText = text.trim()
  if (cleanText.startsWith('[') || cleanText.startsWith('{')) return 'json'
  const firstLine = cleanText.split(/\r?\n/, 1)[0] ?? ''
  return firstLine.includes('\t') && !firstLine.includes(',') ? 'tsv' : 'csv'
}

function parseDelimitedRows(text: string, delimiter: ',' | '\t') {
  const rows: Array<Array<string>> = []
  let row: Array<string> = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    if (char === '\r') continue
    field += char
  }

  row.push(field)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function rawRowsFromObjects(items: Array<Record<string, unknown>>): Array<EtsySheetIntakeRawRow> {
  return items.map((item, index) => ({
    rowId: clean(item.rowId ?? item.id ?? `row-${index + 1}`),
    rowNumber: index + 1,
    values: Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : clean(value)])),
  }))
}

export function parseSheetIntakeText(text: string): EtsySheetIntakeParseResult {
  const trimmed = text.trim()
  if (!trimmed) return { rows: [], detectedFormat: 'csv' }
  const detectedFormat = detectFormat(trimmed)
  if (detectedFormat === 'json') {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) {
      return { rows: rawRowsFromObjects(parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))), detectedFormat }
    }
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      const rows = Array.isArray(record.products)
        ? record.products
        : Array.isArray(record.rows)
          ? record.rows
          : [record]
      return { rows: rawRowsFromObjects(rows.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))), detectedFormat }
    }
    return { rows: [], detectedFormat }
  }

  const delimiter = detectedFormat === 'tsv' ? '\t' : ','
  const table = parseDelimitedRows(trimmed, delimiter)
  if (!table.length) return { rows: [], detectedFormat }
  const headers = table[0].map((header, index) => clean(header) || `Column ${index + 1}`)
  const dataRows = table.slice(1)
  return {
    detectedFormat,
    rows: dataRows
      .filter((row) => row.some((value) => clean(value)))
      .map((row, index) => ({
        rowId: `row-${index + 1}`,
        rowNumber: index + 2,
        values: Object.fromEntries(headers.map((header, headerIndex) => [header, clean(row[headerIndex])])) as Record<string, string>,
      })),
  }
}

export function normalizeSheetIntakeRows(
  rows: Array<EtsySheetIntakeRawRow>,
  source: EtsySheetIntakeSourceDescriptor,
): {
  products: Array<EtsySheetIntakeNormalizedProduct>
  rejectedRows: Array<EtsySheetIntakeRejectedRow>
  warnings: Array<EtsySheetIntakeQaWarning>
  qa: EtsySheetIntakeQaSummary
} {
  const titleMap = new Map<string, string>()
  const products: Array<EtsySheetIntakeNormalizedProduct> = []
  const rejectedRows: Array<EtsySheetIntakeRejectedRow> = []

  rows.forEach((row, index) => {
    const title = fieldValue(row.values, titleAliases)
    if (!title) {
      rejectedRows.push({
        rowId: row.rowId,
        rowNumber: row.rowNumber,
        reason: 'Missing product title/name.',
        values: row.values,
      })
      return
    }

    const sourceUrl = fieldValue(row.values, sourceUrlAliases) || undefined
    const supplierUrl = fieldValue(row.values, supplierUrlAliases) || undefined
    const imageRefs = collectListFields(row.values, imageAliases, 12)
    const variants = collectListFields(row.values, variantAliases, 24)
    const priceFields = collectFields(row.values, priceAliases)
    const costFields = collectFields(row.values, costAliases)
    const metricsFields = collectFields(row.values, metricAliases)
    const demandFields = collectFields(row.values, demandAliases)
    const notes = collectListFields(row.values, evidenceAliases, 16)
    const evidenceIds = compactList([
      ...notes,
      sourceUrl,
      supplierUrl,
      ...Object.values(metricsFields),
      ...Object.values(demandFields),
    ], 20)
    const key = `${titleKey(title)}|${sourceUrl ?? supplierUrl ?? ''}`
    const duplicateOf = titleMap.get(key)
    const slugBase = slugifySheetProduct(title)
    const productId = `${slugBase}-${index + 1}`
    if (!duplicateOf) titleMap.set(key, productId)

    const riskFlags = unsafeTerms
      .filter((term) => `${title} ${notes.join(' ')}`.toLowerCase().includes(term))
      .map((term) => `Unsafe marketplace/claim term: ${term}`)
    const warnings: Array<EtsySheetIntakeQaWarning> = []
    if (!imageRefs.length) warnings.push(warning('missing_image', 'Missing product image/ref.', 'warning', row.rowId, productId))
    if (!sourceUrl && !supplierUrl) warnings.push(warning('missing_source_url', 'Missing source or supplier URL.', 'warning', row.rowId, productId))
    if (!evidenceIds.length || (!Object.keys(metricsFields).length && !Object.keys(demandFields).length && !sourceUrl && !supplierUrl)) {
      warnings.push(warning('weak_evidence', 'Weak evidence: no source, proof, or demand metrics.', 'warning', row.rowId, productId))
    }
    if (duplicateOf) warnings.push(warning('duplicate', `Duplicate of ${duplicateOf}.`, 'info', row.rowId, productId))
    if (variants.length > 12) warnings.push(warning('too_many_variants', 'Too many variants for safe first handoff.', 'warning', row.rowId, productId))
    if (riskFlags.length) warnings.push(warning('unsafe_handoff', 'Unsafe handoff: remove brand-risk or unsupported claim language.', 'blocker', row.rowId, productId))

    const score = scoreProduct({ imageRefs, sourceUrl, supplierUrl, metricsFields, demandFields, evidenceIds, variants, duplicateOf, riskFlags })
    const ready = readiness({ imageRefs, sourceUrl, supplierUrl, duplicateOf, riskFlags, metricsFields, demandFields })
    const missingFields = compactList([
      imageRefs.length ? undefined : 'image URLs/local image refs',
      sourceUrl || supplierUrl ? undefined : 'supplier/source URL',
      Object.keys(metricsFields).length || Object.keys(demandFields).length ? undefined : 'metrics/demand fields',
      riskFlags.length ? 'safe claim cleanup' : undefined,
      duplicateOf ? 'duplicate resolution' : undefined,
    ], 12)
    const product: EtsySheetIntakeNormalizedProduct = {
      productId,
      rowId: row.rowId,
      sourceRowId: row.rowId,
      sourceLabel: source.label,
      sourceRef: source.sourceRef,
      slug: slugBase,
      title,
      proposedTitle: title,
      imageRefs,
      thumbnailRef: imageRefs.find(isSafeThumbnailRef),
      sourceUrl,
      supplierUrl,
      variants,
      priceFields,
      costFields,
      metricsFields,
      demandFields,
      evidenceIds,
      notes,
      missingFields,
      riskFlags,
      warnings,
      duplicateOf,
      score: score.score,
      scoreExplanation: score.scoreExplanation,
      shotLabReadiness: ready.shotLabReadiness,
      seoReadiness: ready.seoReadiness,
      recommendedNextStep: ready.shotLabReadiness === 'ready'
        ? 'Choose product / ShotLab prep local packet.'
        : 'Fix missing source truth, image refs, duplicate, or unsafe claim warnings before ShotLab prep.',
      approvalNotes: 'Local-only dossier. Live Etsy, supplier, paid ShotLab, Google write, and browser actions remain locked.',
    }
    products.push(product)
  })

  const warnings = products.flatMap((product) => product.warnings)
  const qa = warningCounts(products, rejectedRows)
  return { products, rejectedRows, warnings, qa }
}

function bulletList(values: Array<string>, empty = 'none') {
  if (!values.length) return `- ${empty}`
  return values.map((value) => `- ${value}`).join('\n')
}

function fieldsList(fields: Record<string, string>, empty = 'none') {
  const entries = Object.entries(fields)
  if (!entries.length) return `- ${empty}`
  return entries.map(([key, value]) => `- ${key}: ${value}`).join('\n')
}

export function buildSheetIntakeDossierMarkdown(product: EtsySheetIntakeNormalizedProduct) {
  return [
    `# ${product.title}`,
    '',
    `Source row id: ${product.sourceRowId}`,
    `Source file/link: ${product.sourceRef || product.sourceLabel}`,
    '',
    '## Image URLs / Local Image Refs',
    bulletList(product.imageRefs),
    '',
    '## Supplier / Source URL',
    bulletList(compactList([product.supplierUrl, product.sourceUrl])),
    '',
    '## Variants / Options',
    bulletList(product.variants),
    '',
    '## Price / Cost Fields',
    fieldsList({ ...product.priceFields, ...product.costFields }),
    '',
    '## Metrics / Demand Fields',
    fieldsList({ ...product.metricsFields, ...product.demandFields }),
    '',
    '## Missing Fields',
    bulletList(product.missingFields),
    '',
    '## Risk Flags',
    bulletList(product.riskFlags),
    '',
    '## Score Explanation',
    `Score: ${product.score}`,
    '',
    product.scoreExplanation,
    '',
    '## ShotLab Readiness',
    product.shotLabReadiness,
    '',
    '## SEO Readiness',
    product.seoReadiness,
    '',
    '## Recommended Next Step',
    product.recommendedNextStep,
    '',
    '## Approval Notes',
    product.approvalNotes,
    '',
    '## QA Warnings',
    bulletList(product.warnings.map((item) => `${item.severity}: ${item.label}`)),
    '',
  ].join('\n')
}

export function filterSheetIntakeProducts(
  products: Array<EtsySheetIntakeNormalizedProduct>,
  filter: EtsySheetIntakeGalleryFilter,
) {
  switch (filter) {
    case 'ready':
      return products.filter((product) => product.score >= 70 && !product.duplicateOf && !product.riskFlags.length)
    case 'missing-image':
      return products.filter((product) => product.warnings.some((warningItem) => warningItem.code === 'missing_image'))
    case 'weak-evidence':
      return products.filter((product) => product.warnings.some((warningItem) => warningItem.code === 'weak_evidence'))
    case 'duplicate':
      return products.filter((product) => product.duplicateOf)
    case 'needs-source':
      return products.filter((product) => product.warnings.some((warningItem) => warningItem.code === 'missing_source_url'))
    case 'shotlab-ready':
      return products.filter((product) => product.shotLabReadiness === 'ready')
    case 'all':
    default:
      return products
  }
}

export function createSheetIntakeManifest(input: {
  runId: string
  createdAtMs: number
  source: EtsySheetIntakeSourceDescriptor
  artifactRoot: string
  products: Array<EtsySheetIntakeNormalizedProduct>
  rejectedRows: Array<EtsySheetIntakeRejectedRow>
  warnings: Array<EtsySheetIntakeQaWarning>
  lockedActions: Array<string>
}): EtsySheetIntakeRunManifest {
  const dedupedProducts = input.products.filter((product) => !product.duplicateOf)
  return {
    runId: input.runId,
    createdAtMs: input.createdAtMs,
    source: input.source,
    artifactRoot: input.artifactRoot,
    products: input.products,
    dedupedProducts,
    rejectedRows: input.rejectedRows,
    warnings: input.warnings,
    qa: warningCounts(input.products, input.rejectedRows),
    lockedActions: input.lockedActions,
  }
}
