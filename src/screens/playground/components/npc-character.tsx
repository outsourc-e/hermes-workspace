import { GroupProps } from '@react-three/fiber'
import type { CharacterArchetypeId } from '../lib/character-config'
import { HERMESWORLD_CHARACTER_ARCHETYPES } from '../lib/character-config'

type NpcCharacterProps = GroupProps & {
  archetypeId: CharacterArchetypeId
  accent?: string
}

/**
 * Temporary visual scaffold for future GLB NPCs.
 *
 * This gives us a clean component boundary so Agora can stop rendering every
 * character ad hoc inside the giant world scene file.
 */
export function NpcCharacter({ archetypeId, accent, ...props }: NpcCharacterProps) {
  const archetype =
    HERMESWORLD_CHARACTER_ARCHETYPES.find((entry) => entry.id === archetypeId) ??
    HERMESWORLD_CHARACTER_ARCHETYPES[0]

  const tint = accent ?? inferTint(archetypeId)

  return (
    <group {...props}>
      <mesh castShadow receiveShadow position={[0, 0.85, 0]}>
        <capsuleGeometry args={[0.25, 1.0, 6, 12]} />
        <meshStandardMaterial color={tint} roughness={0.62} metalness={0.06} />
      </mesh>
      <mesh castShadow position={[0, 1.75, 0]}>
        <sphereGeometry args={[0.22, 20, 20]} />
        <meshStandardMaterial color="#f1c9a5" roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[0.84, 0.06, 0.06]} />
        <meshStandardMaterial color="#d9b35f" emissive="#2c2110" emissiveIntensity={0.14} />
      </mesh>
    </group>
  )
}

function inferTint(archetypeId: CharacterArchetypeId): string {
  switch (archetypeId) {
    case 'oracle-scholar':
      return '#8b6cff'
    case 'forge-blacksmith':
      return '#d97745'
    case 'guard-knight':
      return '#4773d6'
    case 'merchant-villager':
      return '#7c9b57'
    case 'villager-common':
      return '#6f8aa8'
    case 'player-adventurer':
    default:
      return '#4b7bec'
  }
}
