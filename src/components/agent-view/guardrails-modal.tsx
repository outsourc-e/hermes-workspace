import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'

type GuardrailsModalProps = {
  open: boolean
  agentName: string
  agentId: string
  sessionKey?: string
  onOpenChange: (open: boolean) => void
}

type GuardrailConfig = {
  maxTokens: number | null
  toolMode: 'allowlist' | 'blocklist'
  tools: Array<string>
  stopOnError: boolean
  stopOnIdle: boolean
  stopOnTokenLimit: boolean
}

const DEFAULT_CONFIG: GuardrailConfig = {
  maxTokens: null,
  toolMode: 'allowlist',
  tools: [],
  stopOnError: false,
  stopOnIdle: false,
  stopOnTokenLimit: false,
}

const TOKEN_PRESETS: Array<{ label: string; value: number | null }> = [
  { label: '10k', value: 10_000 },
  { label: '50k', value: 50_000 },
  { label: '100k', value: 100_000 },
  { label: 'Unlimited', value: null },
]

function parseGuardrails(raw: string | null): GuardrailConfig {
  if (!raw) return DEFAULT_CONFIG
  try {
    const parsed = JSON.parse(raw) as Partial<GuardrailConfig>
    return {
      maxTokens: typeof parsed.maxTokens === 'number' && Number.isFinite(parsed.maxTokens) && parsed.maxTokens >= 0 ? Math.floor(parsed.maxTokens) : null,
      toolMode: parsed.toolMode === 'blocklist' ? 'blocklist' : 'allowlist',
      tools: Array.isArray(parsed.tools) ? parsed.tools.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean) : [],
      stopOnError: Boolean(parsed.stopOnError),
      stopOnIdle: Boolean(parsed.stopOnIdle),
      stopOnTokenLimit: Boolean(parsed.stopOnTokenLimit),
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function GuardrailsModal({ open, agentName, agentId, sessionKey, onOpenChange }: GuardrailsModalProps) {
  const [maxTokens, setMaxTokens] = useState<number | null>(DEFAULT_CONFIG.maxTokens)
  const [toolMode, setToolMode] = useState<GuardrailConfig['toolMode']>(DEFAULT_CONFIG.toolMode)
  const [toolsText, setToolsText] = useState('')
  const [stopOnError, setStopOnError] = useState(DEFAULT_CONFIG.stopOnError)
  const [stopOnIdle, setStopOnIdle] = useState(DEFAULT_CONFIG.stopOnIdle)
  const [stopOnTokenLimit, setStopOnTokenLimit] = useState(DEFAULT_CONFIG.stopOnTokenLimit)

  useEffect(() => {
    if (!open) return
    const normalizedId = agentId.trim()
    const parsed = normalizedId
      ? parseGuardrails(window.localStorage.getItem(`clawsuite:guardrails:${normalizedId}`))
      : DEFAULT_CONFIG
    setMaxTokens(parsed.maxTokens)
    setToolMode(parsed.toolMode)
    setToolsText(parsed.tools.join('\n'))
    setStopOnError(parsed.stopOnError)
    setStopOnIdle(parsed.stopOnIdle)
    setStopOnTokenLimit(parsed.stopOnTokenLimit)
  }, [open, agentId, sessionKey])

  function handleSave() {
    const normalizedId = agentId.trim()
    if (!normalizedId) return onOpenChange(false)
    const config: GuardrailConfig = {
      maxTokens,
      toolMode,
      tools: toolsText.split('\n').map((value) => value.trim()).filter(Boolean),
      stopOnError,
      stopOnIdle,
      stopOnTokenLimit,
    }
    window.localStorage.setItem(`clawsuite:guardrails:${normalizedId}`, JSON.stringify(config))
    toast(`Guardrails updated for ${agentName}`, { type: 'success' })
    onOpenChange(false)
  }

  const stopRows: Array<{ checked: boolean; label: string; onToggle: () => void }> = [
    { checked: stopOnError, label: 'Stop on error (agent encounters an unrecoverable error)', onToggle: () => setStopOnError((value) => !value) },
    { checked: stopOnIdle, label: 'Stop on idle (no activity for 5 minutes)', onToggle: () => setStopOnIdle((value) => !value) },
    { checked: stopOnTokenLimit, label: 'Stop on token limit reached', onToggle: () => setStopOnTokenLimit((value) => !value) },
  ]

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,92vw)]">
        <div className="space-y-4 p-5">
          <div className="space-y-1">
            <DialogTitle className="text-base">Guardrails: {agentName}</DialogTitle>
            <DialogDescription>Set constraints for this agent&apos;s behavior. Changes are saved locally.</DialogDescription>
          </div>

          <section className="space-y-2">
            <p className="text-xs font-medium text-primary-700">Max tokens per run</p>
            <div className="inline-flex rounded-lg bg-neutral-100 dark:bg-neutral-800 p-1 gap-1">
              {TOKEN_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setMaxTokens(preset.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${maxTokens === preset.value ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100' : 'text-neutral-600 hover:bg-white/70 dark:text-neutral-300 dark:hover:bg-neutral-700'}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={0}
              step={1000}
              value={maxTokens ?? ''}
              onChange={(event) => {
                if (!event.target.value) return setMaxTokens(null)
                const parsed = Number(event.target.value)
                if (Number.isFinite(parsed) && parsed >= 0) setMaxTokens(Math.floor(parsed))
              }}
              className="w-full rounded-lg border border-primary-200 bg-primary-100/70 px-3 py-2 text-sm text-primary-900 outline-none transition-colors focus:border-accent-400"
            />
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-primary-700">Mode</p>
              <div className="inline-flex rounded-lg bg-neutral-100 dark:bg-neutral-800 p-1 gap-1">
                {(['allowlist', 'blocklist'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setToolMode(mode)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${toolMode === mode ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100' : 'text-neutral-600 hover:bg-white/70 dark:text-neutral-300 dark:hover:bg-neutral-700'}`}
                  >
                    {mode === 'allowlist' ? 'Allowlist' : 'Blocklist'}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={4}
              value={toolsText}
              onChange={(event) => setToolsText(event.target.value)}
              placeholder={'read\nwrite\nexec\nbrowser'}
              className="w-full resize-y rounded-lg border border-primary-200 bg-primary-100/70 px-3 py-2 text-sm font-mono text-primary-900 outline-none transition-colors focus:border-accent-400"
            />
            <p className="text-[11px] text-primary-600">Enter tool names, one per line. Leave empty to allow all.</p>
          </section>

          <section className="space-y-1">
            <p className="text-xs font-medium text-primary-700">Auto-Stop Triggers</p>
            {stopRows.map((row) => (
              <button
                key={row.label}
                type="button"
                onClick={row.onToggle}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer text-left"
              >
                <span>{row.checked ? '☑' : '☐'}</span>
                <span className="text-sm text-primary-900 dark:text-primary-100">{row.label}</span>
              </button>
            ))}
          </section>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} className="bg-accent-500 text-white hover:bg-accent-600">Save</Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
