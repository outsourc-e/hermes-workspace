import { useState } from 'react'
import {
  itemById,
  PLAYGROUND_QUESTS,
  type EquipmentSlot,
  type PlaygroundItemId,
  type PlaygroundWorldId,
} from '../lib/playground-rpg'
import type { PlaygroundRpgState } from '../hooks/use-playground-rpg'

type TabId = 'inventory' | 'skills' | 'quests' | 'worlds' | 'settings'

type Props = {
  state: PlaygroundRpgState
  currentWorld: PlaygroundWorldId
  worlds: Array<{ id: PlaygroundWorldId; name: string; tagline: string; accent: string }>
  onSelectWorld: (world: PlaygroundWorldId) => void
  onReset?: () => void
  onReplayTutorial?: () => void
  onOpenInventory?: () => void
  onEquipItem: (itemId: PlaygroundItemId) => void
  onUnequipSlot: (slot: EquipmentSlot) => void
  worldAccent: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'inventory', label: 'Inventory', icon: '🎒' },
  { id: 'skills', label: 'Skills', icon: '✨' },
  { id: 'quests', label: 'Quests', icon: '📜' },
  { id: 'worlds', label: 'Worlds', icon: '🗺️' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

const SLOT_LABELS: Array<{ slot: EquipmentSlot; label: string }> = [
  { slot: 'weapon', label: 'Weapon' },
  { slot: 'cloak', label: 'Cloak' },
  { slot: 'head', label: 'Head' },
  { slot: 'artifact', label: 'Artifact' },
]

const EMPTY_SLOT_ICONS: Record<EquipmentSlot, string> = {
  weapon: '⚔',
  cloak: '🜁',
  head: '◌',
  artifact: '✦',
}

export function PlaygroundSidePanel({
  state,
  currentWorld,
  worlds,
  onSelectWorld,
  onReset,
  onReplayTutorial,
  onOpenInventory,
  onEquipItem,
  onUnequipSlot,
  worldAccent,
  open = true,
  onOpenChange,
}: Props) {
  const [tab, setTab] = useState<TabId>('inventory')

  const activeQuest = PLAYGROUND_QUESTS.find(
    (quest) => !quest.optional && !state.completedQuests.includes(quest.id),
  )
  const progress = activeQuest
    ? state.playerProfile.questProgress[activeQuest.id]
    : undefined
  const tutorialStep = activeQuest?.id.startsWith('training-q')
    ? Number(activeQuest.id.slice(-1))
    : null
  const trackerIcon = activeQuest ? iconForObjective(activeQuest.objectives.find((objective) => !progress?.completedObjectives.includes(objective.id))?.type) : '✓'

  return (
    <div className="pointer-events-none fixed inset-0 z-[75] md:inset-auto md:pointer-events-auto">
      {open && <div className="absolute inset-0 bg-black/55 backdrop-blur-sm md:hidden" onClick={() => onOpenChange?.(false)} />}
      {activeQuest && (
        <div
          className="pointer-events-auto fixed left-3 right-3 top-3 z-[76] rounded-2xl border-2 bg-gradient-to-b from-[#0b1320]/92 to-black/86 p-3 text-white shadow-2xl backdrop-blur-xl md:left-auto md:right-3 md:top-[260px] md:w-[280px]"
          style={{ borderColor: `${worldAccent}55`, boxShadow: `0 0 16px ${worldAccent}33, 0 8px 22px rgba(0,0,0,.55)` }}
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/55">Quest Tracker</span>
            <span className="text-[9px] uppercase tracking-[0.12em] text-white/40">J for journal</span>
          </div>
          <div className="flex items-start gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg">
              {trackerIcon}
            </div>
            <div>
              <div className="text-[12px] font-bold leading-tight" style={{ color: worldAccent }}>
                {activeQuest.title}
              </div>
              {tutorialStep && (
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  Step {tutorialStep} of 5
                </div>
              )}
            </div>
          </div>
          <div className="mt-1.5 space-y-1">
            {activeQuest.objectives.map((objective) => {
              const done = progress?.completedObjectives.includes(objective.id)
              return (
                <div key={objective.id} className="flex items-start gap-1.5 text-[10px] leading-tight text-white/80">
                  <span className={done ? 'text-emerald-300' : 'text-white/40'}>{done ? '☑' : '▢'}</span>
                  <span>{objective.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {(open || typeof window === 'undefined') && (
        <div
          className="pointer-events-auto fixed bottom-4 left-3 right-3 top-[122px] z-[76] rounded-2xl border-2 border-white/15 bg-gradient-to-b from-[#0b1320]/92 to-black/86 text-white shadow-2xl backdrop-blur-xl md:bottom-auto md:left-auto md:right-3 md:top-[438px] md:block md:w-[280px]"
          style={{ boxShadow: `0 0 18px ${worldAccent}33, 0 12px 36px rgba(0,0,0,.6)` }}
        >
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 md:hidden">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Playground Menu</div>
          <button
            type="button"
            onClick={() => onOpenChange?.(false)}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/60"
          >
            Close
          </button>
        </div>
        <div className="flex items-center justify-between gap-1 border-b border-white/10 px-1.5 py-1.5">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              onClick={() => {
                setTab(entry.id)
                if (entry.id === 'inventory') onOpenInventory?.()
              }}
              className="flex flex-1 flex-col items-center justify-center rounded-md py-1 text-[9px] font-bold uppercase tracking-[0.08em] transition-colors"
              style={{
                color: tab === entry.id ? worldAccent : 'rgba(255,255,255,0.55)',
                background: tab === entry.id ? `${worldAccent}1f` : 'transparent',
                boxShadow: tab === entry.id ? `inset 0 -2px 0 ${worldAccent}` : 'none',
              }}
              title={entry.label}
            >
              <span className="text-base leading-none">{entry.icon}</span>
            </button>
          ))}
        </div>

        <div className="max-h-[430px] overflow-y-auto p-3">
          {tab === 'inventory' && (
            <InventoryTab
              state={state}
              onEquipItem={onEquipItem}
              onUnequipSlot={onUnequipSlot}
            />
          )}
          {tab === 'skills' && <SkillsTab state={state} />}
          {tab === 'quests' && <QuestsTab state={state} accent={worldAccent} />}
          {tab === 'worlds' && (
            <WorldsTab
              state={state}
              worlds={worlds}
              currentWorld={currentWorld}
              onSelectWorld={onSelectWorld}
            />
          )}
          {tab === 'settings' && <SettingsTab onReset={onReset} onReplayTutorial={onReplayTutorial} />}
        </div>
        </div>
      )}
    </div>
  )
}

function iconForObjective(type: string | undefined) {
  switch (type) {
    case 'visit_zone':
      return '➜'
    case 'equip_item':
    case 'open_inventory':
      return '🧥'
    case 'send_chat':
      return '💬'
    case 'inspect_docs':
      return '📚'
    case 'build_prompt':
      return '⚒'
    default:
      return '✦'
  }
}

function InventoryTab({
  state,
  onEquipItem,
  onUnequipSlot,
}: {
  state: PlaygroundRpgState
  onEquipItem: (itemId: PlaygroundItemId) => void
  onUnequipSlot: (slot: EquipmentSlot) => void
}) {
  const inventory = state.playerProfile.inventory
  const equipped = state.playerProfile.equipped

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/55">Equipped</div>
        <div className="grid grid-cols-2 gap-2">
          {SLOT_LABELS.map(({ slot, label }) => {
            const item = equipped[slot] ? itemById(equipped[slot]!) : null
            return (
              <button
                key={slot}
                onClick={() => item && onUnequipSlot(slot)}
                className="rounded-lg border bg-black/35 p-2 text-left"
                style={{
                  borderColor: item ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.18)',
                  outline: item ? 'none' : '1px dashed rgba(255,255,255,0.14)',
                  outlineOffset: '-4px',
                }}
                title={item ? `Unequip ${item.name}` : `Empty ${label} slot`}
              >
                <div className="text-[9px] uppercase tracking-[0.12em] text-white/45">{label}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`text-lg ${item ? '' : 'text-white/30'}`}>{item?.icon || EMPTY_SLOT_ICONS[slot]}</span>
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-semibold">{item?.name || 'Empty'}</div>
                    <div className="text-[8px] text-white/45">{item?.stat ? `${item.stat.label} +${item.stat.value}` : 'Click item below to equip'}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/55">Inventory</div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 24 }).map((_, index) => {
            const id = inventory[index]
            const item = id ? itemById(id) : undefined
            const isEquipped = id ? Object.values(equipped).includes(id) : false
            return (
              <button
                key={index}
                type="button"
                disabled={!id}
                onClick={() => id && onEquipItem(id)}
                title={item?.description ?? 'Empty slot'}
                className="flex h-16 flex-col items-center justify-center rounded-lg border border-white/10 bg-black/35 text-center transition hover:border-white/30 disabled:cursor-default"
              >
                {item ? (
                  <>
                    <div className="text-xl leading-tight">{item.icon}</div>
                    <div className="max-w-[56px] truncate text-[8px] text-white/75">{item.name}</div>
                    <div className="text-[7px] uppercase tracking-[0.1em] text-white/45">
                      {isEquipped ? 'Equipped' : item.slot ? 'Equip' : item.rarity}
                    </div>
                  </>
                ) : (
                  <div className="text-white/15">＋</div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SkillsTab({ state }: { state: PlaygroundRpgState }) {
  const entries = [
    { label: 'Power', value: state.playerProfile.equipped.weapon ? itemById(state.playerProfile.equipped.weapon)?.stat?.value ?? 0 : 0, color: '#fb7185' },
    { label: 'Guard', value: state.playerProfile.equipped.cloak ? itemById(state.playerProfile.equipped.cloak)?.stat?.value ?? 0 : 0, color: '#22d3ee' },
    { label: 'Command', value: state.playerProfile.equipped.head ? itemById(state.playerProfile.equipped.head)?.stat?.value ?? 0 : 0, color: '#facc15' },
    { label: 'Recall', value: state.playerProfile.equipped.artifact ? itemById(state.playerProfile.equipped.artifact)?.stat?.value ?? 0 : 0, color: '#a78bfa' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.map((entry) => (
        <div key={entry.label} className="rounded-lg border border-white/10 bg-black/35 p-2">
          <div className="text-[10px] font-bold leading-tight">{entry.label}</div>
          <div className="mt-1 text-[18px] font-extrabold" style={{ color: entry.color }}>
            +{entry.value}
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/60">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, entry.value * 18)}%`, background: entry.color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function QuestsTab({ state, accent }: { state: PlaygroundRpgState; accent: string }) {
  return (
    <div className="space-y-2">
      {PLAYGROUND_QUESTS.map((quest) => {
        const done = state.completedQuests.includes(quest.id)
        const progress = state.playerProfile.questProgress[quest.id]
        return (
          <div
            key={quest.id}
            className="rounded-lg border p-2"
            style={{
              borderColor: done ? '#10b98155' : `${accent}33`,
              background: done ? '#10b9810f' : 'rgba(0,0,0,0.35)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold leading-tight">{quest.title}</div>
              <div className="text-[9px]" style={{ color: done ? '#10b981' : accent }}>
                {done ? 'DONE' : quest.optional ? 'BONUS' : '...'}
              </div>
            </div>
            <div className="mt-0.5 text-[9px] leading-tight text-white/55">{quest.chapter}</div>
            <div className="mt-1 space-y-0.5">
              {quest.objectives.map((objective) => {
                const complete = progress?.completedObjectives.includes(objective.id)
                return (
                  <div key={objective.id} className="flex items-start gap-1.5 text-[9px] leading-tight text-white/70">
                    <span className="text-white/40">{complete ? '☑' : '▢'}</span>
                    <span>{objective.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function WorldsTab({
  state,
  worlds,
  currentWorld,
  onSelectWorld,
}: {
  state: PlaygroundRpgState
  worlds: Array<{ id: PlaygroundWorldId; name: string; tagline: string; accent: string }>
  currentWorld: PlaygroundWorldId
  onSelectWorld: (world: PlaygroundWorldId) => void
}) {
  return (
    <div className="space-y-1.5">
      {worlds.map((world) => {
        const unlocked = state.unlockedWorlds.includes(world.id)
        const active = world.id === currentWorld
        return (
          <button
            key={world.id}
            disabled={!unlocked}
            onClick={() => onSelectWorld(world.id)}
            className="flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-40"
            style={{
              borderColor: active ? world.accent : 'rgba(255,255,255,.12)',
              background: active ? `${world.accent}22` : 'rgba(255,255,255,.04)',
            }}
          >
            <div>
              <div className="text-[11px] font-semibold">{world.name}</div>
              <div className="text-[9px] text-white/45">{unlocked ? world.tagline : 'Locked'}</div>
            </div>
            <div className="text-sm">{unlocked ? (active ? '●' : '→') : '🔒'}</div>
          </button>
        )
      })}
      <div className="pt-1 text-[9px] uppercase tracking-[0.12em] text-white/40">
        {Math.min(state.unlockedWorlds.length, worlds.length)} / {worlds.length} unlocked
      </div>
    </div>
  )
}

function SettingsTab({
  onReset,
  onReplayTutorial,
}: {
  onReset?: () => void
  onReplayTutorial?: () => void
}) {
  return (
    <div className="space-y-2 text-[10px] text-white/70">
      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/55">Controls</div>
        <ul className="mt-1 space-y-0.5">
          <li>WASD move · Shift sprint</li>
          <li>E talk · T chat · J journal · M world map · C avatar</li>
          <li>Drag with mouse to rotate camera · wheel to zoom</li>
          <li>Arrow keys still orbit view · 1 Strike · 2 Dash · 3 Bolt</li>
          <li><strong>F focus mode</strong> (hide rail) · Esc closes panels + focus</li>
        </ul>
      </div>
      {onReset && (
        <button
          onClick={onReset}
          className="rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-100 hover:bg-rose-500/20"
        >
          Reset local profile
        </button>
      )}
      {onReplayTutorial && (
        <button
          onClick={onReplayTutorial}
          className="w-full rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-400/20"
        >
          Replay tutorial
        </button>
      )}
    </div>
  )
}
