import { describe, expect, it } from 'vitest'

import { MOBILE_HAMBURGER_NAV_ITEMS } from './mobile-hamburger-menu'
import { MOBILE_NAV_TABS } from './mobile-tab-bar'

describe('mobile workspace navigation contract', () => {
  it('links both mobile navigation models to War Room', () => {
    const liveMenuItem = MOBILE_HAMBURGER_NAV_ITEMS.find(
      (item) => item.id === 'war-room',
    )
    const stagedTab = MOBILE_NAV_TABS.find((tab) => tab.id === 'war-room')

    expect(liveMenuItem).toMatchObject({
      label: 'War Room',
      to: '/war-room',
      search: { etsyOps: 1 },
    })
    expect(liveMenuItem?.match('/war-room')).toBe(true)
    expect(stagedTab).toMatchObject({
      label: 'War Room',
      to: '/war-room',
      search: { etsyOps: 1 },
    })
    expect(stagedTab?.match('/war-room')).toBe(true)
    expect(stagedTab?.match('/war-room/mission')).toBe(true)
  })

  it('keeps navigation ids and destinations unique', () => {
    const ids = MOBILE_NAV_TABS.map((tab) => tab.id)
    const destinations = MOBILE_NAV_TABS.map((tab) => tab.to)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(destinations).size).toBe(destinations.length)
  })
})
