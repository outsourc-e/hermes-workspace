import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'

const HERMES_REPO_URL = 'https://github.com/outsourc-e/hermes-workspace'
const HERMES_DISCORD_URL = 'https://discord.com/invite/agentd'

export const Route = createFileRoute('/early-access')({
  ssr: false,
  component: EarlyAccessRoute,
})

function EarlyAccessRoute() {
  usePageTitle('HermesWorld — Early Access')
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#03060a] px-4 text-[#f8f3e7] selection:bg-[#d9b35f] selection:text-[#07080d]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#071018_0%,#03060a_55%,#020305_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(217,179,95,.18),transparent_32%),radial-gradient(circle_at_78%_18%,rgba(34,211,238,.16),transparent_30%),radial-gradient(circle_at_82%_78%,rgba(167,139,250,.14),transparent_32%)]" />
        <div className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(248,228,172,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(248,228,172,.12)_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <div className="mx-auto w-full max-w-[760px] rounded-[2rem] border border-[#d9b35f]/24 bg-[#05080e]/82 p-8 shadow-[0_40px_140px_rgba(0,0,0,.52)] backdrop-blur-2xl sm:p-12">
        <div className="flex items-center gap-3">
          <img src="/hermesworld-logo.svg" alt="HermesWorld" className="h-10 w-10 rounded-2xl shadow-[0_0_34px_rgba(34,211,238,.18)]" />
          <div>
            <div className="font-serif text-lg font-bold tracking-[-0.03em] text-[#f8e4ac]">
              Hermes<span className="text-cyan-200">World</span>
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#bfb49a]/52">
              Persistent agent RPG
            </div>
          </div>
        </div>

        <div className="mt-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#d9b35f]/30 bg-[#d9b35f]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[#f8e4ac]">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(34,211,238,.95)]" />
            Early access — keys rolling out
          </span>
          <h1 className="mt-5 font-serif text-4xl font-bold leading-[0.92] tracking-[-0.045em] text-[#fff6df] sm:text-6xl">
            HermesWorld is opening soon.
          </h1>
          <p className="mt-5 max-w-[560px] text-base leading-7 text-[#d7d0bd]/68 sm:text-lg">
            We are polishing characters, the Agora plaza, and the launch trailer
            before opening multiplayer to the public. Join Discord for early-access
            keys and gameplay clips, or pull the open-source workspace and play
            locally today.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={HERMES_DISCORD_URL}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center justify-center rounded-xl border border-[#ffe7a3]/55 bg-[linear-gradient(180deg,#ffe7a3,#d9a63f)] px-7 py-4 text-sm font-black uppercase tracking-[0.16em] text-[#11100b] shadow-[0_30px_90px_rgba(217,179,95,.32),inset_0_1px_0_rgba(255,255,255,.32)] transition hover:-translate-y-0.5 hover:brightness-110"
            >
              Join Discord for keys
              <span className="ml-2 transition group-hover:translate-x-1">→</span>
            </a>
            <a
              href={HERMES_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-[#d9b35f]/24 bg-[#0b1118]/82 px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-[#f8e4ac]/85 shadow-[inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-xl transition hover:border-[#d9b35f]/55 hover:bg-[#121823]"
            >
              Play locally on GitHub
            </a>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ['1', 'Star the repo', 'Star Hermes Workspace on GitHub for updates.'],
              ['2', 'Hop in Discord', 'Get notified the moment public play is live.'],
              ['3', 'Watch the trailer', 'The launch trailer drops with the public world.'],
            ].map(([i, title, copy]) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-black/24 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"
              >
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#d9b35f]/72">
                  Step {i}
                </div>
                <div className="mt-2 text-sm font-bold text-[#fff6df]">{title}</div>
                <div className="mt-1 text-xs leading-5 text-[#d7d0bd]/55">{copy}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 text-[11px] uppercase tracking-[0.2em] text-[#bfb49a]/50">
            <a href="/hermes-world" className="hover:text-[#f8e4ac]">
              ← Back to landing
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
