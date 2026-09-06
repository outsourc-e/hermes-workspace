import type { InboxItemData } from '../../components/hud/InboxItem'
import type { HUDConfig } from './types'

const RANK: Record<InboxItemData['severity'], number> = {
  urgent: 0,
  warn: 1,
  ok: 2,
  info: 3,
  dim: 4,
}

export function buildInboxFeed(
  items: Array<InboxItemData>,
  cfg: HUDConfig,
): Array<InboxItemData> {
  const dismissed = cfg.dismissed_inbox_items ?? {}
  const starred = cfg.inbox_severity_overrides?.starred_sms_contacts ?? []

  return items
    .filter((i) => {
      const dismissUntil = dismissed[i.id]
      return !dismissUntil || dismissUntil < Date.now()
    })
    .map((i) => {
      if (i.tag === 'SMS' && starred.some((s) => i.body.includes(s))) {
        return { ...i, severity: 'urgent' as const }
      }
      return i
    })
    .sort((a, b) => RANK[a.severity] - RANK[b.severity])
}
