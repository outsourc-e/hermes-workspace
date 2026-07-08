import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const PROJECT_STATUSES = [
  'brouillon',
  'a_valider',
  'valide',
  'obsolete',
  'archive',
] as const

export const PROJECT_ENVIRONMENTS = [
  'sandbox',
  'staging',
  'live',
  'archived',
] as const

export const PROJECT_SOURCE_TYPES = [
  'rag_document',
  'file',
  'url',
  'github_repo',
  'note',
] as const

export const PROJECT_ARTIFACT_TYPES = [
  'markdown',
  'pdf',
  'spreadsheet',
  'presentation',
  'web_app',
  'prompt',
  'decision',
  'code',
  'dataset',
  'external_url',
] as const

export type ProjectStatus = typeof PROJECT_STATUSES[number]
export type ProjectEnvironment = typeof PROJECT_ENVIRONMENTS[number]
export type ProjectSourceType = typeof PROJECT_SOURCE_TYPES[number]
export type ProjectArtifactType = typeof PROJECT_ARTIFACT_TYPES[number]

export type ProjectRecord = {
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
}

export type ProjectSourceRecord = {
  id: string
  projectId: string
  type: ProjectSourceType
  title: string
  link: string | null
  sourceId: string | null
  confidence: 'faible' | 'moyen' | 'fort'
  status: ProjectStatus
  createdAt: string
  updatedAt: string
}

export type ProjectArtifactRecord = {
  id: string
  projectId: string
  type: ProjectArtifactType
  title: string
  pathOrUrl: string | null
  status: ProjectStatus
  version: string | null
  producedBy: string | null
  sourceRefs: Array<string>
  createdAt: string
  updatedAt: string
}

export type ProjectDecisionRecord = {
  id: string
  projectId: string
  topic: string
  decision: string
  rationale: string | null
  status: ProjectStatus
  sourceRefs: Array<string>
  createdAt: string
  updatedAt: string
}

export type CreateProjectInput = {
  title: string
  objective?: string | null
  status?: string | null
  environment?: string | null
  tags?: Array<string> | string | null
  owner?: string | null
  nextAction?: string | null
}

export type UpdateProjectInput = Partial<Omit<
  ProjectRecord,
  'id' | 'createdAt' | 'updatedAt'
>>

export type CreateProjectSourceInput = {
  projectId: string
  type: string
  title: string
  link?: string | null
  sourceId?: string | null
  confidence?: string | null
  status?: string | null
}

export type CreateProjectArtifactInput = {
  projectId: string
  type: string
  title: string
  pathOrUrl?: string | null
  status?: string | null
  version?: string | null
  producedBy?: string | null
  sourceRefs?: Array<string> | string | null
}

export type CreateProjectDecisionInput = {
  projectId: string
  topic: string
  decision: string
  rationale?: string | null
  status?: string | null
  sourceRefs?: Array<string> | string | null
}

export type ProjectBundle = ProjectRecord & {
  sources: Array<ProjectSourceRecord>
  artifacts: Array<ProjectArtifactRecord>
  decisions: Array<ProjectDecisionRecord>
}

export type ProjectFilters = {
  q?: string | null
  status?: string | null
  environment?: string | null
  includeArchived?: boolean
}

function hermesRoot(): string {
  return resolve(
    process.env.HERMES_HOME?.trim() ||
      process.env.CLAUDE_HOME?.trim() ||
      join(homedir(), '.hermes'),
  )
}

export function getProjectCockpitRoot(): string {
  return resolve(
    process.env.PROJECT_COCKPIT_ROOT?.trim() ||
      join(hermesRoot(), 'projects'),
  )
}

function registryPath(name: string): string {
  return join(getProjectCockpitRoot(), `${name}.jsonl`)
}

export function getProjectRegistryPath(): string {
  return registryPath('projects')
}

function ensureProjectDir(): void {
  mkdirSync(getProjectCockpitRoot(), { recursive: true })
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

function normalizeTags(value: Array<string> | string | null | undefined): Array<string> {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return Array.from(new Set(raw.map((item) => item.trim()).filter(Boolean))).slice(0, 30)
}

function assertOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
  fallback?: T[number],
): T[number] {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T[number]
  }
  if (fallback) return fallback
  throw new Error(`${field} must be one of: ${allowed.join(', ')}`)
}

function appendRecord<T>(name: string, record: T): T {
  ensureProjectDir()
  appendFileSync(registryPath(name), `${JSON.stringify(record)}\n`, 'utf-8')
  return record
}

function readRegistry<T>(name: string): Array<T> {
  const path = registryPath(name)
  if (!existsSync(path)) return []
  const rows: Array<T> = []
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line) as T)
    } catch {
      // Keep append-only stores readable if one line is corrupt.
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

export function createProject(input: CreateProjectInput): ProjectRecord {
  const now = new Date().toISOString()
  return appendRecord('projects', {
    id: `project_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    title: requireString(input.title, 'title'),
    objective: cleanString(input.objective) || '',
    status: assertOneOf(input.status, PROJECT_STATUSES, 'status', 'brouillon'),
    environment: assertOneOf(input.environment, PROJECT_ENVIRONMENTS, 'environment', 'sandbox'),
    tags: normalizeTags(input.tags),
    owner: cleanString(input.owner) || 'Xavier',
    nextAction: cleanString(input.nextAction),
    createdAt: now,
    updatedAt: now,
  } satisfies ProjectRecord)
}

export function updateProject(id: string, updates: UpdateProjectInput): ProjectRecord | null {
  const current = getProject(id)
  if (!current) return null
  const next: ProjectRecord = {
    ...current,
    ...updates,
    id: current.id,
    title: requireString(updates.title ?? current.title, 'title'),
    objective: cleanString(updates.objective ?? current.objective) || '',
    status: assertOneOf(updates.status ?? current.status, PROJECT_STATUSES, 'status'),
    environment: assertOneOf(
      updates.environment ?? current.environment,
      PROJECT_ENVIRONMENTS,
      'environment',
    ),
    tags: normalizeTags(updates.tags ?? current.tags),
    owner: cleanString(updates.owner ?? current.owner),
    nextAction: cleanString(updates.nextAction ?? current.nextAction),
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  }
  return appendRecord('projects', next)
}

export function getProject(id: string): ProjectRecord | null {
  return latestById(readRegistry<ProjectRecord>('projects')).get(id) ?? null
}

export function listProjects(filters: ProjectFilters = {}): Array<ProjectBundle> {
  let projects = Array.from(latestById(readRegistry<ProjectRecord>('projects')).values())
  if (!filters.includeArchived) {
    projects = projects.filter(
      (project) => project.status !== 'archive' && project.environment !== 'archived',
    )
  }
  if (filters.status) projects = projects.filter((project) => project.status === filters.status)
  if (filters.environment) {
    projects = projects.filter((project) => project.environment === filters.environment)
  }
  const q = filters.q?.trim().toLowerCase()
  if (q) {
    projects = projects.filter((project) => [
      project.title,
      project.objective,
      project.owner,
      project.nextAction,
      ...project.tags,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)))
  }
  return projects
    .map((project) => getProjectBundle(project.id))
    .filter((project): project is ProjectBundle => Boolean(project))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title))
}

export function addProjectSource(input: CreateProjectSourceInput): ProjectSourceRecord {
  if (!getProject(input.projectId)) throw new Error('Project not found')
  const now = new Date().toISOString()
  return appendRecord('sources', {
    id: `source_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    projectId: input.projectId,
    type: assertOneOf(input.type, PROJECT_SOURCE_TYPES, 'type'),
    title: requireString(input.title, 'title'),
    link: cleanString(input.link),
    sourceId: cleanString(input.sourceId),
    confidence: assertOneOf(input.confidence, ['faible', 'moyen', 'fort'] as const, 'confidence', 'moyen'),
    status: assertOneOf(input.status, PROJECT_STATUSES, 'status', 'brouillon'),
    createdAt: now,
    updatedAt: now,
  } satisfies ProjectSourceRecord)
}

export function addProjectArtifact(input: CreateProjectArtifactInput): ProjectArtifactRecord {
  if (!getProject(input.projectId)) throw new Error('Project not found')
  const now = new Date().toISOString()
  return appendRecord('artifacts', {
    id: `artifact_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    projectId: input.projectId,
    type: assertOneOf(input.type, PROJECT_ARTIFACT_TYPES, 'type'),
    title: requireString(input.title, 'title'),
    pathOrUrl: cleanString(input.pathOrUrl),
    status: assertOneOf(input.status, PROJECT_STATUSES, 'status', 'brouillon'),
    version: cleanString(input.version),
    producedBy: cleanString(input.producedBy),
    sourceRefs: normalizeTags(input.sourceRefs),
    createdAt: now,
    updatedAt: now,
  } satisfies ProjectArtifactRecord)
}

export function addProjectDecision(input: CreateProjectDecisionInput): ProjectDecisionRecord {
  if (!getProject(input.projectId)) throw new Error('Project not found')
  const now = new Date().toISOString()
  return appendRecord('decisions', {
    id: `decision_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    projectId: input.projectId,
    topic: requireString(input.topic, 'topic'),
    decision: requireString(input.decision, 'decision'),
    rationale: cleanString(input.rationale),
    status: assertOneOf(input.status, PROJECT_STATUSES, 'status', 'a_valider'),
    sourceRefs: normalizeTags(input.sourceRefs),
    createdAt: now,
    updatedAt: now,
  } satisfies ProjectDecisionRecord)
}

export function getProjectBundle(id: string): ProjectBundle | null {
  const project = getProject(id)
  if (!project) return null
  const sources = readRegistry<ProjectSourceRecord>('sources')
    .filter((source) => source.projectId === id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const artifacts = readRegistry<ProjectArtifactRecord>('artifacts')
    .filter((artifact) => artifact.projectId === id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const decisions = readRegistry<ProjectDecisionRecord>('decisions')
    .filter((decision) => decision.projectId === id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { ...project, sources, artifacts, decisions }
}

export function buildProjectBrief(project: ProjectBundle): string {
  return [
    `Projet actif : ${project.title}`,
    '',
    `Objectif : ${project.objective || 'a cadrer'}`,
    `Statut : ${project.status}`,
    `Environnement : ${project.environment}`,
    `Prochaine action : ${project.nextAction || 'a definir'}`,
    '',
    'Sources liees :',
    project.sources.length
      ? project.sources.map((source) => `- ${source.title} (${source.type})${source.link ? ` — ${source.link}` : ''}`).join('\n')
      : '- aucune source rattachee',
    '',
    'Artefacts existants :',
    project.artifacts.length
      ? project.artifacts.map((artifact) => `- ${artifact.title} (${artifact.type}, ${artifact.status})${artifact.pathOrUrl ? ` — ${artifact.pathOrUrl}` : ''}`).join('\n')
      : '- aucun artefact rattache',
    '',
    'Decisions :',
    project.decisions.length
      ? project.decisions.map((decision) => `- ${decision.topic}: ${decision.decision} (${decision.status})`).join('\n')
      : '- aucune decision enregistree',
    '',
    'Instruction Hermes : reprends ce projet comme chef de projet IA. Cadre la demande, distingue faits/hypotheses/recommandations, propose les lots, les sources utiles, les artefacts a produire et la prochaine action. Reste en francais France et applique le filtre PMM solo.',
  ].join('\n')
}
