import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

interface ModelEntry {
  id: string
  provider: string
  account: string
  model: string
  transport: string
  billingClass: string
  status: string
  selectable: boolean
  warning: string
  resetAt: string | null
}

interface TransportEntry {
  id: string
  label: string
  authenticated: boolean
  status: string
  warning?: string
}

interface NamedWorker {
  id: string
  name: string
  modelRef: string
  role: 'leaf' | 'orchestrator'
  description: string
}

interface SwarmWorker {
  id: string
  name: string
  role: string
  model: string
}

export const OAUTH_ROLE_ASSIGNMENT_SURFACES = [
  'current-chat',
  'orchestrator',
  'default-subagent',
  'named-worker',
  'fallback',
  'swarm-role',
] as const

interface Policy {
  orchestratorModelRef: string
  defaultSubagentModelRef: string
  routingMode: 'explicit' | 'automatic' | 'hybrid'
  limits: {
    preset: 'conservative' | 'balanced' | 'high_parallelism' | 'custom'
    maxConcurrentChildren: number
    maxConcurrentPerAccount: number
    maxSpawnDepth: number
    maxTotalAgents: number
  }
  quota: {
    interactive:
      | 'offer_alternative'
      | 'subscription_fallback'
      | 'stop_notify'
      | 'wait_reset'
    unattended: 'subscription_fallback' | 'stop_notify' | 'wait_reset'
    fallbackModelRefs: Array<string>
  }
  billing: { allowApiBilledModels: boolean; showNousModels: boolean }
  memory: {
    childAccess: 'shared_read_write' | 'shared_read_only' | 'context_only'
    childWriteReview: 'parent_queue' | 'normal_policy' | 'automatic'
  }
  context: {
    preferred: 'full' | 'summary_recent' | 'focused' | 'explicit_only'
    overflow:
      | 'auto_compact_notify'
      | 'ask'
      | 'larger_model'
      | 'recent_window'
      | 'cancel'
    recentMessages: number
    maxInputPercent: number
  }
  namedWorkers: Array<NamedWorker>
}

const selectClass =
  'w-full rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-900 outline-none'
const cardClass = 'rounded-xl border border-primary-200 bg-primary-100/40 p-4'

function titleCase(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function claudeModelLabel(model: string): string {
  const match = model.match(
    /^(claude-)?(opus|sonnet|haiku|fable)(?:-(\d+(?:-\d+)*))?$/i,
  )
  if (!match) return titleCase(model)
  const family = titleCase(match[2])
  const version = match.at(3)?.replaceAll('-', '.') || ''
  return `${match[1] ? 'Claude ' : ''}${family}${version ? ` ${version}` : ''}`
}

function geminiModelLabel(model: string): string {
  const match = model.match(
    /^gemini-(\d+(?:\.\d+)+)-(.+?)(?:-(high|medium|low))?$/i,
  )
  if (!match) return titleCase(model)
  const effort = match[3] ? ` (${titleCase(match[3])})` : ''
  return `Gemini ${match[1]} ${titleCase(match[2])}${effort}`
}

export function modelLabel(model: ModelEntry): string {
  const status =
    model.status === 'available'
      ? ''
      : ` · ${model.status.replaceAll('_', ' ')}`
  if (model.provider === 'claude-max-relay') {
    const account =
      model.account.toLowerCase() === 'cwm4tx'
        ? 'CWM'
        : model.account.toLowerCase() === 'gp'
          ? 'GP'
          : model.account.toUpperCase()
    return `Claude Max ${account} · ${claudeModelLabel(model.model)}${status}`
  }
  if (model.provider === 'google-antigravity') {
    return `Antigravity · ${geminiModelLabel(model.model)}${status}`
  }
  return `${model.id}${status}`
}

function ModelSelect({
  value,
  onChange,
  models,
  inheritLabel,
}: {
  value: string
  onChange: (value: string) => void
  models: Array<ModelEntry>
  inheritLabel: string
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={selectClass}
    >
      <option value="">{inheritLabel}</option>
      {value && !models.some((model) => model.id === value) ? (
        <option value={value}>{value} · current legacy assignment</option>
      ) : null}
      {models.map((model) => (
        <option key={model.id} value={model.id} disabled={!model.selectable}>
          {modelLabel(model)}
        </option>
      ))}
    </select>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-primary-900">{label}</span>
      {hint ? (
        <span className="block text-xs text-primary-600">{hint}</span>
      ) : null}
      {children}
    </label>
  )
}

export function OrchestrationSettings() {
  const [scope, setScope] = useState<'global' | 'session'>('global')
  const [sessionKey, setSessionKey] = useState('')
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [models, setModels] = useState<Array<ModelEntry>>([])
  const [transports, setTransports] = useState<Array<TransportEntry>>([])
  const [swarmWorkers, setSwarmWorkers] = useState<Array<SwarmWorker>>([])
  const [dirtySwarmWorkers, setDirtySwarmWorkers] = useState<Set<string>>(
    new Set(),
  )
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmApiBilling, setConfirmApiBilling] = useState(false)

  const selectedWarnings = useMemo(() => {
    const refs = new Set([
      policy?.orchestratorModelRef,
      policy?.defaultSubagentModelRef,
      ...(policy?.quota.fallbackModelRefs || []),
    ])
    return models.filter(
      (model) => refs.has(model.id) && model.status !== 'available',
    )
  }, [models, policy])

  async function loadPolicy(nextScope = scope, nextSessionKey = sessionKey) {
    const query =
      nextScope === 'session' && nextSessionKey.trim()
        ? `?sessionKey=${encodeURIComponent(nextSessionKey.trim())}`
        : ''
    const response = await fetch(`/api/orchestration-policy${query}`)
    if (!response.ok)
      throw new Error(`Policy request failed (${response.status})`)
    const payload = (await response.json()) as {
      global: Policy
      effective: Policy
    }
    setPolicy(nextScope === 'session' ? payload.effective : payload.global)
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      fetch('/api/orchestration-policy').then((response) => response.json()),
      fetch('/api/orchestration-catalog').then((response) => response.json()),
      fetch('/api/swarm-roster').then((response) => response.json()),
    ])
      .then(([policyPayload, catalogPayload, rosterPayload]) => {
        if (cancelled) return
        setPolicy(policyPayload.global)
        setModels(
          Array.isArray(catalogPayload.models) ? catalogPayload.models : [],
        )
        setTransports(
          Array.isArray(catalogPayload.transports)
            ? catalogPayload.transports
            : [],
        )
        setSwarmWorkers(
          Array.isArray(rosterPayload.roster?.workers)
            ? rosterPayload.roster.workers
            : [],
        )
      })
      .catch((error) => {
        if (!cancelled)
          setMessage(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function changeScope(nextScope: 'global' | 'session') {
    setScope(nextScope)
    setMessage('')
    if (nextScope === 'global' || sessionKey.trim()) {
      try {
        await loadPolicy(nextScope, sessionKey)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
      }
    }
  }

  async function save() {
    if (!policy) return
    if (scope === 'session' && !sessionKey.trim()) {
      setMessage('Enter a session key before saving a session override.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/orchestration-policy', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scope,
          sessionKey: scope === 'session' ? sessionKey.trim() : undefined,
          patch: policy,
          confirmApiBilling,
        }),
      })
      const payload = await response.json()
      if (!response.ok)
        throw new Error(payload.error || `Save failed (${response.status})`)
      setPolicy(payload.policy)
      setMessage(
        scope === 'global'
          ? 'Global orchestration defaults saved.'
          : 'Session orchestration override saved.',
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  function update<TKey extends keyof Policy>(key: TKey, value: Policy[TKey]) {
    setPolicy((current) => (current ? { ...current, [key]: value } : current))
  }

  function updateSwarmWorkerModel(id: string, model: string) {
    setSwarmWorkers((current) =>
      current.map((worker) =>
        worker.id === id ? { ...worker, model } : worker,
      ),
    )
    setDirtySwarmWorkers((current) => new Set(current).add(id))
  }

  async function saveSwarmAssignments() {
    if (dirtySwarmWorkers.size === 0) return
    setBusy(true)
    setMessage('')
    try {
      for (const worker of swarmWorkers.filter((entry) =>
        dirtySwarmWorkers.has(entry.id),
      )) {
        const response = await fetch('/api/swarm-roster', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: worker.id, modelRef: worker.model }),
        })
        const payload = await response.json()
        if (!response.ok)
          throw new Error(
            payload.error || `Failed to update ${worker.name || worker.id}`,
          )
      }
      setDirtySwarmWorkers(new Set())
      setMessage(
        'Swarm OAuth role assignments saved. They apply on each worker’s next start.',
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  if (!policy)
    return (
      <p className="text-sm text-primary-600">
        Loading orchestration settings…
      </p>
    )

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Configuration scope"
            hint="Global defaults initialize new sessions; session overrides do not rewrite other sessions."
          >
            <select
              value={scope}
              onChange={(event) =>
                void changeScope(event.target.value as 'global' | 'session')
              }
              className={selectClass}
            >
              <option value="global">Global defaults</option>
              <option value="session">Per-session override</option>
            </select>
          </Field>
          {scope === 'session' ? (
            <Field label="Session key">
              <div className="flex gap-2">
                <Input
                  value={sessionKey}
                  onChange={(event) => setSessionKey(event.target.value)}
                  placeholder="main or session id"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadPolicy('session', sessionKey)}
                >
                  Load
                </Button>
              </div>
            </Field>
          ) : null}
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="mb-3 text-sm font-semibold text-primary-900">
          Models and routing
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Orchestrator"
            hint="Any authenticated subscription route; blank inherits the current Hermes default."
          >
            <ModelSelect
              value={policy.orchestratorModelRef}
              onChange={(value) => update('orchestratorModelRef', value)}
              models={models}
              inheritLabel="Use Hermes default"
            />
          </Field>
          <Field
            label="Default subagent"
            hint="Can be overridden by a named worker or explicit delegation model."
          >
            <ModelSelect
              value={policy.defaultSubagentModelRef}
              onChange={(value) => update('defaultSubagentModelRef', value)}
              models={models}
              inheritLabel="Inherit orchestrator"
            />
          </Field>
          <Field label="Routing mode">
            <select
              value={policy.routingMode}
              onChange={(event) =>
                update(
                  'routingMode',
                  event.target.value as Policy['routingMode'],
                )
              }
              className={selectClass}
            >
              <option value="explicit">Explicit</option>
              <option value="automatic">Automatic</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </Field>
          <Field label="Interactive limit behavior">
            <select
              value={policy.quota.interactive}
              onChange={(event) =>
                update('quota', {
                  ...policy.quota,
                  interactive: event.target
                    .value as Policy['quota']['interactive'],
                })
              }
              className={selectClass}
            >
              <option value="offer_alternative">
                Notify and offer alternatives
              </option>
              <option value="subscription_fallback">
                Use configured subscription fallback
              </option>
              <option value="stop_notify">Stop and notify</option>
              <option value="wait_reset">Wait for known reset</option>
            </select>
          </Field>
          <Field label="Unattended limit behavior">
            <select
              value={policy.quota.unattended}
              onChange={(event) =>
                update('quota', {
                  ...policy.quota,
                  unattended: event.target
                    .value as Policy['quota']['unattended'],
                })
              }
              className={selectClass}
            >
              <option value="subscription_fallback">
                Use configured subscription fallback
              </option>
              <option value="stop_notify">Stop and notify</option>
              <option value="wait_reset">Wait for known reset</option>
            </select>
          </Field>
          <Field label="Subscription fallback">
            <ModelSelect
              value={policy.quota.fallbackModelRefs[0] || ''}
              onChange={(value) =>
                update('quota', {
                  ...policy.quota,
                  fallbackModelRefs: value ? [value] : [],
                })
              }
              models={models.filter(
                (model) => model.billingClass !== 'api_billed',
              )}
              inheritLabel="No configured fallback"
            />
          </Field>
        </div>
        {selectedWarnings.map((model) => (
          <div
            key={model.id}
            className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
          >
            <strong>{model.id}</strong>:{' '}
            {model.warning || model.status.replaceAll('_', ' ')}
            {model.resetAt
              ? ` Reset: ${new Date(model.resetAt).toLocaleString()}`
              : ''}
          </div>
        ))}
      </div>

      <div className={cardClass}>
        <h3 className="mb-3 text-sm font-semibold text-primary-900">
          Delegation limits
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Preset">
            <select
              value={policy.limits.preset}
              onChange={(event) =>
                update('limits', {
                  ...policy.limits,
                  preset: event.target.value as Policy['limits']['preset'],
                })
              }
              className={selectClass}
            >
              <option value="conservative">Conservative</option>
              <option value="balanced">Balanced</option>
              <option value="high_parallelism">High parallelism</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          {(
            [
              ['maxConcurrentChildren', 'Concurrent children'],
              ['maxConcurrentPerAccount', 'Per account'],
              ['maxSpawnDepth', 'Spawn depth'],
              ['maxTotalAgents', 'Total agents'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                type="number"
                min={1}
                value={policy.limits[key]}
                onChange={(event) =>
                  update('limits', {
                    ...policy.limits,
                    preset: 'custom',
                    [key]: Number(event.target.value),
                  })
                }
              />
            </Field>
          ))}
        </div>
        <p className="mt-2 text-xs text-primary-600">
          Balanced starts at three children globally, one active request per
          OAuth account, depth two, and eight total agents. Excess work is
          queued rather than burst.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cardClass}>
          <h3 className="mb-3 text-sm font-semibold text-primary-900">
            Memory
          </h3>
          <div className="space-y-3">
            <Field label="Child memory access">
              <select
                value={policy.memory.childAccess}
                onChange={(event) =>
                  update('memory', {
                    ...policy.memory,
                    childAccess: event.target
                      .value as Policy['memory']['childAccess'],
                  })
                }
                className={selectClass}
              >
                <option value="shared_read_write">Shared read/write</option>
                <option value="shared_read_only">Shared read-only</option>
                <option value="context_only">Explicit context only</option>
              </select>
            </Field>
            <Field label="Child write review">
              <select
                value={policy.memory.childWriteReview}
                onChange={(event) =>
                  update('memory', {
                    ...policy.memory,
                    childWriteReview: event.target
                      .value as Policy['memory']['childWriteReview'],
                  })
                }
                className={selectClass}
              >
                <option value="parent_queue">Parent review queue</option>
                <option value="normal_policy">Normal Hermes policy</option>
                <option value="automatic">Automatic</option>
              </select>
            </Field>
          </div>
        </div>
        <div className={cardClass}>
          <h3 className="mb-3 text-sm font-semibold text-primary-900">
            Conversation context
          </h3>
          <div className="space-y-3">
            <Field label="Preferred handoff">
              <select
                value={policy.context.preferred}
                onChange={(event) =>
                  update('context', {
                    ...policy.context,
                    preferred: event.target
                      .value as Policy['context']['preferred'],
                  })
                }
                className={selectClass}
              >
                <option value="full">Full conversation</option>
                <option value="summary_recent">Summary + recent turns</option>
                <option value="focused">Focused context</option>
                <option value="explicit_only">Explicit context only</option>
              </select>
            </Field>
            <Field label="If context does not fit">
              <select
                value={policy.context.overflow}
                onChange={(event) =>
                  update('context', {
                    ...policy.context,
                    overflow: event.target
                      .value as Policy['context']['overflow'],
                  })
                }
                className={selectClass}
              >
                <option value="auto_compact_notify">
                  Auto-compact and notify
                </option>
                <option value="ask">Ask before compacting</option>
                <option value="larger_model">Offer larger-context model</option>
                <option value="recent_window">Use recent window</option>
                <option value="cancel">Cancel delegation</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Recent messages">
                <Input
                  type="number"
                  min={1}
                  value={policy.context.recentMessages}
                  onChange={(event) =>
                    update('context', {
                      ...policy.context,
                      recentMessages: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Max input %">
                <Input
                  type="number"
                  min={30}
                  max={90}
                  value={policy.context.maxInputPercent}
                  onChange={(event) =>
                    update('context', {
                      ...policy.context,
                      maxInputPercent: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-primary-900">
              Named workers
            </h3>
            <p className="text-xs text-primary-600">
              Optional reusable presets; raw model selection remains available.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              update('namedWorkers', [
                ...policy.namedWorkers,
                {
                  id: `worker-${Date.now()}`,
                  name: 'New worker',
                  modelRef: policy.defaultSubagentModelRef,
                  role: 'leaf',
                  description: '',
                },
              ])
            }
          >
            Add worker
          </Button>
        </div>
        <div className="space-y-3">
          {policy.namedWorkers.length === 0 ? (
            <p className="text-xs text-primary-600">
              No named workers configured.
            </p>
          ) : null}
          {policy.namedWorkers.map((worker, index) => (
            <div
              key={worker.id}
              className="grid gap-2 rounded-lg border border-primary-200 p-3 md:grid-cols-[1fr_1.5fr_0.7fr_auto]"
            >
              <Input
                value={worker.name}
                aria-label="Worker name"
                onChange={(event) =>
                  update(
                    'namedWorkers',
                    policy.namedWorkers.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <ModelSelect
                value={worker.modelRef}
                onChange={(value) =>
                  update(
                    'namedWorkers',
                    policy.namedWorkers.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, modelRef: value } : item,
                    ),
                  )
                }
                models={models}
                inheritLabel="Use default subagent"
              />
              <select
                value={worker.role}
                onChange={(event) =>
                  update(
                    'namedWorkers',
                    policy.namedWorkers.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            role: event.target.value as NamedWorker['role'],
                          }
                        : item,
                    ),
                  )
                }
                className={selectClass}
              >
                <option value="leaf">Leaf</option>
                <option value="orchestrator">Orchestrator</option>
              </select>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  update(
                    'namedWorkers',
                    policy.namedWorkers.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className={cardClass}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-primary-900">
              Swarm role assignments
            </h3>
            <p className="text-xs text-primary-600">
              Assign any validated OAuth subscription route to any existing
              semantic Swarm role. Restart an active worker after changing its
              route; running TUI sessions do not hot-swap models.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy || dirtySwarmWorkers.size === 0}
            onClick={() => void saveSwarmAssignments()}
          >
            Apply role assignments
          </Button>
        </div>
        <div className="space-y-2">
          {swarmWorkers.map((worker) => (
            <div
              key={worker.id}
              className="grid gap-2 rounded-lg border border-primary-200 p-3 md:grid-cols-[1fr_1.7fr] md:items-center"
            >
              <div>
                <div className="text-sm font-medium text-primary-900">
                  {worker.name || worker.id}
                </div>
                <div className="text-xs text-primary-600">
                  {worker.role} · {worker.id}
                </div>
              </div>
              <ModelSelect
                value={worker.model}
                onChange={(value) => updateSwarmWorkerModel(worker.id, value)}
                models={models}
                inheritLabel="Keep current profile model"
              />
            </div>
          ))}
          {swarmWorkers.length === 0 ? (
            <p className="text-xs text-primary-600">
              No Swarm roles were discovered.
            </p>
          ) : null}
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="mb-2 text-sm font-semibold text-primary-900">
          Authenticated transports
        </h3>
        <div className="grid gap-2 md:grid-cols-2">
          {transports.map((transport) => (
            <div
              key={transport.id}
              className="rounded-lg border border-primary-200 px-3 py-2 text-xs"
            >
              <div className="flex justify-between gap-2">
                <strong>{transport.label}</strong>
                <span>{transport.status.replaceAll('_', ' ')}</span>
              </div>
              {transport.warning ? (
                <p className="mt-1 text-primary-600">{transport.warning}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <details className={cardClass}>
        <summary className="cursor-pointer text-sm font-semibold text-primary-900">
          Hidden model providers
        </summary>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-primary-900">Show Nous models</p>
            <p className="text-xs text-primary-600">
              Nous remains configured but is hidden from model selectors by
              default.
            </p>
          </div>
          <Switch
            checked={policy.billing.showNousModels}
            onCheckedChange={(checked) =>
              update('billing', {
                ...policy.billing,
                showNousModels: checked,
              })
            }
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-primary-900">Show API-billed models</p>
            <p className="text-xs text-primary-600">
              API providers remain configured but hidden by default. Unhiding
              allows explicit selection and may incur per-token charges.
            </p>
          </div>
          <Switch
            checked={policy.billing.allowApiBilledModels}
            onCheckedChange={(checked) => {
              update('billing', {
                ...policy.billing,
                allowApiBilledModels: checked,
              })
              setConfirmApiBilling(false)
            }}
          />
        </div>
        {policy.billing.allowApiBilledModels ? (
          <label className="mt-3 flex items-center gap-2 text-xs text-amber-700">
            <input
              type="checkbox"
              checked={confirmApiBilling}
              onChange={(event) => setConfirmApiBilling(event.target.checked)}
            />
            I explicitly understand this may incur API charges.
          </label>
        ) : null}
      </details>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-primary-600" role="status">
          {message}
        </p>
        <Button
          type="button"
          disabled={
            busy || (policy.billing.allowApiBilledModels && !confirmApiBilling)
          }
          onClick={() => void save()}
        >
          {busy ? 'Saving…' : 'Save orchestration settings'}
        </Button>
      </div>
    </div>
  )
}
