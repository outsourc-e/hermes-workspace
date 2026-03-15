import { useCallback, useState } from 'react'
import { cn } from '@/lib/utils'

export type ExportableMissionReport = {
  id: string
  name?: string
  goal: string
  teamName: string
  agents: Array<{ id: string; name: string; modelId: string }>
  tokenCount: number
  costEstimate: number
  duration: number
  completedAt: number
  report: string
  artifacts: Array<{ name?: string; type?: string; path?: string; url?: string }>
  [key: string]: unknown
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.round((ms % 60000) / 1000)
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

function generateMarkdown(report: ExportableMissionReport): string {
  const lines: string[] = []
  const completedDate = report.completedAt
    ? new Date(report.completedAt).toLocaleString()
    : 'Unknown'

  lines.push(`# Mission Report: ${report.name || report.goal}`)
  lines.push('')
  lines.push(`**Goal:** ${report.goal}`)
  lines.push(`**Team:** ${report.teamName}`)
  lines.push(`**Completed:** ${completedDate}`)
  lines.push(`**Duration:** ${formatDuration(report.duration)}`)
  lines.push(`**Tokens:** ${report.tokenCount.toLocaleString()}`)
  lines.push(`**Cost:** $${report.costEstimate.toFixed(4)}`)
  lines.push('')

  // Agents
  lines.push('## Team')
  lines.push('')
  lines.push('| Agent | Model |')
  lines.push('|-------|-------|')
  for (const agent of report.agents) {
    const model = agent.modelId.split('/').pop() ?? agent.modelId
    lines.push(`| ${agent.name} | ${model} |`)
  }
  lines.push('')

  // Artifacts
  if (report.artifacts.length > 0) {
    lines.push('## Artifacts')
    lines.push('')
    for (const a of report.artifacts) {
      lines.push(`- **${a.name ?? 'Untitled'}** (${a.type ?? 'file'})${a.path ? ` — \`${a.path}\`` : ''}`)
    }
    lines.push('')
  }

  // Transcript
  if (report.report) {
    lines.push('## Transcript')
    lines.push('')
    lines.push(report.report)
    lines.push('')
  }

  lines.push('---')
  lines.push(`*Exported from Hermes Workspace Agent Hub on ${new Date().toLocaleString()}*`)

  return lines.join('\n')
}

export function ExportMissionButton({ report }: { report: ExportableMissionReport }) {
  const [copied, setCopied] = useState(false)

  const handleDownload = useCallback(() => {
    const md = generateMarkdown(report)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mission-${report.name?.replace(/\s+/g, '-').toLowerCase() ?? report.id}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [report])

  const handleCopy = useCallback(async () => {
    const md = generateMarkdown(report)
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = md
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [report])

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleDownload}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700',
          'px-2.5 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400',
          'hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors',
        )}
      >
        📄 Export .md
      </button>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700',
          'px-2.5 py-1.5 text-xs font-medium transition-colors',
          copied
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800',
        )}
      >
        {copied ? '✓ Copied' : '📋 Copy MD'}
      </button>
    </div>
  )
}
