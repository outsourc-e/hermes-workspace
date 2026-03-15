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
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <defs>
        <linearGradient id="ava-hermes" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E30AA" />
          <stop offset="50%" stopColor="#3050FF" />
          <stop offset="100%" stopColor="#5070FF" />
        </linearGradient>
      </defs>
      <rect x="5" y="5" width="90" height="90" rx="20" fill="url(#ava-hermes)" />
      <rect x="47" y="22" width="6" height="56" rx="3" fill="#FFD700" />
      <path d="M 35 30 Q 50 22, 50 30" stroke="#FFD700" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M 65 30 Q 50 22, 50 30" stroke="#FFD700" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M 38 58 Q 30 50, 38 42 Q 46 34, 50 38" stroke="#E8ECFF" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M 62 58 Q 70 50, 62 42 Q 54 34, 50 38" stroke="#E8ECFF" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <circle cx="50" cy="22" r="5" fill="#FFD700" />
    </svg>
  )
}

export const AssistantAvatar = memo(AssistantAvatarComponent)
