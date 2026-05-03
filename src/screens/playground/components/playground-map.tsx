import { PLAYGROUND_WORLDS, type PlaygroundWorldId } from '../lib/playground-rpg'

type Props = {
  open: boolean
  onClose: () => void
  currentWorld: PlaygroundWorldId
  unlocked: PlaygroundWorldId[]
  onTravel: (id: PlaygroundWorldId) => void
}

const WORLD_LAYOUT: Record<PlaygroundWorldId, { x: number; y: number; lore: string }> = {
  agora: { x: 50, y: 50, lore: 'Starting plaza. Marble pillars, agent citizens, the first portal.' },
  forge: { x: 78, y: 38, lore: 'Generated cyberpunk workshop. Where prompts harden into tools.' },
  grove: { x: 20, y: 35, lore: 'Bioluminescent forest. Music, rituals, community quests.' },
  oracle: { x: 22, y: 75, lore: 'Quiet archive of lore and memory. Floating crystals.' },
  arena: { x: 80, y: 75, lore: 'Colosseum for model duels. The Kimi Sigil waits inside.' },
}

const PATHS: Array<[PlaygroundWorldId, PlaygroundWorldId]> = [
  ['agora', 'forge'],
  ['agora', 'grove'],
  ['agora', 'oracle'],
  ['agora', 'arena'],
  ['forge', 'arena'],
  ['grove', 'oracle'],
]

export function PlaygroundMap({ open, onClose, currentWorld, unlocked, onTravel }: Props) {
  if (!open) return null
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl border-2 text-white shadow-2xl"
        style={{
          borderColor: 'rgba(56,189,248,.5)',
          background: 'linear-gradient(180deg, #050a14, #000)',
          boxShadow: '0 0 60px rgba(56,189,248,.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-cyan-400/30 bg-cyan-400/10 px-4 py-3">
          <div>
            <div className="text-base font-bold text-cyan-300" style={{ textShadow: '0 0 10px rgba(56,189,248,.6)' }}>
              World Map · Hermes Realm
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/55">Press M to close</div>
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-cyan-200/65 hover:bg-white/10"
          >
            Esc
          </button>
        </div>

        <div className="relative aspect-[16/9] w-full overflow-hidden">
          {/* Background grid */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(56,189,248,.18), transparent 60%), repeating-linear-gradient(0deg, rgba(56,189,248,.06) 0 2px, transparent 2px 80px), repeating-linear-gradient(90deg, rgba(56,189,248,.06) 0 2px, transparent 2px 80px)',
            }}
          />

          {/* Connection paths */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {PATHS.map(([from, to], i) => {
              const a = WORLD_LAYOUT[from]
              const b = WORLD_LAYOUT[to]
              const both = unlocked.includes(from) && unlocked.includes(to)
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={both ? 'rgba(56,189,248,.5)' : 'rgba(255,255,255,.12)'}
                  strokeWidth={0.4}
                  strokeDasharray={both ? '0' : '1.4'}
                />
              )
            })}
          </svg>

          {/* World nodes */}
          {PLAYGROUND_WORLDS.map((w) => {
            const layout = WORLD_LAYOUT[w.id]
            const locked = !unlocked.includes(w.id)
            const active = w.id === currentWorld
            return (
              <button
                key={w.id}
                disabled={locked}
                onClick={() => onTravel(w.id)}
                className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center disabled:cursor-not-allowed"
                style={{ left: `${layout.x}%`, top: `${layout.y}%` }}
              >
                <div
                  className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 transition-transform group-hover:scale-110 group-disabled:opacity-40"
                  style={{
                    borderColor: active ? w.accent : locked ? 'rgba(255,255,255,.15)' : w.accent + '88',
                    background: active ? `${w.accent}33` : locked ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.45)',
                    boxShadow: active ? `0 0 30px ${w.accent}` : `0 0 14px ${w.accent}55`,
                  }}
                >
                  <span className="text-xl">{locked ? '🔒' : active ? '●' : '◯'}</span>
                </div>
                <div
                  className="mt-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{
                    background: 'rgba(0,0,0,.7)',
                    color: locked ? 'rgba(255,255,255,.45)' : w.accent,
                    border: `1px solid ${w.accent}55`,
                  }}
                >
                  {w.name}
                </div>
                <div className="mt-1 max-w-[170px] rounded bg-black/65 px-2 py-1 text-[10px] text-white/65 opacity-0 transition-opacity group-hover:opacity-100">
                  {layout.lore}
                </div>
              </button>
            )
          })}
        </div>

        <div className="border-t border-white/10 bg-black/50 p-3 text-[11px] text-white/60">
          <span className="text-cyan-300">{unlocked.length}</span> of {PLAYGROUND_WORLDS.length} realms unlocked. Click a node to travel.
        </div>
      </div>
    </div>
  )
}
