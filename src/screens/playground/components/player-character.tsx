import { GroupProps } from '@react-three/fiber'
import { HERMESWORLD_CHARACTER_ARCHETYPES } from '../lib/character-config'

const PLAYER_ARCHETYPE = HERMESWORLD_CHARACTER_ARCHETYPES.find(
  (entry) => entry.id === 'player-adventurer',
)

/**
 * Placeholder component for the first believable-player pipeline.
 *
 * Intentionally simple for now: we want a stable integration point before
 * wiring a real GLB + animation controller. The next pass should replace this
 * with a loaded character model + idle/walk/run/talk animation states.
 */
export function PlayerCharacter(props: GroupProps) {
  return (
    <group {...props}>
      <mesh castShadow receiveShadow position={[0, 0.9, 0]}>
        <capsuleGeometry args={[0.28, 1.1, 6, 12]} />
        <meshStandardMaterial color="#4b7bec" roughness={0.58} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0, 1.85, 0]}>
        <sphereGeometry args={[0.24, 24, 24]} />
        <meshStandardMaterial color="#f1c9a5" roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <boxGeometry args={[0.9, 0.08, 0.08]} />
        <meshStandardMaterial color="#d9b35f" emissive="#3a2b11" emissiveIntensity={0.18} />
      </mesh>
    </group>
  )
}
