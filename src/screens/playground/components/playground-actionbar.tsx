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
  {
    id: 'strike',
    key: '1',
    label: 'Strike',
    icon: '⚔️',
    cost: 0,
    cooldownMs: 900,
    description: 'Basic melee attack for nearby targets.',
    color: '#fb7185',
  },
  {
    id: 'dash',
    key: '2',
    label: 'Dash',
    icon: '💨',
    cost: 8,
    cooldownMs: 4000,
    description: 'Short movement burst. Costs 8 MP.',
    color: '#22d3ee',
  },
  {
    id: 'bolt',
    key: '3',
    label: 'Bolt',
    icon: '⚡',
    cost: 15,
    cooldownMs: 5200,
    description: 'Ranged bolt that hits the test enemy from a distance.',
    color: '#facc15',
  },
  {
    id: 'summon',
    key: '4',
    label: 'Summon',
    icon: '✨',
    cost: 20,
    cooldownMs: 30000,
    description: 'Summon a temporary Hermes familiar that walks beside you for 60s. (Hermes Summoning skill)',
    color: '#a78bfa',
  },
]

type Props = {
  onCast: (id: string) => boolean
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const slot = ACTIONS.find((action) => action.key === event.key)
      if (slot) tryCast(slot)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      className="pointer-events-auto fixed bottom-3 left-1/2 z-[70] flex w-[min(94vw,420px)] -translate-x-1/2 items-center justify-center gap-2 rounded-2xl border-2 border-white/15 bg-gradient-to-b from-[#08111d]/95 to-black/90 px-3 py-2 text-white shadow-2xl backdrop-blur-xl md:w-auto"
      style={{ boxShadow: '0 0 26px rgba(56,189,248,.18), 0 14px 40px rgba(0,0,0,.6)' }}
    >
      <div className="mr-2 hidden flex-col gap-1 md:flex">
        <Pip label="HP" v={hp} m={hpMax} c="#ef4444" />
        <Pip label="MP" v={mp} m={mpMax} c="#3b82f6" />
        <Pip label="SP" v={sp} m={spMax} c="#10b981" />
      </div>
      {ACTIONS.map((action) => {
        const cdEnd = cooldowns[action.id] ?? 0
        const now = Date.now()
        const cdRemaining = Math.max(0, cdEnd - now)
        const cdPct = cdRemaining > 0 ? (cdRemaining / action.cooldownMs) * 100 : 0
        const noMp = mp < action.cost
        const castable = cdRemaining === 0 && !noMp
        return (
          <div
            key={action.id}
            className="relative"
            onMouseEnter={() => setTipFor(action.id)}
            onMouseLeave={() => setTipFor((current) => (current === action.id ? null : current))}
          >
            <button
              onClick={() => tryCast(action)}
              disabled={cdRemaining > 0 || noMp}
              className="relative h-12 w-12 overflow-hidden rounded-lg border-2 transition-transform hover:scale-110 disabled:opacity-50 disabled:hover:scale-100"
              style={{
                borderColor: castable ? action.color : '#1f2937',
                background: castable ? `${action.color}18` : 'rgba(0,0,0,0.45)',
                boxShadow: castable ? `0 0 12px ${action.color}55` : 'none',
              }}
            >
              <span className="text-xl">{action.icon}</span>
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
              <span
                className="absolute bottom-0 left-1 rounded px-1 text-[9px] font-black"
                style={{
                  color: castable ? '#fff' : 'rgba(255,255,255,0.45)',
                  background: castable ? action.color : 'rgba(255,255,255,0.08)',
                  boxShadow: castable ? `0 0 10px ${action.color}66` : 'none',
                }}
              >
                {action.key}
              </span>
              {action.cost > 0 && (
                <span className="absolute right-1 top-0.5 text-[8px] font-bold text-blue-300">{action.cost}</span>
              )}
            </button>
            {tipFor === action.id && (
              <div
                className="absolute bottom-[58px] left-1/2 w-44 -translate-x-1/2 rounded border bg-black/90 px-2 py-1.5 text-[10px] leading-tight"
                style={{ borderColor: action.color }}
              >
                <div className="text-[11px] font-bold" style={{ color: action.color }}>
                  {action.label}
                </div>
                <div className="opacity-80">{action.description}</div>
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
