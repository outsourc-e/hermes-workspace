import { memo } from 'react'
import { AgentIdentityAvatar } from './agent-identity-avatar'
import { cn } from '@/lib/utils'

type AvatarProps = {
  size?: number
  className?: string
}

/**
 * Assistant avatar — the user's configured agent icon.
 */
function AssistantAvatarComponent({ size = 28, className }: AvatarProps) {
  return (
    <AgentIdentityAvatar
      size={size}
      className={cn('shrink-0', className)}
      style={{
        borderRadius: Math.max(4, Math.round(size * 0.15)),
      }}
    />
  )
}

export const AssistantAvatar = memo(AssistantAvatarComponent)
