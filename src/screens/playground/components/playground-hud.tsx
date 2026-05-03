/**
 * Compact, RuneScape-style HUD: floating stat orbs (HP/MP/SP/XP) plus
 * a small player chip. The right-side rail is now owned by
 * PlaygroundSidePanel. The bottom skill strip lives there too.
 */
import type { PlaygroundWorldId } from '../lib/playground-rpg'
import type { PlaygroundRpgState } from '../hooks/use-playground-rpg'

type HudProps = {
  state: PlaygroundRpgState
  activeQuestTitle: string
  levelProgress: { current: number; needed: number; pct: number }
  currentWorld: PlaygroundWorldId
  worldAccent: string
  lastReward?: string | null
}

export function PlaygroundHud({
  state,
  activeQuestTitle,
  levelProgress,
  worldAccent,
  lastReward,
}: HudProps) {
  return (
    <>
      {/* Player chip + stat orbs (top-left) */}
      <div className="pointer-events-auto fixed left-[92px] top-3 z-[70] flex flex-col items-start gap-2 md:left-[104px]">
        <div
          className="rounded-2xl border-2 border-white/15 bg-gradient-to-b from-[#0b1320]/90 to-black/85 px-3 py-2 text-white shadow-2xl backdrop-blur-xl"
          style={{ boxShadow: `0 0 18px ${worldAccent}33, 0 12px 36px rgba(0,0,0,.55)` }}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold"
              style={{
                borderColor: worldAccent,
                background: `${worldAccent}22`,
                color: worldAccent,
                boxShadow: `0 0 10px ${worldAccent}66`,
              }}
            >
              {state.level}
            </div>
            <div className="leading-tight">
              <div className="text-[12px] font-bold">Worldsmith</div>
              <div className="max-w-[180px] truncate text-[9px] uppercase tracking-[0.16em] text-white/45">
                {activeQuestTitle}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Orb label="HP" v={state.hp} m={state.hpMax} color="#ef4444" />
          <Orb label="MP" v={state.mp} m={state.mpMax} color="#3b82f6" />
          <Orb label="SP" v={state.sp} m={state.spMax} color="#10b981" />
          <Orb
            label="XP"
            v={levelProgress.current}
            m={levelProgress.needed}
            color="#22d3ee"
            secondary={`${state.xp}`}
          />
        </div>
        {state.defeats > 0 && (
          <div className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-200">
            ⚔ {state.defeats} slain
          </div>
        )}
      </div>

      {lastReward && (
        <div className="pointer-events-none fixed left-1/2 top-[86px] z-[80] -translate-x-1/2 rounded-2xl border border-emerald-300/30 bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-100 shadow-2xl backdrop-blur-xl">
          {lastReward}
        </div>
      )}
    </>
  )
}

function Orb({
  label,
  v,
  m,
  color,
  secondary,
}: {
  label: string
  v: number
  m: number
  color: string
  secondary?: string
}) {
  const pct = Math.max(0, Math.min(1, v / Math.max(1, m)))
  const size = 56
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(0,0,0,.6)"
          strokeWidth="6"
          fill="rgba(0,0,0,.65)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="6"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}aa)`, transition: 'stroke-dashoffset 200ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <div className="text-[10px] font-bold leading-none" style={{ color }}>
          {label}
        </div>
        <div className="text-[10px] font-bold leading-tight">{Math.round(v)}</div>
        {secondary && (
          <div className="text-[8px] font-bold leading-none text-white/50">{secondary}</div>
        )}
      </div>
    </div>
  )
}
