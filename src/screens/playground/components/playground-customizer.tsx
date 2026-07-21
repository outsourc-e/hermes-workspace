/**
 * Avatar Customizer — a Sims-lite character builder for Hermes Playground.
 * Lives in a modal (toggled with C key or button). Persists to localStorage.
 */
import { useEffect, useState } from 'react'
import {
  AVATAR_PRESETS,
  ACCENT_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  OUTFIT_COLORS,
  PORTRAITS,
  SKIN_TONES,
  loadAvatarConfig,
  saveAvatarConfig,
  type AvatarConfig,
} from '../lib/avatar-config'

type Props = {
  open: boolean
  onClose: () => void
  value?: AvatarConfig
  onChange?: (cfg: AvatarConfig) => void
}

const HAIR_STYLES: Array<AvatarConfig['hairStyle']> = ['short', 'cap', 'long', 'mohawk', 'bald']
const HELMETS: Array<AvatarConfig['helmet']> = ['winged', 'circlet', 'cap', 'crown', 'none']
const WEAPONS: Array<AvatarConfig['weapon']> = ['sword', 'staff', 'bow', 'none']

export function PlaygroundCustomizer({ open, onClose, value, onChange }: Props) {
  const [cfg, setCfg] = useState<AvatarConfig>(() => value ?? loadAvatarConfig())

  useEffect(() => {
    if (open) setCfg(value ?? loadAvatarConfig())
  }, [open, value])

  function update<K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) {
    const next = { ...cfg, [key]: value }
    setCfg(next)
    saveAvatarConfig(next)
    onChange?.(next)
  }

  function loadPreset(name: string) {
    const preset = AVATAR_PRESETS[name]
    if (!preset) return
    setCfg(preset)
    saveAvatarConfig(preset)
    onChange?.(preset)
  }

  if (!open) return null

  return (
    <div className="pointer-events-auto fixed inset-0 z-[110] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[calc(100svh-1.5rem)] w-full max-w-[840px] flex-col overflow-hidden rounded-2xl border-2 text-white shadow-2xl sm:max-h-[calc(100vh-2rem)]"
        style={{ borderColor: 'rgba(34,211,238,0.45)', background: '#070b14', boxShadow: '0 0 38px rgba(34,211,238,.35), 0 18px 54px rgba(0,0,0,.7)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-cyan-500/15 via-transparent to-violet-500/15 px-5 py-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200/80">Customize your agent</div>
            <div className="text-base font-extrabold">Builder Workshop</div>
          </div>
          <button onClick={onClose} className="text-white/55 hover:text-white">✕</button>
        </div>

        <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto p-4 sm:gap-5 sm:p-5 md:grid-cols-[260px_1fr]">
          {/* Live preview */}
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="relative h-[260px] w-[220px] overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-cyan-500/10 to-black/40">
              <PreviewSvg cfg={cfg} />
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/55">Quick presets</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {Object.keys(AVATAR_PRESETS).map((id) => (
                <button
                  key={id}
                  onClick={() => loadPreset(id)}
                  className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] hover:bg-white/10"
                >
                  {id}
                </button>
              ))}
            </div>
          </div>

          {/* Tweaks */}
          <div className="relative z-0 space-y-4">
            <Section label="Skin">
              <Swatches values={SKIN_TONES} active={cfg.skin} onPick={(v) => update('skin', v)} />
            </Section>
            <Section label="Hair color">
              <Swatches values={HAIR_COLORS} active={cfg.hair} onPick={(v) => update('hair', v)} />
            </Section>
            <Section label="Hair style">
              <Toggles values={HAIR_STYLES} active={cfg.hairStyle} onPick={(v) => update('hairStyle', v)} />
            </Section>
            <Section label="Eyes">
              <Swatches values={EYE_COLORS} active={cfg.eyes} onPick={(v) => update('eyes', v)} />
            </Section>
            <Section label="Outfit">
              <Swatches values={OUTFIT_COLORS} active={cfg.outfit} onPick={(v) => update('outfit', v)} />
            </Section>
            <Section label="Outfit accent">
              <Swatches values={ACCENT_COLORS} active={cfg.outfitAccent} onPick={(v) => update('outfitAccent', v)} />
            </Section>
            <Section label="Cape">
              <Swatches values={['#0891b2', '#7c3aed', '#b45309', '#166534', '#7c2d12', '#1f2937', '#fb7185', 'transparent']} active={cfg.cape} onPick={(v) => update('cape', v)} />
            </Section>
            <Section label="Helmet">
              <Toggles values={HELMETS} active={cfg.helmet} onPick={(v) => update('helmet', v)} />
            </Section>
            <Section label="Weapon">
              <Toggles values={WEAPONS} active={cfg.weapon} onPick={(v) => update('weapon', v)} />
            </Section>
            <Section label="Avatar portrait">
              <Toggles values={PORTRAITS} active={cfg.portrait} onPick={(v) => update('portrait', v)} />
            </Section>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-black/40 px-5 py-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">Saved automatically</div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                saveAvatarConfig(AVATAR_PRESETS.hermes)
                setCfg(AVATAR_PRESETS.hermes)
                onChange?.(AVATAR_PRESETS.hermes)
              }}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/75 hover:bg-white/5"
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-cyan-400/50 bg-cyan-400/15 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-400/25"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">{label}</div>
      {children}
    </div>
  )
}

function Swatches({ values, active, onPick }: { values: string[]; active: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          onClick={() => onPick(v)}
          className="h-7 w-7 rounded-md border-2 transition-transform hover:scale-110"
          style={{
            background: v === 'transparent' ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.1) 0 4px, transparent 4px 8px)' : v,
            borderColor: active === v ? '#22d3ee' : 'rgba(255,255,255,0.15)',
            boxShadow: active === v ? '0 0 8px rgba(34,211,238,0.65)' : 'none',
          }}
          title={v}
        />
      ))}
    </div>
  )
}

function Toggles<T extends string>({ values, active, onPick }: { values: T[]; active: T; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          onClick={() => onPick(v)}
          className="rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors"
          style={{
            borderColor: active === v ? '#22d3ee' : 'rgba(255,255,255,0.15)',
            background: active === v ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.04)',
            color: active === v ? '#cffafe' : 'rgba(255,255,255,0.7)',
          }}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

/** Tiny SVG preview that mirrors the in-world avatar so users see live edits. */
function PreviewSvg({ cfg }: { cfg: AvatarConfig }) {
  const w = 220
  const h = 260
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <defs>
        <radialGradient id="bg" cx="50%" cy="40%" r="80%">
          <stop offset="0%" stopColor="#0d2238" />
          <stop offset="100%" stopColor="#040611" />
        </radialGradient>
      </defs>
      <rect width={w} height={h} fill="url(#bg)" />
      {/* Cape */}
      {cfg.cape !== 'transparent' && <path d={`M${w / 2 - 36} ${h - 130} Q${w / 2} ${h - 30} ${w / 2 + 36} ${h - 130} L${w / 2 + 24} ${h - 60} Q${w / 2} ${h - 35} ${w / 2 - 24} ${h - 60} Z`} fill={cfg.cape} opacity={0.8} />}
      {/* Body */}
      <rect x={w / 2 - 32} y={h - 138} width={64} height={70} rx={10} fill={cfg.outfit} />
      <rect x={w / 2 - 34} y={h - 92} width={68} height={6} fill={cfg.outfitAccent} />
      {/* Arms */}
      <rect x={w / 2 - 50} y={h - 132} width={14} height={56} rx={6} fill={cfg.outfit} />
      <rect x={w / 2 + 36} y={h - 132} width={14} height={56} rx={6} fill={cfg.outfit} />
      {/* Hands */}
      <circle cx={w / 2 - 43} cy={h - 70} r={8} fill={cfg.skin} />
      <circle cx={w / 2 + 43} cy={h - 70} r={8} fill={cfg.skin} />
      {/* Legs */}
      <rect x={w / 2 - 22} y={h - 68} width={16} height={50} rx={4} fill="#1f2937" />
      <rect x={w / 2 + 6} y={h - 68} width={16} height={50} rx={4} fill="#1f2937" />
      {/* Neck */}
      <rect x={w / 2 - 6} y={h - 145} width={12} height={10} fill={cfg.skin} />
      {/* Back hair sits behind the face so it never masks portrait details. */}
      {cfg.hairStyle === 'long' && <>
        <rect x={w / 2 - 29} y={h - 178} width={8} height={36} rx={4} fill={cfg.hair} />
        <rect x={w / 2 + 21} y={h - 178} width={8} height={36} rx={4} fill={cfg.hair} />
      </>}
      {/* Head */}
      <circle cx={w / 2} cy={h - 165} r={26} fill={cfg.skin} />
      {/* Hair/headwear kept above the forehead, below facial features. */}
      {cfg.hairStyle === 'short' && <path d={`M${w / 2 - 26} ${h - 176} Q${w / 2} ${h - 198} ${w / 2 + 26} ${h - 176} L${w / 2 + 24} ${h - 168} Q${w / 2} ${h - 184} ${w / 2 - 24} ${h - 168} Z`} fill={cfg.hair} />}
      {cfg.hairStyle === 'cap' && <path d={`M${w / 2 - 28} ${h - 176} Q${w / 2} ${h - 198} ${w / 2 + 28} ${h - 176} L${w / 2 + 24} ${h - 169} Q${w / 2} ${h - 181} ${w / 2 - 24} ${h - 169} Z`} fill={cfg.hair} />}
      {cfg.hairStyle === 'long' && <path d={`M${w / 2 - 27} ${h - 176} Q${w / 2} ${h - 199} ${w / 2 + 27} ${h - 176} L${w / 2 + 23} ${h - 168} Q${w / 2} ${h - 184} ${w / 2 - 23} ${h - 168} Z`} fill={cfg.hair} />}
      {cfg.hairStyle === 'mohawk' && <path d={`M${w / 2 - 5} ${h - 192} L${w / 2 + 5} ${h - 192} L${w / 2 + 4} ${h - 168} L${w / 2 - 4} ${h - 168} Z`} fill={cfg.hair} />}
      {/* Helmet */}
      {cfg.helmet === 'circlet' && <ellipse cx={w / 2} cy={h - 170} rx={28} ry={4} fill="#fbbf24" stroke="#fde68a" strokeWidth={1} />}
      {cfg.helmet === 'crown' && <path d={`M${w / 2 - 22} ${h - 178} L${w / 2 - 18} ${h - 188} L${w / 2 - 8} ${h - 180} L${w / 2} ${h - 192} L${w / 2 + 8} ${h - 180} L${w / 2 + 18} ${h - 188} L${w / 2 + 22} ${h - 178} Z`} fill="#fbbf24" />}
      {cfg.helmet === 'cap' && <path d={`M${w / 2 - 28} ${h - 176} Q${w / 2} ${h - 200} ${w / 2 + 28} ${h - 176} L${w / 2 + 22} ${h - 169} Q${w / 2} ${h - 181} ${w / 2 - 22} ${h - 169} Z`} fill="#22d3ee" />}
      {cfg.helmet === 'winged' && <>
        <ellipse cx={w / 2} cy={h - 170} rx={28} ry={4} fill="#fbbf24" />
        <path d={`M${w / 2 + 18} ${h - 168} l 18 -10 l -10 14 z`} fill="#fef3c7" />
        <path d={`M${w / 2 - 18} ${h - 168} l -18 -10 l 10 14 z`} fill="#fef3c7" />
      </>}
      {/* Eyes rendered last in the face stack to stay visible in every customizer state. */}
      <circle cx={w / 2 - 9} cy={h - 167} r={3} fill={cfg.eyes} />
      <circle cx={w / 2 + 9} cy={h - 167} r={3} fill={cfg.eyes} />
      {/* Weapon */}
      {cfg.weapon === 'sword' && <rect x={w / 2 + 50} y={h - 130} width={4} height={60} fill="#cbd5e1" transform={`rotate(20 ${w / 2 + 52} ${h - 100})`} />}
      {cfg.weapon === 'staff' && <rect x={w / 2 - 56} y={h - 160} width={3} height={90} fill="#92400e" />}
      {cfg.weapon === 'bow' && <path d={`M${w / 2 + 50} ${h - 140} Q${w / 2 + 70} ${h - 100} ${w / 2 + 50} ${h - 60}`} fill="none" stroke="#92400e" strokeWidth={2} />}
    </svg>
  )
}
