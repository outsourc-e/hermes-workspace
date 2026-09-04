import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function Surface({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('frame', className)} {...props} />
}

export function Panel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('frame-panel', className)} {...props} />
}
