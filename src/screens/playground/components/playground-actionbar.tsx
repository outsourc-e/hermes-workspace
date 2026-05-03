import { useEffect, useState } from 'react'

export type ActionSlot = {
  id: string
  key: string
  label: string
  icon: string
  cost: number
  cooldownMs: number
  description: string
  color: string
}

const ACTIONS: ActionSlot[] = [
  { id: 'strike', key: '1', label: 'Strike', icon: '⚔️', cost: 0, cooldownMs: 800, description: 'Basic attack on nearby enemy.', color: '#fb7185' },
  { id: 'heal', key: '2', label: 'Heal', icon: '💚', cost: 12, cooldownMs: 6000, description: 'Restore 35 HP. Costs 12 MP.', color: '#10b981' },
  { id: 'sprint', key: '3', label: 'Dash', icon: '💨', cost: 8, cooldownMs: 4000, description: 'Burst of speed for 3s.', color: '#22d3ee' },
  { id: 'spell', key: '4', label: 'Bolt', icon: '⚡', cost: 18, cooldownMs: 5000, description: 'Ranged magic strike.', color: '#facc15' },
  { id: 'shield', key: '5', label: 'Ward', icon: '🛡️', cost: 14, cooldownMs: 8000, description: '50% damage reduction for 5s.', color: '#a78bfa' },
  { id: 'summon', key: '6', label: 'Summon', icon: '🐾', cost: 25, cooldownMs: 30000, description: 'Spawn a Hermes companion to fight.', color: '#f472b6' },
]

type Props = {
  onCast: (id: string) => boolean // return true if cast succeeded
  hp: number
  hpMax: number
  mp: number
  mpMax: number
  sp: number
  spMax: number
}

export function PlaygroundActionBar({ onCast, hp, hpMax, mp, mpMax, sp, spMax }: Props) {
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({})
  const [tipFor, setTipFor] = useState<string | null>(null)

  useEffect(() => {
    const tick = window.setInterval(() => {
      setCooldowns((prev) => {
        const now = Date.now()
        const next: Record<string, number> = {}
        for (const [id, until] of Object.entries(prev)) {
          if (until > now) next[id] = until
        }
        return next
      })
    }, 100)
    return () => window.clearInterval(tick)
  }, [])

  const tryCast = (action: ActionSlot) => {
    const now = Date.now()
    const cdEnd = cooldowns[action.id] ?? 0
    if (cdEnd > now) return
    if (mp < action.cost) return
    const ok = onCast(action.id)
    if (ok) {
      setCooldowns((prev) => ({ ...prev, [action.id]: now + action.cooldownMs }))
    }
  }

  // Hotkey 1-6
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const slot = ACTIONS.find((a) => a.key === e.key)
      if (slot) tryCast(slot)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      className="pointer-events-auto fixed bottom-3 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-2xl border-2 border-white/15 bg-gradient-to-b from-[#0b1320]/90 to-black/85 px-3 py-2 text-white shadow-2xl backdrop-blur-xl"
      style={{ boxShadow: '0 0 22px rgba(56,189,248,.18), 0 14px 40px rgba(0,0,0,.6)' }}
    >
      {/* Mini stat pips */}
      <div className="mr-2 hidden flex-col gap-1 md:flex">
        <Pip label="HP" v={hp} m={hpMax} c="#ef4444" />
        <Pip label="MP" v={mp} m={mpMax} c="#3b82f6" />
        <Pip label="SP" v={sp} m={spMax} c="#10b981" />
      </div>
      {ACTIONS.map((a) => {
        const cdEnd = cooldowns[a.id] ?? 0
        const now = Date.now()
        const cdRemaining = Math.max(0, cdEnd - now)
        const cdPct = cdRemaining > 0 ? (cdRemaining / a.cooldownMs) * 100 : 0
        const noMp = mp < a.cost
        return (
          <div
            key={a.id}
            className="relative"
            onMouseEnter={() => setTipFor(a.id)}
            onMouseLeave={() => setTipFor((t) => (t === a.id ? null : t))}
          >
            <button
              onClick={() => tryCast(a)}
              disabled={cdRemaining > 0 || noMp}
              className="relative h-12 w-12 overflow-hidden rounded-lg border-2 transition-transform hover:scale-110 disabled:opacity-50 disabled:hover:scale-100"
              style={{
                borderColor: cdRemaining > 0 ? '#1f2937' : a.color,
                background: 'rgba(0,0,0,0.45)',
                boxShadow: cdRemaining > 0 ? 'none' : `0 0 12px ${a.color}55`,
              }}
            >
              <span className="text-xl">{a.icon}</span>
              {/* Cooldown sweep */}
              {cdRemaining > 0 && (
                <div
                  className="absolute inset-0 bg-black/65"
                  style={{
                    clipPath: `polygon(0 0, 100% 0, 100% ${100 - cdPct}%, 0 ${100 - cdPct}%)`,
                  }}
                />
              )}
              {cdRemaining > 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] font-bold">
                  {Math.ceil(cdRemaining / 1000)}s
                </div>
              )}
              <span className="absolute bottom-0 left-1 text-[9px] font-bold opacity-70">{a.key}</span>
              {a.cost > 0 && (
                <span className="absolute right-1 top-0.5 text-[8px] font-bold text-blue-300">{a.cost}</span>
              )}
            </button>
            {tipFor === a.id && (
              <div
                className="absolute bottom-[58px] left-1/2 w-44 -translate-x-1/2 rounded border bg-black/90 px-2 py-1.5 text-[10px] leading-tight"
                style={{ borderColor: a.color }}
              >
                <div className="text-[11px] font-bold" style={{ color: a.color }}>{a.label}</div>
                <div className="opacity-80">{a.description}</div>
                {noMp && <div className="mt-1 text-amber-300">Not enough MP</div>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Pip({ label, v, m, c }: { label: string; v: number; m: number; c: string }) {
  return (
    <div className="flex items-center gap-1 text-[8px] font-bold">
      <span style={{ color: c }}>{label}</span>
      <div className="h-1 w-12 overflow-hidden rounded-full bg-white/10">
        <div className="h-full" style={{ width: `${(v / m) * 100}%`, background: c }} />
      </div>
    </div>
  )
}
