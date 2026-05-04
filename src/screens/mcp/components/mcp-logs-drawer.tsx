import { useEffect, useRef, useState } from 'react'
import type { McpServer } from '@/types/mcp'

interface Props {
  server: McpServer | null
  open: boolean
  onClose: () => void
}

interface LogLine {
  id: number
  text: string
  ts: number
}

const MAX_LINES = 500

export function McpLogsDrawer({ server, open, onClose }: Props) {
  const [lines, setLines] = useState<Array<LogLine>>([])
  const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'error' | 'closed'>('idle')
  const [autoScroll, setAutoScroll] = useState(true)
  const idRef = useRef(0)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open || !server) return
    let cancelled = false

    setLines([])
    setStatus('connecting')

    let es: EventSource
    try {
      es = new EventSource(`/api/mcp/${encodeURIComponent(server.name)}/logs`)
    } catch (err) {
      setStatus('error')

      console.error('mcp logs EventSource construct failed', err)
      return
    }

    const onOpen = () => {
      if (!cancelled) setStatus('open')
    }
    const onConnected = () => {
      if (!cancelled) setStatus('open')
    }
    const onLog = (evt: MessageEvent) => {
      if (cancelled) return
      let text = ''
      try {
        const parsed = JSON.parse(evt.data) as { line?: string }
        text = typeof parsed.line === 'string' ? parsed.line : String(evt.data)
      } catch {
        text = String(evt.data)
      }
      setLines((prev) => {
        const next: Array<LogLine> = [
          { id: ++idRef.current, text, ts: Date.now() },
          ...prev,
        ]
        if (next.length > MAX_LINES) next.length = MAX_LINES
        return next
      })
    }
    const onError = () => {
      if (!cancelled) setStatus('error')
    }

    es.addEventListener('open', onOpen)
    es.addEventListener('connected', onConnected)
    es.addEventListener('log', onLog as EventListener)
    es.addEventListener('error', onError)

    return () => {
      cancelled = true
      try {
        es.removeEventListener('open', onOpen)
        es.removeEventListener('connected', onConnected)
        es.removeEventListener('log', onLog as EventListener)
        es.removeEventListener('error', onError)
        es.close()
      } catch {
        /* ignore */
      }
      setStatus('closed')
    }
  }, [open, server])

  useEffect(() => {
    if (!autoScroll) return
    const el = scrollerRef.current
    if (!el) return
    // newest-first → keep top in view
    el.scrollTop = 0
  }, [lines, autoScroll])

  if (!open || !server) return null

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-label={`Logs for ${server.name}`}
    >
      <button
        type="button"
        aria-label="Close logs"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-primary-200 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-primary-200 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-primary-900">
              {server.name} logs
            </h3>
            <p className="text-xs text-primary-500">
              {status === 'open' ? 'streaming' : status} · {lines.length}/{MAX_LINES}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-primary-600">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              auto-scroll
            </label>
            <button
              type="button"
              className="rounded border border-primary-300 px-2 py-1 text-xs text-primary-700 hover:bg-primary-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </header>
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto bg-primary-950/95 px-3 py-2 font-mono text-xs text-primary-100"
        >
          {lines.length === 0 ? (
            <p className="text-primary-300">Waiting for logs…</p>
          ) : (
            <ul className="space-y-0.5">
              {lines.map((line) => (
                <li key={line.id} className="whitespace-pre-wrap break-all">
                  {line.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
