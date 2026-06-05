import { useMemo } from 'react'
import { WaveChatPanelsShowcase } from './components/wave-chat-panels-showcase'

const HERMES_WORLD_ORIGIN = 'https://hermes-world.ai'

export function HermesWorldEmbed() {
  const showPanelShowcase = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('panels') === 'wave-chat'
  const playUrl = useMemo(() => {
    const url = new URL('/play/', HERMES_WORLD_ORIGIN)
    url.searchParams.set('source', 'hermes-workspace')
    return url.toString()
  }, [])

  if (showPanelShowcase) {
    return <WaveChatPanelsShowcase />
  }

  return (
    <main className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[#050015] px-4 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(168,85,247,.24),transparent_48%),#050015]" />
      <div className="relative max-w-xl rounded-3xl border border-white/12 bg-black/45 px-6 py-6 text-center shadow-2xl backdrop-blur-xl">
        <div className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/70">
          Hermes Workspace
        </div>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          Open HermesWorld in a full tab
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/65">
          HermesWorld currently refuses iframe embedding, so Workspace no longer
          loads it in an iframe that fails with “refused to connect”. The hosted
          build should be opened directly while the game deployment fixes its
          stale asset/MIME issue for <code className="rounded bg-white/10 px-1">/assets/styles-*.css</code>.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <a
            href={playUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-cyan-300 px-5 py-2 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-white"
          >
            Open full
          </a>
          <a
            href={`${HERMES_WORLD_ORIGIN}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-white/15 bg-white/8 px-5 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white/75 transition hover:border-cyan-200/40 hover:text-white"
          >
            Site root
          </a>
        </div>
      </div>
    </main>
  )
}
