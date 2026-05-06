import { useMemo, useState } from 'react'

const HERMES_WORLD_ORIGIN = 'https://hermes-world.ai'

export function HermesWorldEmbed() {
  const [loaded, setLoaded] = useState(false)
  const src = useMemo(() => {
    const url = new URL('/play/', HERMES_WORLD_ORIGIN)
    url.searchParams.set('embed', 'workspace')
    url.searchParams.set('source', 'hermes-workspace')
    return url.toString()
  }, [])

  return (
    <main className="fixed inset-0 z-0 overflow-hidden bg-[#050015] text-white">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(168,85,247,.24),transparent_48%),#050015]">
          <div className="rounded-3xl border border-white/12 bg-black/35 px-6 py-5 text-center shadow-2xl backdrop-blur-xl">
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/70">Hermes Workspace</div>
            <div className="mt-2 text-2xl font-black tracking-tight">Opening HermesWorld…</div>
            <div className="mt-2 text-sm text-white/58">Runtime hosted by hermes-world.ai</div>
          </div>
        </div>
      )}
      <iframe
        title="HermesWorld"
        src={src}
        className="h-[100dvh] w-screen border-0 bg-[#050015]"
        allow="fullscreen; clipboard-read; clipboard-write; gamepad"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setLoaded(true)}
      />
      <a
        href={`${HERMES_WORLD_ORIGIN}/play/`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed right-3 top-3 z-10 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white/70 backdrop-blur transition hover:border-cyan-200/40 hover:text-white"
      >
        Open full
      </a>
    </main>
  )
}
