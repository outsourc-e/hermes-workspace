import { Fragment, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

type StreamingTextProps = {
  text: string
  isStreaming: boolean
}

type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string; language: string }

const CHARS_PER_FRAME = 15

function splitCodeFences(input: string): TextSegment[] {
  if (!input) return []

  const segments: TextSegment[] = []
  const fence = /```([^\n`]*)\n?([\s\S]*?)(```|$)/g
  let lastIndex = 0

  for (const match of input.matchAll(fence)) {
    const full = match[0]
    const lang = (match[1] || '').trim()
    const code = match[2] || ''
    const idx = match.index ?? 0

    if (idx > lastIndex) {
      segments.push({ type: 'text', value: input.slice(lastIndex, idx) })
    }

    segments.push({ type: 'code', value: code, language: lang })
    lastIndex = idx + full.length
  }

  if (lastIndex < input.length) {
    segments.push({ type: 'text', value: input.slice(lastIndex) })
  }

  return segments
}

function countWords(input: string): number {
  const match = input.match(/\S+/g)
  return match ? match.length : 0
}

export function StreamingText({ text, isStreaming }: StreamingTextProps) {
  const [revealedChars, setRevealedChars] = useState(isStreaming ? 0 : text.length)

  useEffect(() => {
    if (!isStreaming) {
      setRevealedChars(text.length)
      return
    }

    setRevealedChars((prev) => Math.min(prev, text.length))

    let rafId = 0
    const tick = () => {
      setRevealedChars((prev) => {
        if (prev >= text.length) return prev
        const next = Math.min(text.length, prev + CHARS_PER_FRAME)
        if (next < text.length) {
          rafId = requestAnimationFrame(tick)
        }
        return next
      })
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isStreaming, text])

  const shownText = isStreaming ? text.slice(0, revealedChars) : text
  const segments = useMemo(() => splitCodeFences(shownText), [shownText])
  const wordCount = countWords(shownText)

  let wordIndex = 0

  return (
    <div className="text-sm leading-6 text-[var(--theme-text)]">
      <style>{`
        @keyframes streaming-word-fade {
          from { opacity: 0.35; }
          to { opacity: 1; }
        }
      `}</style>

      {segments.length === 0 ? null : (
        <div className="whitespace-pre-wrap break-words">
          {segments.map((segment, segmentIndex) => {
            if (segment.type === 'code') {
              return (
                <div
                  key={`code-${segmentIndex}`}
                  className="my-2 overflow-x-auto rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)] p-2"
                >
                  {segment.language ? (
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--theme-muted)]">
                      {segment.language}
                    </p>
                  ) : null}
                  <pre className="m-0 whitespace-pre-wrap font-mono text-sm leading-6 text-[var(--theme-text)]">
                    <code>{segment.value}</code>
                  </pre>
                </div>
              )
            }

            const tokens = segment.value.split(/(\s+)/)
            return (
              <Fragment key={`text-${segmentIndex}`}>
                {tokens.map((token, tokenIndex) => {
                  if (token.length === 0) return null
                  const isWhitespace = /^\s+$/.test(token)
                  if (isWhitespace) {
                    return <span key={`space-${segmentIndex}-${tokenIndex}`}>{token}</span>
                  }

                  const currentWord = wordIndex
                  wordIndex += 1
                  const isNewWord = isStreaming && currentWord >= wordCount - 1

                  return (
                    <span
                      key={`word-${segmentIndex}-${tokenIndex}`}
                      style={
                        isNewWord
                          ? { animation: 'streaming-word-fade 220ms ease-out both' }
                          : undefined
                      }
                    >
                      {token}
                    </span>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
      )}

      {isStreaming ? (
        <span
          aria-hidden="true"
          className={cn('ml-0.5 inline-block h-4 w-1 align-[-2px] animate-pulse rounded-sm bg-emerald-400')}
        />
      ) : null}
    </div>
  )
}
