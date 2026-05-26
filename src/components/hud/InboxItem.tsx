export interface InboxItemData {
  id: string;
  severity: 'urgent'|'warn'|'ok'|'info'|'dim';
  tag: string;
  body: string;
  when: string;
  href?: string;
}
const BARS = { urgent: '#f85149', warn: '#d29922', ok: '#3fb950', info: '#58a6ff', dim: '#6e7681' };
export function InboxItem({ item }: { item: InboxItemData }) {
  return (
    <a href={item.href ?? '#'} className="grid grid-cols-[4px_1fr_auto] gap-1.5 px-1.5 py-1 rounded hover:bg-[#161b22]">
      <div className="rounded-sm" style={{ background: BARS[item.severity] }} />
      <div className="text-[10px] leading-tight text-[#e6edf3]">
        <span className="text-[7px] tracking-wider text-[#8b949e] block mb-px">{item.tag}</span>
        {item.body}
      </div>
      <div className="text-[8px] text-[#6e7681] self-center">{item.when}</div>
    </a>
  );
}
