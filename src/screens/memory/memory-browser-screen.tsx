import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  BrainIcon,
  PencilEdit02Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type MemoryFileMeta = {
  path: string
  name: string
  size: number
  modified: string
}

type MemorySearchMatch = {
  path: string
  line: number
  text: string
}

type ListResponse = { files?: Array<MemoryFileMeta> }
type ReadResponse = { path?: string; content?: string }
type SearchResponse = { results?: Array<MemorySearchMatch> }
type WriteResponse = { success?: boolean; path?: string; error?: string }

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatModified(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function isDailyMemoryPath(pathValue: string): boolean {
  return /^memories?\/\d{4}-\d{2}-\d{2}\.md$/.test(pathValue)
}

function splitFiles(files: Array<MemoryFileMeta>) {
  const rootMemory = files.find((file) => file.path === 'MEMORY.md') || null
  const memoryFiles = files
    .filter(
      (file) =>
        file.path.startsWith('memory/') || file.path.startsWith('memories/'),
    )
    .sort((a, b) => {
      if (isDailyMemoryPath(a.path) && isDailyMemoryPath(b.path)) {
        return b.path.localeCompare(a.path)
      }
      return (
        Date.parse(b.modified) - Date.parse(a.modified) ||
        a.path.localeCompare(b.path)
      )
    })

  return { rootMemory, memoryFiles }
}

function highlightMatch(
  text: string,
  query: string,
): Array<{ text: string; hit: boolean }> {
  const needle = query.trim()
  if (!needle) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const matchLower = needle.toLowerCase()
  const parts: Array<{ text: string; hit: boolean }> = []
  let cursor = 0
  while (cursor < text.length) {
    const index = lower.indexOf(matchLower, cursor)
    if (index < 0) {
      parts.push({ text: text.slice(cursor), hit: false })
      break
    }
    if (index > cursor) {
      parts.push({ text: text.slice(cursor, index), hit: false })
    }
    parts.push({ text: text.slice(index, index + needle.length), hit: true })
    cursor = index + needle.length
  }
  return parts.length > 0 ? parts : [{ text, hit: false }]
}

export function MemoryBrowserScreen() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const deferredSearch = useDeferredValue(searchInput)
  const [mobileFilesOpen, setMobileFilesOpen] = useState(true)
  const [focusLine, setFocusLine] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [draftContent, setDraftContent] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const queryClient = useQueryClient()
  const searchTerm = deferredSearch.trim()

  const filesQuery = useQuery({
    queryKey: ['memory', 'list'],
    queryFn: () => readJson<ListResponse>('/api/memory/list'),
  })

  const files = filesQuery.data?.files ?? []
  const { rootMemory, memoryFiles } = useMemo(() => splitFiles(files), [files])

  useEffect(() => {
    if (selectedPath) return
    if (rootMemory) {
      setSelectedPath(rootMemory.path)
      return
    }
    if (memoryFiles[0]) setSelectedPath(memoryFiles[0].path)
  }, [selectedPath, rootMemory, memoryFiles])

  const contentQuery = useQuery({
    queryKey: ['memory', 'read', selectedPath],
    queryFn: () =>
      readJson<ReadResponse>(
        `/api/memory/read?path=${encodeURIComponent(selectedPath || '')}`,
      ),
    enabled: Boolean(selectedPath),
  })

  const searchEnabled = searchTerm.length > 0
  const searchQuery = useQuery({
    queryKey: ['memory', 'search', searchTerm],
    queryFn: () =>
      readJson<SearchResponse>(
        `/api/memory/search?q=${encodeURIComponent(searchTerm)}`,
      ),
    enabled: searchEnabled,
  })

  const content = contentQuery.data?.content || ''
  const lines = useMemo(() => content.split(/\r?\n/), [content])

  useEffect(() => {
    if (isEditing) return
    setDraftContent(content)
    setHasUnsavedChanges(false)
  }, [content, isEditing, selectedPath])

  useEffect(() => {
    if (!focusLine) return
    const target = lineRefs.current[focusLine]
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusLine, lines, selectedPath])

  const fileItems = useMemo(() => {
    const items: Array<MemoryFileMeta> = []
    if (rootMemory) items.push(rootMemory)
    items.push(...memoryFiles)
    return items
  }, [rootMemory, memoryFiles])
  const selectedFileMeta = useMemo(
    () => fileItems.find((file) => file.path === selectedPath) ?? null,
    [fileItems, selectedPath],
  )

  const searchResults = searchQuery.data?.results ?? []
  const totalSize = useMemo(
    () => fileItems.reduce((sum, file) => sum + file.size, 0),
    [fileItems],
  )
  const recentFiles = useMemo(() => fileItems.slice(0, 3), [fileItems])
  const selectedKind = selectedPath
    ? selectedPath === 'MEMORY.md'
      ? 'core memory'
      : selectedPath.includes('/')
        ? selectedPath.split('/')[0]
        : 'memory file'
    : 'none'
  const suggestionItems = selectedPath
    ? [
        'Distill durable rule',
        'Find related notes',
        'Queue for review',
        hasUnsavedChanges ? 'Save or discard draft' : 'Name next action',
      ]
    : ['Select a memory file', 'Search for a pattern', 'Open recent captures']

  function trySelectFile(nextPath: string, nextFocusLine?: number): boolean {
    if (nextPath !== selectedPath && isEditing && hasUnsavedChanges) {
      const confirmed =
        typeof window === 'undefined'
          ? true
          : window.confirm(
              'You have unsaved changes. Discard them and switch files?',
            )
      if (!confirmed) return false
    }

    if (nextPath !== selectedPath && isEditing) {
      setIsEditing(false)
      setHasUnsavedChanges(false)
      setDraftContent('')
    }

    setSelectedPath(nextPath)
    setFocusLine(nextFocusLine ?? null)
    return true
  }

  function handleStartEditing() {
    setDraftContent(content)
    setHasUnsavedChanges(false)
    setIsEditing(true)
  }

  function handleCancelEditing() {
    setDraftContent(content)
    setHasUnsavedChanges(false)
    setIsEditing(false)
  }

  async function handleSaveEditing() {
    if (!selectedPath || isSaving) return
    setIsSaving(true)
    try {
      const response = await fetch('/api/memory/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath, content: draftContent }),
      })
      const payload = (await response.json().catch(() => ({}))) as WriteResponse
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || `Save failed (${response.status})`)
      }

      await queryClient.invalidateQueries({ queryKey: ['memory'] })
      setIsEditing(false)
      setHasUnsavedChanges(false)
      toast('Saved ✓', { type: 'success' })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save file'
      toast(message, { type: 'warning' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#050711] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.28),transparent_34%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.98))]" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="border-b border-white/10 bg-white/[0.03] px-3 py-3 shadow-[0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl md:px-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="inline-flex size-10 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 shadow-[0_0_32px_rgba(34,211,238,0.16)]">
                <HugeiconsIcon icon={BrainIcon} size={19} strokeWidth={1.7} />
              </div>
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                  AI Memory Dashboard
                </div>
                <div className="text-xs text-slate-400">
                  Operational second brain · drafts stay human-approved
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-2 lg:max-w-2xl lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={16}
                  strokeWidth={1.7}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search memory, captures, decisions..."
                  className="w-full rounded-2xl border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60 focus:bg-black/40"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <StatusChip label="M2 lane" tone="cyan" />
                <StatusChip label={`${fileItems.length} files`} />
                <StatusChip label={`${formatBytes(totalSize)}`} />
                <StatusChip label={hasUnsavedChanges ? 'unsaved draft' : 'review to commit'} tone={hasUnsavedChanges ? 'amber' : 'violet'} />
              </div>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[280px_minmax(0,1fr)_320px] lg:p-4">
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/30 backdrop-blur-xl">
            <button
              type="button"
              className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-left lg:cursor-default"
              onClick={() => setMobileFilesOpen((value) => !value)}
            >
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Memory queue
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {fileItems.length} objects
                </div>
              </div>
              <span className="lg:hidden text-slate-400">
                <HugeiconsIcon
                  icon={mobileFilesOpen ? ArrowUp01Icon : ArrowDown01Icon}
                  size={16}
                  strokeWidth={1.7}
                />
              </span>
            </button>

            <div className="grid grid-cols-2 gap-2 border-b border-white/10 p-3">
              <MetricCard label="Core" value={rootMemory ? '1' : '0'} />
              <MetricCard label="Daily" value={String(memoryFiles.length)} />
              <MetricCard label="Search" value={searchEnabled ? String(searchResults.length) : 'idle'} />
              <MetricCard label="Mode" value={isEditing ? 'edit' : 'read'} />
            </div>

            {searchEnabled ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
                <PanelLabel>Search Results</PanelLabel>
                <div className="mt-2 space-y-2">
                  {searchQuery.isLoading ? (
                    <StateBox label="Searching..." />
                  ) : searchResults.length === 0 ? (
                    <StateBox label="No matches" />
                  ) : (
                    searchResults.map((result, index) => (
                      <button
                        key={`${result.path}:${result.line}:${index}`}
                        type="button"
                        onClick={() => {
                          if (trySelectFile(result.path, result.line)) {
                            setMobileFilesOpen(false)
                          }
                        }}
                        className="w-full rounded-2xl border border-white/10 bg-black/24 px-3 py-2 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
                      >
                        <div className="truncate text-[11px] text-cyan-200/80">
                          {result.path}:{result.line}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-slate-200">
                          {highlightMatch(result.text, searchTerm).map(
                            (part, partIndex) => (
                              <span
                                key={partIndex}
                                className={
                                  part.hit
                                    ? 'rounded bg-yellow-300/25 px-0.5 text-yellow-100'
                                    : undefined
                                }
                              >
                                {part.text || ' '}
                              </span>
                            ),
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  'min-h-0 flex-1 px-3 pb-3 pt-3',
                  !mobileFilesOpen && 'hidden lg:block',
                )}
              >
                <PanelLabel>Vault navigation</PanelLabel>
                <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1 lg:h-full lg:max-h-none">
                  {rootMemory ? (
                    <FileRow
                      file={rootMemory}
                      selected={selectedPath === rootMemory.path}
                      onSelect={(pathValue) => {
                        trySelectFile(pathValue)
                      }}
                    />
                  ) : null}

                  <div className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    memory / memories
                  </div>
                  {memoryFiles.length === 0 ? (
                    <StateBox label="No files in memory/ or memories/" />
                  ) : (
                    memoryFiles.map((file) => (
                      <FileRow
                        key={file.path}
                        file={file}
                        selected={selectedPath === file.path}
                        onSelect={(pathValue) => {
                          trySelectFile(pathValue)
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </aside>

          <main className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-200/70">
                  Active memory object
                </div>
                <div className="mt-1 truncate font-mono text-sm text-white">
                  {selectedPath || 'Select a file'}
                </div>
                {selectedPath ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>{selectedKind}</span>
                    <span>·</span>
                    <span>{selectedFileMeta?.size != null ? formatBytes(selectedFileMeta.size) : 'Loading size...'}</span>
                    <span>·</span>
                    <span>{selectedFileMeta?.modified ? formatModified(selectedFileMeta.modified) : 'Loading date...'}</span>
                  </div>
                ) : null}
              </div>
              {selectedPath ? (
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={handleSaveEditing}
                        className="rounded-xl bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.28)] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save draft'}
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={handleCancelEditing}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartEditing}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
                    >
                      <HugeiconsIcon
                        icon={PencilEdit02Icon}
                        size={14}
                        strokeWidth={1.7}
                      />
                      Edit
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            <div
              className={cn(
                'min-h-0 flex-1 p-3 md:p-4',
                isEditing ? 'overflow-hidden' : 'overflow-auto',
              )}
            >
              {filesQuery.isLoading ? (
                <StateBox label="Loading memory files..." />
              ) : filesQuery.error instanceof Error ? (
                <StateBox label={filesQuery.error.message} error />
              ) : !selectedPath ? (
                <StateBox label="No memory files found" />
              ) : contentQuery.isLoading ? (
                <StateBox label="Loading file..." />
              ) : contentQuery.error instanceof Error ? (
                <StateBox label={contentQuery.error.message} error />
              ) : isEditing ? (
                <div className="h-full rounded-2xl border border-cyan-300/20 bg-black/32 p-2 shadow-inner shadow-black/40">
                  <textarea
                    value={draftContent}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      setDraftContent(nextValue)
                      setHasUnsavedChanges(nextValue !== content)
                    }}
                    className="h-full w-full resize-none rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 font-mono text-[13px] text-slate-100 outline-none ring-0 focus:border-cyan-300/50"
                    spellCheck={false}
                  />
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/72 shadow-inner shadow-black/40">
                  <div className="font-mono text-xs">
                    {lines.map((line, index) => {
                      const lineNumber = index + 1
                      const highlighted = focusLine === lineNumber
                      return (
                        <div
                          key={lineNumber}
                          ref={(node) => {
                            lineRefs.current[lineNumber] = node
                          }}
                          className={cn(
                            'grid grid-cols-[56px_1fr] gap-0 border-b border-white/5 last:border-b-0',
                            highlighted && 'bg-cyan-300/10',
                          )}
                        >
                          <div
                            className={cn(
                              'select-none border-r border-white/5 px-2 py-0.5 text-right text-slate-600',
                              highlighted && 'text-cyan-200',
                            )}
                          >
                            {lineNumber}
                          </div>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-0.5 text-slate-200">
                            {line || ' '}
                          </pre>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </main>

          <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-3xl border border-white/10 bg-white/[0.045] p-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <section className="rounded-2xl border border-white/10 bg-black/24 p-3">
              <PanelLabel>Properties</PanelLabel>
              <div className="mt-3 space-y-2 text-xs">
                <PropertyRow label="Path" value={selectedPath || 'none'} mono />
                <PropertyRow label="Kind" value={selectedKind} />
                <PropertyRow label="Lines" value={selectedPath ? String(lines.length) : '0'} />
                <PropertyRow
                  label="Modified"
                  value={selectedFileMeta?.modified ? formatModified(selectedFileMeta.modified) : 'n/a'}
                />
                <PropertyRow label="Draft" value={hasUnsavedChanges ? 'unsaved' : 'clean'} />
              </div>
            </section>

            <section className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.07] p-3">
              <PanelLabel>Hermes suggestions</PanelLabel>
              <div className="mt-3 space-y-2">
                {suggestionItems.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="w-full rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:border-violet-300/40 hover:bg-violet-300/10"
                  >
                    {item}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">
                Suggestions are draft actions. Durable memory changes still need an explicit save and git commit.
              </p>
            </section>

            <section className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.06] p-3">
              <PanelLabel>Sync safety</PanelLabel>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MetricCard label="Machine" value="M2" />
                <MetricCard label="ASUS" value="verify" />
                <MetricCard label="Repo" value="git" />
                <MetricCard label="Rule" value="pull first" />
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">
                M2 owns this UI change first. ASUS should clone/pull after M2 pushes, then rebuild and verify.
              </p>
            </section>

            <section className="rounded-2xl border border-white/10 bg-black/24 p-3">
              <PanelLabel>Recent memory</PanelLabel>
              <div className="mt-3 space-y-2">
                {recentFiles.length === 0 ? (
                  <div className="text-xs text-slate-500">No recent files</div>
                ) : (
                  recentFiles.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => trySelectFile(file.path)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
                    >
                      <div className="truncate font-mono text-[11px] text-slate-200">
                        {file.path}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {formatBytes(file.size)} · {formatModified(file.modified)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

function FileRow({
  file,
  selected,
  onSelect,
}: {
  file: MemoryFileMeta
  selected: boolean
  onSelect: (pathValue: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(file.path)}
      className={cn(
        'w-full rounded-2xl border px-3 py-2 text-left transition',
        selected
          ? 'border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_28px_rgba(34,211,238,0.12)]'
          : 'border-white/10 bg-black/24 hover:border-cyan-300/35 hover:bg-cyan-300/10',
      )}
    >
      <div className="truncate font-mono text-xs text-slate-100">
        {file.path}
      </div>
      <div className="mt-1 text-[11px] text-slate-500">
        {formatBytes(file.size)} · {formatModified(file.modified)}
      </div>
    </button>
  )
}

function StatusChip({
  label,
  tone = 'slate',
}: {
  label: string
  tone?: 'slate' | 'cyan' | 'violet' | 'amber'
}) {
  const toneClass = {
    slate: 'border-white/10 bg-white/[0.06] text-slate-300',
    cyan: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
    violet: 'border-violet-300/25 bg-violet-300/10 text-violet-100',
    amber: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  }[tone]

  return (
    <span className={cn('rounded-full border px-2.5 py-1 font-medium', toneClass)}>
      {label}
    </span>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/24 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-100">
        {value}
      </div>
    </div>
  )
}

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
      {children}
    </div>
  )
}

function PropertyRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-right text-slate-200',
          mono && 'font-mono',
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

function StateBox({ label, error }: { label: string; error?: boolean }) {
  return (
    <div
      className={cn(
        'flex min-h-32 items-center justify-center rounded-2xl border px-4 text-sm',
        error
          ? 'border-red-300/40 bg-red-500/10 text-red-200'
          : 'border-white/10 bg-black/24 text-slate-400',
      )}
    >
      {label}
    </div>
  )
}
