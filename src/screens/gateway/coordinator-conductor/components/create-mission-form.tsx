import { useState } from 'react'
import { classNames } from './shared'
import type { SpawnResponse } from '../types'

export function CreateMissionForm({
  onTemplate,
  onSpawn,
  busy,
}: {
  onTemplate: (
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  onSpawn: (body: Record<string, unknown>) => Promise<SpawnResponse>
  busy: boolean
}) {
  const [goal, setGoal] = useState('')
  const [mode, setMode] = useState<'template' | 'conductor'>('conductor')
  const [template, setTemplate] = useState<
    'coding' | 'research' | 'qa' | 'release' | 'maintenance'
  >('coding')
  const [maxParallel, setMaxParallel] = useState(2)
  const [supervised, setSupervised] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!goal.trim() || busy) return
    setError(null)
    try {
      const id = `conductor-${Date.now()}`
      if (mode === 'conductor') {
        await onSpawn({ goal: goal.trim(), maxParallel, supervised })
      } else {
        await onTemplate({
          action: 'template',
          missionId: id,
          objective: goal.trim(),
          template,
          maxParallelism: maxParallel,
        })
      }
      setGoal('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <form
      onSubmit={submit}
      className="cc-fade-in mb-7 rounded-2xl border border-primary-200 bg-gradient-to-b from-primary-50/70 to-primary-50/40 p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="conductor-goal"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-700"
          >
            Start a mission
          </label>
          <input
            id="conductor-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Describe the outcome to build…"
            className="mt-2 h-12 w-full rounded-xl border border-primary-200 bg-surface px-4 text-sm text-ink shadow-inner outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <ModeToggle value={mode} onChange={setMode} />

          {mode === 'template' ? (
            <select
              value={template}
              onChange={(event) =>
                setTemplate(event.target.value as typeof template)
              }
              className="h-12 rounded-xl border border-primary-200 bg-surface px-3 text-sm text-ink outline-none focus:border-accent-500"
            >
              <option value="coding">Coding</option>
              <option value="research">Research</option>
              <option value="qa">QA</option>
              <option value="release">Release</option>
              <option value="maintenance">Maintenance</option>
            </select>
          ) : null}

          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-700">
            Max parallel
            <input
              type="range"
              min={1}
              max={5}
              value={maxParallel}
              onChange={(event) => setMaxParallel(Number(event.target.value))}
              className="h-3 w-28 cursor-pointer accent-accent-600"
            />
          </label>
          <span className="flex h-12 items-center rounded-xl border border-primary-200 bg-primary-50/50 px-3 text-sm text-primary-800">
            {maxParallel}
          </span>

          {mode === 'conductor' ? (
            <label className="flex h-12 cursor-pointer items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/50 px-3 text-sm text-primary-800 transition hover:border-accent-500">
              <input
                type="checkbox"
                checked={supervised}
                onChange={(event) => setSupervised(event.target.checked)}
                className="size-4 accent-accent-600"
              />
              Supervised
            </label>
          ) : null}

          <button
            type="submit"
            disabled={!goal.trim() || busy}
            className="h-12 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-accent-600 hover:to-accent-700 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Create mission'}
          </button>
        </div>
      </div>

      {error ? (
        <div
          className="mt-4 flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-700"
          role="alert"
        >
          <span className="font-semibold">Action failed</span>
          <span>{error}</span>
        </div>
      ) : null}
    </form>
  )
}

function ModeToggle({
  value,
  onChange,
}: {
  value: 'template' | 'conductor'
  onChange: (value: 'template' | 'conductor') => void
}) {
  return (
    <div className="flex rounded-xl border border-primary-200 bg-primary-50/50 p-1">
      <button
        type="button"
        onClick={() => onChange('conductor')}
        className={classNames(
          'rounded-lg px-3 py-2 text-xs font-medium transition active:scale-95',
          value === 'conductor'
            ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white shadow-sm'
            : 'text-primary-700 hover:text-ink hover:bg-primary-100/50',
        )}
      >
        Conductor
      </button>
      <button
        type="button"
        onClick={() => onChange('template')}
        className={classNames(
          'rounded-lg px-3 py-2 text-xs font-medium transition active:scale-95',
          value === 'template'
            ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white shadow-sm'
            : 'text-primary-700 hover:text-ink hover:bg-primary-100/50',
        )}
      >
        Template
      </button>
    </div>
  )
}
