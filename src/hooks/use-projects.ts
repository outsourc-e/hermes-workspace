'use client'

import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

type CreateProjectInput = {
  name: string
  goal?: string
  instructions?: string
  color?: string
  icon?: string
}

type UpdateProjectInput = Partial<
  Pick<WorkspaceProject, 'name' | 'goal' | 'instructions' | 'color' | 'icon'>
>

type ProjectsSnapshot = {
  projects: Array<WorkspaceProject>
  sessionProjectMap: Record<string, string>
  activeProjectId: string | null
}

type ProjectsState = ProjectsSnapshot & {
  createProject: (input: CreateProjectInput) => WorkspaceProject
  updateProject: (projectId: string, input: UpdateProjectInput) => void
  archiveProject: (projectId: string) => void
  assignSessionToProject: (sessionKey: string, projectId: string) => void
  unassignSession: (sessionKey: string) => void
  setActiveProject: (projectId: string | null) => void
  hydrateFromServer: (snapshot: ProjectsSnapshot) => void
  getProjectForSession: (sessionKey: string) => WorkspaceProject | null
}

const DEFAULT_PROJECT_COLORS = [
  '#8b5cf6',
  '#06b6d4',
  '#22c55e',
  '#f97316',
  '#ec4899',
  '#facc15',
]

export function slugifyProjectName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'project'
}

export function createProjectId(
  name: string,
  existingIds: Array<string>,
): string {
  const base = slugifyProjectName(name)
  const used = new Set(existingIds)
  if (!used.has(base)) return base
  let index = 2
  while (used.has(`${base}-${index}`)) {
    index += 1
  }
  return `${base}-${index}`
}

export function getSessionProjectId(
  sessionProjectMap: Record<string, string>,
  sessionKey: string,
): string | null {
  const key = sessionKey.trim()
  if (!key) return null
  return sessionProjectMap[key] || null
}

export function getActiveProjects(
  projects: Array<WorkspaceProject>,
): Array<WorkspaceProject> {
  return projects
    .filter((project) => !project.archivedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function nowMs(): number {
  return Date.now()
}

function defaultColor(index: number): string {
  return DEFAULT_PROJECT_COLORS[index % DEFAULT_PROJECT_COLORS.length]
}

function snapshotProjects(state: ProjectsSnapshot): ProjectsSnapshot {
  return {
    projects: state.projects,
    sessionProjectMap: state.sessionProjectMap,
    activeProjectId: state.activeProjectId,
  }
}

function hasProjectData(snapshot: ProjectsSnapshot): boolean {
  return (
    snapshot.projects.length > 0 || Object.keys(snapshot.sessionProjectMap).length > 0
  )
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeProject(value: unknown): WorkspaceProject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const id = cleanString(raw.id)
  const name = cleanString(raw.name)
  if (!id || !name) return null
  const project: WorkspaceProject = {
    id,
    name,
    goal: cleanString(raw.goal),
    instructions: cleanString(raw.instructions),
    color: cleanString(raw.color) || defaultColor(0),
    icon: cleanString(raw.icon) || 'folder',
    createdAt: cleanNumber(raw.createdAt, nowMs()),
    updatedAt: cleanNumber(raw.updatedAt, nowMs()),
  }
  const archivedAt = cleanNumber(raw.archivedAt, 0)
  if (archivedAt > 0) project.archivedAt = archivedAt
  return project
}

function normalizeSnapshot(value: unknown): ProjectsSnapshot {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
  const projects = Array.isArray(raw.projects)
    ? raw.projects.map(normalizeProject).filter((project): project is WorkspaceProject => Boolean(project))
    : []
  const projectIds = new Set(projects.map((project) => project.id))
  const sessionProjectMap: Record<string, string> = {}
  const rawMap = raw.sessionProjectMap ?? raw.sessionProjects
  if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
    for (const [sessionKey, projectId] of Object.entries(rawMap as Record<string, unknown>)) {
      const key = cleanString(sessionKey)
      const value = cleanString(projectId)
      if (key && value && projectIds.has(value)) sessionProjectMap[key] = value
    }
  }
  const activeProjectId = cleanString(raw.activeProjectId)
  return {
    projects,
    sessionProjectMap,
    activeProjectId: activeProjectId && projectIds.has(activeProjectId) ? activeProjectId : null,
  }
}

async function saveProjectsToServer(snapshot: ProjectsSnapshot): Promise<void> {
  if (typeof window === 'undefined') return
  await fetch('/api/projects', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(snapshot),
  })
}

let syncTimer: ReturnType<typeof setTimeout> | null = null
function queueServerSync(snapshot: ProjectsSnapshot): void {
  if (typeof window === 'undefined') return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void saveProjectsToServer(snapshot)
  }, 250)
}

let serverHydrationPromise: Promise<void> | null = null
let serverHydrationRetryTimer: ReturnType<typeof setTimeout> | null = null

function scheduleServerHydrationRetry(): void {
  if (typeof window === 'undefined' || serverHydrationRetryTimer) return
  serverHydrationRetryTimer = setTimeout(() => {
    serverHydrationRetryTimer = null
    void loadServerProjectsOnce()
  }, 1_500)
}

function loadServerProjectsOnce(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (serverHydrationPromise) return serverHydrationPromise

  serverHydrationPromise = (async () => {
    const localSnapshot = snapshotProjects(useProjectsStore.getState())
    try {
      const response = await fetch('/api/projects', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!response.ok) {
        // The app shell can mount before the password session is established.
        // Do not permanently cache that 401/403, or first-run migration from
        // browser localStorage to the server will never happen after login.
        serverHydrationPromise = null
        scheduleServerHydrationRetry()
        return
      }
      const payload = (await response.json()) as Record<string, unknown>
      const serverSnapshot = normalizeSnapshot(payload)
      const initialized = payload.initialized === true

      if (initialized || hasProjectData(serverSnapshot)) {
        useProjectsStore.getState().hydrateFromServer(serverSnapshot)
        return
      }

      // First-run migration: if this browser already has local projects from
      // the browser-storage v1 implementation, promote them to the server so
      // every Mac/browser can see the same list going forward.
      if (hasProjectData(localSnapshot)) {
        await saveProjectsToServer(localSnapshot)
      }
    } catch {
      // Keep local projects available if the server endpoint is unavailable,
      // but do not cache the failure forever.
      serverHydrationPromise = null
      scheduleServerHydrationRetry()
    }
  })()

  return serverHydrationPromise
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects: [],
      sessionProjectMap: {},
      activeProjectId: null,
      createProject: (input) => {
        const timestamp = nowMs()
        const name = input.name.trim()
        const project: WorkspaceProject = {
          id: createProjectId(
            name,
            get().projects.map((existing) => existing.id),
          ),
          name,
          goal: input.goal?.trim() ?? '',
          instructions: input.instructions?.trim() ?? '',
          color:
            input.color?.trim() || defaultColor(getActiveProjects(get().projects).length),
          icon: input.icon?.trim() || 'folder',
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        set((state) => ({
          projects: [project, ...state.projects],
          activeProjectId: project.id,
        }))
        queueServerSync(snapshotProjects(get()))
        return project
      },
      updateProject: (projectId, input) => {
        const timestamp = nowMs()
        set((state) => ({
          projects: state.projects.map((project) => {
            if (project.id !== projectId) return project
            return {
              ...project,
              ...Object.fromEntries(
                Object.entries(input).map(([key, value]) => [
                  key,
                  typeof value === 'string' ? value.trim() : value,
                ]),
              ),
              updatedAt: timestamp,
            }
          }),
        }))
        queueServerSync(snapshotProjects(get()))
      },
      archiveProject: (projectId) => {
        const timestamp = nowMs()
        set((state) => {
          const sessionProjectMap = Object.fromEntries(
            Object.entries(state.sessionProjectMap).filter(
              ([, mappedProjectId]) => mappedProjectId !== projectId,
            ),
          )
          return {
            projects: state.projects.map((project) =>
              project.id === projectId
                ? { ...project, archivedAt: timestamp, updatedAt: timestamp }
                : project,
            ),
            sessionProjectMap,
            activeProjectId:
              state.activeProjectId === projectId ? null : state.activeProjectId,
          }
        })
        queueServerSync(snapshotProjects(get()))
      },
      assignSessionToProject: (sessionKey, projectId) => {
        const key = sessionKey.trim()
        if (!key || !projectId) return
        const timestamp = nowMs()
        set((state) => ({
          sessionProjectMap: {
            ...state.sessionProjectMap,
            [key]: projectId,
          },
          projects: state.projects.map((project) =>
            project.id === projectId
              ? { ...project, updatedAt: timestamp }
              : project,
          ),
          activeProjectId: projectId,
        }))
        queueServerSync(snapshotProjects(get()))
      },
      unassignSession: (sessionKey) => {
        const key = sessionKey.trim()
        if (!key) return
        set((state) => {
          const { [key]: _removed, ...rest } = state.sessionProjectMap
          void _removed
          return { sessionProjectMap: rest }
        })
        queueServerSync(snapshotProjects(get()))
      },
      setActiveProject: (projectId) => {
        set({ activeProjectId: projectId })
        queueServerSync(snapshotProjects(get()))
      },
      hydrateFromServer: (snapshot) => {
        set(snapshotProjects(normalizeSnapshot(snapshot)))
      },
      getProjectForSession: (sessionKey) => {
        const projectId = getSessionProjectId(get().sessionProjectMap, sessionKey)
        if (!projectId) return null
        return (
          get().projects.find(
            (project) => project.id === projectId && !project.archivedAt,
          ) ?? null
        )
      },
    }),
    {
      name: 'hermes-workspace-projects-v1',
      version: 1,
      partialize: (state) => ({
        projects: state.projects,
        sessionProjectMap: state.sessionProjectMap,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
)

export function useProjects() {
  useEffect(() => {
    void loadServerProjectsOnce()
  }, [])

  const projects = useProjectsStore((state) => state.projects)
  const sessionProjectMap = useProjectsStore((state) => state.sessionProjectMap)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const createProject = useProjectsStore((state) => state.createProject)
  const updateProject = useProjectsStore((state) => state.updateProject)
  const archiveProject = useProjectsStore((state) => state.archiveProject)
  const assignSessionToProject = useProjectsStore(
    (state) => state.assignSessionToProject,
  )
  const unassignSession = useProjectsStore((state) => state.unassignSession)
  const setActiveProject = useProjectsStore((state) => state.setActiveProject)

  return {
    projects,
    activeProjects: getActiveProjects(projects),
    sessionProjectMap,
    activeProjectId,
    createProject,
    updateProject,
    archiveProject,
    assignSessionToProject,
    unassignSession,
    setActiveProject,
  }
}
