import type { PlaygroundItemId, PlaygroundWorldId } from './playground-rpg'

/**
 * HermesWorld action contract.
 *
 * Agents should operate the world through deterministic verbs, not by
 * screen-clicking React controls. This file is the shared protocol surface
 * that can be wired into the human UI, background agents, offline progress,
 * and future arena/eval combat.
 */
export type PlaygroundActorKind = 'human' | 'agent' | 'npc'

export type PlaygroundActorRef = {
  id: string
  kind: PlaygroundActorKind
  displayName?: string
}

export type PlaygroundAction =
  | { kind: 'move_to'; targetId?: string; x?: number; z?: number }
  | { kind: 'talk_to'; npcId: string }
  | { kind: 'accept_quest'; questId: string }
  | { kind: 'complete_objective'; questId: string; objectiveId: string }
  | { kind: 'equip'; itemId: PlaygroundItemId }
  | { kind: 'travel'; worldId: PlaygroundWorldId }
  | { kind: 'attack'; targetId: string; abilityId?: string }
  | { kind: 'loot'; itemId?: PlaygroundItemId; targetId?: string }
  | { kind: 'rest' }

export type PlaygroundActionResult = {
  ok: boolean
  action: PlaygroundAction
  actor: PlaygroundActorRef
  message: string
  statePatch?: unknown
  emittedEvents?: PlaygroundWorldEvent[]
  suggestedNextActions?: PlaygroundAction[]
  errorCode?: 'invalid_action' | 'locked' | 'out_of_range' | 'missing_item' | 'cooldown' | 'not_found'
}

export type PlaygroundWorldEvent = {
  id: string
  ts: number
  actorId: string
  actorKind: PlaygroundActorKind
  type:
    | 'move'
    | 'dialog'
    | 'quest_accept'
    | 'objective_complete'
    | 'equip'
    | 'travel'
    | 'combat'
    | 'loot'
    | 'rest'
  worldId?: PlaygroundWorldId
  targetId?: string
  summary: string
  public: boolean
}

export type PlaygroundAgentWorldState = {
  actor: PlaygroundActorRef
  worldId: PlaygroundWorldId
  position: { x: number; z: number }
  hp?: number
  mp?: number
  sp?: number
  activeQuestId?: string
  activeObjectiveId?: string
  unlockedWorlds: PlaygroundWorldId[]
  inventory: PlaygroundItemId[]
  equipped: Partial<Record<'weapon' | 'cloak' | 'head' | 'artifact', PlaygroundItemId>>
  nearby: Array<{
    id: string
    kind: 'npc' | 'player' | 'item' | 'portal' | 'objective' | 'enemy'
    label: string
    distance: number
    verbs: PlaygroundAction['kind'][]
  }>
}

export function describeAction(action: PlaygroundAction): string {
  switch (action.kind) {
    case 'move_to':
      return action.targetId ? `Move to ${action.targetId}` : `Move to ${action.x ?? 0}, ${action.z ?? 0}`
    case 'talk_to':
      return `Talk to ${action.npcId}`
    case 'accept_quest':
      return `Accept quest ${action.questId}`
    case 'complete_objective':
      return `Complete ${action.questId}/${action.objectiveId}`
    case 'equip':
      return `Equip ${action.itemId}`
    case 'travel':
      return `Travel to ${action.worldId}`
    case 'attack':
      return `Attack ${action.targetId}`
    case 'loot':
      return action.itemId ? `Loot ${action.itemId}` : `Loot ${action.targetId ?? 'target'}`
    case 'rest':
      return 'Rest'
  }
}
