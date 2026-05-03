/**
 * AgoraWorld — the walkable canvas. v0.0 = stylized top-down lobby.
 *
 * Renders:
 * - Themed floor + ambient decor
 * - All users (self + others) with name labels
 * - Speech bubbles above users with active messages
 * - Click-to-walk for mobile/desktop
 */
import { motion, AnimatePresence } from 'motion/react'
import { useRef } from 'react'
import { AgoraAvatar } from './agora-avatar'
import type { AgoraMessage, AgoraUser, AgoraWorld as TWorld } from '../lib/agora-types'

interface AgoraWorldProps {
  world: TWorld
  self: AgoraUser
  others: AgoraUser[]
  activeBubbles: Map<string, AgoraMessage>
  onTapWalk?: (worldX: number, worldY: number) => void
  onSelectUser?: (user: AgoraUser) => void
}

export function AgoraWorld({
  world,
  self,
  others,
  activeBubbles,
  onTapWalk,
  onSelectUser,
}: AgoraWorldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onTapWalk) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const scaleX = world.width / rect.width
    const scaleY = world.height / rect.height
    const wx = (e.clientX - rect.left) * scaleX
    const wy = (e.clientY - rect.top) * scaleY
    onTapWalk(wx, wy)
  }

  // Sort by Y so south avatars draw on top (depth illusion)
  const all = [...others, self].sort((a, b) => a.y - b.y)

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="relative h-full w-full overflow-hidden rounded-2xl"
      style={{
        background:
          'radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--theme-accent) 14%, var(--theme-bg)) 0%, var(--theme-bg) 70%), repeating-linear-gradient(45deg, transparent 0 28px, color-mix(in srgb, var(--theme-border) 25%, transparent) 28px 29px)',
        border: '1px solid var(--theme-border)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Decorative center medallion */}
      <div
        className="pointer-events-none absolute"
        style={{
          left: `${(world.spawn.x / world.width) * 100}%`,
          top: `${(world.spawn.y / world.height) * 100}%`,
          transform: 'translate(-50%, -50%)',
          width: 220,
          height: 220,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at center, color-mix(in srgb, var(--theme-accent) 18%, transparent), transparent 70%)',
          border: '1px dashed color-mix(in srgb, var(--theme-accent) 30%, transparent)',
        }}
      />
      {/* Decorative corner pillars */}
      {[
        { x: 0.12, y: 0.18 },
        { x: 0.88, y: 0.18 },
        { x: 0.12, y: 0.82 },
        { x: 0.88, y: 0.82 },
      ].map((p, i) => (
        <div
          key={i}
          className="pointer-events-none absolute"
          style={{
            left: `${p.x * 100}%`,
            top: `${p.y * 100}%`,
            transform: 'translate(-50%, -100%)',
            width: 24,
            height: 56,
            borderRadius: '4px 4px 0 0',
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--theme-accent) 35%, transparent), color-mix(in srgb, var(--theme-border) 70%, transparent))',
            border: '1px solid color-mix(in srgb, var(--theme-border) 80%, transparent)',
          }}
        />
      ))}

      {/* Title overlay */}
      <div className="pointer-events-none absolute left-4 top-4 text-xs uppercase tracking-[0.2em] opacity-50">
        {world.name}
      </div>

      {/* Users */}
      {all.map((user) => {
        const xPct = (user.x / world.width) * 100
        const yPct = (user.y / world.height) * 100
        const bubble = activeBubbles.get(user.profile.id)
        return (
          <motion.div
            key={user.profile.id}
            layout
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            className="absolute"
            style={{
              left: `${xPct}%`,
              top: `${yPct}%`,
              zIndex: Math.floor(yPct),
            }}
            onClick={(e) => {
              e.stopPropagation()
              onSelectUser?.(user)
            }}
          >
            <div className="pointer-events-auto cursor-pointer">
              {/* Speech bubble */}
              <AnimatePresence>
                {bubble && (
                  <motion.div
                    key={bubble.id}
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.18 }}
                    className="absolute left-1/2 -top-3 max-w-[180px] -translate-x-1/2 -translate-y-full rounded-xl px-2.5 py-1.5 text-[11px] leading-snug shadow-lg"
                    style={{
                      background: 'var(--theme-card)',
                      color: 'var(--theme-text)',
                      border: '1px solid var(--theme-border)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {bubble.body}
                  </motion.div>
                )}
              </AnimatePresence>

              <AgoraAvatar
                avatarId={user.profile.avatarId}
                displayName={user.profile.displayName}
                status={user.profile.status}
                facing={user.facing}
                isSelf={user.isSelf}
                isMoving={user.isMoving}
                size={56}
              />
            </div>
          </motion.div>
        )
      })}

      {/* Movement hint */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] opacity-60"
        style={{
          background: 'color-mix(in srgb, var(--theme-bg) 80%, transparent)',
          border: '1px solid var(--theme-border)',
        }}
      >
        WASD or arrow keys · click to walk
      </div>
    </div>
  )
}
