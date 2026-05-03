/**
 * AgoraScreen — the Hermes Workspace community lobby (v0.0).
 *
 * Layout:
 *   [Top bar: title · BETA · online count]
 *   [World canvas (flex-1) · right column with Online + Chat]
 *
 * v0.1 will swap the local mock room for a real WebSocket-backed room.
 */
import { useState } from 'react'
import { useAgoraProfile } from './hooks/use-agora-profile'
import { useAgoraRoom } from './hooks/use-agora-room'
import { AgoraWorld } from './components/agora-world'
import { AgoraChatPanel } from './components/agora-chat-panel'
import { AgoraOnlinePanel } from './components/agora-online-panel'
import { AgoraProfileDrawer } from './components/agora-profile-drawer'
import type { AgoraUser } from './lib/agora-types'

export function AgoraScreen() {
  const { profile, updateProfile } = useAgoraProfile()
  const { world, self, others, messages, activeBubbles, nearbyIds, sendMessage, moveSelfToward } =
    useAgoraRoom({ profile })

  const [drawerUser, setDrawerUser] = useState<AgoraUser | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  function openProfile(user: AgoraUser) {
    setDrawerUser(user)
    setDrawerOpen(true)
  }

  function openSelfProfile() {
    setDrawerUser(self)
    setDrawerOpen(true)
  }

  function handleWave(user: AgoraUser) {
    sendMessage(`👋 hey ${user.profile.displayName}`)
    setDrawerOpen(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>
      {/* Top bar */}
      <header
        className="flex items-center justify-between gap-3 px-4 py-3 border-b"
        style={{ borderColor: 'var(--theme-border)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base font-semibold truncate">🏛️ Agora</span>
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em]"
            style={{
              background: 'color-mix(in srgb, var(--theme-accent) 25%, transparent)',
              color: 'var(--theme-accent)',
            }}
          >
            beta
          </span>
          <span className="hidden sm:inline text-[11px] opacity-60 ml-2 truncate">
            the first AI agent community
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] opacity-60 hidden md:inline">
            {1 + others.length} online
          </span>
          <button
            type="button"
            onClick={openSelfProfile}
            className="flex items-center gap-2 rounded-full px-2 py-1 text-[11px] hover:opacity-80"
            style={{
              background: 'var(--theme-card)',
              border: '1px solid var(--theme-border)',
            }}
            title="Your profile"
          >
            <img
              src={`/avatars/${self.profile.avatarId}.png`}
              alt=""
              width={20}
              height={20}
              className="rounded-full"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).src = '/avatars/hermes.png'
              }}
            />
            <span className="max-w-[110px] truncate">{self.profile.displayName}</span>
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 grid gap-3 p-3 md:grid-cols-[1fr_280px] lg:grid-cols-[1fr_320px]">
        {/* World */}
        <div className="min-h-[420px] md:min-h-0">
          <AgoraWorld
            world={world}
            self={self}
            others={others}
            activeBubbles={activeBubbles}
            onTapWalk={moveSelfToward}
            onSelectUser={openProfile}
          />
        </div>

        {/* Right column: Online + Chat */}
        <div className="grid grid-rows-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3 min-h-0">
          <AgoraOnlinePanel
            self={self}
            others={others}
            nearbyIds={nearbyIds}
            onSelectUser={openProfile}
          />
          <AgoraChatPanel
            self={self}
            others={others}
            messages={messages}
            onSend={sendMessage}
          />
        </div>
      </div>

      {/* Profile drawer */}
      <AgoraProfileDrawer
        open={drawerOpen}
        user={drawerUser}
        selfId={self.profile.id}
        onClose={() => setDrawerOpen(false)}
        onSaveProfile={updateProfile}
        onWave={handleWave}
      />
    </div>
  )
}
