import { memo } from 'react'
import { cn } from '@/lib/utils'

type AvatarProps = {
  size?: number
  className?: string
}

/**
 * Assistant avatar — Hermes Agent caduceus on Nous blue.
 */
function AssistantAvatarComponent({ size = 28, className }: AvatarProps) {
  return (
    <img
      src="/hermes-avatar.webp"
      alt="Hermes"
      className={cn('shrink-0', className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, Math.round(size * 0.15)),
      }}
    />
  )
}

export const AssistantAvatar = memo(AssistantAvatarComponent)
