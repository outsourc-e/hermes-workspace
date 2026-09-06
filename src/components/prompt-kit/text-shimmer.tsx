'use client'

import { cn } from '@/lib/utils'

export type TextShimmerProps = {
  as?: React.ElementType<React.HTMLAttributes<HTMLElement>>
  duration?: number
  spread?: number
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'children'>

export function TextShimmer({
  as: Component = 'span',
  className,
  duration = 4,
  spread = 20,
  children,
  ...props
}: TextShimmerProps) {
  const dynamicSpread = Math.min(Math.max(spread, 5), 45)

  return (
    <Component
      className={cn(
        'bg-size-[200%_auto] bg-clip-text font-medium text-transparent',
        'animate-[shimmer_4s_infinite_linear]',
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(to right, var(--color-primary-600) ${50 - dynamicSpread}%, var(--color-primary-950) 50%, var(--color-primary-600) ${50 + dynamicSpread}%)`,
        animationDuration: `${duration}s`,
      }}
      {...props}
    >
      {children}
    </Component>
  )
}
