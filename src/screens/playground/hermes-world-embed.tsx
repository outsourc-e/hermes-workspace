import { useMemo, useState } from 'react'
import { WaveChatPanelsShowcase } from './components/wave-chat-panels-showcase'

// v1 web client (WebGL build, char-select + world entry verified). Sets
// COEP require-corp + COOP same-origin for WebGL threading, but has NO
// X-Frame-Options / restrictive frame-ancestors, so it can be embedded.
const HERMES_WEB_ORIGIN = 'https://play.hermes-world.ai'
const HERMES_SITE_ORIGIN = 'https://hermes-world.ai'

export function HermesWorldEmbed() {
  const showPanelShowcase =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('panels') === 'wave-chat'

  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const webUrl = useMemo(() => {
    const url = new URL('/play/web/', HERMES_WEB_ORIGIN)
    url.searchParams.set('source', 'hermes-workspace')
    return url.toString()
  }, [])

  if (showPanelShowcase) {
    return <WaveChatPanelsShowcase />
  }

  return (
    <main className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#050015] text-white">
      {/* Embedded HermesWorld v1 web client */}
      {!failed && (
        <iframe
          title="HermesWorld"
          src={webUrl}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          allow="autoplay; fullscreen; gamepad; clipboard-write; cross-origin-isolated"
          allowFullScreen
          className="h-full w-full min-h-0 flex-1 border-0 bg-[#050015]"
        />
      )}

      {/* Loading veil over the iframe until first load */}
      {!loaded && !failed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(168,85,247,.24),transparent_48%),#050015]">
          <div className="flex flex-col items-center gap-3">
            <img
              src="/hermesworld-logo.svg"
              alt="HermesWorld"
              className="h-14 w-14 animate-pulse rounded-2xl shadow-[0_0_34px_rgba(34,211,238,.25)]"
            />
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/70">
              Loading HermesWorld…
            </div>
          </div>
        </div>
      )}

      {/* Fallback if the embed cannot load */}
      {failed && (
        <div className="relative flex h-full items-center justify-center px-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(168,85,247,.24),transparent_48%),#050015]" />
          <div className="relative max-w-xl rounded-3xl border border-white/12 bg-black/45 px-6 py-6 text-center shadow-2xl backdrop-blur-xl">
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/70">
              Hermes Workspace
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">
              Open HermesWorld in a full tab
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              The embedded client couldn’t load here. Open the full web build in
              a new tab to play.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a
                href={webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-cyan-300 px-5 py-2 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-white"
              >
                Open full
              </a>
              <a
                href={`${HERMES_SITE_ORIGIN}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/15 bg-white/8 px-5 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white/75 transition hover:border-cyan-200/40 hover:text-white"
              >
                Site root
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Persistent "open full tab" affordance while embedded */}
      {!failed && (
        <a
          href={webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-3 top-3 z-10 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/75 backdrop-blur-md transition hover:border-cyan-200/40 hover:text-white"
        >
          Open full ↗
        </a>
      )}
    </main>
  )
}
