import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

export type OperationsCatalogCapabilities = {
  contextWindow: number | null
  maxInputTokens: number | null
  maxOutputTokens: number | null
  supportsReasoning: boolean
  supportsTools: boolean
  supportsVision: boolean
  supportsOutputTokenLimit: boolean
  reasoningEfforts: Array<string>
  metadataSource: string
}

export type OperationsCatalogModel = {
  id: string
  provider: string
  account: string
  model: string
  transport: string
  billingClass: 'subscription_included' | 'subscription_unknown' | 'api_billed'
  status: string
  selectable: boolean
  warning: string
  resetAt: string | null
  capabilities?: OperationsCatalogCapabilities
}

type ModelGroup = { label: string; models: Array<OperationsCatalogModel> }

export type OperationsCatalogVisibility = {
  showNous: boolean
  showApi: boolean
}

export type OperationsModelLifecycle =
  | 'latest_alias'
  | 'current_pinned'
  | 'previous_pinned'

export function operationsModelLifecycle(
  model: OperationsCatalogModel,
): OperationsModelLifecycle {
  const canonicalModel = (model.model.split('/').at(-1) ?? model.model).replace(
    /\.(?=\d)/g,
    '-',
  )
  if (
    model.provider === 'claude-max-relay' &&
    /^(?:fable|opus|sonnet|haiku)$/.test(canonicalModel)
  ) {
    return 'latest_alias'
  }
  if (/^claude-(?:fable|opus|sonnet)-5$/.test(canonicalModel)) {
    return 'current_pinned'
  }
  return /^claude-(?:fable|opus|sonnet|haiku)-\d/.test(canonicalModel)
    ? 'previous_pinned'
    : 'current_pinned'
}

export function buildOutputCapOptions(
  hardMaximum: number | null | undefined,
  configured?: number,
): Array<number> {
  if (!hardMaximum) return configured ? [configured] : []
  return Array.from(
    new Set(
      [4096, 8192, 16_384, 32_768, 65_536, 128_000, hardMaximum, configured]
        .filter((value): value is number => Boolean(value))
        .filter((value) => value <= hardMaximum),
    ),
  ).sort((a, b) => a - b)
}

function groupLabel(model: OperationsCatalogModel): string {
  if (model.provider === 'claude-max-relay') {
    if (model.account === 'cwm4tx') return 'Claude Max — CWM'
    if (model.account === 'gp') return 'Claude Max — GP'
    return `Claude Max — ${model.account}`
  }
  if (model.provider === 'openai-codex') return 'OpenAI Codex OAuth'
  if (model.provider === 'google-antigravity') return 'Antigravity — Gemini'
  if (model.provider === 'nous') return 'Nous — hidden provider'
  if (model.provider === 'legacy') return 'Legacy / unavailable'
  return `${model.provider} · ${model.account}`
}

function prettyModelName(model: string): string {
  return model
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part.toLowerCase() === 'gpt'
        ? 'GPT'
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' ')
}

export function operationsModelDisplayName(
  model: OperationsCatalogModel,
): string {
  const name = prettyModelName(model.model.split('/').at(-1) ?? model.model)
  if (model.provider === 'google-antigravity') return `Antigravity — ${name}`
  if (model.provider === 'openai-codex') return `OpenAI Codex — ${name}`
  if (model.provider === 'claude-max-relay') {
    const account =
      model.account === 'cwm4tx'
        ? 'CWM'
        : model.account === 'gp'
          ? 'GP'
          : model.account
    return `Claude Max — ${account} — ${name}`
  }
  return name
}

export function groupOperationsCatalogModels(
  input: Array<OperationsCatalogModel>,
  search: string,
  selectedRoute: string,
  showPreviousVersions = false,
  visibility: OperationsCatalogVisibility = {
    showNous: false,
    showApi: false,
  },
): Array<ModelGroup> {
  const selectedKnown = input.some((model) => model.id === selectedRoute)
  const legacy: Array<OperationsCatalogModel> =
    selectedRoute && !selectedKnown
      ? [
          {
            id: selectedRoute,
            provider: 'legacy',
            account: 'legacy',
            model: selectedRoute,
            transport: 'unknown',
            billingClass: 'subscription_unknown',
            status: 'unavailable',
            selectable: false,
            warning:
              'Legacy route is preserved until you deliberately select a replacement.',
            resetAt: null,
          },
        ]
      : []
  const query = search.trim().toLowerCase()
  const visible = [
    ...legacy,
    ...input.filter(
      (model) =>
        (model.id === selectedRoute ||
          (model.selectable &&
            (model.provider !== 'nous' || visibility.showNous) &&
            (model.billingClass !== 'api_billed' || visibility.showApi))) &&
        (showPreviousVersions ||
          model.id === selectedRoute ||
          operationsModelLifecycle(model) !== 'previous_pinned'),
    ),
  ].filter(
    (model) =>
      model.id === selectedRoute ||
      !query ||
      [
        model.id,
        model.provider,
        model.account,
        model.model,
        model.transport,
        operationsModelDisplayName(model),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
  )
  const groups = new Map<string, Array<OperationsCatalogModel>>()
  for (const model of visible) {
    const label = groupLabel(model)
    const rows = groups.get(label) ?? []
    rows.push(model)
    groups.set(label, rows)
  }
  const lifecycleRank: Record<OperationsModelLifecycle, number> = {
    latest_alias: 0,
    current_pinned: 1,
    previous_pinned: 2,
  }
  for (const rows of groups.values()) {
    rows.sort(
      (a, b) =>
        lifecycleRank[operationsModelLifecycle(a)] -
          lifecycleRank[operationsModelLifecycle(b)] ||
        a.model.localeCompare(b.model),
    )
  }
  return Array.from(groups, ([label, models]) => ({ label, models }))
}

async function fetchOperationsCatalog(): Promise<{
  models: Array<OperationsCatalogModel>
  visibility: OperationsCatalogVisibility
}> {
  const response = await fetch('/api/orchestration-catalog')
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
    models?: Array<OperationsCatalogModel>
    visibility?: {
      showNousModels?: boolean
      showApiBilledModels?: boolean
    }
  }
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `Catalog request failed (${response.status})`)
  }
  return {
    models: Array.isArray(body.models) ? body.models : [],
    visibility: {
      showNous: body.visibility?.showNousModels === true,
      showApi: body.visibility?.showApiBilledModels === true,
    },
  }
}

function tokens(value: number | null | undefined): string {
  return value
    ? new Intl.NumberFormat().format(value)
    : 'Not separately published'
}

function effortLabel(value: string): string {
  if (value === 'provider_default') return 'Provider default'
  if (value === 'xhigh') return 'XHigh'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function routeLabel(model: OperationsCatalogModel): string {
  const lifecycle = operationsModelLifecycle(model)
  const suffix =
    lifecycle === 'latest_alias'
      ? 'Latest alias'
      : lifecycle === 'previous_pinned'
        ? 'Previous · pinned'
        : model.provider === 'claude-max-relay'
          ? 'Current · pinned'
          : 'Pinned route'
  return `${operationsModelDisplayName(model)} · ${suffix} · ${model.status}`
}

export function OperationsModelConfig({
  routeRef,
  reasoningEffort,
  maxOutputTokens,
  codexRuntime = 'hermes_default',
  onRouteChange,
  onReasoningEffortChange,
  onMaxOutputTokensChange,
  onCodexRuntimeChange,
}: {
  routeRef: string
  reasoningEffort?: string
  maxOutputTokens?: number
  codexRuntime?: 'hermes_default' | 'codex_app_server'
  onRouteChange: (value: string) => void
  onReasoningEffortChange: (value: string | undefined) => void
  onMaxOutputTokensChange: (value: number | undefined) => void
  onCodexRuntimeChange?: (value: 'hermes_default' | 'codex_app_server') => void
}) {
  const [search, setSearch] = useState('')
  const [showPreviousVersions, setShowPreviousVersions] = useState(false)
  const catalog = useQuery({
    queryKey: ['operations', 'orchestration-catalog'],
    queryFn: fetchOperationsCatalog,
  })
  const models = catalog.data?.models ?? []
  const groups = useMemo(
    () =>
      groupOperationsCatalogModels(
        models,
        search,
        routeRef,
        showPreviousVersions,
        catalog.data?.visibility,
      ),
    [catalog.data?.visibility, models, routeRef, search, showPreviousVersions],
  )
  const selected = models.find((model) => model.id === routeRef)
  const capabilities = selected?.capabilities
  const outputOptions = buildOutputCapOptions(
    capabilities?.maxOutputTokens,
    maxOutputTokens,
  )
  const hasPreviousVersions = models.some(
    (model) => operationsModelLifecycle(model) === 'previous_pinned',
  )

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-[var(--theme-text)]">
          Search subscription models
        </span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Provider, account, family, or version…"
          className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
        />
      </label>
      {hasPreviousVersions ? (
        <label className="flex items-center gap-2 text-xs text-[var(--theme-muted-2)]">
          <input
            type="checkbox"
            checked={showPreviousVersions}
            onChange={(event) => setShowPreviousVersions(event.target.checked)}
          />
          Show previous pinned Claude versions
        </label>
      ) : null}
      <label className="block space-y-2">
        <span className="text-sm font-medium text-[var(--theme-text)]">
          Model route
        </span>
        <select
          value={routeRef}
          onChange={(event) => {
            onRouteChange(event.target.value)
            onReasoningEffortChange(undefined)
            onMaxOutputTokensChange(undefined)
          }}
          className="min-h-12 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
        >
          <option value="">Select a validated subscription route…</option>
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.models.map((model) => (
                <option
                  key={model.id}
                  value={model.id}
                  disabled={!model.selectable}
                >
                  {routeLabel(model)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {selected?.provider === 'openai-codex' ? (
        <label className="block space-y-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
          <span className="text-sm font-medium text-[var(--theme-text)]">Codex runtime</span>
          <select
            value={codexRuntime}
            onChange={(event) => onCodexRuntimeChange?.(event.target.value as 'hermes_default' | 'codex_app_server')}
            className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)]"
          >
            <option value="hermes_default">Hermes default — Hermes owns tools and the agent loop</option>
            <option value="codex_app_server">Codex app-server — native threads, approvals, steering, and interrupts</option>
          </select>
          <p className="text-xs text-[var(--theme-muted-2)]">
            Applies on the next session or worker restart; this does not hot-swap a running process.
          </p>
        </label>
      ) : null}

      {catalog.isLoading ? (
        <p className="text-xs text-[var(--theme-muted)]">
          Loading live OAuth catalog…
        </p>
      ) : null}
      {catalog.error ? (
        <p className="text-xs text-red-600">{catalog.error.message}</p>
      ) : null}
      {selected?.warning ? (
        <p className="text-xs text-amber-600">{selected.warning}</p>
      ) : null}
      {routeRef && !selected ? (
        <p className="text-xs text-amber-600">
          This legacy route is unavailable. It will be preserved unless you
          select a replacement.
        </p>
      ) : null}

      {selected ? (
        <div className="space-y-3 border-t border-[var(--theme-border)] pt-3">
          <div className="grid gap-2 text-xs text-[var(--theme-muted-2)] sm:grid-cols-3">
            <div>
              <span className="block text-[var(--theme-muted)]">
                Maximum prompt input
              </span>
              {tokens(capabilities?.maxInputTokens)}
            </div>
            <div>
              <span className="block text-[var(--theme-muted)]">
                Total context window
              </span>
              {tokens(capabilities?.contextWindow)}
            </div>
            <div>
              <span className="block text-[var(--theme-muted)]">
                Model metadata hard max output
              </span>
              {tokens(capabilities?.maxOutputTokens)}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-medium text-[var(--theme-text)]">
                Reasoning / thinking effort
              </span>
              <select
                value={reasoningEffort || 'provider_default'}
                onChange={(event) =>
                  onReasoningEffortChange(
                    event.target.value === 'provider_default'
                      ? undefined
                      : event.target.value,
                  )
                }
                disabled={!capabilities?.supportsReasoning}
                className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] disabled:opacity-50"
              >
                {(capabilities?.reasoningEfforts ?? ['provider_default']).map(
                  (value) => (
                    <option key={value} value={value}>
                      {effortLabel(value)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-[var(--theme-text)]">
                Optional agent output cap
              </span>
              <select
                value={maxOutputTokens ? String(maxOutputTokens) : ''}
                onChange={(event) =>
                  onMaxOutputTokensChange(
                    event.target.value ? Number(event.target.value) : undefined,
                  )
                }
                disabled={
                  !capabilities?.maxOutputTokens ||
                  !capabilities.supportsOutputTokenLimit
                }
                className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] disabled:opacity-50"
              >
                <option value="">
                  {capabilities?.supportsOutputTokenLimit
                    ? 'Use provider/model default (recommended)'
                    : 'Transport does not expose an output-token cap'}
                </option>
                {outputOptions.map((value) => (
                  <option key={value} value={value}>
                    {value === capabilities?.maxOutputTokens
                      ? `Hard maximum — ${tokens(value)}`
                      : `Cap at ${tokens(value)}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-[var(--theme-muted)]">
            The hard maximum is provider-published metadata for this selected
            model, not a recommended response size. Leave the optional cap at
            its default unless this agent needs a smaller bounded response.
          </p>
          <p className="text-xs text-[var(--theme-muted)]">
            Transport: {selected.transport} · Billing:{' '}
            {selected.billingClass.replaceAll('_', ' ')}
            {capabilities
              ? ` · Metadata: ${capabilities.metadataSource}`
              : ' · Limits not published'}
          </p>
        </div>
      ) : null}
    </div>
  )
}
