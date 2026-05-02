import { memo, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * TUI-style activity card.
 *
 * Renders thinking + all tool calls as a single card above the assistant
 * message bubble. Rows mimic Claude Code / Codex CLI tool output:
 *
 *   💭 Thinking 4s
 *     ⎿ Looking at chat component…
 *   ● Read message-item.tsx
 *     ⎿ 1240 lines
 *   ● Edit message-item.tsx
 *     ⎿ 2 changes
 *   ○ exec pnpm build
 *     ⎿ running…
 */

export type TuiToolSection = {
  key: string
  type: string
  input?: Record<string, unknown>
  preview?: string
  outputText: string
  errorText?: string
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error'
}

type TuiActivityCardProps = {
  toolSections: Array<TuiToolSection>
  thinking?: string | null
  thinkingElapsedSeconds?: number
  isStreaming: boolean
  expandAll?: boolean
  /** Format a tool's display label from name+args */
  formatLabel: (name: string, args?: Record<string, unknown>) => string
  /** Get the most useful single arg to show next to the label */
  formatArg: (name: string, args?: Record<string, unknown>) => string | null
}

function statusDot(
  state: TuiToolSection['state'],
  isStreamingActive: boolean,
): string {
  if (state === 'output-error') return '✗'
  if (state === 'output-available') return '●'
  // input-available / input-streaming = pending
  return isStreamingActive ? '○' : '●'
}

function statusColor(
  state: TuiToolSection['state'],
  isStreamingActive: boolean,
): string {
  if (state === 'output-error') return 'var(--theme-danger, #ef4444)'
  if (state === 'output-available') return 'var(--theme-success, #22c55e)'
  return isStreamingActive
    ? 'var(--theme-accent, #6366f1)'
    : 'var(--theme-muted, #888)'
}

function summarizeOutput(text: string, maxLen = 120): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  // First non-empty line, capped
  const firstLine = trimmed.split('\n').find((line) => line.trim()) ?? ''
  const compact = firstLine.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLen) return compact
  return `${compact.slice(0, maxLen - 1)}…`
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function ToolRow({
  section,
  isStreamingActive,
  expandAll,
  formatLabel,
  formatArg,
}: {
  section: TuiToolSection
  isStreamingActive: boolean
  expandAll?: boolean
  formatLabel: (name: string, args?: Record<string, unknown>) => string
  formatArg: (name: string, args?: Record<string, unknown>) => string | null
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (expandAll) setOpen(true)
  }, [expandAll])

  const isError = section.state === 'output-error'
  const isDone = section.state === 'output-available'
  const isPending = !isError && !isDone

  // Per-row elapsed timer when running
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isPending || !isStreamingActive) {
      setElapsed(0)
      return
    }
    setElapsed(0)
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [isPending, isStreamingActive, section.key])

  const label = formatLabel(section.type, section.input)
  const arg = formatArg(section.type, section.input)
  const argLabel = section.preview ?? arg ?? null
  const argTruncated =
    argLabel && argLabel.length > 60 ? `${argLabel.slice(0, 57)}…` : argLabel

  const outputText = section.outputText || section.errorText || ''
  const outputSummary = isPending
    ? isStreamingActive
      ? 'running…'
      : 'pending'
    : summarizeOutput(outputText) || (isDone ? 'done' : 'failed')

  const dot = statusDot(section.state, isStreamingActive)
  const color = statusColor(section.state, isStreamingActive)

  const hasInputData =
    section.input && Object.keys(section.input).length > 0
  const hasOutputData = !!(section.outputText || section.errorText)
  const canExpand = hasInputData || hasOutputData

  return (
    <div className="font-mono text-[12px] leading-relaxed">
      <button
        type="button"
        onClick={() => canExpand && setOpen((v) => !v)}
        className={cn(
          'group flex w-full items-baseline gap-2 px-2 py-0.5 text-left rounded-sm',
          canExpand && 'hover:bg-[color-mix(in_srgb,var(--theme-accent)_8%,transparent)]',
          !canExpand && 'cursor-default',
        )}
      >
        <span
          className={cn(
            'shrink-0 leading-none',
            isPending && isStreamingActive && 'animate-pulse',
          )}
          style={{ color }}
        >
          {dot}
        </span>
        <span
          className="shrink-0 font-semibold"
          style={{ color: 'var(--theme-text)' }}
        >
          {label}
        </span>
        {argTruncated && argTruncated !== label ? (
          <span
            className="truncate min-w-0 opacity-70"
            style={{ color: 'var(--theme-muted)' }}
          >
            {argTruncated}
          </span>
        ) : null}
        <span className="flex-1" />
        {isPending && isStreamingActive && elapsed > 0 ? (
          <span
            className="shrink-0 tabular-nums text-[10px] opacity-60"
            style={{ color: 'var(--theme-muted)' }}
          >
            {formatElapsed(elapsed)}
          </span>
        ) : null}
        {canExpand ? (
          <span
            className="shrink-0 text-[10px] opacity-40"
            style={{ color: 'var(--theme-muted)' }}
          >
            {open ? '▾' : '▸'}
          </span>
        ) : null}
      </button>
      {/* Output preview line — TUI-style ⎿ */}
      <div
        className="flex items-baseline gap-1 px-2 pl-6 opacity-70"
        style={{ color: isError ? 'var(--theme-danger, #ef4444)' : 'var(--theme-muted)' }}
      >
        <span className="shrink-0 leading-none opacity-50">⎿</span>
        <span className="truncate min-w-0">{outputSummary}</span>
      </div>
      {open && canExpand ? (
        <div
          className="mx-2 mt-1 mb-1 rounded border px-2 py-1.5 text-[11px]"
          style={{
            background: 'var(--code-bg, color-mix(in srgb, var(--theme-card) 70%, transparent))',
            borderColor: 'var(--theme-border)',
          }}
        >
          {hasInputData ? (
            <div>
              <div
                className="mb-0.5 font-sans text-[9px] uppercase tracking-widest opacity-50"
                style={{ color: 'var(--theme-muted)' }}
              >
                Input
              </div>
              <pre
                className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded font-mono text-[10px]"
                style={{ color: 'var(--code-foreground, var(--theme-text))' }}
              >
                {JSON.stringify(section.input, null, 2)}
              </pre>
            </div>
          ) : null}
          {hasOutputData ? (
            <div className={cn(hasInputData && 'mt-1.5')}>
              <div
                className="mb-0.5 font-sans text-[9px] uppercase tracking-widest opacity-50"
                style={{
                  color: isError
                    ? 'var(--theme-danger, #ef4444)'
                    : 'var(--theme-muted)',
                }}
              >
                {isError ? 'Error' : 'Output'}
              </div>
              <pre
                className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded font-mono text-[10px]"
                style={{
                  color: isError
                    ? 'var(--theme-danger, #ef4444)'
                    : 'var(--code-foreground, var(--theme-text))',
                }}
              >
                {section.outputText || section.errorText || ''}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ThinkingRow({
  thinking,
  elapsedSeconds,
  isStreaming,
  expandAll,
}: {
  thinking: string
  elapsedSeconds: number
  isStreaming: boolean
  expandAll?: boolean
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (expandAll) setOpen(true)
  }, [expandAll])

  const summary = summarizeOutput(thinking) || 'thinking…'

  return (
    <div className="font-mono text-[12px] leading-relaxed">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-baseline gap-2 px-2 py-0.5 text-left rounded-sm hover:bg-[color-mix(in_srgb,var(--theme-accent)_8%,transparent)]"
      >
        <span className="shrink-0 leading-none">💭</span>
        <span
          className="shrink-0 font-semibold"
          style={{ color: 'var(--theme-text)' }}
        >
          Thinking
        </span>
        <span className="flex-1" />
        {isStreaming && elapsedSeconds > 0 ? (
          <span
            className="shrink-0 tabular-nums text-[10px] opacity-60"
            style={{ color: 'var(--theme-muted)' }}
          >
            {formatElapsed(elapsedSeconds)}
          </span>
        ) : null}
        <span
          className="shrink-0 text-[10px] opacity-40"
          style={{ color: 'var(--theme-muted)' }}
        >
          {open ? '▾' : '▸'}
        </span>
      </button>
      <div
        className="flex items-baseline gap-1 px-2 pl-6 opacity-70"
        style={{ color: 'var(--theme-muted)' }}
      >
        <span className="shrink-0 leading-none opacity-50">⎿</span>
        <span className="truncate min-w-0 italic">{summary}</span>
      </div>
      {open ? (
        <div
          className="mx-2 mt-1 mb-1 rounded border px-2 py-1.5 text-[11px]"
          style={{
            background: 'var(--code-bg, color-mix(in srgb, var(--theme-card) 70%, transparent))',
            borderColor: 'var(--theme-border)',
          }}
        >
          <p
            className="whitespace-pre-wrap text-pretty text-[12px]"
            style={{ color: 'var(--theme-text)' }}
          >
            {thinking}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function TuiActivityCardComponent({
  toolSections,
  thinking,
  thinkingElapsedSeconds = 0,
  isStreaming,
  expandAll,
  formatLabel,
  formatArg,
}: TuiActivityCardProps) {
  const hasThinking = !!(thinking && thinking.trim().length > 0)
  const hasTools = toolSections.length > 0

  const summary = useMemo(() => {
    if (!hasTools) return null
    const total = toolSections.length
    const errors = toolSections.filter((s) => s.state === 'output-error').length
    const running = toolSections.filter(
      (s) => s.state === 'input-available' || s.state === 'input-streaming',
    ).length
    const done = total - errors - running

    if (errors > 0) return `${errors} failed · ${done} done`
    if (running > 0) return `${running} running · ${done} done`
    return `${total} ${total === 1 ? 'tool' : 'tools'} · done`
  }, [toolSections, hasTools])

  const summaryColor =
    summary?.includes('failed')
      ? 'var(--theme-danger, #ef4444)'
      : summary?.includes('running')
        ? 'var(--theme-accent, #6366f1)'
        : 'var(--theme-success, #22c55e)'

  // During streaming with nothing to show yet, render a minimal "working" stub
  // so we don't pretend the agent is thinking when no thinking text was emitted.
  // (Hermes Agent currently emits tool.completed only after the run, not live.)
  const isWorkingStub = !hasThinking && !hasTools && isStreaming
  if (!hasThinking && !hasTools && !isWorkingStub) return null

  return (
    <div
      className="w-full max-w-[min(100%,720px)] overflow-hidden rounded-lg border"
      style={{
        background:
          'color-mix(in srgb, var(--theme-card2) 92%, var(--theme-bg) 8%)',
        borderColor:
          'color-mix(in srgb, var(--theme-border) 88%, transparent)',
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-1.5"
        style={{
          borderColor:
            'color-mix(in srgb, var(--theme-border) 70%, transparent)',
          background:
            'color-mix(in srgb, var(--theme-card) 50%, transparent)',
        }}
      >
        <span
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          {isStreaming ? '⚡ Working' : 'Activity'}
        </span>
        <span className="flex-1" />
        {summary ? (
          <span
            className="font-mono text-[10px] tabular-nums"
            style={{ color: summaryColor }}
          >
            {summary}
          </span>
        ) : null}
        {isStreaming ? (
          <span
            className="size-1.5 rounded-full animate-pulse"
            style={{ background: 'var(--theme-accent, #6366f1)' }}
          />
        ) : null}
      </div>
      <div className="flex flex-col py-1">
        {hasThinking ? (
          <ThinkingRow
            thinking={thinking!}
            elapsedSeconds={thinkingElapsedSeconds}
            isStreaming={isStreaming}
            expandAll={expandAll}
          />
        ) : null}
        {toolSections.map((section, index) => (
          <ToolRow
            key={section.key || `${section.type}-${index}`}
            section={section}
            isStreamingActive={isStreaming}
            expandAll={expandAll}
            formatLabel={formatLabel}
            formatArg={formatArg}
          />
        ))}
        {isWorkingStub ? (
          <div
            className="flex items-baseline gap-2 px-2 py-0.5 font-mono text-[12px] leading-relaxed"
            style={{ color: 'var(--theme-muted)' }}
          >
            <span
              className="size-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--theme-accent, #6366f1)' }}
            />
            <span className="opacity-80">working…</span>
            <span className="opacity-50 text-[10px]">
              tool activity will appear after the run
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export const TuiActivityCard = memo(TuiActivityCardComponent)
