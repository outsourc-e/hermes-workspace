const QUEUED_WRAPPER_MARKER = '[Queued messages while agent was busy]'
const QUEUED_HEADER_REGEX = /---\s*\n?Queued #\d+\s*\n/g
const QUEUED_MARKER_REGEX = /^\[Queued messages while agent was busy\]\s*\n?/g

export function stripQueuedWrapper(text: string): string {
  if (!text.includes(QUEUED_WRAPPER_MARKER)) return text

  const messages = text
    .split(QUEUED_HEADER_REGEX)
    .map((part) => part.replace(QUEUED_MARKER_REGEX, '').trim())
    .filter(Boolean)

  return messages.join('\n\n')
}
