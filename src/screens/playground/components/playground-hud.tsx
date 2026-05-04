import type { PlaygroundWorldId } from '../lib/playground-rpg'
import type { PlaygroundRpgState, RewardToast } from '../hooks/use-playground-rpg'

type HudProps = {
  state: PlaygroundRpgState
  activeQuestTitle: string
  objectiveLabel: string
  objectiveHint?: string
  levelProgress: { current: number; needed: number; pct: number }
  currentWorld: PlaygroundWorldId
  worldAccent: string
  toasts: RewardToast[]
}

export function PlaygroundHud({
  state,
  activeQuestTitle,
  objectiveLabel,
  objectiveHint,
  levelProgress,
  worldAccent,
  toasts,
}: HudProps) {
  const { playerProfile } = state
  return (
    <>
      {/* Combined player card: avatar + name + level + title + HP/MP/SP/XP */}
      <div className="pointer-events-auto fixed left-3 top-3 z-[70] flex max-w-[360px] flex-col items-start gap-2">
        <div
          className="rounded-2xl border-2 border-white/15 bg-gradient-to-b from-[#0b1320]/92 to-black/86 px-3 py-2.5 text-white shadow-2xl backdrop-blur-xl"
          style={{ boxShadow: `0 0 18px ${worldAccent}33, 0 12px 36px rgba(0,0,0,.55)` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full border-2 text-sm font-bold"
              style={{
                borderColor: worldAccent,
                background: `${worldAccent}22`,
                color: worldAccent,
                boxShadow: `0 0 10px ${worldAccent}66`,
              }}
            >
              {playerProfile.level}
            </div>
            <div className="leading-tight">
              <div className="text-[13px] font-bold">
                {playerProfile.displayName || 'New Builder'}
              </div>
              <div className="max-w-[220px] truncate text-[9px] uppercase tracking-[0.16em] text-white/45">
                {playerProfile.titlesUnlocked.at(-1) || 'Training Grounds'}
              </div>
              <div className="mt-0.5 text-[9px] text-white/40">
                XP {playerProfile.xp} · next {Math.max(0, levelProgress.needed - levelProgress.current)}
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-1.5">
            <Orb label="HP" v={state.hp} m={state.hpMax} color="#ef4444" />
            <Orb label="MP" v={state.mp} m={state.mpMax} color="#3b82f6" />
            <Orb label="SP" v={state.sp} m={state.spMax} color="#10b981" />
            <Orb label="XP" v={levelProgress.current} m={levelProgress.needed} color="#22d3ee" />
          </div>
        </div>

        {/* Compact objective panel directly under the player card */}
        <div
          className="w-full rounded-2xl border border-white/10 bg-black/70 px-3 py-2 shadow-xl backdrop-blur-xl"
          style={{ borderColor: `${worldAccent}33` }}
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/45">Current Objective</div>
          <div className="mt-0.5 text-[12px] font-bold" style={{ color: worldAccent }}>
            {activeQuestTitle}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-white/85">{objectiveLabel}</div>
          {objectiveHint && (
            <div className="mt-0.5 text-[10px] text-white/55">{objectiveHint}</div>
          )}
        </div>
      </div>

      <div className="pointer-events-none fixed left-1/2 top-[154px] z-[80] flex max-h-[30vh] w-[min(92vw,440px)] -translate-x-1/2 flex-col gap-2 overflow-visible md:top-[96px] md:max-h-[36vh]">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="rounded-2xl border px-4 py-2 text-sm font-semibold text-white shadow-2xl backdrop-blur-xl"
            style={{
              borderColor:
                toast.kind === 'title'
                  ? 'rgba(250,204,21,.35)'
                  : toast.kind === 'item'
                    ? 'rgba(34,211,238,.35)'
                    : toast.kind === 'quest'
                      ? 'rgba(16,185,129,.35)'
                      : 'rgba(255,255,255,.2)',
              background:
                toast.kind === 'title'
                  ? 'rgba(250,204,21,.16)'
                  : toast.kind === 'item'
                    ? 'rgba(34,211,238,.16)'
                    : toast.kind === 'quest'
                      ? 'rgba(16,185,129,.16)'
                      : 'rgba(255,255,255,.12)',
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/70">{toast.title}</div>
            <div>{toast.body}</div>
          </div>
        ))}
      </div>
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
        {secondary && <div className="text-[8px] font-bold leading-none text-white/50">{secondary}</div>}
      </div>
    </div>
  )
}
