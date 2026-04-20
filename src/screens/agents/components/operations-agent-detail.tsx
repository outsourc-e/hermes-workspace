import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown01Icon,
  Cancel01Icon,
  Delete02Icon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import {
  fetchModels,
  type GatewayModelCatalogEntry,
} from '@/lib/gateway-api'
import { cn } from '@/lib/utils'
import type { OperationsAgent } from '../hooks/use-operations'

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
    name:
      model.label ?? model.displayName ?? model.name ?? id.split('/').pop() ?? id,
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

  const selected = (() => {
    if (!value) return null
    // If value includes provider prefix (e.g. 'anthropic/claude-sonnet-4-6'),
    // match provider+id together to avoid OpenRouter stealing the match
    const slashIndex = value.indexOf('/')
    if (slashIndex > 0) {
      const valueProvider = value.slice(0, slashIndex)
      const valueModelId = value.slice(slashIndex + 1)
      // First try exact provider+id match
      const exactMatch = models.find(
        (m) => m.provider === valueProvider && (m.id === value || m.id === valueModelId),
      )
      if (exactMatch) return exactMatch
    }
    // Fallback to plain id match
    const idMatch = models.find((m) => m.id === value)
    if (idMatch) return idMatch
    return {
      id: value,
      provider: slashIndex > 0 ? value.slice(0, slashIndex) : 'model',
      name: value.split('/').pop() ?? value,
    }
  })()

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
          className={cn(
            'text-[var(--theme-muted)] transition-transform',
            open && 'rotate-180',
          )}
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

export function OperationsAgentDetail({
  open,
  agent,
  onClose,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  open: boolean
  agent: OperationsAgent | null
  onClose: () => void
  onSave: (input: {
    agentId: string
    name: string
    model: string
    emoji: string
    systemPrompt: string
  }) => Promise<unknown>
  onDelete: (agentId: string) => Promise<unknown>
  isSaving: boolean
  isDeleting: boolean
}) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🤖')
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')

  useEffect(() => {
    if (!agent || !open) return
    setName(agent.name)
    setEmoji(agent.meta.emoji)
    setModel(agent.model || '')
    setSystemPrompt(agent.meta.systemPrompt)
  }, [agent, open])

  const modelsQuery = useQuery({
    queryKey: ['operations', 'models'],
    queryFn: fetchModels,
    enabled: open,
  })

  const models = useMemo(
    () =>
      (modelsQuery.data?.models ?? [])
        .map(normalizeModel)
        .filter((entry): entry is AvailableModel => Boolean(entry)),
    [modelsQuery.data?.models],
  )

  if (!open || !agent) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-bg)_55%,transparent)] px-4 py-6 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-5 shadow-[0_24px_80px_var(--theme-shadow)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-accent)]">
              <HugeiconsIcon icon={Settings01Icon} size={20} strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">
                Agent Settings
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--theme-text)]">
                {agent.name}
              </h2>
              <p className="mt-2 text-sm text-[var(--theme-muted-2)]">
                Update this agent without leaving the roster.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] text-lg text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
            aria-label="Close agent settings"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_0.6fr]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--theme-text)]">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--theme-text)]">Emoji</span>
            <input
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
            />
          </label>
        </div>

        <label className="mt-4 block space-y-2">
          <span className="text-sm font-medium text-[var(--theme-text)]">Model</span>
          <ModelSelector value={model} onChange={setModel} models={models} />
        </label>

        <label className="mt-4 block space-y-2">
          <span className="text-sm font-medium text-[var(--theme-text)]">
            System Prompt
          </span>
          <textarea
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            className="min-h-[220px] w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
          />
        </label>

        <div className="mt-6 flex flex-col gap-3 border-t border-[var(--theme-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            className="justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => void onDelete(agent.id)}
            disabled={isDeleting || isSaving}
          >
            <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.8} />
            {isDeleting ? 'Deleting…' : 'Delete agent'}
          </Button>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              className="border border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              className="bg-[var(--theme-accent)] text-primary-950 hover:bg-[var(--theme-accent-strong)]"
              onClick={() =>
                void onSave({
                  agentId: agent.id,
                  name,
                  model,
                  emoji,
                  systemPrompt,
                })
              }
              disabled={isSaving || isDeleting}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
