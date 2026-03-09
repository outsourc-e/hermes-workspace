import { useEffect, useState } from 'react'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Folder01Icon,
  PlayCircleIcon,
  PuzzleIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { listWorkspaceAgents } from '@/lib/workspace-agents'
import { listWorkspaceCheckpoints } from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import { extractProjects } from '@/screens/projects/lib/workspace-types'
import {
  buildProjectOverview,
  getProjectProgress,
} from '@/screens/projects/lib/workspace-utils'
import { extractTaskRuns } from '@/screens/runs/lib/runs-types'

const PROJECT_EMOJIS = ['📂', '🚀', '🛠️', '🧪', '📦', '🎯', '🧭', '⚙️'] as const
const COLLAPSE_STORAGE_KEY = 'workspace-layout-collapsed'

async function workspaceRequest(input: string): Promise<unknown> {
  const response = await fetch(input)
  const text = await response.text()
  const payload = text ? (JSON.parse(text) as unknown) : null

  if (!response.ok) {
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

  return payload
}

type WorkspaceRailItem = {
  to: string
  icon: typeof Folder01Icon
  label: string
  active: boolean
  count?: number
}

function CountBadge({ count, collapsed }: { count?: number; collapsed: boolean }) {
  if (count === undefined || collapsed) return null
  return (
    <span className="ml-auto rounded-full bg-primary-800 px-1.5 py-0.5 text-[10px] text-primary-400">
      {count}
    </span>
  )
}

export function WorkspaceLayout() {
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true')
  }, [])

  function handleToggleCollapse() {
    setCollapsed((current) => {
      const next = !current
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next))
      }
      return next
    })
  }

  const projectsQuery = useQuery({
    queryKey: ['workspace', 'layout', 'projects'],
    queryFn: async () => extractProjects(await workspaceRequest('/api/workspace/projects')),
    staleTime: 15_000,
  })

  const checkpointsQuery = useQuery({
    queryKey: ['workspace', 'layout', 'checkpoints'],
    queryFn: async () => listWorkspaceCheckpoints(),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  const runsQuery = useQuery({
    queryKey: ['workspace', 'layout', 'task-runs'],
    queryFn: async () => extractTaskRuns(await workspaceRequest('/api/workspace/task-runs')),
    staleTime: 10_000,
    refetchInterval: 10_000,
  })

  const agentsQuery = useQuery({
    queryKey: ['workspace', 'layout', 'agents'],
    queryFn: listWorkspaceAgents,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const projects = projectsQuery.data ?? []
  const checkpoints = checkpointsQuery.data ?? []
  const agents = agentsQuery.data ?? []
  const runningCount = (runsQuery.data ?? []).filter((run) =>
    ['running', 'active'].includes(run.status),
  ).length
  const pendingReviewCount = checkpoints.filter(
    (checkpoint) => checkpoint.status === 'pending',
  ).length

  const navItems: WorkspaceRailItem[] = [
    {
      to: '/workspace/projects',
      icon: Folder01Icon,
      label: 'Projects',
      active:
        pathname.startsWith('/workspace/projects') ||
        pathname.startsWith('/workspace/plan-review'),
      count: projects.length,
    },
    {
      to: '/workspace/review',
      icon: CheckmarkCircle02Icon,
      label: 'Review Queue',
      active: pathname.startsWith('/workspace/review'),
      count: pendingReviewCount,
    },
    {
      to: '/workspace/runs',
      icon: PlayCircleIcon,
      label: 'Runs',
      active: pathname.startsWith('/workspace/runs'),
      count: runningCount,
    },
    {
      to: '/workspace/agents',
      icon: UserGroupIcon,
      label: 'Agents',
      active: pathname.startsWith('/workspace/agents'),
      count: agents.length,
    },
    {
      to: '/workspace/skills',
      icon: PuzzleIcon,
      label: 'Skills & Memory',
      active: pathname.startsWith('/workspace/skills'),
    },
  ]

  const projectItems = projects.slice(0, 8).map((project, index) => ({
    project,
    emoji: PROJECT_EMOJIS[index % PROJECT_EMOJIS.length] ?? '📂',
    progress: getProjectProgress(project),
  }))

  return (
    <div className="flex h-full min-h-0 flex-col bg-primary-950 lg:flex-row">
      <aside
        className={cn(
          'flex shrink-0 flex-col border-b border-primary-800 bg-primary-950 transition-[width] duration-200 lg:border-b-0 lg:border-r',
          collapsed ? 'lg:w-12' : 'lg:w-[200px]',
        )}
      >
        <div className="border-b border-primary-800 px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent-500/10 text-accent-400">
              <HugeiconsIcon icon={Folder01Icon} size={18} strokeWidth={1.7} />
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary-100">Workspace</p>
                <p className="text-xs text-primary-400">Execution shell</p>
              </div>
            ) : null}
          </div>
        </div>

        <nav className="space-y-1 px-2 py-3">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                collapsed ? 'justify-center px-0' : 'text-primary-300',
                item.active
                  ? 'bg-accent-500/10 text-accent-500'
                  : 'text-primary-300 hover:bg-primary-800 hover:text-primary-100',
              )}
            >
              <HugeiconsIcon icon={item.icon} size={18} strokeWidth={1.7} />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
              <CountBadge count={item.count} collapsed={collapsed} />
            </Link>
          ))}
        </nav>

        {!collapsed ? (
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-primary-800 px-2 py-3">
            <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[1.2px] text-primary-600">
              Projects
            </p>
            <div className="space-y-1">
              {projectItems.map(({ project, emoji, progress }) => {
                const overview = buildProjectOverview(project, null, checkpoints, [])
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: '/workspace/projects',
                        search: { project: project.id },
                      })
                    }
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-primary-300 transition-colors hover:bg-primary-800 hover:text-primary-100"
                  >
                    <span aria-hidden="true" className="text-base leading-none">
                      {emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-primary-200">{project.name}</p>
                      <p className="truncate text-[11px] text-primary-500">
                        {overview.phaseLabel}
                      </p>
                    </div>
                    <span className="rounded-full bg-primary-800 px-2 py-0.5 text-[10px] text-primary-300">
                      {progress}%
                    </span>
                  </button>
                )
              })}
              {!projectsQuery.isLoading && projectItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-primary-800 px-3 py-4 text-xs text-primary-500">
                  No projects yet.
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <div className="border-t border-primary-800 p-2">
          <button
            type="button"
            onClick={handleToggleCollapse}
            className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-primary-400 transition-colors hover:bg-primary-800 hover:text-primary-100"
            aria-label={collapsed ? 'Expand workspace navigation' : 'Collapse workspace navigation'}
          >
            <HugeiconsIcon
              icon={collapsed ? ArrowRight01Icon : ArrowLeft01Icon}
              size={16}
              strokeWidth={1.8}
            />
          </button>
        </div>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="h-full min-h-0 overflow-y-auto p-4 sm:p-5 lg:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
