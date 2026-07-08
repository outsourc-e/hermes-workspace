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
  action?: 'prepare_product_sheet'
  projectId?: string | null
  product?: string | null
  channel?: string | null
  request?: string | null
  notes?: string | null
  owner?: string | null
}

export type DstnyAgentActionResult = {
  ok: true
  action: 'prepare_product_sheet'
  project: ProjectRecord
  bundle: ProjectBundle
  brief: string
  markdown: string
  warnings: Array<string>
}

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

  return {
    ok: true,
    action: 'prepare_product_sheet',
    project,
    bundle,
    brief: buildProjectBrief(bundle),
    markdown,
    warnings,
  }
}

export function runDstnyAgentAction(input: DstnyAgentActionInput): DstnyAgentActionResult {
  const action = input.action || 'prepare_product_sheet'
  if (action !== 'prepare_product_sheet') {
    throw new Error(`Unsupported agent action: ${action}`)
  }
  return prepareProductSheetProject(input)
}
