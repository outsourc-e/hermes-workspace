import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  BrainIcon,
  File01Icon,
  FolderOpenIcon,
  SearchIcon,
} from '@hugeicons/core-free-icons'
import { usePageTitle } from '@/hooks/use-page-title'

export const Route = createFileRoute('/uni/obsidian')({
  ssr: false,
  component: ObsidianRoute,
})

// ─── Types ────────────────────────────────────────────────────────────────────

interface VaultEntry {
  name: string
  type: 'file' | 'dir'
  size?: number
  modified?: string
}

interface ListResponse {
  entries: Array<VaultEntry>
}

interface SearchMatch {
  path: string
  line: number
  snippet: string
}

interface SearchResponse {
  matches: Array<SearchMatch>
}

// ─── Tree node ────────────────────────────────────────────────────────────────

function TreeNode({
  name,
  type,
  relPath,
  depth,
  activeFile,
  onFileClick,
}: {
  name: string
  type: 'file' | 'dir'
  relPath: string
  depth: number
  activeFile: string | null
  onFileClick: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(depth === 0)

  const { data } = useQuery<ListResponse>({
    queryKey: ['uni-brain-list', relPath],
    queryFn: () =>
      fetch(
        `/api/uni-brain?action=list&path=${encodeURIComponent(relPath)}`,
      ).then((r) => r.json()),
    enabled: type === 'dir' && expanded,
    staleTime: 60_000,
  })

  if (type === 'file') {
    const isActive = activeFile === relPath
    return (
      <button
        type="button"
        onClick={() => onFileClick(relPath)}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-[11px] transition ${
          isActive
            ? 'bg-[#21262d] text-[#c4b5fd]'
            : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <HugeiconsIcon
          icon={File01Icon}
          size={11}
          strokeWidth={1.5}
          className="shrink-0"
        />
        <span className="truncate">{name}</span>
      </button>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-[11px] text-[#8b949e] transition hover:bg-[#161b22] hover:text-[#c9d1d9]"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <HugeiconsIcon
          icon={FolderOpenIcon}
          size={11}
          strokeWidth={1.5}
          className="shrink-0 text-[#58a6ff]"
        />
        <span className="truncate">{name}</span>
        <span className="ml-auto text-[#4d5566]">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && data?.entries && (
        <div>
          {data.entries.map((entry) => {
            const childPath = relPath ? `${relPath}/${entry.name}` : entry.name
            return (
              <TreeNode
                key={childPath}
                name={entry.name}
                type={entry.type}
                relPath={childPath}
                depth={depth + 1}
                activeFile={activeFile}
                onFileClick={onFileClick}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Search results ───────────────────────────────────────────────────────────

function SearchResults({
  query,
  onNavigate,
}: {
  query: string
  onNavigate: (path: string) => void
}) {
  const { data, isFetching } = useQuery<SearchResponse>({
    queryKey: ['uni-brain-search', query],
    queryFn: () =>
      fetch(`/api/uni-brain?action=search&q=${encodeURIComponent(query)}`).then(
        (r) => r.json(),
      ),
    enabled: query.length > 1,
    staleTime: 30_000,
  })

  if (isFetching)
    return <p className="px-2 py-1 text-[10px] text-[#6e7681]">searching…</p>
  if (!data || data.matches.length === 0)
    return <p className="px-2 py-1 text-[10px] text-[#4d5566]">no results</p>

  return (
    <ul className="flex flex-col gap-0.5">
      {data.matches.map((m, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => onNavigate(m.path)}
            className="w-full rounded px-2 py-1 text-left hover:bg-[#161b22]"
          >
            <p className="truncate text-[10px] text-[#58a6ff]">
              {m.path}:{m.line}
            </p>
            <p className="truncate text-[10px] text-[#6e7681]">{m.snippet}</p>
          </button>
        </li>
      ))}
    </ul>
  )
}

// ─── Markdown content pane ───────────────────────────────────────────────────

function ContentPane({ filePath }: { filePath: string | null }) {
  const { data: content, isLoading } = useQuery<string>({
    queryKey: ['uni-brain-read', filePath],
    queryFn: () =>
      fetch(
        `/api/uni-brain?action=read&path=${encodeURIComponent(filePath!)}`,
      ).then((r) =>
        r.ok
          ? r.text()
          : Promise.reject(new Error(`${r.status} ${r.statusText}`)),
      ),
    enabled: !!filePath,
    staleTime: 120_000,
  })

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center text-[#4d5566]">
        <div className="text-center font-mono text-sm">
          <HugeiconsIcon
            icon={BrainIcon}
            size={32}
            strokeWidth={1}
            className="mx-auto mb-2 opacity-30"
          />
          <p>Select a note to read</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="font-mono text-xs text-[#6e7681]">loading…</div>
      </div>
    )
  }

  // Process wikilinks: [[Page Name]] → link via basename match
  function transformContent(raw: string): string {
    return raw.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
      const name = inner.split('|').pop()?.trim() ?? inner
      return `[${name}](obsidian:${encodeURIComponent(name)})`
    })
  }

  const processed = content ? transformContent(content) : ''

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <p className="mb-3 font-mono text-[10px] text-[#4d5566] tracking-widest uppercase">
        {filePath}
      </p>
      <div className="prose prose-invert prose-sm max-w-none font-serif text-[13px] leading-relaxed text-[#e6edf3] [&>*:first-child]:mt-0 [&>p]:my-2 [&>ul]:my-2 [&>ol]:my-2 [&>h1]:text-base [&>h2]:text-[15px] [&>h3]:text-[13px] [&_strong]:text-[#c4b5fd] [&_code]:bg-[#161b22] [&_code]:px-1 [&_code]:rounded [&_a]:text-[#58a6ff] [&_a]:no-underline [&_a:hover]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[#30363d] [&_blockquote]:pl-3 [&_blockquote]:text-[#8b949e]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{processed}</ReactMarkdown>
      </div>
    </div>
  )
}

// ─── Main route ───────────────────────────────────────────────────────────────

function ObsidianRoute() {
  usePageTitle('University — Obsidian')
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchActive, setSearchActive] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [resyncDisabled, setResyncDisabled] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => {
      setIsMobile(mq.matches)
      if (mq.matches) setSidebarOpen(false)
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Root list
  const { data: rootData, isLoading: rootLoading } = useQuery<ListResponse>({
    queryKey: ['uni-brain-list', ''],
    queryFn: () =>
      fetch('/api/uni-brain?action=list&path=').then((r) => r.json()),
    staleTime: 60_000,
  })

  const resyncMutation = useMutation<void, Error>({
    mutationFn: () =>
      fetch('/api/uni-brain?action=resync', { method: 'POST' }).then((r) =>
        r.json(),
      ),
    onSuccess: () => {
      setResyncDisabled(true)
      setTimeout(() => setResyncDisabled(false), 30_000)
    },
  })

  function handleFileClick(path: string) {
    setActiveFile(path)
    if (isMobile) setSidebarOpen(false)
  }

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setSearchQuery(val)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => {
      setSearchActive(val.length > 1)
    }, 300)
  }

  const entries = rootData?.entries ?? []

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[#0a0e14] font-mono text-[#c9d1d9]">
      {/* Mobile dropdown for tree */}
      {isMobile && (
        <div className="absolute left-0 right-0 top-0 z-10 border-b border-[#21262d] bg-[#0d1117] px-3 py-1.5">
          <select
            className="w-full bg-[#0d1117] text-xs text-[#c9d1d9] outline-none"
            value={activeFile ?? ''}
            onChange={(e) => {
              if (e.target.value) handleFileClick(e.target.value)
            }}
          >
            <option value="">— Select note —</option>
            {entries
              .filter((e) => e.type === 'file')
              .map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Sidebar */}
      {(!isMobile || sidebarOpen) && (
        <aside className="flex w-56 shrink-0 flex-col border-r border-[#21262d] bg-[#0d1117]">
          {/* Sidebar header */}
          <div className="flex items-center gap-1.5 border-b border-[#21262d] px-2 py-2">
            <HugeiconsIcon
              icon={BrainIcon}
              size={14}
              strokeWidth={1.5}
              className="text-[#c4b5fd]"
            />
            <span className="flex-1 text-[11px] font-bold tracking-widest text-[#c4b5fd]">
              UNI BRAIN
            </span>
            <button
              type="button"
              onClick={() => resyncMutation.mutate()}
              disabled={resyncDisabled || resyncMutation.isPending}
              title="Resync vault from home PC"
              className="text-[#6e7681] hover:text-[#58a6ff] disabled:opacity-40 transition text-[10px]"
            >
              {resyncMutation.isPending ? '…' : '↻'}
            </button>
          </div>

          {/* Search */}
          <div className="border-b border-[#21262d] px-2 py-1.5">
            <div className="flex items-center gap-1 rounded border border-[#21262d] bg-[#161b22] px-2 py-1">
              <HugeiconsIcon
                icon={SearchIcon}
                size={10}
                strokeWidth={1.5}
                className="text-[#4d5566]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="search notes…"
                className="flex-1 bg-transparent text-[10px] text-[#c9d1d9] placeholder-[#4d5566] outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setSearchActive(false)
                  }}
                  className="text-[#4d5566] hover:text-[#c9d1d9] text-[10px]"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Tree or search results */}
          <div className="flex-1 overflow-y-auto py-1">
            {searchActive ? (
              <SearchResults query={searchQuery} onNavigate={handleFileClick} />
            ) : rootLoading ? (
              <p className="px-3 py-2 text-[10px] text-[#6e7681]">
                loading vault…
              </p>
            ) : entries.length === 0 ? (
              <p className="px-3 py-2 text-[10px] text-[#4d5566]">
                Vault empty — click ↻ to sync from home PC
              </p>
            ) : (
              entries.map((entry) => (
                <TreeNode
                  key={entry.name}
                  name={entry.name}
                  type={entry.type}
                  relPath={entry.name}
                  depth={0}
                  activeFile={activeFile}
                  onFileClick={handleFileClick}
                />
              ))
            )}
          </div>
        </aside>
      )}

      {/* Mobile sidebar toggle */}
      {isMobile && !sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="absolute left-2 top-10 z-10 rounded border border-[#21262d] bg-[#0d1117] p-1 text-[#6e7681] hover:text-[#c9d1d9]"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.5} />
        </button>
      )}

      {/* Content pane */}
      <main className="flex min-w-0 flex-1 flex-col bg-[#0a0e14]">
        <ContentPane filePath={activeFile} />
      </main>
    </div>
  )
}
