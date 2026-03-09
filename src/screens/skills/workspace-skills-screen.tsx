import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  File01Icon,
  Search01Icon,
  SparklesIcon,
} from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type SkillCategory = 'QA' | 'Auth' | 'UI' | 'DB' | 'DevOps'
type MemoryFilter = 'All' | 'Workspace' | 'Project' | 'Agent'
type MemorySection = 'workspace' | 'project' | 'agent'

type SkillItem = {
  id: string
  name: string
  description: string
  category: SkillCategory
  status: 'active' | 'disabled'
  emoji: string
  tone: string
}

type MemoryFileItem = {
  name: string
  path: string
  size: string
  section: MemorySection
}

type MemoryFilesResponse = {
  files: Array<MemoryFileItem>
}

const SKILL_CATEGORIES: Array<'All' | SkillCategory> = [
  'All',
  'QA',
  'Auth',
  'UI',
  'DB',
  'DevOps',
]

const MEMORY_FILTERS: Array<MemoryFilter> = [
  'All',
  'Workspace',
  'Project',
  'Agent',
]

const SKILLS: Array<SkillItem> = [
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Automated code review with style + security checks',
    category: 'QA',
    status: 'active',
    emoji: '🔍',
    tone: 'bg-green-500/10 text-green-300',
  },
  {
    id: 'auth-patterns',
    name: 'Auth Patterns',
    description: 'JWT, OAuth, session management templates',
    category: 'Auth',
    status: 'active',
    emoji: '🔒',
    tone: 'bg-red-500/10 text-red-300',
  },
  {
    id: 'db-migration',
    name: 'DB Migration',
    description: 'Schema migrations, seed data, rollback',
    category: 'DB',
    status: 'active',
    emoji: '🗄️',
    tone: 'bg-blue-500/10 text-blue-300',
  },
  {
    id: 'ui-component-gen',
    name: 'UI Component Gen',
    description: 'Generate React components from descriptions',
    category: 'UI',
    status: 'active',
    emoji: '🎨',
    tone: 'bg-accent-500/10 text-accent-300',
  },
  {
    id: 'test-writer',
    name: 'Test Writer',
    description: 'Generate unit + integration tests from code',
    category: 'QA',
    status: 'active',
    emoji: '🧪',
    tone: 'bg-fuchsia-500/10 text-fuchsia-300',
  },
  {
    id: 'docker-compose',
    name: 'Docker Compose',
    description: 'Container orchestration + CI/CD',
    category: 'DevOps',
    status: 'disabled',
    emoji: '🐳',
    tone: 'bg-primary-800 text-primary-300',
  },
]

const CATEGORY_BADGE_CLASS: Record<SkillCategory, string> = {
  QA: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
  Auth: 'border-red-500/30 bg-red-500/10 text-red-300',
  UI: 'border-accent-500/30 bg-accent-500/10 text-accent-300',
  DB: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  DevOps: 'border-primary-700 bg-primary-800 text-primary-300',
}

const STATUS_BADGE_CLASS: Record<SkillItem['status'], string> = {
  active: 'border-green-500/30 bg-green-500/10 text-green-300',
  disabled: 'border-primary-700 bg-primary-800 text-primary-300',
}

function sectionLabel(section: MemorySection): string {
  if (section === 'workspace') return 'Workspace Memory'
  if (section === 'project') return 'Daily Logs'
  return 'Agent Memory'
}

function matchesFilter(section: MemorySection, filter: MemoryFilter): boolean {
  if (filter === 'All') return true
  if (filter === 'Workspace') return section === 'workspace'
  if (filter === 'Project') return section === 'project'
  return section === 'agent'
}

function EmptyMemorySection({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-primary-700 bg-primary-900/40 px-3 py-4 text-xs text-primary-400">
      No files found in {label.toLowerCase()}.
    </div>
  )
}

export function WorkspaceSkillsScreen() {
  const [skillFilter, setSkillFilter] = useState<'All' | SkillCategory>('All')
  const [selectedSkillId, setSelectedSkillId] = useState<string>('code-reviewer')
  const [memoryFilter, setMemoryFilter] = useState<MemoryFilter>('All')
  const [memorySearch, setMemorySearch] = useState('')
  const deferredSearch = useDeferredValue(memorySearch)
  const [selectedMemoryPath, setSelectedMemoryPath] = useState<string | null>(null)

  const memoryQuery = useQuery({
    queryKey: ['workspace', 'memory-files'],
    queryFn: async function fetchMemoryFiles(): Promise<MemoryFilesResponse> {
      const response = await fetch('/api/workspace/memory-files')
      const payload = (await response.json().catch(() => ({}))) as
        | MemoryFilesResponse
        | { error?: string }

      if (!response.ok) {
        throw new Error(
          'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : 'Failed to load memory files',
        )
      }

      return {
        files: Array.isArray((payload as MemoryFilesResponse).files)
          ? (payload as MemoryFilesResponse).files
          : [],
      }
    },
  })

  const visibleSkills = useMemo(
    () =>
      SKILLS.filter((skill) =>
        skillFilter === 'All' ? true : skill.category === skillFilter,
      ),
    [skillFilter],
  )

  const normalizedSearch = deferredSearch.trim().toLowerCase()
  const filteredMemoryFiles = useMemo(() => {
    const files = memoryQuery.data?.files ?? []
    return files.filter((file) => {
      if (!matchesFilter(file.section, memoryFilter)) return false
      if (!normalizedSearch) return true
      const haystack = `${file.name} ${file.path}`.toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [memoryFilter, memoryQuery.data?.files, normalizedSearch])

  const workspaceFiles = filteredMemoryFiles.filter(
    (file) => file.section === 'workspace',
  )
  const projectFiles = filteredMemoryFiles.filter(
    (file) => file.section === 'project',
  )
  const agentFiles = filteredMemoryFiles.filter((file) => file.section === 'agent')

  const selectedSkill =
    SKILLS.find((skill) => skill.id === selectedSkillId) ?? SKILLS[0] ?? null

  useEffect(() => {
    if (selectedMemoryPath) return
    const firstFile = memoryQuery.data?.files?.[0]
    if (firstFile) {
      setSelectedMemoryPath(firstFile.path)
    }
  }, [memoryQuery.data?.files, selectedMemoryPath])

  function handleComingSoon() {
    toast('Coming soon', { type: 'info' })
  }

  function handleClearAll() {
    toast('Are you sure?', { type: 'warning' })
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm('Are you sure you want to clear all memory?')

    if (!confirmed) return
    toast('Cleared', { type: 'success' })
  }

  return (
    <div className="min-h-full bg-surface text-primary-900">
      <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col px-4 py-4 sm:px-5 lg:px-6">
        <div className="flex flex-col gap-2 pb-4">
          <h1 className="text-base font-semibold text-primary-900">
            Skills &amp; Memory
          </h1>
          <p className="text-sm text-primary-500">
            Browse installed skills and inspect workspace memory sources in one
            place.
          </p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border border-primary-200 bg-white shadow-sm lg:grid-cols-2">
          <section className="min-h-0 border-b border-primary-200 lg:border-b-0">
            <div className="flex h-full min-h-0 flex-col p-4 sm:p-5">
              <div className="flex flex-col gap-3 border-b border-primary-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-[15px] font-semibold text-primary-900">
                    Skills
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleComingSoon}
                  >
                    + Install Skill
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleComingSoon}
                  >
                    Browse ClawHub
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 py-4">
                {SKILL_CATEGORIES.map((category) => {
                  const active = category === skillFilter
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSkillFilter(category)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                        active
                          ? 'border-accent-500/40 bg-accent-500/10 text-accent-400'
                          : 'border-primary-200 bg-white text-primary-600 hover:border-primary-300 hover:text-primary-900',
                      )}
                    >
                      {category}
                    </button>
                  )
                })}
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                {visibleSkills.map((skill) => {
                  const expanded = selectedSkillId === skill.id
                  return (
                    <div
                      key={skill.id}
                      className={cn(
                        'overflow-hidden rounded-xl border bg-primary-50/60 transition-all',
                        skill.status === 'disabled' && 'opacity-50',
                        expanded
                          ? 'border-accent-500/40 bg-accent-500/5'
                          : 'border-primary-200 hover:border-primary-300',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedSkillId((current) =>
                            current === skill.id ? '' : skill.id,
                          )
                        }
                        className="flex w-full items-start gap-3 px-4 py-4 text-left"
                      >
                        <span
                          className={cn(
                            'flex size-11 shrink-0 items-center justify-center rounded-2xl text-xl',
                            skill.tone,
                          )}
                        >
                          {skill.emoji}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-primary-900">
                              {skill.name}
                            </span>
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                                CATEGORY_BADGE_CLASS[skill.category],
                              )}
                            >
                              {skill.category}
                            </span>
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize',
                                STATUS_BADGE_CLASS[skill.status],
                              )}
                            >
                              {skill.status}
                            </span>
                          </span>
                          <span className="mt-1 block text-sm text-primary-600">
                            {skill.description}
                          </span>
                        </span>
                        <HugeiconsIcon
                          icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
                          size={18}
                          strokeWidth={1.7}
                          className="mt-0.5 shrink-0 text-primary-500"
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {expanded ? (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.16 }}
                            className="overflow-hidden border-t border-primary-200"
                          >
                            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-start gap-3 text-sm text-primary-600">
                                <HugeiconsIcon
                                  icon={SparklesIcon}
                                  size={18}
                                  strokeWidth={1.7}
                                  className="mt-0.5 shrink-0 text-accent-300"
                                />
                                <p>
                                  {skill.status === 'active'
                                    ? 'Installed and ready to use in the workspace.'
                                    : 'Installed package exists, but this skill is currently disabled.'}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant={
                                  skill.status === 'active'
                                    ? 'secondary'
                                    : 'outline'
                                }
                                onClick={() =>
                                  toast(
                                    skill.status === 'active'
                                      ? `${skill.name} is already enabled`
                                      : `${skill.name} cannot be enabled yet`,
                                    {
                                      type:
                                        skill.status === 'active'
                                          ? 'info'
                                          : 'warning',
                                    },
                                  )
                                }
                              >
                                {skill.status === 'active' ? 'Enabled' : 'Disabled'}
                              </Button>
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>

              {selectedSkill ? (
                <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-3 text-sm text-primary-600">
                  Selected skill:{" "}
                  <span className="font-medium text-primary-900">
                    {selectedSkill.name}
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="min-h-0 border-l-0 border-primary-200 lg:border-l">
            <div className="flex h-full min-h-0 flex-col p-4 sm:p-5">
              <div className="flex flex-col gap-3 border-b border-primary-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-[15px] font-semibold text-primary-900">
                  Memory
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleComingSoon}
                  >
                    Export
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleClearAll}
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              <div className="py-4">
                <div className="relative">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    size={16}
                    strokeWidth={1.8}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary-500"
                  />
                  <input
                    value={memorySearch}
                    onChange={(event) => setMemorySearch(event.target.value)}
                    placeholder="Search memory..."
                    className="w-full rounded-xl border border-primary-200 bg-white px-10 py-2.5 text-sm text-primary-900 outline-none transition-colors placeholder:text-primary-500 focus:border-accent-500/50"
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {MEMORY_FILTERS.map((filter) => {
                    const active = filter === memoryFilter
                    return (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setMemoryFilter(filter)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                          active
                            ? 'border-accent-500/40 bg-accent-500/10 text-accent-400'
                            : 'border-primary-200 bg-white text-primary-600 hover:border-primary-300 hover:text-primary-900',
                        )}
                      >
                        {filter}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
                {memoryQuery.isPending ? (
                  <div className="rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-5 text-sm text-primary-600">
                    Loading memory files...
                  </div>
                ) : memoryQuery.isError ? (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-5 text-sm text-red-200">
                    {memoryQuery.error instanceof Error
                      ? memoryQuery.error.message
                      : 'Failed to load memory files'}
                  </div>
                ) : (
                  <>
                    <MemorySectionBlock
                      title={sectionLabel('workspace')}
                      files={workspaceFiles}
                      selectedPath={selectedMemoryPath}
                      onSelect={setSelectedMemoryPath}
                    />
                    <MemorySectionBlock
                      title={sectionLabel('project')}
                      files={projectFiles}
                      selectedPath={selectedMemoryPath}
                      onSelect={setSelectedMemoryPath}
                    />
                    <MemorySectionBlock
                      title={sectionLabel('agent')}
                      files={agentFiles}
                      selectedPath={selectedMemoryPath}
                      onSelect={setSelectedMemoryPath}
                    />
                  </>
                )}

                {!memoryQuery.isPending &&
                !memoryQuery.isError &&
                filteredMemoryFiles.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-4 py-5 text-sm text-primary-500">
                    No memory files match the current filter.
                  </div>
                ) : null}

                <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-4">
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-400">
                    Retention
                  </div>
                  <div className="space-y-2 text-sm text-primary-300">
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-primary-800 bg-primary-900/60 px-3 py-2">
                      <span>Workspace memory</span>
                      <span className="font-medium text-primary-100">
                        Permanent
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-primary-800 bg-primary-900/60 px-3 py-2">
                      <span>Project memory</span>
                      <span className="font-medium text-primary-100">
                        Per-project
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-primary-800 bg-primary-900/60 px-3 py-2">
                      <span>Agent memory</span>
                      <span className="font-medium text-primary-100">
                        30 day rolling
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function MemorySectionBlock({
  title,
  files,
  selectedPath,
  onSelect,
}: {
  title: string
  files: Array<MemoryFileItem>
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-400">
        {title}
      </div>

      {files.length === 0 ? (
        <EmptyMemorySection label={title} />
      ) : (
        <div className="space-y-2">
          {files.map((file) => {
            const active = selectedPath === file.path
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => onSelect(file.path)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                  active
                    ? 'border-accent-500/40 bg-accent-500/5'
                    : 'border-primary-800 bg-primary-950/50 hover:border-primary-700',
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary-800 bg-primary-900 text-primary-300">
                  <HugeiconsIcon
                    icon={File01Icon}
                    size={16}
                    strokeWidth={1.7}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-primary-100">
                    {file.name}
                  </span>
                  <span className="block truncate text-xs text-primary-400">
                    {file.path}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-primary-400">
                  {file.size}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
