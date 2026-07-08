import { getTemplate } from './dstny-templates'
import {
  addProjectArtifact,
  addProjectDecision,
  addProjectSource,
  buildMarkdownFromContent,
  buildProjectBrief,
  buildStarterContentFields,
  createProject,
  getProject,
  getProjectBundle,
  saveProjectContentDraft,
  updateProject,
  type ProjectBundle,
  type ProjectRecord,
} from './project-cockpit'

const CHANNEL_TEMPLATE_IDS: Record<string, string> = {
  tous: 'template_fiche_produit_pdf_tous',
  direct: 'template_fiche_produit_pdf_direct',
  ambassadeur: 'template_fiche_produit_pdf_ambassadeur',
  operateur: 'template_fiche_produit_pdf_operateur',
}

export type DstnyAgentActionInput = {
  action?: 'prepare_product_sheet' | 'review_project'
  projectId?: string | null
  product?: string | null
  channel?: string | null
  request?: string | null
  notes?: string | null
  owner?: string | null
}

export type ProjectQualityReview = {
  score: number
  status: 'bloque' | 'a_cadrer' | 'pret_brouillon' | 'pret_validation'
  blocking: Array<string>
  warnings: Array<string>
  ready: Array<string>
  missing: Array<string>
  nextAction: string
  summary: string
}

export type PrepareProductSheetResult = {
  ok: true
  action: 'prepare_product_sheet'
  project: ProjectRecord
  bundle: ProjectBundle
  brief: string
  markdown: string
  warnings: Array<string>
  quality: ProjectQualityReview
}

export type ReviewProjectResult = {
  ok: true
  action: 'review_project'
  project: ProjectRecord
  bundle: ProjectBundle
  brief: string
  quality: ProjectQualityReview
}

export type DstnyAgentActionResult = PrepareProductSheetResult | ReviewProjectResult

function clean(value: string | null | undefined): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
    : ''
}

function normalizeChannel(value: string | null | undefined, request: string): string {
  const text = `${value || ''} ${request}`.toLowerCase()
  if (/(op[eé]rateur|wholesale|marque blanche)/i.test(text)) return 'operateur'
  if (/(ambassadeur|revendeur|indirect|commission)/i.test(text)) return 'ambassadeur'
  if (/(direct|client final|vente directe)/i.test(text)) return 'direct'
  return 'tous'
}

function inferProduct(input: DstnyAgentActionInput): string {
  const explicit = clean(input.product)
  if (explicit) return explicit
  const request = clean(input.request)
  const match = request.match(/(?:fiche produit|offre|produit|sur|pour)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 /+.-]{2,80})/i)
  if (match?.[1]) {
    return match[1]
      .replace(/\s+(pour|avec|en|à destination).*$/i, '')
      .trim()
  }
  return 'Offre à cadrer'
}

function productTag(product: string): string {
  const text = product.toLowerCase()
  if (/(ftto|ftte|ftth|fibre|connectivit|sd-wan|backup|routeur|internet)/i.test(text)) return 'connectivite'
  if (/(sip|trunk)/i.test(text)) return 'siptrunk'
  if (/(mobile|sim|forfait|4g|5g)/i.test(text)) return 'mobile'
  if (/(teams|call2teams)/i.test(text)) return 'teams'
  if (/(metacentrex|centrex|ucaas|voip|pbx|telephonie|téléphonie)/i.test(text)) return 'ucaas'
  return 'produit'
}

function projectObjective(product: string, channel: string): string {
  return [
    `Produire une fiche produit PDF claire, réutilisable et sourcee pour ${product}.`,
    `Le livrable doit adapter le discours au canal ${channel}, distinguer faits sources, hypotheses, pricing a valider et recommandations PMM.`,
    'Aucune information tarifaire ne doit etre publiee sans source active rattachee au projet.',
  ].join(' ')
}

function textOf(values: Array<string | null | undefined>): string {
  return values.filter(Boolean).join(' ').toLowerCase()
}

function hasRealSource(bundle: ProjectBundle, kind: 'produit' | 'pricing' | 'commercial' | 'technique'): boolean {
  return bundle.sources.some((source) => {
    if (source.status === 'archive' || source.status === 'obsolete') return false
    if (source.type === 'note') return false
    const text = textOf([source.title, source.link, source.sourceId])
    if (text.includes('à rattacher') || text.includes('a rattacher')) return false
    if (text.includes('expression de besoin')) return false
    if (kind === 'produit') return /(produit|catalogue|fiche|offre)/i.test(text)
    if (kind === 'pricing') return /(pricing|prix|tarif|grille|catalogue tarifaire)/i.test(text)
    if (kind === 'commercial') return /(commercial|sales|pitch|argumentaire|battle|support)/i.test(text)
    if (kind === 'technique') return /(technique|guide|architecture|procédure|procedure|contrat|sla)/i.test(text)
    return false
  })
}

function hasProjectSignal(bundle: ProjectBundle, pattern: RegExp): boolean {
  return pattern.test(textOf([
    bundle.title,
    bundle.objective,
    bundle.templateId,
    bundle.nextAction,
    ...bundle.tags,
    ...bundle.decisions.map((decision) => `${decision.topic} ${decision.decision}`),
  ]))
}

export function reviewProjectQuality(bundle: ProjectBundle): ProjectQualityReview {
  const isProductSheet = hasProjectSignal(bundle, /(fiche.produit|livrable-pdf|template_fiche_produit_pdf|pdf)/i)
  const hasProductSource = hasRealSource(bundle, 'produit')
  const hasPricingSource = hasRealSource(bundle, 'pricing')
  const hasMarkdownDraft = Boolean(bundle.contentDraft?.markdown || bundle.artifacts.some((artifact) => artifact.type === 'markdown'))
  const hasPdfArtifact = bundle.artifacts.some((artifact) => artifact.type === 'pdf')
  const hasChannel = hasProjectSignal(bundle, /canal:|direct|ambassadeur|op[eé]rateur|tous/i)
  const hasPricingGuardrail = hasProjectSignal(bundle, /prix|pricing|tarif|aucun prix|source tarifaire|ne publier aucun prix/i)
  const hasSourceSection = Boolean(bundle.contentDraft?.fields?.sources || bundle.contentDraft?.markdown?.includes('## Sources et limites'))

  const ready: Array<string> = []
  const missing: Array<string> = []
  const blocking: Array<string> = []
  const warnings: Array<string> = []

  if (isProductSheet) ready.push('Type de livrable identifié : fiche produit PDF')
  else warnings.push('Type de livrable à préciser si le projet doit produire un PDF structuré.')

  if (hasChannel) ready.push('Canal ou cible identifié')
  else missing.push('Canal cible à préciser : Direct, Ambassadeur, Opérateur ou Tous.')

  if (hasMarkdownDraft) ready.push('Brouillon Markdown ou Studio contenu présent')
  else missing.push('Brouillon structuré à générer avant revue éditoriale.')

  if (hasSourceSection) ready.push('Section sources/limites prévue')
  else missing.push('Section sources et limites à ajouter.')

  if (hasProductSource) ready.push('Source produit exploitable rattachée')
  else blocking.push('Source produit active manquante : le contenu reste non publiable.')

  if (hasPricingSource) ready.push('Source pricing exploitable rattachée')
  else if (hasPricingGuardrail) warnings.push('Pricing non sourcé : prix à masquer ou à laisser explicitement à valider.')
  else blocking.push('Pricing non cadré : ajouter une source tarifaire ou masquer les prix.')

  if (hasPdfArtifact) ready.push('Artefact PDF prévu ou rattaché')
  else warnings.push('Artefact PDF non encore généré : normal avant validation du contenu.')

  if (bundle.sources.some((source) => /ovh|fax|whatsapp|ringover/i.test(textOf([source.title, source.link])))) {
    warnings.push('Certaines sources semblent hors périmètre : vérifier leur pertinence avant de les citer.')
  }

  const totalChecks = 7
  const passed = [
    isProductSheet,
    hasChannel,
    hasMarkdownDraft,
    hasSourceSection,
    hasProductSource,
    hasPricingSource || hasPricingGuardrail,
    hasPdfArtifact,
  ].filter(Boolean).length
  const score = Math.round((passed / totalChecks) * 100)
  const status: ProjectQualityReview['status'] =
    blocking.length > 0
      ? 'bloque'
      : warnings.length > 0
        ? 'a_cadrer'
        : hasPdfArtifact
          ? 'pret_validation'
          : 'pret_brouillon'
  const nextAction =
    blocking[0] ||
    warnings[0] ||
    'Relire le brouillon, rattacher les sources citées et préparer l’export PDF.'

  const summary = [
    `Score qualité : ${score}/100.`,
    blocking.length ? `Blocages : ${blocking.length}.` : 'Aucun blocage critique détecté.',
    warnings.length ? `Points à cadrer : ${warnings.length}.` : 'Pas d’avertissement majeur.',
    `Action suivante : ${nextAction}`,
  ].join(' ')

  return {
    score,
    status,
    blocking,
    warnings,
    ready,
    missing,
    nextAction,
    summary,
  }
}

export function prepareProductSheetProject(input: DstnyAgentActionInput): DstnyAgentActionResult {
  const request = clean(input.request)
  const notes = clean(input.notes)
  const product = inferProduct(input)
  const channel = normalizeChannel(input.channel, request)
  const templateId = CHANNEL_TEMPLATE_IDS[channel] || CHANNEL_TEMPLATE_IDS.tous
  const template = getTemplate(templateId)
  const warnings: Array<string> = []

  if (!template) {
    warnings.push(`Template introuvable: ${templateId}. Le projet est cree sans template exploitable.`)
  }
  if (channel === 'tous') {
    warnings.push('Canal non precise: utiliser le template tous canaux puis decliner si besoin.')
  }

  const tags = [
    'fiche-produit',
    'livrable-pdf',
    productTag(product),
    `canal:${channel}`,
  ]

  let project = input.projectId ? getProject(input.projectId) : null
  if (project) {
    project = updateProject(project.id, {
      title: project.title || `Fiche produit PDF - ${product}`,
      objective: project.objective || projectObjective(product, channel),
      templateId,
      tags: Array.from(new Set([...project.tags, ...tags])),
      nextAction: 'Rattacher les sources produit/pricing, relire le brouillon et lancer le contrôle qualité.',
    })
  } else {
    project = createProject({
      title: `Fiche produit PDF - ${product}`,
      objective: projectObjective(product, channel),
      templateId,
      tags,
      owner: clean(input.owner) || 'Xavier',
      nextAction: 'Rattacher les sources produit/pricing, relire le brouillon et lancer le contrôle qualité.',
    })
  }

  if (!project) throw new Error('Project could not be prepared')

  if (request || notes) {
    addProjectSource({
      projectId: project.id,
      type: 'note',
      title: 'Expression de besoin initiale',
      link: [request, notes].filter(Boolean).join('\n\n'),
      confidence: 'moyen',
      status: 'brouillon',
    })
  }

  const fields = buildStarterContentFields({ project, template })
  const sectionTitles = Object.fromEntries(
    (template?.sections || []).map((section) => [section.id, section.title]),
  )
  const markdown = buildMarkdownFromContent({
    project,
    templateName: template?.name,
    sectionTitles,
    fields,
  })
  const draft = saveProjectContentDraft({
    projectId: project.id,
    templateId,
    fields,
    markdown,
    status: 'brouillon',
    version: 'v0.1',
  })

  addProjectArtifact({
    projectId: project.id,
    type: 'markdown',
    title: `Brouillon fiche produit - ${draft.version}`,
    pathOrUrl: 'Contenu enregistre dans le Studio contenu',
    status: 'brouillon',
    version: draft.version,
    producedBy: 'Hermes Agent Action',
  })

  addProjectDecision({
    projectId: project.id,
    topic: 'Mode de production',
    decision: 'Demarrer par un brouillon structure issu du template, puis completer avec sources RAG et validation pricing avant publication.',
    rationale: 'Evite de bloquer le travail sur un RAG incomplet tout en empechant la publication de claims ou prix non sources.',
    status: 'a_valider',
  })

  const bundle = getProjectBundle(project.id)
  if (!bundle) throw new Error('Project bundle could not be loaded')
  const quality = reviewProjectQuality(bundle)

  return {
    ok: true,
    action: 'prepare_product_sheet',
    project,
    bundle,
    brief: buildProjectBrief(bundle),
    markdown,
    warnings,
    quality,
  }
}

export function reviewExistingProject(input: DstnyAgentActionInput): ReviewProjectResult {
  const projectId = clean(input.projectId)
  if (!projectId) throw new Error('projectId is required')
  const bundle = getProjectBundle(projectId)
  if (!bundle) throw new Error('Project not found')
  const quality = reviewProjectQuality(bundle)
  return {
    ok: true,
    action: 'review_project',
    project: bundle,
    bundle,
    brief: buildProjectBrief(bundle),
    quality,
  }
}

export function runDstnyAgentAction(input: DstnyAgentActionInput): DstnyAgentActionResult {
  const action = input.action || 'prepare_product_sheet'
  if (action === 'prepare_product_sheet') return prepareProductSheetProject(input)
  if (action === 'review_project') return reviewExistingProject(input)
  throw new Error(`Unsupported agent action: ${action}`)
}
