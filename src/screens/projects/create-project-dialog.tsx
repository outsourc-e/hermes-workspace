import type React from 'react'
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { workspaceRequestJson } from '@/lib/workspace-checkpoints'
import type { ProjectFormState } from './lib/workspace-types'
import {
  ACCEPTED_SPEC_FILE_TYPES,
  readSpecFile,
} from './lib/spec-file'

function extractRecentPaths(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const paths = (payload as { paths?: unknown }).paths
  if (!Array.isArray(paths)) return []
  return paths.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

type WorkspaceEntityDialogProps = {
  open: boolean
  title: string
  description: string
  submitting: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  submitLabel: string
  errorMessage?: string | null
  progressMessage?: string | null
  progressHint?: string | null
}

export function WorkspaceFieldLabel({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-primary-500">
        {label}
      </span>
      {children}
    </label>
  )
}

export function WorkspaceEntityDialog({
  open,
  title,
  description,
  submitting,
  onOpenChange,
  children,
  onSubmit,
  submitLabel,
  errorMessage,
  progressMessage,
  progressHint,
}: WorkspaceEntityDialogProps) {
  return (
    <DialogRoot
      open={open}
      onOpenChange={(nextOpen) => {
        if (submitting && !nextOpen) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="w-[min(540px,94vw)] border-primary-200 bg-white p-0 text-primary-900 shadow-2xl">
        <form onSubmit={onSubmit} className="space-y-5 p-5">
          <div className="space-y-1">
            <DialogTitle className="text-base font-semibold text-primary-900">
              {title}
            </DialogTitle>
            <DialogDescription className="text-sm text-primary-500">
              {description}
            </DialogDescription>
          </div>

          <div className="space-y-4">{children}</div>

          {errorMessage ? (
            <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-3 text-sm text-primary-900">
              {errorMessage}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
            <Button
              type="submit"
              className="bg-accent-500 text-white hover:bg-accent-400"
              disabled={submitting}
            >
                {submitLabel}
            </Button>
            </div>

            {submitting && progressMessage ? (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-full border border-primary-200 bg-primary-50">
                  <div className="h-2 w-2/3 animate-shimmer rounded-full bg-accent-500" />
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-primary-900">
                  <span className="size-3 animate-spin rounded-full border-2 border-accent-500 border-r-transparent" />
                  <span>{progressMessage}</span>
                </div>
                {progressHint ? (
                  <p className="text-xs leading-5 text-primary-500">{progressHint}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

type CreateProjectDialogProps = {
  open: boolean
  submitting: boolean
  form: ProjectFormState
  submitLabel?: string
  errorMessage?: string | null
  progressMessage?: string | null
  progressHint?: string | null
  onOpenChange: (open: boolean) => void
  onFormChange: (next: ProjectFormState) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

export function CreateProjectDialog({
  open,
  submitting,
  form,
  submitLabel = 'Create Project',
  errorMessage,
  progressMessage,
  progressHint,
  onOpenChange,
  onFormChange,
  onSubmit,
}: CreateProjectDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pathFieldRef = useRef<HTMLDivElement | null>(null)
  const [pathDropdownOpen, setPathDropdownOpen] = useState(false)
  const recentPathsQuery = useQuery({
    queryKey: ['workspace', 'recent-paths'],
    queryFn: async () =>
      extractRecentPaths(await workspaceRequestJson('/api/workspace/recent-paths')),
    enabled: false,
    staleTime: 60_000,
  })

  async function handleSpecFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const spec = await readSpecFile(file)
      onFormChange({ ...form, spec })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to read spec file', {
        type: 'error',
      })
    }
  }

  async function openPathDropdown() {
    setPathDropdownOpen(true)
    try {
      await recentPathsQuery.refetch()
    } catch {
      // Query state is surfaced below.
    }
  }

  function handlePathBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && pathFieldRef.current?.contains(nextTarget)) return
    window.setTimeout(() => setPathDropdownOpen(false), 0)
  }

  return (
    <WorkspaceEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create Project"
      description="Define a new workspace project with an optional path and project spec."
      submitting={submitting}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
      errorMessage={errorMessage}
      progressMessage={progressMessage}
      progressHint={progressHint}
    >
      <WorkspaceFieldLabel label="Name">
        <input
          value={form.name}
          onChange={(event) => onFormChange({ ...form, name: event.target.value })}
          className="w-full rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
          placeholder="OpenClaw Workspace Refresh"
          autoFocus
        />
      </WorkspaceFieldLabel>
      <WorkspaceFieldLabel label="Path">
        <div
          ref={pathFieldRef}
          className="relative"
          onBlur={handlePathBlur}
        >
          <div className="flex gap-2">
            <input
              value={form.path}
              onChange={(event) => onFormChange({ ...form, path: event.target.value })}
              onFocus={() => void openPathDropdown()}
              className="w-full rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
              placeholder="/Users/aurora/.openclaw/workspace/clawsuite"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void openPathDropdown()}
              disabled={recentPathsQuery.isFetching}
            >
              Browse
            </Button>
          </div>
          {pathDropdownOpen ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-lg border border-primary-200 bg-white p-2 shadow-sm">
              {recentPathsQuery.isFetching ? (
                <p className="px-2 py-2 text-sm text-primary-500">Loading recent paths...</p>
              ) : recentPathsQuery.isError ? (
                <p className="px-2 py-2 text-sm text-primary-500">
                  {recentPathsQuery.error instanceof Error
                    ? recentPathsQuery.error.message
                    : 'Failed to load recent paths'}
                </p>
              ) : (recentPathsQuery.data ?? []).length > 0 ? (
                <div className="space-y-1">
                  {(recentPathsQuery.data ?? []).map((path) => (
                    <button
                      key={path}
                      type="button"
                      className="block w-full rounded-md px-2 py-2 text-left text-sm text-primary-900 transition-colors hover:bg-primary-50"
                      onMouseDown={(event) => {
                        event.preventDefault()
                        onFormChange({ ...form, path })
                        setPathDropdownOpen(false)
                      }}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-2 py-2 text-sm text-primary-500">No recent paths yet.</p>
              )}
            </div>
          ) : null}
        </div>
      </WorkspaceFieldLabel>
      <WorkspaceFieldLabel label="Spec">
        <div className="space-y-2">
          <textarea
            value={form.spec}
            onChange={(event) => onFormChange({ ...form, spec: event.target.value })}
            rows={5}
            className="w-full rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
            placeholder="Optional project brief or execution spec..."
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_SPEC_FILE_TYPES}
            className="hidden"
            onChange={(event) => void handleSpecFileSelect(event)}
          />
          <div className="space-y-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload SPEC.md
            </Button>
            <p className="text-xs text-primary-500">Or upload a SPEC.md / PRD file</p>
          </div>
        </div>
      </WorkspaceFieldLabel>
      <label className="flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50 px-3 py-3">
        <input
          type="checkbox"
          checked={form.autoDecompose}
          onChange={(event) =>
            onFormChange({ ...form, autoDecompose: event.target.checked })
          }
          className="mt-0.5 h-4 w-4 rounded border-primary-300 text-accent-500 focus:ring-accent-500"
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium text-primary-900">
            Auto-create tasks with AI
          </span>
          <span className="block text-xs text-primary-500">
            Create an initial mission from the spec and start agents automatically.
          </span>
        </span>
      </label>
    </WorkspaceEntityDialog>
  )
}
