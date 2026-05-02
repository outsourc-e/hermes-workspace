export type StreamingActivitySectionState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error'

export type StreamingActivitySection = {
  type: string
  input?: Record<string, unknown>
  state: StreamingActivitySectionState
}

function readStringArg(
  args: Record<string, unknown> | undefined,
  ...keys: Array<string>
): string | null {
  if (!args) return null
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return null
}

function fileNameFromPath(value: string): string {
  const normalized = value.trim().replace(/[\\/]+$/, '')
  if (!normalized) return value.trim()
  const parts = normalized.split(/[\\/]/)
  return parts[parts.length - 1] || normalized
}

export function formatStreamingActivityLabel(
  name: string,
  args?: Record<string, unknown>,
): string {
  const lowerName = name.trim().toLowerCase()

  if (lowerName === 'read' || lowerName === 'read_file') {
    const filePath = readStringArg(args, 'file_path', 'path', 'target_file')
    return filePath ? `read ${fileNameFromPath(filePath)}` : 'read file'
  }

  if (lowerName === 'browser' || lowerName === 'browser_navigate') {
    const action = readStringArg(args, 'action', 'url')
    return action ? `browser ${action}` : 'browser navigate'
  }

  if (lowerName === 'terminal' || lowerName === 'exec') {
    const cmd = readStringArg(args, 'command', 'cmd')
    return cmd
      ? `exec ${cmd.length > 30 ? `${cmd.slice(0, 27)}…` : cmd}`
      : 'exec'
  }

  return lowerName.replace(/_/g, ' ')
}

export function buildHermesActivitySummary(
  sections: Array<StreamingActivitySection>,
): {
  countLabel: string
  statusLabel: string
  visibleLabel: string
  collapsedLabel: string
  runningCount: number
  errorCount: number
  doneCount: number
} {
  if (sections.length === 0) {
    return {
      countLabel: '0 calls',
      statusLabel: 'idle',
      visibleLabel: 'No active tools',
      collapsedLabel: 'No active tools',
      runningCount: 0,
      errorCount: 0,
      doneCount: 0,
    }
  }

  const runningCount = sections.filter(
    (section) =>
      section.state === 'input-available' ||
      section.state === 'input-streaming',
  ).length
  const errorCount = sections.filter(
    (section) => section.state === 'output-error',
  ).length
  const doneCount = sections.length - runningCount - errorCount
  const labels = Array.from(
    new Set(
      sections.map((section) =>
        formatStreamingActivityLabel(section.type, section.input),
      ),
    ),
  )
  const visibleLabels = labels.slice(0, 3).join(', ')
  const overflowLabel = labels.length > 3 ? ` +${labels.length - 3} more` : ''
  const statusLabel =
    runningCount > 0
      ? `${runningCount} running`
      : errorCount > 0
        ? `${errorCount} failed`
        : `${doneCount} done`

  const countLabel = `${sections.length} ${sections.length === 1 ? 'call' : 'calls'}`
  const visibleLabel = `${visibleLabels}${overflowLabel}`

  return {
    countLabel,
    statusLabel,
    visibleLabel,
    collapsedLabel: visibleLabel,
    runningCount,
    errorCount,
    doneCount,
  }
}

export function shouldAutoExpandHermesActivityCard({
  isStreaming,
  toolCount,
}: {
  isStreaming: boolean
  toolCount: number
}): boolean {
  return isStreaming && toolCount > 0
}

export function shouldRenderStandaloneActivityMenu({
  isUser,
  isStreaming,
  hasRevealedText,
  streamToolCount,
}: {
  isUser: boolean
  isStreaming: boolean
  hasRevealedText: boolean
  streamToolCount: number
}): boolean {
  return !isUser && isStreaming && !hasRevealedText && streamToolCount > 0
}

export function shouldRenderStreamingThoughtSummary({
  isStreaming,
  hasRevealedText,
  streamToolCount,
  thinking,
}: {
  isStreaming: boolean
  hasRevealedText: boolean
  streamToolCount: number
  thinking: string | null | undefined
}): boolean {
  if (!thinking || thinking.trim().length === 0) return false

  // During live generation, the bottom thinking bubble owns the idle/thinking state
  // and the grouped Hermes activity card owns live tool activity. That means the
  // separate lightbulb summary row should stay gone while streaming, regardless of
  // whether tool calls have started yet.
  if (isStreaming) return false

  return !hasRevealedText && streamToolCount === 0
}
