import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Add01Icon, Clock01Icon, Tick01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { CronJob } from '@/components/cron-manager/cron-types'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { toggleCronJob, upsertCronJob } from '@/lib/cron-api'
import { formatRelativeTime } from '@/screens/dashboard/lib/formatters'

function displayJobName(job: CronJob, agentId: string): string {
  const prefix = `ops:${agentId}:`
  if (job.name.startsWith(prefix)) {
    return job.name.slice(prefix.length).replace(/-/g, ' ')
  }
  return job.name
}

export function OperationsAgentJobs({
  agentId,
  jobs,
  slugifyJobLabel,
}: {
  agentId: string
  jobs: CronJob[]
  slugifyJobLabel: (value: string) => string
}) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [schedule, setSchedule] = useState('0 9 * * *')
  const [description, setDescription] = useState('')

  const toggleMutation = useMutation({
    mutationFn: async (payload: { jobId: string; enabled: boolean }) => {
      await toggleCronJob(payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['operations', 'cron'] })
    },
    onError: (error) => {
      toast(
        error instanceof Error ? error.message : 'Failed to update cron job',
        { type: 'error' },
      )
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = title.trim()
      if (!trimmedTitle) {
        throw new Error('Job name is required')
      }

      await upsertCronJob({
        name: `ops:${agentId}:${slugifyJobLabel(trimmedTitle)}`,
        schedule: schedule.trim() || '0 9 * * *',
        enabled: true,
        description: description.trim() || trimmedTitle,
        payload: { agentId },
      })
    },
    onSuccess: async () => {
      setTitle('')
      setSchedule('0 9 * * *')
      setDescription('')
      setAdding(false)
      await queryClient.invalidateQueries({ queryKey: ['operations', 'cron'] })
      toast('Cron job created', { type: 'success' })
    },
    onError: (error) => {
      toast(
        error instanceof Error ? error.message : 'Failed to create cron job',
        { type: 'error' },
      )
    },
  })

  return (
    <section className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-[0_20px_70px_color-mix(in_srgb,var(--theme-shadow)_14%,transparent)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--theme-text)]">
            Scheduled Jobs
          </h3>
          <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
            Jobs tagged with `ops:{agentId}:*`
          </p>
        </div>
        <Button
          variant="secondary"
          className="border border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
          onClick={() => setAdding((value) => !value)}
        >
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
          Add Job
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {jobs.length > 0 ? (
          jobs.map((job) => {
            const lastRunAt = job.lastRun?.startedAt
              ? Date.parse(job.lastRun.startedAt)
              : null

            return (
              <div
                key={job.id}
                className="flex flex-col gap-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        toggleMutation.mutate({
                          jobId: job.id,
                          enabled: !job.enabled,
                        })
                      }
                      className="inline-flex size-5 items-center justify-center rounded border border-[var(--theme-border)] bg-[var(--theme-card)]"
                      aria-label={job.enabled ? 'Disable job' : 'Enable job'}
                    >
                      {job.enabled ? (
                        <HugeiconsIcon
                          icon={Tick01Icon}
                          size={14}
                          strokeWidth={2}
                          className="text-emerald-600"
                        />
                      ) : null}
                    </button>
                    <div>
                      <p className="text-sm font-semibold capitalize text-[var(--theme-text)]">
                        {displayJobName(job, agentId)}
                      </p>
                      <p className="text-sm text-[var(--theme-muted-2)]">
                        {job.description || job.schedule}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-sm text-[var(--theme-muted)] md:text-right">
                  <p className="inline-flex items-center gap-2 md:justify-end">
                    <HugeiconsIcon icon={Clock01Icon} size={16} strokeWidth={1.8} />
                    {job.schedule}
                  </p>
                  <p className="mt-1">
                    {job.nextRunAt
                      ? `Next ${new Date(job.nextRunAt).toLocaleString()}`
                      : lastRunAt
                        ? `Last ${formatRelativeTime(lastRunAt)}`
                        : 'No runs yet'}
                  </p>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-6 text-sm text-[var(--theme-muted)]">
            No cron jobs are linked to this agent yet.
          </div>
        )}
      </div>

      {adding ? (
        <div className="mt-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--theme-text)]">Job Name</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Daily scan"
                className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-accent)]"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--theme-text)]">Schedule</span>
              <input
                value={schedule}
                onChange={(event) => setSchedule(event.target.value)}
                placeholder="0 9 * * *"
                className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-accent)]"
              />
            </label>
          </div>
          <label className="mt-3 block space-y-2">
            <span className="text-sm font-medium text-[var(--theme-text)]">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this job should do"
              className="min-h-[96px] w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-accent)]"
            />
          </label>
          <div className="mt-4 flex justify-end gap-3">
            <Button
              variant="secondary"
              className="border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-[var(--theme-accent)] text-primary-950 hover:bg-[var(--theme-accent-strong)]"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Job'}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
