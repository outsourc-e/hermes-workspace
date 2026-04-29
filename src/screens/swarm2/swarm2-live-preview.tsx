'use client'

import { useEffect, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowExpand02Icon,
  ArrowShrink02Icon,
  Globe02Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

type Swarm2LivePreviewProps = {
  workerId: string
  url: string | null
  source?: 'runtime' | 'script-port' | 'none'
  className?: string
  /** Show iframe expanded by default. */
  defaultExpanded?: boolean
}

/**
 * Inline iframe preview. Collapsed by default to keep the card light.
 * When expanded, embeds the worker's local dev server directly so the
 * user can see live output without leaving /swarm2.
 *
 * Important: only embeds when previewSource is verified (runtime / script-port).
 * Refuses to embed if the URL is unsourced.
 */
export function Swarm2LivePreview({
  workerId,
  url,
  source = 'none',
  className,
  defaultExpanded = false,
}: Swarm2LivePreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [reloadKey, setReloadKey] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    setExpanded(defaultExpanded)
  }, [defaultExpanded, url])

  if (!url || source === 'none') {
    return null
  }

  return (
    <section
      className={cn(
        'rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-2',
        className,
      )}
    >
      <div
        className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="inline-flex min-w-0 items-center gap-1">
          <HugeiconsIcon icon={Globe02Icon} size={11} />
          Live
          <span className="ml-1 inline-flex items-center gap-1 truncate rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-1.5 py-0.5 text-[9px] normal-case tracking-normal text-[var(--theme-muted-2)]">
            <span className="truncate">{url.replace(/^https?:\/\//, '')}</span>
          </span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Reload preview"
            title="Reload preview"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]"
            onClick={(event) => {
              event.stopPropagation()
              setReloadKey((value) => value + 1)
            }}
          >
            <HugeiconsIcon icon={RefreshIcon} size={10} />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in new tab"
            title="Open in new tab"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]"
          >
            <HugeiconsIcon icon={ArrowExpand02Icon} size={10} />
          </a>
          <button
            type="button"
            aria-label={expanded ? 'Collapse preview' : 'Expand preview'}
            title={expanded ? 'Collapse preview' : 'Expand preview'}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]"
            onClick={(event) => {
              event.stopPropagation()
              setExpanded((value) => !value)
            }}
          >
            <HugeiconsIcon icon={expanded ? ArrowShrink02Icon : ArrowExpand02Icon} size={10} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div
          className="mt-2 overflow-hidden rounded-lg border border-[var(--theme-border)] bg-black"
          onClick={(event) => event.stopPropagation()}
        >
          <iframe
            key={`${workerId}-${reloadKey}`}
            ref={iframeRef}
            src={url}
            title={`${workerId} preview`}
            className="block h-[200px] w-full"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <p
          className="mt-1 text-[10px] text-[var(--theme-muted)]"
          onClick={(event) => event.stopPropagation()}
        >
          Click ⤢ to embed the live site, or ↗ to open in a new tab.
        </p>
      )}
    </section>
  )
}
