import { InboxItem, type InboxItemData } from './InboxItem';
interface InboxRailProps { items: InboxItemData[]; }
export function InboxRail({ items }: InboxRailProps) {
  const urgentCount = items.filter(i => i.severity === 'urgent').length;
  if (items.length === 0) {
    return (
      <div className="bg-[#0d1117] border border-[#21262d] rounded p-2 h-full">
        <div className="text-center py-12 text-[#6e7681] text-xs">Inbox zero. ✓</div>
      </div>
    );
  }
  return (
    <div className="bg-[#0d1117] border border-[#21262d] rounded p-2">
      <div className="flex justify-between px-1.5 pb-2 border-b border-[#21262d] mb-1.5">
        <h3 className="text-[9px] text-[#8b949e] tracking-wider m-0">INBOX</h3>
        <span className="text-[9px] text-[#c9d1d9]">{items.length} items · {urgentCount} urgent</span>
      </div>
      {items.map(item => <InboxItem key={item.id} item={item} />)}
    </div>
  );
}
