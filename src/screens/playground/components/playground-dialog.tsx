import { useEffect, useState } from 'react'
import { NPC_DIALOG } from '../lib/npc-dialog'

export function PlaygroundDialog({
  npcId,
  onClose,
}: {
  npcId: string | null
  onClose: () => void
}) {
  const [lineIdx, setLineIdx] = useState(0)
  useEffect(() => {
    setLineIdx(0)
  }, [npcId])
  if (!npcId) return null
  const dialog = NPC_DIALOG[npcId]
  if (!dialog) return null
  const line = dialog.lines[lineIdx] ?? dialog.lines[0]
  const isLast = lineIdx >= dialog.lines.length - 1
  return (
    <div
      className="pointer-events-auto fixed bottom-[120px] left-1/2 z-[80] w-[640px] max-w-[92vw] -translate-x-1/2 rounded-2xl border bg-black/85 p-4 text-white shadow-2xl backdrop-blur-xl"
      style={{ borderColor: dialog.color }}
    >
      <div className="mb-2 flex items-center gap-3">
        <img
          src={`/avatars/${dialog.id}.png`}
          alt={dialog.name}
          width={48}
          height={48}
          className="rounded-full"
          style={{ border: `2px solid ${dialog.color}` }}
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).src = '/avatars/hermes.png'
          }}
        />
        <div className="flex-1">
          <div className="text-sm font-bold" style={{ color: dialog.color }}>
            {dialog.name}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">
            {dialog.title}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-white/45 hover:bg-white/10"
        >
          Close
        </button>
      </div>
      <div className="text-[14px] leading-relaxed text-white/90">{line}</div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
          {lineIdx + 1} / {dialog.lines.length}
        </div>
        <button
          onClick={() => (isLast ? onClose() : setLineIdx((i) => i + 1))}
          className="rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-black"
          style={{ background: dialog.color }}
        >
          {isLast ? 'Farewell' : 'Next ›'}
        </button>
      </div>
    </div>
  )
}
