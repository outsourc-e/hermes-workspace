import { useNavigate } from '@tanstack/react-router'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePageTitle } from '@/hooks/use-page-title'
import { useWorkspaceSse } from '@/hooks/use-workspace-sse'
import { cn } from '@/lib/utils'
import { AgentsScreen } from '@/screens/agents/agents-screen'
import { CheckpointDetailScreen } from '@/screens/checkpoints/checkpoint-detail-screen'
import { MissionConsoleScreen } from '@/screens/missions/mission-console-screen'
import { NewProjectWizardContent } from '@/screens/projects/new-project-wizard'
import { ProjectsScreen } from '@/screens/projects/projects-screen'
import {
  extractProject,
  normalizeStats,
  type WorkspaceStats,
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

type WorkspaceConfig = {
  autoApprove: boolean
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

const PRIMARY_TABS: WorkspaceTab[] = [
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

async function apiRequest(
  input: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(input, init)
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

function navigateToTab(
  navigate: ReturnType<typeof useNavigate>,
  search: WorkspaceSearch,
  tab: WorkspaceTab,
) {
  void navigate({
    to: '/workspace',
    search: {
      goal: search.goal,
      project: search.project,
      projectId: search.projectId,
    },
    hash: tab === 'projects' ? '' : tab,
  })
}

export function WorkspaceLayout({ search }: WorkspaceLayoutProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { connected } = useWorkspaceSse()
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() =>
    typeof window === 'undefined'
      ? 'projects'
      : parseWorkspaceHash(window.location.hash),
  )
  const [projectContext, setProjectContext] = useState<ProjectContext>({
    projectId: null,
    projectName: null,
  })
  const [showOfflineBanner, setShowOfflineBanner] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    function syncHash() {
      setActiveTab(parseWorkspaceHash(window.location.hash))
    }

    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  useEffect(() => {
    if (connected) {
      setShowOfflineBanner(false)
      return
    }

    const timer = window.setTimeout(() => {
      setShowOfflineBanner(true)
    }, 5_000)

    return () => window.clearTimeout(timer)
  }, [connected])

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

  const workspaceConfigQuery = useQuery({
    queryKey: ['workspace', 'config'],
    queryFn: async () =>
      (await apiRequest('/api/workspace/config')) as WorkspaceConfig,
  })

  const statsQuery = useQuery({
    queryKey: ['workspace', 'stats'],
    queryFn: async () =>
      normalizeStats(await apiRequest('/api/workspace/stats')) as WorkspaceStats,
  })

  const autoApproveMutation = useMutation({
    mutationFn: async (enabled: boolean) =>
      (await apiRequest('/api/workspace/config', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ auto_approve: enabled }),
      })) as WorkspaceConfig,
    onSuccess: (data) => {
      queryClient.setQueryData(['workspace', 'config'], data)
    },
  })

  const restartDaemonMutation = useMutation({
    mutationFn: async () =>
      apiRequest('/api/workspace/daemon/restart', {
        method: 'POST',
      }),
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
  const autoApproveEnabled =
    autoApproveMutation.data?.autoApprove ??
    workspaceConfigQuery.data?.autoApprove ??
    false
  const pendingReviewCount = statsQuery.data?.checkpointsPending ?? 0
  const runningCount = statsQuery.data?.running ?? 0
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
    <div className="flex h-full flex-col overflow-hidden bg-white text-primary-900">
      <div className="sticky top-0 z-20 border-b border-primary-200 bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1 [&::-webkit-scrollbar]:hidden">
              {PRIMARY_TABS.map((tab) => {
                const active = tab === activeTab
                const label = TAB_LABELS[tab]
                const badgeCount =
                  tab === 'review'
                    ? pendingReviewCount
                    : tab === 'runs'
                      ? runningCount
                      : 0
                const badgeClass =
                  tab === 'review'
                    ? 'bg-orange-500 text-white'
                    : 'bg-blue-500 text-white'
                return (
                  <Button
                    key={tab}
                    variant={active ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      setActiveTab(tab)
                      navigateToTab(navigate, search, tab)
                    }}
                    className={cn(
                      'rounded-full border text-xs sm:text-sm px-2.5 sm:px-3',
                      active
                        ? 'border-accent-500/40 bg-accent-500/10 text-accent-600 hover:bg-accent-500/15'
                        : 'border-transparent text-primary-500 hover:bg-primary-100 hover:text-primary-900',
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span>{label}</span>
                      {badgeCount > 0 ? (
                        <span
                          className={cn(
                            'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                            badgeClass,
                          )}
                        >
                          {badgeCount}
                        </span>
                      ) : null}
                    </span>
                  </Button>
                )
              })}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <TooltipProvider>
                <TooltipRoot>
                  <TooltipTrigger
                    render={
                      <div
                        className={cn(
                          'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
                          autoApproveEnabled
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                            : 'border-primary-200 bg-primary-50 text-primary-600',
                        )}
                      />
                    }
                  >
                    <span>Hands-free</span>
                    <Switch
                      checked={autoApproveEnabled}
                      disabled={
                        workspaceConfigQuery.isPending ||
                        autoApproveMutation.isPending
                      }
                      aria-label="Toggle hands-free mode"
                      onCheckedChange={(checked) => {
                        void autoApproveMutation.mutate(Boolean(checked))
                      }}
                      className={cn(
                        autoApproveEnabled
                          ? 'data-checked:bg-emerald-600'
                          : undefined,
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Hands-free mode auto-approves and merges completed tasks.
                  </TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
              <div
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
                  connected
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-700',
                )}
              >
                <span
                  className={cn(
                    'size-2 rounded-full',
                    connected ? 'bg-emerald-500' : 'bg-amber-500',
                  )}
                />
                {connected ? 'Live' : 'Connecting...'}
              </div>
            </div>
          </div>
          {showOfflineBanner ? (
            <div className="relative z-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span>
                  Workspace daemon is offline. Start it with:{' '}
                  <code className="rounded bg-amber-100 px-1 font-mono">
                    npm run daemon
                  </code>
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restartDaemonMutation.isPending}
                    onClick={() => {
                      void restartDaemonMutation.mutateAsync()
                    }}
                    className="border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200"
                  >
                    {restartDaemonMutation.isPending
                      ? 'Restarting...'
                      : 'Restart Daemon'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setShowOfflineBanner(false)}
                    className="shrink-0 text-amber-600 transition-colors hover:text-amber-900"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {activeTab === 'projects' && (projectName || search.missionId) ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-primary-500">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('projects')
                  writeWorkspaceHash('projects')
                }}
                className="transition-colors hover:text-primary-900"
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
                    className="transition-colors hover:text-primary-900"
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
                  <span className="font-medium text-primary-900">
                    {missionName ?? 'Mission Console'}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <main className="flex-1 overflow-y-auto bg-white pb-[calc(var(--tabbar-h,80px)+1rem)]">
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
