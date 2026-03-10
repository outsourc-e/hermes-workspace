import { useNavigate } from '@tanstack/react-router'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/hooks/use-page-title'
import { cn } from '@/lib/utils'
import { AgentsScreen } from '@/screens/agents/agents-screen'
import { CheckpointDetailScreen } from '@/screens/checkpoints/checkpoint-detail-screen'
import { MissionConsoleScreen } from '@/screens/missions/mission-console-screen'
import { NewProjectWizardContent } from '@/screens/projects/new-project-wizard'
import { ProjectsScreen } from '@/screens/projects/projects-screen'
import {
  extractProject,
} from '@/screens/projects/lib/workspace-types'
import { PlanReviewScreen } from '@/screens/plan-review/plan-review-screen'
import { ReviewQueueScreen } from '@/screens/review/review-queue-screen'
import { RunsConsoleScreen } from '@/screens/runs/runs-console-screen'
import { WorkspaceSkillsScreen } from '@/screens/skills/workspace-skills-screen'
import { TeamsScreen } from '@/screens/teams/teams-screen'

export type WorkspaceTab =
  | 'projects'
  | 'review'
  | 'runs'
  | 'agents'
  | 'skills'
  | 'teams'

export type WorkspaceSearch = {
  goal?: string
  checkpointId?: string
  planId?: string
  returnTo?: 'review' | 'projects' | 'mission'
  phaseId?: string
  phaseName?: string
  project?: string
  projectId?: string
  missionId?: string
  showWizard?: boolean
}

type WorkspaceLayoutProps = {
  search: WorkspaceSearch
}

type ProjectContext = {
  projectId: string | null
  projectName: string | null
}

const TAB_LABELS: Record<WorkspaceTab, string> = {
  projects: 'Projects',
  review: 'Review Queue',
  runs: 'Runs',
  agents: 'Agents',
  skills: 'Skills & Memory',
  teams: 'Teams & Roles',
}

const TAB_ORDER: WorkspaceTab[] = [
  'projects',
  'review',
  'runs',
  'agents',
  'skills',
  'teams',
]

function readPayload(text: string): unknown {
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function apiRequest(input: string): Promise<unknown> {
  const response = await fetch(input)
  const payload = readPayload(await response.text())
  if (response.ok) return payload

  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null

  throw new Error(
    (typeof record?.error === 'string' && record.error) ||
      (typeof record?.message === 'string' && record.message) ||
      `Request failed with status ${response.status}`,
  )
}

function parseWorkspaceHash(hash: string): WorkspaceTab {
  const normalized = hash.replace(/^#/, '').trim().toLowerCase()
  return TAB_ORDER.includes(normalized as WorkspaceTab)
    ? (normalized as WorkspaceTab)
    : 'projects'
}

function writeWorkspaceHash(nextTab: WorkspaceTab) {
  if (typeof window === 'undefined') return
  const nextUrl = new URL(window.location.href)
  nextUrl.hash = nextTab === 'projects' ? '' : nextTab
  const finalUrl = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
  window.history.pushState(window.history.state, '', finalUrl)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function WorkspaceLayout({ search }: WorkspaceLayoutProps) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() =>
    typeof window === 'undefined'
      ? 'projects'
      : parseWorkspaceHash(window.location.hash),
  )
  const [projectContext, setProjectContext] = useState<ProjectContext>({
    projectId: null,
    projectName: null,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    function syncHash() {
      setActiveTab(parseWorkspaceHash(window.location.hash))
    }

    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  const selectedProjectId = search.projectId ?? search.project ?? ''
  const activeProjectId = projectContext.projectId ?? selectedProjectId

  const projectDetailQuery = useQuery({
    queryKey: ['workspace', 'layout', 'project-detail', selectedProjectId],
    enabled: selectedProjectId.length > 0,
    queryFn: async () =>
      extractProject(
        await apiRequest(
          `/api/workspace/projects/${encodeURIComponent(selectedProjectId)}`,
        ),
      ),
  })

  const missionName = useMemo(() => {
    if (!search.missionId || !projectDetailQuery.data) return null
    for (const phase of projectDetailQuery.data.phases) {
      const mission = phase.missions.find((entry) => entry.id === search.missionId)
      if (mission) return mission.name
    }
    return null
  }, [projectDetailQuery.data, search.missionId])

  const projectName =
    projectContext.projectName ??
    projectDetailQuery.data?.name ??
    null

  const pageTitle =
    search.checkpointId
      ? 'Checkpoint Detail'
      : search.planId
        ? 'Plan Review'
      : search.showWizard
        ? 'New Project'
        : activeTab === 'projects' && search.missionId
      ? missionName ?? 'Mission Console'
      : TAB_LABELS[activeTab]

  usePageTitle(pageTitle)

  function restoreTab(returnTo?: WorkspaceSearch['returnTo']) {
    const nextTab: WorkspaceTab = returnTo === 'review' ? 'review' : 'projects'
    setActiveTab(nextTab)
    writeWorkspaceHash(nextTab)
  }

  function clearWorkspaceOverlay(options?: {
    checkpointId?: undefined
    returnTo?: undefined
    showWizard?: undefined
  }) {
    void navigate({
      to: '/workspace',
      search: {
        goal: search.goal,
        phaseId: search.phaseId,
        phaseName: search.phaseName,
        project: search.project,
        projectId: search.projectId,
        missionId: search.missionId,
        checkpointId: options?.checkpointId,
        returnTo: options?.returnTo,
        showWizard: options?.showWizard,
      },
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-primary-950 text-primary-100">
      <div className="sticky top-0 z-20 border-b border-primary-800 bg-primary-950/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2 overflow-x-auto">
            {TAB_ORDER.map((tab) => {
              const active = tab === activeTab
              return (
                <Button
                  key={tab}
                  variant={active ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setActiveTab(tab)
                    void navigate({
                      to: '/workspace',
                      search: {
                        goal: search.goal,
                        project: search.project,
                        projectId: search.projectId,
                      },
                      hash: tab === 'projects' ? '' : tab,
                    })
                  }}
                  className={cn(
                    'rounded-full border text-sm',
                    active
                      ? 'border-accent-500/40 bg-accent-500/10 text-accent-300 hover:bg-accent-500/15'
                      : 'border-primary-800 text-primary-300 hover:bg-primary-800 hover:text-primary-100',
                  )}
                >
                  {TAB_LABELS[tab]}
                </Button>
              )
            })}
          </div>
          {activeTab === 'projects' && (projectName || search.missionId) ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-primary-400">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('projects')
                  writeWorkspaceHash('projects')
                }}
                className="transition-colors hover:text-primary-100"
              >
                Projects
              </button>
              {projectName ? (
                <>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={12}
                    strokeWidth={1.8}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('projects')
                      writeWorkspaceHash('projects')
                    }}
                    className="transition-colors hover:text-primary-100"
                  >
                    {projectName}
                  </button>
                </>
              ) : null}
              {search.missionId ? (
                <>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={12}
                    strokeWidth={1.8}
                  />
                  <span className="font-medium text-primary-100">
                    {missionName ?? 'Mission Console'}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto bg-gray-50">
        {search.checkpointId ? (
          <CheckpointDetailScreen
            checkpointId={search.checkpointId}
            projectId={search.projectId}
            returnTo={search.returnTo ?? (search.missionId ? 'mission' : 'projects')}
            onBack={() => {
              restoreTab(search.returnTo ?? (search.missionId ? 'mission' : 'projects'))
              clearWorkspaceOverlay()
            }}
          />
        ) : search.planId ? (
          <PlanReviewScreen missionId={search.planId} projectId={search.projectId} plan="" />
        ) : search.showWizard ? (
          <NewProjectWizardContent
            routePath="/workspace"
            onClose={() => {
              restoreTab('projects')
              clearWorkspaceOverlay()
            }}
          />
        ) : activeTab === 'projects' ? (
          search.missionId ? (
            <MissionConsoleScreen
              missionId={search.missionId}
              projectId={activeProjectId}
            />
          ) : (
            <ProjectsScreen
              replanSearch={search}
              routePath="/workspace"
              onProjectContextChange={setProjectContext}
            />
          )
        ) : null}
        {activeTab === 'review' ? <ReviewQueueScreen /> : null}
        {activeTab === 'runs' ? <RunsConsoleScreen /> : null}
        {activeTab === 'agents' ? <AgentsScreen /> : null}
        {activeTab === 'skills' ? <WorkspaceSkillsScreen /> : null}
        {activeTab === 'teams' ? <TeamsScreen /> : null}
      </main>
    </div>
  )
}
