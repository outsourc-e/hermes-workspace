import { memo } from 'react'

export interface TimelineEvent {
  id: string
  startMin: number
  durationMin: number
  title: string
  category: 'work' | 'uni' | 'clinic' | 'personal' | 'urgent'
}
interface TimelineProps {
  events: Array<TimelineEvent>
  nowMin: number
}
const COLORS = {
  work: '#3b82f6',
  uni: '#f59e0b',
  clinic: '#10b981',
  personal: '#a855f7',
  urgent: '#ef4444',
}
const WINDOW_MIN = 840

function TimelineImpl({ events, nowMin }: TimelineProps) {
  const pct = (m: number) => `${(m / WINDOW_MIN) * 100}%`
  return (
    <div className="bg-[#161b22] rounded-lg p-3 relative h-24">
      <div className="text-[11px] text-[#8b949e] tracking-[0.15em] uppercase font-semibold">
        Today · 6am → 8pm
      </div>
      {events.map((ev) => (
        <div
          key={ev.id}
          className="absolute top-9 h-10 rounded px-2 text-[11px] font-semibold text-white overflow-hidden whitespace-nowrap flex items-center"
          style={{
            left: pct(ev.startMin),
            width: pct(ev.durationMin),
            background: COLORS[ev.category],
          }}
          title={ev.title}
        >
          {ev.title}
        </div>
      ))}
      <div
        className="absolute top-7 bottom-2 w-px bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)] z-10"
        style={{ left: pct(nowMin) }}
      >
        <span className="absolute -top-3 -left-3 text-[9px] text-white bg-[#0a0e14] px-1.5 py-0.5 rounded font-bold">
          NOW
        </span>
      </div>
    </div>
  )
}

export const Timeline = memo(TimelineImpl)
