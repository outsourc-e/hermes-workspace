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
  locked?: boolean
}

const ACTIONS: Array<ActionSlot> = [
  {
    id: 'strike',
    key: '1',
    label: 'Strike',
    icon: '◇',
    cost: 0,
    cooldownMs: 900,
    description: 'Basic melee attack for nearby targets.',
    color: '#F1C56D',
  },
  {
    id: 'dash',
    key: '2',
    label: 'Dash',
    icon: '↟',
    cost: 8,
    cooldownMs: 4000,
    description: 'Short movement burst. Costs 8 MP.',
    color: '#2E6A63',
  },
  {
    id: 'bolt',
    key: '3',
    label: 'Bolt',
    icon: '⌁',
    cost: 15,
    cooldownMs: 5200,
    description: 'Ranged bolt that hits the test enemy from a distance.',
    color: '#B8862B',
  },
  {
    id: 'summon',
    key: '4',
    label: 'Summon',
    icon: '✦',
    cost: 20,
    cooldownMs: 30000,
    description: 'Summon a temporary Hermes familiar that walks beside you for 60s. (Hermes Summoning skill)',
    color: '#F4E9D3',
  },
  {
    id: 'sigil',
    key: '5',
    label: 'Sigil',
    icon: '☤',
    cost: 0,
    cooldownMs: 1,
    description: 'Hermes sigil focus slot. Unlocks in Agora.',
    color: '#F1C56D',
    locked: true,
  },
  {
    id: 'scroll',
    key: '6',
    label: 'Scroll',
    icon: '▱',
    cost: 0,
    cooldownMs: 1,
    description: 'Reserved scroll slot for quests and lore.',
    color: '#F4E9D3',
    locked: true,
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
    if (action.locked) return
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
      if (slot && !slot.locked) tryCast(slot)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      className="pointer-events-auto fixed bottom-[22px] left-1/2 z-[70] flex w-[min(94vw,548px)] -translate-x-1/2 items-center justify-center gap-2 rounded-[24px] border px-3 py-2 text-white shadow-2xl backdrop-blur-xl md:w-auto"
      style={{
        borderColor: 'rgba(241,197,109,0.62)',
        background: 'linear-gradient(180deg, rgba(15,22,34,.92), rgba(10,13,18,.88)), radial-gradient(circle at 50% 0%, rgba(241,197,109,.2), transparent 58%)',
        boxShadow: '0 18px 46px rgba(0,0,0,.68), 0 0 34px rgba(241,197,109,.22), inset 0 1px 0 rgba(244,233,211,.14)',
      }}
    >
      <div className="mr-2 hidden flex-col gap-1.5 md:flex">
        <Pip label="HP" v={hp} m={hpMax} c="#B03A30" />
        <Pip label="MP" v={mp} m={mpMax} c="#2E6A63" />
        <Pip label="SP" v={sp} m={spMax} c="#F1C56D" />
      </div>
      {ACTIONS.map((action) => {
        const cdEnd = cooldowns[action.id] ?? 0
        const now = Date.now()
        const cdRemaining = Math.max(0, cdEnd - now)
        const cdPct = cdRemaining > 0 ? (cdRemaining / action.cooldownMs) * 100 : 0
        const noMp = mp < action.cost
        const castable = cdRemaining === 0 && !noMp && !action.locked
        return (
          <div
            key={action.id}
            className="relative"
            onMouseEnter={() => setTipFor(action.id)}
            onMouseLeave={() => setTipFor((current) => (current === action.id ? null : current))}
          >
            <button
              onClick={() => tryCast(action)}
              disabled={cdRemaining > 0 || noMp || action.locked}
              className="relative h-14 w-14 overflow-hidden rounded-[14px] border transition-transform hover:-translate-y-1 disabled:opacity-55 disabled:hover:translate-y-0"
              style={{
                borderColor: castable ? action.color : 'rgba(184,134,43,.36)',
                background: castable ? `linear-gradient(180deg, ${action.color}20, rgba(10,13,18,.78))` : 'linear-gradient(180deg, rgba(27,36,51,.72), rgba(10,13,18,.82))',
                boxShadow: castable ? `0 0 16px ${action.color}55, inset 0 1px 0 rgba(244,233,211,.16)` : 'inset 0 1px 0 rgba(244,233,211,.08)',
              }}
            >
              <span className="text-[24px] font-black leading-none">{action.icon}</span>
              {cdRemaining > 0 && (
                <div
                  className="absolute inset-0 bg-[#0A0D12]/75"
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
                  color: castable ? '#0A0D12' : 'rgba(244,233,211,0.45)',
                  background: castable ? 'linear-gradient(180deg, #F1C56D, #B8862B)' : 'rgba(244,233,211,0.08)',
                  boxShadow: castable ? `0 0 10px ${action.color}66` : 'none',
                }}
              >
                {action.key}
              </span>
              {action.cost > 0 && (
                <span className="absolute right-1.5 top-1 text-[8px] font-black text-[#F4E9D3]/70">{action.cost}</span>
              )}
            </button>
            {tipFor === action.id && (
              <div
                className="absolute bottom-[68px] left-1/2 w-48 -translate-x-1/2 rounded-xl border bg-[#0A0D12]/95 px-2.5 py-2 text-[10px] leading-tight text-[#F4E9D3] shadow-2xl"
                style={{ borderColor: action.color }}
              >
                <div className="text-[11px] font-bold" style={{ color: action.color }}>
                  {action.label}
                </div>
                <div className="opacity-80">{action.description}</div>
                {noMp && <div className="mt-1 text-[#F1C56D]">Not enough MP</div>}
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
      <div className="h-1 w-12 overflow-hidden rounded-full bg-[#F4E9D3]/10">
        <div className="h-full" style={{ width: `${(v / m) * 100}%`, background: c }} />
      </div>
    </div>
  )
}
