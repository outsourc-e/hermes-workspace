import {
  Add01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Edit01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import type { ModelCatalogEntry } from '@/lib/model-types'
import {
  getProviderDisplayName,
  getProviderInfo,
  normalizeProviderId,
} from '@/lib/provider-catalog'
import { cn } from '@/lib/utils'
import { ProviderIcon } from './components/provider-icon'
import { ProviderWizard } from './components/provider-wizard'
import type { ProviderSummaryForEdit } from './components/provider-wizard'

type ProviderStatus = 'active' | 'configured'
type SettingsTabId = 'providers' | 'models' | 'agents' | 'session' | 'memory'
type SettingKind = 'text' | 'number' | 'select' | 'boolean' | 'multiline'

type ProviderSummary = {
  id: string
  name: string
  description: string
  modelCount: number
  status: ProviderStatus
}

type ProvidersScreenProps = {
  embedded?: boolean
}

type HermesConfig = Record<string, unknown>

type ConfigQueryResponse = {
  ok?: boolean
  payload?: HermesConfig
  error?: string
}

type ConfigPatchResponse = {
  ok?: boolean
  error?: string
}

type SelectOption = {
  label: string
  value: string
}

type SettingDefinition = {
  id: string
  tab: SettingsTabId
  label: string
  description: string
  path?: string
  kind: SettingKind
  options?: SelectOption[]
  placeholder?: string
  min?: number
  step?: number
  rows?: number
  unsupported?: boolean
  formatter?: (value: unknown) => string
  parser?: (value: string) => unknown
}

type SaveSettingPayload = {
  path: string
  value: unknown
  label: string
}

const HERMES_API_URL = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'

type HermesCatalogEntry =
  | string
  | {
      id: string
      provider: string
      name: string
      [key: string]: unknown
    }

function isHermesCatalogEntry(
  entry: HermesCatalogEntry | null,
): entry is HermesCatalogEntry {
  return entry !== null
}

async function fetchModels(): Promise<{
  ok?: boolean
  models?: Array<ModelCatalogEntry>
  configuredProviders?: Array<string>
}> {
  const response = await fetch(`${HERMES_API_URL}/v1/models`)
  if (!response.ok) {
    throw new Error(`Hermes models request failed (${response.status})`)
  }

  const payload = (await response.json()) as
    | Array<unknown>
    | { data?: Array<Record<string, unknown>>; models?: Array<Record<string, unknown>> }
  const rawModels = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : []

  const models = rawModels
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const id =
        typeof record.id === 'string'
          ? record.id.trim()
          : typeof record.name === 'string'
            ? record.name.trim()
            : typeof record.model === 'string'
              ? record.model.trim()
              : ''
      if (!id) return null
      const provider =
        typeof record.provider === 'string' && record.provider.trim()
          ? record.provider.trim()
          : typeof record.owned_by === 'string' && record.owned_by.trim()
            ? record.owned_by.trim()
            : id.includes('/')
              ? id.split('/')[0]
              : 'hermes-agent'

      return {
        ...record,
        id,
        provider,
        name:
          typeof record.name === 'string' && record.name.trim()
            ? record.name.trim()
            : typeof record.display_name === 'string' && record.display_name.trim()
              ? record.display_name.trim()
              : typeof record.label === 'string' && record.label.trim()
                ? record.label.trim()
                : id,
      }
    })
    .filter(isHermesCatalogEntry)

  const configuredProviders = Array.from(
    new Set(
      models.flatMap((entry) => {
        if (typeof entry === 'string') return []
        return typeof entry.provider === 'string' && entry.provider
          ? [entry.provider]
          : []
      }),
    ),
  )

  return { ok: true, models: models as Array<ModelCatalogEntry>, configuredProviders }
}

const TAB_ORDER: Array<{ id: SettingsTabId; label: string }> = [
  { id: 'providers', label: 'Providers' },
  { id: 'models', label: 'Models' },
  { id: 'agents', label: 'AI & Agents' },
  { id: 'session', label: 'Session' },
  { id: 'memory', label: 'Memory' },
]

const MEMORY_PROVIDER_OPTIONS: Array<SelectOption> = [
  { label: 'Local', value: 'local' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'Voyage', value: 'voyage' },
  { label: 'Mistral', value: 'mistral' },
  { label: 'Ollama', value: 'ollama' },
]

const MEMORY_FALLBACK_OPTIONS: Array<SelectOption> = [
  { label: 'None', value: 'none' },
  ...MEMORY_PROVIDER_OPTIONS,
]

const SETTINGS: Array<SettingDefinition> = [
  {
    id: 'primary-model',
    tab: 'models',
    path: 'agents.defaults.model.primary',
    label: 'Default model',
    description: 'Primary model used for new agents unless a specific agent overrides it.',
    kind: 'text',
    placeholder: 'provider/model',
  },
  {
    id: 'fallback-chain',
    tab: 'models',
    path: 'agents.defaults.model.fallbacks',
    label: 'Fallback chain',
    description: 'Ordered fallback models. Use one per line or separate with commas.',
    kind: 'multiline',
    rows: 3,
    placeholder: 'anthropic-oauth/claude-sonnet-4-6',
    formatter: formatStringList,
    parser: parseStringList,
  },
  {
    id: 'context-tokens-models',
    tab: 'models',
    path: 'agents.defaults.contextTokens',
    label: 'Context tokens',
    description: 'Default token budget applied to agents when no narrower override is present.',
    kind: 'number',
    min: 1,
    step: 1000,
  },
  // Thinking/reasoning settings removed — not supported by Hermes Agent
  // Legacy settings removed: bootstrap, block streaming,
  // compaction, thinking, verbose, and fast mode do not apply here.
  {
    id: 'context-tokens-session',
    tab: 'session',
    path: 'agents.defaults.contextTokens',
    label: 'Session context tokens',
    description: 'Same agent default context budget surfaced here for session setup workflows.',
    kind: 'number',
    min: 1,
    step: 1000,
  },
  {
    id: 'memory-provider',
    tab: 'memory',
    path: 'agents.defaults.memorySearch.provider',
    label: 'Memory search provider',
    description: 'Embedding provider used for memory lookup and consolidation.',
    kind: 'select',
    options: MEMORY_PROVIDER_OPTIONS,
  },
  {
    id: 'memory-fallback',
    tab: 'memory',
    path: 'agents.defaults.memorySearch.fallback',
    label: 'Memory fallback provider',
    description: 'Fallback provider when the primary memory search provider is unavailable.',
    kind: 'select',
    options: MEMORY_FALLBACK_OPTIONS,
  },
  {
    id: 'memory-sync-on-session-start',
    tab: 'memory',
    path: 'agents.defaults.memorySearch.sync.onSessionStart',
    label: 'Sync on session start',
    description: 'Refresh indexed memory paths when a new session starts.',
    kind: 'boolean',
  },
  {
    id: 'memory-sync-on-search',
    tab: 'memory',
    path: 'agents.defaults.memorySearch.sync.onSearch',
    label: 'Sync on search',
    description: 'Run a sync before memory search queries.',
    kind: 'boolean',
  },
  {
    id: 'memory-sync-interval',
    tab: 'memory',
    path: 'agents.defaults.memorySearch.sync.intervalMinutes',
    label: 'Consolidation interval',
    description: 'Background memory consolidation cadence, in minutes.',
    kind: 'number',
    min: 0,
    step: 5,
  },
]

function formatStringList(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .join('\n')
}

function parseStringList(value: string): Array<string> {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function readProviderId(entry: ModelCatalogEntry): string | null {
  if (typeof entry === 'string') return null
  const provider = typeof entry.provider === 'string' ? entry.provider : ''
  const normalized = normalizeProviderId(provider)
  return normalized || null
}

function buildProviderSummaries(payload: {
  models?: Array<ModelCatalogEntry>
  configuredProviders?: Array<string>
}): Array<ProviderSummary> {
  const modelCounts = new Map<string, number>()

  for (const entry of payload.models ?? []) {
    const providerId = readProviderId(entry)
    if (!providerId) continue

    const current = modelCounts.get(providerId) ?? 0
    modelCounts.set(providerId, current + 1)
  }

  const configuredSet = new Set<string>()
  for (const providerId of payload.configuredProviders ?? []) {
    const normalized = normalizeProviderId(providerId)
    if (normalized) configuredSet.add(normalized)
  }

  for (const providerId of modelCounts.keys()) {
    configuredSet.add(providerId)
  }

  const summaries: Array<ProviderSummary> = []

  for (const providerId of configuredSet) {
    const metadata = getProviderInfo(providerId)
    const modelCount = modelCounts.get(providerId) ?? 0

    summaries.push({
      id: providerId,
      name: getProviderDisplayName(providerId),
      description:
        metadata?.description ||
        'Configured provider in your local Hermes setup.',
      modelCount,
      status: modelCount > 0 ? 'active' : 'configured',
    })
  }

  summaries.sort(function sortByName(a, b) {
    return a.name.localeCompare(b.name)
  })

  return summaries
}

function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, source)
}

function coerceBoolean(value: unknown): boolean {
  return value === true
}

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function coerceNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function defaultFormatValue(setting: SettingDefinition, value: unknown): string {
  if (setting.kind === 'number') return coerceNumber(value)
  if (setting.kind === 'boolean') return coerceBoolean(value) ? 'true' : 'false'
  return coerceString(value)
}

function getDraftValue(
  setting: SettingDefinition,
  config: HermesConfig | undefined,
  draftValues: Record<string, string>,
): string {
  if (draftValues[setting.id] !== undefined) return draftValues[setting.id]
  if (!setting.path) return ''
  const rawValue = readPath(config, setting.path)
  if (setting.formatter) return setting.formatter(rawValue)
  return defaultFormatValue(setting, rawValue)
}

function parseTextValue(setting: SettingDefinition, rawValue: string): unknown {
  if (setting.parser) return setting.parser(rawValue)
  return rawValue.trim()
}

function parseNumberValue(rawValue: string): number | null {
  const trimmed = rawValue.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function buildModelOptions(models: Array<ModelCatalogEntry>): Array<SelectOption> {
  const seen = new Set<string>()
  const options: Array<SelectOption> = []

  for (const entry of models) {
    const modelId =
      typeof entry === 'string'
        ? entry
        : typeof entry.id === 'string'
          ? entry.id
          : typeof entry.alias === 'string'
            ? entry.alias
            : typeof entry.model === 'string'
              ? entry.model
              : ''

    if (!modelId.trim() || seen.has(modelId)) continue
    seen.add(modelId)

    const label =
      typeof entry === 'string'
        ? entry
        : typeof entry.displayName === 'string'
          ? entry.displayName
          : typeof entry.label === 'string'
            ? entry.label
            : typeof entry.name === 'string'
              ? entry.name
              : modelId

    options.push({ label, value: modelId })
  }

  options.sort(function sortOptions(a, b) {
    return a.label.localeCompare(b.label)
  })

  return options
}

function searchMatchesSetting(setting: SettingDefinition, query: string): boolean {
  const haystack = [
    setting.label,
    setting.description,
    setting.path,
    setting.tab,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(query)
}

function ProviderStatusBadge({ status }: { status: ProviderStatus }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary-300 bg-white px-2 py-0.5 text-xs font-medium text-primary-700">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={20} strokeWidth={1.5} />
      {status === 'active' ? 'Active' : 'Configured'}
    </span>
  )
}

function SettingCard(props: {
  setting: SettingDefinition
  config: HermesConfig | undefined
  draftValues: Record<string, string>
  setDraftValues: React.Dispatch<React.SetStateAction<Record<string, string>>>
  saveSetting: (payload: SaveSettingPayload) => Promise<void>
  isSaving: boolean
  savePath: string | null
  modelOptions: Array<SelectOption>
}) {
  const {
    setting,
    config,
    draftValues,
    setDraftValues,
    saveSetting,
    isSaving,
    savePath,
    modelOptions,
  } = props

  const disabled = setting.unsupported || isSaving
  const isActiveSave = Boolean(setting.path) && savePath === setting.path
  const draftValue = getDraftValue(setting, config, draftValues)
  const currentValue = setting.path ? readPath(config, setting.path) : undefined

  async function commit(rawValue: string) {
    if (!setting.path || setting.unsupported) return

    let nextValue: unknown = rawValue
    if (setting.kind === 'number') {
      nextValue = parseNumberValue(rawValue)
      if (nextValue === null) {
        toast(`Enter a valid number for ${setting.label}`, { type: 'error' })
        return
      }
    } else if (setting.kind === 'multiline' || setting.kind === 'text') {
      nextValue = parseTextValue(setting, rawValue)
    }

    const currentSerialized = JSON.stringify(currentValue ?? null)
    const nextSerialized = JSON.stringify(nextValue ?? null)
    if (currentSerialized === nextSerialized) {
      setDraftValues((prev) => {
        const next = { ...prev }
        delete next[setting.id]
        return next
      })
      return
    }

    await saveSetting({
      path: setting.path,
      value: nextValue,
      label: setting.label,
    })

    setDraftValues((prev) => {
      const next = { ...prev }
      delete next[setting.id]
      return next
    })
  }

  return (
    <article className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-primary-900">{setting.label}</h3>
            {setting.unsupported ? (
              <span className="rounded-full border border-primary-300 bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                Not available
              </span>
            ) : null}
            {isActiveSave ? (
              <span className="rounded-full border border-primary-300 bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                Saving...
              </span>
            ) : null}
          </div>
          <p className="text-sm text-primary-600">{setting.description}</p>
          {setting.path ? (
            <p className="text-xs text-primary-500">{setting.path}</p>
          ) : null}
        </div>

        <div className="w-full md:max-w-[420px]">
          {setting.kind === 'boolean' ? (
            <div className="flex min-h-10 items-center justify-end">
              <Switch
                checked={coerceBoolean(currentValue)}
                disabled={disabled}
                aria-label={setting.label}
                onCheckedChange={(checked) => {
                  if (!setting.path || setting.unsupported) return
                  void saveSetting({
                    path: setting.path,
                    value: checked,
                    label: setting.label,
                  })
                }}
              />
            </div>
          ) : null}

          {setting.kind === 'select' ? (
            <select
              className="w-full rounded-lg border border-primary-200 bg-surface px-3 py-2 text-sm text-primary-900 outline-none"
              value={coerceString(currentValue)}
              disabled={disabled}
              onChange={(event) => {
                if (!setting.path || setting.unsupported) return
                void saveSetting({
                  path: setting.path,
                  value: event.target.value,
                  label: setting.label,
                })
              }}
            >
              <option value="">Select…</option>
              {(setting.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}

          {setting.kind === 'text' ? (
            <>
              <Input
                value={draftValue}
                disabled={disabled}
                placeholder={setting.placeholder}
                list={setting.id === 'primary-model' ? 'settings-model-options' : undefined}
                onChange={(event) => {
                  const nextValue = event.target.value
                  setDraftValues((prev) => ({
                    ...prev,
                    [setting.id]: nextValue,
                  }))
                }}
                onBlur={() => {
                  void commit(draftValue)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void commit(draftValue)
                  }
                }}
              />
              {setting.id === 'primary-model' ? (
                <datalist id="settings-model-options">
                  {modelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </datalist>
              ) : null}
            </>
          ) : null}

          {setting.kind === 'number' ? (
            <Input
              type="number"
              value={draftValue}
              disabled={disabled}
              min={setting.min}
              step={setting.step}
              placeholder={setting.placeholder}
              onChange={(event) => {
                const nextValue = event.target.value
                setDraftValues((prev) => ({
                  ...prev,
                  [setting.id]: nextValue,
                }))
              }}
              onBlur={() => {
                void commit(draftValue)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void commit(draftValue)
                }
              }}
            />
          ) : null}

          {setting.kind === 'multiline' ? (
            <textarea
              className="min-h-[88px] w-full rounded-lg border border-primary-200 bg-surface px-3 py-2 text-sm text-primary-900 outline-none placeholder:text-primary-500"
              value={draftValue}
              disabled={disabled}
              rows={setting.rows ?? 4}
              placeholder={setting.placeholder}
              onChange={(event) => {
                const nextValue = event.target.value
                setDraftValues((prev) => ({
                  ...prev,
                  [setting.id]: nextValue,
                }))
              }}
              onBlur={() => {
                void commit(draftValue)
              }}
            />
          ) : null}
        </div>
      </div>
    </article>
  )
}

const HERMES_API_URL_LOCAL = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'

const LOCAL_PROVIDERS = [
  { id: 'ollama', label: 'Ollama', defaultUrl: 'http://localhost:11434/v1' },
  { id: 'lmstudio', label: 'LM Studio', defaultUrl: 'http://localhost:1234/v1' },
  { id: 'mlx', label: 'MLX (apple-mlx)', defaultUrl: 'http://localhost:8080/v1' },
  { id: 'custom', label: 'Custom OpenAI-compatible', defaultUrl: '' },
]
const CLOUD_PROVIDERS = ['anthropic', 'openai', 'openai-codex', 'nous', 'openrouter']

function ActiveModelCard() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const configQuery = useQuery({
    queryKey: ['hermes', 'active-config'],
    queryFn: async () => {
      const res = await fetch(`${HERMES_API_URL_LOCAL}/api/config`)
      if (!res.ok) throw new Error('Failed to load config')
      return res.json() as Promise<{ model: string; provider?: string; base_url?: string }>
    },
  })

  const cfg = configQuery.data
  const isLocal = LOCAL_PROVIDERS.some(p => p.id === (cfg?.provider ?? provider))

  function startEdit() {
    setModel(cfg?.model ?? '')
    setProvider(cfg?.provider ?? '')
    setBaseUrl(cfg?.base_url ?? '')
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`${HERMES_API_URL_LOCAL}/api/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.trim() || undefined,
          provider: provider.trim() || undefined,
          base_url: baseUrl.trim() || '',
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      await queryClient.invalidateQueries({ queryKey: ['hermes', 'active-config'] })
      toast('Model config saved — takes effect on next message', { type: 'success' })
      setEditing(false)
    } catch (e) {
      toast(`Failed to save: ${e instanceof Error ? e.message : String(e)}`, { type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const selectedLocal = LOCAL_PROVIDERS.find(p => p.id === provider)

  return (
    <section className="rounded-2xl border border-primary-200 bg-primary-50/80 p-4 shadow-sm md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-primary-900">Active Model</h3>
          <p className="mt-0.5 text-xs text-primary-600">
            Reads and writes directly to <code className="font-mono">~/.hermes/config.yaml</code>
          </p>
        </div>
        {!editing && (
          <Button size="sm" variant="outline" onClick={startEdit}>Edit</Button>
        )}
      </div>

      {configQuery.isPending ? (
        <p className="text-sm text-primary-500">Loading...</p>
      ) : configQuery.error ? (
        <p className="text-sm text-red-500">Could not load config — is Hermes Agent running?</p>
      ) : !editing ? (
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-primary-500">Model</span>
            <p className="font-mono font-medium text-primary-900">{cfg?.model || '—'}</p>
          </div>
          <div>
            <span className="text-primary-500">Provider</span>
            <p className="font-medium text-primary-900">{cfg?.provider || '—'}</p>
          </div>
          {cfg?.base_url && (
            <div>
              <span className="text-primary-500">Base URL</span>
              <p className="font-mono text-primary-700">{cfg.base_url}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Provider selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-primary-700">Provider</label>
            <div className="flex flex-wrap gap-2">
              {[...CLOUD_PROVIDERS, ...LOCAL_PROVIDERS.map(p => p.id)].map(pid => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => {
                    setProvider(pid)
                    const lp = LOCAL_PROVIDERS.find(p => p.id === pid)
                    if (lp && !baseUrl) setBaseUrl(lp.defaultUrl)
                    if (!lp) setBaseUrl('')
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                    provider === pid
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-primary-200 bg-white text-primary-600 hover:border-primary-300',
                  )}
                >
                  {LOCAL_PROVIDERS.find(p => p.id === pid)?.label ?? pid}
                </button>
              ))}
            </div>
          </div>

          {/* Base URL — only for local providers */}
          {isLocal && (
            <div>
              <label className="mb-1 block text-xs font-medium text-primary-700">
                Base URL <span className="text-primary-400">(OpenAI-compatible endpoint)</span>
              </label>
              <Input
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder={selectedLocal?.defaultUrl ?? 'http://localhost:11434/v1'}
                className="font-mono text-sm"
              />
            </div>
          )}

          {/* Model name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-primary-700">Model name</label>
            <Input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder={isLocal ? 'qwen2.5:35b, llama3.2, etc.' : 'claude-sonnet-4-5'}
              className="font-mono text-sm"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  )
}

function ProviderManagementSection(props: {
  embedded: boolean
  providerSummaries: Array<ProviderSummary>
  modelsQuery: ReturnType<typeof useQuery<{ ok?: boolean; models?: Array<ModelCatalogEntry>; configuredProviders?: Array<string> }>>
  deletingId: string | null
  onAddProvider: () => void
  onEdit: (provider: ProviderSummary) => void
  onDelete: (provider: ProviderSummary) => void
}) {
  const {
    embedded,
    providerSummaries,
    modelsQuery,
    deletingId,
    onAddProvider,
    onEdit,
    onDelete,
  } = props

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-primary-900">
            Provider Setup
          </h2>
          <p className="text-sm text-primary-600">
            View configured providers and walk through safe setup instructions
            for new providers.
          </p>
        </div>
        <Button size="sm" onClick={onAddProvider}>
          <HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={1.5} />
          Add Provider
        </Button>
      </header>

      <section className="rounded-2xl border border-primary-200 bg-primary-50/80 p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-medium text-primary-900">
              Configured Providers
            </h3>
            <p className="mt-1 text-xs text-primary-600">
              API keys stay in your local Hermes config and are never sent to Studio.
            </p>
          </div>
          <p className="text-xs text-primary-600 tabular-nums">
            {providerSummaries.length} provider
            {providerSummaries.length === 1 ? '' : 's'}
          </p>
        </div>

        {modelsQuery.isPending ? (
          <p className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-primary-600">
            Loading providers from Hermes...
          </p>
        ) : null}

        {modelsQuery.error ? (
          <div className="rounded-xl border border-primary-200 bg-white px-4 py-3">
            <p className="mb-2 text-sm text-primary-700">
              Unable to load providers right now. Check your Hermes connection.
            </p>
            <Button variant="outline" size="sm" onClick={() => modelsQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}

        {!modelsQuery.isPending &&
        !modelsQuery.error &&
        providerSummaries.length === 0 ? (
          <div className="rounded-xl border border-primary-200 bg-white px-4 py-4">
            <p className="text-sm text-primary-700">
              No providers are configured yet. Use Add Provider to open setup
              instructions.
            </p>
          </div>
        ) : null}

        {providerSummaries.length > 0 ? (
          <div className={cn('grid gap-3', embedded ? '' : 'md:grid-cols-2')}>
            {providerSummaries.map(function mapProvider(provider) {
              const isDeleting = deletingId === provider.id

              return (
                <article
                  key={provider.id}
                  className="rounded-2xl border border-primary-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="inline-flex size-9 items-center justify-center rounded-xl border border-primary-200 bg-primary-100/70">
                        <ProviderIcon providerId={provider.id} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium text-primary-900">
                          {provider.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-primary-600 line-clamp-2">
                          {provider.description}
                        </p>
                      </div>
                    </div>
                    <ProviderStatusBadge status={provider.status} />
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-2.5 py-2">
                    <span className="text-xs text-primary-600">
                      Available models
                    </span>
                    <span className="text-sm font-medium text-primary-900 tabular-nums">
                      {provider.modelCount}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={function onProviderEdit() {
                        onEdit(provider)
                      }}
                      disabled={isDeleting}
                      aria-label={`Edit ${provider.name}`}
                    >
                      <HugeiconsIcon
                        icon={Edit01Icon}
                        size={14}
                        strokeWidth={1.5}
                      />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={function onProviderDelete() {
                        onDelete(provider)
                      }}
                      disabled={isDeleting}
                      aria-label={`Delete ${provider.name}`}
                    >
                      <HugeiconsIcon
                        icon={Delete02Icon}
                        size={14}
                        strokeWidth={1.5}
                      />
                      {isDeleting ? 'Removing…' : 'Delete'}
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>
    </div>
  )
}

export function ProvidersScreen({ embedded = false }: ProvidersScreenProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<SettingsTabId>('providers')
  const [search, setSearch] = useState('')
  const [draftValues, setDraftValues] = useState<Record<string, string>>({})
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingProvider, setEditingProvider] =
    useState<ProviderSummaryForEdit | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const modelsQuery = useQuery({
    queryKey: ['hermes', 'providers', 'models'],
    queryFn: fetchModels,
    refetchInterval: 60_000,
    retry: false,
  })

  const configQuery = useQuery({
    queryKey: ['hermes', 'config'],
    queryFn: async () => {
      const response = await fetch('/api/config-get')
      const payload = (await response.json().catch(() => ({}))) as ConfigQueryResponse
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `HTTP ${response.status}`)
      }
      return (payload.payload ?? {}) as HermesConfig
    },
    retry: 1,
  })

  const saveMutation = useMutation({
    mutationFn: async ({ path, value }: SaveSettingPayload) => {
      const response = await fetch('/api/config-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, value }),
      })
      const payload = (await response.json().catch(() => ({}))) as ConfigPatchResponse
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `HTTP ${response.status}`)
      }
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['hermes', 'config'] })
      toast(`${variables.label} saved`, { type: 'success' })
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to save setting', {
        type: 'error',
      })
    },
  })

  const providerSummaries = useMemo(
    function resolveProviderSummaries() {
      return buildProviderSummaries({
        models: Array.isArray(modelsQuery.data?.models)
          ? modelsQuery.data.models
          : [],
        configuredProviders: Array.isArray(
          modelsQuery.data?.configuredProviders,
        )
          ? modelsQuery.data.configuredProviders
          : [],
      })
    },
    [modelsQuery.data?.configuredProviders, modelsQuery.data?.models],
  )

  const modelOptions = useMemo(
    function resolveModelOptions() {
      return buildModelOptions(
        Array.isArray(modelsQuery.data?.models) ? modelsQuery.data.models : [],
      )
    },
    [modelsQuery.data?.models],
  )

  const searchQuery = search.trim().toLowerCase()

  const filteredSettings = useMemo(
    function filterSettings() {
      if (!searchQuery) return SETTINGS
      return SETTINGS.filter((setting) => searchMatchesSetting(setting, searchQuery))
    },
    [searchQuery],
  )

  const settingsByTab = useMemo(
    function groupSettingsByTab() {
      return TAB_ORDER.reduce<Record<SettingsTabId, Array<SettingDefinition>>>(
        (accumulator, tab) => {
          accumulator[tab.id] = filteredSettings.filter(
            (setting) => setting.tab === tab.id,
          )
          return accumulator
        },
        {
          providers: [],
          models: [],
          agents: [],
          session: [],
          memory: [],
        },
      )
    },
    [filteredSettings],
  )

  function handleEdit(provider: ProviderSummary) {
    setEditingProvider({ id: provider.id, name: provider.name })
    setWizardOpen(true)
  }

  async function handleDelete(provider: ProviderSummary) {
    const confirmed = window.confirm(
      `Remove provider "${provider.name}"? This will delete the API key from your local config.`,
    )
    if (!confirmed) return

    setDeletingId(provider.id)
    try {
      const res = await fetch('/api/hermes-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'remove-provider',
          provider: provider.id,
        }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      if (!data.ok) {
        toast(`Failed to remove provider: ${data.error ?? 'Unknown error'}`, {
          type: 'error',
        })
      } else {
        await queryClient.invalidateQueries({
          queryKey: ['hermes', 'providers', 'models'],
        })
        toast(`Provider "${provider.name}" removed`, { type: 'success' })
      }
    } catch {
      toast('Network error — could not remove provider.', { type: 'error' })
    } finally {
      setDeletingId(null)
    }
  }

  async function saveSetting(payload: SaveSettingPayload) {
    await saveMutation.mutateAsync(payload)
  }

  function handleWizardOpenChange(open: boolean) {
    setWizardOpen(open)
    if (!open) {
      setEditingProvider(null)
    }
  }

  const totalSearchMatches = filteredSettings.length

  return (
    <div className={cn(embedded ? 'h-full bg-primary-50' : 'min-h-full bg-surface')}>
      <main
        className={cn(
          'min-h-full px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8',
          embedded && 'px-4 pb-6 pt-4 md:px-6 md:pb-6 md:pt-4',
        )}
      >
        <section className="mx-auto w-full max-w-[1480px] space-y-5">
          <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm">
            <div className="space-y-1">
              <h1 className="hidden md:block text-lg font-semibold text-primary-900">
                Settings
              </h1>
              <p className="text-sm text-primary-600">
                Configure providers plus Hermes agent defaults in one place.
              </p>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <label className="relative w-full md:max-w-md">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary-500">
                  <HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={1.8} />
                </span>
                <Input
                  value={search}
                  type="search"
                  placeholder="Search settings, paths, or descriptions"
                  className="pl-10"
                  onChange={(event) => {
                    setSearch(event.target.value)
                  }}
                />
              </label>

              <div className="text-sm text-primary-600">
                {searchQuery
                  ? `${totalSearchMatches} matching setting${totalSearchMatches === 1 ? '' : 's'}`
                  : `${SETTINGS.length} configurable defaults`}
              </div>
            </div>
          </header>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTabId)}>
            <TabsList
              variant="underline"
              className="w-full flex-nowrap overflow-x-auto justify-start gap-2 rounded-xl border border-primary-200 bg-white px-3 py-2"
            >
              {TAB_ORDER.map((tab) => {
                const count =
                  tab.id === 'providers'
                    ? providerSummaries.length
                    : settingsByTab[tab.id].length
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="rounded-lg px-3 py-2 text-sm"
                  >
                    {tab.label}
                    <span className="ml-1 rounded-full bg-primary-100 px-1.5 py-0.5 text-[11px] text-primary-700">
                      {count}
                    </span>
                  </TabsTrigger>
                )
              })}
            </TabsList>

            <TabsContent value="providers" className="space-y-5">
              <ActiveModelCard />
              <ProviderManagementSection
                embedded={embedded}
                providerSummaries={providerSummaries}
                modelsQuery={modelsQuery}
                deletingId={deletingId}
                onAddProvider={() => {
                  setEditingProvider(null)
                  setWizardOpen(true)
                }}
                onEdit={handleEdit}
                onDelete={(provider) => {
                  void handleDelete(provider)
                }}
              />
            </TabsContent>

            {TAB_ORDER.filter((tab) => tab.id !== 'providers').map((tab) => {
              const items = settingsByTab[tab.id]
              return (
                <TabsContent key={tab.id} value={tab.id} className="space-y-4">
                  {configQuery.isPending ? (
                    <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-600">
                      Loading current configuration...
                    </div>
                  ) : null}

                  {configQuery.error ? (
                    <div className="rounded-xl border border-primary-200 bg-white px-4 py-3">
                      <p className="text-sm text-primary-700">
                        Unable to load configuration right now.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => configQuery.refetch()}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : null}

                  {!configQuery.isPending && !configQuery.error && items.length === 0 ? (
                    <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-4 text-sm text-primary-600">
                      No settings in this tab match your current search.
                    </div>
                  ) : null}

                  {!configQuery.isPending && !configQuery.error
                    ? items.map((setting) => (
                        <SettingCard
                          key={setting.id}
                          setting={setting}
                          config={configQuery.data}
                          draftValues={draftValues}
                          setDraftValues={setDraftValues}
                          saveSetting={saveSetting}
                          isSaving={saveMutation.isPending}
                          savePath={saveMutation.variables?.path ?? null}
                          modelOptions={modelOptions}
                        />
                      ))
                    : null}
                </TabsContent>
              )
            })}
          </Tabs>
        </section>
      </main>

      <ProviderWizard
        open={wizardOpen}
        onOpenChange={handleWizardOpenChange}
        editProvider={editingProvider}
      />
    </div>
  )
}
