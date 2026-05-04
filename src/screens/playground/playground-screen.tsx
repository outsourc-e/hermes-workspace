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
import { PlaygroundOnlineChip } from './components/playground-online-chip'
import { PlaygroundSidePanel } from './components/playground-sidepanel'
import { PlaygroundWorld3D } from './components/playground-world-3d'
import { usePlaygroundRpg } from './hooks/use-playground-rpg'
import { playgroundAudio, usePlaygroundAudioMuted } from './lib/playground-audio'
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
          authorId: bot.id,
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
    setMessages((prev) => [...prev, message].slice(-40))
  }

  function sendChat(body: string) {
    addChatMessage({
      id: `${Date.now()}-${Math.random()}`,
      authorId: 'self',
      authorName: rpg.state.playerProfile.displayName || 'You',
      body,
      ts: Date.now(),
      color: '#a7f3d0',
    })
    rpg.markObjective('training-q3', 'send-local-chat')
    try { (window as any).__hermesPlaygroundSendChat?.(body) } catch {}
  }

  function handleIncomingChat(msg: { id: string; name: string; color: string; text: string; ts: number }) {
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
          levelProgress={rpg.levelProgress}
          currentWorld={world}
          worldAccent={WORLD_META[world].accent}
          toasts={rpg.toasts}
        />
        <PlaygroundOnlineChip accent={WORLD_META[world].accent} />
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
        {/* Focus mode toggle (always visible, sits below minimap) */}
        <button
          type="button"
          onClick={() => setFocusMode((v) => !v)}
          title={focusMode ? 'Exit focus mode (F or Esc)' : 'Focus mode — hide side rail (F)'}
          className="pointer-events-auto fixed right-3 top-[200px] z-[71] hidden items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-xl backdrop-blur-xl md:flex"
          style={{ boxShadow: focusMode ? `0 0 12px ${WORLD_META[world].accent}66` : undefined }}
        >
          <span style={{ color: focusMode ? WORLD_META[world].accent : 'white' }}>{focusMode ? '◉' : '○'}</span>
          <span>{focusMode ? 'Focus on' : 'Focus'}</span>
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
          onCustomize={() => setCustomizerOpen(true)}
          onToggleAudio={() => playgroundAudio.toggleMuted()}
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
        <div
          className="pointer-events-none fixed inset-0 z-[95] transition-opacity duration-300"
          style={{
            background: 'radial-gradient(circle at center, transparent 20%, #000 80%)',
            opacity: transitioning ? 1 : 0,
          }}
        />
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
    <div className="flex min-h-screen items-center justify-center bg-[#050b12] p-6 text-white">
      <div className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[#070b14] shadow-2xl">
        <div className="relative h-[340px] overflow-hidden">
          <PlaygroundHeroCanvas />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="mb-3 rounded-full border border-cyan-300/35 bg-black/45 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200/85 backdrop-blur-sm">
              Hermes Playground · Nous Research × Kimi
            </div>
            <h1 className="text-5xl font-black tracking-tight" style={{ textShadow: '0 0 28px rgba(34,211,238,0.55)' }}>
              Hermes Playground
            </h1>
            <div className="mt-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
              {displayName.trim().length === 0
                ? 'Welcome, builder. What should we call you?'
                : tutorialComplete
                  ? `Ready when you are, ${displayName}.`
                  : `Ready when you are, ${displayName}.`}
            </div>
            <p className="mt-3 max-w-[640px] text-[15px] text-white/72">
              Enter the Training Grounds, meet Athena, equip your starter kit, learn chat and memory, then unlock the Forge Gate.
            </p>
          </div>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Display Name</div>
              <input
                value={displayName}
                onChange={(event) => onChangeDisplayName(event.target.value.slice(0, 24))}
                placeholder="Builder handle"
                maxLength={24}
                className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-base text-white outline-none placeholder:text-white/30 focus:border-cyan-400/60"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onCustomize}
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/5"
                >
                  Customize Avatar
                </button>
                <button
                  type="button"
                  onClick={onEnter}
                  disabled={!canEnter}
                  className="rounded-xl border-2 border-cyan-300/60 bg-cyan-400/15 px-5 py-2 text-sm font-extrabold uppercase tracking-[0.16em] text-cyan-100 hover:bg-cyan-400/25"
                  style={{ boxShadow: '0 0 22px rgba(34,211,238,.35)' }}
                >
                  Enter Training Grounds
                </button>
              </div>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <FeatureCard>Display-name-only entry</FeatureCard>
              <FeatureCard>Avatar customizer before launch</FeatureCard>
              <FeatureCard>Training tutorial, gear, chat, memory, build loop</FeatureCard>
              <FeatureCard>Action bar, minimap, quest tracker, and multiplayer presence</FeatureCard>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-white/80">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/70">Starter Route</div>
            <ol className="mt-3 space-y-2 text-[13px]">
              <li>1. Arrival Circle → meet Athena and claim the Hermes Sigil.</li>
              <li>2. Quartermaster kit → equip the Training Blade and Novice Cloak.</li>
              <li>3. Send one local chat message.</li>
              <li>4. Visit the Archive Podium for docs and memory guidance.</li>
              <li>5. Reach the Forge Gate and complete a placeholder build ritual.</li>
            </ol>
          </div>
        </div>
      </div>
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
    <div className="pointer-events-auto fixed left-3 top-12 z-[70] hidden w-[220px] rounded-2xl border border-white/15 bg-black/65 p-2 text-white shadow-2xl backdrop-blur-xl md:block">
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
          Click ground = walk · Click NPC = talk · WASD · Shift sprint · 1 Strike · 2 Dash · 3 Bolt · E talk · J journal · M map · T chat
        </div>
      )}
    </div>
  )
}

function PlaygroundUtilityDock({
  audioMuted,
  onCustomize,
  onToggleAudio,
}: {
  audioMuted: boolean
  onCustomize: () => void
  onToggleAudio: () => void
}) {
  return (
    <div className="pointer-events-auto fixed bottom-[78px] right-3 z-[70] flex flex-col gap-1.5">
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
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200/80">Hermes Playground</div>
        <div className="mt-1 text-xl font-extrabold">Route fallback active</div>
        <p className="mt-3 text-sm text-white/75">
          The 3D route failed to render in this browser context. Reload the page or open `/agora` for the lightweight fallback.
        </p>
      </div>
    </div>
  )
}
