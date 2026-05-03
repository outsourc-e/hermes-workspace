import { useState } from 'react'
import { Cancel01Icon, HelpCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@/lib/utils'

type HelpSection = {
  title: string
  bullets: string[]
}

export function WorkflowHelpModal({
  title,
  eyebrow,
  sections,
  triggerLabel = 'How it works',
  compact = false,
}: {
  title: string
  eyebrow?: string
  sections: HelpSection[]
  triggerLabel?: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)]',
          compact ? 'px-2.5 py-2 text-xs font-medium' : 'px-3 py-2 text-sm font-medium',
        )}
      >
        <HugeiconsIcon icon={HelpCircleIcon} size={compact ? 14 : 16} strokeWidth={1.8} />
        <span>{triggerLabel}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--theme-border)] px-5 py-4">
              <div className="min-w-0">
                {eyebrow ? (
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
                    {eyebrow}
                  </p>
                ) : null}
                <h2 className="text-lg font-semibold">{title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]"
                aria-label={`Close ${title}`}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5">
              {sections.map((section) => (
                <section key={section.title} className="space-y-2">
                  <h3 className="text-sm font-semibold text-[var(--theme-text)]">
                    {section.title}
                  </h3>
                  <ul className="space-y-1.5 text-sm text-[var(--theme-muted)]">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-2">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--theme-accent)]" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
