'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  Building01Icon,
  Delete01Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  Pen01Icon,
} from '@hugeicons/core-free-icons'
import { Link } from '@tanstack/react-router'
import { memo, useMemo, useState } from 'react'
import { SessionItem } from './session-item'
import type { SessionMeta } from '../../types'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu'
import { usePinnedSessions } from '@/hooks/use-pinned-sessions'
import {
  useProjects,
  type WorkspaceProject,
} from '@/hooks/use-projects'
import { cn } from '@/lib/utils'

type SidebarProjectsProps = {
  sessions: Array<SessionMeta>
  activeFriendlyId: string
  defaultOpen?: boolean
  onSelect?: () => void
  onRename: (session: SessionMeta) => void
  onDelete: (session: SessionMeta) => void
}

type ProjectFormState = {
  name: string
  goal: string
  instructions: string
}

const EMPTY_FORM: ProjectFormState = {
  name: '',
  goal: '',
  instructions: '',
}

function getSessionMapKeys(session: SessionMeta): Array<string> {
  return [session.friendlyId, session.key].filter(Boolean)
}

function sessionBelongsToProject(
  session: SessionMeta,
  sessionProjectMap: Record<string, string>,
  projectId: string,
): boolean {
  return getSessionMapKeys(session).some(
    (key) => sessionProjectMap[key] === projectId,
  )
}

function getProjectSessionCount(
  sessions: Array<SessionMeta>,
  sessionProjectMap: Record<string, string>,
  projectId: string,
): number {
  return sessions.filter((session) =>
    sessionBelongsToProject(session, sessionProjectMap, projectId),
  ).length
}

function ProjectDialog({
  open,
  project,
  form,
  setForm,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  project: WorkspaceProject | null
  form: ProjectFormState
  setForm: (next: ProjectFormState) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}) {
  const isEditing = Boolean(project)
  const canSubmit = form.name.trim().length > 0

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(520px,92vw)]">
        <div className="border-b border-primary-200 px-5 py-4">
          <DialogTitle>{isEditing ? 'Edit project' : 'New project'}</DialogTitle>
          <DialogDescription className="mt-1">
            Keep goal-specific chats together. Project instructions are injected
            only into chats started or assigned here.
          </DialogDescription>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-primary-900">Name</span>
            <Input
              nativeInput
              value={form.name}
              placeholder="SEO/AEO Business"
              onChange={(event) =>
                setForm({ ...form, name: event.currentTarget.value })
              }
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-primary-900">Goal</span>
            <textarea
              value={form.goal}
              placeholder="What is this project trying to accomplish?"
              rows={3}
              onChange={(event) =>
                setForm({ ...form, goal: event.currentTarget.value })
              }
              className="w-full rounded-lg border border-primary-200 bg-surface px-3 py-2 text-sm text-primary-900 outline-none transition-shadow focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/24"
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-primary-900">
              Project instructions
            </span>
            <textarea
              value={form.instructions}
              placeholder="How should chats in this project behave?"
              rows={4}
              onChange={(event) =>
                setForm({ ...form, instructions: event.currentTarget.value })
              }
              className="w-full rounded-lg border border-primary-200 bg-surface px-3 py-2 text-sm text-primary-900 outline-none transition-shadow focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/24"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-primary-200 px-5 py-4">
          <DialogClose>Cancel</DialogClose>
          <Button disabled={!canSubmit} onClick={onSubmit}>
            {isEditing ? 'Save project' : 'Create project'}
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}

export const SidebarProjects = memo(function SidebarProjects({
  sessions,
  activeFriendlyId,
  defaultOpen = true,
  onSelect,
  onRename,
  onDelete,
}: SidebarProjectsProps) {
  const {
    activeProjects,
    sessionProjectMap,
    activeProjectId,
    createProject,
    updateProject,
    archiveProject,
    assignSessionToProject,
    setActiveProject,
  } = useProjects()
  const { pinnedSessionKeys, togglePinnedSession } = usePinnedSessions()
  const pinnedKeys = useMemo(() => new Set(pinnedSessionKeys), [pinnedSessionKeys])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<WorkspaceProject | null>(
    null,
  )
  const [form, setForm] = useState<ProjectFormState>(EMPTY_FORM)

  function openNewProjectDialog() {
    setEditingProject(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEditProjectDialog(project: WorkspaceProject) {
    setEditingProject(project)
    setForm({
      name: project.name,
      goal: project.goal,
      instructions: project.instructions,
    })
    setDialogOpen(true)
  }

  function handleSubmitProject() {
    if (!form.name.trim()) return
    if (editingProject) {
      updateProject(editingProject.id, form)
    } else {
      createProject(form)
    }
    setDialogOpen(false)
    setEditingProject(null)
    setForm(EMPTY_FORM)
  }

  function handleTogglePin(session: SessionMeta) {
    togglePinnedSession(session.key)
  }

  return (
    <>
      <Collapsible
        className="flex shrink-0 flex-col w-full"
        defaultOpen={defaultOpen}
      >
        <CollapsibleTrigger className="w-full flex items-center gap-1.5 rounded-none px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-transparent data-panel-open:text-primary-500">
          <span className="select-none">Projects</span>
          <span className="ml-auto inline-flex items-center gap-1">
            <button
              type="button"
              aria-label="New project"
              className="rounded p-0.5 hover:bg-primary-200 dark:hover:bg-primary-800"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                openNewProjectDialog()
              }}
            >
              <HugeiconsIcon
                icon={PencilEdit02Icon}
                size={12}
                strokeWidth={2}
              />
            </button>
            <span className="rounded p-0.5 hover:bg-primary-200 dark:hover:bg-primary-800">
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={12}
                strokeWidth={2}
                className="text-primary-500 transition-transform duration-150 -rotate-90 group-data-panel-open:rotate-0"
              />
            </span>
          </span>
        </CollapsibleTrigger>
        <CollapsiblePanel
          className="w-full min-h-0"
          contentClassName="flex flex-col gap-1 px-2 pt-1"
        >
          {activeProjects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-primary-200 px-3 py-3 text-xs text-primary-600">
              <div className="font-medium text-primary-800">No projects yet.</div>
              <button
                type="button"
                className="mt-2 text-accent-500 hover:underline"
                onClick={openNewProjectDialog}
              >
                Create the first project
              </button>
            </div>
          ) : (
            activeProjects.map((project) => {
              const projectSessions = sessions.filter((session) =>
                sessionBelongsToProject(
                  session,
                  sessionProjectMap,
                  project.id,
                ),
              )
              const isProjectActive = activeProjectId === project.id
              const canAssignActive =
                activeFriendlyId &&
                activeFriendlyId !== 'new' &&
                sessionProjectMap[activeFriendlyId] !== project.id

              return (
                <Collapsible
                  key={project.id}
                  className="rounded-lg border border-primary-200/70 bg-primary-50/40 dark:bg-primary-900/10"
                  defaultOpen={isProjectActive || projectSessions.length > 0}
                >
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <CollapsibleTrigger className="min-w-0 flex-1 px-1 py-1 hover:bg-transparent">
                      <span
                        className="inline-flex size-2.5 shrink-0 rounded-full"
                        style={{ background: project.color }}
                      />
                      <HugeiconsIcon
                        icon={Building01Icon}
                        size={14}
                        strokeWidth={1.6}
                        className="shrink-0 text-primary-600"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-primary-900">
                        {project.name}
                      </span>
                      <span className="rounded-full bg-primary-200 px-1.5 py-0.5 text-[10px] text-primary-700">
                        {getProjectSessionCount(
                          sessions,
                          sessionProjectMap,
                          project.id,
                        )}
                      </span>
                    </CollapsibleTrigger>
                    <Link
                      to="/chat/$sessionKey"
                      params={{ sessionKey: 'new' }}
                      onClick={() => {
                        setActiveProject(project.id)
                        onSelect?.()
                      }}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                        'size-7 text-primary-700',
                      )}
                      title={`New chat in ${project.name}`}
                    >
                      <HugeiconsIcon
                        icon={PencilEdit02Icon}
                        size={16}
                        strokeWidth={1.5}
                      />
                    </Link>
                    <MenuRoot>
                      <MenuTrigger
                        type="button"
                        aria-label={`${project.name} project options`}
                        className="inline-flex size-7 items-center justify-center rounded-md text-primary-700 hover:bg-primary-200 dark:hover:bg-primary-800"
                      >
                        <HugeiconsIcon
                          icon={MoreHorizontalIcon}
                          size={16}
                          strokeWidth={1.5}
                        />
                      </MenuTrigger>
                      <MenuContent side="bottom" align="end">
                        {canAssignActive ? (
                          <MenuItem
                            onClick={() => {
                              assignSessionToProject(activeFriendlyId, project.id)
                            }}
                            className="gap-2"
                          >
                            <HugeiconsIcon
                              icon={Building01Icon}
                              size={18}
                              strokeWidth={1.5}
                            />
                            Move active chat here
                          </MenuItem>
                        ) : null}
                        <MenuItem
                          onClick={() => openEditProjectDialog(project)}
                          className="gap-2"
                        >
                          <HugeiconsIcon
                            icon={Pen01Icon}
                            size={18}
                            strokeWidth={1.5}
                          />
                          Edit project
                        </MenuItem>
                        <MenuItem
                          onClick={() => archiveProject(project.id)}
                          className="text-red-700 gap-2 hover:bg-red-50 dark:hover:bg-red-900/30/80 data-highlighted:bg-red-50/80"
                        >
                          <HugeiconsIcon
                            icon={Delete01Icon}
                            size={18}
                            strokeWidth={1.5}
                          />
                          Archive project
                        </MenuItem>
                      </MenuContent>
                    </MenuRoot>
                  </div>
                  {project.goal ? (
                    <div className="px-3 pb-1 text-[11px] leading-4 text-primary-600">
                      {project.goal}
                    </div>
                  ) : null}
                  <CollapsiblePanel
                    className="w-full min-h-0"
                    contentClassName="flex flex-col gap-px px-1 pb-1 pt-0"
                  >
                    {projectSessions.length > 0 ? (
                      projectSessions.map((session) => (
                        <SessionItem
                          key={session.key}
                          session={session}
                          active={session.friendlyId === activeFriendlyId}
                          isPinned={pinnedKeys.has(session.key)}
                          onSelect={() => {
                            setActiveProject(project.id)
                            onSelect?.()
                          }}
                          onTogglePin={handleTogglePin}
                          onRename={onRename}
                          onDelete={onDelete}
                        />
                      ))
                    ) : (
                      <div className="px-2 py-2 text-[11px] text-primary-500">
                        No chats yet. Start one with the pencil button.
                      </div>
                    )}
                  </CollapsiblePanel>
                </Collapsible>
              )
            })
          )}
        </CollapsiblePanel>
      </Collapsible>

      <ProjectDialog
        open={dialogOpen}
        project={editingProject}
        form={form}
        setForm={setForm}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmitProject}
      />
    </>
  )
})
