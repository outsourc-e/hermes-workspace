import { memo } from 'react'
import { cn } from '@/lib/utils'

type AvatarProps = {
  size?: number
  className?: string
  src?: string | null
  alt?: string
}

/**
 * User avatar — same logo family as assistant.
 * Dark slate rounded square with orange person silhouette + subtle claw accent.
 */
function UserAvatarComponent({
  size = 28,
  className,
  src,
  alt = 'User avatar',
}: AvatarProps) {
  if (src && src.trim().length > 0) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn('shrink-0 object-cover', className)}
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(6, Math.round(size * 0.2)),
        }}
      />
    )
  }

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <defs>
        <linearGradient id="avu-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1A2340" />
          <stop offset="100%" stopColor="#24304A" />
        </linearGradient>
        <linearGradient id="avu-accent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      {/* Dark navy background */}
      <rect x="5" y="5" width="90" height="90" rx="20" fill="url(#avu-bg)" />
      {/* Person head */}
      <circle cx="50" cy="38" r="12" fill="url(#avu-accent)" />
      {/* Person body/shoulders */}
      <path
        d="M 28 78 C 28 62 38 55 50 55 C 62 55 72 62 72 78"
        fill="url(#avu-accent)"
      />
    </svg>
  )
}

export const UserAvatar = memo(UserAvatarComponent)
