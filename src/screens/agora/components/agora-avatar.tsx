/**
 * AgoraAvatar — top-down circular character marker for the Agora world.
 *
 * v0.0: portrait-in-circle with a small status ring + name label.
 * Future: 8-direction sprite frames per avatar (v0.2+).
 */
import { motion } from 'motion/react'
import type { AgoraStatus, AgoraAvatarId, AgoraFacing } from '../lib/agora-types'

const STATUS_DOT_COLOR: Record<AgoraStatus, string> = {
  online: '#10b981',
  away: '#f59e0b',
  busy: '#ef4444',
}

interface AgoraAvatarProps {
  avatarId: AgoraAvatarId
  displayName: string
  status: AgoraStatus
  facing: AgoraFacing
  isSelf?: boolean
  isMoving?: boolean
  size?: number
  speaking?: boolean
}

export function AgoraAvatar({
  avatarId,
  displayName,
  status,
  facing,
  isSelf = false,
  isMoving = false,
  size = 56,
  speaking = false,
}: AgoraAvatarProps) {
  // Tilt slightly based on facing direction for personality.
  const tilt =
    facing === 'left' ? -6 : facing === 'right' ? 6 : 0

  return (
    <div
      className="pointer-events-none flex flex-col items-center select-none"
      style={{ width: size, transform: 'translate(-50%, -100%)' }}
    >
      <motion.div
        animate={isMoving ? { y: [0, -2, 0] } : { y: 0 }}
        transition={{ duration: 0.45, repeat: isMoving ? Infinity : 0 }}
        className="relative"
        style={{ width: size, height: size, transform: `rotate(${tilt}deg)` }}
      >
        {/* Self ring */}
        {isSelf && (
          <div
            className="absolute -inset-1 rounded-full"
            style={{
              boxShadow: `0 0 0 2px var(--theme-accent)`,
            }}
          />
        )}
        {/* Speaking ring */}
        {speaking && (
          <motion.div
            className="absolute -inset-2 rounded-full"
            style={{ boxShadow: '0 0 0 3px #10b981' }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
        {/* Avatar image */}
        <img
          src={`/avatars/${avatarId}.png`}
          alt={displayName}
          width={size}
          height={size}
          draggable={false}
          className="rounded-full object-cover"
          style={{
            width: size,
            height: size,
            background: 'var(--theme-card)',
            border: '2px solid var(--theme-border)',
          }}
          onError={(e) => {
            // Fallback to a generic placeholder if PNG missing
            ;(e.currentTarget as HTMLImageElement).src = '/avatars/hermes.png'
          }}
        />
        {/* Status dot */}
        <span
          className="absolute bottom-0 right-0 block h-3 w-3 rounded-full"
          style={{
            background: STATUS_DOT_COLOR[status],
            border: '2px solid var(--theme-bg)',
          }}
        />
      </motion.div>
      {/* Name label */}
      <div
        className="mt-1 max-w-[80px] truncate rounded px-1.5 py-0.5 text-[10px] font-medium"
        style={{
          background: 'color-mix(in srgb, var(--theme-bg) 80%, transparent)',
          color: 'var(--theme-text)',
          border: '1px solid var(--theme-border)',
        }}
        title={displayName}
      >
        {displayName}
        {isSelf && <span className="ml-1 opacity-50">(you)</span>}
      </div>
    </div>
  )
}
