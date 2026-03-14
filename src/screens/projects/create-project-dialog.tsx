import type React from 'react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ProjectFormState } from './lib/workspace-types'
import {
  ACCEPTED_SPEC_FILE_TYPES,
  readSpecFile,
} from './lib/spec-file'

type WorkspaceEntityDialogProps = {
  open: boolean
  title: string
  description: string
  submitting: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  submitLabel: string
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
}: WorkspaceEntityDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
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

          <div className="flex items-center justify-end gap-2">
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button
              type="submit"
              className="bg-accent-500 text-white hover:bg-accent-400"
              disabled={submitting}
            >
              {submitting ? 'Saving...' : submitLabel}
            </Button>
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
  onOpenChange: (open: boolean) => void
  onFormChange: (next: ProjectFormState) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

export function CreateProjectDialog({
  open,
  submitting,
  form,
  onOpenChange,
  onFormChange,
  onSubmit,
}: CreateProjectDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

  return (
    <WorkspaceEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create Project"
      description="Define a new workspace project with an optional path and project spec."
      submitting={submitting}
      onSubmit={onSubmit}
      submitLabel="Create Project"
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
        <input
          value={form.path}
          onChange={(event) => onFormChange({ ...form, path: event.target.value })}
          className="w-full rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
          placeholder="/Users/aurora/.openclaw/workspace/clawsuite"
        />
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
