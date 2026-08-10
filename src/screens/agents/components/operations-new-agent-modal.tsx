import { useEffect, useState } from 'react'
import { Cancel01Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AGENT_PRESETS } from '../agent-presets'
import { OperationsModelConfig } from './operations-model-config'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PresetOption = {
  id: string
  name: string
  emoji: string
  description: string
  systemPrompt: string
}

const PRESET_OPTIONS: Array<PresetOption> = [
  {
    id: 'blank',
    name: 'Blank',
    emoji: '✨',
    description: '',
    systemPrompt: '',
  },
  ...Object.entries(AGENT_PRESETS)
    .filter(([id]) => !id.startsWith('pc1-'))
    .map(([id, preset]) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      emoji: preset.emoji,
      description: preset.description,
      systemPrompt: preset.systemPrompt,
    })),
]

export function OperationsNewAgentModal({
  open,
  defaultModel,
  onClose,
  onCreate,
  isSaving,
}: {
  open: boolean
  defaultModel: string
  onClose: () => void
  onCreate: (input: {
    name: string
    emoji: string
    model: string
    reasoningEffort?: string
    maxOutputTokens?: number
    codexRuntime?: 'hermes_default' | 'codex_app_server'
    systemPrompt: string
    description?: string
  }) => Promise<unknown>
  isSaving: boolean
}) {
  const [presetId, setPresetId] = useState<string>('blank')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🤖')
  const [model, setModel] = useState(defaultModel)
  const [reasoningEffort, setReasoningEffort] = useState<string>()
  const [maxOutputTokens, setMaxOutputTokens] = useState<number>()
  const [codexRuntime, setCodexRuntime] = useState<'hermes_default' | 'codex_app_server'>('hermes_default')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')

  useEffect(() => {
    if (!open) return
    setPresetId('blank')
    setName('')
    setEmoji('🤖')
    setModel(defaultModel)
    setReasoningEffort(undefined)
    setMaxOutputTokens(undefined)
    setCodexRuntime('hermes_default')
    setDescription('')
    setSystemPrompt('')
  }, [defaultModel, open])

  function applyPreset(next: string) {
    setPresetId(next)
    const preset = PRESET_OPTIONS.find((entry) => entry.id === next)
    if (!preset || preset.id === 'blank') return
    setName((current) => current.trim() || preset.name)
    setEmoji(preset.emoji)
    setDescription(preset.description)
    setSystemPrompt(preset.systemPrompt)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-bg)_48%,transparent)] px-4 py-6 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-6 shadow-[0_30px_100px_var(--theme-shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-accent)]">
              <HugeiconsIcon icon={PlusSignIcon} size={20} strokeWidth={1.8} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[var(--theme-text)]">
                New Agent
              </h2>
              <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
                Add a persistent Operations agent to the roster.
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

        <div className="mt-6 space-y-2">
          <span className="text-sm font-medium text-[var(--theme-text)]">
            Start from a template
          </span>
          <div className="flex flex-wrap gap-2">
            {PRESET_OPTIONS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all',
                  presetId === preset.id
                    ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-text)]'
                    : 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-muted)] hover:bg-[var(--theme-card2)]',
                )}
              >
                <span aria-hidden="true">{preset.emoji}</span>
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--theme-muted)]">
            Templates fill in emoji, description, and system prompt. You can
            edit everything before creating.
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.6fr]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Sage"
              className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-accent)]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Emoji
            </span>
            <input
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              placeholder="🐦"
              className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-accent)]"
            />
          </label>
        </div>

        <div className="mt-4">
          <OperationsModelConfig
            routeRef={model}
            reasoningEffort={reasoningEffort}
            maxOutputTokens={maxOutputTokens}
            codexRuntime={codexRuntime}
            onRouteChange={setModel}
            onReasoningEffortChange={setReasoningEffort}
            onMaxOutputTokensChange={setMaxOutputTokens}
            onCodexRuntimeChange={setCodexRuntime}
          />
        </div>

        <label className="mt-4 block space-y-2">
          <span className="text-sm font-medium text-[var(--theme-text)]">
            Description
          </span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="X/Twitter growth agent"
            className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-accent)]"
          />
        </label>

        <label className="mt-4 block space-y-2">
          <span className="text-sm font-medium text-[var(--theme-text)]">
            System Prompt
          </span>
          <textarea
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder="You are Sage, an expert..."
            className="min-h-[180px] w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-accent)]"
          />
        </label>

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
            onClick={() =>
              void onCreate({
                name,
                emoji,
                model,
                reasoningEffort,
                maxOutputTokens,
                codexRuntime,
                systemPrompt,
                description,
              }).then(() => onClose())
            }
            disabled={isSaving || !name.trim() || !model.trim()}
          >
            {isSaving ? 'Creating…' : 'Create Agent'}
          </Button>
        </div>
      </div>
    </div>
  )
}
