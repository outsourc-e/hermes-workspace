'use client'

import { useState, useMemo, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Clock01Icon,
  RefreshIcon,
  Add01Icon,
  PlayIcon,
  PauseIcon,
  Delete01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  fetchJobs,
  createJob,
  deleteJob,
  pauseJob,
  resumeJob,
  triggerJob,
  type HermesJob,
} from '@/lib/jobs-api'
import { CreateJobDialog } from './create-job-dialog'

const QUERY_KEY = ['hermes', 'jobs'] as const

function formatNextRun(nextRun?: string | null): string {
  if (!nextRun) return '—'
  try {
    const d = new Date(nextRun)
    const now = new Date()
    const diffMs = d.getTime() - now.getTime()
    if (diffMs < 0) return 'overdue'
    if (diffMs < 60_000) return 'in < 1m'
    if (diffMs < 3600_000) return `in ${Math.round(diffMs / 60_000)}m`
    if (diffMs < 86400_000) return `in ${Math.round(diffMs / 3600_000)}h`
    return d.toLocaleDateString()
  } catch {
    return nextRun
  }
}

function JobCard({
  job,
  onPause,
  onResume,
  onTrigger,
  onDelete,
}: {
  job: HermesJob
  onPause: (id: string) => void
  onResume: (id: string) => void
  onTrigger: (id: string) => void
  onDelete: (id: string) => void
}) {
  const isPaused = job.state === 'paused' || !job.enabled
  const isCompleted = job.state === 'completed'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        'rounded-xl border p-4 transition-colors',
        'bg-[var(--theme-card)] border-[var(--theme-border)]',
        isPaused && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                'inline-block w-2 h-2 rounded-full shrink-0',
                isPaused ? 'bg-yellow-500' : isCompleted ? 'bg-blue-500' : 'bg-green-500',
              )}
            />
            <h3 className="font-medium text-sm text-[var(--theme-text)] truncate">
              {job.name || '(unnamed)'}
            </h3>
          </div>
          <p className="text-xs text-[var(--theme-muted)] line-clamp-2 mb-2">
            {job.prompt}
          </p>
          <div className="flex items-center gap-3 text-[10px] text-[var(--theme-muted)]">
            <span>{job.schedule_display || 'custom'}</span>
            <span>·</span>
            <span>Next: {formatNextRun(job.next_run_at)}</span>
            {job.skills && job.skills.length > 0 && (
              <>
                <span>·</span>
                <span>{job.skills.length} skill{job.skills.length !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onTrigger(job.id)}
            className="p-1.5 rounded-lg hover:bg-[var(--theme-hover)] transition-colors"
            title="Run now"
          >
            <HugeiconsIcon icon={PlayIcon} size={14} className="text-green-500" />
          </button>
          <button
            onClick={() => (isPaused ? onResume(job.id) : onPause(job.id))}
            className="p-1.5 rounded-lg hover:bg-[var(--theme-hover)] transition-colors"
            title={isPaused ? 'Resume' : 'Pause'}
          >
            <HugeiconsIcon
              icon={isPaused ? PlayIcon : PauseIcon}
              size={14}
              className="text-[var(--theme-muted)]"
            />
          </button>
          <button
            onClick={() => onDelete(job.id)}
            className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <HugeiconsIcon icon={Delete01Icon} size={14} className="text-red-400" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export function JobsScreen() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const jobsQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchJobs,
    refetchInterval: 30_000,
  })

  const pauseMutation = useMutation({
    mutationFn: pauseJob,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); toast('Job paused') },
  })
  const resumeMutation = useMutation({
    mutationFn: resumeJob,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); toast('Job resumed') },
  })
  const triggerMutation = useMutation({
    mutationFn: triggerJob,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); toast('Job triggered') },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); toast('Job deleted') },
  })
  const createMutation = useMutation({
    mutationFn: createJob,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast('Job created')
      setShowCreate(false)
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to create job', {
        type: 'error',
      })
    },
  })

  const filteredJobs = useMemo(() => {
    const jobs = jobsQuery.data ?? []
    if (!search.trim()) return jobs
    const q = search.toLowerCase()
    return jobs.filter(
      (j) =>
        j.name?.toLowerCase().includes(q) ||
        j.prompt?.toLowerCase().includes(q),
    )
  }, [jobsQuery.data, search])

  const handleCreate = useCallback(
    async (input: {
      name: string
      schedule: string
      prompt: string
      deliver?: string[]
      skills?: string[]
      repeat?: number
    }) => {
      await createMutation.mutateAsync(input)
    },
    [createMutation],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border)]">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Clock01Icon} size={18} className="text-[var(--theme-accent)]" />
          <h1 className="text-base font-semibold text-[var(--theme-text)]">Jobs</h1>
          {jobsQuery.data && (
            <span className="text-xs text-[var(--theme-muted)] ml-1">
              ({jobsQuery.data.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void queryClient.invalidateQueries({ queryKey: QUERY_KEY })}
            className="p-1.5 rounded-lg hover:bg-[var(--theme-hover)] transition-colors"
            title="Refresh"
          >
            <HugeiconsIcon icon={RefreshIcon} size={16} className="text-[var(--theme-muted)]" />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--theme-accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <HugeiconsIcon icon={Add01Icon} size={14} />
            New Job
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-[var(--theme-border)]">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-muted)]"
          />
          <input
            type="text"
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-[var(--theme-input)] text-[var(--theme-text)] placeholder:text-[var(--theme-muted)] border border-[var(--theme-border)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]"
          />
        </div>
      </div>

      {/* Job List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {jobsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12 text-[var(--theme-muted)] text-sm">
            Loading jobs...
          </div>
        ) : jobsQuery.isError ? (
          <div className="flex items-center justify-center py-12 text-red-400 text-sm">
            Failed to load jobs: {jobsQuery.error instanceof Error ? jobsQuery.error.message : 'Unknown error'}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--theme-muted)]">
            <HugeiconsIcon icon={Clock01Icon} size={32} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No scheduled jobs</p>
            <p className="text-xs mt-1">Create one to get started</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onPause={(id) => pauseMutation.mutate(id)}
                onResume={(id) => resumeMutation.mutate(id)}
                onTrigger={(id) => triggerMutation.mutate(id)}
                onDelete={(id) => {
                  if (confirm(`Delete job "${job.name}"?`)) {
                    deleteMutation.mutate(id)
                  }
                }}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      <CreateJobDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
      />
    </div>
  )
}
