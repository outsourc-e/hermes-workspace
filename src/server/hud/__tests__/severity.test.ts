import { describe, expect, it } from 'vitest'
import { buildInboxFeed } from '../severity'
import { defaultHUDConfig } from '../../../lib/hud/config'

describe('buildInboxFeed', () => {
  it('orders urgents first, then warnings, then info', () => {
    const items = [
      {
        id: 'a',
        severity: 'info' as const,
        tag: 'AGENT',
        body: 'qa done',
        when: '2m',
      },
      {
        id: 'b',
        severity: 'urgent' as const,
        tag: 'URGENT',
        body: 'meeting now',
        when: '14:30',
      },
      {
        id: 'c',
        severity: 'warn' as const,
        tag: 'UNI',
        body: 'due fri',
        when: 'Fri',
      },
    ]
    const ordered = buildInboxFeed(items, defaultHUDConfig)
    expect(ordered.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('promotes starred SMS contacts to urgent', () => {
    const cfg = {
      ...defaultHUDConfig,
      inbox_severity_overrides: { starred_sms_contacts: ['+61400000000'] },
    }
    const items = [
      {
        id: 'sms-1',
        severity: 'info' as const,
        tag: 'SMS',
        body: 'from +61400000000: yo',
        when: 'now',
      },
    ]
    const ordered = buildInboxFeed(items, cfg)
    expect(ordered[0].severity).toBe('urgent')
  })

  it('filters dismissed items still within ttl', () => {
    const cfg = {
      ...defaultHUDConfig,
      dismissed_inbox_items: { a: Date.now() + 60_000 },
    }
    const items = [
      { id: 'a', severity: 'info' as const, tag: 'X', body: 'y', when: 'z' },
      { id: 'b', severity: 'info' as const, tag: 'X', body: 'y', when: 'z' },
    ]
    expect(buildInboxFeed(items, cfg).map((i) => i.id)).toEqual(['b'])
  })

  it('preserves dismissed items past ttl', () => {
    const cfg = {
      ...defaultHUDConfig,
      dismissed_inbox_items: { a: Date.now() - 60_000 },
    }
    const items = [
      { id: 'a', severity: 'info' as const, tag: 'X', body: 'y', when: 'z' },
    ]
    expect(buildInboxFeed(items, cfg)).toHaveLength(1)
  })
})
