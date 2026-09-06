import { useCallback, useEffect, useRef, useState } from 'react'
import { Editor } from '@monaco-editor/react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  CheckmarkCircle01Icon,
  CloudUploadIcon,
  Copy01Icon,
  Delete01Icon,
  Folder01Icon,
  LinkSquare02Icon,
} from '@hugeicons/core-free-icons'
import { usePageTitle } from '@/hooks/use-page-title'
import { FileExplorerSidebar } from '@/components/file-explorer'
import { resolveTheme, useSettings } from '@/hooks/use-settings'

const INITIAL_EDITOR_VALUE = `// Files workspace
// Use the file tree on the left to browse and manage project files.
// "Insert as reference" actions appear here for quick context snippets.

function note() {
  return 'Ready to explore files.'
}
`

export const Route = createFileRoute('/files')({
  ssr: false,
  component: FilesRoute,
  errorComponent: function FilesError({ error }) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-primary-50">
        <h2 className="text-xl font-semibold text-primary-900 mb-3">
          Failed to Load Files
        </h2>
        <p className="text-sm text-primary-600 mb-4 max-w-md">
          {error instanceof Error
            ? error.message
            : 'An unexpected error occurred'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          Reload Page
        </button>
      </div>
    )
  },
  pendingComponent: function FilesPending() {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-500 border-r-transparent mb-3" />
          <p className="text-sm text-primary-500">Loading file explorer...</p>
        </div>
      </div>
    )
  },
})

// ─── Share panel types ───────────────────────────────────────────────────────

interface ShareMeta {
  id: string
  kind: 'text' | 'file'
  filename?: string
  textPreview?: string
  size: number
  created: number
  expiresAt: number
}

interface ShareListResponse {
  shares: Array<ShareMeta>
}

interface ShareCreateResponse {
  ok: boolean
  id: string
  downloadUrl: string
  expiresAt: number
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function fmtAge(ms: number): string {
  const diff = Date.now() - ms
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Share panel component ───────────────────────────────────────────────────

function SharePanel() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'text' | 'file'>('text')
  const [textValue, setTextValue] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [lastResult, setLastResult] = useState<ShareCreateResponse | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data, isLoading: listLoading } = useQuery<ShareListResponse>({
    queryKey: ['share-list'],
    queryFn: () => fetch('/api/share/').then((r) => r.json()),
    refetchInterval: 30_000,
    enabled: open,
  })

  const createMutation = useMutation<
    ShareCreateResponse,
    Error,
    FormData | { kind: 'text'; content: string }
  >({
    mutationFn: async (payload) => {
      if (payload instanceof FormData) {
        const res = await fetch('/api/share/', {
          method: 'POST',
          body: payload,
        })
        if (!res.ok) throw new Error(await res.text())
        return res.json()
      } else {
        const res = await fetch('/api/share/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(await res.text())
        return res.json()
      }
    },
    onSuccess: (data) => {
      setLastResult(data)
      setTextValue('')
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['share-list'] })
    },
  })

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await fetch(`/api/share/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['share-list'] })
    },
  })

  function handleShare() {
    if (tab === 'text') {
      if (!textValue.trim()) return
      createMutation.mutate({ kind: 'text', content: textValue })
    } else {
      if (!selectedFile) return
      const fd = new FormData()
      fd.append('file', selectedFile)
      createMutation.mutate(fd)
    }
  }

  function copyUrl(url: string, id: string) {
    const fullUrl = `${window.location.origin}${url}`
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    setSelectedFile(file)
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  const shares = data?.shares ?? []

  return (
    <div className="border-b border-[#21262d] bg-[#0a0e14] font-mono">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-[#8b949e] hover:text-[#c9d1d9] transition"
      >
        <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={1.5} />
        <span className="font-semibold text-[#c4b5fd]">
          Share with my devices
        </span>
        <span className="ml-1 text-[#6e7681]">({shares.length})</span>
        <span className="ml-auto">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {/* Tabs */}
          <div className="mb-3 flex gap-2 border-b border-[#21262d] pb-2">
            {(['text', 'file'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t)
                  setLastResult(null)
                }}
                className={`rounded px-3 py-1 text-xs transition ${
                  tab === t
                    ? 'bg-[#21262d] text-[#c4b5fd]'
                    : 'text-[#6e7681] hover:text-[#c9d1d9]'
                }`}
              >
                {t === 'text' ? '✎ Text' : '⬆ File'}
              </button>
            ))}
          </div>

          {/* Text tab */}
          {tab === 'text' && (
            <div className="flex flex-col gap-2">
              <textarea
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="Paste text to share across your tailnet…"
                rows={4}
                className="w-full resize-none rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs text-[#c9d1d9] placeholder-[#4d5566] focus:border-[#58a6ff] focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={createMutation.isPending || !textValue.trim()}
                  className="rounded bg-[#1f6feb] px-3 py-1.5 text-xs text-white hover:bg-[#388bfd] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {createMutation.isPending ? '…sharing' : 'Share'}
                </button>
                {createMutation.isError && (
                  <span className="text-[10px] text-[#f85149]">
                    {createMutation.error.message}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* File tab */}
          {tab === 'file' && (
            <div className="flex flex-col gap-2">
              <div
                ref={dropRef}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-[80px] cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-[#30363d] bg-[#0d1117] px-4 py-4 text-xs text-[#6e7681] hover:border-[#58a6ff] hover:text-[#c9d1d9] transition"
              >
                <HugeiconsIcon
                  icon={CloudUploadIcon}
                  size={20}
                  strokeWidth={1.5}
                  className="mb-1"
                />
                {selectedFile ? (
                  <span className="text-[#c4b5fd]">
                    {selectedFile.name} ({fmtBytes(selectedFile.size)})
                  </span>
                ) : (
                  <span>Drop file here or click to pick (max 50 MB)</span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={createMutation.isPending || !selectedFile}
                  className="rounded bg-[#1f6feb] px-3 py-1.5 text-xs text-white hover:bg-[#388bfd] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {createMutation.isPending ? '…uploading' : 'Upload'}
                </button>
                {createMutation.isError && (
                  <span className="text-[10px] text-[#f85149]">
                    {createMutation.error.message}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Success result */}
          {lastResult && (
            <div className="mt-2 rounded border border-[#238636] bg-[#1a3a1a] px-3 py-2 text-xs">
              <p className="mb-1 text-[#3fb950]">
                <HugeiconsIcon
                  icon={CheckmarkCircle01Icon}
                  size={12}
                  strokeWidth={1.5}
                  className="inline mr-1"
                />
                Shared! URL:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all text-[#58a6ff]">
                  {window.location.origin}
                  {lastResult.downloadUrl}
                </code>
                <button
                  type="button"
                  onClick={() => copyUrl(lastResult.downloadUrl, lastResult.id)}
                  className="shrink-0 text-[#6e7681] hover:text-[#c4b5fd]"
                  title="Copy URL"
                >
                  {copiedId === lastResult.id ? (
                    <HugeiconsIcon
                      icon={CheckmarkCircle01Icon}
                      size={14}
                      strokeWidth={1.5}
                      className="text-[#3fb950]"
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={Copy01Icon}
                      size={14}
                      strokeWidth={1.5}
                    />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Shares list */}
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] uppercase tracking-widest text-[#4d5566]">
              Recent shares
            </p>
            {listLoading && (
              <p className="text-[11px] text-[#6e7681]">loading…</p>
            )}
            {!listLoading && shares.length === 0 && (
              <p className="text-[11px] text-[#4d5566]">
                No shares yet. Paste text or drop a file above to share it
                across your tailnet.
              </p>
            )}
            <ul className="flex flex-col gap-1.5">
              {shares.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded border border-[#21262d] bg-[#0d1117] px-2.5 py-1.5 text-[11px]"
                >
                  <span className="shrink-0 text-[#6e7681]">
                    {s.kind === 'text' ? '✎' : '⬆'}
                  </span>
                  <span className="flex-1 truncate text-[#c9d1d9]">
                    {s.kind === 'file' ? s.filename : s.textPreview}
                  </span>
                  <span className="shrink-0 text-[#4d5566]">
                    {fmtBytes(s.size)}
                  </span>
                  <span className="shrink-0 text-[#4d5566]">
                    {fmtAge(s.created)}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyUrl(`/api/share/${s.id}`, s.id)}
                    title="Copy URL"
                    className="shrink-0 text-[#6e7681] hover:text-[#58a6ff] transition"
                  >
                    {copiedId === s.id ? (
                      <HugeiconsIcon
                        icon={CheckmarkCircle01Icon}
                        size={13}
                        strokeWidth={1.5}
                        className="text-[#3fb950]"
                      />
                    ) : (
                      <HugeiconsIcon
                        icon={Copy01Icon}
                        size={13}
                        strokeWidth={1.5}
                      />
                    )}
                  </button>
                  <a
                    href={`/api/share/${s.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Download"
                    className="shrink-0 text-[#6e7681] hover:text-[#58a6ff] transition"
                  >
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      size={13}
                      strokeWidth={1.5}
                    />
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(s.id)}
                    title="Delete"
                    className="shrink-0 text-[#6e7681] hover:text-[#f85149] transition"
                  >
                    <HugeiconsIcon
                      icon={Delete01Icon}
                      size={13}
                      strokeWidth={1.5}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main route ───────────────────────────────────────────────────────────────

function FilesRoute() {
  usePageTitle('Files')
  const { settings } = useSettings()
  const [isMobile, setIsMobile] = useState(false)
  const [fileExplorerCollapsed, setFileExplorerCollapsed] = useState(false)
  const [editorValue, setEditorValue] = useState(INITIAL_EDITOR_VALUE)
  const resolvedTheme = resolveTheme(settings.theme)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!isMobile) return
    setFileExplorerCollapsed(true)
  }, [isMobile])

  const handleInsertReference = useCallback(function handleInsertReference(
    reference: string,
  ) {
    setEditorValue((prev) => `${prev}\n${reference}\n`)
  }, [])

  return (
    <div className="h-full min-h-0 overflow-hidden bg-surface text-primary-900">
      <div className="flex h-full min-h-0 overflow-hidden">
        <FileExplorerSidebar
          collapsed={fileExplorerCollapsed}
          onToggle={function onToggleFileExplorer() {
            setFileExplorerCollapsed((prev) => !prev)
          }}
          onInsertReference={handleInsertReference}
        />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex items-center gap-3 border-b border-primary-200 px-3 py-2 md:px-4 md:py-3">
            <button
              type="button"
              onClick={function onToggleFileExplorerHeader() {
                setFileExplorerCollapsed((prev) => !prev)
              }}
              className="rounded-lg p-1.5 text-primary-600 hover:bg-primary-100 transition-colors"
              aria-label={fileExplorerCollapsed ? 'Show files' : 'Hide files'}
              title={fileExplorerCollapsed ? 'Show files' : 'Hide files'}
            >
              <HugeiconsIcon icon={Folder01Icon} size={20} strokeWidth={1.5} />
            </button>
            <div>
              <h1 className="text-base font-medium text-balance md:text-lg">
                Files
              </h1>
              <p className="hidden text-sm text-primary-600 text-pretty sm:block">
                Explore your workspace and draft notes in the editor.
              </p>
            </div>
          </header>

          {/* Share panel — above editor */}
          <SharePanel />

          <div className="min-h-0 flex-1 pb-24 md:pb-0">
            <Editor
              height="100%"
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs-light'}
              language="typescript"
              value={editorValue}
              onChange={function onEditorChange(value) {
                setEditorValue(value || '')
              }}
              options={{
                minimap: { enabled: settings.editorMinimap },
                fontSize: settings.editorFontSize,
                scrollBeyondLastLine: false,
                wordWrap: settings.editorWordWrap ? 'on' : 'off',
              }}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
