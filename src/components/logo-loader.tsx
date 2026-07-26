'use client'

import { cn } from '@/lib/utils'
import { AgentIdentityAvatar } from '@/components/avatars'

export type LogoLoaderProps = {
  className?: string
}

function LogoLoader({ className }: LogoLoaderProps) {
  return (
    <span className="logo-loader-track" aria-hidden="true">
      <AgentIdentityAvatar
        alt=""
        className={cn('logo-loader-icon size-4 rounded', className)}
      />
    </span>
  )
}

export { LogoLoader }
