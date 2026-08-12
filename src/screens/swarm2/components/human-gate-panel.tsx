'use client'

import { useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, Cancel01Icon, ComputerTerminal01Icon, PlayIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import type { HumanGate, HumanGateResumeRequest } from '../hooks/use-human-gate'
import { deriveHumanGateOptions, type HumanGateChoice } from '../lib/human-gate-options'

type HumanGatePanelProps = {
  gate: HumanGate
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenRuntime?: (workerId: string) => void
  onResume: (request: HumanGateResumeRequest) => void
  isResuming: boolean
  resumeError: Error | null
}

function Section({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
        {label}
      </div>
      <div className="text-sm text-[var(--theme-text)]">{children}</div>
    </div>
  )
}

function MonoBlock({ text }: { text: string }) {
  if (!text || text.trim() === 'none') return <span className="text-[var(--theme-muted)]">—</span>
  return (
    <div className="max-h-32 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2.5 text-xs leading-relaxed text-[var(--theme-text)]">
      {text}
    </div>
  )
}

function OptionCard({
  selected,
  label,
  description,
  targetWorkerId,
  onSelect,
}: {
  selected: boolean
  label: string
  description: string
  targetWorkerId: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-2xl border p-3.5 text-left transition-colors',
        selected
          ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] ring-1 ring-[var(--theme-accent)]/30'
          : 'border-[var(--theme-border)] bg-[var(--theme-bg)] hover:border-[var(--theme-muted)]',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
            selected
              ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]'
              : 'border-[var(--theme-border)] bg-[var(--theme-card)]',
          )}
        >
          {selected ? <span className="size-1.5 rounded-full bg-white" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--theme-text)]">{label}</span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--theme-muted-2)]">{description}</span>
          <span className="mt-2 inline-flex rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-0.5 text-[10px] font-medium text-[var(--theme-muted)]">
            → {targetWorkerId}
          </span>
        </span>
      </div>
    </button>
  )
}

export function HumanGatePanel({
  gate,
  open,
  onOpenChange,
  onOpenRuntime,
  onResume,
  isResuming,
  resumeError,
}: HumanGatePanelProps) {
  const options = useMemo(() => deriveHumanGateOptions(gate), [gate])
  const [useMock, setUseMock] = useState(false)
  const [lastAction, setLastAction] = useState<'approved' | 'abort' | null>(null)
  const [selectedChoice, setSelectedChoice] = useState<HumanGateChoice>('primary')
  const [humanNote, setHumanNote] = useState('')
  const [explicitChoice, setExplicitChoice] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedChoice('primary')
      setHumanNote('')
      setExplicitChoice(false)
    }
  }, [open, gate.missionId, gate.workerId])

  useEffect(() => {
    if (resumeError) {
      toast(`Resume failed: ${resumeError.message}`, { type: 'error' })
    }
  }, [resumeError])

  const effectiveChoice: HumanGateChoice =
    !explicitChoice && humanNote.trim() ? 'custom' : selectedChoice

  const resolvedTarget =
    effectiveChoice === 'secondary'
      ? options.secondary.targetWorkerId
      : effectiveChoice === 'custom'
        ? gate.workerId
        : options.primary.targetWorkerId

  // Determine wait duration if selected option has waitMinutesOptions
  const selectedOption = effectiveChoice === 'secondary' ? options.secondary : options.primary
  const continueWaitMinutes = selectedOption.waitMinutesOptions?.[0] || undefined

  const canApprove = effectiveChoice !== 'custom' || humanNote.trim().length > 0

  const handleResume = (action: 'approved' | 'abort') => {
    setLastAction(action)
    if (action === 'abort') {
      onResume({ action, mock: useMock })
      onOpenChange(false)
      return
    }
    onResume({
      action,
      choice: effectiveChoice,
      humanNote: humanNote.trim(),
      targetWorkerId: resolvedTarget,
      continueWaitMinutes,
      mock: useMock,
    })
    onOpenChange(false)
  }

  const cp = gate.checkpoint

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(560px,92vw)]"
        style={{ background: 'var(--theme-card)' }}
      >
        <div className="flex items-start gap-3 border-b border-[var(--theme-border)] p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-warning-soft)] text-[var(--theme-warning)]">
            <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base font-semibold">Mission 需要人工决策</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              选择下一步如何处理，或填写自定义说明（参考 Hermes / Claude Code 澄清交互）。
            </DialogDescription>
          </div>
          <DialogClose />
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--theme-text)]">
              {gate.workerId}
            </span>
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                gate.verdict === 'BLOCKED'
                  ? 'bg-red-500/12 text-red-600 border border-red-500/25'
                  : gate.verdict === 'NEEDS_INPUT'
                    ? 'bg-amber-500/12 text-amber-600 border border-amber-500/25'
                    : 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)] border border-[var(--theme-accent)]/25',
              )}
            >
              {gate.verdict}
            </span>
            {gate.blockerType ? (
              <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2.5 py-1 text-[11px] text-[var(--theme-muted)]">
                {gate.blockerType}
              </span>
            ) : null}
          </div>

          <Section label="阻塞原因">
            <p className="leading-relaxed">{gate.blockerSummary || '未提供详细阻塞原因'}</p>
          </Section>

          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
              选择下一步
            </div>
            <div className="space-y-2">
              <OptionCard
                selected={explicitChoice && selectedChoice === 'primary'}
                label={options.primary.label}
                description={options.primary.description}
                targetWorkerId={options.primary.targetWorkerId}
                onSelect={() => {
                  setSelectedChoice('primary')
                  setExplicitChoice(true)
                }}
              />
              <OptionCard
                selected={explicitChoice && selectedChoice === 'secondary'}
                label={options.secondary.label}
                description={options.secondary.description}
                targetWorkerId={options.secondary.targetWorkerId}
                onSelect={() => {
                  setSelectedChoice('secondary')
                  setExplicitChoice(true)
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
              自定义说明
            </div>
            <textarea
              value={humanNote}
              onChange={(e) => setHumanNote(e.target.value)}
              placeholder={options.customPlaceholder}
              rows={4}
              className={cn(
                'w-full resize-y rounded-2xl border bg-[var(--theme-bg)] p-3 text-sm leading-relaxed text-[var(--theme-text)] outline-none transition-colors placeholder:text-[var(--theme-muted)]',
                !explicitChoice && humanNote.trim()
                  ? 'border-[var(--theme-accent)] ring-1 ring-[var(--theme-accent)]/30'
                  : 'border-[var(--theme-border)] focus:border-[var(--theme-accent)]',
              )}
            />
            <p className="text-[11px] text-[var(--theme-muted)]">
              {!explicitChoice && humanNote.trim()
                ? `将作为自定义说明派发给 ${gate.workerId}。`
                : explicitChoice
                  ? `已选「${selectedChoice === 'secondary' ? options.secondary.label : options.primary.label}」，下方文字会作为补充说明。`
                  : '不选上方选项时，仅填写此处将作为第三条自定义路径。'}
            </p>
          </div>

          {gate.reasoning ? (
            <Section label="编排器推理">
              <p className="leading-relaxed text-[var(--theme-muted-2)]">{gate.reasoning}</p>
            </Section>
          ) : null}

          {gate.logEntries.length > 0 ? (
            <Section label="执行日志">
              <div className="max-h-48 overflow-auto rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2.5 font-mono text-xs leading-relaxed text-[var(--theme-muted-2)]">
                {gate.logEntries.map((entry, i) => (
                  <div key={i} className="py-0.5">{entry}</div>
                ))}
              </div>
            </Section>
          ) : null}

          {cp ? (
            <div className="space-y-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
                最新 checkpoint
              </div>
              {cp.result ? <Section label="Result"><MonoBlock text={cp.result} /></Section> : null}
              {cp.files_changed ? <Section label="Files changed"><MonoBlock text={cp.files_changed} /></Section> : null}
              {cp.commands_run ? <Section label="Commands run"><MonoBlock text={cp.commands_run} /></Section> : null}
              {cp.next_action ? <Section label="Next action"><MonoBlock text={cp.next_action} /></Section> : null}
            </div>
          ) : null}

          {gate.blockerType === 'timeout' || /tmux|paste|live session/i.test(gate.blockerSummary) ? (
            <Section label="tmux 投递提示">
              <p className="text-xs leading-relaxed text-[var(--theme-muted-2)]">
                派发走 tmux 优先路径。若 worker 未响应，请用 Runtime 打开 tmux 会话检查 TUI 状态，修复后确认继续。
              </p>
            </Section>
          ) : null}

          {gate.analysis ? (
            <Section label="路由分析">
              <MonoBlock text={gate.analysis} />
            </Section>
          ) : null}

          <div className="text-[10px] text-[var(--theme-muted)]">
            迭代 {gate.iteration} / {gate.maxIterations}
            {effectiveChoice !== 'custom' ? (
              <span className="ml-2">· 将派发给 {resolvedTarget}</span>
            ) : null}
          </div>

          {isResuming ? (
            <div className="flex items-center gap-2 text-sm text-[var(--theme-muted)]">
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-[var(--theme-border)] border-t-[var(--theme-accent)]" />
              {lastAction === 'approved' ? '正在恢复 mission…' : '正在中止 mission…'}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--theme-border)] p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            {onOpenRuntime ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenRuntime(gate.workerId)}
                disabled={isResuming}
              >
                <HugeiconsIcon icon={ComputerTerminal01Icon} size={14} strokeWidth={1.8} />
                Runtime
              </Button>
            ) : null}
            {import.meta.env.DEV ? (
              <label className="flex items-center gap-1.5 text-xs text-[var(--theme-muted)]">
                <input
                  type="checkbox"
                  checked={useMock}
                  onChange={(e) => setUseMock(e.target.checked)}
                  className="rounded border-[var(--theme-border)]"
                />
                mock
              </label>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => handleResume('abort')}
              disabled={isResuming}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
              中止
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handleResume('approved')}
              disabled={isResuming || !canApprove}
            >
              <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={1.8} />
              确认并继续
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
