import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  BrainIcon,
  CodeIcon,
  File01Icon,
  Folder01Icon,
  Link01Icon,
  Message01Icon,
  Search01Icon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Markdown } from '@/components/prompt-kit/markdown'
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type WikiPageMeta = {
  path: string
  name: string
  title: string
  type?: string
  domain?: string
  status?: string
  tags: Array<string>
  summary?: string
  created?: string
  updated?: string
  size: number
  modified: string
  wikilinks: Array<string>
}

type KnowledgeSource =
  | { type: 'local'; path: string }
  | { type: 'github'; repo: string; branch: string; path: string }

type KnowledgeListResponse = {
  pages?: Array<WikiPageMeta>
  knowledgeRoot?: string
  exists?: boolean
  source?: KnowledgeSource
}

type KnowledgeReadResponse = {
  page?: WikiPageMeta
  content?: string
  backlinks?: Array<string>
}

type KnowledgeSearchResult = {
  path: string
  title: string
  line: number
  text: string
}

type KnowledgeSearchResponse = {
  results?: Array<KnowledgeSearchResult>
}

type KnowledgeGraphNode = {
  id: string
  title: string
  type?: string
  tags?: Array<string>
}

type KnowledgeGraphEdge = {
  source: string
  target: string
}

type KnowledgeGraphResponse = {
  nodes?: Array<KnowledgeGraphNode>
  edges?: Array<KnowledgeGraphEdge>
}

type TreeNode = {
  name: string
  path: string
  folders: Array<TreeNode>
  pages: Array<WikiPageMeta>
}

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

function formatDate(value?: string): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
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

function normalizeWikiToken(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, '/').replace(/\.md$/i, '')
}

function preprocessWikiMarkdown(content: string): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (_match, rawLink) => {
    const parts = String(rawLink).split('|')
    const target = parts[0]?.trim() ?? ''
    const label = parts[1]?.trim() || target
    return `[${label}](wiki:${encodeURIComponent(target)})`
  })
}

function buildKnowledgeTree(pages: Array<WikiPageMeta>): TreeNode {
  const root: TreeNode = { name: 'root', path: '', folders: [], pages: [] }

  for (const page of pages) {
    const parts = page.path.split('/').filter(Boolean)
    const folderParts = parts.slice(0, -1)
    let cursor = root

    for (const folder of folderParts) {
      let child = cursor.folders.find((entry) => entry.name === folder)
      if (!child) {
        child = {
          name: folder,
          path: cursor.path ? `${cursor.path}/${folder}` : folder,
          folders: [],
          pages: [],
        }
        cursor.folders.push(child)
      }
      cursor = child
    }

    cursor.pages.push(page)
  }

  function sortNode(node: TreeNode) {
    node.folders.sort((a, b) => a.name.localeCompare(b.name))
    node.pages.sort((a, b) => a.title.localeCompare(b.title))
    node.folders.forEach(sortNode)
  }

  sortNode(root)
  return root
}

function GraphCanvas({
  nodes,
  edges,
  onSelect,
}: {
  nodes: Array<KnowledgeGraphNode>
  edges: Array<KnowledgeGraphEdge>
  onSelect: (path: string) => void
}) {
  const layout = useMemo(() => {
    if (nodes.length === 0) return []
    const width = 900
    const height = 520
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.max(140, Math.min(width, height) / 2 - 72)

    return nodes.map((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1)
      return {
        ...node,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      }
    })
  }, [nodes])

  const byId = useMemo(
    () => new Map(layout.map((node) => [node.id, node])),
    [layout],
  )

  return (
    <div className="overflow-hidden rounded-2xl border border-primary-200 bg-primary-50 dark:border-neutral-800 dark:bg-neutral-950">
      <svg viewBox="0 0 900 520" className="h-[520px] w-full">
        {edges.map((edge, index) => {
          const source = byId.get(edge.source)
          const target = byId.get(edge.target)
          if (!source || !target) return null
          return (
            <line
              key={`${edge.source}:${edge.target}:${index}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="rgba(148, 163, 184, 0.45)"
              strokeWidth="1.25"
            />
          )
        })}

        {layout.map((node) => (
          <g
            key={node.id}
            onClick={() => onSelect(node.id)}
            className="cursor-pointer"
          >
            <circle
              cx={node.x}
              cy={node.y}
              r="16"
              fill="rgba(59, 130, 246, 0.16)"
              stroke="rgba(59, 130, 246, 0.65)"
              strokeWidth="1.5"
            />
            <text
              x={node.x}
              y={node.y + 34}
              textAnchor="middle"
              fontSize="11"
              fill="currentColor"
            >
              {node.title}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export function KnowledgeBrowserScreen() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [focusLine, setFocusLine] = useState<number | null>(null)
  const [focusedResult, setFocusedResult] =
    useState<KnowledgeSearchResult | null>(null)
  const [mobileTreeOpen, setMobileTreeOpen] = useState(true)
  const [graphOpen, setGraphOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSource, setSettingsSource] = useState<KnowledgeSource | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!settingsOpen) return
    fetch('/api/knowledge/config')
      .then((r) => r.json())
      .then((data: { config?: { source: KnowledgeSource } }) => {
        if (data.config?.source) {
          setSettingsSource(data.config.source)
        }
      })
      .catch(() => {})
  }, [settingsOpen])

  const deferredSearch = useDeferredValue(searchInput)
  const searchTerm = deferredSearch.trim()

  const listQuery = useQuery({
    queryKey: ['knowledge', 'list'],
    queryFn: () => readJson<KnowledgeListResponse>('/api/knowledge/list'),
  })

  const pages = listQuery.data?.pages ?? []
  const knowledgeRoot = listQuery.data?.knowledgeRoot ?? '~/.hermes/knowledge/'
  const knowledgeExists = listQuery.data?.exists ?? false

  const pageLookup = useMemo(() => {
    const map = new Map<string, string>()
    for (const page of pages) {
      map.set(normalizeWikiToken(page.path), page.path)
      map.set(normalizeWikiToken(page.name), page.path)
      map.set(normalizeWikiToken(page.title), page.path)
      map.set(normalizeWikiToken(page.name.replace(/\.md$/i, '')), page.path)
      const basename = page.path.split('/').pop() || page.name
      map.set(normalizeWikiToken(basename), page.path)
      map.set(normalizeWikiToken(basename.replace(/\.md$/i, '')), page.path)
    }
    return map
  }, [pages])

  const filteredPages = useMemo(() => {
    if (!selectedTag) return pages
    return pages.filter((page) => page.tags.includes(selectedTag))
  }, [pages, selectedTag])

  const tree = useMemo(() => buildKnowledgeTree(filteredPages), [filteredPages])
  const popularTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const page of pages) {
      for (const tag of page.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 16)
  }, [pages])

  useEffect(() => {
    if (!pages.length) return
    if (selectedPath && pages.some((page) => page.path === selectedPath)) return
    setSelectedPath(pages[0]?.path ?? null)
  }, [pages, selectedPath])

  const readQuery = useQuery({
    queryKey: ['knowledge', 'read', selectedPath],
    queryFn: () =>
      readJson<KnowledgeReadResponse>(
        `/api/knowledge/read?path=${encodeURIComponent(selectedPath || '')}`,
      ),
    enabled: Boolean(selectedPath),
  })

  const searchQuery = useQuery({
    queryKey: ['knowledge', 'search', searchTerm],
    queryFn: () =>
      readJson<KnowledgeSearchResponse>(
        `/api/knowledge/search?q=${encodeURIComponent(searchTerm)}`,
      ),
    enabled: searchTerm.length > 0,
  })

  const graphQuery = useQuery({
    queryKey: ['knowledge', 'graph'],
    queryFn: () => readJson<KnowledgeGraphResponse>('/api/knowledge/graph'),
    enabled: graphOpen,
  })

  const page = readQuery.data?.page ?? null
  const content = readQuery.data?.content ?? ''
  const backlinks = readQuery.data?.backlinks ?? []
  const processedContent = useMemo(
    () => preprocessWikiMarkdown(content),
    [content],
  )
  const askUrl = `/chat?message=${encodeURIComponent(
    `Tell me about: ${page?.title || selectedPath || 'this page'}\n\nContext:\n${content.slice(0, 500)}`,
  )}`
  const searchResults = searchQuery.data?.results ?? []

  function resolveWikiPath(rawValue: string): string | null {
    const decoded = decodeURIComponent(rawValue)
    return pageLookup.get(normalizeWikiToken(decoded)) ?? null
  }

  function handleSelectPath(
    pathValue: string,
    nextLine?: number,
    result?: KnowledgeSearchResult,
  ) {
    setSelectedPath(pathValue)
    setFocusLine(nextLine ?? null)
    setFocusedResult(result ?? null)
    setMobileTreeOpen(false)
  }

  return (
    <div className="min-h-full overflow-y-auto bg-surface text-ink">
    <div
      className="mx-auto flex w-full max-w-[1200px] min-h-0 flex-col px-4 py-6 sm:px-6 lg:px-8"
    >
      <div
        className="px-3 py-3 md:px-4"
        style={{
          borderBottom: '1px solid var(--theme-border)',
          backgroundColor: 'var(--theme-bg)',
        }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              className="inline-flex size-9 items-center justify-center rounded-xl"
              style={{
                border: '1px solid var(--theme-border)',
                backgroundColor: 'var(--theme-card)',
                color: 'var(--theme-text)',
              }}
            >
              <HugeiconsIcon icon={BrainIcon} size={18} strokeWidth={1.6} />
            </div>
            <div className="relative min-w-0 flex-1">
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
                placeholder="Search knowledge"
                className="w-full rounded-xl py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent-500"
                style={{
                  border: '1px solid var(--theme-border)',
                  backgroundColor: 'var(--theme-card)',
                  color: 'var(--theme-text)',
                }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setGraphOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-primary-100 dark:hover:bg-neutral-900"
            style={{
              border: '1px solid var(--theme-border)',
              backgroundColor: 'var(--theme-card)',
              color: 'var(--theme-text)',
            }}
          >
            <HugeiconsIcon icon={Link01Icon} size={16} strokeWidth={1.7} />
            Graph view
          </button>

          <DialogRoot open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger
              className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-primary-100 dark:hover:bg-neutral-900"
              style={{
                border: '1px solid var(--theme-border)',
                backgroundColor: 'var(--theme-card)',
                color: 'var(--theme-text)',
              }}
              title="Knowledge base settings"
            >
              <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.7} />
              <span className="hidden sm:inline">Settings</span>
            </DialogTrigger>
            <DialogContent
              className="sm:max-w-md"
              style={{
                backgroundColor: 'var(--theme-bg)',
                color: 'var(--theme-text)',
                border: '1px solid var(--theme-border)',
              }}
            >
              <div className="space-y-4">
                <div>
                  <DialogTitle className="text-base font-semibold">
                    Knowledge Base Settings
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm" style={{ color: 'var(--theme-muted)' }}>
                    Choose where your knowledge base is located. Changes take effect immediately.
                  </DialogDescription>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Source type</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setSettingsSource((prev) => ({
                          type: 'local',
                          path: prev?.type === 'local' ? prev.path : '',
                        }))
                      }
                      className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors"
                      style={{
                        borderColor:
                          settingsSource?.type === 'local'
                            ? 'var(--accent-color, #f97316)'
                            : 'var(--theme-border)',
                        backgroundColor:
                          settingsSource?.type === 'local'
                            ? 'var(--theme-card)'
                            : 'transparent',
                        color: 'var(--theme-text)',
                      }}
                    >
                      <HugeiconsIcon icon={Folder01Icon} size={16} strokeWidth={1.7} />
                      Local folder
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSettingsSource((prev) => ({
                          type: 'github',
                          repo: prev?.type === 'github' ? prev.repo : '',
                          branch: prev?.type === 'github' ? prev.branch : 'main',
                          path: prev?.type === 'github' ? prev.path : '',
                        }))
                      }
                      className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors"
                      style={{
                        borderColor:
                          settingsSource?.type === 'github'
                            ? 'var(--accent-color, #f97316)'
                            : 'var(--theme-border)',
                        backgroundColor:
                          settingsSource?.type === 'github'
                            ? 'var(--theme-card)'
                            : 'transparent',
                        color: 'var(--theme-text)',
                      }}
                    >
                      <HugeiconsIcon icon={CodeIcon} size={16} strokeWidth={1.7} />
                      GitHub repo
                    </button>
                  </div>
                </div>

                {settingsSource?.type === 'local' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="kb-local-path">
                      Folder path
                    </label>
                    <input
                      id="kb-local-path"
                      type="text"
                      value={settingsSource.path}
                      onChange={(e) =>
                        setSettingsSource((prev) =>
                          prev?.type === 'local'
                            ? { ...prev, path: e.target.value }
                            : prev,
                        )
                      }
                      placeholder="~/my-wiki or /absolute/path"
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{
                        borderColor: 'var(--theme-border)',
                        backgroundColor: 'var(--theme-card)',
                        color: 'var(--theme-text)',
                      }}
                    />
                  </div>
                )}

                {settingsSource?.type === 'github' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium" htmlFor="kb-gh-repo">
                        Repository
                      </label>
                      <input
                        id="kb-gh-repo"
                        type="text"
                        value={settingsSource.repo}
                        onChange={(e) =>
                          setSettingsSource((prev) =>
                            prev?.type === 'github'
                              ? { ...prev, repo: e.target.value }
                              : prev,
                          )
                        }
                        placeholder="owner/repo (e.g. dontcallmejames/my-wiki)"
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{
                          borderColor: 'var(--theme-border)',
                          backgroundColor: 'var(--theme-card)',
                          color: 'var(--theme-text)',
                        }}
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="kb-gh-branch">
                          Branch
                        </label>
                        <input
                          id="kb-gh-branch"
                          type="text"
                          value={settingsSource.branch}
                          onChange={(e) =>
                            setSettingsSource((prev) =>
                              prev?.type === 'github'
                                ? { ...prev, branch: e.target.value }
                                : prev,
                            )
                          }
                          placeholder="main"
                          className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                          style={{
                            borderColor: 'var(--theme-border)',
                            backgroundColor: 'var(--theme-card)',
                            color: 'var(--theme-text)',
                          }}
                        />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="kb-gh-path">
                          Sub-folder
                        </label>
                        <input
                          id="kb-gh-path"
                          type="text"
                          value={settingsSource.path}
                          onChange={(e) =>
                            setSettingsSource((prev) =>
                              prev?.type === 'github'
                                ? { ...prev, path: e.target.value }
                                : prev,
                            )
                          }
                          placeholder="wiki (optional)"
                          className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                          style={{
                            borderColor: 'var(--theme-border)',
                            backgroundColor: 'var(--theme-card)',
                            color: 'var(--theme-text)',
                          }}
                        />
                      </div>
                    </div>

                    {syncError && (
                      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                        {syncError}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  {settingsSource?.type === 'github' && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!settingsSource || settingsSource.type !== 'github') return
                        setSyncing(true)
                        setSyncError(null)
                        try {
                          const res = await fetch('/api/knowledge/sync', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              source: settingsSource,
                            }),
                          })
                          const data = (await res.json()) as { error?: string }
                          if (data.error) {
                            setSyncError(data.error)
                          } else {
                            queryClient.invalidateQueries({ queryKey: ['knowledge', 'list'] })
                          }
                        } catch (err) {
                          setSyncError(
                            err instanceof Error ? err.message : 'Sync failed',
                          )
                        } finally {
                          setSyncing(false)
                        }
                      }}
                      disabled={syncing || !settingsSource.repo}
                      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors hover:bg-primary-100 disabled:opacity-50 dark:hover:bg-neutral-900"
                      style={{
                        borderColor: 'var(--theme-border)',
                        color: 'var(--theme-text)',
                      }}
                    >
                      {syncing ? 'Syncing…' : 'Sync now'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      if (!settingsSource) return
                      const source =
                        settingsSource.type === 'local'
                          ? { type: 'local' as const, path: settingsSource.path }
                          : {
                              type: 'github' as const,
                              repo: settingsSource.repo,
                              branch: settingsSource.branch || 'main',
                              path: settingsSource.path || '',
                            }
                      await fetch('/api/knowledge/config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ source }),
                      })
                      queryClient.invalidateQueries({ queryKey: ['knowledge', 'list'] })
                      setSettingsOpen(false)
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600"
                  >
                    Save
                  </button>
                </div>
              </div>
            </DialogContent>
          </DialogRoot>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-[320px_minmax(0,1fr)] md:p-4">
        <aside className="flex min-h-0 flex-col rounded-2xl border border-primary-200 bg-primary-50 dark:border-neutral-800 dark:bg-neutral-950">
          <button
            type="button"
            className="flex items-center justify-between px-3 py-2 text-left md:cursor-default"
            onClick={() => setMobileTreeOpen((value) => !value)}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-neutral-400">
              Knowledge Pages ({filteredPages.length})
            </span>
            <span className="text-primary-500 dark:text-neutral-400 md:hidden">
              <HugeiconsIcon
                icon={mobileTreeOpen ? ArrowUp01Icon : ArrowDown01Icon}
                size={16}
                strokeWidth={1.7}
              />
            </span>
          </button>

          {!knowledgeExists && !listQuery.isLoading ? (
            <div className="px-3 pb-3">
              <EmptyKnowledgeState knowledgeRoot={knowledgeRoot} />
            </div>
          ) : searchTerm ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-primary-400 dark:text-neutral-500">
                Search Results
              </div>
              <div className="space-y-1">
                {searchQuery.isLoading ? (
                  <StateBox label="Searching knowledge..." />
                ) : searchResults.length === 0 ? (
                  <StateBox label="No matches found" />
                ) : (
                  searchResults.map((result, index) => (
                    <button
                      key={`${result.path}:${result.line}:${index}`}
                      type="button"
                      onClick={() =>
                        handleSelectPath(result.path, result.line, result)
                      }
                      className="w-full rounded-lg border border-primary-200 bg-primary-50/80 px-2.5 py-2 text-left hover:border-primary-300 hover:bg-primary-100 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
                    >
                      <div className="truncate text-[11px] text-primary-500 dark:text-neutral-400">
                        {result.title || result.path}:{result.line}
                      </div>
                      <div className="mt-0.5 line-clamp-3 text-xs text-primary-700 dark:text-neutral-200">
                        {highlightMatch(result.text, searchTerm).map(
                          (part, partIndex) => (
                            <span
                              key={partIndex}
                              className={
                                part.hit
                                  ? 'rounded bg-yellow-300/30 px-0.5 text-yellow-200'
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
                'min-h-0 flex-1 px-2 pb-2',
                !mobileTreeOpen && 'hidden md:block',
              )}
            >
              <div className="space-y-3 overflow-y-auto pr-1 md:h-full">
                <section className="rounded-xl border border-primary-200 bg-primary-50/80 p-2 dark:border-neutral-800 dark:bg-neutral-900/60">
                  <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-primary-400 dark:text-neutral-500">
                    Tags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <TagPill
                      label="All"
                      count={pages.length}
                      active={selectedTag == null}
                      onClick={() => setSelectedTag(null)}
                    />
                    {popularTags.map(([tag, count]) => (
                      <TagPill
                        key={tag}
                        label={tag}
                        count={count}
                        active={selectedTag === tag}
                        onClick={() => setSelectedTag(tag)}
                      />
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-primary-200 bg-primary-50/80 p-1 dark:border-neutral-800 dark:bg-neutral-900/60">
                  {listQuery.isLoading ? (
                    <StateBox label="Loading knowledge pages..." />
                  ) : listQuery.error instanceof Error ? (
                    <StateBox label={listQuery.error.message} error />
                  ) : filteredPages.length === 0 ? (
                    <StateBox
                      label={
                        selectedTag
                          ? 'No pages match this tag'
                          : 'No markdown pages found'
                      }
                    />
                  ) : (
                    <TreeSection
                      node={tree}
                      selectedPath={selectedPath}
                      onSelectPath={(pathValue) => handleSelectPath(pathValue)}
                    />
                  )}
                </section>
              </div>
            </div>
          )}
        </aside>

        <section className="min-h-0 rounded-2xl border border-primary-200 bg-primary-50 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center justify-between border-b border-primary-200 px-3 py-2 dark:border-neutral-800">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-primary-900 dark:text-neutral-100">
                {page?.title || selectedPath || 'Select a page'}
              </div>
              {page ? (
                <div className="text-xs text-primary-400 dark:text-neutral-500">
                  {page.path} · {formatBytes(page.size)} ·{' '}
                  {formatDate(page.updated || page.modified)}
                </div>
              ) : null}
            </div>
            {page ? (
              <a
                href={askUrl}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary-200 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary-300 hover:bg-primary-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
              >
                <HugeiconsIcon
                  icon={Message01Icon}
                  size={14}
                  strokeWidth={1.7}
                />
                Ask agent about this
              </a>
            ) : null}
          </div>

          <div className="h-full overflow-auto p-2 md:p-3">
            {listQuery.isLoading ? (
              <StateBox label="Loading knowledge base..." />
            ) : listQuery.error instanceof Error ? (
              <StateBox label={listQuery.error.message} error />
            ) : !knowledgeExists ? (
              <EmptyKnowledgeState knowledgeRoot={knowledgeRoot} />
            ) : !selectedPath ? (
              <StateBox label="Select a page to start browsing" />
            ) : readQuery.isLoading ? (
              <StateBox label="Loading page..." />
            ) : readQuery.error instanceof Error ? (
              <StateBox label={readQuery.error.message} error />
            ) : !page ? (
              <StateBox label="Page not found" error />
            ) : (
              <div
                className="rounded-xl"
                style={{
                  border: '1px solid var(--theme-border)',
                  backgroundColor: 'var(--theme-card)',
                }}
              >
                <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="min-w-0 space-y-4">
                    {focusedResult && focusedResult.path === page.path ? (
                      <div className="rounded-xl border border-yellow-300/40 bg-yellow-300/10 px-3 py-2 text-sm text-primary-900 dark:text-yellow-50">
                        <div className="font-medium">
                          Search hit at line {focusLine}
                        </div>
                        <div className="mt-1 text-xs opacity-80">
                          {focusedResult.text}
                        </div>
                      </div>
                    ) : null}

                    {page.summary ? (
                      <div className="rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-2 text-sm text-primary-700 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-300">
                        {page.summary}
                      </div>
                    ) : null}

                    <Markdown
                      className="gap-3"
                      components={{
                        a: function KnowledgeLink({ children, href }) {
                          if (href?.startsWith('wiki:')) {
                            const resolvedPath = resolveWikiPath(
                              href.slice('wiki:'.length),
                            )
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  if (resolvedPath)
                                    handleSelectPath(resolvedPath)
                                }}
                                className="inline-flex items-center gap-1 text-primary-950 underline decoration-primary-300 underline-offset-4 transition-colors hover:text-primary-950 hover:decoration-primary-500 dark:text-neutral-100"
                              >
                                <HugeiconsIcon
                                  icon={Link01Icon}
                                  size={14}
                                  strokeWidth={1.7}
                                />
                                <span>{children}</span>
                              </button>
                            )
                          }

                          return (
                            <a
                              href={href}
                              className="text-primary-950 underline decoration-primary-300 underline-offset-4 transition-colors hover:text-primary-950 hover:decoration-primary-500"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {children}
                            </a>
                          )
                        },
                      }}
                    >
                      {processedContent}
                    </Markdown>

                    <section className="rounded-xl border border-primary-200 bg-primary-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary-900 dark:text-neutral-100">
                        <HugeiconsIcon
                          icon={Link01Icon}
                          size={16}
                          strokeWidth={1.7}
                        />
                        Backlinks
                      </div>
                      {backlinks.length === 0 ? (
                        <div className="text-sm text-primary-500 dark:text-neutral-400">
                          No pages link here yet.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {backlinks.map((backlink) => {
                            const backlinkPath =
                              resolveWikiPath(backlink) || backlink
                            return (
                              <button
                                key={backlink}
                                type="button"
                                onClick={() => handleSelectPath(backlinkPath)}
                                className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-100 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-900"
                              >
                                {backlink}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </section>
                  </div>

                  <aside className="space-y-3">
                    <MetadataCard label="Type" value={page.type} />
                    <MetadataCard label="Domain" value={page.domain} />
                    <MetadataCard label="Status" value={page.status} />
                    <MetadataCard
                      label="Created"
                      value={formatDate(page.created)}
                    />
                    <MetadataCard
                      label="Updated"
                      value={formatDate(page.updated || page.modified)}
                    />
                    <MetadataCard label="Size" value={formatBytes(page.size)} />
                    <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
                      <div className="text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-neutral-400">
                        Tags
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {page.tags.length === 0 ? (
                          <span className="text-sm text-primary-500 dark:text-neutral-400">
                            No tags
                          </span>
                        ) : (
                          page.tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setSelectedTag(tag)}
                              className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-100 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-900"
                            >
                              #{tag}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-neutral-400">
                        <HugeiconsIcon
                          icon={CodeIcon}
                          size={14}
                          strokeWidth={1.7}
                        />
                        Wikilinks
                      </div>
                      {page.wikilinks.length === 0 ? (
                        <div className="text-sm text-primary-500 dark:text-neutral-400">
                          No outbound links
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {page.wikilinks.map((link) => {
                            const linkPath = resolveWikiPath(link) || link
                            return (
                              <button
                                key={link}
                                type="button"
                                onClick={() => handleSelectPath(linkPath)}
                                className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-100 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-900"
                              >
                                {link}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </aside>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <DialogRoot open={graphOpen} onOpenChange={setGraphOpen}>
        <DialogContent className="w-[min(980px,94vw)] max-w-none p-0">
          <div className="border-b border-primary-200 px-5 py-4 dark:border-neutral-800">
            <DialogTitle>Knowledge graph</DialogTitle>
            <DialogDescription>
              Page relationships from wiki links. Click any node to open that
              page.
            </DialogDescription>
          </div>
          <div className="p-5">
            {graphQuery.isLoading ? (
              <StateBox label="Loading graph..." />
            ) : graphQuery.error instanceof Error ? (
              <StateBox label={graphQuery.error.message} error />
            ) : (graphQuery.data?.nodes?.length ?? 0) === 0 ? (
              <StateBox label="No graph data yet" />
            ) : (
              <GraphCanvas
                nodes={graphQuery.data?.nodes ?? []}
                edges={graphQuery.data?.edges ?? []}
                onSelect={(pathValue) => {
                  setGraphOpen(false)
                  handleSelectPath(pathValue)
                }}
              />
            )}
          </div>
        </DialogContent>
      </DialogRoot>
    </div>
    </div>
  )
}

function TreeSection({
  node,
  selectedPath,
  onSelectPath,
  depth = 0,
}: {
  node: TreeNode
  selectedPath: string | null
  onSelectPath: (path: string) => void
  depth?: number
}) {
  return (
    <div className={cn('space-y-1', depth > 0 && 'mt-1')}>
      {node.path ? (
        <div
          className="flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-neutral-400"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={1.7} />
          <span className="truncate">{node.name}</span>
        </div>
      ) : null}

      {node.pages.map((page) => (
        <button
          key={page.path}
          type="button"
          onClick={() => onSelectPath(page.path)}
          className={cn(
            'block w-full rounded-lg border px-2.5 py-2 text-left transition-colors',
            selectedPath === page.path
              ? 'border-accent-500/70 bg-accent-500/10'
              : 'border-primary-200 bg-primary-50/80 hover:border-primary-300 hover:bg-primary-100 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-700 dark:hover:bg-neutral-900',
          )}
          style={{ marginLeft: depth > 0 ? depth * 12 : 0 }}
        >
          <div className="flex items-start gap-2">
            <HugeiconsIcon
              icon={File01Icon}
              size={16}
              strokeWidth={1.7}
              className="mt-0.5 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-primary-900 dark:text-neutral-100">
                {page.title}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {page.type ? <InlineBadge label={page.type} /> : null}
                {page.status ? <InlineBadge label={page.status} /> : null}
              </div>
            </div>
          </div>
        </button>
      ))}

      {node.folders.map((child) => (
        <TreeSection
          key={child.path}
          node={child}
          selectedPath={selectedPath}
          onSelectPath={onSelectPath}
          depth={depth + 1}
        />
      ))}
    </div>
  )
}

function InlineBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-primary-200 bg-primary-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
      {label}
    </span>
  )
}

function TagPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-accent-500/70 bg-accent-500/10 text-primary-900 dark:text-neutral-100'
          : 'border-primary-200 bg-primary-50 text-primary-600 hover:border-primary-300 hover:bg-primary-100 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-900',
      )}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  )
}

function MetadataCard({
  label,
  value,
}: {
  label: string
  value?: string | null
}) {
  if (!value) return null
  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-sm text-primary-900 dark:text-neutral-100">
        {value}
      </div>
    </div>
  )
}

function EmptyKnowledgeState({ knowledgeRoot }: { knowledgeRoot: string }) {
  return (
    <div className="flex min-h-32 flex-col justify-center rounded-xl border border-primary-200 bg-primary-50 px-4 py-5 text-sm text-primary-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
      <div className="text-base font-semibold text-primary-900 dark:text-neutral-100">
        No knowledge base found
      </div>
      <p className="mt-2 text-pretty">
        Create markdown files in <code>{knowledgeRoot}</code> to get started.
      </p>
      <a
        href="https://karpathy.ai/"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary-900 underline decoration-primary-300 underline-offset-4 hover:decoration-primary-500 dark:text-neutral-100"
      >
        <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={1.7} />
        See the Karpathy LLM wiki pattern
      </a>
    </div>
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
