type QuestChoice = {
  id: string
  label: string
  tone: string
}

type QuestDialogPanelProps = {
  npcName?: string
  npcTitle?: string
  onAccept?: () => void
  onDecline?: () => void
}

const DIALOG_LINES = [
  'The wind over HermesWorld is carrying a strange static tonight.',
  'Our builders have opened new panels, but the vault locks will only answer a player who knows the old route names.',
  'Find the glowing pins on the world map, inspect your inventory, then return with the founder sigil intact.',
]

const CHOICES: QuestChoice[] = [
  { id: 'ask-lore', label: 'Ask about the static', tone: 'Lore' },
  { id: 'promise', label: 'Promise to recover the sigil', tone: 'Heroic' },
  { id: 'request-reward', label: 'Request the reward terms', tone: 'Pragmatic' },
]

export function QuestDialogPanel({ npcName = 'Athena', npcTitle = 'Oracle of the Agora', onAccept, onDecline }: QuestDialogPanelProps) {
  return (
    <section
      role="dialog"
      aria-label="Quest dialog"
      className="w-[min(94vw,760px)] overflow-hidden rounded-[30px] border border-[#d9b35f]/45 bg-[linear-gradient(135deg,rgba(38,27,14,.97),rgba(8,7,13,.96)_54%,rgba(2,6,18,.94))] text-[#f9e7b5] shadow-[0_30px_100px_rgba(0,0,0,.68),inset_0_1px_0_rgba(255,255,255,.12)] backdrop-blur-xl"
    >
      <div className="grid gap-0 md:grid-cols-[230px_1fr]">
        <aside className="border-b border-[#d9b35f]/25 bg-[radial-gradient(circle_at_50%_15%,rgba(251,191,36,.24),transparent_46%),linear-gradient(180deg,rgba(217,179,95,.16),rgba(0,0,0,.18))] p-5 md:border-b-0 md:border-r">
          <div className="mx-auto flex max-w-[190px] flex-col items-center text-center">
            <div className="relative h-36 w-36 overflow-hidden rounded-[28px] border-2 border-[#d9b35f]/55 bg-[linear-gradient(180deg,rgba(217,179,95,.24),rgba(17,24,39,.9))] shadow-[0_0_35px_rgba(217,179,95,.22)]">
              <img
                alt={`${npcName} portrait`}
                src="/avatars/athena.png"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-6xl" aria-hidden>⚜️</div>
            </div>
            <h2 className="mt-4 font-serif text-2xl font-black text-[#ffe7a3]">Quest Dialog</h2>
            <p className="mt-1 text-sm font-bold text-white">{npcName}</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#d9b35f]/72">{npcTitle}</p>
          </div>
        </aside>

        <div className="flex min-h-[430px] flex-col p-5">
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-[#d9b35f]/20 pb-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#d9b35f]/70">Main Quest</p>
              <h3 className="font-serif text-xl font-black text-[#ffe7a3]">The Founder Signal</h3>
            </div>
            <span className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Available</span>
          </div>

          <div aria-label="Dialog scroll" role="region" className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[#d9b35f]/18 bg-black/28 p-4 shadow-inner">
            {DIALOG_LINES.map((line) => (
              <p key={line} className="mb-3 text-sm leading-6 text-[#f9e7b5]/84">
                <span className="mr-2 text-[#d9b35f]">✦</span>{line}
              </p>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {CHOICES.map((choice) => (
              <button key={choice.id} className="rounded-2xl border border-[#d9b35f]/28 bg-[#d9b35f]/8 px-3 py-2 text-left transition hover:border-[#fbbf24]/55 hover:bg-[#fbbf24]/14">
                <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-[#d9b35f]/68">{choice.tone}</span>
                <span className="text-xs font-bold text-[#f9e7b5]">{choice.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={onDecline} className="rounded-2xl border border-white/14 px-4 py-2 text-sm font-bold text-white/65 transition hover:bg-white/8">
              Decline
            </button>
            <button onClick={onAccept} className="rounded-2xl border border-[#fbbf24]/50 bg-[linear-gradient(180deg,#fde68a,#d9b35f)] px-5 py-2 text-sm font-black text-[#1d1307] shadow-[0_12px_35px_rgba(217,179,95,.28)] transition hover:brightness-110">
              Accept Quest
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
