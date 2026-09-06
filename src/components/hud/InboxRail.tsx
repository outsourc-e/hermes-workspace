import { memo } from 'react'
import { InboxItem } from './InboxItem'
import type { InboxItemData } from './InboxItem'

interface InboxRailProps {
  items: Array<InboxItemData>
}

function InboxRailImpl({ items }: InboxRailProps) {
  const urgentCount = items.filter((i) => i.severity === 'urgent').length
  if (items.length === 0) {
    return (
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 h-full">
        <h3 className="text-xs text-[#8b949e] tracking-[0.15em] uppercase font-semibold mb-3">
          Inbox
        </h3>
        <div className="text-center py-12 text-[#6e7681] text-sm">
          Inbox zero. ✓
        </div>
      </div>
    )
  }
  return (
    <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3">
      <div className="flex justify-between items-baseline px-2 pb-2 border-b border-[#21262d] mb-2">
        <h3 className="text-xs text-[#c9d1d9] tracking-[0.15em] uppercase font-semibold m-0">
          Inbox
        </h3>
        <span className="text-[11px] text-[#8b949e]">
          {items.length} items · {urgentCount} urgent
        </span>
      </div>
      {items.map((item) => (
        <InboxItem key={item.id} item={item} />
      ))}
    </div>
  )
}

export const InboxRail = memo(InboxRailImpl)
