export interface TimelineEvent {
  id: string;
  startMin: number;
  durationMin: number;
  title: string;
  category: 'work'|'uni'|'clinic'|'personal'|'urgent';
}
interface TimelineProps { events: TimelineEvent[]; nowMin: number; }
const COLORS = { work: '#3b82f6', uni: '#f59e0b', clinic: '#10b981', personal: '#a855f7', urgent: '#ef4444' };
const WINDOW_MIN = 840;
export function Timeline({ events, nowMin }: TimelineProps) {
  const pct = (m: number) => `${(m / WINDOW_MIN) * 100}%`;
  return (
    <div className="bg-[#161b22] rounded p-2 relative h-14">
      <div className="text-[7px] text-[#6e7681] tracking-wider">TODAY · 6AM → 8PM</div>
      {events.map(ev => (
        <div
          key={ev.id}
          className="absolute top-5 h-7 rounded px-1.5 text-[9px] font-semibold text-white overflow-hidden whitespace-nowrap"
          style={{ left: pct(ev.startMin), width: pct(ev.durationMin), background: COLORS[ev.category] }}
          title={ev.title}
        >
          {ev.title}
        </div>
      ))}
      <div className="absolute top-3 bottom-1 w-px bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)] z-10" style={{ left: pct(nowMin) }}>
        <span className="absolute -top-2.5 -left-2 text-[7px] text-white bg-[#0a0e14] px-1 rounded font-bold">NOW</span>
      </div>
    </div>
  );
}
