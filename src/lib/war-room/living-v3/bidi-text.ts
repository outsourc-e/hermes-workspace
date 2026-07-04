const RTL_TEXT_RE = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/
const LTR_TECHNICAL_RE = /^(?:(?:[a-z]:)?[./~]|(?:https?:\/\/|[a-z]+:\/\/)|[{}[\]"'`]|(?:src|data|docs|public|api|pnpm|npm|git|curl|node|tsx|json|packetId|runId|stationId|roomId)\b|[A-Z0-9_]+-[A-Z0-9_-]+)/i

export function detectRtlText(text: string) {
  return RTL_TEXT_RE.test(text)
}

export function textDirectionFor(text: string): 'rtl' | 'ltr' {
  const value = text.trim()
  if (!value) return 'ltr'
  if (LTR_TECHNICAL_RE.test(value)) return 'ltr'
  return detectRtlText(value) ? 'rtl' : 'ltr'
}

export function bidiClassNameFor(text: string) {
  return textDirectionFor(text) === 'rtl' ? 'living-v3__bidi living-v3__bidi--rtl' : 'living-v3__bidi living-v3__bidi--ltr'
}
