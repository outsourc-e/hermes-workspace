import { useEffect, useRef, useState } from 'react'
import { NPC_DIALOG, type DialogChoice } from '../lib/npc-dialog'
import { SpeechBubble } from './speech-bubble'

// Tiny in-memory cache for ASCII portraits.
const ASCII_PORTRAIT_CACHE: Record<string, string> = {}
function useAsciiPortrait(npcId: string | null) {
  const [art, setArt] = useState<string | null>(null)
  useEffect(() => {
    if (!npcId) { setArt(null); return }
    const id = npcId
    if (ASCII_PORTRAIT_CACHE[id] !== undefined) {
      setArt(ASCII_PORTRAIT_CACHE[id] || null)
      return
    }
    fetch(`/ascii-portraits/${id}.txt`)
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => {
        ASCII_PORTRAIT_CACHE[id] = t.trim()
        setArt(t.trim() || null)
      })
      .catch(() => { ASCII_PORTRAIT_CACHE[id] = ''; setArt(null) })
  }, [npcId])
  return art
}
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
  onChoice?: (npcId: string, choiceId: string) => void
}

type ChatTurn = { role: 'user' | 'assistant'; content: string; ts: number; fallback?: boolean }

export function PlaygroundDialog({
  npcId,
  onClose,
  onCompleteQuest,
  onGrantItems,
  onGrantSkillXp,
  activeQuest,
  onChoice,
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

  const asciiArt = useAsciiPortrait(npcId)
  if (!npcId) return null
  const npc = NPC_DIALOG[npcId]
  if (!npc) return null

  function handleChoice(c: DialogChoice) {
    setReply(c.reply)
    setShowLore(false)
    onChoice?.(npcId, c.id)
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
    return /quest|build|sigil|scroll|archive|kit/i.test(c.label)
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
      // Never surface raw provider errors (401, JSON dumps, etc.) to the player.
      const fallbackLines = [
        `*${npc.name} pauses* — "The chronicle is silent. Speak with me through the scripted scrolls below."`,
        `*${npc.name} cocks their head* — "Live agent dialog is offline. Try one of the prepared replies."`,
        `*${npc.name} sighs* — "The aether between worlds is unstable. Let us speak in the old tongue — pick a reply."`,
      ]
      const t: ChatTurn = {
        role: 'assistant',
        content: fallbackLines[Math.floor(Math.random() * fallbackLines.length)],
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
  const llmEnabled = (import.meta as any).env?.VITE_PLAYGROUND_LLM_CHAT === '1'
  const offlineMode = !llmEnabled || chatLog.some((t) => t.fallback)

  return (
    <div
      className="pointer-events-auto fixed bottom-[max(132px,env(safe-area-inset-bottom))] left-1/2 z-[80] w-[680px] max-w-[94vw] -translate-x-1/2 overflow-visible rounded-[24px] border-2 text-white shadow-2xl backdrop-blur-xl max-[760px]:bottom-[132px] max-[760px]:max-h-[calc(100vh-190px)] max-[760px]:overflow-y-auto"
      style={{
        borderColor: '#d9b35f',
        background: 'linear-gradient(180deg, rgba(54,36,16,0.96), rgba(12,8,4,0.97))',
        boxShadow: `0 0 36px ${npc.color}66, 0 18px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,244,205,.16)`,
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
          <div className="flex items-center gap-2">
            <div className="text-base font-bold" style={{ color: npc.color }}>
              {npc.name}
            </div>
            {asciiArt && (
              <pre
                className="hidden rounded border bg-black/30 px-2 py-1 text-[8px] leading-[1.05] md:block"
                style={{
                  color: npc.color,
                  borderColor: `${npc.color}55`,
                  fontFamily: '"Menlo", "Monaco", "Courier New", monospace',
                  whiteSpace: 'pre',
                  margin: 0,
                }}
              >
                {asciiArt}
              </pre>
            )}
            {offlineMode && (
              <span className="rounded bg-amber-300/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-amber-200">
                scripted mode
              </span>
            )}
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
        <div className="px-4 py-4">
          <SpeechBubble variant="npc" tail="left" accent={npc.color} name={npc.name} portraitSrc={npc.portraitSrc} portraitAlt={npc.portraitAlt}>
            {reply ?? npc.opening}
          </SpeechBubble>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="max-h-[260px] overflow-y-auto px-4 py-3 text-[13px] leading-relaxed"
        >
          {/* Show opening line as an initial assistant turn for context */}
          <div className="mb-3">
            <SpeechBubble variant="npc" tail="left" accent={npc.color} name={npc.name} portraitSrc={npc.portraitSrc} portraitAlt={npc.portraitAlt} compact>
              {reply ?? npc.opening}
            </SpeechBubble>
          </div>
          {chatLog.map((t, i) => (
            <div key={i} className="mb-2">
              {t.role === 'user' ? (
                <div className="flex justify-end">
                  <SpeechBubble variant="player" tail="right" name="You" compact>
                    {t.content}
                  </SpeechBubble>
                </div>
              ) : (
                <SpeechBubble variant={t.fallback ? 'system' : 'npc'} tail="left" accent={npc.color} name={npc.name} portraitSrc={npc.portraitSrc} portraitAlt={npc.portraitAlt} compact>
                  {t.content}
                  {t.fallback && (
                    <span className="ml-2 rounded bg-amber-800/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-amber-900/75">
                      offline
                    </span>
                  )}
                </SpeechBubble>
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

      {/* Free-form input — opt-in via VITE_PLAYGROUND_LLM_CHAT=1 */}
      {llmEnabled && (
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
      )}

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
