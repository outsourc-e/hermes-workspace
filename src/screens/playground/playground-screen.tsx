import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Float, Html, Sparkles, Stars, Text, useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

type PlaygroundWorld = 'agora' | 'forge'
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

export function PlaygroundScreen() {
  const [world, setWorld] = useState<PlaygroundWorld>('agora')
  const [quest, setQuest] = useState<QuestState>('start')
  const [input, setInput] = useState('')
  const [companionLine, setCompanionLine] = useState('Welcome to Hermes Playground. I am Athena, your agent companion. Ask me to generate a world.')
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

  return (
    <div className="relative h-full min-h-0 overflow-hidden" style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>
      <Canvas shadows camera={{ position: [7, 7, 10], fov: 48 }} dpr={[1, 1.5]}>
        <PlaygroundScene world={world} companionLine={companionLine} onEnterPortal={enterPortal} />
      </Canvas>

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
