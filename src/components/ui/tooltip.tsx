'use client'

import { Tooltip } from '@base-ui/react/tooltip'
import { cn } from '@/lib/utils'

type TooltipRootProps = React.ComponentProps<typeof Tooltip.Root>

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delay={0} closeDelay={0} timeout={0}>
      {children}
    </Tooltip.Provider>
  )
}

function TooltipRoot({ children, ...props }: TooltipRootProps) {
  return <Tooltip.Root {...props}>{children}</Tooltip.Root>
}

type TooltipTriggerProps = React.ComponentProps<typeof Tooltip.Trigger>

function TooltipTrigger({ className, ...props }: TooltipTriggerProps) {
  return <Tooltip.Trigger className={cn(className)} {...props} />
}

type TooltipContentProps = {
  className?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactNode
}

function TooltipContent({
  className,
  side = 'top',
  children,
}: TooltipContentProps) {
  return (
    <Tooltip.Portal>
      <Tooltip.Positioner side={side}>
        <Tooltip.Popup
          className={cn('rounded-md px-2 py-1 text-xs shadow-lg', className)}
          style={{
            background:
              'color-mix(in srgb, var(--theme-card) 80%, transparent)',
            color: 'var(--theme-text)',
            border:
              '1px solid color-mix(in srgb, var(--theme-border) 70%, transparent)',
            backdropFilter: 'blur(18px) saturate(140%)',
            WebkitBackdropFilter: 'blur(18px) saturate(140%)',
          }}
        >
          {children}
        </Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  )
}

export { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent }
