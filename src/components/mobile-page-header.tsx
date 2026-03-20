/**
 * MobilePageHeader — native app-style sticky top bar for non-chat pages.
 * Shows hamburger on the left, page title centered, optional right action.
 */
import type { ReactNode } from 'react'
import { openHamburgerMenu } from '@/components/mobile-hamburger-menu'
import { cn } from '@/lib/utils'

type MobilePageHeaderProps = {
  title: string
  right?: ReactNode
  className?: string
}

export function MobilePageHeader({ title, right, className }: MobilePageHeaderProps) {
  return (
    <div
      className={cn(
        'md:hidden flex items-center h-12 px-2 shrink-0',
        'border-b bg-surface',
        className,
      )}
      style={{ borderColor: 'var(--color-border, #e5e7eb)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <button
        type="button"
        aria-label="Open navigation menu"
        onClick={openHamburgerMenu}
        className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl active:bg-white/10 transition-colors touch-manipulation z-10"
      >
        <svg width="20" height="16" viewBox="0 0 20 16" fill="none" className="opacity-70" style={{ color: 'var(--color-ink, #111)' }}>
          <path d="M1 1.5H19M1 8H19M1 14.5H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      </button>
      <span className="flex-1 text-center text-[15px] font-semibold truncate -ml-11" style={{ color: 'var(--color-ink, #111)' }}>
        {title}
      </span>
      <div className="shrink-0 w-9">
        {right ?? null}
      </div>
    </div>
  )
}
