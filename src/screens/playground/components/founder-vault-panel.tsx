type FounderReward = {
  id: string
  name: string
  icon: string
  description: string
}

type FounderVaultPanelProps = {
  eligible?: boolean
  claimedRewardIds?: string[]
  onClaim?: () => void
}

const REWARDS: FounderReward[] = [
  { id: 'founder-cape', name: 'Founder Cape', icon: '🧥', description: 'Animated gold-trim cloak cosmetic.' },
  { id: 'founder-banner', name: 'Founder Banner', icon: '🏳️', description: 'Guild banner for house halls.' },
  { id: 'aether-50', name: 'Aether x50', icon: '💠', description: 'Premium crafting currency.' },
  { id: 'coins-1000', name: 'Coins x1000', icon: '🪙', description: 'Starter bankroll for shops.' },
  { id: 'trader-trial', name: 'Trader Agent Trial', icon: '🤖', description: 'Trial access to the Trader Agent.' },
  { id: 'founder-title', name: 'Founder Title', icon: '👑', description: 'Permanent account title.' },
  { id: 'founder-pet', name: 'Founder Pet', icon: '🐉', description: 'Tiny aether wyrm companion.' },
]

export function FounderVaultPanel({ eligible = false, claimedRewardIds = [], onClaim }: FounderVaultPanelProps) {
  const claimed = new Set(claimedRewardIds)
  const allClaimed = REWARDS.every((reward) => claimed.has(reward.id))
  const canClaim = eligible && !allClaimed

  return (
    <section
      aria-label="Founder vault panel"
      className="w-[min(94vw,720px)] rounded-[32px] border border-[#d9b35f]/50 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,.21),transparent_38%),linear-gradient(180deg,rgba(30,21,12,.98),rgba(5,5,11,.96))] p-5 text-[#f9e7b5] shadow-[0_30px_100px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.12)]"
    >
      <header className="mb-4 flex flex-col gap-3 border-b border-[#d9b35f]/25 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#d9b35f]/72">Limited Reward Cache</p>
          <h2 className="font-serif text-3xl font-black text-[#ffe7a3]">Founder Vault</h2>
          <p className="mt-1 max-w-xl text-sm text-[#f9e7b5]/68">Seven founder rewards unlock once your account clears the launch-event condition gate.</p>
        </div>
        <span className="w-fit rounded-full border border-[#d9b35f]/35 bg-black/32 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#d9b35f]">
          {claimed.size}/{REWARDS.length} claimed
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {REWARDS.map((reward) => {
          const isClaimed = claimed.has(reward.id)
          return (
            <article
              key={reward.id}
              data-testid="founder-reward-slot"
              className="relative min-h-[148px] rounded-3xl border border-[#d9b35f]/32 bg-[linear-gradient(180deg,rgba(217,179,95,.13),rgba(0,0,0,.32))] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.08)]"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#fbbf24]/35 bg-black/30 text-3xl shadow-[0_0_22px_rgba(251,191,36,.18)]" aria-hidden>
                {reward.icon}
              </div>
              <h3 className="mt-2 text-sm font-black leading-tight text-[#ffe7a3]">{reward.name}</h3>
              <p className="mt-1 text-[10px] leading-snug text-[#f9e7b5]/62">{reward.description}</p>
              <div className={`mt-2 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${isClaimed ? 'bg-emerald-300/15 text-emerald-200' : 'bg-black/30 text-[#d9b35f]/72'}`}>
                {isClaimed ? 'Claimed' : 'Locked'}
              </div>
            </article>
          )
        })}
      </div>

      <footer className="mt-5 flex flex-col gap-3 rounded-3xl border border-[#d9b35f]/24 bg-black/24 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-[#ffe7a3]">Founder condition</p>
          <p className="text-xs text-[#f9e7b5]/64">Reserve name + complete launch tutorial. Eligibility syncs from the account ledger.</p>
        </div>
        <button
          onClick={onClaim}
          disabled={!canClaim}
          aria-label="Claim Founder Vault"
          className="rounded-2xl border border-[#fbbf24]/45 bg-[linear-gradient(180deg,#fde68a,#d9b35f)] px-5 py-2.5 text-sm font-black text-[#211507] shadow-[0_14px_40px_rgba(217,179,95,.28)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-none disabled:bg-white/8 disabled:text-white/38 disabled:shadow-none"
        >
          {allClaimed ? 'Vault Claimed' : eligible ? 'Claim Founder Vault' : 'Conditions Not Met'}
        </button>
      </footer>
    </section>
  )
}
