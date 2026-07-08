import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const TEMPLATE_STATUSES = [
  'brouillon',
  'a_valider',
  'valide',
  'obsolete',
] as const

export const TEMPLATE_TYPES = [
  'fiche_produit_pdf',
  'battle_card',
  'one_pager',
  'support_interne',
] as const

export const TEMPLATE_CHANNELS = [
  'tous',
  'direct',
  'ambassadeur',
  'operateur',
  'interne',
] as const

export type TemplateStatus = typeof TEMPLATE_STATUSES[number]
export type TemplateType = typeof TEMPLATE_TYPES[number]
export type TemplateChannel = typeof TEMPLATE_CHANNELS[number]

export type TemplateSection = {
  id: string
  title: string
  purpose: string
  required: boolean
}

export type TemplatePromptSet = {
  rag: string
  pmm: string
  pricing: string
  writer: string
  designer: string
  qa: string
}

export type TemplateQualityRule = {
  id: string
  label: string
  severity: 'info' | 'warning' | 'blocking'
}

export type DeliverableTemplate = {
  id: string
  name: string
  type: TemplateType
  productFamily: string
  channel: TemplateChannel
  status: TemplateStatus
  version: string
  description: string
  requiredSources: Array<'produit' | 'pricing' | 'technique' | 'commercial' | 'legal'>
  sections: Array<TemplateSection>
  prompts: TemplatePromptSet
  qualityRules: Array<TemplateQualityRule>
  renderTarget: 'html_pdf' | 'pdfme' | 'presenton' | 'markdown'
  createdAt: string
  updatedAt: string
}

const TEMPLATE_CREATED_AT = '2026-07-08T00:00:00.000Z'

function hermesRoot(): string {
  return resolve(
    process.env.HERMES_HOME?.trim() ||
      process.env.CLAUDE_HOME?.trim() ||
      join(homedir(), '.hermes'),
  )
}

export function getTemplateLibraryRoot(): string {
  return resolve(
    process.env.TEMPLATE_LIBRARY_ROOT?.trim() ||
      join(hermesRoot(), 'templates'),
  )
}

function registryPath(name: string): string {
  return join(getTemplateLibraryRoot(), `${name}.jsonl`)
}

function ensureTemplateDir(): void {
  mkdirSync(getTemplateLibraryRoot(), { recursive: true })
}

function readRegistry<T>(name: string): Array<T> {
  ensureTemplateDir()
  const path = registryPath(name)
  if (!existsSync(path)) return []
  const rows: Array<T> = []
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line) as T)
    } catch {
      // Keep the append-only registry readable if a line is corrupt.
    }
  }
  return rows
}

function latestById<T extends { id: string }>(rows: Array<T>): Map<string, T> {
  const map = new Map<string, T>()
  for (const row of rows) {
    if (row?.id) map.set(row.id, row)
  }
  return map
}

const baseSections: Array<TemplateSection> = [
  {
    id: 'promise',
    title: 'Promesse',
    purpose: 'Résumer en une phrase ce que le produit permet au client ou partenaire.',
    required: true,
  },
  {
    id: 'target',
    title: 'Cible',
    purpose: 'Décrire les segments clients ou partenaires concernés.',
    required: true,
  },
  {
    id: 'problems',
    title: 'Problèmes adressés',
    purpose: 'Lister les irritants business ou opérationnels que l’offre résout.',
    required: true,
  },
  {
    id: 'benefits',
    title: 'Bénéfices',
    purpose: 'Transformer les caractéristiques en bénéfices clairs et vendables.',
    required: true,
  },
  {
    id: 'offer',
    title: 'Ce que contient l’offre',
    purpose: 'Présenter le périmètre produit, les options et les limites.',
    required: true,
  },
  {
    id: 'pricing',
    title: 'Pricing à valider',
    purpose: 'Indiquer les prix uniquement si une source tarifaire active existe.',
    required: true,
  },
  {
    id: 'objections',
    title: 'Objections et réponses',
    purpose: 'Préparer les réponses commerciales sans surpromesse.',
    required: true,
  },
  {
    id: 'sources',
    title: 'Sources et limites',
    purpose: 'Citer les documents utilisés, hypothèses et points non confirmés.',
    required: true,
  },
]

function promptsFor(channel: TemplateChannel): TemplatePromptSet {
  const channelInstruction = `Canal cible: ${channel}. Adapter le discours sans mélanger prix public, prix partenaire et hypothèses.`
  return {
    rag: `Extrais uniquement les faits sourcés utiles au livrable. Signale les contradictions, dates anciennes et informations manquantes. ${channelInstruction}`,
    pmm: `Transforme les faits en angle PMM exploitable: cible, bénéfices, objections, messages commerciaux et points à valider. ${channelInstruction}`,
    pricing: `Contrôle toute donnée tarifaire. Distingue prix public, prix partenaire, prix d'achat, prix de vente, hypothèse et donnée validée. Bloque les prix non sourcés. ${channelInstruction}`,
    writer: `Rédige le contenu final dans les sections du template, en français France, sans jargon inutile et avec un format prêt à relire. ${channelInstruction}`,
    designer: `Prépare une structure PDF premium, lisible, cohérente et réutilisable. Ne surcharge pas la page. ${channelInstruction}`,
    qa: `Vérifie chaque claim, source, prix, canal et limite. Signale ce qui doit rester en brouillon ou à valider. ${channelInstruction}`,
  }
}

function rulesFor(channel: TemplateChannel): Array<TemplateQualityRule> {
  return [
    {
      id: 'source-product-required',
      label: 'Une source produit active est obligatoire.',
      severity: 'blocking',
    },
    {
      id: 'pricing-source-required',
      label: 'Aucun prix ne peut être publié sans source pricing active et canal confirmé.',
      severity: 'blocking',
    },
    {
      id: 'channel-separation',
      label: 'Ne pas mélanger discours Direct, Ambassadeur et Opérateur.',
      severity: channel === 'tous' ? 'warning' : 'blocking',
    },
    {
      id: 'freshness',
      label: 'Signaler toute source sans date ou potentiellement obsolète.',
      severity: 'warning',
    },
    {
      id: 'citations',
      label: 'Les faits issus du RAG doivent citer leurs sources.',
      severity: 'blocking',
    },
  ]
}

function productSheetTemplate(
  id: string,
  name: string,
  channel: TemplateChannel,
  description: string,
): DeliverableTemplate {
  return {
    id,
    name,
    type: 'fiche_produit_pdf',
    productFamily: 'generic',
    channel,
    status: 'brouillon',
    version: 'v0.1',
    description,
    requiredSources: ['produit', 'pricing', 'commercial'],
    sections: baseSections,
    prompts: promptsFor(channel),
    qualityRules: rulesFor(channel),
    renderTarget: 'html_pdf',
    createdAt: TEMPLATE_CREATED_AT,
    updatedAt: TEMPLATE_CREATED_AT,
  }
}

export const DEFAULT_TEMPLATES: Array<DeliverableTemplate> = [
  productSheetTemplate(
    'template_fiche_produit_pdf_tous',
    'Fiche produit PDF - Tous canaux',
    'tous',
    'Template générique pour cadrer un livrable avant déclinaison par canal.',
  ),
  productSheetTemplate(
    'template_fiche_produit_pdf_direct',
    'Fiche produit PDF - Direct',
    'direct',
    'Template orienté client final, bénéfices, cas d’usage et discours commercial.',
  ),
  productSheetTemplate(
    'template_fiche_produit_pdf_ambassadeur',
    'Fiche produit PDF - Ambassadeur',
    'ambassadeur',
    'Template pour revendeur commissionné: facilité de vente, cible client, pitch et objections.',
  ),
  productSheetTemplate(
    'template_fiche_produit_pdf_operateur',
    'Fiche produit PDF - Opérateur / Marque blanche',
    'operateur',
    'Template achat/revente: intégration catalogue, marge partenaire, exploitation et règles wholesale.',
  ),
]

export function listTemplates(): Array<DeliverableTemplate> {
  const templates = new Map<string, DeliverableTemplate>()
  for (const template of DEFAULT_TEMPLATES) templates.set(template.id, template)
  for (const template of latestById(readRegistry<DeliverableTemplate>('templates')).values()) {
    templates.set(template.id, template)
  }
  return Array.from(templates.values()).sort((a, b) => {
    const statusRank = a.status.localeCompare(b.status)
    return statusRank || a.name.localeCompare(b.name)
  })
}

export function getTemplate(id: string): DeliverableTemplate | null {
  return listTemplates().find((template) => template.id === id) ?? null
}
