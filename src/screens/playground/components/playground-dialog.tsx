import { useEffect, useState } from 'react'
import { NPC_DIALOG, type DialogChoice } from '../lib/npc-dialog'
import type {
  PlaygroundItemId,
  PlaygroundSkillId,
  PlaygroundQuest,
} from '../lib/playground-rpg'

type Props = {
  npcId: string | null
  onClose: () => void
  onCompleteQuest: (questId: string) => void
  onGrantItems: (items: PlaygroundItemId[]) => void
  onGrantSkillXp: (skillXp: Partial<Record<PlaygroundSkillId, number>>) => void
  activeQuest: PlaygroundQuest | null
}

export function PlaygroundDialog({
  npcId,
  onClose,
  onCompleteQuest,
  onGrantItems,
  onGrantSkillXp,
  activeQuest,
}: Props) {
  const [reply, setReply] = useState<string | null>(null)
  const [loreIdx, setLoreIdx] = useState(0)
  const [showLore, setShowLore] = useState(false)

  useEffect(() => {
    setReply(null)
    setLoreIdx(0)
    setShowLore(false)
  }, [npcId])

  if (!npcId) return null
  const npc = NPC_DIALOG[npcId]
  if (!npc) return null

  function handleChoice(c: DialogChoice) {
    setReply(c.reply)
    setShowLore(false)
    if (c.completeQuest) onCompleteQuest(c.completeQuest)
    if (c.grantItems?.length) onGrantItems(c.grantItems)
    if (c.grantSkillXp) onGrantSkillXp(c.grantSkillXp)
    if (c.end) {
      window.setTimeout(onClose, 1500)
    }
  }

  function handleNextLore() {
    setShowLore(true)
    setReply(npc.lore[loreIdx % npc.lore.length])
    setLoreIdx((i) => i + 1)
  }

  // Show "active" badge on the choice that progresses the active quest
  function isQuestRelated(c: DialogChoice) {
    if (!activeQuest) return false
    if (c.completeQuest === activeQuest.id) return true
    return false
  }

  return (
    <div
      className="pointer-events-auto fixed bottom-[120px] left-1/2 z-[80] w-[680px] max-w-[94vw] -translate-x-1/2 overflow-hidden rounded-2xl border-2 text-white shadow-2xl backdrop-blur-xl"
      style={{
        borderColor: npc.color,
        background: 'linear-gradient(180deg, rgba(8,12,20,0.95), rgba(0,0,0,0.95))',
        boxShadow: `0 0 36px ${npc.color}66, 0 18px 60px rgba(0,0,0,0.7)`,
      }}
    >
      {/* Ornate header strip */}
      <div
        className="relative flex items-center gap-3 border-b-2 px-4 py-3"
        style={{
          borderColor: npc.color,
          background: `linear-gradient(90deg, ${npc.color}22, transparent)`,
        }}
      >
        <img
          src={`/avatars/${npc.id}.png`}
          alt={npc.name}
          width={56}
          height={56}
          className="rounded-full"
          style={{ border: `2px solid ${npc.color}`, boxShadow: `0 0 14px ${npc.color}88` }}
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).src = '/avatars/hermes.png'
          }}
        />
        <div className="flex-1">
          <div className="text-base font-bold" style={{ color: npc.color }}>
            {npc.name}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/55">
            {npc.title}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-white/55 hover:bg-white/10"
        >
          Esc
        </button>
      </div>

      {/* Speech body */}
      <div className="px-4 py-4 text-[13px] leading-relaxed text-white/90">
        {reply ?? npc.opening}
      </div>

      {/* Choices footer */}
      <div className="border-t border-white/10 bg-black/40 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
          Your reply
        </div>
        <div className="space-y-1.5">
          {npc.choices.map((c) => {
            const quest = isQuestRelated(c)
            return (
              <button
                key={c.id}
                onClick={() => handleChoice(c)}
                className="block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-[12px] text-white/90 transition hover:border-white/30 hover:bg-white/10"
                style={{
                  borderColor: quest ? '#fbbf24' : undefined,
                  background: quest ? 'rgba(251,191,36,.08)' : undefined,
                }}
              >
                <span className="opacity-60">›</span> {c.label}
                {quest && (
                  <span className="ml-2 rounded bg-amber-300/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-amber-200">
                    active
                  </span>
                )}
              </button>
            )
          })}
          <button
            onClick={handleNextLore}
            className="block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-[12px] text-white/70 transition hover:border-white/30 hover:bg-white/10"
          >
            <span className="opacity-60">›</span> Tell me more {showLore ? `(${loreIdx % npc.lore.length + 1}/${npc.lore.length})` : ''}
          </button>
          <button
            onClick={onClose}
            className="block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-[12px] text-white/55 transition hover:border-white/30 hover:bg-white/10"
          >
            <span className="opacity-60">›</span> Farewell
          </button>
        </div>
      </div>
    </div>
  )
}
