import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  CheckListIcon,
  File01Icon,
  Folder01Icon,
  Link01Icon,
  Rocket01Icon,
} from '@hugeicons/core-free-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type ProjectStatus = 'brouillon' | 'a_valider' | 'valide' | 'obsolete' | 'archive'
type ProjectEnvironment = 'sandbox' | 'staging' | 'live' | 'archived'
type ProjectTemplate = 'fiche_produit_pdf' | 'go_to_market' | 'analyse_pricing' | 'outil_web' | 'libre'
type ProjectChannel = 'Tous' | 'Direct' | 'Ambassadeur' | 'Opérateur' | 'Interne'

type ProjectSource = {
  id: string
  projectId: string
  type: string
  title: string
  link: string | null
  sourceId: string | null
  confidence: string
  status: string
  createdAt: string
  updatedAt: string
}

type ProjectArtifact = {
  id: string
  projectId: string
  type: string
  title: string
  pathOrUrl: string | null
  status: string
  version: string | null
  producedBy: string | null
  sourceRefs: Array<string>
  createdAt: string
  updatedAt: string
}

type ProjectDecision = {
  id: string
  projectId: string
  topic: string
  decision: string
  rationale: string | null
  status: string
  sourceRefs: Array<string>
  createdAt: string
  updatedAt: string
}

type ProjectContentDraft = {
  id: string
  projectId: string
  templateId: string | null
  fields: Record<string, string>
  markdown: string | null
  status: string
  version: string
  createdAt: string
  updatedAt: string
}

type Project = {
  id: string
  title: string
  objective: string
  templateId: string | null
  status: ProjectStatus
  environment: ProjectEnvironment
  tags: Array<string>
  owner: string | null
  nextAction: string | null
  createdAt: string
  updatedAt: string
  sources: Array<ProjectSource>
  artifacts: Array<ProjectArtifact>
  decisions: Array<ProjectDecision>
  contentDraft: ProjectContentDraft | null
}

type ProjectsResponse = {
  ok?: boolean
  projects?: Array<Project>
  options?: {
    statuses: ReadonlyArray<string>
    environments: ReadonlyArray<string>
    sourceTypes: ReadonlyArray<string>
    artifactTypes: ReadonlyArray<string>
  }
  error?: string
}

type DeliverableTemplate = {
  id: string
  name: string
  type: string
  channel: string
  status: string
  version: string
  description: string
  requiredSources: Array<string>
  sections: Array<{
    id: string
    title: string
    purpose: string
    required: boolean
  }>
  qualityRules: Array<{
    id: string
    label: string
    severity: 'info' | 'warning' | 'blocking'
  }>
}

type TemplatesResponse = {
  ok?: boolean
  templates?: Array<DeliverableTemplate>
  error?: string
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error)
        : `Request failed (${response.status})`
    throw new Error(message)
  }
  return payload as T
}

function optionLabel(value: string): string {
  const labels: Record<string, string> = {
    '': 'Aucun template',
    a_valider: 'À valider',
    valide: 'Validé',
    obsolete: 'Obsolète',
    archive: 'Archivé',
    archived: 'Archivé',
    sandbox: 'Sandbox',
    staging: 'Staging',
    live: 'Live',
    rag_document: 'Document RAG',
    github_repo: 'Repo GitHub',
    external_url: 'Lien externe',
    web_app: 'Interface web',
    spreadsheet: 'Tableur',
    presentation: 'Présentation',
    decision: 'Décision',
    markdown: 'Markdown',
    fiche_produit_pdf: 'Fiche produit PDF',
    go_to_market: 'Go-to-market',
    analyse_pricing: 'Analyse pricing',
    outil_web: 'Outil web',
    libre: 'Projet libre',
    template_fiche_produit_pdf_tous: 'Fiche produit PDF - Tous canaux',
    template_fiche_produit_pdf_direct: 'Fiche produit PDF - Direct',
    template_fiche_produit_pdf_ambassadeur: 'Fiche produit PDF - Ambassadeur',
    template_fiche_produit_pdf_operateur: 'Fiche produit PDF - Opérateur',
    produit: 'produit',
    pricing: 'pricing',
    commercial: 'commerciale',
    technique: 'technique',
    legal: 'juridique',
  }
  return labels[value] || value.replace(/_/g, ' ')
}

const PROJECT_TEMPLATES: Array<ProjectTemplate> = [
  'fiche_produit_pdf',
  'go_to_market',
  'analyse_pricing',
  'outil_web',
  'libre',
]

const PROJECT_CHANNELS: Array<ProjectChannel> = [
  'Tous',
  'Direct',
  'Ambassadeur',
  'Opérateur',
  'Interne',
]

function templateIdForProject(form: {
  template: ProjectTemplate
  channel: ProjectChannel
}): string | null {
  if (form.template !== 'fiche_produit_pdf') return null
  if (form.channel === 'Direct') return 'template_fiche_produit_pdf_direct'
  if (form.channel === 'Ambassadeur') return 'template_fiche_produit_pdf_ambassadeur'
  if (form.channel === 'Opérateur') return 'template_fiche_produit_pdf_operateur'
  return 'template_fiche_produit_pdf_tous'
}

function buildGuidedProject(form: {
  template: ProjectTemplate
  product: string
  channel: ProjectChannel
  need: string
}) {
  const product = form.product.trim()
  const need = form.need.trim()
  const channel = form.channel
  const baseTags = [form.template, product.toLowerCase().replace(/\s+/g, '-'), `canal:${channel.toLowerCase()}`]
  const templateId = templateIdForProject(form)

  if (form.template === 'fiche_produit_pdf') {
    return {
      title: `Fiche produit PDF - ${product}`,
      templateId,
      objective:
        need ||
        `Produire une fiche produit PDF claire, sourcée et exploitable commercialement pour ${product}. Le livrable doit identifier la cible, le canal ${channel}, les bénéfices client, les objections, les informations pricing à valider, les sources utilisées et les variantes nécessaires.`,
      tags: [...baseTags, 'livrable-pdf', 'fiche-produit', 'rag', 'pricing'],
      nextAction: `Rattacher les sources produit et pricing de ${product}, puis demander à Hermes une première fiche produit structurée.`,
    }
  }

  if (form.template === 'go_to_market') {
    return {
      title: `Go-to-market - ${product}`,
      templateId,
      objective:
        need ||
        `Cadrer le lancement go-to-market de ${product} pour le canal ${channel}: cible, proposition de valeur, messages, supports commerciaux, objections, dépendances et plan d'activation.`,
      tags: [...baseTags, 'gtm', 'sales-enablement'],
      nextAction: `Identifier les sources produit, pricing et canal pour préparer le plan go-to-market de ${product}.`,
    }
  }

  if (form.template === 'analyse_pricing') {
    return {
      title: `Analyse pricing - ${product}`,
      templateId,
      objective:
        need ||
        `Analyser le modèle tarifaire de ${product} pour le canal ${channel}, en distinguant prix public, prix partenaire, hypothèses, marge et points à valider.`,
      tags: [...baseTags, 'pricing', 'marge', 'arbitrage'],
      nextAction: `Rattacher les catalogues tarifaires et hypothèses de prix pour ${product}.`,
    }
  }

  if (form.template === 'outil_web') {
    return {
      title: `Outil web - ${product}`,
      templateId,
      objective:
        need ||
        `Cadrer un outil web opérationnel autour de ${product}: utilisateurs, workflow, données nécessaires, sorties attendues, prototype et critères d'acceptation.`,
      tags: [...baseTags, 'outil-web', 'prototype', 'sandbox'],
      nextAction: `Décrire le workflow utilisateur attendu et les données nécessaires pour ${product}.`,
    }
  }

  return {
    title: product,
    templateId,
    objective: need || `Cadrer le projet ${product} pour le canal ${channel}.`,
    tags: baseTags,
    nextAction: 'Préciser les sources, livrables et décisions attendues.',
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed)
}

function toneForStatus(status: string): string {
  if (status === 'valide' || status === 'live') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (status === 'a_valider' || status === 'staging') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (status === 'obsolete' || status === 'archive' || status === 'archived') return 'border-primary-400/30 bg-primary-500/10 text-primary-600 dark:text-neutral-300'
  return 'border-accent-500/30 bg-accent-500/10 text-accent-700 dark:text-accent-300'
}

function projectIsPdfProductSheet(project: Project): boolean {
  const haystack = [
    project.title,
    project.objective,
    ...project.tags,
    ...project.artifacts.map((artifact) => artifact.type),
  ]
    .join(' ')
    .toLowerCase()

  return (
    haystack.includes('fiche_produit_pdf') ||
    haystack.includes('fiche produit') ||
    haystack.includes('livrable-pdf') ||
    haystack.includes('pdf')
  )
}

function hasSource(project: Project, predicate: (source: ProjectSource) => boolean): boolean {
  return project.sources.some(predicate)
}

function hasArtifact(project: Project, predicate: (artifact: ProjectArtifact) => boolean): boolean {
  return project.artifacts.some(predicate)
}

function getAiPlan(project: Project) {
  const isPdfSheet = projectIsPdfProductSheet(project)
  const hasProductSource = hasSource(project, (source) => {
    const text = `${source.title} ${source.link || ''}`.toLowerCase()
    return text.includes('produit') || text.includes('catalogue') || text.includes('source')
  })
  const hasPricingSource = hasSource(project, (source) => {
    const text = `${source.title} ${source.link || ''}`.toLowerCase()
    return text.includes('pricing') || text.includes('prix') || text.includes('tarif')
  })
  const hasMarkdown = hasArtifact(project, (artifact) => artifact.type === 'markdown')
  const hasPdf = hasArtifact(project, (artifact) => artifact.type === 'pdf')
  const hasChannelDecision = project.decisions.some((decision) =>
    `${decision.topic} ${decision.decision}`.toLowerCase().includes('canal'),
  )
  const hasPricingDecision = project.decisions.some((decision) =>
    `${decision.topic} ${decision.decision}`.toLowerCase().includes('pricing') ||
    `${decision.topic} ${decision.decision}`.toLowerCase().includes('prix'),
  )

  const roles: Array<[string, string]> = isPdfSheet
    ? [
        ['PMM métier', 'Cadrer cible, bénéfices client, objections et angle commercial.'],
        ['Analyste RAG', 'Extraire uniquement les faits sourcés et signaler les trous documentaires.'],
        ['Pricing', 'Distinguer prix public, prix partenaire, hypothèse et donnée validée.'],
        ['Rédacteur', 'Produire une fiche courte, claire, prête à relire.'],
        ['Designer PDF', 'Transformer le contenu en livrable premium lisible et commercial.'],
        ['QA anti-hallucination', 'Contrôler chaque claim, source, prix et limite de publication.'],
      ]
    : [
        ['Chef de projet IA', 'Transformer la demande en lots, livrables et critères d’acceptation.'],
        ['Analyste métier', 'Identifier les enjeux, dépendances et décisions nécessaires.'],
        ['Producteur livrable', 'Créer l’artefact attendu dans le bon format.'],
        ['QA', 'Vérifier cohérence, sources, limites et prochaine action.'],
      ]

  const stages = isPdfSheet
    ? [
        'Pré-vol sources : confirmer source produit, source pricing, canal et statut de publication.',
        'Extraction RAG : produire les faits sourcés et les incertitudes.',
        'Synthèse PMM : transformer les faits en bénéfices, cible, objections et pitch.',
        'Rédaction v0.1 : générer le Markdown source avec hypothèses et points à valider.',
        'Contrôle QA : bloquer les prix ou claims non sourcés.',
        'Export PDF : générer la version premium via PDF Engine, puis rattacher l’artefact.',
      ]
    : [
        'Pré-vol : vérifier sources, objectif et livrables attendus.',
        'Découpage : proposer les lots de travail et rôles utiles.',
        'Production : générer le premier artefact exploitable.',
        'Contrôle : lister limites, risques et validations humaines.',
      ]

  const checklist: Array<[string, boolean]> = [
    ['Source produit présente', hasProductSource],
    ['Source pricing présente ou prix explicitement masqués', hasPricingSource || hasPricingDecision],
    ['Canal ou cible cadré', hasChannelDecision || project.tags.some((tag) => tag.startsWith('canal:'))],
    ['Artefact source Markdown prévu', hasMarkdown],
    ['Artefact PDF prévu', hasPdf],
    ['Décisions critiques enregistrées', project.decisions.length > 0],
  ]

  const missing = checklist
    .filter(([, done]) => !done)
    .map(([label]) => String(label))

  return { roles, stages, checklist, missing }
}

function sourceMatchesRequirement(source: ProjectSource, requirement: string): boolean {
  const text = `${source.title} ${source.link || ''} ${source.sourceId || ''}`.toLowerCase()
  if (requirement === 'produit') return text.includes('produit') || text.includes('catalogue') || text.includes('fiche')
  if (requirement === 'pricing') return text.includes('pricing') || text.includes('prix') || text.includes('tarif')
  if (requirement === 'commercial') return text.includes('commercial') || text.includes('pitch') || text.includes('sales')
  if (requirement === 'technique') return text.includes('technique') || text.includes('architecture') || text.includes('guide')
  if (requirement === 'legal') return text.includes('contrat') || text.includes('legal') || text.includes('juridique')
  return text.includes(requirement)
}

function getTemplatePreflight(project: Project, template: DeliverableTemplate | null) {
  if (!template) {
    return {
      ready: false,
      missing: ['Template livrable non rattaché'],
      sourceChecks: [] as Array<[string, boolean]>,
      blockingRules: [] as Array<string>,
    }
  }

  const sourceChecks = template.requiredSources.map((source) => [
    source,
    project.sources.some((projectSource) => sourceMatchesRequirement(projectSource, source)),
  ] as [string, boolean])
  const missing = sourceChecks
    .filter(([, done]) => !done)
    .map(([source]) => `Source ${optionLabel(source)} manquante`)
  const blockingRules = template.qualityRules
    .filter((rule) => rule.severity === 'blocking')
    .map((rule) => rule.label)

  return {
    ready: missing.length === 0,
    missing,
    sourceChecks,
    blockingRules,
  }
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', tone)}>
      {children}
    </span>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium text-primary-600 dark:text-neutral-400">
      {children}
    </label>
  )
}

function SelectField({
  value,
  options,
  onChange,
}: {
  value: string
  options: ReadonlyArray<string>
  onChange: (value: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2 text-sm text-primary-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {optionLabel(option)}
        </option>
      ))}
    </select>
  )
}

export function ProjectsScreen() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [savingDetails, setSavingDetails] = useState(false)
  const [savingContent, setSavingContent] = useState(false)
  const [brief, setBrief] = useState('')
  const [briefTitle, setBriefTitle] = useState('Brief Hermes')
  const [contentFields, setContentFields] = useState<Record<string, string>>({})
  const [contentMarkdown, setContentMarkdown] = useState('')
  const [projectForm, setProjectForm] = useState({
    template: 'fiche_produit_pdf' as ProjectTemplate,
    product: '',
    channel: 'Tous' as ProjectChannel,
    need: '',
  })
  const [sourceForm, setSourceForm] = useState({
    type: 'url',
    title: '',
    link: '',
  })
  const [artifactForm, setArtifactForm] = useState({
    type: 'markdown',
    title: '',
    pathOrUrl: '',
  })
  const [decisionForm, setDecisionForm] = useState({
    topic: '',
    decision: '',
  })
  const [editForm, setEditForm] = useState({
    title: '',
    objective: '',
    templateId: '',
    tags: '',
    nextAction: '',
  })

  const listUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (includeArchived) params.set('includeArchived', 'true')
    return `/api/projects/list?${params.toString()}`
  }, [includeArchived, query])

  const projectsQuery = useQuery({
    queryKey: ['project-cockpit', listUrl],
    queryFn: () => readJson<ProjectsResponse>(listUrl),
  })

  const templatesQuery = useQuery({
    queryKey: ['dstny-templates'],
    queryFn: () => readJson<TemplatesResponse>('/api/dstny-templates/list'),
  })

  const projects = projectsQuery.data?.projects || []
  const options = projectsQuery.data?.options
  const templates = templatesQuery.data?.templates || []
  const selected = projects.find((project) => project.id === selectedId) || projects[0] || null
  const aiPlan = selected ? getAiPlan(selected) : null
  const selectedTemplate = selected?.templateId
    ? templates.find((template) => template.id === selected.templateId) || null
    : null
  const templatePreflight = selected ? getTemplatePreflight(selected, selectedTemplate) : null

  useEffect(() => {
    if (!selected) {
      setEditForm({ title: '', objective: '', templateId: '', tags: '', nextAction: '' })
      return
    }

    setEditForm({
      title: selected.title,
      objective: selected.objective || '',
      templateId: selected.templateId || '',
      tags: selected.tags.join(', '),
      nextAction: selected.nextAction || '',
    })
  }, [selected?.id])

  useEffect(() => {
    if (!selected) {
      setContentFields({})
      setContentMarkdown('')
      return
    }

    const draftFields = selected.contentDraft?.fields || {}
    const templateFields = Object.fromEntries(
      (selectedTemplate?.sections || []).map((section) => [section.id, draftFields[section.id] || '']),
    )
    setContentFields({ ...draftFields, ...templateFields })
    setContentMarkdown(selected.contentDraft?.markdown || '')
  }, [selected?.id, selectedTemplate?.id])

  async function refreshProjects() {
    await queryClient.invalidateQueries({ queryKey: ['project-cockpit'] })
  }

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    try {
      const guidedProject = buildGuidedProject(projectForm)
      const result = await readJson<{ project: Project }>('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guidedProject),
      })

      if (projectForm.template === 'fiche_produit_pdf') {
        await Promise.all([
          readJson('/api/projects/add-source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: result.project.id,
              type: 'rag_document',
              title: `Source produit - ${projectForm.product}`,
              link: 'Document produit à rattacher depuis Documents Dstny',
              confidence: 'moyen',
              status: 'a_valider',
            }),
          }),
          readJson('/api/projects/add-source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: result.project.id,
              type: 'rag_document',
              title: `Source pricing - ${projectForm.product}`,
              link: 'Catalogue tarifaire ou grille prix à rattacher',
              confidence: 'moyen',
              status: 'a_valider',
            }),
          }),
          readJson('/api/projects/add-artifact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: result.project.id,
              type: 'markdown',
              title: 'Fiche produit source - v0.1',
              pathOrUrl: 'À produire par Hermes avant export PDF',
              version: 'v0.1',
              producedBy: 'Hermes',
            }),
          }),
          readJson('/api/projects/add-artifact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: result.project.id,
              type: 'pdf',
              title: 'Fiche produit PDF - v0.1',
              pathOrUrl: 'À générer via PDF Engine',
              version: 'v0.1',
              producedBy: 'PDF Engine',
            }),
          }),
          readJson('/api/projects/add-decision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: result.project.id,
              topic: 'Canal et cible',
              decision: `La fiche doit être cadrée pour le canal ${projectForm.channel}. Prévoir une variante si les messages Direct / Ambassadeur / Opérateur divergent.`,
              status: 'a_valider',
            }),
          }),
          readJson('/api/projects/add-decision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: result.project.id,
              topic: 'Pricing',
              decision: 'Ne publier aucun prix tant que la source tarifaire active et le canal ne sont pas confirmés.',
              status: 'a_valider',
            }),
          }),
        ])
      }

      setSelectedId(result.project.id)
      setProjectForm({
        template: 'fiche_produit_pdf',
        product: '',
        channel: 'Tous',
        need: '',
      })
      await refreshProjects()
      toast('Projet cadré.', { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Création impossible.', { type: 'error' })
    } finally {
      setCreating(false)
    }
  }

  async function updateSelected(patch: Partial<Project>) {
    if (!selected) return
    try {
      await readJson('/api/projects/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, patch }),
      })
      await refreshProjects()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Mise à jour impossible.', { type: 'error' })
    }
  }

  async function saveProjectDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    setSavingDetails(true)
    try {
      await readJson('/api/projects/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          patch: {
            title: editForm.title,
            objective: editForm.objective,
            templateId: editForm.templateId || null,
            tags: editForm.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
            nextAction: editForm.nextAction,
          },
        }),
      })
      await refreshProjects()
      toast('Projet mis à jour.', { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Mise à jour impossible.', { type: 'error' })
    } finally {
      setSavingDetails(false)
    }
  }

  async function addSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    try {
      await readJson('/api/projects/add-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selected.id, ...sourceForm }),
      })
      setSourceForm({ type: 'url', title: '', link: '' })
      await refreshProjects()
      toast('Source liée.', { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Source impossible.', { type: 'error' })
    }
  }

  async function addArtifact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    try {
      await readJson('/api/projects/add-artifact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selected.id, ...artifactForm }),
      })
      setArtifactForm({ type: 'markdown', title: '', pathOrUrl: '' })
      await refreshProjects()
      toast('Artefact lié.', { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Artefact impossible.', { type: 'error' })
    }
  }

  async function addDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    try {
      await readJson('/api/projects/add-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selected.id, ...decisionForm }),
      })
      setDecisionForm({ topic: '', decision: '' })
      await refreshProjects()
      toast('Décision enregistrée.', { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Décision impossible.', { type: 'error' })
    }
  }

  async function generateBrief() {
    if (!selected) return
    try {
      const result = await readJson<{ brief: string }>(
        `/api/projects/brief?id=${encodeURIComponent(selected.id)}`,
      )
      setBriefTitle('Brief Hermes')
      setBrief(result.brief)
      await navigator.clipboard?.writeText(result.brief).catch(() => undefined)
      toast('Brief projet prêt et copié.', { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Brief impossible.', { type: 'error' })
    }
  }

  async function generateQualityReview() {
    if (!selected) return
    try {
      const result = await readJson<{
        quality: {
          score: number
          status: string
          summary: string
          nextAction: string
          blocking: Array<string>
          warnings: Array<string>
          ready: Array<string>
          missing: Array<string>
        }
        brief: string
      }>('/api/projects/agent-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review_project',
          projectId: selected.id,
        }),
      })
      const qualityText = [
        `Revue qualité - ${selected.title}`,
        '',
        `Score : ${result.quality.score}/100`,
        `Statut : ${optionLabel(result.quality.status)}`,
        '',
        result.quality.summary,
        '',
        'Blocages',
        ...(result.quality.blocking.length ? result.quality.blocking.map((item) => `- ${item}`) : ['- Aucun']),
        '',
        'Points à cadrer',
        ...(result.quality.warnings.length ? result.quality.warnings.map((item) => `- ${item}`) : ['- Aucun']),
        '',
        'Éléments prêts',
        ...(result.quality.ready.length ? result.quality.ready.map((item) => `- ${item}`) : ['- Aucun']),
        '',
        'Manquants',
        ...(result.quality.missing.length ? result.quality.missing.map((item) => `- ${item}`) : ['- Aucun']),
        '',
        'Prochaine action',
        result.quality.nextAction,
        '',
        'Brief projet',
        '',
        result.brief,
      ].join('\n')
      setBriefTitle('Revue qualité')
      setBrief(qualityText)
      await navigator.clipboard?.writeText(qualityText).catch(() => undefined)
      toast('Revue qualité prête et copiée.', { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Revue qualité impossible.', { type: 'error' })
    }
  }

  async function saveContentDraft(action: 'save' | 'generate_markdown' | 'suggest_content') {
    if (!selected) return
    setSavingContent(true)
    try {
      const result = await readJson<{
        draft: ProjectContentDraft
      }>('/api/projects/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selected.id,
          templateId: selected.templateId,
          fields: contentFields,
          markdown: contentMarkdown,
          action,
          createArtifact: action === 'generate_markdown',
        }),
      })
      setContentFields(result.draft.fields || {})
      setContentMarkdown(result.draft.markdown || '')
      await refreshProjects()
      toast(
        action === 'generate_markdown'
          ? 'Markdown généré.'
          : action === 'suggest_content'
            ? 'Brouillon métier pré-rempli.'
            : 'Brouillon enregistré.',
        { type: 'success' },
      )
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Studio contenu indisponible.', { type: 'error' })
    } finally {
      setSavingContent(false)
    }
  }

  async function reactivateProject() {
    if (!selected) return
    await updateSelected({ status: 'brouillon', environment: 'sandbox' })
  }

  const selectedIsArchived =
    selected?.status === 'archive' || selected?.environment === 'archived'

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--theme-bg)] text-primary-900 dark:text-neutral-100">
      <header className="border-b border-primary-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Projets</h1>
            <div className="mt-1 text-xs text-primary-600 dark:text-neutral-400">
              {projects.length} projets · cockpit IA · sources · artefacts · décisions
            </div>
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher"
            className="h-8 w-full lg:w-72"
          />
          <label className="flex items-center gap-2 text-xs text-primary-600 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
              className="size-4 rounded border-primary-300"
            />
            Inclure les archivés
          </label>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-h-0 border-r border-primary-200 dark:border-neutral-800">
          <form onSubmit={createProject} className="space-y-3 border-b border-primary-200 p-4 dark:border-neutral-800">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.7} />
              Nouveau projet guidé
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Type de projet</FieldLabel>
              <SelectField
                value={projectForm.template}
                options={PROJECT_TEMPLATES}
                onChange={(value) => setProjectForm((current) => ({ ...current, template: value as ProjectTemplate }))}
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Produit / offre</FieldLabel>
              <Input
                value={projectForm.product}
                onChange={(event) => setProjectForm((current) => ({ ...current, product: event.target.value }))}
                placeholder="Ex. Connectivité FTTO"
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Canal principal</FieldLabel>
              <SelectField
                value={projectForm.channel}
                options={PROJECT_CHANNELS}
                onChange={(value) => setProjectForm((current) => ({ ...current, channel: value as ProjectChannel }))}
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Demande simple</FieldLabel>
              <textarea
                value={projectForm.need}
                onChange={(event) => setProjectForm((current) => ({ ...current, need: event.target.value }))}
                placeholder="Optionnel : ex. Je veux une fiche claire pour aider les commerciaux à vendre cette offre."
                className="min-h-20 w-full resize-none rounded-lg border border-primary-200 bg-surface px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-800 dark:bg-neutral-950"
              />
            </div>
            <div className="rounded-lg border border-primary-200 bg-primary-50/60 p-3 text-xs leading-5 text-primary-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
              Hermes créera le cadrage initial, les sources à rattacher, les premiers artefacts et les décisions à valider.
            </div>
            <Button type="submit" disabled={creating || !projectForm.product.trim()} className="w-full">
              <HugeiconsIcon icon={Rocket01Icon} size={15} strokeWidth={1.7} />
              Cadrer le projet
            </Button>
          </form>

          <div className="min-h-0 overflow-y-auto p-3">
            {projectsQuery.isLoading ? (
              <div className="p-4 text-sm text-primary-500">Chargement...</div>
            ) : projects.length === 0 ? (
              <div className="p-4 text-sm text-primary-500">Aucun projet.</div>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => setSelectedId(project.id)}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition',
                      selected?.id === project.id
                        ? 'border-primary-500 bg-primary-100 dark:bg-neutral-900'
                        : 'border-primary-200 hover:bg-primary-50 dark:border-neutral-800 dark:hover:bg-neutral-900',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{project.title}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-primary-600 dark:text-neutral-400">
                          {project.objective || 'Objectif à cadrer'}
                        </div>
                      </div>
                      <Badge tone={toneForStatus(project.environment)}>{optionLabel(project.environment)}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge tone={toneForStatus(project.status)}>{optionLabel(project.status)}</Badge>
                      {project.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} tone="border-primary-200 bg-transparent text-primary-500 dark:border-neutral-800">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-4">
          {selected ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,460px)]">
              <section className="min-w-0 space-y-4">
                <div className="rounded-lg border border-primary-200 p-4 dark:border-neutral-800">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <HugeiconsIcon icon={Folder01Icon} size={18} strokeWidth={1.7} />
                        <h2 className="truncate text-base font-semibold">{selected.title}</h2>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-primary-700 dark:text-neutral-300">
                        {selected.objective || 'Objectif à cadrer avec Hermes.'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone={toneForStatus(selected.status)}>{optionLabel(selected.status)}</Badge>
                        <Badge tone={toneForStatus(selected.environment)}>{optionLabel(selected.environment)}</Badge>
                        <span className="text-xs text-primary-500">Mis à jour le {formatDate(selected.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {selectedIsArchived ? (
                        <Button size="sm" variant="outline" onClick={() => void reactivateProject()}>
                          Réactiver
                        </Button>
                      ) : null}
                      <Button size="sm" onClick={generateBrief}>
                        <HugeiconsIcon icon={Rocket01Icon} size={15} strokeWidth={1.7} />
                        Travailler avec Hermes
                      </Button>
                      <Button size="sm" variant="outline" onClick={generateQualityReview}>
                        <HugeiconsIcon icon={CheckListIcon} size={15} strokeWidth={1.7} />
                        Revue qualité
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <form onSubmit={saveProjectDetails} className="space-y-3 rounded-lg border border-primary-200 p-3 dark:border-neutral-800 sm:col-span-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">Cadrage projet</div>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={savingDetails || !editForm.title.trim()}
                        >
                          Enregistrer
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <FieldLabel>Titre du projet</FieldLabel>
                          <Input
                            value={editForm.title}
                            onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                            className="h-8"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Template livrable</FieldLabel>
                          <SelectField
                            value={editForm.templateId}
                            options={['', ...templates.map((template) => template.id)]}
                            onChange={(value) => setEditForm((current) => ({ ...current, templateId: value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Tags</FieldLabel>
                          <Input
                            value={editForm.tags}
                            onChange={(event) => setEditForm((current) => ({ ...current, tags: event.target.value }))}
                            placeholder="metacentrex, pricing"
                            className="h-8"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel>Objectif</FieldLabel>
                        <textarea
                          value={editForm.objective}
                          onChange={(event) => setEditForm((current) => ({ ...current, objective: event.target.value }))}
                          placeholder="Ce que le projet doit permettre d'obtenir"
                          className="min-h-24 w-full resize-y rounded-lg border border-primary-200 bg-surface px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-800 dark:bg-neutral-950"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel>Prochaine action</FieldLabel>
                        <Input
                          value={editForm.nextAction}
                          onChange={(event) => setEditForm((current) => ({ ...current, nextAction: event.target.value }))}
                          placeholder="Ex. Faire analyser les sources par Hermes"
                          className="h-8"
                        />
                      </div>
                    </form>
                    <div className="space-y-1.5">
                      <FieldLabel>Statut</FieldLabel>
                      <SelectField
                        value={selected.status}
                        options={options?.statuses || [selected.status]}
                        onChange={(value) => void updateSelected({ status: value as ProjectStatus })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Environnement</FieldLabel>
                      <SelectField
                        value={selected.environment}
                        options={options?.environments || [selected.environment]}
                        onChange={(value) => void updateSelected({ environment: value as ProjectEnvironment })}
                      />
                    </div>
                  </div>
                </div>

                {aiPlan ? (
                  <div className="rounded-lg border border-primary-200 p-4 dark:border-neutral-800">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">Plan IA & Qualité</h3>
                        <p className="mt-1 text-xs leading-5 text-primary-600 dark:text-neutral-400">
                          Ce bloc traduit le projet en équipe IA, étapes de production, contrôles qualité et points manquants avant de consommer des tokens.
                        </p>
                      </div>
                      <Badge
                        tone={
                          aiPlan.missing.length === 0
                            ? toneForStatus('valide')
                            : toneForStatus('a_valider')
                        }
                      >
                        {aiPlan.missing.length === 0
                          ? 'Prêt à produire'
                          : `${aiPlan.missing.length} points à cadrer`}
                      </Badge>
                    </div>

                    {templatePreflight ? (
                      <div className="mt-4 rounded-lg border border-primary-200 p-3 dark:border-neutral-800">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold">
                              Template actif : {selectedTemplate?.name || 'Aucun template rattaché'}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-primary-600 dark:text-neutral-400">
                              Le pré-vol compare le projet avec les sources et règles exigées par le template.
                            </div>
                          </div>
                          <Badge tone={templatePreflight.ready ? toneForStatus('valide') : toneForStatus('a_valider')}>
                            {templatePreflight.ready ? 'Sources template OK' : 'Sources template à compléter'}
                          </Badge>
                        </div>
                        {templatePreflight.sourceChecks.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {templatePreflight.sourceChecks.map(([source, done]) => (
                              <Badge
                                key={source}
                                tone={done ? toneForStatus('valide') : toneForStatus('a_valider')}
                              >
                                {done ? 'OK' : 'Manque'} · source {optionLabel(source)}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        {templatePreflight.blockingRules.length > 0 ? (
                          <div className="mt-3 space-y-1">
                            {templatePreflight.blockingRules.slice(0, 3).map((rule) => (
                              <div key={rule} className="text-xs leading-5 text-primary-600 dark:text-neutral-400">
                                Règle bloquante : {rule}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {aiPlan.missing.length > 0 ? (
                      <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
                        <div className="font-semibold">Pré-vol recommandé</div>
                        <div className="mt-1">
                          Ne lance pas la production complète tant que ces points ne sont pas couverts :
                          {' '}
                          {aiPlan.missing.join(', ')}.
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-4 xl:grid-cols-3">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase text-primary-500 dark:text-neutral-400">
                          Équipe IA
                        </div>
                        <div className="space-y-2">
                          {aiPlan.roles.map(([role, detail]) => (
                            <div key={role} className="rounded-lg border border-primary-200 p-3 dark:border-neutral-800">
                              <div className="text-sm font-semibold">{role}</div>
                              <div className="mt-1 text-xs leading-5 text-primary-600 dark:text-neutral-400">
                                {detail}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase text-primary-500 dark:text-neutral-400">
                          Production
                        </div>
                        <ol className="space-y-2">
                          {aiPlan.stages.map((stage, index) => (
                            <li key={stage} className="flex gap-2 rounded-lg border border-primary-200 p-3 text-xs leading-5 dark:border-neutral-800">
                              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[11px] font-semibold dark:bg-neutral-900">
                                {index + 1}
                              </span>
                              <span>{stage}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase text-primary-500 dark:text-neutral-400">
                          Checklist
                        </div>
                        <div className="space-y-2">
                          {aiPlan.checklist.map(([label, done]) => (
                            <div
                              key={String(label)}
                              className={cn(
                                'flex items-center gap-2 rounded-lg border p-3 text-xs',
                                done
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                              )}
                            >
                              <span className="text-sm font-semibold">{done ? 'OK' : 'À cadrer'}</span>
                              <span>{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {selectedTemplate ? (
                  <div className="rounded-lg border border-primary-200 p-4 dark:border-neutral-800">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">Studio contenu</h3>
                        <p className="mt-1 text-xs leading-5 text-primary-600 dark:text-neutral-400">
                          Remplis les sections du template avec tes notes, une dictée, un copier-coller ou plus tard des extraits RAG. Le PDF viendra après validation du contenu.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={savingContent}
                          onClick={() => void saveContentDraft('suggest_content')}
                        >
                          Pré-remplir avec Hermes
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={savingContent}
                          onClick={() => void saveContentDraft('save')}
                        >
                          Enregistrer
                        </Button>
                        <Button
                          size="sm"
                          disabled={savingContent}
                          onClick={() => void saveContentDraft('generate_markdown')}
                        >
                          Générer Markdown
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {selectedTemplate.sections.map((section) => (
                        <div key={section.id} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <FieldLabel>{section.title}</FieldLabel>
                            {section.required ? (
                              <Badge tone={toneForStatus('a_valider')}>attendu</Badge>
                            ) : null}
                          </div>
                          <textarea
                            value={contentFields[section.id] || ''}
                            onChange={(event) => setContentFields((current) => ({
                              ...current,
                              [section.id]: event.target.value,
                            }))}
                            placeholder={section.purpose}
                            className="min-h-28 w-full resize-y rounded-lg border border-primary-200 bg-surface px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-800 dark:bg-neutral-950"
                          />
                        </div>
                      ))}
                    </div>

                    {contentMarkdown ? (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold uppercase text-primary-500 dark:text-neutral-400">
                            Markdown généré
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              void navigator.clipboard?.writeText(contentMarkdown)
                              toast('Markdown copié.', { type: 'success' })
                            }}
                          >
                            Copier
                          </Button>
                        </div>
                        <pre className="max-h-72 overflow-auto rounded-lg border border-primary-200 bg-primary-50 p-3 text-xs leading-5 text-primary-800 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
                          {contentMarkdown}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-2">
                  <Panel title="Sources" icon={File01Icon} count={selected.sources.length}>
                    <form onSubmit={addSource} className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                      <SelectField
                        value={sourceForm.type}
                        options={options?.sourceTypes || ['url']}
                        onChange={(value) => setSourceForm((current) => ({ ...current, type: value }))}
                      />
                      <Input
                        value={sourceForm.title}
                        onChange={(event) => setSourceForm((current) => ({ ...current, title: event.target.value }))}
                        placeholder="Titre de la source"
                        className="h-8"
                      />
                      <Input
                        value={sourceForm.link}
                        onChange={(event) => setSourceForm((current) => ({ ...current, link: event.target.value }))}
                        placeholder="Lien, doc id ou chemin"
                        className="h-8 sm:col-span-2"
                      />
                      <Button type="submit" size="sm" disabled={!sourceForm.title.trim()} className="sm:col-span-2">
                        Ajouter la source
                      </Button>
                    </form>
                    <RecordList items={selected.sources} empty="Aucune source." />
                  </Panel>

                  <Panel title="Artefacts" icon={Link01Icon} count={selected.artifacts.length}>
                    <form onSubmit={addArtifact} className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                      <SelectField
                        value={artifactForm.type}
                        options={options?.artifactTypes || ['markdown']}
                        onChange={(value) => setArtifactForm((current) => ({ ...current, type: value }))}
                      />
                      <Input
                        value={artifactForm.title}
                        onChange={(event) => setArtifactForm((current) => ({ ...current, title: event.target.value }))}
                        placeholder="Titre du livrable"
                        className="h-8"
                      />
                      <Input
                        value={artifactForm.pathOrUrl}
                        onChange={(event) => setArtifactForm((current) => ({ ...current, pathOrUrl: event.target.value }))}
                        placeholder="URL, chemin, repo ou fichier"
                        className="h-8 sm:col-span-2"
                      />
                      <Button type="submit" size="sm" disabled={!artifactForm.title.trim()} className="sm:col-span-2">
                        Ajouter l'artefact
                      </Button>
                    </form>
                    <RecordList items={selected.artifacts} empty="Aucun artefact." />
                  </Panel>
                </div>

                <Panel title="Décisions" icon={CheckListIcon} count={selected.decisions.length}>
                  <form onSubmit={addDecision} className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={decisionForm.topic}
                      onChange={(event) => setDecisionForm((current) => ({ ...current, topic: event.target.value }))}
                      placeholder="Sujet"
                      className="h-8"
                    />
                    <Input
                      value={decisionForm.decision}
                      onChange={(event) => setDecisionForm((current) => ({ ...current, decision: event.target.value }))}
                      placeholder="Décision ou hypothèse"
                      className="h-8"
                    />
                    <Button type="submit" size="sm" disabled={!decisionForm.topic.trim() || !decisionForm.decision.trim()} className="sm:col-span-2">
                      Enregistrer la décision
                    </Button>
                  </form>
                  <RecordList items={selected.decisions} empty="Aucune décision." />
                </Panel>
              </section>

              <aside className="min-w-0 rounded-lg border border-primary-200 dark:border-neutral-800">
                <div className="flex items-center justify-between border-b border-primary-200 px-3 py-2 dark:border-neutral-800">
                  <div className="text-sm font-semibold">{briefTitle}</div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!brief}
                    onClick={() => {
                      void navigator.clipboard?.writeText(brief)
                      toast('Brief copié.', { type: 'success' })
                    }}
                  >
                    Copier
                  </Button>
                </div>
                <textarea
                  value={brief}
                  readOnly
                  placeholder="Clique sur Travailler avec Hermes pour générer le contexte projet."
                  className="h-[520px] w-full resize-none bg-transparent p-3 text-sm leading-6 outline-none"
                />
              </aside>
            </div>
          ) : (
            <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-primary-500">
              Crée un projet pour commencer.
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function Panel({
  title,
  icon,
  count,
  children,
}: {
  title: string
  icon: typeof File01Icon
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-primary-200 p-3 dark:border-neutral-800">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <HugeiconsIcon icon={icon} size={16} strokeWidth={1.7} />
          {title}
        </div>
        <span className="text-xs text-primary-500">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function RecordList({
  items,
  empty,
}: {
  items: Array<ProjectSource | ProjectArtifact | ProjectDecision>
  empty: string
}) {
  if (!items.length) {
    return <div className="rounded-lg border border-dashed border-primary-200 p-3 text-sm text-primary-500 dark:border-neutral-800">{empty}</div>
  }
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const kind = 'type' in item ? optionLabel(item.type) : item.status
        const title = 'title' in item ? item.title : item.topic
        const detail =
          'link' in item
            ? item.link
            : 'pathOrUrl' in item
              ? item.pathOrUrl
              : item.decision
        return (
          <div key={item.id} className="rounded-lg border border-primary-200 p-3 dark:border-neutral-800">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{title}</div>
                {detail ? (
                  <div className="mt-1 truncate text-xs text-primary-500">{detail}</div>
                ) : null}
              </div>
              <Badge tone={toneForStatus(item.status)}>{kind}</Badge>
            </div>
          </div>
        )
      })}
    </div>
  )
}
