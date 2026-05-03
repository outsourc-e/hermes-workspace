import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Float, Html, Sparkles, Stars, Text, useTexture } from '@react-three/drei'
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { PlaygroundHud } from './components/playground-hud'
import { PlaygroundWorld3D } from './components/playground-world-3d'
import { usePlaygroundRpg } from './hooks/use-playground-rpg'
import {
  PLAYGROUND_WORLDS,
  type PlaygroundWorldId,
  type PlaygroundQuest,
} from './lib/playground-rpg'

type PlaygroundWorld = PlaygroundWorldId
type QuestState = 'start' | 'met-athena' | 'generated-world' | 'complete'

type PlayerApi = {
  position: THREE.Vector3
}

const WORLD_META: Record<PlaygroundWorld, {
  name: string
  subtitle: string
  accent: string
  ground: string
  sky: string
  prompt: string
}> = {
  agora: {
    name: 'The Agora',
    subtitle: 'Marble lobby for humans and their agents',
    accent: '#d9b35f',
    ground: '#24352f',
    sky: '#0b1720',
    prompt: 'Greek marble plaza, agent citizens, moonlit teal sky',
  },
  forge: {
    name: 'The Forge',
    subtitle: 'Generated cyberpunk builder world',
    accent: '#22d3ee',
    ground: '#151827',
    sky: '#060712',
    prompt: 'Cyberpunk forge, neon code rivers, agent blacksmiths, mission terminals',
  },
  grove: {
    name: 'The Grove',
    subtitle: 'Living forest for music, rituals, and community quests',
    accent: '#34d399',
    ground: '#143025',
    sky: '#06150f',
    prompt: 'Bioluminescent forest grove, agent druids, music rituals',
  },
  oracle: {
    name: 'Oracle Temple',
    subtitle: 'Archive world for lore, memory, and search quests',
    accent: '#a78bfa',
    ground: '#1f1b35',
    sky: '#080714',
    prompt: 'Quiet oracle archive, floating crystals, agent librarians',
  },
  arena: {
    name: 'Benchmark Arena',
    subtitle: 'Model combat world for prompt duels and eval battles',
    accent: '#fb7185',
    ground: '#35181f',
    sky: '#16070a',
    prompt: 'Gladiator arena for AI model duels, neon scoreboards',
  },
}

function useKeyboard() {
  const keys = useRef(new Set<string>())
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
      keys.current.add(e.key.toLowerCase())
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
  return keys
}

function FollowCamera({ target }: { target: React.MutableRefObject<PlayerApi> }) {
  const { camera } = useThree()
  const ideal = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const p = target.current.position
    ideal.set(p.x + 7, p.y + 7, p.z + 9)
    camera.position.lerp(ideal, 0.08)
    look.set(p.x, p.y + 1.2, p.z)
    camera.lookAt(look)
  })
  return null
}

function Player({ api }: { api: React.MutableRefObject<PlayerApi> }) {
  const group = useRef<THREE.Group>(null)
  const keys = useKeyboard()
  const texture = useTexture('/avatars/hermes.png')

  useFrame((_, delta) => {
    const k = keys.current
    const move = new THREE.Vector3()
    if (k.has('w') || k.has('arrowup')) move.z -= 1
    if (k.has('s') || k.has('arrowdown')) move.z += 1
    if (k.has('a') || k.has('arrowleft')) move.x -= 1
    if (k.has('d') || k.has('arrowright')) move.x += 1
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar((k.has('shift') ? 7 : 4) * delta)
      api.current.position.add(move)
      api.current.position.x = THREE.MathUtils.clamp(api.current.position.x, -18, 18)
      api.current.position.z = THREE.MathUtils.clamp(api.current.position.z, -14, 14)
      if (group.current) group.current.rotation.y = Math.atan2(move.x, move.z)
    }
    if (group.current) group.current.position.copy(api.current.position)
  })

  return (
    <group ref={group} position={[0, 0, 4]}>
      <mesh castShadow position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.38, 0.72, 8, 16]} />
        <meshStandardMaterial color="#2dd4bf" roughness={0.55} metalness={0.1} />
      </mesh>
      <Billboard position={[0, 1.45, 0]} follow lockX={false} lockY={false} lockZ={false}>
        <mesh>
          <planeGeometry args={[1.05, 1.05]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
      </Billboard>
      <Text position={[0, 2.25, 0]} fontSize={0.22} color="white" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.02}>
        You
      </Text>
    </group>
  )
}

function AgentCompanion({
  player,
  line,
}: {
  player: React.MutableRefObject<PlayerApi>
  line: string
}) {
  const group = useRef<THREE.Group>(null)
  const texture = useTexture('/avatars/athena.png')
  useFrame((_, delta) => {
    if (!group.current) return
    const p = player.current.position
    const target = new THREE.Vector3(p.x - 1.8, 0, p.z + 1.8)
    group.current.position.lerp(target, Math.min(1, delta * 2.5))
  })
  return (
    <Float speed={1.4} rotationIntensity={0.06} floatIntensity={0.18}>
      <group ref={group} position={[-2, 0, 6]}>
        <mesh castShadow position={[0, 0.48, 0]}>
          <cylinderGeometry args={[0.32, 0.44, 0.9, 16]} />
          <meshStandardMaterial color="#c084fc" roughness={0.45} emissive="#3b0764" emissiveIntensity={0.18} />
        </mesh>
        <Billboard position={[0, 1.3, 0]}>
          <mesh>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={texture} transparent toneMapped={false} />
          </mesh>
        </Billboard>
        <Sparkles count={28} scale={[1.4, 1.4, 1.4]} size={2} speed={0.35} color="#d8b4fe" />
        <Text position={[0, 2.12, 0]} fontSize={0.2} color="#f5e8ff" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.02}>
          Athena · Agent
        </Text>
        {line && (
          <Html position={[0, 2.55, 0]} center transform distanceFactor={8}>
            <div className="max-w-[260px] rounded-xl border border-purple-300/30 bg-black/75 px-3 py-2 text-xs leading-snug text-white shadow-xl backdrop-blur">
              {line}
            </div>
          </Html>
        )}
      </group>
    </Float>
  )
}

function Portal({ world, onEnter }: { world: PlaygroundWorld; onEnter: () => void }) {
  const meta = WORLD_META[world]
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.7
  })
  return (
    <group position={[12, 0, -8]}>
      <mesh ref={ref} onClick={onEnter}>
        <torusGeometry args={[1.05, 0.06, 16, 80]} />
        <meshStandardMaterial color={meta.accent} emissive={meta.accent} emissiveIntensity={1.2} />
      </mesh>
      <Sparkles count={80} scale={[2.2, 2.8, 2.2]} size={4} speed={0.7} color={meta.accent} />
      <Text position={[0, 1.7, 0]} fontSize={0.22} color={meta.accent} anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.02}>
        Portal
      </Text>
    </group>
  )
}

function TempleAgora({ accent }: { accent: string }) {
  const pillars = [-12, -8, -4, 4, 8, 12]
  return (
    <>
      {pillars.map((x) => (
        <group key={`north-${x}`} position={[x, 0, -11]}>
          <mesh castShadow position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.35, 0.45, 3, 20]} />
            <meshStandardMaterial color="#d7c7a4" roughness={0.6} />
          </mesh>
          <mesh castShadow position={[0, 3.1, 0]}>
            <boxGeometry args={[1.2, 0.22, 1.2]} />
            <meshStandardMaterial color="#f5e6c8" />
          </mesh>
        </group>
      ))}
      <mesh receiveShadow position={[0, 0.04, -11]}>
        <boxGeometry args={[28, 0.08, 2.6]} />
        <meshStandardMaterial color="#514634" />
      </mesh>
      <mesh receiveShadow position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.2, 3.5, 72]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.18} />
      </mesh>
    </>
  )
}

function ForgeWorld({ accent }: { accent: string }) {
  return (
    <>
      {[-10, -4, 4, 10].map((x, i) => (
        <group key={x} position={[x, 0, -8 + (i % 2) * 4]}>
          <mesh castShadow position={[0, 0.7, 0]}>
            <boxGeometry args={[2.2, 1.4, 2.2]} />
            <meshStandardMaterial color="#20263a" emissive={accent} emissiveIntensity={0.18} roughness={0.35} />
          </mesh>
          <mesh position={[0, 1.55, 0]}>
            <boxGeometry args={[1.4, 0.08, 1.4]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.8} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.2, 4.45, 72]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.65} />
      </mesh>
    </>
  )
}

function PlaygroundScene({
  world,
  companionLine,
  onEnterPortal,
}: {
  world: PlaygroundWorld
  companionLine: string
  onEnterPortal: () => void
}) {
  const player = useRef<PlayerApi>({ position: new THREE.Vector3(0, 0, 4) })
  const meta = WORLD_META[world]
  return (
    <>
      <color attach="background" args={[meta.sky]} />
      <fog attach="fog" args={[meta.sky, 12, 46]} />
      <Stars radius={70} depth={35} count={1800} factor={4} saturation={0} fade speed={0.4} />
      <ambientLight intensity={0.55} />
      <directionalLight castShadow position={[7, 12, 5]} intensity={1.55} shadow-mapSize={[2048, 2048]} />
      <pointLight position={[0, 4, 0]} color={meta.accent} intensity={2.4} distance={14} />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[42, 32, 24, 24]} />
        <meshStandardMaterial color={meta.ground} roughness={0.82} metalness={0.05} />
      </mesh>
      <gridHelper args={[42, 42, meta.accent, '#1f2937']} position={[0, 0.01, 0]} />

      {world === 'agora' ? <TempleAgora accent={meta.accent} /> : <ForgeWorld accent={meta.accent} />}
      <Portal world={world === 'agora' ? 'forge' : 'agora'} onEnter={onEnterPortal} />
      <Player api={player} />
      <AgentCompanion player={player} line={companionLine} />
      <FollowCamera target={player} />

      <Text position={[0, 4.1, -11.2]} fontSize={0.55} color={meta.accent} anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.03}>
        {meta.name}
      </Text>
      <Text position={[0, 3.45, -11.2]} fontSize={0.22} color="#e5e7eb" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.02}>
        {meta.subtitle}
      </Text>
    </>
  )
}

class PlaygroundErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Playground WebGL render failed', error)
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? <PlaygroundFallback />
    return this.props.children
  }
}

function PlaygroundFallback({ onLaunch3D, webglFailed = false }: { onLaunch3D?: () => void; webglFailed?: boolean }) {
  return (
    <div
      className="flex h-full min-h-[520px] items-center justify-center p-6"
      style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl border shadow-2xl" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
        <div className="relative h-72 overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(34,211,238,.25), transparent 55%), linear-gradient(135deg, #07121f, #182235)' }}>
          <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/40 bg-cyan-300/10" />
          {['Hermes', 'Athena', 'Kimi', 'Builder'].map((name, i) => (
            <div
              key={name}
              className="absolute flex flex-col items-center gap-1"
              style={{
                left: `${28 + i * 15}%`,
                top: `${38 + (i % 2) * 18}%`,
              }}
            >
              <img src={`/avatars/${i === 1 ? 'athena' : 'hermes'}.png`} className="h-14 w-14 rounded-full border border-white/20 object-cover" />
              <span className="rounded bg-black/50 px-2 py-0.5 text-[10px] text-white">{name}</span>
            </div>
          ))}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-cyan-300/30 bg-black/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-cyan-100">
            Playground Lite · WebGL fallback
          </div>
        </div>
        <div className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <h1 className="text-xl font-semibold">Hermes Playground</h1>
            <span className="rounded bg-cyan-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">hackathon</span>
          </div>
          <p className="text-sm opacity-75">
            {webglFailed
              ? 'The 3D renderer could not create a WebGL context in this browser, so this fallback keeps the demo alive. Agora still works, and the 3D scene can load once WebGL/GPU acceleration is available.'
              : 'Hackathon demo shell is live. Launch the 3D world when WebGL is available, or use Agora Lite as the reliable 2D multiplayer fallback.'}
          </p>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--theme-border)' }}>✓ AI agent RPG concept</div>
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--theme-border)' }}>✓ Human + agent world</div>
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--theme-border)' }}>✓ Missions + generated worlds</div>
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--theme-border)' }}>✓ Agora fallback ready</div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {onLaunch3D && (
              <button
                type="button"
                onClick={onLaunch3D}
                className="inline-flex rounded-xl px-4 py-2 text-sm font-semibold"
                style={{ background: 'var(--theme-accent)', color: 'var(--theme-bg)' }}
              >
                Launch 3D World
              </button>
            )}
            <a href="/agora" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
              Open Agora Lite
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function detectWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const context =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    if (!context) return false

    // R3F can still blank the route if Three's renderer cannot bind the
    // context (seen with SwiftShader / flaky GPU contexts). Smoke-test the
    // exact renderer path before mounting Canvas.
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: false,
    })
    renderer.setSize(16, 16, false)
    renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera())
    renderer.forceContextLoss()
    renderer.dispose()
    return true
  } catch (error) {
    console.warn('Playground WebGL smoke test failed', error)
    return false
  }
}

function PlaygroundLiteWorld({
  world,
  setWorld,
  quest,
  setQuest,
  input,
  setInput,
  companionLine,
  setCompanionLine,
  rpgState,
  activeQuest,
  levelProgress,
  lastReward,
  completeQuest,
  resetRpg,
}: {
  world: PlaygroundWorld
  setWorld: (world: PlaygroundWorld) => void
  quest: QuestState
  setQuest: (quest: QuestState) => void
  input: string
  setInput: (value: string) => void
  companionLine: string
  setCompanionLine: (value: string) => void
  rpgState: ReturnType<typeof usePlaygroundRpg>['state']
  activeQuest: PlaygroundQuest
  levelProgress: ReturnType<typeof usePlaygroundRpg>['levelProgress']
  lastReward: string | null
  completeQuest: ReturnType<typeof usePlaygroundRpg>['completeQuest']
  resetRpg: ReturnType<typeof usePlaygroundRpg>['resetRpg']
}) {
  const meta = WORLD_META[world]
  const isForge = world === 'forge'

  function askAthenaLite(text: string) {
    const body = text.trim()
    if (!body) return
    setInput('')
    if (/generate|build|world|forge|cyber/i.test(body)) {
      setQuest('generated-world')
      if (activeQuest.id === 'awakening-agora') completeQuest(activeQuest)
      else if (activeQuest.id === 'first-worldsmith') completeQuest(activeQuest)
      setCompanionLine('World generated: The Forge. Neon terminals, agent blacksmiths, and mission portals are ready. Click the portal to enter. Rewards unlocked in your inventory.')
      return
    }
    setQuest(quest === 'start' ? 'met-athena' : quest)
    if (activeQuest.id === 'awakening-agora') completeQuest(activeQuest)
    setCompanionLine('Hermes Playground is an AI agent RPG: humans explore, agents follow, missions unlock, and worlds are generated from prompts.')
  }

  function enterPortalLite() {
    setWorld(isForge ? 'agora' : 'forge')
    setQuest('complete')
    if (!isForge && activeQuest.id === 'enter-forge') completeQuest(activeQuest)
    setCompanionLine(isForge ? 'Back in The Agora. Every portal can become another generated world.' : 'Welcome to The Forge. The generated world is live, without needing WebGL. Forge Shard recovered.')
  }

  return (
    <div className="relative flex h-full min-h-[720px] flex-col overflow-hidden" style={{ background: meta.sky, color: 'white' }}>
      <PlaygroundHud
        state={rpgState}
        activeQuestTitle={activeQuest.title}
        levelProgress={levelProgress}
        currentWorld={world}
        worlds={PLAYGROUND_WORLDS}
        onSelectWorld={(next) => {
          if (rpgState.unlockedWorlds.includes(next)) setWorld(next)
        }}
        onReset={resetRpg}
        lastReward={lastReward}
      />
      <div className="absolute inset-0 opacity-60" style={{ background: `radial-gradient(circle at 50% 22%, ${meta.accent}55, transparent 34%), linear-gradient(180deg, transparent, #000 92%)` }} />
      <div className="relative z-10 flex items-start justify-between gap-3 p-4">
        <div className="rounded-2xl border border-white/10 bg-black/45 px-4 py-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold">Hermes Playground</div>
            <span className="rounded bg-cyan-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-200">hackathon</span>
          </div>
          <div className="mt-1 text-xs text-white/65">GPU-safe world · AI agent RPG demo · {meta.name}</div>
        </div>
        <div className="w-[320px] rounded-2xl border border-white/10 bg-black/45 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">Mission</div>
            <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: meta.accent }}>{meta.name}</div>
          </div>
          <div className="space-y-1.5 text-xs">
            <MissionDone done>Enter Playground</MissionDone>
            <MissionDone done={quest !== 'start'}>Talk to Athena</MissionDone>
            <MissionDone done={quest === 'generated-world' || quest === 'complete'}>Generate a new world</MissionDone>
            <MissionDone done={quest === 'complete'}>Enter the portal</MissionDone>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-6 pb-6">
        <div
          className="relative h-[430px] w-full overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl"
          style={{
            background: `radial-gradient(ellipse at 50% 52%, ${meta.accent}24, transparent 42%), linear-gradient(180deg, ${meta.ground}, #05070c)`,
            perspective: 900,
          }}
        >
          <div
            className="absolute left-1/2 top-[58%] h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border"
            style={{
              transform: 'translate(-50%, -50%) rotateX(64deg)',
              borderColor: `${meta.accent}55`,
              background: `repeating-linear-gradient(90deg, transparent 0 44px, ${meta.accent}18 45px 46px), repeating-linear-gradient(0deg, transparent 0 44px, ${meta.accent}10 45px 46px)`,
            }}
          />

          {(isForge ? [-280, -120, 120, 280] : [-320, -210, 210, 320]).map((x, i) => (
            <div
              key={x}
              className="absolute rounded-t-lg border border-white/10"
              style={{
                left: `calc(50% + ${x}px)`,
                top: isForge ? `${185 + (i % 2) * 55}px` : '120px',
                width: isForge ? 90 : 42,
                height: isForge ? 58 : 150,
                transform: 'translateX(-50%)',
                background: isForge ? `linear-gradient(180deg, ${meta.accent}66, #111827)` : 'linear-gradient(180deg, #f5e6c8, #8a7355)',
                boxShadow: isForge ? `0 0 28px ${meta.accent}55` : '0 20px 40px rgba(0,0,0,.35)',
              }}
            />
          ))}

          <button
            type="button"
            onClick={enterPortalLite}
            className="absolute left-[78%] top-[46%] flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-bold uppercase tracking-[0.18em] shadow-2xl transition-transform hover:scale-105"
            style={{ borderColor: meta.accent, color: meta.accent, background: `${meta.accent}18`, boxShadow: `0 0 45px ${meta.accent}66` }}
          >
            Portal
          </button>

          <div className="absolute left-[48%] top-[60%] -translate-x-1/2 -translate-y-1/2 text-center">
            <img src="/avatars/hermes.png" className="mx-auto h-24 w-24 rounded-full border-2 object-cover shadow-2xl" style={{ borderColor: meta.accent }} />
            <div className="mt-2 rounded bg-black/55 px-2 py-1 text-xs">You</div>
          </div>
          <div className="absolute left-[38%] top-[55%] -translate-x-1/2 -translate-y-1/2 text-center">
            <img src="/avatars/athena.png" className="mx-auto h-20 w-20 rounded-full border-2 border-purple-300 object-cover shadow-2xl" />
            <div className="mt-2 rounded bg-black/55 px-2 py-1 text-xs">Athena · Agent</div>
            {companionLine && (
              <div className="absolute left-1/2 top-[-92px] w-[290px] -translate-x-1/2 rounded-xl border border-purple-300/30 bg-black/75 px-3 py-2 text-left text-xs leading-snug shadow-xl backdrop-blur">
                {companionLine}
              </div>
            )}
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/45 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-xl">
            GPU-safe prototype · click portal · ask Athena
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto mb-5 w-full max-w-3xl px-4">
        <form
          className="flex gap-2 rounded-2xl border border-white/10 bg-black/45 p-3 shadow-2xl backdrop-blur-xl"
          onSubmit={(e) => {
            e.preventDefault()
            askAthenaLite(input)
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Athena… try: generate a cyberpunk forge world"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/45"
          />
          <button className="rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-black" style={{ background: meta.accent }}>
            Ask
          </button>
        </form>
      </div>
    </div>
  )
}

export function PlaygroundScreen() {
  const [launch3D, setLaunch3D] = useState(false)
  const [world, setWorld] = useState<PlaygroundWorld>('agora')
  const [quest, setQuest] = useState<QuestState>('start')
  const [input, setInput] = useState('')
  const [companionLine, setCompanionLine] = useState('Welcome to Hermes Playground. I am Athena, your agent companion. Ask me to generate a world.')
  const rpg = usePlaygroundRpg()
  const meta = WORLD_META[world]

  function askAthena(text: string) {
    const body = text.trim()
    if (!body) return
    setInput('')
    if (/generate|build|world|forge|cyber/i.test(body)) {
      setQuest('generated-world')
      setCompanionLine('I generated The Forge: neon code rivers, mission terminals, and agent blacksmiths. Walk through the portal to enter it.')
      return
    }
    setQuest((q) => (q === 'start' ? 'met-athena' : q))
    setCompanionLine('This is the first AI agent RPG world: humans explore, agents follow, missions emerge, and worlds are generated from prompts.')
  }

  function enterPortal() {
    setWorld((w) => (w === 'agora' ? 'forge' : 'agora'))
    setQuest('complete')
    setCompanionLine(world === 'agora'
      ? 'Welcome to The Forge. Your generated world is live. Next: multiplayer, voice, and quests.'
      : 'Back to The Agora. Every portal can become a generated world.')
  }

  if (!launch3D) {
    return <PlaygroundFallback onLaunch3D={() => setLaunch3D(true)} />
  }

  // Always try the real 3D world first. If R3F throws, the error boundary
  // swaps in the GPU-safe Lite world. Previously we pre-gated on WebGL
  // detection but that was over-eager and showed Lite even when the browser
  // could render Three.
  return (
    <PlaygroundErrorBoundary fallback={
      <PlaygroundLiteWorld
        world={world}
        setWorld={setWorld}
        quest={quest}
        setQuest={setQuest}
        input={input}
        setInput={setInput}
        companionLine={companionLine}
        setCompanionLine={setCompanionLine}
        rpgState={rpg.state}
        activeQuest={rpg.activeQuest}
        levelProgress={rpg.levelProgress}
        lastReward={rpg.lastReward}
        completeQuest={rpg.completeQuest}
        resetRpg={rpg.resetRpg}
      />
    }>
      <div className="relative h-full min-h-[640px] overflow-hidden" style={{ background: '#0b1720', color: 'white' }}>
        <PlaygroundWorld3D
          worldId={world}
          onPortal={() => {
            const next = world === 'agora' ? 'forge' : 'agora'
            if (rpg.state.unlockedWorlds.includes(next)) {
              setWorld(next)
              if (next === 'forge' && rpg.activeQuest.id === 'enter-forge') {
                rpg.completeQuest(rpg.activeQuest)
              }
            } else {
              rpg.unlockWorld('forge')
              setWorld('forge')
            }
          }}
          onQuestZone={(questId) => {
            const q = rpg.activeQuest
            if (q && q.id === questId) rpg.completeQuest(q)
          }}
        />
        <PlaygroundHud
          state={rpg.state}
          activeQuestTitle={rpg.activeQuest.title}
          levelProgress={rpg.levelProgress}
          currentWorld={world}
          worlds={PLAYGROUND_WORLDS}
          onSelectWorld={(next) => {
            if (rpg.state.unlockedWorlds.includes(next)) setWorld(next)
          }}
          onReset={rpg.resetRpg}
          lastReward={rpg.lastReward}
        />
        <div className="pointer-events-none absolute left-1/2 top-3 z-[60] -translate-x-1/2 rounded-full border border-white/10 bg-black/55 px-4 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70 backdrop-blur-xl">
          {WORLD_META[world].name} · WASD/arrows · Space jump · portal teleports
        </div>
      </div>
    </PlaygroundErrorBoundary>
  )

  // Legacy R3F embedded path (kept for reference, unreachable due to early return above).
  // eslint-disable-next-line @typescript-eslint/no-unreachable
  return (
    <div className="relative h-full min-h-0 overflow-hidden" style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>
      <PlaygroundErrorBoundary>
        <Canvas
          shadows
          camera={{ position: [7, 7, 10], fov: 48 }}
          dpr={[1, 1.5]}
          fallback={<PlaygroundFallback />}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'default',
            failIfMajorPerformanceCaveat: false,
          }}
        >
          <PlaygroundScene world={world} companionLine={companionLine} onEnterPortal={enterPortal} />
        </Canvas>
      </PlaygroundErrorBoundary>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold">Hermes Playground</div>
              <span className="rounded bg-cyan-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-200">hackathon</span>
            </div>
            <div className="mt-1 text-xs text-white/65">Nous × Kimi entry · first open-world AI agent RPG</div>
          </div>

          <div className="pointer-events-auto w-[320px] rounded-2xl border border-white/10 bg-black/45 p-3 text-white shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">Mission</div>
              <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: meta.accent }}>{meta.name}</div>
            </div>
            <div className="space-y-1.5 text-xs">
              <MissionDone done>Enter Playground</MissionDone>
              <MissionDone done={quest !== 'start'}>Talk to Athena</MissionDone>
              <MissionDone done={quest === 'generated-world' || quest === 'complete'}>Generate a new world</MissionDone>
              <MissionDone done={quest === 'complete'}>Enter the portal</MissionDone>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="pointer-events-auto max-w-[520px] rounded-2xl border border-white/10 bg-black/45 p-3 text-white shadow-2xl backdrop-blur-xl">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Athena · Agent Companion</div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                askAthena(input)
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Athena… try: generate a cyberpunk forge world"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/45"
              />
              <button className="rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-black" style={{ background: meta.accent }}>
                Ask
              </button>
            </form>
          </div>

          <div className="pointer-events-auto rounded-full border border-white/10 bg-black/45 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-xl">
            WASD / arrows move · shift sprint · click portal
          </div>
        </div>
      </div>
    </div>
  )
}

function MissionDone({ done, children }: { done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${done ? 'bg-emerald-400 text-black' : 'bg-white/10 text-white/40'}`}>
        {done ? '✓' : '•'}
      </span>
      <span className={done ? 'text-white' : 'text-white/55'}>{children}</span>
    </div>
  )
}
