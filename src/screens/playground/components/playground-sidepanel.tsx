/**
 * RuneScape-style consolidated right side panel.
 * Tabs: Inventory · Skills · Quests · Worlds · Settings
 *
 * Replaces the scattered right-side cards with one panel + tab switcher,
 * matching OSRS / PlayROHAN conventions. Also exposes a compact quest
 * tracker pinned above for at-a-glance objectives.
 */
import { useState } from 'react'
import {
  itemById,
  PLAYGROUND_ITEMS,
  PLAYGROUND_QUESTS,
  PLAYGROUND_SKILLS,
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
  worldAccent: string
}

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'inventory', label: 'Inventory', icon: '🎒' },
  { id: 'skills', label: 'Skills', icon: '✨' },
  { id: 'quests', label: 'Quests', icon: '📜' },
  { id: 'worlds', label: 'Worlds', icon: '🗺️' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export function PlaygroundSidePanel({
  state,
  currentWorld,
  worlds,
  onSelectWorld,
  onReset,
  worldAccent,
}: Props) {
  const [tab, setTab] = useState<TabId>('inventory')

  const activeQuest = PLAYGROUND_QUESTS.find(
    (q) => !state.completedQuests.includes(q.id),
  )

  return (
    <>
      {/* Quest tracker pin (above panel) */}
      {activeQuest && (
        <div
          className="pointer-events-auto fixed right-3 top-[210px] z-[70] w-[260px] rounded-2xl border-2 bg-gradient-to-b from-[#0b1320]/92 to-black/86 p-3 text-white shadow-2xl backdrop-blur-xl"
          style={{ borderColor: `${worldAccent}55`, boxShadow: `0 0 16px ${worldAccent}33, 0 8px 22px rgba(0,0,0,.55)` }}
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/55">Quest Tracker</span>
            <span className="text-[9px] uppercase tracking-[0.12em] text-white/40">J for journal</span>
          </div>
          <div className="text-[12px] font-bold leading-tight" style={{ color: worldAccent }}>
            {activeQuest.title}
          </div>
          <div className="mt-1.5 space-y-1">
            {activeQuest.objectives.map((o) => (
              <div key={o.id} className="flex items-start gap-1.5 text-[10px] leading-tight text-white/80">
                <span className="text-white/40">▢</span>
                <span>{o.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Right-side consolidated panel */}
      <div
        className="pointer-events-auto fixed right-3 top-[378px] z-[70] w-[260px] rounded-2xl border-2 border-white/15 bg-gradient-to-b from-[#0b1320]/92 to-black/86 text-white shadow-2xl backdrop-blur-xl"
        style={{ boxShadow: `0 0 18px ${worldAccent}33, 0 12px 36px rgba(0,0,0,.6)` }}
      >
        {/* Tabs */}
        <div className="flex items-center justify-between gap-1 border-b border-white/10 px-1.5 py-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-1 flex-col items-center justify-center rounded-md py-1 text-[9px] font-bold uppercase tracking-[0.08em] transition-colors"
              style={{
                color: tab === t.id ? worldAccent : 'rgba(255,255,255,0.55)',
                background: tab === t.id ? `${worldAccent}1f` : 'transparent',
                boxShadow: tab === t.id ? `inset 0 -2px 0 ${worldAccent}` : 'none',
              }}
              title={t.label}
            >
              <span className="text-base leading-none">{t.icon}</span>
            </button>
          ))}
        </div>

        <div className="p-3 max-h-[420px] overflow-y-auto">
          {tab === 'inventory' && <InventoryTab state={state} />}
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
          {tab === 'settings' && (
            <SettingsTab onReset={onReset} />
          )}
        </div>
      </div>
    </>
  )
}

function InventoryTab({ state }: { state: PlaygroundRpgState }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: 24 }).map((_, i) => {
        const id = state.inventory[i] as PlaygroundItemId | undefined
        const item = id ? itemById(id) : undefined
        return (
          <div
            key={i}
            title={item?.description ?? 'Empty slot'}
            className="flex h-14 flex-col items-center justify-center rounded-lg border border-white/10 bg-black/35 text-center hover:border-white/30"
          >
            {item ? (
              <>
                <div className="text-xl leading-tight">{item.icon}</div>
                <div className="max-w-[56px] truncate text-[8px] text-white/55">{item.name}</div>
              </>
            ) : (
              <div className="text-white/15">＋</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SkillsTab({ state }: { state: PlaygroundRpgState }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PLAYGROUND_SKILLS.map((skill) => {
        const xp = state.skillXp[skill.id] ?? 0
        const level = Math.floor(xp / 100) + 1
        const inLevelXp = xp % 100
        return (
          <div key={skill.id} className="rounded-lg border border-white/10 bg-black/35 p-2">
            <div className="flex items-center gap-1.5">
              <span className="text-base">{skill.icon}</span>
              <div className="flex-1">
                <div className="text-[10px] font-bold leading-tight">{skill.name}</div>
                <div className="text-[9px] text-white/45">Lv. {level}</div>
              </div>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/60">
              <div className="h-full rounded-full bg-cyan-400" style={{ width: `${inLevelXp}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function QuestsTab({ state, accent }: { state: PlaygroundRpgState; accent: string }) {
  return (
    <div className="space-y-2">
      {PLAYGROUND_QUESTS.map((q) => {
        const done = state.completedQuests.includes(q.id)
        return (
          <div
            key={q.id}
            className="rounded-lg border p-2"
            style={{
              borderColor: done ? '#10b98155' : `${accent}33`,
              background: done ? '#10b9810f' : 'rgba(0,0,0,0.35)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold leading-tight">{q.title}</div>
              <div className="text-[9px]" style={{ color: done ? '#10b981' : accent }}>
                {done ? 'DONE' : '...'}
              </div>
            </div>
            <div className="mt-0.5 text-[9px] leading-tight text-white/55">{q.chapter}</div>
            <div className="mt-1 space-y-0.5">
              {q.objectives.map((o) => (
                <div key={o.id} className="flex items-start gap-1.5 text-[9px] leading-tight text-white/70">
                  <span className="text-white/40">{done ? '☑' : '▢'}</span>
                  <span>{o.label}</span>
                </div>
              ))}
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

function SettingsTab({ onReset }: { onReset?: () => void }) {
  return (
    <div className="space-y-2 text-[10px] text-white/70">
      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/55">Controls</div>
        <ul className="mt-1 space-y-0.5">
          <li>• Click ground = walk there</li>
          <li>• WASD = move (camera-relative)</li>
          <li>• Arrows = orbit camera</li>
          <li>• Shift = sprint</li>
          <li>• [ / ] = zoom</li>
          <li>• E = talk · J = journal · M = map · T = chat</li>
          <li>• 1-6 = action skills</li>
        </ul>
      </div>
      {onReset && (
        <button
          onClick={onReset}
          className="mt-2 w-full rounded-md border border-rose-300/30 bg-rose-400/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-200 hover:bg-rose-400/20"
        >
          Reset Progress
        </button>
      )}
      <div className="pt-1 text-[9px] text-white/40">
        Multiplayer arrives next sprint. {PLAYGROUND_ITEMS.length} items / {PLAYGROUND_QUESTS.length} quests defined.
      </div>
    </div>
  )
}
