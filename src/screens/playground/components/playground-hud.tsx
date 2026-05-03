import {
  itemById,
  PLAYGROUND_ITEMS,
  PLAYGROUND_SKILLS,
  type PlaygroundItemId,
  type PlaygroundWorldId,
} from '../lib/playground-rpg'
import type { PlaygroundRpgState } from '../hooks/use-playground-rpg'

type HudProps = {
  state: PlaygroundRpgState
  activeQuestTitle: string
  levelProgress: { current: number; needed: number; pct: number }
  currentWorld: PlaygroundWorldId
  worlds: Array<{ id: PlaygroundWorldId; name: string; tagline: string; accent: string }>
  onSelectWorld: (world: PlaygroundWorldId) => void
  onReset?: () => void
  lastReward?: string | null
}

export function PlaygroundHud({
  state,
  activeQuestTitle,
  levelProgress,
  currentWorld,
  worlds,
  onSelectWorld,
  onReset,
  lastReward,
}: HudProps) {
  return (
    <>
      <div className="pointer-events-auto fixed left-[92px] top-3 z-[70] w-[300px] rounded-2xl border-2 border-white/15 bg-gradient-to-b from-[#0b1320]/90 to-black/85 p-3 text-white shadow-2xl backdrop-blur-xl md:left-[104px]" style={{boxShadow:'0 0 20px rgba(56,189,248,.25), 0 12px 40px rgba(0,0,0,.6)'}}>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold" style={{textShadow:'0 0 8px rgba(56,189,248,.6)'}}>Level {state.level} Worldsmith</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">{activeQuestTitle}</div>
          </div>
          <button onClick={onReset} className="rounded px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/45 hover:bg-white/10">Reset</button>
        </div>
        {/* HP */}
        <Bar label="HP" value={state.hp} max={state.hpMax} color="#ef4444" />
        <Bar label="MP" value={state.mp} max={state.mpMax} color="#3b82f6" />
        <Bar label="SP" value={state.sp} max={state.spMax} color="#10b981" />
        <Bar label="XP" value={levelProgress.current} max={levelProgress.needed} color="#22d3ee" />
        {state.defeats > 0 && (
          <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-amber-300/80">Monsters slain: {state.defeats}</div>
        )}
      </div>

      <div className="pointer-events-auto fixed bottom-3 left-[92px] z-[70] flex max-w-[calc(100vw-120px)] gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/55 p-2 text-white shadow-2xl backdrop-blur-xl md:left-[104px]">
        {PLAYGROUND_SKILLS.map((skill) => {
          const xp = state.skillXp[skill.id] ?? 0
          const level = Math.floor(xp / 100) + 1
          return (
            <div key={skill.id} className="min-w-[88px] rounded-xl border border-white/10 bg-white/5 p-2">
              <div className="text-lg">{skill.icon}</div>
              <div className="text-[10px] font-semibold leading-tight">{skill.name}</div>
              <div className="text-[9px] text-white/45">Lv. {level}</div>
            </div>
          )
        })}
      </div>

      <div className="pointer-events-auto fixed right-3 bottom-3 z-[70] w-[300px] rounded-2xl border border-white/10 bg-black/55 p-3 text-white shadow-2xl backdrop-blur-xl">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">World Map</div>
        <div className="space-y-1.5">
          {worlds.map((world) => {
            const unlocked = state.unlockedWorlds.includes(world.id)
            const active = world.id === currentWorld
            return (
              <button
                key={world.id}
                disabled={!unlocked}
                onClick={() => onSelectWorld(world.id)}
                className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-40"
                style={{
                  borderColor: active ? world.accent : 'rgba(255,255,255,.1)',
                  background: active ? `${world.accent}22` : 'rgba(255,255,255,.04)',
                }}
              >
                <div>
                  <div className="text-xs font-semibold">{world.name}</div>
                  <div className="text-[10px] text-white/45">{unlocked ? world.tagline : 'Locked'}</div>
                </div>
                <div className="text-sm">{unlocked ? (active ? '●' : '→') : '🔒'}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="pointer-events-auto fixed right-3 top-[152px] z-[70] w-[300px] rounded-2xl border border-white/10 bg-black/55 p-3 text-white shadow-2xl backdrop-blur-xl">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Inventory</div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => {
            const id = state.inventory[i] as PlaygroundItemId | undefined
            const item = id ? itemById(id) : undefined
            return (
              <div key={i} title={item?.description ?? 'Empty slot'} className="flex h-14 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/5 text-center">
                {item ? (
                  <>
                    <div className="text-xl">{item.icon}</div>
                    <div className="max-w-[56px] truncate text-[8px] text-white/55">{item.name}</div>
                  </>
                ) : (
                  <div className="text-white/20">＋</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {lastReward && (
        <div className="pointer-events-none fixed left-1/2 top-[86px] z-[80] -translate-x-1/2 rounded-2xl border border-emerald-300/30 bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-100 shadow-2xl backdrop-blur-xl">
          {lastReward}
        </div>
      )}
    </>
  )
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.14em] text-white/55">
        <span style={{ color }}>{label}</span>
        <span>{value}/{max}</span>
      </div>
      <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}aa, ${color})`, boxShadow: `0 0 6px ${color}66` }} />
      </div>
    </div>
  )
}
