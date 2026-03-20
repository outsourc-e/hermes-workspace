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
    .filter((file) => file.path.startsWith('memory/') || file.path.startsWith('memories/'))
    .sort((a, b) => {
      if (isDailyMemoryPath(a.path) && isDailyMemoryPath(b.path)) {
        return b.path.localeCompare(a.path)
      }
      return Date.parse(b.modified) - Date.parse(a.modified) || a.path.localeCompare(b.path)
    })

  return { rootMemory, memoryFiles }
}

function highlightMatch(text: string, query: string): Array<{ text: string; hit: boolean }> {
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
      readJson<SearchResponse>(`/api/memory/search?q=${encodeURIComponent(searchTerm)}`),
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

  function trySelectFile(nextPath: string, nextFocusLine?: number): boolean {
    if (nextPath !== selectedPath && isEditing && hasUnsavedChanges) {
      const confirmed =
        typeof window === 'undefined'
          ? true
          : window.confirm('You have unsaved changes. Discard them and switch files?')
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
      const message = error instanceof Error ? error.message : 'Failed to save file'
      toast(message, { type: 'warning' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text)' }}>
      <div className="px-3 py-3 md:px-4" style={{ borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-bg)' }}>
        <div className="flex items-center gap-3">
          <div className="inline-flex size-9 items-center justify-center rounded-xl" style={{ border: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-card)', color: 'var(--theme-text)' }}>
            <HugeiconsIcon icon={BrainIcon} size={18} strokeWidth={1.6} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                strokeWidth={1.7}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--theme-muted)' }}
              />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search memory files"
                className="w-full rounded-xl py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent-500"
                style={{ border: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-card)', color: 'var(--theme-text)' }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-3 md:p-4">
        <aside className="flex min-h-0 flex-col rounded-2xl border border-primary-200 bg-primary-50 dark:border-neutral-800 dark:bg-neutral-950 md:col-span-1">
          <button
            type="button"
            className="flex items-center justify-between px-3 py-2 text-left md:cursor-default"
            onClick={() => setMobileFilesOpen((value) => !value)}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-neutral-400">
              Memory Files ({fileItems.length})
            </span>
            <span className="md:hidden text-primary-500 dark:text-neutral-400">
              <HugeiconsIcon icon={mobileFilesOpen ? ArrowUp01Icon : ArrowDown01Icon} size={16} strokeWidth={1.7} />
            </span>
          </button>

          {searchEnabled ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-primary-400 dark:text-neutral-500">
                Search Results
              </div>
              <div className="space-y-1">
                {searchQuery.isLoading ? (
                  <div className="rounded-lg border border-primary-200 bg-primary-50/80 px-3 py-2 text-xs text-primary-400 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-500">
                    Searching...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="rounded-lg border border-primary-200 bg-primary-50/80 px-3 py-2 text-xs text-primary-400 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-500">
                    No matches
                  </div>
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
                      className="w-full rounded-lg border border-primary-200 bg-primary-50/80 px-2.5 py-2 text-left hover:border-primary-300 hover:bg-primary-100 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
                    >
                      <div className="truncate text-[11px] text-primary-500 dark:text-neutral-400">
                        {result.path}:{result.line}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-primary-700 dark:text-neutral-200">
                        {highlightMatch(result.text, searchTerm).map((part, partIndex) => (
                          <span
                            key={partIndex}
                            className={part.hit ? 'rounded bg-yellow-300/30 px-0.5 text-yellow-200' : undefined}
                          >
                            {part.text || ' '}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className={cn('min-h-0 flex-1 px-2 pb-2', !mobileFilesOpen && 'hidden md:block')}>
              <div className="max-h-72 space-y-1 overflow-y-auto pr-1 md:h-full md:max-h-none">
                {rootMemory ? (
                  <FileRow
                    file={rootMemory}
                    selected={selectedPath === rootMemory.path}
                    onSelect={(pathValue) => {
                      trySelectFile(pathValue)
                    }}
                  />
                ) : null}

                <div className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-primary-400 dark:text-neutral-500">
                  memory/ or memories/
                </div>
                {memoryFiles.length === 0 ? (
                  <div className="rounded-lg border border-primary-200 bg-primary-50/80 px-3 py-2 text-xs text-primary-400 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-500">
                    No files in memory/ or memories/
                  </div>
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

        <section className="min-h-0 rounded-2xl border border-primary-200 bg-primary-50 dark:border-neutral-800 dark:bg-neutral-950 md:col-span-2">
          <div className="flex items-center justify-between border-b border-primary-200 px-3 py-2 dark:border-neutral-800">
            <div className="min-w-0">
              <div className="truncate font-mono text-sm text-primary-900 dark:text-neutral-100">
                {selectedPath || 'Select a file'}
              </div>
              {selectedPath ? (
                <div className="text-xs text-primary-400 dark:text-neutral-500">
                  {selectedFileMeta?.size != null
                    ? `${formatBytes(selectedFileMeta.size)} · ${formatModified(selectedFileMeta.modified)}`
                    : 'Loading metadata...'}
                </div>
              ) : null}
            </div>
            {selectedPath ? (
              <div className="ml-3 flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleSaveEditing}
                      className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleCancelEditing}
                      className="rounded-md border border-primary-200 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary-300 hover:bg-primary-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
                    >
                      Cancel
                    </button>
                    {hasUnsavedChanges ? (
                      <span
                        title="Unsaved changes"
                        className="inline-block size-2 rounded-full bg-amber-400"
                      />
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartEditing}
                    className="relative inline-flex items-center gap-1.5 rounded-md border border-primary-200 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary-300 hover:bg-primary-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
                  >
                    <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.7} />
                    Edit
                    {hasUnsavedChanges ? (
                      <span className="absolute -right-1 -top-1 size-2 rounded-full bg-amber-400" />
                    ) : null}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <div className={cn('h-full p-2 md:p-3', isEditing ? 'overflow-hidden' : 'overflow-auto')}>
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
              <div className="h-full rounded-xl p-2" style={{ border: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-card)' }}>
                <textarea
                  value={draftContent}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setDraftContent(nextValue)
                    setHasUnsavedChanges(nextValue !== content)
                  }}
                  className="h-full w-full resize-none rounded-lg px-3 py-2 font-mono text-[13px] outline-none ring-0"
                  style={{ border: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text)' }}
                  spellCheck={false}
                />
              </div>
            ) : (
              <div className="rounded-xl" style={{ border: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-card)' }}>
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
                          'grid grid-cols-[56px_1fr] gap-0 border-b border-primary-200/80 last:border-b-0 dark:border-neutral-900/80',
                          highlighted && 'bg-yellow-300/10',
                        )}
                      >
                        <div className={cn('select-none border-r border-primary-200 px-2 py-0.5 text-right text-primary-400 dark:border-neutral-800 dark:text-neutral-600', highlighted && 'text-yellow-200')}>
                          {lineNumber}
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-0.5 text-primary-800 dark:text-neutral-200">{line || ' '}</pre>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
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
        'w-full rounded-lg border px-2.5 py-2 text-left transition-colors',
        selected
          ? 'border-accent-500/70 bg-accent-500/10'
          : 'border-primary-200 bg-primary-50/80 hover:border-primary-300 hover:bg-primary-100 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-700 dark:hover:bg-neutral-900',
      )}
    >
      <div className="truncate font-mono text-xs text-primary-900 dark:text-neutral-100">{file.path}</div>
      <div className="mt-0.5 text-[11px] text-primary-400 dark:text-neutral-500">
        {formatBytes(file.size)} · {formatModified(file.modified)}
      </div>
    </button>
  )
}

function StateBox({ label, error }: { label: string; error?: boolean }) {
  return (
    <div
      className={cn(
        'flex min-h-32 items-center justify-center rounded-xl border px-4 text-sm',
        error
          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300'
          : 'border-primary-200 bg-primary-50 text-primary-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400',
      )}
    >
      {label}
    </div>
  )
}
