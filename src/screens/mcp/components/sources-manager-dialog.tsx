/**
 * Sources Manager Dialog — Phase 3.2.
 *
 * Lists all MCP Hub sources (built-ins read-only, user-defined editable).
 * Add / Edit / Delete user-defined sources.
 * Triggered from a "Sources" button in the Marketplace tab toolbar.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import {
  useMcpHubSources,
  useAddHubSource,
  useUpdateHubSource,
  useDeleteHubSource,
  type HubSourceEntry,
  type AddSourceInput,
  type MutationError,
} from '../hooks/use-mcp-hub-sources'

interface Props {
  open: boolean
  onClose: () => void
}

const TRUST_OPTIONS = ['official', 'community', 'unverified'] as const
const FORMAT_OPTIONS = ['smithery', 'generic-json'] as const

const EMPTY_FORM: AddSourceInput = {
  id: '',
  name: '',
  url: '',
  trust: 'community',
  format: 'generic-json',
  enabled: true,
}

const FIELD = 'h-9 w-full rounded-lg border border-primary-200 bg-primary-100/60 px-3 text-sm text-ink outline-none transition-colors focus:border-primary'
const LABEL = 'flex flex-col gap-1 text-sm text-primary-500'
const ERROR_TEXT = 'mt-0.5 text-xs text-red-600 dark:text-red-400'

function fieldError(errors: MutationError[], path: string): string | undefined {
  return errors.find((e) => e.path === path)?.message
}

interface SourceFormProps {
  initial?: Partial<AddSourceInput>
  isEdit?: boolean
  onSave: (data: AddSourceInput) => void
  onCancel: () => void
  saving: boolean
  serverErrors: MutationError[]
}

function SourceForm({ initial, isEdit, onSave, onCancel, saving, serverErrors }: SourceFormProps) {
  const [form, setForm] = useState<AddSourceInput>({ ...EMPTY_FORM, ...initial })
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.id.match(/^[a-z][a-z0-9_-]{0,63}$/)) {
      errs.id = 'id must match /^[a-z][a-z0-9_-]{0,63}$/'
    }
    if (form.name.trim().length < 1) errs.name = 'name is required'
    if (!form.url) {
      errs.url = 'url is required'
    } else {
      try {
        const u = new URL(form.url)
        if (u.protocol !== 'https:') errs.url = 'url must use https://'
      } catch {
        errs.url = 'url is not valid'
      }
    }
    setLocalErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    onSave(form)
  }

  function set<K extends keyof AddSourceInput>(key: K, value: AddSourceInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setLocalErrors((prev) => { const next = { ...prev }; delete next[key]; return next })
  }

  const idErr = localErrors.id ?? fieldError(serverErrors, 'id')
  const nameErr = localErrors.name ?? fieldError(serverErrors, 'name')
  const urlErr = localErrors.url ?? fieldError(serverErrors, 'url')
  const trustErr = fieldError(serverErrors, 'trust')
  const formatErr = fieldError(serverErrors, 'format')

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className={LABEL}>
        <span>Source ID <span className="text-red-500">*</span></span>
        <input
          className={FIELD}
          value={form.id}
          onChange={(e) => set('id', e.target.value)}
          disabled={isEdit || saving}
          placeholder="internal"
          autoFocus
        />
        {idErr ? <p className={ERROR_TEXT}>{idErr}</p> : null}
        <p className="text-[11px] text-primary-400">Lowercase, alphanumeric + _ -. Cannot be changed after creation.</p>
      </div>

      <div className={LABEL}>
        <span>Name <span className="text-red-500">*</span></span>
        <input
          className={FIELD}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          disabled={saving}
          placeholder="Internal Catalog"
        />
        {nameErr ? <p className={ERROR_TEXT}>{nameErr}</p> : null}
      </div>

      <div className={LABEL}>
        <span>URL <span className="text-red-500">*</span></span>
        <input
          className={FIELD}
          value={form.url}
          onChange={(e) => set('url', e.target.value)}
          disabled={saving}
          placeholder="https://corp.local/mcp.json"
          type="url"
        />
        {urlErr ? <p className={ERROR_TEXT}>{urlErr}</p> : null}
        <p className="text-[11px] text-primary-400">HTTPS only. Must return JSON.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={LABEL}>
          <span>Trust</span>
          <select
            className={FIELD}
            value={form.trust}
            onChange={(e) => set('trust', e.target.value as AddSourceInput['trust'])}
            disabled={saving}
          >
            {TRUST_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {trustErr ? <p className={ERROR_TEXT}>{trustErr}</p> : null}
        </div>

        <div className={LABEL}>
          <span>Format</span>
          <select
            className={FIELD}
            value={form.format}
            onChange={(e) => set('format', e.target.value as AddSourceInput['format'])}
            disabled={saving}
          >
            {FORMAT_OPTIONS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          {formatErr ? <p className={ERROR_TEXT}>{formatErr}</p> : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="enabled-toggle"
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
          disabled={saving}
          className="h-4 w-4 rounded border-primary-200 text-primary accent-primary"
        />
        <label htmlFor="enabled-toggle" className="text-sm text-ink cursor-pointer">
          Enabled
        </label>
      </div>

      {serverErrors.filter((e) => !e.path).map((e, i) => (
        <p key={i} className={ERROR_TEXT}>{e.message}</p>
      ))}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Source'}
        </Button>
      </div>
    </form>
  )
}

interface SourceRowProps {
  source: HubSourceEntry
  onEdit: (source: HubSourceEntry) => void
  onDelete: (id: string) => void
  deleting: boolean
}

const TRUST_PILL: Record<string, string> = {
  official: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300',
  community: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  unverified: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
}

function SourceRow({ source, onEdit, onDelete, deleting }: SourceRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-primary-200 bg-primary-100/40 px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-ink truncate">{source.name}</span>
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${TRUST_PILL[source.trust] ?? TRUST_PILL.unverified}`}>
            {source.trust}
          </span>
          {source.builtin ? (
            <span className="rounded border border-primary-200 bg-primary-100/50 px-1.5 py-0.5 text-[10px] text-primary-500">
              built-in
            </span>
          ) : null}
          {!source.enabled ? (
            <span className="rounded border border-primary-200 bg-primary-100/50 px-1.5 py-0.5 text-[10px] text-primary-400">
              disabled
            </span>
          ) : null}
        </div>
        <p className="text-xs text-primary-400 truncate">{source.url}</p>
        <p className="text-[11px] text-primary-400">{source.format} · {source.id}</p>
      </div>
      {!source.builtin ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(source)}
            disabled={deleting}
            className="h-7 px-2 text-xs"
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(source.id)}
            disabled={deleting}
            className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            {deleting ? '…' : 'Remove'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

type Mode = 'list' | 'add' | 'edit'

export function SourcesManagerDialog({ open, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('list')
  const [editingSource, setEditingSource] = useState<HubSourceEntry | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<MutationError[]>([])

  const query = useMcpHubSources()
  const addMutation = useAddHubSource()
  const updateMutation = useUpdateHubSource()
  const deleteMutation = useDeleteHubSource()

  const sources = query.data?.sources ?? []

  function handleClose() {
    setMode('list')
    setEditingSource(null)
    setServerErrors([])
    onClose()
  }

  function handleEdit(source: HubSourceEntry) {
    setEditingSource(source)
    setServerErrors([])
    setMode('edit')
  }

  function handleDelete(id: string) {
    setDeletingId(id)
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setDeletingId(null)
        toast('Source removed', { type: 'success' })
      },
      onError: (err) => {
        setDeletingId(null)
        const errors = (err as { errors?: MutationError[] }).errors ?? []
        setServerErrors(errors)
        toast('Failed to remove source', { type: 'error' })
      },
    })
  }

  function handleAdd(data: AddSourceInput) {
    setServerErrors([])
    addMutation.mutate(data, {
      onSuccess: () => {
        setMode('list')
        toast('Source added', { type: 'success' })
      },
      onError: (err) => {
        const errors = (err as { errors?: MutationError[] }).errors ?? []
        setServerErrors(errors)
      },
    })
  }

  function handleUpdate(data: AddSourceInput) {
    if (!editingSource) return
    setServerErrors([])
    updateMutation.mutate(
      { id: editingSource.id, input: data },
      {
        onSuccess: () => {
          setMode('list')
          setEditingSource(null)
          toast('Source updated', { type: 'success' })
        },
        onError: (err) => {
          const errors = (err as { errors?: MutationError[] }).errors ?? []
          setServerErrors(errors)
        },
      },
    )
  }

  const title = mode === 'add' ? 'Add Source' : mode === 'edit' ? 'Edit Source' : 'Marketplace Sources'
  const saving = addMutation.isPending || updateMutation.isPending

  return (
    <DialogRoot open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="w-[min(560px,95vw)] border-primary-200 bg-primary-50/95 backdrop-blur-sm">
        <div className="border-b border-primary-200 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            {mode !== 'list' ? (
              <button
                onClick={() => { setMode('list'); setEditingSource(null); setServerErrors([]) }}
                className="text-sm text-primary-500 hover:text-ink transition-colors"
              >
                ← Back
              </button>
            ) : null}
            <DialogTitle className="text-base font-semibold text-ink flex-1">
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="mt-0.5 text-xs text-primary-400">
            {mode === 'list'
              ? 'Built-in sources are read-only. User-defined sources can be added, edited, or removed.'
              : mode === 'add'
                ? 'Add a new HTTPS catalog source that returns JSON.'
                : `Editing "${editingSource?.name ?? ''}"`}
          </DialogDescription>
        </div>

        <div className="px-5 py-4">
          {mode === 'list' ? (
            <div className="flex flex-col gap-3">
              {query.isLoading ? (
                <p className="text-sm text-primary-400">Loading sources…</p>
              ) : query.error ? (
                <p className="text-sm text-red-600">Failed to load sources.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {sources.map((source) => (
                    <SourceRow
                      key={source.id}
                      source={source}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      deleting={deletingId === source.id}
                    />
                  ))}
                  {sources.length === 0 ? (
                    <p className="text-sm text-primary-400">No sources found.</p>
                  ) : null}
                </div>
              )}

              {serverErrors.length > 0 ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {serverErrors.map((e, i) => <p key={i}>{e.message}</p>)}
                </div>
              ) : null}

              <div className="flex items-center justify-between pt-1 border-t border-primary-200">
                <Button
                  size="sm"
                  onClick={() => { setServerErrors([]); setMode('add') }}
                >
                  Add Source
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : mode === 'add' ? (
            <SourceForm
              onSave={handleAdd}
              onCancel={() => { setMode('list'); setServerErrors([]) }}
              saving={saving}
              serverErrors={serverErrors}
            />
          ) : (
            <SourceForm
              initial={{
                id: editingSource?.id ?? '',
                name: editingSource?.name ?? '',
                url: editingSource?.url ?? '',
                trust: editingSource?.trust ?? 'community',
                format: editingSource?.format ?? 'generic-json',
                enabled: editingSource?.enabled ?? true,
              }}
              isEdit
              onSave={handleUpdate}
              onCancel={() => { setMode('list'); setEditingSource(null); setServerErrors([]) }}
              saving={saving}
              serverErrors={serverErrors}
            />
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
