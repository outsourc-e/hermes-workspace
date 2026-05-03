/**
 * Agora — shared types for the Hermes Workspace community surface.
 *
 * v0.0: local mock lobby with fake users.
 * v0.1+: same types will be used for real WebSocket multiplayer.
 */

export type AgoraFacing = 'up' | 'down' | 'left' | 'right'
export type AgoraStatus = 'online' | 'away' | 'busy'

/**
 * Avatar id matches the existing Greek god / emoji portrait set used in
 * AgentView (see src/components/agent-view/avatar-options.ts).
 */
export type AgoraAvatarId =
  | 'hermes'
  | 'athena'
  | 'apollo'
  | 'artemis'
  | 'iris'
  | 'nike'
  | 'eros'
  | 'pan'
  | 'chronos'
  | 'owl'
  | 'hermes-cat'
  | 'robot'
  | 'fox'
  | 'ghost'
  | 'wolf'
  | 'octopus'
  | 'dragon'
  | 'panda'

export interface AgoraProfile {
  id: string
  handle: string
  displayName: string
  avatarId: AgoraAvatarId
  bio: string
  status: AgoraStatus
  /** Optional links (twitter, github, etc) */
  links?: { label: string; url: string }[]
  /** Current activity hint, e.g. "Building Hermes Workspace" */
  activity?: string
}

export interface AgoraUser {
  profile: AgoraProfile
  x: number
  y: number
  facing: AgoraFacing
  isSelf?: boolean
  isMoving?: boolean
}

export interface AgoraMessage {
  id: string
  userId: string
  body: string
  createdAt: number
  /** True if this is a system/world event, not a user chat */
  system?: boolean
}

/**
 * World definition. v0.0 ships with one default world ("agora-main").
 * v0.4+ will support multiple worlds and v0.5 user-built worlds.
 */
export interface AgoraWorld {
  id: string
  name: string
  description: string
  /** Logical world dimensions in arbitrary "world units". */
  width: number
  height: number
  /** Default spawn point for new users. */
  spawn: { x: number; y: number }
  /** Theme accent for chrome — uses theme tokens. */
  theme?: 'agora' | 'temple' | 'cyberpunk' | 'office'
}

export const DEFAULT_WORLD: AgoraWorld = {
  id: 'agora-main',
  name: 'The Agora',
  description: 'Default Hermes community lobby.',
  width: 1200,
  height: 720,
  spawn: { x: 600, y: 360 },
  theme: 'agora',
}

export const AGORA_PROFILE_STORAGE_KEY = 'hermes-workspace-agora-profile'
