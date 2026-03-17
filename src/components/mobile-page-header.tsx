/**
 * MobilePageHeader — native app-style sticky top bar for non-chat pages.
 * Shows hamburger on the left, page title centered, optional right action.
 */
import { HamburgerTrigger } from '@/components/mobile-hamburger-menu'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

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
      <HamburgerTrigger className="shrink-0" />
      <span className="flex-1 text-center text-[15px] font-semibold truncate" style={{ color: 'var(--color-ink, #111)' }}>
        {title}
      </span>
      <div className="shrink-0 w-9">
        {right ?? null}
      </div>
    </div>
  )
}
