import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface BriefProps {
  text: string
  subtitle: string
  onRegen?: () => void
  regenLoading?: boolean
}

const STORAGE_KEY = 'hud.brief.expanded'

function readInitialExpanded(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function persistExpanded(value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // ignore quota / disabled storage
  }
}

/**
 * Derive a short one-line summary from the brief markdown so the collapsed
 * state still surfaces today's first action without rendering ~2KB of text.
 * Walks the first few lines looking for: an explicit "First action" line,
 * else the first bold "priority" item, else the first non-heading line.
 */
function summarise(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const firstAction = lines.findIndex((l) => /^\*?\*?first action/i.test(l))
  if (firstAction >= 0 && firstAction + 1 < lines.length) {
    const next = lines[firstAction + 1]
      .replace(/^[-*]\s+/, '')
      .replace(/[*_`]/g, '')
      .trim()
    if (next) return next
  }
  const priority = lines.find((l) => /^\d+\.\s+\*\*/.test(l))
  if (priority) {
    return priority
      .replace(/^\d+\.\s+/, '')
      .replace(/[*_`]/g, '')
      .trim()
  }
  const firstReal = lines.find((l) => !/^#/.test(l) && !/^[-*]\s*$/.test(l))
  return firstReal ? firstReal.replace(/[*_`]/g, '').trim() : 'No content yet'
}

function BriefImpl({ text, subtitle, onRegen, regenLoading }: BriefProps) {
  const [expanded, setExpanded] = useState(readInitialExpanded)
  const summary = summarise(text)

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev
      persistExpanded(next)
      return next
    })
  }

  return (
    <div>
      <div className="text-[11px] text-[#8b949e] tracking-[0.15em] uppercase font-semibold mb-3 flex justify-between items-center">
        <span>{subtitle}</span>
        <div className="flex items-center gap-3 text-[11px] normal-case tracking-normal font-normal">
          <button
            type="button"
            onClick={toggle}
            className="text-[#58a6ff] hover:underline"
            aria-expanded={expanded}
          >
            {expanded ? 'Collapse ▴' : 'Expand ▾'}
          </button>
          {onRegen && (
            <button
              onClick={onRegen}
              disabled={regenLoading}
              className="text-[#58a6ff] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {regenLoading ? '… regenerating' : '↻ regen'}
            </button>
          )}
        </div>
      </div>
      {expanded ? (
        // Heavy ReactMarkdown render only happens when the user opts in
        <div className="font-serif text-[15px] leading-relaxed text-[#e6edf3] prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>p]:my-2 [&>ul]:my-2 [&>ol]:my-2 [&>h1]:text-[18px] [&>h2]:text-[16px] [&>h3]:text-[15px] [&_strong]:text-[#c4b5fd]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      ) : (
        <button
          type="button"
          onClick={toggle}
          className="block w-full text-left font-serif text-[15px] leading-relaxed text-[#e6edf3] hover:text-white"
        >
          <span className="text-[#c4b5fd] font-semibold mr-1.5">First up:</span>
          {summary}
        </button>
      )}
    </div>
  )
}

export const Brief = memo(BriefImpl)
