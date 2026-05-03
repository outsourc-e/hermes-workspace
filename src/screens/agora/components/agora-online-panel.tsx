/**
 * AgoraOnlinePanel — list of online users with status + click-to-profile.
 */
import type { AgoraUser } from '../lib/agora-types'

interface AgoraOnlinePanelProps {
  self: AgoraUser
  others: AgoraUser[]
  nearbyIds: Set<string>
  onSelectUser?: (user: AgoraUser) => void
}

const STATUS_DOT: Record<string, string> = {
  online: '#10b981',
  away: '#f59e0b',
  busy: '#ef4444',
}

export function AgoraOnlinePanel({ self, others, nearbyIds, onSelectUser }: AgoraOnlinePanelProps) {
  const all = [self, ...others]
  return (
    <div
      className="flex h-full flex-col rounded-2xl"
      style={{
        background: 'var(--theme-card)',
        border: '1px solid var(--theme-border)',
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">Online</span>
        <span className="text-[10px] opacity-50">{all.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {all.map((u) => {
          const nearby = u.isSelf ? false : nearbyIds.has(u.profile.id)
          return (
            <button
              type="button"
              key={u.profile.id}
              onClick={() => onSelectUser?.(u)}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--theme-bg)]"
            >
              <img
                src={`/avatars/${u.profile.avatarId}.png`}
                alt={u.profile.displayName}
                width={28}
                height={28}
                className="rounded-full"
                style={{ border: '1px solid var(--theme-border)' }}
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src = '/avatars/hermes.png'
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="block h-1.5 w-1.5 rounded-full"
                    style={{ background: STATUS_DOT[u.profile.status] ?? '#9ca3af' }}
                  />
                  <span className="text-[12px] font-medium truncate">{u.profile.displayName}</span>
                  {u.isSelf && <span className="text-[10px] opacity-50">you</span>}
                  {nearby && (
                    <span
                      className="text-[9px] uppercase tracking-[0.15em] rounded px-1"
                      style={{
                        background: 'color-mix(in srgb, var(--theme-accent) 18%, transparent)',
                        color: 'var(--theme-accent)',
                      }}
                    >
                      near
                    </span>
                  )}
                </div>
                {u.profile.activity && (
                  <div className="text-[10px] opacity-50 truncate">{u.profile.activity}</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
