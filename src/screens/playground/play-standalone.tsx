import React from 'react'
import { createRoot } from 'react-dom/client'
import { PlaygroundScreen } from './playground-screen'

// Flag the standalone bundle as a public play surface BEFORE the screen mounts.
// `playground-screen.tsx` reads this to force-disable any admin/owner UI.
;(window as unknown as { __HERMES_PUBLIC_PLAY__?: boolean }).__HERMES_PUBLIC_PLAY__ = true

// Defensively wipe any stale owner/admin localStorage flags so users who
// previously saw the shield (because they had `?owner=1&admin=1` set) cannot
// see admin UI on the public route.
try {
  window.localStorage.removeItem('hermes-playground-admin')
  window.localStorage.removeItem('hermes-playground-owner')
} catch {}

function PlayStandalone() {
  React.useEffect(() => {
    document.title = 'Play HermesWorld'
  }, [])

  return <PlaygroundScreen />
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')

createRoot(root).render(
  <React.StrictMode>
    <PlayStandalone />
  </React.StrictMode>,
)
