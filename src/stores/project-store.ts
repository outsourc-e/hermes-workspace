import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WorkspaceProject = {
  id: string
  name: string
  goal: string
  instructions: string
  color: string
  archived: boolean
  createdAt: number
  updatedAt: number
}

type ProjectState = {
  projects: Array<WorkspaceProject>
  sessionProjects: Record<string, string>
  pendingNewSessionProjectId: string | null
  createProject: (input: {
    name: string
    goal?: string
    instructions?: string
    color?: string
  }) => WorkspaceProject
  updateProject: (
    projectId: string,
    patch: Partial<Pick<WorkspaceProject, 'name' | 'goal' | 'instructions' | 'color'>>,
  ) => void
  archiveProject: (projectId: string) => void
  restoreProject: (projectId: string) => void
  assignSessionToProject: (sessionKey: string, projectId: string) => void
  unassignSession: (sessionKey: string) => void
  setPendingNewSessionProject: (projectId: string | null) => void
  clearPendingNewSessionProject: () => void
}

const DEFAULT_PROJECTS: Array<WorkspaceProject> = [
  {
    id: 'seo-aeo-business',
    name: 'SEO/AEO Business',
    goal: 'Launch and operate Ryan\'s SEO/AEO service business with clear CRM, outreach, approvals, and delivery workflows.',
    instructions:
      'Stay revenue-first. Keep Notion as operational CRM, Obsidian as reference, Zoho as raw email source. Surface risks and approval needs before client-facing action.',
    color: '#b98a44',
    archived: false,
    createdAt: 1781900000000,
    updatedAt: 1781900000000,
  },
  {
    id: 'hermes-workspace-build',
    name: 'Hermes Workspace Build',
    goal: 'Shape Hermes Workspace into Ryan\'s project-aware mission control interface.',
    instructions:
      'Prioritize calm executive UX, project folders, working verification, and safe reversible changes. Do not expose secrets.',
    color: '#60a5fa',
    archived: false,
    createdAt: 1781900000001,
    updatedAt: 1781900000001,
  },
  {
    id: 'personal-admin',
    name: 'Personal Admin',
    goal: 'Keep personal/admin decisions, bookkeeping setup, reminders, and operational follow-through in one place.',
    instructions:
      'Use numbered choices. Keep Apple Reminders/Notes conventions intact. Separate business records from personal reminders.',
    color: '#34d399',
    archived: false,
    createdAt: 1781900000002,
    updatedAt: 1781900000002,
  },
]

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `project-${Date.now().toString(36)}`
}

function uniqueProjectId(projects: Array<WorkspaceProject>, name: string): string {
  const base = slugify(name)
  const existing = new Set(projects.map((project) => project.id))
  if (!existing.has(base)) return base
  let index = 2
  while (existing.has(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

function cleanText(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: DEFAULT_PROJECTS,
      sessionProjects: {},
      pendingNewSessionProjectId: null,
      createProject: (input) => {
        const name = cleanText(input.name) || 'Untitled Project'
        const now = Date.now()
        const project: WorkspaceProject = {
          id: uniqueProjectId(get().projects, name),
          name,
          goal: cleanText(input.goal),
          instructions: cleanText(input.instructions),
          color: cleanText(input.color) || '#b98a44',
          archived: false,
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({ projects: [...state.projects, project] }))
        return project
      },
      updateProject: (projectId, patch) => {
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  ...patch,
                  name: cleanText(patch.name) || project.name,
                  goal:
                    patch.goal === undefined ? project.goal : cleanText(patch.goal),
                  instructions:
                    patch.instructions === undefined
                      ? project.instructions
                      : cleanText(patch.instructions),
                  color: cleanText(patch.color) || project.color,
                  updatedAt: Date.now(),
                }
              : project,
          ),
        }))
      },
      archiveProject: (projectId) => {
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? { ...project, archived: true, updatedAt: Date.now() }
              : project,
          ),
          sessionProjects: Object.fromEntries(
            Object.entries(state.sessionProjects).filter(
              ([, mappedProjectId]) => mappedProjectId !== projectId,
            ),
          ),
          pendingNewSessionProjectId:
            state.pendingNewSessionProjectId === projectId
              ? null
              : state.pendingNewSessionProjectId,
        }))
      },
      restoreProject: (projectId) => {
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? { ...project, archived: false, updatedAt: Date.now() }
              : project,
          ),
        }))
      },
      assignSessionToProject: (sessionKey, projectId) => {
        const normalizedSessionKey = cleanText(sessionKey)
        const normalizedProjectId = cleanText(projectId)
        if (!normalizedSessionKey || !normalizedProjectId) return
        set((state) => ({
          sessionProjects: {
            ...state.sessionProjects,
            [normalizedSessionKey]: normalizedProjectId,
          },
        }))
      },
      unassignSession: (sessionKey) => {
        const normalizedSessionKey = cleanText(sessionKey)
        if (!normalizedSessionKey) return
        set((state) => {
          const next = { ...state.sessionProjects }
          delete next[normalizedSessionKey]
          return { sessionProjects: next }
        })
      },
      setPendingNewSessionProject: (projectId) => {
        const normalized = cleanText(projectId ?? undefined)
        set({ pendingNewSessionProjectId: normalized || null })
      },
      clearPendingNewSessionProject: () =>
        set({ pendingNewSessionProjectId: null }),
    }),
    {
      name: 'hermes-workspace-projects-v1',
      version: 1,
      partialize: (state) => ({
        projects: state.projects,
        sessionProjects: state.sessionProjects,
      }),
    },
  ),
)

export function getProjectForSession(
  sessionProjects: Record<string, string>,
  sessionKey: string,
  friendlyId: string,
): string | null {
  return sessionProjects[friendlyId] || sessionProjects[sessionKey] || null
}
