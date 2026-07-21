import { FounderVaultPanel } from './founder-vault-panel'
import { InventoryPanel } from './inventory-panel'
import { MapPanel } from './map-panel'
import { QuestDialogPanel } from './quest-dialog-panel'

export function WaveChatPanelsShowcase() {
  return (
    <main
      aria-label="Wave chat panel showcase"
      className="min-h-full bg-[radial-gradient(circle_at_50%_0%,rgba(217,179,95,.18),transparent_34%),linear-gradient(180deg,#07050b,#02030a)] px-4 py-8 text-[#f9e7b5]"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="rounded-[28px] border border-[#d9b35f]/35 bg-black/28 p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#d9b35f]/72">Lovable Wave Chat Panels</p>
          <h1 className="mt-2 font-serif text-4xl font-black text-[#ffe7a3]">Panel Component Showcase</h1>
          <p className="mt-2 max-w-3xl text-sm text-[#f9e7b5]/68">
            Dev-server screenshot surface for A12 inventory, A13 quest dialog, A14 map, and A15 founder vault mockups. Built as real React components — no PNG hacks.
          </p>
        </header>

        <section className="grid gap-8 xl:grid-cols-2">
          <div className="flex justify-center"><InventoryPanel /></div>
          <div className="flex justify-center"><FounderVaultPanel eligible /></div>
        </section>

        <section className="flex justify-center">
          <QuestDialogPanel />
        </section>

        <section className="flex justify-center">
          <MapPanel />
        </section>
      </div>
    </main>
  )
}
