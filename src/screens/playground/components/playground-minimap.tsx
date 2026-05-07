import { botsFor } from '../lib/playground-bots'
import type { PlaygroundWorldId } from '../lib/playground-rpg'

const NPC_POSITIONS: Record<PlaygroundWorldId, Array<{ x: number; z: number; color: string }>> = {
  training: [
    { x: -9, z: 7, color: '#a78bfa' },
    { x: -3, z: 0, color: '#22d3ee' },
    { x: 8, z: -4, color: '#f59e0b' },
  ],
  agora: [
    { x: -5, z: 2, color: '#F1C56D' },
    { x: 5, z: 3, color: '#B8862B' },
    { x: -3, z: -5, color: '#2E6A63' },
    { x: 6, z: -4, color: '#F4E9D3' },
  ],
  forge: [
    { x: -4, z: 0, color: '#34d399' },
    { x: 4, z: 0, color: '#facc15' },
  ],
  grove: [
    { x: -4, z: 1, color: '#34d399' },
    { x: 4, z: 0, color: '#f59e0b' },
    { x: 0, z: -5, color: '#9ca3af' },
  ],
  oracle: [
    { x: -3, z: -2, color: '#a78bfa' },
    { x: 3, z: -2, color: '#facc15' },
    { x: 0, z: 4, color: '#f472b6' },
  ],
  arena: [
    { x: -3, z: 4, color: '#fb7185' },
    { x: 3, z: 4, color: '#2dd4bf' },
    { x: 0, z: -5, color: '#facc15' },
  ],
}

const PORTAL_POSITION: Record<PlaygroundWorldId, { x: number; z: number }> = {
  training: { x: 14, z: -10 },
  agora: { x: 10, z: -2 },
  forge: { x: 10, z: -2 },
  grove: { x: 10, z: -2 },
  oracle: { x: 10, z: -2 },
  arena: { x: 10, z: -2 },
}

type Props = {
  worldId: PlaygroundWorldId
  worldName: string
  worldAccent: string
}

export function PlaygroundMinimap({ worldId, worldName, worldAccent }: Props) {
  const npcs = NPC_POSITIONS[worldId]
  const bots = botsFor(worldId)
  const frameAccent = worldId === 'agora' ? '#F1C56D' : worldAccent
  // Map world coords (-30..30) to minimap pixels (0..150)
  const map = (v: number) => 75 + (v / 30) * 70

  return (
    <div
      className="pointer-events-auto fixed right-[18px] top-[18px] z-[70] rounded-[22px] border p-2 text-white shadow-2xl backdrop-blur-xl"
      style={{
        borderColor: `${frameAccent}72`,
        background: 'linear-gradient(180deg, rgba(15,22,34,.9), rgba(10,13,18,.84)), radial-gradient(circle at 50% 0%, rgba(241,197,109,.16), transparent 62%)',
        boxShadow: `0 18px 42px rgba(0,0,0,.62), 0 0 24px ${frameAccent}2f, inset 0 1px 0 rgba(244,233,211,.12)`,
      }}
    >
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: frameAccent }}>{worldName}</span>
        <span style={{ borderColor: `${frameAccent}55`, background: "rgba(244,233,211,.06)" }} className="rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#F4E9D3]/70">M</span>
      </div>
      <div
        className="relative h-[148px] w-[148px] overflow-hidden rounded-[14px] border"
        style={{
          borderColor: `${frameAccent}40`,
          background:
            'radial-gradient(circle at 50% 50%, rgba(241,197,109,.18), rgba(46,106,99,.13) 42%, rgba(10,13,18,.86) 72%), repeating-linear-gradient(0deg, rgba(244,233,211,.045) 0 1px, transparent 1px 18px), repeating-linear-gradient(90deg, rgba(244,233,211,.045) 0 1px, transparent 1px 18px)',
        }}
      >
        {/* Center medallion */}
        <div
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{ left: 75, top: 75, borderColor: frameAccent + 'aa' }}
        />
        {/* Player at 0,0 (always center for now since we map world coords) */}
        <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: 75, top: 75, width: 8, height: 8, background: '#F4E9D3', boxShadow: '0 0 10px #F1C56D' }} />
        {/* NPCs */}
        {npcs.map((n, i) => (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: map(n.x),
              top: map(n.z),
              width: 6,
              height: 6,
              background: n.color,
              boxShadow: `0 0 4px ${n.color}`,
            }}
          />
        ))}
        {/* Bots */}
        {bots.map((b, i) => (
          <div
            key={`b-${i}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-sm"
            style={{
              left: map(b.spawn[0]),
              top: map(b.spawn[2]),
              width: 5,
              height: 5,
              background: b.color,
              boxShadow: `0 0 4px ${b.color}`,
            }}
          />
        ))}
        {/* Portal */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            left: map(PORTAL_POSITION[worldId].x),
            top: map(PORTAL_POSITION[worldId].z),
            width: 10,
            height: 10,
            borderColor: '#2E6A63',
            background: '#2E6A6355',
            boxShadow: '0 0 8px #2E6A63',
          }}
        />
      </div>
      <div className="mt-1 flex justify-between px-1 text-[8px] uppercase tracking-[0.12em] text-[#F4E9D3]/45">
        <span>● You</span>
        <span style={{ color: frameAccent }}>○ Portal</span>
      </div>
    </div>
  )
}
