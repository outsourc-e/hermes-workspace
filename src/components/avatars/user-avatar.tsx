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
 * Dark slate rounded square with orange person silhouette + accent.
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
      </defs>
      {/* Dark navy background */}
      <rect x="5" y="5" width="90" height="90" rx="20" fill="url(#avu-bg)" />
      {/* Anime-style user silhouette */}
      {/* Head with spiky hair */}
      <circle cx="50" cy="36" r="13" fill="#E6EAF2" />
      {/* Hair spikes */}
      <path d="M 37 33 L 33 22 L 40 30 Z" fill="#E6EAF2" />
      <path d="M 44 28 L 42 18 L 48 26 Z" fill="#E6EAF2" />
      <path d="M 52 27 L 52 16 L 56 25 Z" fill="#E6EAF2" />
      <path d="M 58 28 L 60 19 L 62 28 Z" fill="#E6EAF2" />
      <path d="M 63 33 L 67 23 L 62 31 Z" fill="#E6EAF2" />
      {/* Eyes */}
      <ellipse cx="44" cy="37" rx="3" ry="3.5" fill="#1A2340" />
      <ellipse cx="56" cy="37" rx="3" ry="3.5" fill="#1A2340" />
      <circle cx="45" cy="36" r="1" fill="#fff" />
      <circle cx="57" cy="36" r="1" fill="#fff" />
      {/* Body/shoulders */}
      <path
        d="M 30 78 C 30 62 38 55 50 55 C 62 55 70 62 70 78"
        fill="#E6EAF2"
      />
      {/* Collar detail */}
      <path d="M 44 55 L 50 62 L 56 55" stroke="#1A2340" strokeWidth="1.5" fill="none" />
    </svg>
  )
}

export const UserAvatar = memo(UserAvatarComponent)
