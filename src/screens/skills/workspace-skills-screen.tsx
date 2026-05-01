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
import { Markdown } from '@/components/prompt-kit/markdown'

function SkillMarkdown({ content }: { content: string }) {
  return <Markdown>{content}</Markdown>
}

type MemoryFilter = 'All' | 'Workspace' | 'Project' | 'Agent'
type MemorySection = 'workspace' | 'project' | 'agent'

type SkillItem = {
  id: string
  name: string
  description: string
  path: string
  status: 'active'
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

type SkillsResponse = {
  skills: Array<SkillItem>
}

type SkillContentResponse = {
  content?: string | null
}

const MEMORY_FILTERS: Array<MemoryFilter> = [
  'All',
  'Workspace',
  'Project',
  'Agent',
]

const STATUS_BADGE_CLASS: Record<SkillItem['status'], string> = {
  active: 'border-green-200 bg-green-50 text-green-700',
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function apiRequest(input: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(input, init)
  const payload = await readPayload(response)

  if (!response.ok) {
    const record =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null

    throw new Error(
      (typeof record?.error === 'string' && record.error) ||
        (typeof record?.message === 'string' && record.message) ||
        `Request failed with status ${response.status}`,
    )
  }

  return payload
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
    <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-3 py-4 text-xs text-primary-500">
      No files found in {label.toLowerCase()}.
    </div>
  )
}

export function WorkspaceSkillsScreen() {
  const [selectedSkillId, setSelectedSkillId] = useState<string>('')
  const [memoryFilter, setMemoryFilter] = useState<MemoryFilter>('All')
  const [memorySearch, setMemorySearch] = useState('')
  const deferredSearch = useDeferredValue(memorySearch)
  const [selectedMemoryPath, setSelectedMemoryPath] = useState<string | null>(
    null,
  )

  const skillsQuery = useQuery({
    queryKey: ['workspace', 'skills'],
    queryFn: async function fetchSkills(): Promise<SkillsResponse> {
      const payload = await apiRequest('/api/workspace/skills')

      return {
        skills: Array.isArray((payload as SkillsResponse).skills)
          ? (payload as SkillsResponse).skills
          : [],
      }
    },
  })

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

  const visibleSkills = skillsQuery.data?.skills ?? []
  const skillContentQuery = useQuery({
    queryKey: ['workspace', 'skills', selectedSkillId, 'content'],
    enabled: selectedSkillId.length > 0,
    queryFn: async function fetchSkillContent(): Promise<string> {
      const payload = (await apiRequest(
        `/api/workspace/skills/${encodeURIComponent(selectedSkillId)}/content`,
      )) as SkillContentResponse
      return typeof payload.content === 'string' ? payload.content : ''
    },
  })

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
  const agentFiles = filteredMemoryFiles.filter(
    (file) => file.section === 'agent',
  )

  const selectedSkill =
    visibleSkills.find((skill) => skill.id === selectedSkillId) ??
    visibleSkills[0] ??
    null

  useEffect(() => {
    if (
      selectedSkillId &&
      visibleSkills.some((skill) => skill.id === selectedSkillId)
    ) {
      return
    }

    setSelectedSkillId(visibleSkills[0]?.id ?? '')
  }, [selectedSkillId, visibleSkills])

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
    <div className="min-h-full px-4 pb-10 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto flex min-h-full w-full max-w-[1480px] flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-accent-500/30 bg-accent-500/10 text-accent-400">
              <HugeiconsIcon icon={SparklesIcon} size={24} strokeWidth={1.6} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-primary-900">
                Skills
              </h1>
              <p className="mt-1 text-sm text-primary-500">
                Installed skills and workspace memory sources
              </p>
            </div>
          </div>
        </header>

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
                    Browse Skills Hub
                  </Button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                {skillsQuery.isPending ? (
                  <div className="rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-5 text-sm text-primary-600">
                    Loading skills...
                  </div>
                ) : skillsQuery.isError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-600">
                    {skillsQuery.error instanceof Error
                      ? skillsQuery.error.message
                      : 'Failed to load skills'}
                  </div>
                ) : visibleSkills.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-4 py-5 text-sm text-primary-500">
                    No skills found in `~/.claude/skills` for Claude.
                  </div>
                ) : (
                  visibleSkills.map((skill) => {
                    const expanded = selectedSkillId === skill.id
                    return (
                      <div
                        key={skill.id}
                        className={cn(
                          'overflow-hidden rounded-xl border bg-primary-50/60 transition-all',
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
                          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-accent-500/20 bg-accent-500/10 text-accent-400">
                            <HugeiconsIcon
                              icon={SparklesIcon}
                              size={18}
                              strokeWidth={1.7}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-primary-900">
                                {skill.name}
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
                                  <div className="space-y-1">
                                    <p>
                                      Installed and ready to use in the
                                      workspace.
                                    </p>
                                    <p className="break-all text-xs text-primary-500">
                                      {skill.path}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    toast(`${skill.name} is installed`, {
                                      type: 'info',
                                    })
                                  }
                                >
                                  Enabled
                                </Button>
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    )
                  })
                )}
              </div>

              {selectedSkill ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-3 text-sm text-primary-600">
                    Selected skill:{' '}
                    <span className="font-medium text-primary-900">
                      {selectedSkill.name}
                    </span>
                  </div>
                  <div className="rounded-xl border border-primary-200 bg-white p-3">
                    {skillContentQuery.isPending ? (
                      <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div
                            key={index}
                            className="h-4 animate-pulse rounded bg-primary-100"
                          />
                        ))}
                      </div>
                    ) : skillContentQuery.isError ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                        {skillContentQuery.error instanceof Error
                          ? skillContentQuery.error.message
                          : 'Failed to load skill content'}
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto rounded-lg border border-primary-200 bg-white p-4 text-sm text-primary-800 prose prose-sm prose-primary max-w-none">
                        <SkillMarkdown
                          content={
                            skillContentQuery.data?.trim() ||
                            'No content available.'
                          }
                        />
                      </div>
                    )}
                  </div>
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
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-600">
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
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2">
                      <span className="text-primary-600">Workspace memory</span>
                      <span className="font-medium text-primary-900">
                        Permanent
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2">
                      <span className="text-primary-600">Project memory</span>
                      <span className="font-medium text-primary-900">
                        Per-project
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2">
                      <span className="text-primary-600">Agent memory</span>
                      <span className="font-medium text-primary-900">
                        30 day rolling
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
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
                    : 'border-primary-200 bg-white hover:border-primary-300',
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-primary-500">
                  <HugeiconsIcon
                    icon={File01Icon}
                    size={16}
                    strokeWidth={1.7}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-primary-900">
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
