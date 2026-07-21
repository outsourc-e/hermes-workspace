import { useMemo, useState } from 'react'
import { councilMemberById, councilMembers, councilSessions, councilVoteStats } from './council'
import type {CouncilSession} from './council';

type CouncilTablePanelProps = {
  onClose: () => void
}

const LOCKED_STYLE_ASSET_VERSION = '20260515-suntzu-recovered-genghis-unique-v1'

type CouncilSpriteState = 'walk' | 'ponder' | 'sit' | 'speak' | 'vote'

function councilSpriteStripSrc(memberId: string, state: CouncilSpriteState = 'ponder') {
  if (state === 'sit' || state === 'vote') {
    return `/war-room/council/locked-style/v1/live/${memberId}-${state}-still.png?v=${LOCKED_STYLE_ASSET_VERSION}`
  }
  return `/war-room/council/locked-style/v1/live/${memberId}-${state}-strip.png?v=${LOCKED_STYLE_ASSET_VERSION}`
}

function councilSpriteFrameCount(memberId: string, state: CouncilSpriteState) {
  if (state === 'sit' || state === 'vote') return 1
  if (state === 'ponder' || state === 'speak') return 16
  return 6
}

function CouncilSprite({ memberId, state = 'ponder', className = '' }: { memberId: string; state?: CouncilSpriteState; className?: string }) {
  const frames = councilSpriteFrameCount(memberId, state)
  const isChairStill = state === 'sit' || state === 'vote'
  return (
    <span
      aria-hidden="true"
      className={`inline-block bg-no-repeat [image-rendering:pixelated] ${className}`}
      style={{
        backgroundImage: `url(${councilSpriteStripSrc(memberId, state)})`,
        backgroundSize: `${frames * 100}% 100%`,
        animation: state === 'sit' || state === 'vote' ? 'none' : `councilSpriteFrames ${state === 'walk' ? 820 : Math.max(1180, frames * 95)}ms steps(${frames}) infinite`,
        filter: isChairStill ? 'none' : undefined,
      }}
    />
  )
}

function sessionWinner(session: CouncilSession) {
  return session.options.find((option) => option.id === session.winnerOptionId)
}

export function CouncilTablePanel({ onClose }: CouncilTablePanelProps) {
  const [tab, setTab] = useState<'meeting' | 'history' | 'stats' | 'models'>('meeting')
  const [sessionId, setSessionId] = useState(councilSessions[0]?.id ?? '')
  const session = councilSessions.find((candidate) => candidate.id === sessionId) ?? councilSessions[0]
  const stats = useMemo(() => councilVoteStats(), [])
  const winner = sessionWinner(session)

  return (
    <div className="fixed inset-0 isolate z-[180] flex items-center justify-center px-4 py-5" data-war-room-council-panel="open">
      <button type="button" aria-label="Close council backdrop" onClick={onClose} className="absolute inset-0 bg-black/72 backdrop-blur-[6px]" />
      <section className="relative z-10 grid h-[min(90vh,880px)] w-[min(1220px,96vw)] grid-rows-[auto_1fr] overflow-hidden rounded-[34px] border border-amber-100/24 bg-[radial-gradient(circle_at_18%_0%,rgba(251,191,36,.18),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(34,211,238,.12),transparent_30%),linear-gradient(135deg,rgba(5,6,14,.98),rgba(24,15,34,.97)_55%,rgba(4,12,18,.98))] shadow-[0_36px_100px_rgba(0,0,0,.82),inset_0_0_70px_rgba(251,191,36,.07)]">
        <style>{`@keyframes councilSpriteFrames { from { background-position: 0 0; } to { background-position: 100% 0; } }`}</style>
        <header className="flex items-center gap-4 border-b border-amber-100/12 bg-black/24 px-5 py-4">
          <div className="relative grid h-[76px] w-[76px] shrink-0 place-items-center overflow-hidden rounded-[24px] border border-amber-100/28 bg-black/64 shadow-[0_14px_34px_rgba(0,0,0,.46),inset_0_0_34px_rgba(251,191,36,.13)]" data-council-table-header-icon="war-table">
            <img
              src={`/war-room/council/council-war-table-seven-chairs-premium-maps-wine-sigils.png?v=${LOCKED_STYLE_ASSET_VERSION}`}
              alt="Council table icon"
              className="h-[70px] w-[70px] object-contain drop-shadow-[0_8px_18px_rgba(251,191,36,.24)]"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[.28em] text-cyan-100/70">Olympus Council</p>
            <h2 className="font-serif text-3xl font-black leading-none text-[#ffeeb0]">Council Table</h2>
            <p className="mt-1 truncate text-xs font-semibold text-amber-50/72">{session.title}</p>
          </div>
          <div className="hidden max-w-[280px] rounded-[22px] border border-yellow-200/22 bg-yellow-300/8 px-4 py-3 text-xs font-bold text-yellow-50/82 md:block">
            <span className="block text-[9px] uppercase tracking-[.2em] text-yellow-100/52">Leading answer</span>
            <span className="mt-1 block truncate font-serif text-base font-black text-[#ffeeb0]">{winner?.label}</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-amber-100/28 bg-amber-200/10 px-4 py-2 text-[10px] font-black uppercase tracking-[.18em] text-amber-50 transition hover:bg-amber-200 hover:text-black focus:outline-none focus:ring-2 focus:ring-amber-100">
            Close ✕
          </button>
        </header>

        <div className="grid min-h-0 grid-cols-[minmax(248px,300px)_1fr] gap-0 overflow-hidden">
          <div className="min-h-0 overflow-y-auto border-r border-amber-100/12 bg-black/26 p-4">
            <div className="mb-4 grid grid-cols-2 gap-2">
              {(['meeting', 'history', 'stats', 'models'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setTab(candidate)}
                  className={`rounded-2xl border px-3 py-2 text-[10px] font-black uppercase tracking-[.15em] transition focus:outline-none focus:ring-2 focus:ring-cyan-100 ${tab === candidate ? 'border-cyan-100/60 bg-cyan-300/16 text-cyan-50' : 'border-amber-100/14 bg-black/34 text-amber-50/64 hover:border-amber-100/34'}`}
                >
                  {candidate}
                </button>
              ))}
            </div>

            <div className="rounded-[26px] border border-amber-100/14 bg-black/34 p-3 shadow-[inset_0_0_30px_rgba(0,0,0,.32)]">
              <p className="mb-3 text-[9px] font-black uppercase tracking-[.22em] text-amber-100/64">Council members</p>
              <div className="grid gap-2">
                {councilMembers.map((member) => (
                  <div key={member.id} className="group flex items-center gap-3 rounded-2xl border border-amber-100/12 bg-white/[.035] p-2">
                    <div className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-[16px] border bg-black/48 [image-rendering:pixelated]" style={{ borderColor: `${member.palette}66`, boxShadow: `0 0 18px ${member.palette}30` }}>
                      <CouncilSprite memberId={member.id} state="ponder" className="h-14 w-14 object-contain [image-rendering:pixelated]" />
                      <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border border-black/70" style={{ background: member.palette }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-serif text-sm font-black text-amber-50">{member.name}</p>
                      <p className="truncate text-[10px] font-semibold text-amber-50/52">{member.epithet}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <main className="min-h-0 overflow-y-auto p-5" data-war-room-scroll-panel="council-main">
            {tab === 'meeting' ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
                <section className="rounded-[30px] border border-amber-100/16 bg-black/24 p-4 shadow-[inset_0_0_45px_rgba(251,191,36,.035)]">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-100/68">Current question</p>
                      <h3 className="mt-1 font-serif text-2xl font-black leading-tight text-[#ffeeb0]">{session.title}</h3>
                      <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-amber-50/68">{session.topic}</p>
                    </div>
                    <select value={session.id} onChange={(event) => setSessionId(event.target.value)} className="rounded-2xl border border-amber-100/22 bg-black/62 px-3 py-2 text-xs font-bold text-amber-50 outline-none focus:ring-2 focus:ring-cyan-100">
                      {councilSessions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.createdAt} • {candidate.status}</option>)}
                    </select>
                  </div>

                  <div className="mb-4 grid gap-4 2xl:grid-cols-[minmax(360px,1fr)_360px]">
                    <div className="relative min-h-[430px] overflow-hidden rounded-[30px] border border-yellow-200/24 bg-[radial-gradient(circle_at_50%_50%,rgba(251,191,36,.14),transparent_42%),linear-gradient(180deg,rgba(4,8,18,.92),rgba(12,8,16,.96))] p-4 shadow-[inset_0_0_70px_rgba(251,191,36,.07)]" data-war-room-council-table-asset="seven-chair-table-v1">
                      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(251,191,36,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(251,191,36,.08)_1px,transparent_1px)] [background-size:28px_28px]" />
                      <img
                        src={`/war-room/council/council-war-table-seven-chairs-premium-maps-wine-sigils.png?v=${LOCKED_STYLE_ASSET_VERSION}`}
                        alt="Seven-chair Olympus council war table asset"
                        className="absolute left-1/2 top-1/2 h-[min(90%,500px)] w-[min(90%,500px)] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_30px_45px_rgba(0,0,0,.72)]"
                      />
                      <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded-full border border-amber-100/24 bg-black/62 px-3 py-1 text-[9px] font-black uppercase tracking-[.18em] text-amber-50/72">live council seating</div>
                      {councilMembers.map((member, index) => {
                        const positions = [
                          'left-1/2 top-[8%] -translate-x-1/2',
                          'right-[8%] top-[22%]',
                          'right-[5%] top-1/2 -translate-y-1/2',
                          'right-[13%] bottom-[13%]',
                          'left-[22%] bottom-[13%]',
                          'left-[5%] top-1/2 -translate-y-1/2',
                          'left-[8%] top-[22%]',
                        ]
                        return (
                          <div key={member.id} className={`absolute ${positions[index]} flex max-w-[136px] items-center gap-1 rounded-2xl border bg-black/70 px-2 py-1 shadow-[0_12px_25px_rgba(0,0,0,.45)]`} style={{ borderColor: `${member.palette}88`, boxShadow: `0 0 24px ${member.palette}22` }}>
                            <CouncilSprite memberId={member.id} state={index % 2 ? 'vote' : 'sit'} className="h-14 w-14 shrink-0 object-contain [image-rendering:pixelated]" />
                            <div className="min-w-0">
                              <p className="truncate font-serif text-xs font-black text-amber-50">{member.name}</p>
                              <p className="truncate text-[9px] font-black uppercase tracking-[.12em]" style={{ color: member.palette }}>{member.virtue}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="grid content-start gap-2">
                      {session.options.map((option) => (
                        <div key={option.id} className={`rounded-[22px] border p-3 ${option.id === session.winnerOptionId ? 'border-yellow-200/50 bg-yellow-300/12' : 'border-amber-100/14 bg-white/[.035]'}`}>
                          <p className="text-[9px] font-black uppercase tracking-[.18em] text-amber-100/58">{option.id === session.winnerOptionId ? 'winner' : 'option'}</p>
                          <h4 className="font-serif text-lg font-black text-amber-50">{option.label}</h4>
                          <p className="mt-1 text-xs font-semibold leading-5 text-amber-50/62">{option.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {session.votes.map((vote) => {
                      const member = councilMemberById(vote.memberId)
                      const option = session.options.find((candidate) => candidate.id === vote.optionId)
                      return (
                        <div key={`${session.id}-${vote.memberId}`} className="grid gap-3 rounded-2xl border border-amber-100/12 bg-black/24 p-3 md:grid-cols-[190px_1fr_70px] md:items-center">
                          <div className="flex items-center gap-2">
                            <span className="grid h-9 w-9 place-items-center rounded-xl border bg-black/48" style={{ borderColor: `${member?.palette ?? '#fef3c7'}66`, color: member?.palette }}>{member?.symbol}</span>
                            <div>
                              <p className="font-serif text-sm font-black text-amber-50">{member?.name}</p>
                              <p className="text-[10px] font-bold uppercase tracking-[.12em] text-amber-50/42">{member?.virtue}</p>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-[.16em] text-cyan-100/72">votes: {option?.label}</p>
                            <p className="mt-1 text-xs font-semibold leading-5 text-amber-50/70">“{vote.rationale}”</p>
                          </div>
                          <div className="text-right font-serif text-2xl font-black text-[#ffeeb0]">{vote.confidence}</div>
                        </div>
                      )
                    })}
                  </div>
                </section>

                <section className="rounded-[30px] border border-yellow-200/20 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,.18),transparent_46%),rgba(251,191,36,.07)] p-4 shadow-[inset_0_0_48px_rgba(251,191,36,.05)]">
                  <p className="text-[9px] font-black uppercase tracking-[.24em] text-yellow-100/68">Council decision</p>
                  <h3 className="mt-2 font-serif text-2xl font-black text-[#ffeeb0]">{winner?.label}</h3>
                  <p className="mt-3 text-sm font-semibold leading-6 text-yellow-50/75">{session.finalRecommendation}</p>
                  <div className="mt-4 rounded-[22px] border border-amber-100/14 bg-black/32 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[.18em] text-amber-100/52">Next move</p>
                    <p className="mt-1 text-xs font-bold leading-5 text-amber-50/78">Use the winning direction as the next council brief, then drill into the votes below for why each general agreed or pushed back.</p>
                  </div>
                </section>
              </div>
            ) : null}

            {tab === 'history' ? (
              <section className="rounded-[30px] border border-amber-100/16 bg-black/30 p-4">
                <p className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-100/68">Meeting history</p>
                <div className="mt-4 grid gap-3">
                  {councilSessions.map((item) => (
                    <button key={item.id} type="button" onClick={() => { setSessionId(item.id); setTab('meeting') }} className="rounded-[24px] border border-amber-100/14 bg-white/[.035] p-4 text-left transition hover:border-cyan-100/40 hover:bg-cyan-300/8 focus:outline-none focus:ring-2 focus:ring-cyan-100">
                      <div className="flex flex-wrap justify-between gap-3">
                        <h3 className="font-serif text-xl font-black text-amber-50">{item.title}</h3>
                        <span className="rounded-full border border-amber-100/18 bg-black/42 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-amber-50/62">{item.createdAt} • {item.status}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold leading-6 text-amber-50/65">{item.finalRecommendation}</p>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {tab === 'stats' ? (
              <section className="rounded-[30px] border border-amber-100/16 bg-black/30 p-4">
                <p className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-100/68">Council vote and suggestion performance</p>
                <div className="mt-4 grid gap-3">
                  {stats.map((row, index) => (
                    <div key={row.member.id} className="grid gap-3 rounded-[24px] border border-amber-100/12 bg-white/[.035] p-4 md:grid-cols-[56px_1fr_100px_100px_120px] md:items-center">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl border bg-black/42 font-serif text-xl font-black" style={{ borderColor: `${row.member.palette}66`, color: row.member.palette }}>{index + 1}</div>
                      <div>
                        <h3 className="font-serif text-xl font-black text-amber-50">{row.member.name}</h3>
                        <p className="text-xs font-semibold text-amber-50/56">{row.member.strength}</p>
                      </div>
                      <div><p className="text-[9px] font-black uppercase tracking-[.16em] text-amber-100/42">Win rate</p><p className="font-serif text-2xl font-black text-[#ffeeb0]">{row.winRate}%</p></div>
                      <div><p className="text-[9px] font-black uppercase tracking-[.16em] text-amber-100/42">Confidence</p><p className="font-serif text-2xl font-black text-cyan-100">{row.avgConfidence}</p></div>
                      <div><p className="text-[9px] font-black uppercase tracking-[.16em] text-amber-100/42">Suggestion score</p><p className="font-serif text-2xl font-black text-emerald-100">{row.bestSuggestionScore}</p></div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {tab === 'models' ? (
              <section className="rounded-[30px] border border-amber-100/16 bg-black/30 p-4">
                <p className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-100/68">Generated model workbench</p>
                <h3 className="mt-2 font-serif text-2xl font-black text-[#ffeeb0]">Actual sprite-model pipeline, not placeholder icons</h3>
                <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-amber-50/68">The council animation pipeline now uses seven distinct historical commander sources: Alexander, Caesar, Hannibal, Napoleon, Sun Tzu, Saladin, and Genghis. Hannibal is only the process/QA standard now — not the body template. The live room plays normalized per-state strips for walk, ponder, seated planning, speak, and vote/decision states.</p>
                <div className="mt-4 overflow-hidden rounded-[26px] border border-yellow-200/22 bg-black/62 p-4 shadow-[inset_0_0_45px_rgba(251,191,36,.08)]" data-war-room-model-anchor="individual-30-frame-council-v3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[.2em] text-yellow-100/62">Individual generation pass</p>
                      <h4 className="font-serif text-xl font-black text-amber-50">Distinct seven-general rebuild • Hannibal process, not Hannibal clones</h4>
                    </div>
                    <span className="rounded-full border border-emerald-200/24 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-emerald-50/76">walk / ponder / sit / speak / vote</span>
                  </div>
                  <div className="mt-4 overflow-x-auto rounded-2xl border border-amber-100/12 bg-black/48 p-3">
                    <img src={`/war-room/council/locked-style/v1/qa/processed-contact-sheet.png?v=${LOCKED_STYLE_ASSET_VERSION}`} alt="Distinct seven historical generals council animation QA contact sheet" className="h-[520px] max-w-none [image-rendering:pixelated]" />
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {councilMembers.map((member) => (
                    <div key={member.id} className="rounded-[24px] border border-amber-100/12 bg-white/[.035] p-4">
                      <div className="flex items-start gap-3">
                        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-black/42" style={{ borderColor: `${member.palette}66` }}>
                          <CouncilSprite memberId={member.id} state="walk" className="h-16 w-16 object-contain [image-rendering:pixelated]" />
                        </span>
                        <div>
                          <h4 className="font-serif text-lg font-black text-amber-50">{member.name} • {member.epithet}</h4>
                          <p className="mt-1 text-xs font-semibold leading-5 text-amber-50/65">{member.modelContract}</p>
                          <p className="mt-2 text-[10px] font-black uppercase tracking-[.16em] text-cyan-100/62">states: {member.motionLanguage.join(' • ')}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </main>
        </div>
      </section>
    </div>
  )
}
