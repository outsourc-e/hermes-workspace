import { useEffect, useRef, useState } from 'react'
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

type ChatTurn = { role: 'user' | 'assistant'; content: string; ts: number; fallback?: boolean }

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
  const [askingLLM, setAskingLLM] = useState(false)
  const [llmFreeform, setLlmFreeform] = useState('')
  const [chatLog, setChatLog] = useState<ChatTurn[]>([])
  const inFlight = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setReply(null)
    setLoreIdx(0)
    setShowLore(false)
    setLlmFreeform('')
    setChatLog([])
    inFlight.current?.abort()
    inFlight.current = null
  }, [npcId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatLog.length, askingLLM])

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

  function isQuestRelated(c: DialogChoice) {
    if (!activeQuest) return false
    if (c.completeQuest === activeQuest.id) return true
    return false
  }

  async function askLLM() {
    const text = llmFreeform.trim()
    if (!text || askingLLM || !npcId) return
    inFlight.current?.abort()
    const ctrl = new AbortController()
    inFlight.current = ctrl
    setAskingLLM(true)
    const userTurn: ChatTurn = { role: 'user', content: text, ts: Date.now() }
    const newLog = [...chatLog, userTurn]
    setChatLog(newLog)
    setLlmFreeform('')
    setReply(null)

    try {
      const r = await fetch('/api/playground-npc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          npcId,
          playerMessage: text,
          history: chatLog.map((t) => ({ role: t.role, content: t.content })),
        }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const data = (await r.json()) as { reply: string; fallback?: boolean }
      const t: ChatTurn = { role: 'assistant', content: data.reply, ts: Date.now(), fallback: data.fallback }
      setChatLog((p) => [...p, t])
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      const t: ChatTurn = {
        role: 'assistant',
        content: `*${npc.name} pauses* — "The chronicle is silent. Try again later."`,
        ts: Date.now(),
        fallback: true,
      }
      setChatLog((p) => [...p, t])
    } finally {
      if (inFlight.current === ctrl) inFlight.current = null
      setAskingLLM(false)
    }
  }

  const showChat = chatLog.length > 0 || askingLLM

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

      {/* Speech body / chat history */}
      {!showChat ? (
        <div className="px-4 py-4 text-[13px] leading-relaxed text-white/90">
          {reply ?? npc.opening}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="max-h-[260px] overflow-y-auto px-4 py-3 text-[13px] leading-relaxed"
        >
          {/* Show opening line as an initial assistant turn for context */}
          <div className="mb-2 text-white/70">
            <span className="mr-2 font-bold" style={{ color: npc.color }}>
              {npc.name}:
            </span>
            {reply ?? npc.opening}
          </div>
          {chatLog.map((t, i) => (
            <div key={i} className="mb-2">
              {t.role === 'user' ? (
                <div className="text-white/95">
                  <span className="mr-2 font-bold text-cyan-300">You:</span>
                  {t.content}
                </div>
              ) : (
                <div className="text-white/85">
                  <span className="mr-2 font-bold" style={{ color: npc.color }}>
                    {npc.name}:
                  </span>
                  {t.content}
                  {t.fallback && (
                    <span className="ml-2 rounded bg-amber-300/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-amber-200">
                      offline
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          {askingLLM && (
            <div className="text-white/55 italic">
              <span className="mr-2 font-bold" style={{ color: npc.color }}>
                {npc.name}:
              </span>
              <span className="opacity-70">…</span>
            </div>
          )}
        </div>
      )}

      {/* Free-form input — the killer feature */}
      <div className="border-t border-white/10 bg-black/45 p-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            askLLM()
          }}
          className="flex gap-2"
        >
          <input
            value={llmFreeform}
            onChange={(e) => setLlmFreeform(e.target.value)}
            onKeyDown={(e) => {
              // Stop WASD movement keys from being captured by the world.
              e.stopPropagation()
            }}
            placeholder={`Ask ${npc.name} anything…`}
            disabled={askingLLM}
            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white placeholder:text-white/40 outline-none focus:border-white/30"
            autoFocus
          />
          <button
            type="submit"
            disabled={askingLLM || !llmFreeform.trim()}
            className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/85 transition hover:bg-white/15 disabled:opacity-40"
            style={{ borderColor: askingLLM ? '#94a3b8' : npc.color, color: askingLLM ? '#94a3b8' : npc.color }}
          >
            {askingLLM ? '…' : 'Speak'}
          </button>
        </form>
      </div>

      {/* Choices footer */}
      <div className="border-t border-white/10 bg-black/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            Quest replies
          </div>
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
