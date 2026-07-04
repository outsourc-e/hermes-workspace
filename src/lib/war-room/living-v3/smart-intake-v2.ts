export type SmartIntakeStationId =
  | 'source-intake'
  | 'image-match'
  | 'dossier-builder'
  | 'shotlab-prep-approval'

export type SmartIntakeSourceKind =
  | 'aliexpress_link'
  | 'google_doc_link'
  | 'google_sheet_link'
  | 'google_drive_folder'
  | 'local_file'
  | 'local_image'
  | 'public_image_url'
  | 'generic_url'
  | 'freeform_prompt'

export type SmartIntakeAccessState =
  | 'detected_only'
  | 'local_reference_only'
  | 'auth_required'
  | 'blocked_live'
  | 'mock_readable'

export type SmartIntakeTaskStatus = 'queued' | 'mock_running' | 'needs_review' | 'complete' | 'blocked'
export type SmartIntakeEvidenceKind = 'source_ref' | 'image_ref' | 'prompt_signal' | 'auth_gap' | 'safety_lock'
export type SmartIntakeReadiness = 'ready' | 'partial' | 'blocked'

export type SmartIntakeMission = {
  missionId: string
  runId: string
  createdAtMs: number
  rawInput: string
  prompt: string
  status: 'mock_ready' | 'needs_input' | 'blocked'
  safety: {
    localOnly: true
    usageAllowed: false
    workerSpawnAllowed: false
    lockedActions: Array<string>
  }
  sources: Array<SmartIntakeSource>
  agentTasks: Array<SmartIntakeAgentTask>
  evidence: Array<SmartIntakeEvidence>
  productMatches: Array<SmartIntakeProductMatch>
  imageSets: Array<SmartIntakeImageSet>
  markdownDossiers: Array<SmartIntakeMarkdownDossier>
  gallery: Array<SmartIntakeGalleryItem>
  warnings: Array<string>
  missingEvidence: Array<string>
  finalRecommendation: string
}

export type SmartIntakeSource = {
  sourceId: string
  kind: SmartIntakeSourceKind
  label: string
  rawValue: string
  normalizedRef: string
  service: 'AliExpress' | 'Google Docs' | 'Google Sheets' | 'Google Drive' | 'Local workspace' | 'Public web' | 'Operator prompt'
  accessState: SmartIntakeAccessState
  stationId: SmartIntakeStationId
  evidencePotential: 'high' | 'medium' | 'low'
  warnings: Array<string>
}

export type SmartIntakeAgentTask = {
  taskId: string
  stationId: SmartIntakeStationId
  label: string
  description: string
  status: SmartIntakeTaskStatus
  inputSourceIds: Array<string>
  outputIds: Array<string>
  missing: Array<string>
  safetyState: 'local_mock_only' | 'auth_blocked' | 'live_action_locked'
  readback: string
}

export type SmartIntakeEvidence = {
  evidenceId: string
  sourceId: string
  kind: SmartIntakeEvidenceKind
  label: string
  detail: string
  confidence: number
  stationId: SmartIntakeStationId
}

export type SmartIntakeProductMatch = {
  matchId: string
  missionId: string
  title: string
  niche: string
  sourceIds: Array<string>
  evidenceIds: Array<string>
  imageSetIds: Array<string>
  score: number
  scoreExplanation: string
  warnings: Array<string>
  missingEvidence: Array<string>
  riskFlags: Array<string>
  readiness: SmartIntakeReadiness
  recommendedNextStep: string
}

export type SmartIntakeImageItem = {
  imageId: string
  sourceId: string
  label: string
  ref: string
  previewMode: 'placeholder' | 'local_reference' | 'external_ref_not_loaded'
  selected: boolean
  warnings: Array<string>
}

export type SmartIntakeImageSet = {
  imageSetId: string
  matchId: string
  label: string
  stationId: 'image-match'
  items: Array<SmartIntakeImageItem>
  bestImageId?: string
  missing: Array<string>
  readiness: SmartIntakeReadiness
}

export type SmartIntakeMarkdownDossier = {
  dossierId: string
  matchId: string
  title: string
  markdown: string
  warnings: Array<string>
  missingEvidence: Array<string>
  readiness: SmartIntakeReadiness
}

export type SmartIntakeGalleryItem = {
  galleryItemId: string
  matchId: string
  title: string
  score: number
  readiness: SmartIntakeReadiness
  imageCount: number
  warningCount: number
  missingCount: number
}

export const SMART_INTAKE_LOCKED_ACTIONS = [
  'Etsy upload draft',
  'Etsy publish',
  'Etsy edit live listing',
  'supplier messaging',
  'supplier purchase',
  'paid ShotLab generation',
  'Google Sheet write',
  'Google OAuth',
  'browser automation',
  'uncontrolled worker fan-out',
] as const

export const smartIntakeStationLabels: Record<SmartIntakeStationId, string> = {
  'source-intake': 'Source Intake',
  'image-match': 'Image Match',
  'dossier-builder': 'Dossier Builder',
  'shotlab-prep-approval': 'ShotLab Prep / Approval',
}

export const smartIntakeSourceKindLabels: Record<SmartIntakeSourceKind, string> = {
  aliexpress_link: 'AliExpress link',
  google_doc_link: 'Google Docs link',
  google_sheet_link: 'Google Sheets link',
  google_drive_folder: 'Google Drive folder',
  local_file: 'Local file',
  local_image: 'Local image',
  public_image_url: 'Public image URL',
  generic_url: 'Generic URL',
  freeform_prompt: 'Free-form prompt',
}

const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.heic']
const dataExtensions = ['.csv', '.tsv', '.json', '.txt', '.md', '.pdf', '.docx']

function slugify(value: string, fallback = 'item') {
  const slug = value
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56)
  return slug || fallback
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function clampScore(value: number) {
  return Math.max(5, Math.min(100, Math.round(value)))
}

function cleanUrl(rawValue: string) {
  return rawValue.trim().replace(/[),.;\]]+$/g, '')
}

function urlHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function hasImageExtension(value: string) {
  const lower = value.toLowerCase().split('?')[0]
  return imageExtensions.some((extension) => lower.endsWith(extension))
}

function hasDataExtension(value: string) {
  const lower = value.toLowerCase().split('?')[0]
  return dataExtensions.some((extension) => lower.endsWith(extension))
}

function classifyUrl(rawUrl: string): Omit<SmartIntakeSource, 'sourceId'> {
  const normalizedRef = cleanUrl(rawUrl)
  const host = urlHost(normalizedRef)
  const label = normalizedRef.replace(/^https?:\/\//, '').slice(0, 86)

  if (host.includes('aliexpress.') || host.includes('alibaba.')) {
    return {
      kind: 'aliexpress_link',
      label,
      rawValue: rawUrl,
      normalizedRef,
      service: 'AliExpress',
      accessState: 'blocked_live',
      stationId: 'source-intake',
      evidencePotential: 'high',
      warnings: ['Supplier marketplace detected only. No live fetch, message, purchase, or browser automation.'],
    }
  }

  if (host === 'docs.google.com' && normalizedRef.includes('/spreadsheets/')) {
    return {
      kind: 'google_sheet_link',
      label,
      rawValue: rawUrl,
      normalizedRef,
      service: 'Google Sheets',
      accessState: 'auth_required',
      stationId: 'source-intake',
      evidencePotential: 'high',
      warnings: ['Google auth not connected. No OAuth, private read, or Sheet write attempted.'],
    }
  }

  if (host === 'docs.google.com' && normalizedRef.includes('/document/')) {
    return {
      kind: 'google_doc_link',
      label,
      rawValue: rawUrl,
      normalizedRef,
      service: 'Google Docs',
      accessState: 'auth_required',
      stationId: 'source-intake',
      evidencePotential: 'medium',
      warnings: ['Google auth not connected. Document is represented as a source reference only.'],
    }
  }

  if (host === 'drive.google.com') {
    return {
      kind: 'google_drive_folder',
      label,
      rawValue: rawUrl,
      normalizedRef,
      service: 'Google Drive',
      accessState: 'auth_required',
      stationId: 'source-intake',
      evidencePotential: 'high',
      warnings: ['Google Drive folder detected. Images are not fetched until Google auth is explicitly connected.'],
    }
  }

  if (hasImageExtension(normalizedRef)) {
    return {
      kind: 'public_image_url',
      label,
      rawValue: rawUrl,
      normalizedRef,
      service: 'Public web',
      accessState: 'detected_only',
      stationId: 'source-intake',
      evidencePotential: 'medium',
      warnings: ['External image URL is evidence text only in V2. The browser does not load it as a thumbnail.'],
    }
  }

  return {
    kind: 'generic_url',
    label,
    rawValue: rawUrl,
    normalizedRef,
    service: 'Public web',
    accessState: 'detected_only',
    stationId: 'source-intake',
    evidencePotential: 'medium',
    warnings: ['Public URL detected only. No browser automation or network read is executed in Smart Intake V2.'],
  }
}

function classifyLocalRef(rawRef: string): Omit<SmartIntakeSource, 'sourceId'> {
  const normalizedRef = rawRef.trim().replace(/[),.;\]]+$/g, '')
  const fileName = normalizedRef.split('/').pop() || normalizedRef
  const isImage = hasImageExtension(normalizedRef)
  return {
    kind: isImage ? 'local_image' : 'local_file',
    label: fileName,
    rawValue: rawRef,
    normalizedRef,
    service: 'Local workspace',
    accessState: 'local_reference_only',
    stationId: 'source-intake',
    evidencePotential: isImage ? 'high' : hasDataExtension(normalizedRef) ? 'medium' : 'low',
    warnings: ['Local path is represented as a reference only. No arbitrary file read is performed by this mock workbench.'],
  }
}

function detectSmartIntakeSources(rawInput: string): Array<SmartIntakeSource> {
  const sources: Array<SmartIntakeSource> = []
  const urls = [...rawInput.matchAll(/https?:\/\/[^\s"'<>]+/gi)].map((match) => cleanUrl(match[0]))
  const withoutUrls = urls.reduce((text, url) => text.replace(url, ' '), rawInput)
  const localRefs = [...withoutUrls.matchAll(/(?:~\/|\.{1,2}\/|\/Users\/|\/Volumes\/|data\/|public\/)[^\s"'<>]+/gi)]
    .map((match) => match[0].trim().replace(/[),.;\]]+$/g, ''))
  const withoutLocalRefs = localRefs.reduce((text, ref) => text.replace(ref, ' '), withoutUrls)

  urls.forEach((url, index) => {
    const source = classifyUrl(url)
    sources.push({ ...source, sourceId: `source-${index + 1}-${source.kind}` })
  })

  localRefs.forEach((ref, index) => {
    if (urls.includes(ref)) return
    const source = classifyLocalRef(ref)
    sources.push({ ...source, sourceId: `source-${sources.length + index + 1}-${source.kind}` })
  })

  const prompt = withoutLocalRefs
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 2)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (prompt) {
    sources.push({
      sourceId: `source-${sources.length + 1}-freeform-prompt`,
      kind: 'freeform_prompt',
      label: titleCase(prompt) || 'Operator prompt',
      rawValue: prompt,
      normalizedRef: prompt,
      service: 'Operator prompt',
      accessState: 'mock_readable',
      stationId: 'source-intake',
      evidencePotential: 'medium',
      warnings: ['Prompt is treated as operator intent, not external evidence.'],
    })
  }

  return sources
}

function evidenceForSource(source: SmartIntakeSource): SmartIntakeEvidence {
  const kind: SmartIntakeEvidenceKind = source.kind === 'freeform_prompt'
    ? 'prompt_signal'
    : source.kind === 'local_image' || source.kind === 'public_image_url' || source.kind === 'google_drive_folder'
      ? 'image_ref'
      : source.accessState === 'auth_required'
        ? 'auth_gap'
        : source.accessState === 'blocked_live'
          ? 'safety_lock'
          : 'source_ref'
  const confidence = source.evidencePotential === 'high' ? 0.72 : source.evidencePotential === 'medium' ? 0.54 : 0.34
  return {
    evidenceId: `evidence-${slugify(source.sourceId)}`,
    sourceId: source.sourceId,
    kind,
    label: smartIntakeSourceKindLabels[source.kind],
    detail: source.normalizedRef,
    confidence,
    stationId: source.kind === 'local_image' || source.kind === 'public_image_url' || source.kind === 'google_drive_folder'
      ? 'image-match'
      : 'source-intake',
  }
}

function deriveTitleFromSource(source: SmartIntakeSource, prompt: string) {
  if (source.kind === 'freeform_prompt') return titleCase(source.normalizedRef) || 'Prompt Product Candidate'
  const ref = source.normalizedRef.split('?')[0]
  const tail = ref.split('/').filter(Boolean).pop() || source.label
  const cleaned = tail
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\d{3,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length > 3 && !/^item|product|listing$/i.test(cleaned)) return titleCase(cleaned)
  if (prompt) return titleCase(prompt)
  if (source.kind === 'aliexpress_link') return 'AliExpress Product Candidate'
  return 'Smart Intake Product Candidate'
}

function deriveNiche(prompt: string, title: string) {
  const text = `${prompt} ${title}`.toLowerCase()
  if (text.includes('necklace')) return 'necklace jewelry candidate'
  if (text.includes('bracelet')) return 'bracelet jewelry candidate'
  if (text.includes('ring')) return 'ring jewelry candidate'
  if (text.includes('earring')) return 'earring jewelry candidate'
  if (text.includes('charm')) return 'charm jewelry candidate'
  return 'DolaroBoutique jewelry candidate'
}

function sourceLooksProductLike(source: SmartIntakeSource) {
  return ['aliexpress_link', 'generic_url', 'local_file', 'local_image', 'public_image_url', 'freeform_prompt'].includes(source.kind)
}

function createImageSets(input: {
  missionId: string
  matches: Array<SmartIntakeProductMatch>
  sources: Array<SmartIntakeSource>
}) {
  const imageSources = input.sources.filter((source) =>
    ['local_image', 'public_image_url', 'google_drive_folder', 'aliexpress_link'].includes(source.kind),
  )
  return input.matches.map((match) => {
    const matchImageSources = imageSources.length ? imageSources : input.sources.filter((source) => match.sourceIds.includes(source.sourceId)).slice(0, 1)
    const items = matchImageSources.slice(0, 4).map((source, index): SmartIntakeImageItem => {
      const previewMode: SmartIntakeImageItem['previewMode'] = source.kind === 'local_image'
        ? 'local_reference'
        : source.kind === 'public_image_url'
          ? 'external_ref_not_loaded'
          : 'placeholder'
      return {
        imageId: `image-${match.matchId}-${index + 1}`,
        sourceId: source.sourceId,
        label: source.kind === 'google_drive_folder' ? `Drive image candidate ${index + 1}` : source.label,
        ref: source.normalizedRef,
        previewMode,
        selected: index === 0,
        warnings: previewMode === 'external_ref_not_loaded'
          ? ['External image reference not loaded in browser.']
          : source.kind === 'google_drive_folder'
            ? ['Google Drive images require future Google auth.']
            : [],
      }
    })
    if (!items.length) {
      items.push({
        imageId: `image-${match.matchId}-placeholder`,
        sourceId: match.sourceIds[0] ?? 'no-source',
        label: 'Missing source image',
        ref: 'local-placeholder://missing-image',
        previewMode: 'placeholder',
        selected: true,
        warnings: ['No source image reference detected.'],
      })
    }
    const missing = items.every((item) => item.ref === 'local-placeholder://missing-image') ? ['source image reference'] : []
    return {
      imageSetId: `image-set-${match.matchId}`,
      matchId: match.matchId,
      label: `${match.title} image set`,
      stationId: 'image-match',
      items,
      bestImageId: items[0]?.imageId,
      missing,
      readiness: missing.length ? 'partial' : 'ready',
    } satisfies SmartIntakeImageSet
  })
}

function createProductMatches(input: {
  missionId: string
  prompt: string
  sources: Array<SmartIntakeSource>
  evidence: Array<SmartIntakeEvidence>
}) {
  const productSources = input.sources.filter(sourceLooksProductLike)
  const seeds = productSources.length ? productSources.slice(0, 2) : input.sources.slice(0, 1)
  return seeds.map((source, index): SmartIntakeProductMatch => {
    const title = deriveTitleFromSource(source, input.prompt)
    const sourceIds = Array.from(new Set([
      source.sourceId,
      ...input.sources.filter((item) => item.kind !== 'freeform_prompt').slice(0, 3).map((item) => item.sourceId),
      ...input.sources.filter((item) => item.kind === 'freeform_prompt').map((item) => item.sourceId),
    ]))
    const evidenceIds = input.evidence.filter((item) => sourceIds.includes(item.sourceId)).map((item) => item.evidenceId)
    const hasImageRef = input.sources.some((item) => sourceIds.includes(item.sourceId) && ['local_image', 'public_image_url', 'google_drive_folder', 'aliexpress_link'].includes(item.kind))
    const authGaps = input.sources.filter((item) => sourceIds.includes(item.sourceId) && item.accessState === 'auth_required')
    const liveLocks = input.sources.filter((item) => sourceIds.includes(item.sourceId) && item.accessState === 'blocked_live')
    const missingEvidence = [
      !hasImageRef ? 'source image reference' : '',
      authGaps.length ? 'Google content unread until auth is connected' : '',
      'verified supplier/material truth',
      'price/cost proof',
      'SEO demand metrics',
    ].filter(Boolean)
    const riskFlags = [
      ...authGaps.map((item) => `${item.service} auth not connected`),
      ...liveLocks.map((item) => `${item.service} live actions locked`),
      'No customer-facing claims until dossier evidence is reviewed.',
    ]
    const baseScore = 44 + evidenceIds.length * 8 + (hasImageRef ? 16 : 0) - authGaps.length * 7 - liveLocks.length * 4 - index * 3
    const score = clampScore(baseScore)
    const readiness: SmartIntakeReadiness = score >= 72 && hasImageRef && !authGaps.length ? 'ready' : score < 35 ? 'blocked' : 'partial'
    return {
      matchId: `match-${index + 1}-${slugify(title)}`,
      missionId: input.missionId,
      title,
      niche: deriveNiche(input.prompt, title),
      sourceIds,
      evidenceIds,
      imageSetIds: [],
      score,
      scoreExplanation: `${evidenceIds.length} local evidence refs; ${hasImageRef ? 'image candidates detected' : 'missing image candidates'}; live/auth actions locked.`,
      warnings: Array.from(new Set(sourceIds.flatMap((sourceId) => input.sources.find((item) => item.sourceId === sourceId)?.warnings ?? []))),
      missingEvidence,
      riskFlags,
      readiness,
      recommendedNextStep: readiness === 'ready'
        ? 'Review best image, then choose product or prepare local ShotLab handoff.'
        : 'Fill missing evidence before any live-marketplace workflow.',
    }
  })
}

function createDossier(input: {
  mission: Pick<SmartIntakeMission, 'missionId' | 'rawInput' | 'prompt' | 'sources' | 'evidence'>
  match: SmartIntakeProductMatch
  imageSet: SmartIntakeImageSet
}): SmartIntakeMarkdownDossier {
  const matchSources = input.mission.sources.filter((source) => input.match.sourceIds.includes(source.sourceId))
  const matchEvidence = input.mission.evidence.filter((evidence) => input.match.evidenceIds.includes(evidence.evidenceId))
  const imageRefs = input.imageSet.items.map((item) => `- ${item.label}: ${item.ref} (${item.previewMode})`).join('\n') || '- none'
  const markdown = [
    `# ${input.match.title}`,
    '',
    `- Mission id: ${input.mission.missionId}`,
    `- Niche: ${input.match.niche}`,
    `- Score: ${input.match.score}`,
    `- Readiness: ${input.match.readiness}`,
    `- Recommended next step: ${input.match.recommendedNextStep}`,
    '',
    '## Source Intake',
    ...matchSources.map((source) => `- ${smartIntakeSourceKindLabels[source.kind]}: ${source.normalizedRef} (${source.accessState})`),
    '',
    '## Evidence',
    ...(matchEvidence.length ? matchEvidence.map((evidence) => `- ${evidence.label}: ${evidence.detail} confidence ${Math.round(evidence.confidence * 100)}%`) : ['- Missing evidence.']),
    '',
    '## Product Match',
    `- Title: ${input.match.title}`,
    `- Score explanation: ${input.match.scoreExplanation}`,
    '',
    '## Image Set',
    imageRefs,
    '',
    '## Missing Evidence',
    ...(input.match.missingEvidence.length ? input.match.missingEvidence.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Risk Flags',
    ...(input.match.riskFlags.length ? input.match.riskFlags.map((item) => `- ${item}`) : ['- none']),
    '',
    '## ShotLab Readiness',
    input.match.readiness === 'ready'
      ? '- Ready for local ShotLab prep packet only. Paid generation remains locked.'
      : '- Partial. Keep as local prep until missing evidence is resolved.',
    '',
    '## Approval Notes',
    '- Operator approval required before any future live listing or paid generation action.',
  ].join('\n')
  return {
    dossierId: `dossier-${input.match.matchId}`,
    matchId: input.match.matchId,
    title: input.match.title,
    markdown,
    warnings: input.match.warnings,
    missingEvidence: input.match.missingEvidence,
    readiness: input.match.readiness,
  }
}

function createTasks(input: {
  sources: Array<SmartIntakeSource>
  evidence: Array<SmartIntakeEvidence>
  matches: Array<SmartIntakeProductMatch>
  imageSets: Array<SmartIntakeImageSet>
  dossiers: Array<SmartIntakeMarkdownDossier>
}) {
  const authBlocked = input.sources.some((source) => source.accessState === 'auth_required')
  const liveLocked = input.sources.some((source) => source.accessState === 'blocked_live')
  const missingImages = input.imageSets.some((set) => set.missing.length)
  const commonSourceIds = input.sources.map((source) => source.sourceId)
  return [
    {
      taskId: 'task-source-intake',
      stationId: 'source-intake',
      label: 'Detect mixed sources',
      description: 'Parse prompt text, supplier links, Google links, Drive folders, local files, and images.',
      status: input.sources.length ? 'complete' : 'blocked',
      inputSourceIds: commonSourceIds,
      outputIds: input.sources.map((source) => source.sourceId),
      missing: input.sources.length ? [] : ['mission input'],
      safetyState: liveLocked ? 'live_action_locked' : authBlocked ? 'auth_blocked' : 'local_mock_only',
      readback: input.sources.length ? `${input.sources.length} source refs detected locally.` : 'No source refs detected.',
    },
    {
      taskId: 'task-image-match',
      stationId: 'image-match',
      label: 'Match product images',
      description: 'Create a review queue of source image refs and placeholders without browser image loads.',
      status: missingImages ? 'needs_review' : 'complete',
      inputSourceIds: commonSourceIds,
      outputIds: input.imageSets.flatMap((set) => set.items.map((item) => item.imageId)),
      missing: missingImages ? ['source image reference for at least one match'] : [],
      safetyState: 'local_mock_only',
      readback: `${input.imageSets.length} image set${input.imageSets.length === 1 ? '' : 's'} staged for review.`,
    },
    {
      taskId: 'task-dossier-builder',
      stationId: 'dossier-builder',
      label: 'Build markdown dossiers',
      description: 'Assemble source refs, evidence gaps, score explanation, and approval notes.',
      status: input.dossiers.length ? 'complete' : 'blocked',
      inputSourceIds: commonSourceIds,
      outputIds: input.dossiers.map((dossier) => dossier.dossierId),
      missing: input.dossiers.length ? [] : ['product match'],
      safetyState: 'local_mock_only',
      readback: `${input.dossiers.length} markdown dossier${input.dossiers.length === 1 ? '' : 's'} ready in memory.`,
    },
    {
      taskId: 'task-shotlab-prep-approval',
      stationId: 'shotlab-prep-approval',
      label: 'Prepare handoff approval',
      description: 'Create local-only Loki/Thor readiness with locked live actions.',
      status: input.matches.length ? 'needs_review' : 'blocked',
      inputSourceIds: commonSourceIds,
      outputIds: input.matches.map((match) => match.matchId),
      missing: Array.from(new Set(input.matches.flatMap((match) => match.missingEvidence))).slice(0, 5),
      safetyState: 'live_action_locked',
      readback: 'Odin and ShotLab prep are available as local packets only.',
    },
  ] satisfies Array<SmartIntakeAgentTask>
}

export function createSmartIntakeMission(rawInput: string, nowMs = Date.now()): SmartIntakeMission {
  const trimmedInput = rawInput.trim()
  const missionId = `smart-intake-${nowMs.toString(36)}`
  const sources = detectSmartIntakeSources(trimmedInput)
  const prompt = sources.find((source) => source.kind === 'freeform_prompt')?.normalizedRef ?? trimmedInput.slice(0, 160)
  const evidence = sources.map(evidenceForSource)
  const matchesWithoutImages = createProductMatches({ missionId, prompt, sources, evidence })
  const imageSets = createImageSets({ missionId, matches: matchesWithoutImages, sources })
  const matches = matchesWithoutImages.map((match) => ({
    ...match,
    imageSetIds: imageSets.filter((set) => set.matchId === match.matchId).map((set) => set.imageSetId),
  }))
  const missionForDossier = { missionId, rawInput: trimmedInput, prompt, sources, evidence }
  const dossiers = matches.map((match) => {
    const imageSet = imageSets.find((set) => set.matchId === match.matchId) ?? imageSets[0]
    return createDossier({ mission: missionForDossier, match, imageSet })
  })
  const agentTasks = createTasks({ sources, evidence, matches, imageSets, dossiers })
  const missingEvidence = Array.from(new Set(matches.flatMap((match) => match.missingEvidence)))
  const warnings = Array.from(new Set([
    ...sources.flatMap((source) => source.warnings),
    ...matches.flatMap((match) => match.warnings),
  ]))
  const gallery = matches.map((match) => ({
    galleryItemId: `gallery-${match.matchId}`,
    matchId: match.matchId,
    title: match.title,
    score: match.score,
    readiness: match.readiness,
    imageCount: imageSets.find((set) => set.matchId === match.matchId)?.items.length ?? 0,
    warningCount: match.warnings.length,
    missingCount: match.missingEvidence.length,
  }))

  return {
    missionId,
    runId: missionId,
    createdAtMs: nowMs,
    rawInput: trimmedInput,
    prompt,
    status: sources.length ? 'mock_ready' : 'needs_input',
    safety: {
      localOnly: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
      lockedActions: [...SMART_INTAKE_LOCKED_ACTIONS],
    },
    sources,
    agentTasks,
    evidence,
    productMatches: matches,
    imageSets,
    markdownDossiers: dossiers,
    gallery,
    warnings,
    missingEvidence,
    finalRecommendation: matches.some((match) => match.readiness === 'ready')
      ? 'Review the best image, then create a local Odin packet or ShotLab prep packet.'
      : 'Keep this mission local until missing evidence and auth-gated sources are resolved.',
  }
}

export function selectedSmartIntakeMatch(mission: SmartIntakeMission | undefined, selectedMatchId?: string) {
  if (!mission) return undefined
  return mission.productMatches.find((match) => match.matchId === selectedMatchId) ?? mission.productMatches[0]
}

export function imageSetForSmartIntakeMatch(mission: SmartIntakeMission | undefined, matchId?: string) {
  if (!mission || !matchId) return undefined
  return mission.imageSets.find((set) => set.matchId === matchId)
}

export function dossierForSmartIntakeMatch(mission: SmartIntakeMission | undefined, matchId?: string) {
  if (!mission || !matchId) return undefined
  return mission.markdownDossiers.find((dossier) => dossier.matchId === matchId)
}
