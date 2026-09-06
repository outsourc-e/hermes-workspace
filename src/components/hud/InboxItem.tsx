export interface InboxItemData {
  id: string
  severity: 'urgent' | 'warn' | 'ok' | 'info' | 'dim'
  tag: string
  body: string
  when: string
  href?: string
}
const BARS = {
  urgent: '#f85149',
  warn: '#d29922',
  ok: '#3fb950',
  info: '#58a6ff',
  dim: '#6e7681',
}
export function InboxItem({ item }: { item: InboxItemData }) {
  return (
    <a
      href={item.href ?? '#'}
      className="grid grid-cols-[4px_1fr_auto] gap-2 px-2 py-2 rounded hover:bg-[#161b22]"
    >
      <div className="rounded-sm" style={{ background: BARS[item.severity] }} />
      <div className="text-[13px] leading-snug text-[#e6edf3]">
        <span className="text-[10px] tracking-[0.12em] uppercase text-[#8b949e] block mb-0.5 font-semibold">
          {item.tag}
        </span>
        {item.body}
      </div>
      <div className="text-[10px] text-[#6e7681] self-center whitespace-nowrap">
        {item.when}
      </div>
    </a>
  )
}
