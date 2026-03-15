import { useState } from 'react'
import { cn } from '@/lib/utils'
import { create } from 'zustand'

// ── Store ─────────────────────────────────────────────────────────────────────

type InspectorStore = {
  isOpen: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

export const useInspectorStore = create<InspectorStore>((set) => ({
  isOpen: false,
  setOpen: (open) => set({ isOpen: open }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}))

// ── Tab types ─────────────────────────────────────────────────────────────────

type TabId = 'activity' | 'files' | 'memory' | 'skills' | 'logs'

const TABS: { id: TabId; label: string }[] = [
  { id: 'activity', label: 'Activity' },
  { id: 'files', label: 'Files' },
  { id: 'memory', label: 'Memory' },
  { id: 'skills', label: 'Skills' },
  { id: 'logs', label: 'Logs' },
]

// ── Placeholder content ───────────────────────────────────────────────────────

function ActivityTab() {
  return (
    <div className="space-y-2 p-3">
      <p className="text-xs" style={{ color: 'var(--theme-muted)' }}>
        Event stream will appear here during active sessions.
      </p>
      {[
        { type: 'assistant_start', time: '12:34:01', text: 'Assistant started' },
        { type: 'tool_call', time: '12:34:03', text: 'Tool: read_file' },
        { type: 'memory_write', time: '12:34:05', text: 'Memory updated' },
        { type: 'assistant_complete', time: '12:34:08', text: 'Assistant complete' },
      ].map((event, i) => (
        <div
          key={i}
          className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs"
          style={{ background: 'var(--theme-card2)' }}
        >
          <span style={{ color: 'var(--theme-accent)', fontFamily: 'monospace' }}>
            {event.time}
          </span>
          <span style={{ color: 'var(--theme-muted)' }}>{event.type}</span>
          <span className="ml-auto" style={{ color: 'var(--theme-text)' }}>
            {event.text}
          </span>
        </div>
      ))}
    </div>
  )
}

function FilesTab() {
  return (
    <div className="space-y-1 p-3">
      <p className="mb-2 text-xs" style={{ color: 'var(--theme-muted)' }}>
        Recently touched files
      </p>
      {['src/screens/chat/chat-screen.tsx', 'src/components/inspector/inspector-panel.tsx', 'src/styles.css'].map(
        (file, i) => (
          <div
            key={i}
            className="rounded px-2 py-1 text-xs font-mono truncate"
            style={{ color: 'var(--theme-text)', background: 'var(--theme-card2)' }}
          >
            {file}
          </div>
        ),
      )}
    </div>
  )
}

function MemoryTab() {
  return (
    <div className="space-y-1 p-3">
      <p className="mb-2 text-xs" style={{ color: 'var(--theme-muted)' }}>
        Memory entries loaded in session
      </p>
      {['SOUL.md', 'USER.md', 'MEMORY.md', 'memory/2026-03-15.md'].map((entry, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded px-2 py-1 text-xs"
          style={{ background: 'var(--theme-card2)' }}
        >
          <span className="shrink-0 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--theme-accent)' }} />
          <span style={{ color: 'var(--theme-text)' }}>{entry}</span>
        </div>
      ))}
    </div>
  )
}

function SkillsTab() {
  return (
    <div className="space-y-1 p-3">
      <p className="mb-2 text-xs" style={{ color: 'var(--theme-muted)' }}>
        Loaded skills
      </p>
      {['coding-agent', 'discord', 'weather', 'self-improvement', 'context-anchor'].map((skill, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded px-2 py-1 text-xs"
          style={{ background: 'var(--theme-card2)' }}
        >
          <span style={{ color: 'var(--theme-accent)' }}>⚡</span>
          <span style={{ color: 'var(--theme-text)' }}>{skill}</span>
        </div>
      ))}
    </div>
  )
}

function LogsTab() {
  return (
    <div className="p-3">
      <p className="mb-2 text-xs" style={{ color: 'var(--theme-muted)' }}>
        Raw event stream
      </p>
      <pre
        className="text-xs rounded p-2 overflow-auto max-h-[400px] font-mono"
        style={{ background: 'var(--theme-card2)', color: 'var(--theme-muted)' }}
      >{`{"type":"assistant_start","ts":1710000000000}
{"type":"tool_call","name":"read_file","ts":1710000002000}
{"type":"tool_result","name":"read_file","ts":1710000003500}
{"type":"assistant_complete","ts":1710000008000}`}</pre>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function InspectorPanel() {
  const isOpen = useInspectorStore((s) => s.isOpen)
  const [activeTab, setActiveTab] = useState<TabId>('activity')

  return (
    <div
      className={cn(
        'fixed right-0 top-0 h-full z-40 flex flex-col overflow-hidden transition-[width] duration-200',
        isOpen ? 'w-[350px]' : 'w-0',
      )}
      style={{
        background: 'var(--theme-panel)',
        borderLeft: '1px solid var(--theme-border)',
      }}
    >
      {isOpen && (
        <>
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: '1px solid var(--theme-border)' }}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--theme-text)' }}>
              Inspector
            </span>
            <button
              type="button"
              onClick={() => useInspectorStore.getState().setOpen(false)}
              className="rounded p-1 text-xs hover:opacity-70 transition-opacity"
              style={{ color: 'var(--theme-muted)' }}
              aria-label="Close inspector"
            >
              ✕
            </button>
          </div>

          {/* Tab bar */}
          <div
            className="flex shrink-0 overflow-x-auto"
            style={{ borderBottom: '1px solid var(--theme-border)' }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-3 py-2 text-xs font-medium shrink-0 transition-colors',
                  activeTab === tab.id
                    ? 'border-b-2'
                    : 'hover:opacity-80',
                )}
                style={{
                  color: activeTab === tab.id ? 'var(--theme-accent)' : 'var(--theme-muted)',
                  borderBottomColor: activeTab === tab.id ? 'var(--theme-accent)' : 'transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'activity' && <ActivityTab />}
            {activeTab === 'files' && <FilesTab />}
            {activeTab === 'memory' && <MemoryTab />}
            {activeTab === 'skills' && <SkillsTab />}
            {activeTab === 'logs' && <LogsTab />}
          </div>
        </>
      )}
    </div>
  )
}

// ── Toggle Button ─────────────────────────────────────────────────────────────

export function InspectorToggleButton({ className }: { className?: string }) {
  const toggle = useInspectorStore((s) => s.toggle)
  const isOpen = useInspectorStore((s) => s.isOpen)

  return (
    <button
      type="button"
      onClick={toggle}
      title={isOpen ? 'Close inspector' : 'Open inspector'}
      className={cn(
        'flex items-center justify-center rounded-lg px-2 py-1.5 text-xs transition-colors',
        isOpen ? 'opacity-100' : 'opacity-60 hover:opacity-90',
        className,
      )}
      style={{
        background: isOpen ? 'var(--theme-card2)' : undefined,
        color: 'var(--theme-text)',
        border: '1px solid var(--theme-border)',
      }}
      aria-label="Toggle inspector panel"
    >
      <span className="font-mono text-[11px]">{'{ }'}</span>
    </button>
  )
}
