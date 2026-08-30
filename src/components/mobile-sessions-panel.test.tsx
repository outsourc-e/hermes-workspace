import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { MobileSessionsPanel } from './mobile-sessions-panel'
import type { SessionMeta } from '@/screens/chat/types'

const sessions: Array<SessionMeta> = [
  {
    key: 'pinned-session',
    friendlyId: 'pinned-session',
    title: 'Pinned chat',
    pinned: true,
  },
  {
    key: 'regular-session',
    friendlyId: 'regular-session',
    title: 'Regular chat',
    pinned: false,
  },
]

describe('MobileSessionsPanel', () => {
  it('renders a visible pinned section and pin controls', () => {
    const html = renderToStaticMarkup(
      <MobileSessionsPanel
        open
        onClose={vi.fn()}
        sessions={sessions}
        activeFriendlyId="regular-session"
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
        onTogglePin={vi.fn()}
      />,
    )

    expect(html).toContain('>Pinned<')
    expect(html).toContain('Pinned chat')
    expect(html).toContain('Unpin session')
    expect(html).toContain('Pin session')
  })
})
