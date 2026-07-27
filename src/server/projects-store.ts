import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getStateDir } from './workspace-state-dir'
import { scheduleProjectsObsidianExport } from './projects-obsidian-export'

export type WorkspaceProject = {
  id: string
  name: string
  goal: string
  instructions: string
  color: string
  icon: string
  createdAt: number
  updatedAt: number
  archivedAt?: number
}

export type WorkspaceProjectsState = {
  projects: WorkspaceProject[]
  sessionProjectMap: Record<string, string>
  activeProjectId: string | null
}

export type WorkspaceProjectsReadResult = WorkspaceProjectsState & {
  initialized: boolean
}

const EMPTY_PROJECTS_STATE: WorkspaceProjectsState = {
  projects: [],
  sessionProjectMap: {},
  activeProjectId: null,
}

function projectsStatePath(): string {
  return join(getStateDir(), 'projects.json')
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function cleanProject(value: unknown): WorkspaceProject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const id = cleanString(raw.id)
  const name = cleanString(raw.name)
  if (!id || !name) return null
  const now = Date.now()
  const project: WorkspaceProject = {
    id,
    name,
    goal: cleanString(raw.goal),
    instructions: cleanString(raw.instructions),
    color: cleanString(raw.color) || '#8b5cf6',
    icon: cleanString(raw.icon) || 'folder',
    createdAt: cleanTimestamp(raw.createdAt, now),
    updatedAt: cleanTimestamp(raw.updatedAt, now),
  }
  const archivedAt = cleanTimestamp(raw.archivedAt, 0)
  if (archivedAt > 0) project.archivedAt = archivedAt
  return project
}

export function normalizeProjectsState(value: unknown): WorkspaceProjectsState {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
  const projects = Array.isArray(raw.projects)
    ? raw.projects.map(cleanProject).filter((project): project is WorkspaceProject => Boolean(project))
    : []
  const projectIds = new Set(projects.map((project) => project.id))
  const sessionProjectMap: Record<string, string> = {}
  const rawMap = raw.sessionProjectMap ?? raw.sessionProjects
  if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
    for (const [key, projectId] of Object.entries(rawMap as Record<string, unknown>)) {
      const sessionKey = cleanString(key)
      const mappedProjectId = cleanString(projectId)
      if (sessionKey && mappedProjectId && projectIds.has(mappedProjectId)) {
        sessionProjectMap[sessionKey] = mappedProjectId
      }
    }
  }
  const activeProjectId = cleanString(raw.activeProjectId)
  return {
    projects,
    sessionProjectMap,
    activeProjectId: activeProjectId && projectIds.has(activeProjectId) ? activeProjectId : null,
  }
}

export async function readProjectsState(): Promise<WorkspaceProjectsReadResult> {
  const filePath = projectsStatePath()
  try {
    const raw = await readFile(filePath, 'utf-8')
    return {
      ...normalizeProjectsState(JSON.parse(raw)),
      initialized: true,
    }
  } catch {
    return {
      ...EMPTY_PROJECTS_STATE,
      initialized: existsSync(filePath),
    }
  }
}

export async function writeProjectsState(input: unknown): Promise<WorkspaceProjectsState> {
  const next = normalizeProjectsState(input)
  const stateDir = getStateDir()
  const filePath = projectsStatePath()
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await mkdir(stateDir, { recursive: true })
  await writeFile(tmpPath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8')
  await rename(tmpPath, filePath)
  scheduleProjectsObsidianExport(next)
  return next
}
