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
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type ProjectStatus = 'brouillon' | 'a_valider' | 'valide' | 'obsolete' | 'archive'
type ProjectEnvironment = 'sandbox' | 'staging' | 'live' | 'archived'

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

type Project = {
  id: string
  title: string
  objective: string
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
  }
  return labels[value] || value.replace(/_/g, ' ')
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [brief, setBrief] = useState('')
  const [projectForm, setProjectForm] = useState({
    title: '',
    objective: '',
    tags: '',
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

  const listUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    return `/api/projects/list?${params.toString()}`
  }, [query])

  const projectsQuery = useQuery({
    queryKey: ['project-cockpit', listUrl],
    queryFn: () => readJson<ProjectsResponse>(listUrl),
  })

  const projects = projectsQuery.data?.projects || []
  const options = projectsQuery.data?.options
  const selected = projects.find((project) => project.id === selectedId) || projects[0] || null

  async function refreshProjects() {
    await queryClient.invalidateQueries({ queryKey: ['project-cockpit'] })
  }

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    try {
      const result = await readJson<{ project: Project }>('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectForm),
      })
      setSelectedId(result.project.id)
      setProjectForm({ title: '', objective: '', tags: '' })
      await refreshProjects()
      toast('Projet créé.', { type: 'success' })
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
      setBrief(result.brief)
      await navigator.clipboard?.writeText(result.brief).catch(() => undefined)
      toast('Brief projet prêt et copié.', { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Brief impossible.', { type: 'error' })
    }
  }

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
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-h-0 border-r border-primary-200 dark:border-neutral-800">
          <form onSubmit={createProject} className="space-y-3 border-b border-primary-200 p-4 dark:border-neutral-800">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.7} />
              Nouveau projet
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Titre</FieldLabel>
              <Input
                value={projectForm.title}
                onChange={(event) => setProjectForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ex. Simulateur devis Trunk SIP"
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Objectif</FieldLabel>
              <textarea
                value={projectForm.objective}
                onChange={(event) => setProjectForm((current) => ({ ...current, objective: event.target.value }))}
                placeholder="Ce que le projet doit permettre d'obtenir"
                className="min-h-20 w-full resize-none rounded-lg border border-primary-200 bg-surface px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-800 dark:bg-neutral-950"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Tags</FieldLabel>
              <Input
                value={projectForm.tags}
                onChange={(event) => setProjectForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="metacentrex, pricing"
                className="h-8"
              />
            </div>
            <Button type="submit" disabled={creating || !projectForm.title.trim()} className="w-full">
              <HugeiconsIcon icon={Rocket01Icon} size={15} strokeWidth={1.7} />
              Créer le projet
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
                      <Button size="sm" onClick={generateBrief}>
                        <HugeiconsIcon icon={Rocket01Icon} size={15} strokeWidth={1.7} />
                        Travailler avec Hermes
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                  <div className="text-sm font-semibold">Brief Hermes</div>
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
