type MapZone = {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  accent: string
  description: string
}

type MapPanelProps = {
  currentZoneId?: string
  playerPosition?: { x: number; y: number }
}

const ZONES: MapZone[] = [
  { id: 'agora', name: 'Agora Commons', x: 42, y: 38, w: 24, h: 22, accent: '#d9b35f', description: 'Market plaza and social hub.' },
  { id: 'forge', name: 'The Forge', x: 68, y: 18, w: 20, h: 21, accent: '#22d3ee', description: 'Crafting labs and prompt anvils.' },
  { id: 'grove', name: 'Grove of Echoes', x: 14, y: 26, w: 24, h: 24, accent: '#34d399', description: 'Bioluminescent music quests.' },
  { id: 'oracle', name: 'Oracle Temple', x: 20, y: 62, w: 24, h: 21, accent: '#a78bfa', description: 'Lore archive and memory shrines.' },
  { id: 'arena', name: 'Benchmark Arena', x: 68, y: 62, w: 22, h: 22, accent: '#fb7185', description: 'Model duels and ranked trials.' },
  { id: 'training', name: 'Training Grounds', x: 41, y: 69, w: 19, h: 16, accent: '#5eead4', description: 'Starter circle and first sword.' },
]

export function MapPanel({ currentZoneId = 'agora', playerPosition = { x: 53, y: 48 } }: MapPanelProps) {
  return (
    <section
      role="dialog"
      aria-label="World map"
      className="relative min-h-[min(720px,86vh)] w-[min(94vw,980px)] overflow-hidden rounded-[32px] border border-[#d9b35f]/45 bg-[linear-gradient(180deg,rgba(20,15,9,.97),rgba(3,5,12,.96))] text-[#f9e7b5] shadow-[0_32px_110px_rgba(0,0,0,.72),inset_0_1px_0_rgba(255,255,255,.10)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#d9b35f]/25 bg-black/22 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#d9b35f]/70">Cartographer View</p>
          <h2 className="font-serif text-2xl font-black text-[#ffe7a3]">World Map</h2>
        </div>
        <span className="rounded-full border border-[#d9b35f]/30 bg-[#d9b35f]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#d9b35f]">Hermes Realm</span>
      </div>

      <div className="relative h-[min(610px,74vh)] overflow-hidden bg-[radial-gradient(circle_at_50%_44%,rgba(217,179,95,.14),transparent_34%),linear-gradient(120deg,rgba(34,211,238,.08),transparent_38%),linear-gradient(230deg,rgba(168,85,247,.10),transparent_36%)]">
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              'linear-gradient(rgba(217,179,95,.13) 1px, transparent 1px), linear-gradient(90deg, rgba(217,179,95,.13) 1px, transparent 1px)',
            backgroundSize: '54px 54px',
          }}
        />
        <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M21 72 C38 51, 45 57, 54 47 S76 31, 79 26" stroke="rgba(217,179,95,.44)" strokeWidth=".8" strokeDasharray="2 2" fill="none" />
          <path d="M25 40 C42 30, 47 42, 54 47 S75 70, 80 72" stroke="rgba(94,234,212,.28)" strokeWidth=".6" fill="none" />
          <path d="M32 71 C37 78, 44 78, 51 77" stroke="rgba(255,255,255,.16)" strokeWidth=".55" fill="none" />
        </svg>

        {ZONES.map((zone) => {
          const current = zone.id === currentZoneId
          return (
            <button
              key={zone.id}
              aria-label={`Zone highlight ${zone.name}`}
              data-current-zone={current ? 'true' : 'false'}
              className="group absolute rounded-[28px] border px-3 py-2 text-left transition duration-200 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[#fbbf24]/60"
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.w}%`,
                height: `${zone.h}%`,
                borderColor: current ? zone.accent : `${zone.accent}88`,
                background: current
                  ? `radial-gradient(circle at 50% 15%, ${zone.accent}42, rgba(0,0,0,.48) 64%)`
                  : `linear-gradient(180deg, ${zone.accent}18, rgba(0,0,0,.46))`,
                boxShadow: current ? `0 0 42px ${zone.accent}70, inset 0 1px 0 rgba(255,255,255,.11)` : `0 0 18px ${zone.accent}24`,
              }}
            >
              <span className="block text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: zone.accent }}>{zone.name}</span>
              <span className="mt-1 hidden text-[10px] leading-snug text-white/64 sm:block">{zone.description}</span>
            </button>
          )
        })}

        <div
          aria-label="Current player position"
          className="absolute z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#fde68a] bg-[#fbbf24] shadow-[0_0_25px_rgba(251,191,36,.9)]"
          style={{ left: `${playerPosition.x}%`, top: `${playerPosition.y}%` }}
        >
          <span className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border border-[#fbbf24]/45" />
          <span className="absolute left-1/2 top-[calc(100%+.35rem)] -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#fde68a]">You</span>
        </div>
      </div>
    </section>
  )
}
