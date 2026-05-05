import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspace-store'
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
  objectiveTarget?: string | null
}

// Fixed positions for known targets (world coords). Used to compute the
// objective arrow direction from the player's current position.
const TARGET_POS: Record<string, Record<string, [number, number]>> = {
  training: {
    athena: [-10.5, 7.2],
    iris: [6.2, 0.4],
    pan: [11.2, -7.5],
    nike: [-4.8, -4.8],
    shopkeeper: [-14.5, -10.2],
    'archive-podium': [6, 0],
    'forge-gate': [14, -10],
    'training-blade': [-14.5, -10.2],
    'novice-cloak': [-14.5, -10.2],
    'hermes-sigil': [-14.5, -10.2],
    'build-demo': [11.2, -7.5],
    'glitch-wisp': [-4.8, -4],
    'wisp-core': [-4.8, -4],
  },
  agora: {
    athena: [-5, 2],
    apollo: [5, 3],
    iris: [-3, -5],
    nike: [6, -4],
    shopkeeper: [-3, 9.5],
    'awakening-agora': [-8, -3],
  },
  forge: { pan: [-4, 0], chronos: [4, 0], 'enter-forge': [0, -7], 'forge-shard': [0, -7] },
  grove: { pan: [-4, 1], apollo: [4, 0], artemis: [0, -5], 'grove-ritual': [-6, -4], 'song-fragment': [-6, -4] },
  oracle: { athena: [-3, -2], chronos: [3, -2], eros: [0, 4], 'oracle-riddle': [5, -3] },
  arena: { nike: [-3, 4], hermes: [3, 4], chronos: [0, -5], 'arena-duel': [0, 0], 'kimi-sigil': [0, 0] },
}

export function PlaygroundHud({
  state,
  activeQuestTitle,
  objectiveLabel,
  objectiveHint,
  levelProgress,
  worldAccent,
  toasts,
  currentWorld,
  objectiveTarget,
}: HudProps) {
  const { playerProfile } = state
  const sidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed)
  const chromeLeft = sidebarCollapsed ? 'min(120px, 9vw)' : '320px'

  // Compute heading angle from player to objective target (in degrees, screen up = 0).
  // Throttled to ~10 Hz so we don't re-render the HUD on every animation frame.
  const [arrowDeg, setArrowDeg] = useState<number | null>(null)
  useEffect(() => {
    if (!objectiveTarget) { setArrowDeg(null); return }
    const target = TARGET_POS[currentWorld]?.[objectiveTarget]
    if (!target) { setArrowDeg(null); return }
    const compute = () => {
      const player = (window as any).__hermesPlaygroundPlayerPos as { x: number; z: number } | undefined
      const px = player?.x ?? 0
      const pz = player?.z ?? 0
      const dx = target[0] - px
      const dz = target[1] - pz
      // World uses (x, z) plane. Screen-up corresponds to -z. atan2(dx, -dz)
      // returns 0° when target is straight ahead (north).
      return Math.atan2(dx, -dz) * (180 / Math.PI)
    }
    setArrowDeg(compute())
    const id = window.setInterval(() => setArrowDeg(compute()), 100)
    return () => window.clearInterval(id)
  }, [objectiveTarget, currentWorld])
  return (
    <>
      {/* Combined player card: avatar portrait + name + level + title + HP/MP/SP/XP */}
      {/* Sits to the right of the side rail (left:140 instead of left:3) so it doesn't crowd the chat. */}
      <div className="pointer-events-auto fixed top-3 z-[70] flex max-w-[360px] flex-col items-start gap-2" style={{ left: chromeLeft }}>
        <div
          className="rounded-3xl border px-3 py-2.5 text-white shadow-2xl backdrop-blur-xl"
          style={{
            borderColor: `${worldAccent}38`,
            background: `linear-gradient(180deg, rgba(16,22,31,.92), rgba(3,7,18,.88)), radial-gradient(circle at 20% 0%, ${worldAccent}24, transparent 55%)`,
            boxShadow: `0 0 24px ${worldAccent}30, inset 0 1px 0 rgba(255,255,255,.08), 0 14px 42px rgba(0,0,0,.58)`,
          }}
        >
          <div className="flex items-center gap-3">
            {/* Avatar portrait + level badge */}
            <div className="relative">
              <div
                className="h-14 w-14 overflow-hidden rounded-full border-2"
                style={{
                  borderColor: worldAccent,
                  background: `linear-gradient(180deg, ${playerProfile.avatarConfig.outfitAccent || worldAccent}33, ${playerProfile.avatarConfig.outfit || '#0f172a'})`,
                  boxShadow: `0 0 12px ${worldAccent}66`,
                }}
              >
                <img
                  src={`/avatars/${playerProfile.avatarConfig.portrait || 'hermes'}.png`}
                  alt={playerProfile.displayName || 'Builder'}
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              </div>
              <div
                className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold"
                style={{
                  borderColor: '#0b1320',
                  background: worldAccent,
                  color: '#0b1320',
                }}
              >
                {playerProfile.level}
              </div>
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
      </div>

      {/* Current Objective — top-center banner with arrow pointing toward the objective */}
      <div className="pointer-events-auto fixed left-1/2 top-3 z-[71] flex w-[min(92vw,460px)] -translate-x-1/2 flex-col items-center">
        <div
          className="flex w-full items-center gap-2 rounded-3xl border px-3 py-2 text-white shadow-2xl backdrop-blur-xl"
          style={{
            borderColor: `${worldAccent}42`,
            background: `linear-gradient(180deg, rgba(16,22,31,.94), rgba(3,7,18,.9)), radial-gradient(circle at 0% 0%, ${worldAccent}22, transparent 55%)`,
            boxShadow: `0 0 24px ${worldAccent}32, inset 0 1px 0 rgba(255,255,255,.08), 0 14px 42px rgba(0,0,0,.58)`,
          }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border"
            style={{ borderColor: `${worldAccent}65`, background: `linear-gradient(180deg, ${worldAccent}24, rgba(255,255,255,.04))`, boxShadow: `inset 0 1px 0 rgba(255,255,255,.08), 0 0 16px ${worldAccent}24` }}
            title={arrowDeg != null ? 'Pointing toward objective' : 'Objective'}
          >
            <span
              className="text-[18px] leading-none"
              style={{
                color: worldAccent,
                transform: `rotate(${arrowDeg != null ? arrowDeg - 90 : -45}deg)`,
                transition: 'transform 220ms cubic-bezier(.2,.8,.2,1)',
                filter: arrowDeg != null ? `drop-shadow(0 0 6px ${worldAccent})` : undefined,
              }}
              aria-hidden
            >➤</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/45">Objective</span>
              <span className="truncate text-[12px] font-bold" style={{ color: worldAccent }}>{activeQuestTitle}</span>
            </div>
            <div className="truncate text-[11px] leading-snug text-white/85">{objectiveLabel}</div>
            {objectiveHint && <div className="truncate text-[10px] text-white/55">{objectiveHint}</div>}
          </div>
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
