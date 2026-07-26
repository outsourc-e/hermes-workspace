import { describe, expect, it } from 'vitest'
import { MOBILE_HAMBURGER_NAV_ITEMS } from './mobile-hamburger-menu'
import { MOBILE_NAV_TABS } from './mobile-tab-bar'
import {
  DESKTOP_SIDEBAR_BACKDROP_CLASS,
  resolveShellActiveChatCardId,
} from './workspace-shell'
import { MOBILE_SWIPE_TAB_ORDER } from '@/hooks/use-swipe-navigation'
import {
  buildChatCardNavigation,
  normalizeActiveChatCardId,
  useWorkspaceStore,
} from '@/stores/workspace-store'

describe('workspace shell sidebar backdrop', () => {
  it('only spans the desktop sidebar width, not the full viewport', () => {
    expect(DESKTOP_SIDEBAR_BACKDROP_CLASS).toContain('w-[300px]')
    expect(DESKTOP_SIDEBAR_BACKDROP_CLASS).not.toContain('inset-0')
  })
})

describe('swarm2 navigation alias handling', () => {
  it('keeps /swarm as the only user-visible swarm entry in the mobile hamburger menu', () => {
    const swarm = MOBILE_HAMBURGER_NAV_ITEMS.find((item) => item.id === 'swarm')
    const swarm2 = MOBILE_HAMBURGER_NAV_ITEMS.find(
      (item) => item.id === 'swarm2',
    )

    expect(swarm?.to).toBe('/swarm')
    expect(swarm2).toBeUndefined()
  })

  it('keeps /swarm as the only user-visible swarm tab', () => {
    const swarm = MOBILE_NAV_TABS.find((item) => item.id === 'swarm')
    const swarm2 = MOBILE_NAV_TABS.find((item) => item.id === 'swarm2')

    expect(swarm?.to).toBe('/swarm')
    expect(swarm2).toBeUndefined()
  })
})

describe('Card-native chat navigation', () => {
  it('keeps new as the only static chat bootstrap destination', () => {
    const tab = MOBILE_NAV_TABS.find((item) => item.id === 'chat')
    const hamburger = MOBILE_HAMBURGER_NAV_ITEMS.find(
      (item) => item.id === 'chat',
    )

    expect(tab?.to).toBe('/chat/new')
    expect(hamburger?.to).toBe('/chat/new')
    expect(MOBILE_SWIPE_TAB_ORDER[0]).toBe('/chat/new')
  })

  it('returns to the current stable Card and never emits the retired main alias', () => {
    expect(buildChatCardNavigation('remote:current-card')).toEqual({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:current-card' },
    })
    expect(buildChatCardNavigation('main')).toEqual({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'new' },
    })
    expect(normalizeActiveChatCardId('')).toBe('new')
    expect(normalizeActiveChatCardId('main')).toBe('new')
  })

  it('uses a Card route when present and a controlled new bootstrap otherwise', () => {
    expect(resolveShellActiveChatCardId('/chat/remote%3Acard')).toBe(
      'remote:card',
    )
    expect(resolveShellActiveChatCardId('/chat/new')).toBe('new')
    expect(resolveShellActiveChatCardId('/chat/main')).toBe('new')
    expect(resolveShellActiveChatCardId('/dashboard')).toBeNull()
  })

  it('initializes persisted navigation with the controlled new bootstrap', () => {
    expect(useWorkspaceStore.getState().activeChatCardId).toBe('new')
  })
})
