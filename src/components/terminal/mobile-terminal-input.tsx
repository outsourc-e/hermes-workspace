/**
 * MobileTerminalInput — completely isolated from TerminalWorkspace.
 * Rendered as a sibling in WorkspaceShell so SSE stream re-renders
 * in the terminal component never freeze this input.
 */
import { useCallback, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUp02Icon, Copy01Icon } from '@hugeicons/core-free-icons'
import { useTerminalPanelStore } from '@/stores/terminal-panel-store'

async function sendToActiveTab(data: string) {
  const { tabs, activeTabId } = useTerminalPanelStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  if (!tab?.sessionId) return
  await fetch('/api/terminal-input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: tab.sessionId, data }),
  }).catch(() => undefined)
}

export function MobileTerminalInput() {
  const inputRef = useRef<HTMLInputElement>(null)

  const send = useCallback(() => {
    const val = inputRef.current?.value
    if (!val) return
    void sendToActiveTab(val + '\r')
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const paste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && inputRef.current) {
        inputRef.current.value += text
        inputRef.current.focus()
      }
    } catch {
      inputRef.current?.focus()
    }
  }, [])

  const ctrlC = useCallback(() => {
    void sendToActiveTab('\x03')
  }, [])

  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 shrink-0"
      style={{ background: '#1a1a1a', borderTop: '1px solid #333' }}
    >
      <button
        type="button"
        onClick={() => void paste()}
        className="flex items-center justify-center size-8 rounded-lg shrink-0 active:opacity-60"
        style={{ background: '#2a2a2a', color: '#aaa' }}
        aria-label="Paste"
      >
        <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={1.6} />
      </button>
      <input
        ref={inputRef}
        type="text"
        defaultValue=""
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            send()
          }
          if (e.key === 'Tab') {
            e.preventDefault()
            void sendToActiveTab('\t')
          }
        }}
        placeholder="Type command…"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        className="flex-1 min-w-0 text-sm outline-none px-2 py-1 rounded-lg"
        style={{
          background: '#2a2a2a',
          color: '#e6e6e6',
          border: '1px solid #444',
          fontFamily: 'JetBrains Mono, Menlo, monospace',
        }}
      />
      <button
        type="button"
        onClick={ctrlC}
        className="flex items-center justify-center px-2 h-8 rounded-lg shrink-0 text-xs active:opacity-60"
        style={{ background: '#3a1a1a', color: '#f87171' }}
        aria-label="Ctrl+C"
      >
        ^C
      </button>
      <button
        type="button"
        onClick={send}
        className="flex items-center justify-center size-8 rounded-lg shrink-0 active:opacity-60"
        style={{ background: '#ea580c', color: '#fff' }}
        aria-label="Send"
      >
        <HugeiconsIcon icon={ArrowUp02Icon} size={16} strokeWidth={1.8} />
      </button>
    </div>
  )
}
