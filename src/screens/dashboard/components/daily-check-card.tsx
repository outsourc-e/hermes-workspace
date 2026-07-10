import { novaDailyCheck } from '@/lib/nova-daily-check-adapter'

export function DailyCheckCard() {
  return (
    <section className="grid gap-3 rounded-xl border border-[var(--theme-blue-border)] bg-[rgba(7,20,38,0.72)] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.28)] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="nova-label">Daily check</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--theme-blue-secondary)]/75">
            SoulSync
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {novaDailyCheck.items.map((item) => (
            <div
              key={item.id}
              className="nova-metric rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(5,11,22,0.34)] px-2.5 py-2"
            >
              <div className="nova-label">{item.label}</div>
              <div className="mt-1 font-mono text-sm text-[var(--theme-accent-secondary)]">
                {item.checked ? '[x]' : '[ ]'}
              </div>
            </div>
          ))}
          <div className="nova-metric rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(5,11,22,0.34)] px-2.5 py-2">
            <div className="nova-label whitespace-normal leading-tight">
              Overthinking
            </div>
            <div className="mt-1 break-words font-mono text-sm uppercase leading-tight text-[var(--theme-accent-secondary)]">
              {novaDailyCheck.overthinking}
            </div>
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="nova-fragment rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(5,11,22,0.28)] px-2.5 py-2">
            <div className="nova-label">Mood</div>
            <div className="mt-1 font-mono text-sm uppercase text-[var(--theme-text)]">
              {novaDailyCheck.mood}
            </div>
          </div>
          <div className="nova-fragment rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(5,11,22,0.28)] px-2.5 py-2">
            <div className="nova-label">Reminder</div>
            <div className="mt-1 font-mono text-sm text-[var(--theme-text)]">
              {novaDailyCheck.reminder}
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-[var(--theme-blue-border)] bg-[rgba(5,11,22,0.42)] p-3">
        <div className="nova-label mb-2">Log stream</div>
        <div className="grid gap-1.5">
          {novaDailyCheck.log.map((entry) => (
            <div
              key={`${entry.date}-${entry.text}`}
              className="flex items-center justify-between gap-3 rounded-md border border-[var(--theme-border-subtle)] bg-[rgba(99,199,255,0.045)] px-2.5 py-1.5 font-mono text-[11px]"
            >
              <span className="text-[var(--theme-blue-secondary)]/80">{entry.date}</span>
              <span className="min-w-0 flex-1 truncate text-right text-[var(--theme-text)]/85">
                {entry.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
