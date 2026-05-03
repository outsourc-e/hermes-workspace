import { PLAYGROUND_QUESTS } from '../lib/playground-rpg'
import type { PlaygroundRpgState } from '../hooks/use-playground-rpg'

export function PlaygroundJournal({
  open,
  onClose,
  state,
}: {
  open: boolean
  onClose: () => void
  state: PlaygroundRpgState
}) {
  if (!open) return null
  const grouped = new Map<string, typeof PLAYGROUND_QUESTS>()
  for (const q of PLAYGROUND_QUESTS) {
    const list = grouped.get(q.chapter) ?? []
    list.push(q)
    grouped.set(q.chapter, list)
  }
  return (
    <div className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-[#0b1720] p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-lg font-bold">Quest Journal</div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Press J to toggle</div>
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-white/55 hover:bg-white/10">
            Close
          </button>
        </div>
        <div className="space-y-5">
          {Array.from(grouped.entries()).map(([chapter, quests]) => (
            <div key={chapter}>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">{chapter}</div>
              <div className="space-y-2">
                {quests.map((q) => {
                  const done = state.completedQuests.includes(q.id)
                  const active = state.activeQuestId === q.id
                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border p-3"
                      style={{
                        borderColor: done ? '#10b981' : active ? '#fbbf24' : 'rgba(255,255,255,.1)',
                        background: done ? 'rgba(16,185,129,.08)' : active ? 'rgba(251,191,36,.06)' : 'rgba(255,255,255,.03)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">
                          {done ? '✓ ' : active ? '➤ ' : ''}
                          {q.title}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">
                          {done ? 'complete' : active ? 'active' : 'locked'}
                        </div>
                      </div>
                      <div className="mt-1 text-[12px] text-white/70">{q.description}</div>
                      <div className="mt-2 space-y-1 text-[11px] text-white/55">
                        {q.objectives.map((o) => (
                          <div key={o.id} className="flex items-center gap-2">
                            <span className="opacity-50">{done ? '✓' : '•'}</span>
                            <span>{o.label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 text-[11px] text-emerald-300/80">
                        Reward: +{q.reward.xp} XP
                        {q.reward.items?.length ? ` · items: ${q.reward.items.length}` : ''}
                        {q.reward.unlockWorlds?.length ? ` · unlocks: ${q.reward.unlockWorlds.join(', ')}` : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
