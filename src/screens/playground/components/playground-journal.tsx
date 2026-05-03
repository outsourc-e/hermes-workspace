import { useMemo, useState } from 'react'
import { itemById, PLAYGROUND_QUESTS } from '../lib/playground-rpg'
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
  const activeQuest = useMemo(
    () => PLAYGROUND_QUESTS.find((quest) => !quest.optional && !state.completedQuests.includes(quest.id)),
    [state.completedQuests],
  )
  const grouped = useMemo(() => {
    const map = new Map<string, typeof PLAYGROUND_QUESTS>()
    for (const quest of PLAYGROUND_QUESTS) {
      const list = map.get(quest.chapter) ?? []
      list.push(quest)
      map.set(quest.chapter, list)
    }
    return map
  }, [])
  const chapters = useMemo(
    () => Array.from(grouped.keys()),
    [grouped],
  )
  const activeChapter = activeQuest?.chapter ?? chapters[0] ?? 'Training Grounds Tutorial'
  const [selectedChapter, setSelectedChapter] = useState(activeChapter)
  const chapter = chapters.includes(selectedChapter) ? selectedChapter : activeChapter
  const quests = grouped.get(chapter) ?? []
  const completedRewards = useMemo(() => {
    const items = new Set<string>()
    let xp = 0
    for (const quest of PLAYGROUND_QUESTS) {
      if (!state.completedQuests.includes(quest.id)) continue
      xp += quest.reward.xp
      for (const itemId of quest.reward.items ?? []) {
        const item = itemById(itemId)
        if (item) items.add(item.name)
      }
    }
    return { xp, items: Array.from(items) }
  }, [state.completedQuests])

  if (!open) return null

  return (
    <div className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm md:p-6" onClick={onClose}>
      <div
        className="grid max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-[#0b1720] text-white shadow-2xl md:grid-cols-[240px_minmax(0,1fr)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 bg-black/25 p-4 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold">Quest Journal</div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Press J to toggle</div>
            </div>
            <button onClick={onClose} className="rounded px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-white/55 hover:bg-white/10">
              Close
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {chapters.map((entry) => {
              const selected = entry === chapter
              const hasActive = activeQuest?.chapter === entry
              const completeCount = (grouped.get(entry) ?? []).filter((quest) => state.completedQuests.includes(quest.id)).length
              return (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setSelectedChapter(entry)}
                  className="w-full rounded-xl border px-3 py-2 text-left transition"
                  style={{
                    borderColor: selected ? 'rgba(34,211,238,0.45)' : 'rgba(255,255,255,0.08)',
                    background: selected ? 'rgba(34,211,238,0.10)' : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div className="text-[12px] font-semibold">{entry}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/45">
                    {completeCount}/{(grouped.get(entry) ?? []).length} complete{hasActive ? ' · active' : ''}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="overflow-y-auto p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">{chapter}</div>
              <div className="mt-1 text-sm text-white/65">
                Completed rewards: +{completedRewards.xp} XP
                {completedRewards.items.length ? ` · ${completedRewards.items.join(', ')}` : ''}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {quests.map((quest) => {
              const done = state.completedQuests.includes(quest.id)
              const active = activeQuest?.id === quest.id
              const progress = state.playerProfile.questProgress[quest.id]
              return (
                <div
                  key={quest.id}
                  className="rounded-2xl border p-4"
                  style={{
                    borderColor: done ? '#10b98155' : active ? '#fbbf2455' : 'rgba(255,255,255,.1)',
                    background: done ? 'rgba(16,185,129,.07)' : active ? 'rgba(251,191,36,.06)' : 'rgba(255,255,255,.03)',
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-semibold">
                      {quest.title}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">
                      {done ? 'complete' : active ? 'active' : quest.optional ? 'bonus' : 'pending'}
                    </div>
                  </div>
                  <div className="mt-1 text-[13px] text-white/70">{quest.description}</div>
                  <div className="mt-3 space-y-1.5 text-[12px]">
                    {quest.objectives.map((objective) => {
                      const completed = progress?.completedObjectives.includes(objective.id)
                      return (
                        <div
                          key={objective.id}
                          className="flex items-start gap-2"
                          style={{
                            color: completed ? 'rgba(255,255,255,0.42)' : active ? '#fef3c7' : 'rgba(255,255,255,0.78)',
                          }}
                        >
                          <span>{completed ? '✓' : active ? '➜' : '•'}</span>
                          <span>{objective.label}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-3 text-[11px] text-emerald-300/80">
                    Reward: +{quest.reward.xp} XP
                    {quest.reward.items?.length ? ` · ${quest.reward.items.map((itemId) => itemById(itemId)?.name ?? itemId).join(', ')}` : ''}
                    {quest.reward.unlockWorlds?.length ? ` · unlocks ${quest.reward.unlockWorlds.join(', ')}` : ''}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
