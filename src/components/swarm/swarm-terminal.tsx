'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Terminal } from 'xterm'
import type * as XtermModule from 'xterm'
import type { FitAddon } from 'xterm-addon-fit'
import type * as FitAddonModule from 'xterm-addon-fit'
import type * as WebLinksAddonModule from 'xterm-addon-web-links'
import { cn } from '@/lib/utils'

let xtermLoaded = false
let TerminalCtor: typeof XtermModule.Terminal
let FitAddonCtor: typeof FitAddonModule.FitAddon
let WebLinksAddonCtor: typeof WebLinksAddonModule.WebLinksAddon

async function ensureXterm() {
  if (xtermLoaded) return
  const [xtermMod, fitMod, linksMod] = await Promise.all([
    import('xterm'),
    import('xterm-addon-fit'),
    import('xterm-addon-web-links'),
  ])
  await import('xterm/css/xterm.css')
  TerminalCtor = xtermMod.Terminal
  FitAddonCtor = fitMod.FitAddon
  WebLinksAddonCtor = linksMod.WebLinksAddon
  xtermLoaded = true
}

type SwarmTerminalProps = {
  workerId: string
  command: Array<string>
  cwd?: string
  className?: string
  height?: number
  active?: boolean
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'

export const SwarmTerminal = memo(function SwarmTerminal({
  workerId,
  command,
  cwd,
  className,
  height = 480,
  active = true,
}: SwarmTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const inputBufferRef = useRef('')
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nativeInputCounterRef = useRef(0)
  const [state, setState] = useState<ConnectionState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)
  const [isFocused, setIsFocused] = useState(false)

  const focusTerminal = useCallback(() => {
    try {
      // Focus the wrapper first, then xterm/its helper textarea last. On macOS
      // Chromium/Safari, focusing the wrapper after xterm can steal keyboard
      // focus from the hidden xterm textarea, making the terminal look focused
      // while typed input never reaches terminal.onData.
      containerRef.current?.focus()
      terminalRef.current?.focus()
      const textarea = containerRef.current?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
      textarea?.focus()
    } catch {
      /* noop */
    }
  }, [])

  const flushPendingInput = useCallback(() => {
    const sessionId = sessionIdRef.current
    const data = inputBufferRef.current
    if (!sessionId || !data) return
    inputBufferRef.current = ''
    void fetch('/api/terminal-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, data }),
    }).catch(() => undefined)
  }, [])

  const queueInput = useCallback((data: string) => {
    if (!data) return
    inputBufferRef.current += data
    if (flushTimerRef.current) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      flushPendingInput()
    }, 18)
  }, [flushPendingInput])

  const stop = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    flushPendingInput()
    const sessionId = sessionIdRef.current
    if (sessionId) {
      void fetch('/api/terminal-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch(() => undefined)
    }
    if (readerRef.current) {
      try {
        void readerRef.current.cancel()
      } catch {
        /* noop */
      }
      readerRef.current = null
    }
    sessionIdRef.current = null
    setState('closed')
  }, [flushPendingInput])

  const restart = useCallback(() => {
    stop()
    if (terminalRef.current) {
      terminalRef.current.write('\r\n\x1b[33m[swarm] restarting…\x1b[0m\r\n')
    }
    setReconnectKey((k) => k + 1)
    setState('idle')
  }, [stop])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      if (!containerRef.current) return
      await ensureXterm()
      if (cancelled || !containerRef.current) return

      const terminal = new TerminalCtor({
        cursorBlink: true,
        cursorStyle: 'bar',
        fontFamily: 'JetBrains Mono, Menlo, monospace',
        fontSize: 12,
        lineHeight: 1.25,
        scrollback: 5000,
        theme: {
          background: '#0b0d12',
          foreground: '#e2e8f0',
          cursor: '#f59e0b',
          black: '#0f172a',
          brightBlack: '#1e293b',
        },
      })
      terminalRef.current = terminal
      const fit = new FitAddonCtor()
      const links = new WebLinksAddonCtor()
      fitRef.current = fit
      terminal.loadAddon(fit)
      terminal.loadAddon(links)
      terminal.open(containerRef.current)

      try {
        fit.fit()
      } catch {
        /* noop */
      }

      focusTerminal()

      const viewport = containerRef.current.querySelector(
        '.xterm-viewport',
      ) as HTMLElement | null
      const wheelHandler = (event: WheelEvent) => {
        // Make wheel scrolling reliably review terminal scrollback instead of
        // being interpreted as shell/tmux history navigation.
        event.preventDefault()
        event.stopPropagation()
        const lines = Math.max(-8, Math.min(8, Math.round(event.deltaY / 40)))
        if (lines !== 0) {
          terminal.scrollLines(lines)
        }
      }
      viewport?.addEventListener('wheel', wheelHandler, { passive: false })

      terminal.writeln(`\x1b[1;36m[swarm] worker ${workerId} terminal\x1b[0m`)
      terminal.writeln(`\x1b[2mcommand: ${command.join(' ')}\x1b[0m`)
      terminal.writeln('')

      setState('connecting')
      const response = await fetch('/api/terminal-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          cwd,
          cols: terminal.cols,
          rows: terminal.rows,
        }),
      }).catch(() => null)

      if (cancelled) return
      if (!response || !response.ok || !response.body) {
        setError(`Failed to start swarm terminal (${response?.status ?? 'no response'})`)
        setState('error')
        terminal.writeln('\r\n\x1b[31m[swarm] failed to start terminal\x1b[0m')
        return
      }

      setState('connected')
      // Give xterm a beat to finish mounting, then re-focus so keystrokes land.
      setTimeout(() => focusTerminal(), 50)
      const reader = response.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = ''

      const dataDisposable = terminal.onData((data) => {
        nativeInputCounterRef.current += 1
        queueInput(data)
      })

      const resizeDisposable = terminal.onResize(({ cols, rows }) => {
        const sessionId = sessionIdRef.current
        if (!sessionId) return
        void fetch('/api/terminal-resize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, cols, rows }),
        }).catch(() => undefined)
      })

      const handleResize = () => {
        try {
          fit.fit()
        } catch {
          /* noop */
        }
      }
      window.addEventListener('resize', handleResize)

      try {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const readState = await reader.read().catch(() => ({ done: true, value: undefined }))
          if (readState.done) break
          const value = readState.value
          if (!value) continue
          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() ?? ''
          for (const block of blocks) {
            if (!block) continue
            const lines = block.split('\n')
            let event = 'message'
            let dataLine = ''
            for (const line of lines) {
              if (line.startsWith('event:')) event = line.slice(6).trim()
              if (line.startsWith('data:')) dataLine += line.slice(5).trim()
            }
            if (!dataLine) continue
            try {
              const parsed = JSON.parse(dataLine) as Record<string, unknown>
              if (event === 'session') {
                const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId : null
                if (sessionId) sessionIdRef.current = sessionId
              } else if (event === 'data') {
                const data = typeof parsed.data === 'string' ? parsed.data : ''
                if (data) terminal.write(data)
              } else if (event === 'exit' || event === 'close') {
                terminal.writeln('\r\n\x1b[33m[swarm] session ended\x1b[0m')
                sessionIdRef.current = null
                setState('closed')
              } else if (event === 'error') {
                const message = typeof parsed.message === 'string' ? parsed.message : 'unknown error'
                terminal.writeln(`\r\n\x1b[31m[swarm] ${message}\x1b[0m`)
              }
            } catch {
              /* skip malformed event */
            }
          }
        }
      } finally {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current)
          flushTimerRef.current = null
        }
        flushPendingInput()
        viewport?.removeEventListener('wheel', wheelHandler)
        dataDisposable.dispose()
        resizeDisposable.dispose()
        window.removeEventListener('resize', handleResize)
        if (!cancelled) setState('closed')
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
      stop()
      const terminal = terminalRef.current
      terminalRef.current = null
      fitRef.current = null
      try {
        terminal?.dispose()
      } catch {
        /* noop */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId, command.join('|'), cwd, reconnectKey, focusTerminal, flushPendingInput])

  useEffect(() => {
    if (!active) return
    const id = setTimeout(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* noop */
      }
      focusTerminal()
    }, 60)
    return () => clearTimeout(id)
  }, [active, focusTerminal])

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {state !== 'connected' || error ? (
        <div className="flex items-center justify-between text-[10px] text-[var(--theme-muted)]">
          <span>
            {state === 'connecting' && 'connecting…'}
            {state === 'closed' && 'session closed'}
            {state === 'error' && 'error'}
            {state === 'idle' && 'idle'}
          </span>
          {error ? <span className="text-red-300">attach error</span> : null}
        </div>
      ) : null}
      <div
        ref={containerRef}
        tabIndex={0}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onMouseDown={() => {
          requestAnimationFrame(() => focusTerminal())
        }}
        onClick={() => {
          requestAnimationFrame(() => focusTerminal())
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData('text')
          if (!text) return
          event.preventDefault()
          event.stopPropagation()
          queueInput(text)
          focusTerminal()
        }}
        onKeyDown={(event) => {
          const keyToData = () => {
            if (event.metaKey) return ''
            if (event.ctrlKey && event.key.length === 1) {
              const upper = event.key.toUpperCase()
              const code = upper.charCodeAt(0)
              if (code >= 64 && code <= 95) return String.fromCharCode(code - 64)
            }
            switch (event.key) {
              case 'Enter':
                return '\r'
              case 'Backspace':
                return '\x7f'
              case 'Tab':
                return '\t'
              case 'Escape':
                return '\x1b'
              case 'ArrowUp':
                return '\x1b[A'
              case 'ArrowDown':
                return '\x1b[B'
              case 'ArrowRight':
                return '\x1b[C'
              case 'ArrowLeft':
                return '\x1b[D'
              case 'Home':
                return '\x1b[H'
              case 'End':
                return '\x1b[F'
              case 'PageUp':
                return '\x1b[5~'
              case 'PageDown':
                return '\x1b[6~'
              case 'Delete':
                return '\x1b[3~'
              default:
                return event.key.length === 1 && !event.altKey ? event.key : ''
            }
          }

          const data = keyToData()
          if (!data) return
          const activeEl = document.activeElement as HTMLElement | null
          const isXtermTextarea = activeEl?.classList?.contains('xterm-helper-textarea')

          if (isXtermTextarea) {
            // Prefer xterm's native onData path. On some macOS browser/input
            // combinations the helper textarea receives keydown but xterm never
            // emits onData; fall back only if no native data arrived.
            const before = nativeInputCounterRef.current
            window.setTimeout(() => {
              if (nativeInputCounterRef.current === before) {
                queueInput(data)
              }
            }, 35)
            return
          }

          event.preventDefault()
          event.stopPropagation()
          queueInput(data)
          focusTerminal()
        }}
        onWheel={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const lines = Math.max(-8, Math.min(8, Math.round(event.deltaY / 40)))
          if (lines !== 0) {
            terminalRef.current?.scrollLines(lines)
          }
        }}
        className={cn(
          'cursor-text overflow-hidden rounded-2xl border bg-[#0b0d12] p-2 outline-none',
          isFocused
            ? 'border-[var(--theme-accent)] ring-1 ring-[var(--theme-accent-soft)]'
            : 'border-[var(--theme-border)]',
        )}
        style={{ height }}
      />
      {error ? (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
      ) : null}
    </div>
  )
})
