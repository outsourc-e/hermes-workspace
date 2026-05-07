import type { ChangeEvent, ReactNode } from 'react'
import { useHermesWorldSettings, type HermesWorldSettings } from './hermesworld-settings'

type Props = {
  open: boolean
  onClose: () => void
  signedInName?: string | null
  onSignOut?: () => void
}

type Path =
  | ['graphics', keyof HermesWorldSettings['graphics']]
  | ['performance', keyof HermesWorldSettings['performance']]
  | ['controls', keyof HermesWorldSettings['controls']]
  | ['audio', keyof HermesWorldSettings['audio']]
  | ['display', keyof HermesWorldSettings['display']]
  | ['accessibility', keyof HermesWorldSettings['accessibility']]

export function SettingsPanel({ open, onClose, signedInName, onSignOut }: Props) {
  const [settings, updateSettings] = useHermesWorldSettings()
  if (!open) return null

  const set = <T,>(path: Path, value: T) => {
    updateSettings((current) => ({
      ...current,
      [path[0]]: {
        ...(current[path[0]] as object),
        [path[1]]: value,
      },
    }))
  }
  const onNumber = (path: Path) => (event: ChangeEvent<HTMLInputElement>) => set(path, Number(event.target.value))
  const onSelect = (path: Path) => (event: ChangeEvent<HTMLSelectElement>) => set(path, event.target.value)
  const onToggle = (path: Path) => (event: ChangeEvent<HTMLInputElement>) => set(path, event.target.checked)

  const toggleFullscreen = async () => {
    const next = !settings.display.fullscreen
    set(['display', 'fullscreen'], next)
    try {
      if (next && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen()
      if (!next && document.fullscreenElement) await document.exitFullscreen()
    } catch {}
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="HermesWorld settings"
        className="max-h-[92vh] w-[min(96vw,980px)] overflow-hidden rounded-3xl border-2 text-white shadow-2xl"
        style={{
          borderColor: 'rgba(241,197,109,.55)',
          background: 'linear-gradient(180deg, rgba(15,22,34,.98), rgba(5,8,13,.97))',
          boxShadow: '0 0 46px rgba(241,197,109,.18), 0 24px 90px rgba(0,0,0,.74)',
        }}
      >
        <div className="flex items-center justify-between border-b border-amber-200/15 px-5 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-200/65">HermesWorld</div>
            <div className="text-2xl font-black text-[#F1C56D]">Settings</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70 hover:bg-white/10">
            Close
          </button>
        </div>
        <div className="grid max-h-[calc(92vh-84px)] gap-3 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3">
          <Section title="Graphics">
            <Select label="Render distance" value={settings.graphics.renderDistance} onChange={onSelect(['graphics', 'renderDistance'])} options={['low', 'med', 'high', 'ultra']} />
            <Select label="Shadow quality" value={settings.graphics.shadowQuality} onChange={onSelect(['graphics', 'shadowQuality'])} options={['low', 'med', 'high', 'ultra']} />
            <Select label="Texture quality" value={settings.graphics.textureQuality} onChange={onSelect(['graphics', 'textureQuality'])} options={['low', 'med', 'high', 'ultra']} />
            <Check label="Anti-aliasing" checked={settings.graphics.antiAliasing} onChange={onToggle(['graphics', 'antiAliasing'])} />
          </Section>

          <Section title="Performance">
            <Check label="FPS counter" checked={settings.performance.fpsCounter} onChange={onToggle(['performance', 'fpsCounter'])} />
            <Select label="Target FPS" value={settings.performance.targetFps} onChange={onSelect(['performance', 'targetFps'])} options={['30', '60', '120', 'uncapped']} />
            <Check label="Reduced motion" checked={settings.performance.reducedMotion} onChange={onToggle(['performance', 'reducedMotion'])} />
          </Section>

          <Section title="Controls">
            <Range label="Mouse sensitivity" value={settings.controls.mouseSensitivity} min={1} max={100} onChange={onNumber(['controls', 'mouseSensitivity'])} />
            <Check label="Invert Y" checked={settings.controls.invertY} onChange={onToggle(['controls', 'invertY'])} />
            <div className="rounded-xl border border-white/10 bg-black/25 p-2">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Keyboard rebinding</div>
              <div className="grid gap-1 text-[11px] text-white/70">
                {Object.entries(settings.controls.bindings).slice(0, 14).map(([action, key]) => (
                  <div key={action} className="flex justify-between gap-2"><span>{action}</span><kbd className="text-amber-100">{key}</kbd></div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Audio">
            <Range label="Master" value={settings.audio.master} min={0} max={100} onChange={onNumber(['audio', 'master'])} />
            <Range label="Music" value={settings.audio.music} min={0} max={100} onChange={onNumber(['audio', 'music'])} />
            <Range label="SFX" value={settings.audio.sfx} min={0} max={100} onChange={onNumber(['audio', 'sfx'])} />
            <Range label="Ambient" value={settings.audio.ambient} min={0} max={100} onChange={onNumber(['audio', 'ambient'])} />
          </Section>

          <Section title="Display">
            <Range label="UI scale" value={settings.display.uiScale} min={50} max={150} onChange={onNumber(['display', 'uiScale'])} suffix="%" />
            <Range label="HUD opacity" value={settings.display.hudOpacity} min={30} max={100} onChange={onNumber(['display', 'hudOpacity'])} suffix="%" />
            <button type="button" onClick={toggleFullscreen} className="rounded-xl border border-amber-200/25 bg-amber-200/10 px-3 py-2 text-sm font-bold text-amber-100 hover:bg-amber-200/15">
              {settings.display.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </button>
          </Section>

          <Section title="Accessibility">
            <Check label="Photosensitive Mode" checked={settings.accessibility.photosensitiveMode} onChange={onToggle(['accessibility', 'photosensitiveMode'])} />
            <p className="text-xs leading-relaxed text-white/50">Disables rapid flashes, strobe-like pulses, sparkle bursts, and fast lighting loops. Flash animations are capped at 1.5Hz by default and stopped in this mode.</p>
          </Section>

          <Section title="Account">
            {signedInName ? (
              <>
                <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-50">Signed in as {signedInName}</div>
                <button type="button" onClick={onSignOut} className="rounded-xl border border-red-300/25 bg-red-300/10 px-3 py-2 text-sm font-bold text-red-100 hover:bg-red-300/15">Sign out</button>
              </>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white/55">Not signed in. Sign out is unavailable.</div>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><h2 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-[#F1C56D]">{title}</h2><div className="space-y-3">{children}</div></section>
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (event: ChangeEvent<HTMLSelectElement>) => void }) {
  return <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-white/55">{label}<select value={value} onChange={onChange} className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
}

function Range({ label, value, min, max, suffix = '', onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-white/55">{label}: <span className="text-amber-100">{value}{suffix}</span><input aria-label={label} type="range" value={value} min={min} max={max} onChange={onChange} className="mt-2 w-full accent-[#F1C56D]" /></label>
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/75"><span>{label}</span><input aria-label={label} type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-[#F1C56D]" /></label>
}
