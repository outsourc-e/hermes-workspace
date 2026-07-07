import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  FlowCircleIcon,
  InformationCircleIcon,
  PlusSignIcon,
  Settings04Icon,
  ShieldKeyIcon,
  ToggleOffIcon,
  ToggleOnIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type * as React from 'react'
import type {
  HarpBlocklistEntry,
  HarpConfigView,
  HarpTier,
  HarpTierModel,
} from '@/server/harp-config-store'
import { cn } from '@/lib/utils'

type HarpApiResponse = { ok: boolean; error?: string } & Partial<HarpConfigView>

async function fetchHarpConfig(): Promise<HarpConfigView> {
  const res = await fetch('/api/harp-config')
  const data = (await res.json()) as HarpApiResponse
  if (!data.ok) throw new Error(data.error ?? 'Failed to load HARP config')
  return data as HarpConfigView
}

async function patchHarpConfig(patch: Record<string, unknown>): Promise<HarpConfigView> {
  const res = await fetch('/api/harp-config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const data = (await res.json()) as HarpApiResponse
  if (!data.ok) throw new Error(data.error ?? 'Failed to save')
  return data as HarpConfigView
}

// ── Small primitives ───────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  icon,
  children,
}: {
  title: string
  description?: string
  icon: React.ComponentProps<typeof HugeiconsIcon>['icon']
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-primary-200 bg-primary-50/80 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/60 md:p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-primary-100/70 dark:border-neutral-700 dark:bg-neutral-800">
          <HugeiconsIcon icon={icon} size={15} strokeWidth={1.8} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-primary-500 dark:text-neutral-400">{description}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
        checked
          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300'
          : 'bg-primary-100 text-primary-600 hover:bg-primary-200 dark:bg-neutral-800 dark:text-neutral-400',
      )}
      aria-pressed={checked}
    >
      <HugeiconsIcon
        icon={checked ? ToggleOnIcon : ToggleOffIcon}
        size={17}
        strokeWidth={1.6}
      />
      {label}
    </button>
  )
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    primary: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    fallback: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    claude_primary: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    claude_fast: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300',
    openrouter_paid: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
    paid_fallback: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300',
  }
  return (
    <span
      className={cn(
        'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
        colors[role] ?? 'bg-primary-100 text-primary-600 dark:bg-neutral-800 dark:text-neutral-400',
      )}
    >
      {role.replace(/_/g, ' ')}
    </span>
  )
}

// ── Tier model list ────────────────────────────────────────────────────────

function TierModelRow({
  model,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  model: HarpTierModel
  index: number
  total: number
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-surface px-3 py-2 text-sm dark:border-neutral-800">
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="rounded p-0.5 text-primary-400 hover:bg-primary-100 disabled:opacity-30 dark:hover:bg-neutral-800"
        >
          <HugeiconsIcon icon={ArrowUp01Icon} size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="rounded p-0.5 text-primary-400 hover:bg-primary-100 disabled:opacity-30 dark:hover:bg-neutral-800"
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={13} strokeWidth={2} />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-mono text-xs font-medium text-primary-900 dark:text-neutral-100">
            {model.model}
          </span>
          <RoleBadge role={model.role} />
          {model.provider && model.provider !== 'openrouter' && (
            <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] text-primary-600 dark:bg-neutral-800 dark:text-neutral-400">
              {model.provider}
            </span>
          )}
        </div>
        {model.notes && (
          <p className="mt-0.5 text-[11px] text-primary-400 dark:text-neutral-500">
            {model.notes}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="ml-1 rounded p-1 text-primary-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
      </button>
    </div>
  )
}

function AddModelForm({
  onAdd,
}: {
  onAdd: (model: HarpTierModel) => void
}) {
  const [open, setOpen] = useState(false)
  const [modelId, setModelId] = useState('')
  const [role, setRole] = useState('fallback')
  const [notes, setNotes] = useState('')
  const [provider, setProvider] = useState('')

  function submit() {
    if (!modelId.trim()) return
    onAdd({ model: modelId.trim(), role, notes: notes.trim() || undefined, provider: provider.trim() || undefined })
    setModelId('')
    setNotes('')
    setProvider('')
    setRole('fallback')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-primary-200 px-3 py-2 text-xs text-primary-400 transition-colors hover:border-accent-400 hover:text-accent-500 dark:border-neutral-700 dark:hover:border-accent-500"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
        Add model
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-xl border border-accent-200 bg-accent-50/40 p-3 dark:border-accent-800/40 dark:bg-accent-950/20">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder="provider/model-id"
          className="h-8 rounded-lg border border-primary-200 bg-surface px-2 text-xs outline-none focus:border-accent-400 dark:border-neutral-700"
          autoFocus
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-8 rounded-lg border border-primary-200 bg-surface px-2 text-xs outline-none focus:border-accent-400 dark:border-neutral-700"
        >
          <option value="primary">primary</option>
          <option value="fallback">fallback</option>
          <option value="openrouter_paid">openrouter_paid</option>
          <option value="paid_fallback">paid_fallback</option>
          <option value="claude_primary">claude_primary</option>
          <option value="claude_fast">claude_fast</option>
        </select>
        <input
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="provider (optional)"
          className="h-8 rounded-lg border border-primary-200 bg-surface px-2 text-xs outline-none focus:border-accent-400 dark:border-neutral-700"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="notes (optional)"
          className="h-8 rounded-lg border border-primary-200 bg-surface px-2 text-xs outline-none focus:border-accent-400 dark:border-neutral-700"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!modelId.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-600 disabled:opacity-50"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2.2} />
          Add
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-xs text-primary-500 hover:bg-primary-100 dark:hover:bg-neutral-800"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function TierSection({
  tier,
  onReorder,
  onAdd,
  onRemove,
}: {
  tier: HarpTier
  onReorder: (models: Array<HarpTierModel>) => void
  onAdd: (model: HarpTierModel) => void
  onRemove: (modelId: string) => void
}) {
  const isEditable = tier.key === 'tier1_free' || tier.key === 'tier2_paid'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-primary-500 dark:text-neutral-400">
          {tier.label}
        </h4>
        <span className="rounded-md bg-primary-100 px-2 py-0.5 text-[10px] text-primary-500 dark:bg-neutral-800 dark:text-neutral-400">
          {tier.provider}
        </span>
      </div>

      <div className="space-y-1.5">
        {tier.models.map((model, i) => (
          <TierModelRow
            key={model.model}
            model={model}
            index={i}
            total={tier.models.length}
            onMoveUp={() => {
              if (i === 0) return
              const next = [...tier.models]
              ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
              onReorder(next)
            }}
            onMoveDown={() => {
              if (i === tier.models.length - 1) return
              const next = [...tier.models]
              ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
              onReorder(next)
            }}
            onRemove={() => onRemove(model.model)}
          />
        ))}
        {tier.models.length === 0 && (
          <p className="py-2 text-center text-xs text-primary-400 dark:text-neutral-500">
            No models configured
          </p>
        )}
      </div>

      {isEditable && <AddModelForm onAdd={onAdd} />}
    </div>
  )
}

// ── Blocklist ──────────────────────────────────────────────────────────────

function BlocklistSection({
  entries,
  onAdd,
  onRemove,
}: {
  entries: Array<HarpBlocklistEntry>
  onAdd: (entry: HarpBlocklistEntry) => void
  onRemove: (modelId: string) => void
}) {
  const [modelId, setModelId] = useState('')
  const [reason, setReason] = useState('')

  function submit() {
    if (!modelId.trim()) return
    onAdd({ model: modelId.trim(), reason: reason.trim() || 'manually blocked' })
    setModelId('')
    setReason('')
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div
          key={entry.model}
          className="flex items-center gap-2 rounded-xl border border-red-200/60 bg-red-50/50 px-3 py-2 dark:border-red-900/30 dark:bg-red-950/20"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} className="shrink-0 text-red-400" />
          <div className="min-w-0 flex-1">
            <span className="block truncate font-mono text-xs font-medium text-red-700 dark:text-red-300">
              {entry.model}
            </span>
            {entry.reason && (
              <span className="text-[11px] text-red-500/70 dark:text-red-400/70">{entry.reason}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(entry.model)}
            className="rounded p-1 text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
          </button>
        </div>
      ))}

      {entries.length === 0 && (
        <p className="py-1 text-xs text-primary-400 dark:text-neutral-500">No blocked models.</p>
      )}

      <div className="flex gap-2 pt-1">
        <input
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="provider/model-id"
          className="h-8 flex-1 rounded-lg border border-primary-200 bg-surface px-2 text-xs outline-none focus:border-red-400 dark:border-neutral-700"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="reason (optional)"
          className="h-8 flex-1 rounded-lg border border-primary-200 bg-surface px-2 text-xs outline-none focus:border-red-400 dark:border-neutral-700"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!modelId.trim()}
          className="h-8 rounded-lg bg-red-500 px-3 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          Block
        </button>
      </div>
    </div>
  )
}

// ── Cap widget ─────────────────────────────────────────────────────────────

type CapPeriod = 'day' | 'week' | 'month'
const CAP_MULTIPLIER: Record<CapPeriod, number> = { day: 1, week: 7, month: 30 }
const CAP_LABELS: Record<CapPeriod, string> = { day: 'Day', week: 'Week', month: 'Month' }

function CapWidget({
  dailyValue,
  period,
  onPeriodChange,
  onSave,
}: {
  dailyValue: number
  period: CapPeriod
  onPeriodChange: (p: CapPeriod) => void
  onSave: (daily: number) => void
}) {
  const multiplier = CAP_MULTIPLIER[period]
  const inputRef = useRef<HTMLInputElement>(null)

  // When the period changes, update the displayed value without triggering a save.
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = (dailyValue * multiplier).toFixed(2)
    }
  }, [period, dailyValue, multiplier])

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value)
    if (!isNaN(v) && v >= 0) {
      onSave(v / multiplier)
    }
  }

  const dailyHint = period !== 'day'
    ? `= $${(dailyValue).toFixed(2)}/day`
    : null

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-primary-600 dark:text-neutral-400">
        Paid benchmark cap (USD)
      </label>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-primary-400 dark:text-neutral-500">$</span>
        <input
          ref={inputRef}
          type="number"
          step={0.01}
          min={0}
          defaultValue={(dailyValue * multiplier).toFixed(2)}
          onBlur={handleBlur}
          className="h-8 w-20 rounded-lg border border-primary-200 bg-surface px-2 text-xs outline-none focus:border-accent-400 dark:border-neutral-700"
        />
        <span className="text-xs text-primary-400 dark:text-neutral-500">per</span>
        <div className="flex overflow-hidden rounded-lg border border-primary-200 dark:border-neutral-700">
          {(['day', 'week', 'month'] as Array<CapPeriod>).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              className={cn(
                'h-8 px-2.5 text-xs transition-colors',
                p === period
                  ? 'bg-accent-500 font-medium text-white'
                  : 'bg-surface text-primary-500 hover:bg-primary-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
              )}
            >
              {CAP_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      {dailyHint && (
        <p className="text-[10px] text-primary-400 dark:text-neutral-500">{dailyHint}</p>
      )}
    </div>
  )
}

// ── Main screen ────────────────────────────────────────────────────────────

export function HarpConfigScreen() {
  const queryClient = useQueryClient()
  const [capPeriod, setCapPeriod] = useState<'day' | 'week' | 'month'>('day')

  const { data, isLoading, error } = useQuery({
    queryKey: ['harp-config'],
    queryFn: fetchHarpConfig,
    retry: 1,
  })

  const mutation = useMutation({
    mutationFn: patchHarpConfig,
    onSuccess: (updated) => {
      queryClient.setQueryData(['harp-config'], updated)
    },
  })

  function patch(p: Record<string, unknown>) {
    mutation.mutate(p)
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-primary-500">
        <span className="animate-spin">⟳</span> Loading HARP config…
      </div>
    )
  }

  if (error || !data?.available) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <HugeiconsIcon icon={InformationCircleIcon} size={16} strokeWidth={1.8} />
            <span className="text-sm font-semibold">No HARP config found</span>
          </div>
          <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
            HARP (tiered model routing) lets you define free-first fallback chains for Hermes Agent.
            Searched in these locations:
          </p>
          <ul className="mb-3 space-y-1">
            {(data?.candidatePaths ?? []).map((p) => (
              <li key={p} className="font-mono text-[11px] text-amber-700 dark:text-amber-300">
                {p}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-500 dark:text-amber-400">
            Set <code className="rounded bg-amber-100 px-1 font-mono text-[11px] dark:bg-amber-900/40">HARP_CONFIG_PATH</code> to
            point to an existing file, or create a starter config below.
          </p>
          {error instanceof Error && (
            <p className="mt-2 text-[11px] text-red-500">{error.message}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => mutation.mutate({ action: 'create-starter' } as Record<string, unknown>)}
          disabled={mutation.isPending}
          className="flex items-center gap-2 rounded-xl border border-accent-300 bg-accent-50/60 px-4 py-2.5 text-sm font-medium text-accent-700 transition-colors hover:bg-accent-100 disabled:opacity-50 dark:border-accent-700/40 dark:bg-accent-950/20 dark:text-accent-300"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={15} strokeWidth={2} />
          {mutation.isPending ? 'Creating…' : 'Create starter harp-config.yaml'}
        </button>
      </div>
    )
  }

  const { global: g, tiers, blocklist, autoImprove } = data

  const savingIndicator = mutation.isPending ? (
    <span className="text-[11px] text-primary-400 dark:text-neutral-500">Saving…</span>
  ) : mutation.isSuccess ? (
    <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} strokeWidth={2} />
      Saved
    </span>
  ) : mutation.isError ? (
    <span className="text-[11px] text-red-500">
      {mutation.error instanceof Error ? mutation.error.message : 'Save failed'}
    </span>
  ) : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-primary-900 dark:text-neutral-100">
            HARP-VM Routing
          </h2>
          <p className="mt-0.5 text-xs text-primary-500 dark:text-neutral-400">
            Tiered free-first model routing for your OCI VM
          </p>
        </div>
        <div className="flex items-center gap-2">{savingIndicator}</div>
      </div>

      {/* Global settings */}
      <SectionCard
        title="Global Controls"
        description="Master switches and budget guardrails"
        icon={Settings04Icon}
      >
        <div className="flex flex-wrap gap-2">
          <Toggle
            checked={g.enabled}
            onChange={(v) => patch({ action: 'set-global', field: 'enabled', value: v })}
            label="HARP enabled"
          />
          <Toggle
            checked={g.auto_route}
            onChange={(v) => patch({ action: 'set-global', field: 'auto_route', value: v })}
            label="Auto-route"
          />
          <Toggle
            checked={g.allow_paid_benchmarking}
            onChange={(v) => patch({ action: 'set-global', field: 'allow_paid_benchmarking', value: v })}
            label="Paid benchmarking"
          />
          <Toggle
            checked={g.require_paid_final_review_for_production}
            onChange={(v) => patch({ action: 'set-global', field: 'require_paid_final_review_for_production', value: v })}
            label="Paid final review (prod)"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-primary-600 dark:text-neutral-400">
              Mode
            </label>
            <select
              value={g.mode}
              onChange={(e) => patch({ action: 'set-global', field: 'mode', value: e.target.value })}
              className="h-8 rounded-lg border border-primary-200 bg-surface px-2 text-xs outline-none focus:border-accent-400 dark:border-neutral-700"
            >
              <option value="tiered_with_degradation">tiered_with_degradation</option>
              <option value="free_only">free_only</option>
              <option value="paid_only">paid_only</option>
              <option value="local_only">local_only</option>
            </select>
          </div>

          <CapWidget
            dailyValue={g.paid_benchmark_daily_cap_usd}
            period={capPeriod}
            onPeriodChange={setCapPeriod}
            onSave={(daily) => patch({ action: 'set-global', field: 'paid_benchmark_daily_cap_usd', value: daily })}
          />
        </div>
      </SectionCard>

      {/* Routing tiers */}
      <SectionCard
        title="Routing Tiers"
        description="Model priority order — tried top to bottom. Reorder with arrows. Tier 1 & 2 are editable."
        icon={FlowCircleIcon}
      >
        <div className="space-y-5 divide-y divide-primary-100 dark:divide-neutral-800">
          {tiers.map((tier) => (
            <div key={tier.key} className={cn('pt-4 first:pt-0', tier.key === 'tier1_free' && 'first:pt-0')}>
              <TierSection
                tier={tier}
                onReorder={(models) =>
                  patch({ action: 'reorder-tier-models', tier: tier.key, models })
                }
                onAdd={(model) =>
                  patch({ action: 'add-tier-model', tier: tier.key, model })
                }
                onRemove={(modelId) =>
                  patch({ action: 'remove-tier-model', tier: tier.key, modelId })
                }
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Blocklist */}
      <SectionCard
        title="Routing Blocklist"
        description="Models that will never be selected by HARP, regardless of tier"
        icon={ShieldKeyIcon}
      >
        <BlocklistSection
          entries={blocklist}
          onAdd={(entry) => patch({ action: 'add-blocklist', entry })}
          onRemove={(modelId) => patch({ action: 'remove-blocklist', modelId })}
        />
      </SectionCard>

      {/* Auto-improve */}
      <SectionCard
        title="Auto-Improve"
        description="Weekly re-ranking of free models by eval scores and real usage data"
        icon={CheckmarkCircle02Icon}
      >
        <div className="space-y-3">
          <Toggle
            checked={autoImprove.enabled}
            onChange={(v) => patch({ action: 'set-auto-improve', field: 'enabled', value: v })}
            label="Auto-improve enabled"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-primary-600 dark:text-neutral-400">
                Cron schedule
              </label>
              <input
                defaultValue={typeof autoImprove.trigger === 'object' && Array.isArray(autoImprove.trigger)
                  ? (autoImprove.trigger.find((t: Record<string, unknown>) => t.cron) as Record<string, string> | undefined)?.cron ?? ''
                  : ''}
                placeholder="0 4 * * 1"
                className="h-8 rounded-lg border border-primary-200 bg-surface px-2 font-mono text-xs outline-none focus:border-accent-400 dark:border-neutral-700"
                readOnly
              />
              <p className="text-[10px] text-primary-400">Edit in harp-config.yaml to change schedule</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-primary-600 dark:text-neutral-400">
                Min evals to rank
              </label>
              <input
                type="number"
                min={1}
                defaultValue={autoImprove.min_evals_to_rank}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v > 0) patch({ action: 'set-auto-improve', field: 'min_evals_to_rank', value: v })
                }}
                className="h-8 rounded-lg border border-primary-200 bg-surface px-2 text-xs outline-none focus:border-accent-400 dark:border-neutral-700"
              />
            </div>
          </div>

          {autoImprove.deliver && (
            <div className="rounded-lg border border-primary-200 bg-primary-50/60 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/40">
              <span className="text-xs text-primary-500 dark:text-neutral-400">
                Reports delivered to: <code className="font-mono text-[11px]">{autoImprove.deliver}</code>
              </span>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
