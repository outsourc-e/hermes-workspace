import { useEffect, useState } from 'react'
import { Toast, rarityForPlaygroundToast } from './toast'
import type { PlaygroundRpgState, RewardToast } from '../hooks/use-playground-rpg'
import type { PlaygroundWorldId } from '../lib/playground-rpg'
import { useWorkspaceStore } from '@/stores/workspace-store'

type HudProps = {
  state: PlaygroundRpgState
  activeQuestTitle: string
  objectiveLabel: string
  objectiveHint?: string
  levelProgress: { current: number; needed: number; pct: number }
  currentWorld: PlaygroundWorldId
  worldAccent: string
  toasts: Array<RewardToast>
  objectiveTarget?: string | null
}

// Fixed positions for known targets (world coords). Used to compute the
// objective arrow direction from the player's current position.
const TARGET_POS: Partial<Record<PlaygroundWorldId, Partial<Record<string, [number, number]>>>> = {
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

const HUD = {
  gold: '#F1C56D',
  bronze: '#B8862B',
  parchment: '#F4E9D3',
  verdigris: '#2E6A63',
  midnight: '#0F1622',
  slate: '#1B2433',
  stone: '#8A8F98',
  obsidian: '#0A0D12',
}

const HUD_SIGIL_SRC = '/assets/hermesworld/art/hermesworld-sigil.png'
const MOCKUP_LEFT = 'clamp(18px, 4.7vw, 56px)'
const MOCKUP_TOP = 'clamp(12px, 1.55vw, 18px)'

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
  const isPublicPlayRoute = typeof window !== 'undefined' && window.location.pathname.includes('/play')
  const chromeLeft = isPublicPlayRoute ? MOCKUP_LEFT : sidebarCollapsed ? 'min(120px, 9vw)' : '320px'
  const hudAccent = currentWorld === 'agora' ? HUD.gold : worldAccent
  const coinCount = 128
  const title = playerProfile.titlesUnlocked.at(-1) || (currentWorld === 'agora' ? 'Agora Initiate' : 'Training Grounds')
  const panelBg = `linear-gradient(180deg, rgba(15,22,34,.92), rgba(10,13,18,.84)), radial-gradient(circle at 20% 0%, ${hudAccent}2b, transparent 58%), radial-gradient(circle at 100% 100%, ${HUD.verdigris}35, transparent 62%)`
  const panelShadow = `0 18px 42px rgba(0,0,0,.58), 0 0 0 1px ${HUD.obsidian}, 0 0 28px ${hudAccent}30, inset 0 1px 0 rgba(244,233,211,.18)`

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
      <style>{`
        .hermes-hud-rune-frame::before { content: ''; position: absolute; inset: 5px; border: 1px solid rgba(241,197,109,.24); border-radius: inherit; pointer-events: none; }
        .hermes-hud-orb::after { content: ''; position: absolute; inset: 9px 12px auto; height: 18px; border-radius: 999px; background: linear-gradient(180deg, rgba(255,255,255,.38), rgba(255,255,255,0)); filter: blur(.2px); pointer-events: none; }
        @media (max-width: 760px) { .hermes-hud-player-cluster { transform: scale(.78); transform-origin: top left; } .hermes-hud-objective { display: none; } }
      `}</style>
      {/* Mockup top-left: HP/MP glass orbs + level/coin plaque, placed at 56x18 on 1200px art. */}
      <div
        className="hermes-hud-player-cluster pointer-events-auto fixed z-[72] flex items-start gap-3 text-white"
        style={{ left: chromeLeft, top: MOCKUP_TOP }}
      >
        <div className="relative flex items-center gap-2">
          <ResourceOrb label="HP" v={state.hp} m={state.hpMax} color="#B03A30" fillA="#E05745" fillB="#6C1518" />
          <ResourceOrb label="MP" v={state.mp} m={state.mpMax} color="#2E6A63" fillA="#5EB8AB" fillB="#133D47" />
        </div>
        <div
          className="hermes-hud-rune-frame relative mt-1 min-w-[184px] rounded-[24px] border px-3 py-2 backdrop-blur-xl"
          style={{
            borderColor: `${hudAccent}78`,
            background: panelBg,
            boxShadow: panelShadow,
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border"
              style={{
                borderColor: `${hudAccent}bb`,
                background: `radial-gradient(circle at 35% 30%, ${HUD.parchment}55, transparent 28%), linear-gradient(180deg, ${HUD.bronze}, ${HUD.obsidian})`,
                boxShadow: `0 0 18px ${hudAccent}44, inset 0 0 0 2px ${HUD.obsidian}`,
              }}
            >
              <img src={HUD_SIGIL_SRC} alt="" className="h-9 w-9 object-contain opacity-90" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]" style={{ borderColor: `${hudAccent}66`, color: HUD.obsidian, background: `linear-gradient(180deg, ${HUD.gold}, ${HUD.bronze})` }}>LV {playerProfile.level}</span>
                <span className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: HUD.parchment }}>{playerProfile.displayName || 'Builder'}</span>
              </div>
              <div className="mt-1 max-w-[126px] truncate text-[9px] uppercase tracking-[0.18em]" style={{ color: HUD.stone }}>{title}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 w-[88px] overflow-hidden rounded-full" style={{ background: 'rgba(244,233,211,.12)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.45)' }}>
                  <div className="h-full rounded-full" style={{ width: `${levelProgress.pct}%`, background: `linear-gradient(90deg, ${HUD.bronze}, ${HUD.gold})`, boxShadow: `0 0 8px ${hudAccent}88` }} />
                </div>
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-black" style={{ borderColor: `${HUD.bronze}aa`, color: HUD.parchment, background: 'rgba(10,13,18,.72)' }}>◉ {coinCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Current Objective — compact parchment/gold banner, high enough to leave the scene open. */}
      <div className="hermes-hud-objective pointer-events-auto fixed left-1/2 top-[18px] z-[71] flex w-[min(38vw,430px)] -translate-x-1/2 flex-col items-center">
        <div
          className="hermes-hud-rune-frame relative flex w-full items-center gap-2 rounded-[22px] border px-3 py-2 text-white shadow-2xl backdrop-blur-xl"
          style={{
            borderColor: `${hudAccent}70`,
            background: panelBg,
            boxShadow: panelShadow,
          }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
            style={{ borderColor: `${hudAccent}99`, background: `linear-gradient(180deg, ${HUD.obsidian}, ${HUD.slate})`, boxShadow: `0 0 14px ${hudAccent}3d, inset 0 0 0 1px rgba(244,233,211,.08)` }}
            title={arrowDeg != null ? 'Pointing toward objective' : 'Objective'}
          >
            <span
              className="text-[18px] leading-none"
              style={{
                color: hudAccent,
                transform: `rotate(${arrowDeg != null ? arrowDeg - 90 : -45}deg)`,
                transition: 'transform 220ms cubic-bezier(.2,.8,.2,1)',
                filter: arrowDeg != null ? `drop-shadow(0 0 6px ${hudAccent})` : undefined,
              }}
              aria-hidden
            >➤</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: HUD.stone }}>Quest</span>
              <span className="truncate text-[12px] font-black" style={{ color: hudAccent }}>{activeQuestTitle}</span>
            </div>
            <div className="truncate text-[11px] leading-snug" style={{ color: HUD.parchment }}>{objectiveLabel}</div>
            {objectiveHint && <div className="truncate text-[10px]" style={{ color: `${HUD.parchment}99` }}>{objectiveHint}</div>}
          </div>
        </div>
      </div>

      <div className="hermes-toast-lane pointer-events-none fixed left-1/2 top-[154px] z-[80] flex max-h-[30vh] w-[min(92vw,440px)] -translate-x-1/2 flex-col gap-2 overflow-visible md:top-[96px] md:max-h-[36vh]">
        {toasts.map((toast) => (
          <Toast key={toast.id} title={toast.title} rarity={rarityForPlaygroundToast(toast.kind)}>
            {toast.body}
          </Toast>
        ))}
      </div>
    </>
  )
}

function ResourceOrb({
  label,
  v,
  m,
  color,
  fillA,
  fillB,
}: {
  label: string
  v: number
  m: number
  color: string
  fillA: string
  fillB: string
}) {
  const pct = Math.max(0, Math.min(1, v / Math.max(1, m)))
  const size = 74
  const radius = 31
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)
  return (
    <div className="hermes-hud-orb relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 rotate-[-90deg]">
        <defs>
          <radialGradient id={`orb-${label}`} cx="36%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#fff7d6" stopOpacity="0.78" />
            <stop offset="30%" stopColor={fillA} />
            <stop offset="100%" stopColor={fillB} />
          </radialGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius + 4} stroke={HUD.obsidian} strokeWidth="7" fill={`url(#orb-${label})`} />
        <circle cx={size / 2} cy={size / 2} r={radius + 4} stroke={HUD.bronze} strokeWidth="2" fill="transparent" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="5"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 7px ${color}cc)`, transition: 'stroke-dashoffset 200ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1 text-center">
        <div className="text-[9px] font-black leading-none tracking-[0.16em]" style={{ color: HUD.parchment, textShadow: '0 1px 3px rgba(0,0,0,.9)' }}>
          {label}
        </div>
        <div className="mt-0.5 text-[12px] font-black leading-none" style={{ color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.95)' }}>{Math.round(v)}</div>
      </div>
    </div>
  )
}
