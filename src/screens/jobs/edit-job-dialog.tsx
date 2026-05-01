'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import type { ClaudeJob } from '@/lib/jobs-api'

const SCHEDULE_PRESETS = [
  { label: 'Every 15m', value: 'every 15m' },
  { label: 'Every 30m', value: 'every 30m' },
  { label: 'Every 1h', value: 'every 1h' },
  { label: 'Every 6h', value: 'every 6h' },
  { label: 'Daily', value: '0 9 * * *' },
  { label: 'Weekly', value: '0 9 * * 1' },
] as const

const DELIVERY_OPTIONS = ['local', 'telegram', 'discord'] as const

type EditJobDialogProps = {
  job: ClaudeJob | null
  open: boolean
  isSubmitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: {
    name: string
    schedule: string
    prompt: string
    deliver?: Array<string>
    skills?: Array<string>
    repeat?: number
  }) => void | Promise<void>
}

function readScheduleValue(job: ClaudeJob): string {
  if (typeof job.schedule_display === 'string' && job.schedule_display.trim()) {
    return job.schedule_display.trim()
  }
  const schedule = job.schedule
  if (schedule && typeof schedule === 'object') {
    const record = schedule
    const candidates = [
      record.expression,
      record.cron,
      record.raw,
      record.value,
      record.schedule,
    ]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim()
      }
    }
  }
  return ''
}

function getInitialState(job: ClaudeJob | null) {
  const repeatTimes = job?.repeat?.times
  const repeatCompleted = job?.repeat?.completed ?? 0
  const remainingRepeats =
    typeof repeatTimes === 'number'
      ? Math.max(1, repeatTimes - repeatCompleted)
      : null

  return {
    name: job?.name ?? '',
    schedule: job ? readScheduleValue(job) : 'every 30m',
    prompt: job?.prompt ?? '',
    skillsInput: Array.isArray(job?.skills) ? job.skills.join(', ') : '',
    deliver:
      Array.isArray(job?.deliver) && job.deliver.length > 0
        ? [...job.deliver]
        : ['local'],
    repeatMode:
      remainingRepeats === null ? ('unlimited' as const) : ('limited' as const),
    repeatCount: remainingRepeats === null ? '1' : String(remainingRepeats),
  }
}

export function EditJobDialog({
  job,
  open,
  isSubmitting = false,
  onOpenChange,
  onSubmit,
}: EditJobDialogProps) {
  const [form, setForm] = useState(() => getInitialState(job))

  useEffect(() => {
    if (!open) {
      setForm(getInitialState(job))
      return
    }

    setForm(getInitialState(job))

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [job, open, onOpenChange])

  function toggleDelivery(target: string) {
    setForm((current) => {
      const nextDeliver = current.deliver.includes(target)
        ? current.deliver.filter((item) => item !== target)
        : [...current.deliver, target]

      return {
        ...current,
        deliver: nextDeliver,
      }
    })
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const skills = form.skillsInput
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean)

    void onSubmit({
      name: form.name.trim(),
      schedule: form.schedule.trim(),
      prompt: form.prompt.trim(),
      deliver: form.deliver.length > 0 ? form.deliver : undefined,
      skills: skills.length > 0 ? Array.from(new Set(skills)) : undefined,
      repeat:
        form.repeatMode === 'limited'
          ? Math.max(1, Number.parseInt(form.repeatCount, 10) || 1)
          : undefined,
    })
  }

  return (
    <AnimatePresence>
      {open && job ? (
        <motion.div
          key="edit-job-dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onOpenChange(false)
            }
          }}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0, 0, 0, 0.68)' }}
            onClick={() => onOpenChange(false)}
          />
          <motion.form
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onSubmit={handleFormSubmit}
            className="relative z-10 flex max-h-[85vh] w-[min(720px,96vw)] flex-col overflow-hidden rounded-2xl border shadow-2xl"
            style={{
              background: 'var(--theme-card)',
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-text)',
            }}
          >
            <div
              className="flex items-start justify-between gap-4 border-b px-5 py-4"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <div>
                <h2 className="text-lg font-semibold">Edit Job</h2>
                <p
                  className="mt-1 text-sm"
                  style={{ color: 'var(--theme-muted)' }}
                >
                  Update the schedule, prompt, and routing for this Hermes task.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg p-2 transition-colors"
                style={{ color: 'var(--theme-muted)' }}
                aria-label="Close edit job dialog"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <section className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Daily research summary"
                  required
                  className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                  style={{
                    background: 'var(--theme-input)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text)',
                    boxShadow: '0 0 0 0 transparent',
                  }}
                />
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">Schedule</h3>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    Choose a preset or enter a custom schedule string below.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SCHEDULE_PRESETS.map((preset) => {
                    const isActive = form.schedule === preset.value
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            schedule: preset.value,
                          }))
                        }
                        className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                        style={{
                          background: isActive
                            ? 'var(--theme-accent)'
                            : 'var(--theme-card)',
                          borderColor: isActive
                            ? 'var(--theme-accent)'
                            : 'var(--theme-border)',
                          color: isActive ? '#fff' : 'var(--theme-text)',
                        }}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Custom schedule</label>
                  <input
                    value={form.schedule}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        schedule: event.target.value,
                      }))
                    }
                    placeholder="every 30m or 0 9 * * *"
                    required
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                    style={{
                      background: 'var(--theme-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)',
                    }}
                  />
                </div>
              </section>

              <section className="space-y-2">
                <label className="text-sm font-medium">Prompt</label>
                <textarea
                  value={form.prompt}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      prompt: event.target.value,
                    }))
                  }
                  placeholder="What should Hermes Agent do?"
                  required
                  rows={5}
                  className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                  style={{
                    background: 'var(--theme-input)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text)',
                  }}
                />
              </section>

              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Options</h3>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    Optional routing and repeat controls.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Skills</label>
                  <input
                    value={form.skillsInput}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        skillsInput: event.target.value,
                      }))
                    }
                    placeholder="research, writing, synthesis"
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                    style={{
                      background: 'var(--theme-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)',
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Deliver to</label>
                  <div className="flex flex-wrap gap-2">
                    {DELIVERY_OPTIONS.map((option) => {
                      const isActive = form.deliver.includes(option)
                      const needsGateway =
                        option === 'telegram' || option === 'discord'
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleDelivery(option)}
                          title={
                            needsGateway
                              ? `Requires Hermes Agent gateway with ${option} configured`
                              : undefined
                          }
                          className="rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors"
                          style={{
                            background: isActive
                              ? 'var(--theme-accent)'
                              : 'var(--theme-card)',
                            borderColor: isActive
                              ? 'var(--theme-accent)'
                              : 'var(--theme-border)',
                            color: isActive
                              ? '#fff'
                              : needsGateway
                                ? 'var(--theme-muted)'
                                : 'var(--theme-text)',
                          }}
                        >
                          {option}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Repeat</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          repeatMode: 'unlimited',
                        }))
                      }
                      className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        background:
                          form.repeatMode === 'unlimited'
                            ? 'var(--theme-accent)'
                            : 'var(--theme-card)',
                        borderColor:
                          form.repeatMode === 'unlimited'
                            ? 'var(--theme-accent)'
                            : 'var(--theme-border)',
                        color:
                          form.repeatMode === 'unlimited'
                            ? '#fff'
                            : 'var(--theme-text)',
                      }}
                    >
                      Unlimited
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          repeatMode: 'limited',
                        }))
                      }
                      className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        background:
                          form.repeatMode === 'limited'
                            ? 'var(--theme-accent)'
                            : 'var(--theme-card)',
                        borderColor:
                          form.repeatMode === 'limited'
                            ? 'var(--theme-accent)'
                            : 'var(--theme-border)',
                        color:
                          form.repeatMode === 'limited'
                            ? '#fff'
                            : 'var(--theme-text)',
                      }}
                    >
                      Set count
                    </button>
                  </div>
                  {form.repeatMode === 'limited' ? (
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={form.repeatCount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          repeatCount: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                      style={{
                        background: 'var(--theme-input)',
                        borderColor: 'var(--theme-border)',
                        color: 'var(--theme-text)',
                      }}
                    />
                  ) : null}
                </div>
              </section>
            </div>

            <div
              className="flex items-center justify-end gap-2 border-t px-5 py-4"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-xl px-4 py-2 text-sm transition-colors"
                style={{
                  background: 'var(--theme-card)',
                  color: 'var(--theme-muted)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  !form.name.trim() ||
                  !form.schedule.trim() ||
                  !form.prompt.trim()
                }
                className="rounded-xl px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
                style={{ background: 'var(--theme-accent)' }}
              >
                {isSubmitting ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
