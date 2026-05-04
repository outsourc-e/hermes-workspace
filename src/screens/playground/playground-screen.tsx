import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PlaygroundActionBar } from './components/playground-actionbar'
import { PlaygroundChat, type ChatMessage } from './components/playground-chat'
import { PlaygroundCustomizer } from './components/playground-customizer'
import { PlaygroundDialog } from './components/playground-dialog'
import { PlaygroundHeroCanvas } from './components/playground-hero-canvas'
import { PlaygroundHud } from './components/playground-hud'
import { PlaygroundJournal } from './components/playground-journal'
import { PlaygroundMap } from './components/playground-map'
import { PlaygroundMinimap } from './components/playground-minimap'
import { PlaygroundSidePanel } from './components/playground-sidepanel'
import { PlaygroundWorld3D } from './components/playground-world-3d'
import { usePlaygroundRpg } from './hooks/use-playground-rpg'
import { playgroundAudio, usePlaygroundAudioMuted } from './lib/playground-audio'
import { autoNarrateWorld, cancelNarration, isNarrationMuted, setNarrationMuted, narrateWorldNow } from './lib/playground-narration'
import { botsFor } from './lib/playground-bots'
import { itemById, PLAYGROUND_WORLDS, type PlaygroundItemId, type PlaygroundWorldId } from './lib/playground-rpg'
import type { RemotePlayer } from './hooks/use-playground-multiplayer'

const WORLD_META: Record<PlaygroundWorldId, { name: string; accent: string }> = {
  training: { name: 'Training Grounds', accent: '#5eead4' },
  agora: { name: 'Agora Commons', accent: '#d9b35f' },
  forge: { name: 'The Forge', accent: '#22d3ee' },
  grove: { name: 'The Grove', accent: '#34d399' },
  oracle: { name: 'Oracle Temple', accent: '#a78bfa' },
  arena: { name: 'Benchmark Arena', accent: '#fb7185' },
}

const FORGE_INTRO_STORAGE_KEY = 'hermes-playground-forge-intro-seen'
const FORGE_FALLBACK_FLAVOR =
  'The Forge wakes with a lattice of cyan sparks as half-finished tools hum themselves into being around you.'

type ForgeIntroState =
  | { open: false; flavor: string; loading: false }
  | { open: true; flavor: string; loading: boolean }

class PlaygroundErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Playground render failed', error)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

export function PlaygroundScreen() {
  const rpg = usePlaygroundRpg()
  const audioMuted = usePlaygroundAudioMuted()
  const [launched, setLaunched] = useState(false)
  const [world, setWorld] = useState<PlaygroundWorldId>(rpg.state.playerProfile.lastZone)
  const [dialogNpc, setDialogNpc] = useState<string | null>(null)
  const [nearbyNpc, setNearbyNpc] = useState<string | null>(null)
  const [journalOpen, setJournalOpen] = useState(false)
  const [customizerOpen, setCustomizerOpen] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [botBubbles, setBotBubbles] = useState<Record<string, string>>({})
  const [mapOpen, setMapOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [tutorialCompleteOpen, setTutorialCompleteOpen] = useState(false)
  const [forgeIntro, setForgeIntro] = useState<ForgeIntroState>({ open: false, flavor: '', loading: false })
  const [transitioning, setTransitioning] = useState(false)
  const [monsterHp, setMonsterHp] = useState(44)
  const [remotePlayers, setRemotePlayers] = useState<Record<string, RemotePlayer>>({})
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)
  const [objectivePulseKey, setObjectivePulseKey] = useState(0)
  // Focus mode — hides side rail (Quest Tracker, Inventory panel, Builders Nearby chip)
  // so the player can see the world while playing/recording.
  // Auto-engages on first movement; toggle with F.
  const [focusMode, setFocusMode] = useState(false)
  const focusModeAutoEngagedRef = useRef(false)
  // Narration mute (Web Speech API). Initialized from persisted state.
  const [narrationMuted, setNarrationMutedState] = useState(false)
  useEffect(() => {
    setNarrationMutedState(isNarrationMuted())
  }, [])
  const heardToastIds = useRef<Set<string>>(new Set())
  const completedTutorialRef = useRef(false)
  const lowHpArmedRef = useRef(true)
  const forgeIntroSeenRef = useRef(false)
  const objectiveSignatureRef = useRef<string>('')
  const monsterHpMax = 44

  const activeQuest = rpg.activeQuest
  const currentObjective = rpg.currentObjective
  const forgeUnlocked = rpg.state.unlockedWorlds.includes('forge')
  const monsterDefeated = rpg.state.completedQuests.includes('training-bonus-wisp')
  const remotePlayersInZone = useMemo(
    () => Object.values(remotePlayers).filter((player) => player.world === world),
    [remotePlayers, world],
  )
  // Diplomacy: mark meet-builder objective the first time we see another
  // live player in our world.
  useEffect(() => {
    if (remotePlayersInZone.length > 0) {
      rpg.markObjective('agora-diplomacy', 'meet-builder')
    }
  }, [remotePlayersInZone.length, rpg])
  const lowHpThreshold = rpg.state.hpMax * 0.25
  const lowHpRecoverThreshold = rpg.state.hpMax * 0.3
  const lowHpActive = rpg.state.hp <= lowHpThreshold

  useEffect(() => {
    if (typeof window === 'undefined') return
    forgeIntroSeenRef.current = window.localStorage.getItem(FORGE_INTRO_STORAGE_KEY) === '1'
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => setIsNarrow(window.innerWidth < 760)
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  useEffect(() => {
    setWorld(rpg.state.playerProfile.lastZone)
  }, [rpg.state.playerProfile.lastZone])

  useEffect(() => {
    rpg.setLastZone(world)
  }, [rpg, world])

  useEffect(() => {
    if (!monsterDefeated) setMonsterHp(monsterHpMax)
  }, [monsterDefeated, world])

  useEffect(() => {
    const completed = rpg.state.completedQuests.includes('training-q5')
    if (completed && !completedTutorialRef.current) {
      completedTutorialRef.current = true
      setTutorialCompleteOpen(true)
      playgroundAudio.playQuestComplete()
      window.setTimeout(() => playgroundAudio.playPortalUnlock(), 120)
    }
    if (!completed) {
      completedTutorialRef.current = false
    }
  }, [rpg.state.completedQuests])

  useEffect(() => {
    const signature = `${activeQuest?.id ?? 'done'}:${currentObjective?.id ?? 'idle'}`
    if (signature !== objectiveSignatureRef.current) {
      objectiveSignatureRef.current = signature
      setObjectivePulseKey((value) => value + 1)
    }
  }, [activeQuest?.id, currentObjective?.id])

  useEffect(() => {
    for (const toast of rpg.toasts) {
      if (heardToastIds.current.has(toast.id)) continue
      heardToastIds.current.add(toast.id)
      if (toast.kind === 'quest' || toast.kind === 'title') playgroundAudio.playQuestComplete()
      if (toast.kind === 'item') playgroundAudio.playRewardPickup()
    }
  }, [rpg.toasts])

  useEffect(() => {
    if (rpg.state.hp <= lowHpThreshold && lowHpArmedRef.current) {
      lowHpArmedRef.current = false
      playgroundAudio.playLowHpWarning()
      return
    }
    if (rpg.state.hp > lowHpRecoverThreshold) {
      lowHpArmedRef.current = true
    }
  }, [lowHpRecoverThreshold, lowHpThreshold, rpg.state.hp])

  useEffect(() => {
    if (!launched) {
      playgroundAudio.setAmbient(null)
      return
    }
    if (world === 'training' || world === 'forge') {
      playgroundAudio.setAmbient(world)
      return
    }
    playgroundAudio.setAmbient(null)
  }, [launched, world, audioMuted])

  // Auto-narrate each world the first time you enter it (per session).
  // Cancels prior narration when you change worlds.
  useEffect(() => {
    if (!launched) return
    cancelNarration()
    autoNarrateWorld(world)
  }, [launched, world])

  useEffect(() => {
    let cancelled = false
    function tick() {
      if (cancelled) return
      const bots = botsFor(world)
      if (bots.length > 0) {
        const bot = bots[Math.floor(Math.random() * bots.length)]
        const line = bot.lines[Math.floor(Math.random() * bot.lines.length)]
        const msg: ChatMessage = {
          id: `${Date.now()}-${Math.random()}`,
          authorId: `bot:${bot.id}`,
          authorName: bot.name,
          body: line,
          ts: Date.now(),
          color: bot.color,
        }
        setMessages((prev) => [...prev, msg].slice(-40))
        setBotBubbles((prev) => ({ ...prev, [bot.id]: line }))
        window.setTimeout(() => {
          setBotBubbles((prev) => {
            const next = { ...prev }
            delete next[bot.id]
            return next
          })
        }, 5000)
      }
      window.setTimeout(tick, 6000 + Math.random() * 8000)
    }
    const initial = window.setTimeout(tick, 2500)
    return () => {
      cancelled = true
      window.clearTimeout(initial)
    }
  }, [world])

  useEffect(() => {
    ;(window as any).__hermesPlaygroundOpenDialog = (id: string) => setDialogNpc(id)
    return () => { try { delete (window as any).__hermesPlaygroundOpenDialog } catch {} }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        if (event.key === 'Escape') target.blur()
        return
      }
      const key = event.key.toLowerCase()
      if (key === 'j') setJournalOpen((value) => !value)
      if (key === 'c') setCustomizerOpen((value) => !value)
      if (key === 'm') setMapOpen((value) => !value)
      if (key === 'e' && nearbyNpc && !dialogNpc) setDialogNpc(nearbyNpc)
      if (key === 't') setChatCollapsed(false)
      if (key === 'f') setFocusMode((value) => !value)
      // Auto-engage focus mode on first movement so the world isn't blocked by panels
      const movementKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']
      if (movementKeys.includes(key) && !focusModeAutoEngagedRef.current) {
        focusModeAutoEngagedRef.current = true
        setFocusMode(true)
      }
      if (event.key === 'Escape') {
        setJournalOpen(false)
        setDialogNpc(null)
        setMapOpen(false)
        setArchiveOpen(false)
        setTutorialCompleteOpen(false)
        // Esc also bails out of focus mode so the rail comes back
        setFocusMode(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogNpc, nearbyNpc])

  const equippedVisuals = useMemo(() => {
    const weapon = rpg.state.playerProfile.equipped.weapon ? itemById(rpg.state.playerProfile.equipped.weapon) : null
    const cloak = rpg.state.playerProfile.equipped.cloak ? itemById(rpg.state.playerProfile.equipped.cloak) : null
    const head = rpg.state.playerProfile.equipped.head ? itemById(rpg.state.playerProfile.equipped.head) : null
    const artifact = rpg.state.playerProfile.equipped.artifact ? itemById(rpg.state.playerProfile.equipped.artifact) : null
    return {
      accent: artifact?.accent || head?.accent || weapon?.accent || rpg.state.playerProfile.avatarConfig.outfitAccent,
      cape: cloak?.accent || rpg.state.playerProfile.avatarConfig.cape,
      artifact: artifact?.accent || null,
      weapon:
        weapon?.id === 'training-blade'
          ? 'sword'
          : rpg.state.playerProfile.avatarConfig.weapon,
      helmet:
        head?.id === 'initiate-circlet'
          ? 'circlet'
          : rpg.state.playerProfile.avatarConfig.helmet,
    } as const
  }, [rpg.state.playerProfile])

  function addChatMessage(message: ChatMessage) {
    setMessages((prev) => {
      // Dedupe: if we already have this (author + body + ts within 2s), skip.
      const dupe = prev.some(
        (m) =>
          m.authorId === message.authorId &&
          m.body === message.body &&
          Math.abs(m.ts - message.ts) < 2000,
      )
      if (dupe) return prev
      return [...prev, message].slice(-40)
    })
  }

  function sendChat(body: string) {
    const ts = Date.now()
    addChatMessage({
      id: `${ts}-${Math.random()}`,
      authorId: 'self',
      authorName: rpg.state.playerProfile.displayName || 'You',
      body,
      ts,
      color: '#a7f3d0',
    })
    rpg.markObjective('training-q3', 'send-local-chat')
    // Diplomacy: if there's a remote player nearby in this world, count it.
    if (remotePlayersInZone.length > 0) {
      rpg.markObjective('agora-diplomacy', 'meet-builder')
      rpg.markObjective('agora-diplomacy', 'exchange-chat')
    }
    // Speech bubble over our own head too, so we see what we said in-world.
    try {
      window.dispatchEvent(
        new CustomEvent('hermes-playground-self-chat-bubble', { detail: body }),
      )
    } catch {}
    try { (window as any).__hermesPlaygroundSendChat?.(body) } catch {}
  }

  function handleIncomingChat(msg: { id: string; name: string; color: string; text: string; ts: number }) {
    // Defensive: never accept a chat that we sent ourselves — the server tries
    // to filter, but old chat ring entries from previous selfIds can leak.
    if (msg.name === (rpg.state.playerProfile.displayName || 'You')) return
    addChatMessage({
      id: `${msg.ts}-${msg.id}`,
      authorId: msg.id,
      authorName: msg.name,
      body: msg.text,
      ts: msg.ts,
      color: msg.color,
    })
  }

  function attackMonster(damage: number, costBacklash = true) {
    if (world !== 'training' || monsterDefeated) return false
    if (costBacklash) {
      const playerDamage = Math.floor(Math.random() * 4) + 1
      rpg.damagePlayer(playerDamage)
    }
    playgroundAudio.playHit()
    setMonsterHp((current) => {
      const next = Math.max(0, current - damage)
      if (next === 0) {
        playgroundAudio.playDefeat()
        rpg.markObjective('training-bonus-wisp', 'defeat-wisp')
        rpg.recordDefeat(35, 'wisp-core')
        rpg.markObjective('training-bonus-wisp', 'collect-core')
      }
      return next
    })
    return true
  }

  function handleCast(actionId: string) {
    switch (actionId) {
      case 'strike':
        return attackMonster(10 + Math.floor(Math.random() * 4))
      case 'dash':
        if (!rpg.useMp(8)) return false
        window.dispatchEvent(new CustomEvent('hermes-playground-dash'))
        return true
      case 'bolt':
        if (!rpg.useMp(15)) return false
        return attackMonster(18 + Math.floor(Math.random() * 6), false)
      case 'summon':
        if (!rpg.useMp(20)) return false
        // Spawn a 60-second familiar via custom event — the world component listens.
        window.dispatchEvent(
          new CustomEvent('hermes-playground-summon-familiar', {
            detail: { durationMs: 60000, color: '#a78bfa' },
          }),
        )
        rpg.markObjective('forge-summon', 'enter-forge-bonus')
        rpg.markObjective('forge-summon', 'summon-familiar')
        return true
      default:
        return false
    }
  }

  function handleQuestZone(id: string) {
    if (id === 'archive-podium') {
      rpg.markObjective('training-q4', 'visit-archive')
      setArchiveOpen(true)
      return
    }
    if (id === 'forge-gate') {
      rpg.markObjective('training-q5', 'visit-forge-gate')
      return
    }
    if (['grove-ritual', 'oracle-riddle', 'arena-duel'].includes(id)) {
      rpg.completeQuestById(id)
    }
  }

  function handlePortal() {
    if (world === 'training' && !forgeUnlocked) return
    if (world === 'training') {
      void enterForgeFromTraining()
      return
    }
    const order: PlaygroundWorldId[] = ['training', 'forge', 'agora', 'grove', 'oracle', 'arena']
    const unlocked = order.filter((id) => rpg.state.unlockedWorlds.includes(id))
    const currentIndex = unlocked.indexOf(world)
    const next = unlocked[(currentIndex + 1) % unlocked.length] ?? world
    playgroundAudio.playPortalWhoosh()
    setTransitioning(true)
    window.setTimeout(() => {
      setWorld(next)
      window.setTimeout(() => setTransitioning(false), 350)
    }, 280)
  }

  function onDialogChoice(npcId: string, choiceId: string) {
    if (npcId === 'athena' && choiceId === 'training-sigil') {
      rpg.markObjective('training-q1', 'speak-athena')
      rpg.markObjective('training-q1', 'claim-sigil')
    }
    if ((npcId === 'athena' && choiceId === 'training-build') || (npcId === 'pan' && choiceId === 'forge-demo')) {
      rpg.markObjective('training-q5', 'build-something')
    }
  }

  async function enterForgeFromTraining() {
    playgroundAudio.playPortalWhoosh()
    setTransitioning(true)
    const showIntro = !forgeIntroSeenRef.current
    if (showIntro) {
      setForgeIntro({ open: true, flavor: '', loading: true })
      const flavor = await generateForgeFlavor()
      setForgeIntro({ open: true, flavor, loading: false })
    }
    window.setTimeout(() => {
      setWorld('forge')
      rpg.setLastZone('forge')
      if (showIntro) {
        forgeIntroSeenRef.current = true
        try { window.localStorage.setItem(FORGE_INTRO_STORAGE_KEY, '1') } catch {}
      }
      window.setTimeout(() => {
        setTransitioning(false)
        if (showIntro) {
          window.setTimeout(() => setForgeIntro({ open: false, flavor: '', loading: false }), 1700)
        }
      }, 350)
    }, showIntro ? 1650 : 280)
  }

  async function generateForgeFlavor() {
    try {
      const r = await fetch('/api/playground-npc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          npcId: 'pan',
          playerMessage:
            'Give me a 1-2 sentence in-world world-generation line for a builder first entering the Forge through the Training Grounds gate. Focus on neon tools, prompts hardening into artifacts, and arrival energy.',
          history: [],
        }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const data = (await r.json()) as { reply?: string }
      return data.reply?.trim() || FORGE_FALLBACK_FLAVOR
    } catch {
      return FORGE_FALLBACK_FLAVOR
    }
  }

  if (!launched) {
    return (
      <>
        <TitleScreen
          displayName={rpg.state.playerProfile.displayName}
          tutorialComplete={rpg.state.completedQuests.includes('training-q5')}
          onChangeDisplayName={rpg.setDisplayName}
          onCustomize={() => setCustomizerOpen(true)}
          onEnter={() => setLaunched(true)}
        />
        <PlaygroundCustomizer
          open={customizerOpen}
          onClose={() => setCustomizerOpen(false)}
          value={rpg.state.playerProfile.avatarConfig}
          onChange={rpg.setAvatarConfig}
        />
      </>
    )
  }

  return (
    <PlaygroundErrorBoundary fallback={<RouteFallback />}>
      <div className="relative overflow-hidden" style={{ width: '100%', height: '100vh', minHeight: 640, background: '#07131a', color: 'white' }}>
        <PlaygroundWorld3D
          worldId={world}
          onPortal={handlePortal}
          onQuestZone={handleQuestZone}
          onNpcNearChange={setNearbyNpc}
          botBubbles={botBubbles}
          playerName={rpg.state.playerProfile.displayName || 'Builder'}
          playerAvatar={rpg.state.playerProfile.avatarConfig}
          playerAccent={equippedVisuals.accent}
          playerCape={equippedVisuals.cape}
          playerArtifact={equippedVisuals.artifact}
          playerWeapon={equippedVisuals.weapon}
          playerHelmet={equippedVisuals.helmet}
          portalLabel={world === 'training' ? 'Forge Gate' : 'World Portal'}
          portalLocked={world === 'training' && !forgeUnlocked}
          multiplayerName={rpg.state.playerProfile.displayName || undefined}
          monsterHp={monsterHp}
          monsterHpMax={monsterHpMax}
          monsterDefeated={monsterDefeated}
          onMonsterAttack={() => {
            attackMonster(8 + Math.floor(Math.random() * 5))
          }}
          onIncomingChat={handleIncomingChat}
          onRemotePlayersChange={setRemotePlayers}
          objectiveTargetId={currentObjective?.target ?? null}
          objectivePulseKey={objectivePulseKey}
        />

        <PlaygroundDialog
          npcId={dialogNpc}
          activeQuest={activeQuest ?? null}
          onClose={() => setDialogNpc(null)}
          onCompleteQuest={(questId) => rpg.completeQuestById(questId)}
          onGrantItems={(items) => rpg.grantItems(items)}
          onGrantSkillXp={(skills) => rpg.grantSkillXp(skills)}
          onChoice={onDialogChoice}
        />
        <PlaygroundJournal open={journalOpen} onClose={() => setJournalOpen(false)} state={rpg.state} />
        <PlaygroundCustomizer
          open={customizerOpen}
          onClose={() => setCustomizerOpen(false)}
          value={rpg.state.playerProfile.avatarConfig}
          onChange={rpg.setAvatarConfig}
        />
        <PlaygroundMap
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          currentWorld={world}
          unlocked={rpg.state.unlockedWorlds}
          onTravel={(id) => {
            if (!rpg.state.unlockedWorlds.includes(id)) return
            setTransitioning(true)
            window.setTimeout(() => {
              setWorld(id)
              setMapOpen(false)
              window.setTimeout(() => setTransitioning(false), 350)
            }, 280)
          }}
        />
        <PlaygroundChat
          worldId={world}
          messages={messages}
          onSend={sendChat}
          collapsed={chatCollapsed}
          onToggle={() => setChatCollapsed((value) => !value)}
        />
        <PlaygroundActionBar
          onCast={handleCast}
          hp={rpg.state.hp}
          hpMax={rpg.state.hpMax}
          mp={rpg.state.mp}
          mpMax={rpg.state.mpMax}
          sp={rpg.state.sp}
          spMax={rpg.state.spMax}
        />
        <PlaygroundMinimap
          worldId={world}
          worldName={WORLD_META[world].name}
          worldAccent={WORLD_META[world].accent}
        />
        <PlaygroundHud
          state={rpg.state}
          activeQuestTitle={activeQuest?.title ?? 'Training Complete'}
          objectiveLabel={currentObjective?.label ?? 'Forge Gate unlocked. Keep exploring the Playground.'}
          objectiveHint={currentObjective?.hint}
          objectiveTarget={currentObjective?.target ?? null}
          levelProgress={rpg.levelProgress}
          currentWorld={world}
          worldAccent={WORLD_META[world].accent}
          toasts={rpg.toasts}
        />
        {/* Online chip removed — the chat header now shows live player count + NPC count. */}
        {!focusMode && <NearbyBuildersChip players={remotePlayersInZone} />}
        {!focusMode && (
          <PlaygroundSidePanel
            state={rpg.state}
            currentWorld={world}
            worlds={PLAYGROUND_WORLDS}
            onSelectWorld={(next) => {
              if (rpg.state.unlockedWorlds.includes(next)) setWorld(next)
            }}
            onReset={rpg.resetRpg}
            onReplayTutorial={() => {
              rpg.replayTutorial()
              setTutorialCompleteOpen(false)
              setArchiveOpen(false)
              setJournalOpen(false)
              setMapOpen(false)
              setMobileMenuOpen(false)
              setWorld('training')
              try { window.localStorage.removeItem(FORGE_INTRO_STORAGE_KEY) } catch {}
              forgeIntroSeenRef.current = false
            }}
            onOpenInventory={rpg.openInventory}
            onEquipItem={rpg.equipItem}
            onUnequipSlot={rpg.unequipSlot}
            worldAccent={WORLD_META[world].accent}
            open={!isNarrow || mobileMenuOpen}
            onOpenChange={setMobileMenuOpen}
          />
        )}
        {/* Focus mode toggle — eyeball icon (sits in the gap between minimap and quest tracker) */}
        <button
          type="button"
          onClick={() => setFocusMode((v) => !v)}
          aria-label={focusMode ? 'Exit focus mode (F or Esc)' : 'Focus mode — hide side rail (F)'}
          title={focusMode ? 'Exit focus mode (F or Esc)' : 'Focus mode — hide side rail (F)'}
          className="pointer-events-auto fixed right-3 top-[230px] z-[71] hidden h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/70 text-[16px] text-white shadow-xl backdrop-blur-xl md:flex"
          style={{
            boxShadow: focusMode ? `0 0 14px ${WORLD_META[world].accent}88` : '0 8px 22px rgba(0,0,0,.55)',
            borderColor: focusMode ? WORLD_META[world].accent : 'rgba(255,255,255,0.15)',
          }}
        >
          <span aria-hidden="true" style={{ filter: focusMode ? 'none' : 'grayscale(0.4)' }}>
            {focusMode ? '👁️' : '👁'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="pointer-events-auto fixed right-3 top-12 z-[72] rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white shadow-xl backdrop-blur-xl md:hidden"
          >
          Menu
        </button>
        <PlaygroundHelpHud worldName={WORLD_META[world].name} />
        <PlaygroundUtilityDock
          audioMuted={audioMuted}
          narrationMuted={narrationMuted}
          onCustomize={() => setCustomizerOpen(true)}
          onToggleAudio={() => playgroundAudio.toggleMuted()}
          onReplayNarration={() => narrateWorldNow(world)}
          onToggleNarration={() => {
            const next = !narrationMuted
            setNarrationMuted(next)
            setNarrationMutedState(next)
          }}
        />
        <ArchiveBriefingModal
          open={archiveOpen}
          onClose={() => setArchiveOpen(false)}
          onAcknowledge={() => {
            rpg.markObjective('training-q4', 'inspect-memory')
            setArchiveOpen(false)
          }}
        />
        <TutorialCompleteModal
          open={tutorialCompleteOpen}
          onClose={() => setTutorialCompleteOpen(false)}
          onStepThroughForgeGate={() => {
            setTutorialCompleteOpen(false)
            if (world === 'training' && forgeUnlocked) {
              void enterForgeFromTraining()
              return
            }
            setWorld('training')
          }}
        />
        <ForgeArrivalOverlay open={forgeIntro.open} flavor={forgeIntro.flavor} loading={forgeIntro.loading} />
        <LowHpOverlay active={lowHpActive} />
        <CameraPresetToast />
        <TransitionLoadingScreen active={transitioning} worldName={WORLD_META[world].name} />
      </div>
    </PlaygroundErrorBoundary>
  )
}

function TitleScreen({
  displayName,
  tutorialComplete,
  onChangeDisplayName,
  onCustomize,
  onEnter,
}: {
  displayName: string
  tutorialComplete: boolean
  onChangeDisplayName: (value: string) => void
  onCustomize: () => void
  onEnter: () => void
}) {
  const canEnter = displayName.trim().length > 0

  useEffect(() => {
    playgroundAudio.playTitleEntry()
  }, [])

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-6 text-white"
      style={{
        background:
          'radial-gradient(circle at 50% 18%, rgba(34,211,238,0.16) 0%, transparent 55%), radial-gradient(circle at 80% 80%, rgba(168,85,247,0.18) 0%, transparent 55%), linear-gradient(160deg, #02050a 0%, #050a14 60%, #07101a 100%)',
      }}
    >
      {/* Animated starfield backdrop */}
      <TitleStars />

      <div
        className="relative z-10 w-full max-w-[1080px] overflow-hidden rounded-[32px] border border-cyan-300/15"
        style={{
          background:
            'linear-gradient(180deg, rgba(8,12,20,0.95) 0%, rgba(4,7,12,0.96) 100%)',
          boxShadow:
            '0 0 0 1px rgba(34,211,238,0.08), 0 30px 80px rgba(0,0,0,0.65), 0 0 80px rgba(34,211,238,0.08)',
        }}
      >
        {/* Hero — cinematic title block */}
        <div className="relative h-[400px] overflow-hidden">
          <PlaygroundHeroCanvas />
          {/* Vignette */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 50%, transparent 35%, rgba(0,0,0,0.55) 95%)' }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <div
              className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] backdrop-blur-md"
              style={{
                borderColor: 'rgba(250, 204, 21, 0.4)',
                background: 'rgba(0,0,0,0.55)',
                color: '#fde68a',
                boxShadow: '0 0 18px rgba(250,204,21,0.18)',
              }}
            >
              <span style={{ color: '#facc15' }}>✦</span>
              Hermes Agent Realm
              <span className="opacity-60">· Nous Research × Kimi</span>
            </div>
            <h1
              className="text-[88px] leading-none font-black tracking-tight"
              style={{
                background: 'linear-gradient(180deg, #ffffff 0%, #f5d97a 50%, #c89c2a 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textShadow: '0 0 40px rgba(245,217,122,0.35)',
                fontFamily: 'Cinzel, "Trajan Pro", "Cormorant Garamond", "Playfair Display", Georgia, serif',
                letterSpacing: '0.04em',
              }}
            >
              HermesWorld
            </h1>
            {/* ASCII signature — distinctive, hand-crafted feel */}
            <pre
              className="mt-3 hidden text-[8px] leading-[1.05] md:block"
              style={{
                color: 'rgba(245,217,122,0.45)',
                fontFamily: '"Menlo", "Monaco", "Courier New", monospace',
                whiteSpace: 'pre',
                margin: 0,
                textShadow: '0 0 8px rgba(245,217,122,0.3)',
              }}
            >{`_   _                             __        __         _     _ 
| | | | ___ _ __ _ __ ___   ___  __\\ \\      / /__  _ __| | __| |
| |_| |/ _ \\ '__| '_ \` _ \\ / _ \\/ __\\ \\ /\\ / / _ \\| '__| |/ _\` |
|  _  |  __/ |  | | | | | |  __/\\__ \\\\ V  V / (_) | |  | | (_| |
|_| |_|\\___|_|  |_| |_| |_|\\___||___/ \\_/\\_/ \\___/|_|  |_|\\__,_|`}</pre>
            <div
              className="mt-2 text-[10px] font-bold uppercase tracking-[0.45em]"
              style={{ color: 'rgba(245, 217, 122, 0.7)' }}
            >
              — the agent MMO —
            </div>
            <p className="mt-5 max-w-[560px] text-[15px] leading-relaxed text-white/72">
              {displayName.trim().length === 0
                ? 'Step into a shared world of Hermes agents. Train, build, and quest with builders worldwide.'
                : tutorialComplete
                  ? `Welcome back, ${displayName}. Six worlds await.`
                  : `${displayName}, your training awaits. Six worlds. One builder. Forge your path.`}
            </p>
          </div>
        </div>

        {/* Bottom — entry block */}
        <div className="relative grid gap-6 p-7 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-4">
            <div
              className="rounded-2xl border p-5"
              style={{
                borderColor: 'rgba(245, 217, 122, 0.18)',
                background: 'linear-gradient(180deg, rgba(245,217,122,0.04) 0%, rgba(0,0,0,0.3) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(245,217,122,0.06)',
              }}
            >
              <div
                className="text-[10px] font-bold uppercase tracking-[0.22em]"
                style={{ color: '#fde68a' }}
              >
                ❖ Identify Yourself
              </div>
              <input
                value={displayName}
                onChange={(event) => onChangeDisplayName(event.target.value.slice(0, 24))}
                placeholder="Enter your builder name..."
                maxLength={24}
                className="mt-3 w-full rounded-xl border-2 bg-black/40 px-4 py-3.5 text-base text-white outline-none placeholder:text-white/25"
                style={{ borderColor: 'rgba(245,217,122,0.25)' }}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onCustomize}
                  className="flex-shrink-0 rounded-xl border-2 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] transition-all hover:scale-[1.02]"
                  style={{
                    borderColor: 'rgba(255,255,255,0.18)',
                    color: 'rgba(255,255,255,0.85)',
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  🎭 Customize Avatar
                </button>
                <button
                  type="button"
                  onClick={onEnter}
                  disabled={!canEnter}
                  className="flex-1 rounded-xl border-2 px-6 py-3 text-base font-extrabold uppercase tracking-[0.18em] transition-all hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
                  style={{
                    borderColor: '#facc15',
                    color: '#0b1320',
                    background: 'linear-gradient(180deg, #fde68a 0%, #fbbf24 50%, #d4a017 100%)',
                    boxShadow: canEnter
                      ? '0 0 30px rgba(250,204,21,0.45), inset 0 1px 0 rgba(255,255,255,0.5)'
                      : 'none',
                  }}
                >
                  Enter the Realm
                </button>
              </div>
            </div>
            <div className="grid gap-2 text-[12px] sm:grid-cols-3">
              <PremiumFeatureCard icon="❁" title="Six Worlds" desc="Training Grounds → Forge → Arena" />
              <PremiumFeatureCard icon="⛔" title="Live Multiplayer" desc="Walk with builders worldwide" />
              <PremiumFeatureCard icon="🔮" title="Hermes Skills" desc="Promptcraft · Memory · Diplomacy" />
            </div>
          </div>

          <div
            className="rounded-2xl border p-5 text-sm text-white/80"
            style={{
              borderColor: 'rgba(34,211,238,0.18)',
              background: 'linear-gradient(180deg, rgba(34,211,238,0.04) 0%, rgba(0,0,0,0.3) 100%)',
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(34,211,238,0.85)' }}>
              ◈ Your Path
            </div>
            <ol className="mt-4 space-y-3 text-[13px]">
              {[
                'Meet Athena. Claim the Hermes Sigil.',
                'Equip your kit at the Quartermaster.',
                'Send your first chat message.',
                'Visit the Archive Podium.',
                'Pass through the Forge Gate.',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold"
                    style={{ borderColor: 'rgba(34,211,238,0.35)', color: '#22d3ee', background: 'rgba(34,211,238,0.08)' }}
                  >
                    {i + 1}
                  </span>
                  <span className="leading-tight text-white/75">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Subtle animated starfield for the title screen background. */
function TitleStars() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 opacity-60">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1px 1px at 20% 30%, white 50%, transparent), radial-gradient(1px 1px at 70% 60%, white 50%, transparent), radial-gradient(1px 1px at 40% 80%, rgba(245,217,122,0.7) 50%, transparent), radial-gradient(2px 2px at 85% 15%, rgba(34,211,238,0.6) 50%, transparent), radial-gradient(1px 1px at 10% 75%, white 50%, transparent), radial-gradient(1.5px 1.5px at 55% 25%, rgba(168,85,247,0.5) 50%, transparent)',
          backgroundSize: '600px 600px',
          animation: 'hermesworld-stars 90s linear infinite',
        }}
      />
      <style>{`
        @keyframes hermesworld-stars {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-600px, -300px); }
        }
      `}</style>
    </div>
  )
}

function PremiumFeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{
        borderColor: 'rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.025)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[14px]" style={{ color: '#fbbf24' }}>{icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white">{title}</span>
      </div>
      <div className="mt-1 text-[11px] text-white/55">{desc}</div>
    </div>
  )
}

function FeatureCard({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 p-3">{children}</div>
}

function ArchiveBriefingModal({
  open,
  onClose,
  onAcknowledge,
}: {
  open: boolean
  onClose: () => void
  onAcknowledge: () => void
}) {
  if (!open) return null
  return (
    <div className="pointer-events-auto fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[560px] rounded-3xl border border-violet-300/30 bg-[#070b14] p-5 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-200/80">Archive Podium</div>
        <div className="mt-1 text-xl font-extrabold">Docs and Memory Loop</div>
        <div className="mt-4 space-y-3 text-sm text-white/80">
          <p><strong>Docs:</strong> `docs/playground/README.md` explains the worlds, systems, and multiplayer wiring.</p>
          <p><strong>Memory:</strong> Hermes saves project intent in `memory/goals/...` so the next iteration starts with context, recall, and less drift.</p>
          <p><strong>Builder habit:</strong> read the spec, inspect the state shape, ship the smallest slice, then verify with a clean build.</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/5">Close</button>
          <button onClick={onAcknowledge} className="rounded-xl border border-violet-300/40 bg-violet-400/15 px-4 py-2 text-sm font-bold text-violet-100 hover:bg-violet-400/25">
            Mark Briefing Read
          </button>
        </div>
      </div>
    </div>
  )
}

function TutorialCompleteModal({
  open,
  onClose,
  onStepThroughForgeGate,
}: {
  open: boolean
  onClose: () => void
  onStepThroughForgeGate: () => void
}) {
  if (!open) return null
  return (
    <div className="pointer-events-auto fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[520px] rounded-3xl border border-cyan-300/35 bg-[#070b14] p-5 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200/80">Training Complete</div>
        <div className="mt-1 text-xl font-extrabold">Initiate Builder</div>
        <div className="mt-3 space-y-2 text-sm text-white/80">
          <p>You learned the full builder loop:</p>
          <ul className="space-y-1 text-white/72">
            <li>Movement through the grounds</li>
            <li>Starter gear and loadout basics</li>
            <li>Local chat and nearby builders</li>
            <li>Docs, memory, and briefing recall</li>
            <li>How Hermes turns prompts into builds</li>
          </ul>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/5">
            Later
          </button>
          <button onClick={onStepThroughForgeGate} className="rounded-xl border border-cyan-300/40 bg-cyan-400/15 px-4 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-400/25">
            Step through the Forge Gate
          </button>
        </div>
      </div>
    </div>
  )
}

function ForgeArrivalOverlay({
  open,
  flavor,
  loading,
}: {
  open: boolean
  flavor: string
  loading: boolean
}) {
  if (!open) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[118] flex items-center justify-center bg-[#030712]/78 p-4 backdrop-blur-md">
      <div className="w-full max-w-[560px] rounded-3xl border border-cyan-300/30 bg-[#07131a]/92 p-6 text-center text-white shadow-2xl">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200/80">Forge Gate</div>
        <div className="mt-2 text-2xl font-extrabold text-cyan-100">Generating world...</div>
        <div className="mt-4 text-sm text-white/76">
          {loading ? 'Pan is hardening the first blueprint into a playable space.' : flavor}
        </div>
      </div>
    </div>
  )
}

function NearbyBuildersChip({ players }: { players: RemotePlayer[] }) {
  const [pingedId, setPingedId] = useState<string | null>(null)

  if (players.length === 0) return null

  return (
    <div
      className="pointer-events-auto fixed top-[210px] z-[70] hidden w-[220px] rounded-2xl border border-white/15 bg-black/65 p-2 text-white shadow-2xl backdrop-blur-xl md:block"
      style={{ left: 'min(120px, 9vw)' }}
    >
      <div className="mb-1 px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/45">Builders Nearby</div>
      <div className="space-y-1">
        {players.map((player) => (
          <button
            key={player.id}
            type="button"
            onClick={() => {
              setPingedId(player.id)
              window.dispatchEvent(new CustomEvent('hermes-playground-ping-remote', { detail: player.id }))
              window.setTimeout(() => setPingedId((current) => (current === player.id ? null : current)), 2000)
            }}
            className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-white/5 px-2 py-1.5 text-left hover:bg-white/10"
          >
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: player.color, boxShadow: `0 0 10px ${player.color}` }} />
              <span className="text-[11px] font-semibold">{player.name}</span>
            </span>
            <span className="text-[9px] uppercase tracking-[0.12em] text-white/40">
              {pingedId === player.id ? 'pinged' : 'ping'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function LowHpOverlay({ active }: { active: boolean }) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[90] transition-opacity duration-150"
      style={{
        opacity: active ? 1 : 0,
        background:
          'radial-gradient(circle at center, transparent 56%, rgba(127,29,29,0.16) 76%, rgba(153,27,27,0.32) 100%)',
        animation: active ? 'hermes-low-hp-pulse 2.8s ease-in-out infinite' : 'none',
      }}
    >
      <style>{`
        @keyframes hermes-low-hp-pulse {
          0%, 100% { opacity: 0.68; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

/** Brief toast that flashes when the user cycles cinematic camera presets via Tab. */
function CameraPresetToast() {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    const onPreset = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as string | undefined
      if (!detail) return
      setName(detail)
      const id = window.setTimeout(() => setName(null), 1400)
      return () => window.clearTimeout(id)
    }
    window.addEventListener('hermes-playground-camera-preset', onPreset)
    return () => window.removeEventListener('hermes-playground-camera-preset', onPreset)
  }, [])
  if (!name) return null
  return (
    <div
      className="pointer-events-none fixed left-1/2 top-[88px] z-[85] -translate-x-1/2 rounded-full border-2 border-white/30 bg-black/85 px-5 py-2 text-[12px] font-bold uppercase tracking-[0.2em] text-amber-200 backdrop-blur-xl"
      style={{ boxShadow: '0 0 22px rgba(250, 204, 21, 0.45)', animation: 'hermes-toast-in 200ms ease-out' }}
    >
      🎬 {name}
      <style>{`@keyframes hermes-toast-in { from { opacity: 0; transform: translate(-50%, -10px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
    </div>
  )
}

const HERMES_LORE_LINES = [
  'Hermes carried prompts between the gods of Olympus and the builders of Earth.',
  'A Hermes Agent is just a fast, faithful messenger — with memory.',
  'Promptcraft is the first skill. Diplomacy is the last.',
  'Build small. Ship now. Iterate at the speed of intent.',
  'Memory turns moments into a story. Story turns a tool into a teammate.',
  'The Forge is where prompts harden into tools. The Arena is where they earn their keep.',
  'Six worlds. One builder. Forge your path.',
  'Every NPC here teaches a real Hermes Agent skill. Listen.',
  'Routing is the art of choosing the right tool, the right model, the right moment.',
  'You are not alone. The Agora is full of builders walking the same road.',
]

/** Loading screen shown during world transitions — rotating Hermes lore + spinner. */
function TransitionLoadingScreen({ active, worldName }: { active: boolean; worldName: string }) {
  const [lore, setLore] = useState(HERMES_LORE_LINES[0])
  useEffect(() => {
    if (!active) return
    setLore(HERMES_LORE_LINES[Math.floor(Math.random() * HERMES_LORE_LINES.length)])
  }, [active])
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center transition-opacity duration-300"
      style={{
        opacity: active ? 1 : 0,
        background:
          'radial-gradient(circle at center, rgba(8,12,20,0.65) 30%, #000 90%)',
      }}
    >
      <div className="flex max-w-[640px] flex-col items-center gap-6 px-8 text-center">
        <div
          className="text-[12px] font-bold uppercase tracking-[0.45em]"
          style={{ color: 'rgba(245, 217, 122, 0.7)' }}
        >
          — entering —
        </div>
        <div
          className="text-[44px] leading-none font-black"
          style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #f5d97a 50%, #c89c2a 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 30px rgba(245,217,122,0.4)',
            fontFamily: 'Cinzel, "Trajan Pro", "Cormorant Garamond", Georgia, serif',
            letterSpacing: '0.04em',
          }}
        >
          {worldName}
        </div>
        <div className="flex items-center gap-3">
          <div
            className="h-1 w-32 overflow-hidden rounded-full"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, transparent, #facc15, transparent)',
                animation: 'hermes-loading-bar 1.4s linear infinite',
                width: '40%',
              }}
            />
          </div>
        </div>
        <p className="max-w-[440px] text-[13px] italic leading-relaxed text-white/65">
          “{lore}”
        </p>
      </div>
      <style>{`@keyframes hermes-loading-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }`}</style>
    </div>
  )
}

function PlaygroundHelpHud({ worldName }: { worldName: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pointer-events-auto fixed left-1/2 top-3 z-[60] flex -translate-x-1/2 items-center gap-2">
      <div className="rounded-full border border-white/10 bg-black/55 px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/85 backdrop-blur-xl">
        {worldName}
      </div>
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/55 text-[12px] font-bold text-white/80 hover:bg-white/10"
        title="Show controls"
      >
        ?
      </button>
      {open && (
        <div className="rounded-xl border border-white/10 bg-black/85 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-white/80 backdrop-blur-xl">
          Click ground = walk · Click NPC = talk · WASD · Shift sprint · 1 Strike · 2 Dash · 3 Bolt · 4 Summon · E talk · J journal · M map · T chat · F focus · Drag mouse to rotate camera
        </div>
      )}
    </div>
  )
}

function PlaygroundUtilityDock({
  audioMuted,
  onCustomize,
  onToggleAudio,
  onReplayNarration,
  onToggleNarration,
  narrationMuted,
}: {
  audioMuted: boolean
  onCustomize: () => void
  onToggleAudio: () => void
  onReplayNarration: () => void
  onToggleNarration: () => void
  narrationMuted: boolean
}) {
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  )
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  const captureScreenshot = () => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    try {
      const dataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png')
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `hermesworld-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
      a.click()
    } catch {}
  }
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {}
  }
  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
    } catch {}
  }
  return (
    <div className="pointer-events-auto fixed bottom-[78px] right-3 z-[70] flex flex-col gap-1.5">
      <button
        onClick={captureScreenshot}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/65 text-base text-cyan-100 backdrop-blur-xl hover:bg-cyan-400/20"
        title="Screenshot the world (PNG)"
      >
        📸
      </button>
      <button
        onClick={toggleFullscreen}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/65 text-base text-cyan-100 backdrop-blur-xl hover:bg-cyan-400/20"
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen ? '⤢' : '⛶'}
      </button>
      <button
        onClick={copyShareLink}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/65 text-base text-cyan-100 backdrop-blur-xl hover:bg-cyan-400/20"
        title="Copy share link"
      >
        🔗
      </button>
      <button
        onClick={onReplayNarration}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/65 text-base text-cyan-100 backdrop-blur-xl hover:bg-cyan-400/20"
        title="Replay world narration"
      >
        📢
      </button>
      <button
        onClick={onToggleNarration}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/65 text-base text-cyan-100 backdrop-blur-xl hover:bg-cyan-400/20"
        title={narrationMuted ? 'Unmute narration' : 'Mute narration'}
      >
        {narrationMuted ? '🔇' : '🗣️'}
      </button>
      <button
        onClick={onToggleAudio}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/65 text-base text-cyan-100 backdrop-blur-xl hover:bg-cyan-400/20"
        title={audioMuted ? 'Unmute audio' : 'Mute audio'}
      >
        {audioMuted ? '🔇' : '🔊'}
      </button>
      <button
        onClick={onCustomize}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/65 text-base text-cyan-100 backdrop-blur-xl hover:bg-cyan-400/20"
        title="Customize avatar (C)"
      >
        👤
      </button>
    </div>
  )
}

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050b12] p-6 text-white">
      <div className="max-w-[520px] rounded-3xl border border-amber-300/25 bg-[#070b14] p-5 shadow-2xl">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200/80">HermesWorld</div>
        <div className="mt-1 text-xl font-extrabold">Route fallback active</div>
        <p className="mt-3 text-sm text-white/75">
          The 3D route failed to render in this browser context. Reload the page or open `/agora` for the lightweight fallback.
        </p>
      </div>
    </div>
  )
}
