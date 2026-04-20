import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown01Icon, Cancel01Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { fetchModels, type GatewayModelCatalogEntry } from '@/lib/gateway-api'
import { cn } from '@/lib/utils'
import type { OperationsSettings } from '../hooks/use-operations'

type AvailableModel = {
  id: string
  provider: string
  name: string
}

function normalizeModel(model: GatewayModelCatalogEntry): AvailableModel | null {
  if (typeof model === 'string') {
    return {
      id: model,
      provider: model.includes('/') ? (model.split('/')[0] ?? 'model') : 'model',
      name: model.split('/').pop() ?? model,
    }
  }

  const id = model.id ?? model.alias ?? model.model ?? ''
  if (!id) return null

  return {
    id,
    provider: model.provider ?? id.split('/')[0] ?? 'model',
    name: model.label ?? model.displayName ?? model.name ?? id.split('/').pop() ?? id,
  }
}

function ModelSelector({
  value,
  onChange,
  models,
}: {
  value: string
  onChange: (nextValue: string) => void
  models: AvailableModel[]
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const selected = models.find((model) => model.id === value)

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-[3rem] w-full items-center justify-between gap-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-left text-sm text-[var(--theme-text)] shadow-[0_8px_24px_color-mix(in_srgb,var(--theme-shadow)_18%,transparent)]"
      >
        <span className="truncate">
          {selected ? `${selected.provider} / ${selected.name}` : 'Default (auto)'}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={16}
          strokeWidth={1.8}
          className={cn('text-[var(--theme-muted)] transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-[80] w-full overflow-hidden rounded-2xl border border-[var(--theme-border2)] bg-[var(--theme-card)] shadow-[0_24px_80px_var(--theme-shadow)]">
          <div className="max-h-80 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className={cn(
                'flex w-full rounded-xl px-3 py-2.5 text-left text-sm',
                !value ? 'bg-[var(--theme-accent-soft)]' : 'hover:bg-[var(--theme-bg)]',
              )}
            >
              Default (auto)
            </button>
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  onChange(model.id)
                  setOpen(false)
                }}
                className={cn(
                  'mt-1 flex w-full rounded-xl px-3 py-2.5 text-left text-sm',
                  value === model.id
                    ? 'bg-[var(--theme-accent-soft)]'
                    : 'hover:bg-[var(--theme-bg)]',
                )}
              >
                {model.provider} / {model.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function OperationsSettingsModal({
  open,
  settings,
  onClose,
  onSave,
}: {
  open: boolean
  settings: OperationsSettings
  onClose: () => void
  onSave: (settings: OperationsSettings) => void
}) {
  const [draft, setDraft] = useState(settings)

  useEffect(() => {
    setDraft(settings)
  }, [settings, open])

  const modelsQuery = useQuery({
    queryKey: ['operations', 'models'],
    queryFn: fetchModels,
    enabled: open,
  })

  const models = useMemo(
    () =>
      (modelsQuery.data?.models ?? [])
        .map(normalizeModel)
        .filter((model): model is AvailableModel => Boolean(model)),
    [modelsQuery.data?.models],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-bg)_48%,transparent)] px-4 py-6 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-6 shadow-[0_30px_100px_var(--theme-shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-accent)]">
              <HugeiconsIcon icon={Settings01Icon} size={20} strokeWidth={1.8} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[var(--theme-text)]">
                Operations Settings
              </h2>
              <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
                Defaults stored locally for the Operations screen.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2 text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Default model for new agents
            </span>
            <ModelSelector
              value={draft.defaultModel}
              onChange={(defaultModel) => setDraft((current) => ({ ...current, defaultModel }))}
              models={models}
            />
          </label>

          <label className="flex items-center justify-between rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-[var(--theme-text)]">
                Auto-approve
              </span>
              <span className="block text-sm text-[var(--theme-muted-2)]">
                Reserved for future workflow automation.
              </span>
            </span>
            <input
              type="checkbox"
              checked={draft.autoApprove}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  autoApprove: event.target.checked,
                }))
              }
              className="size-4 accent-[var(--theme-accent)]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Activity feed length
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={draft.activityFeedLength}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  activityFeedLength: Number(event.target.value) || 5,
                }))
              }
              className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="secondary"
            className="border border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="bg-[var(--theme-accent)] text-primary-950 hover:bg-[var(--theme-accent-strong)]"
            onClick={() => {
              onSave(draft)
              onClose()
            }}
          >
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  )
}
