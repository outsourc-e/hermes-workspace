import { novaDailyCheck } from '@/lib/nova-daily-check-adapter'

export function DailyCheckCard() {
  return (
    <section className="grid gap-3 rounded-xl border border-amber-500/25 bg-[#080d12]/88 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.32)] md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="nova-label">Daily check</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-300/65">
            SoulSync
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {novaDailyCheck.items.map((item) => (
            <div key={item.id} className="nova-metric min-h-[76px]">
              <div className="nova-label">{item.label}</div>
              <div className="mt-2 font-mono text-lg text-amber-100">
                {item.checked ? '[x]' : '[ ]'}
              </div>
            </div>
          ))}
          <div className="nova-metric min-h-[76px]">
            <div className="nova-label whitespace-normal leading-tight">
              Overthinking
            </div>
            <div className="mt-2 break-words font-mono text-base uppercase leading-tight text-amber-100 sm:text-lg">
              {novaDailyCheck.overthinking}
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="nova-fragment">
            <div className="nova-label">Mood</div>
            <div className="mt-1 font-mono text-lg uppercase text-amber-100">
              {novaDailyCheck.mood}
            </div>
          </div>
          <div className="nova-fragment">
            <div className="nova-label">Reminder</div>
            <div className="mt-1 font-mono text-lg text-amber-100">
              {novaDailyCheck.reminder}
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-amber-500/20 bg-black/20 p-3">
        <div className="nova-label mb-2">Log stream</div>
        <div className="grid gap-1.5">
          {novaDailyCheck.log.map((entry) => (
            <div
              key={`${entry.date}-${entry.text}`}
              className="flex items-center justify-between gap-3 rounded-md border border-amber-500/10 bg-amber-500/[0.04] px-2.5 py-1.5 font-mono text-[11px]"
            >
              <span className="text-amber-300/75">{entry.date}</span>
              <span className="min-w-0 flex-1 truncate text-right text-amber-50/80">
                {entry.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
