import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PLAYGROUND_QUESTS,
  PLAYGROUND_SKILLS,
  PLAYGROUND_WORLDS,
  itemById,
  type EquipmentSlot,
  type PlaygroundItemId,
  type PlaygroundQuest,
  type PlaygroundSkillId,
  type PlaygroundWorldId,
  type PlayerProfile,
  type QuestProgressEntry,
} from '../lib/playground-rpg'
import { AVATAR_PRESETS, saveAvatarConfig, type AvatarConfig } from '../lib/avatar-config'

export type PlaygroundRpg = ReturnType<typeof usePlaygroundRpg>

export const PLAYGROUND_PROFILE_STORAGE_KEY = 'hermes-playground-player-profile'
export const PLAYGROUND_DISPLAY_NAME_STORAGE_KEY = 'hermes-playground-display-name'
export const PLAYGROUND_LEGACY_NAME_KEY = 'hermes-playground-builder-name'

const STORAGE_KEY = PLAYGROUND_PROFILE_STORAGE_KEY

type ToastKind = 'item' | 'xp' | 'title' | 'quest'

export type RewardToast = {
  id: string
  kind: ToastKind
  title: string
  body: string
}

export type PlaygroundRpgState = {
  playerProfile: PlayerProfile
  skillXp: Record<PlaygroundSkillId, number>
  unlockedWorlds: PlaygroundWorldId[]
  completedQuests: string[]
  hp: number
  hpMax: number
  mp: number
  mpMax: number
  sp: number
  spMax: number
  defeats: number
}

const DEFAULT_SKILL_XP = Object.fromEntries(
  PLAYGROUND_SKILLS.map((skill) => [skill.id, 0]),
) as Record<PlaygroundSkillId, number>

const EMPTY_EQUIPPED = {
  weapon: null,
  cloak: null,
  head: null,
  artifact: null,
} satisfies PlayerProfile['equipped']

const STARTER_INVENTORY: PlaygroundItemId[] = ['hermes-sigil', 'training-blade', 'novice-cloak']

function defaultQuestProgress(): Record<string, QuestProgressEntry> {
  return Object.fromEntries(
    PLAYGROUND_QUESTS.map((quest) => [
      quest.id,
      {
        completed: false,
        completedObjectives: [],
      },
    ]),
  )
}

function defaultProfile(): PlayerProfile {
  return {
    displayName: '',
    avatarConfig: AVATAR_PRESETS.hermes,
    equipped: { ...EMPTY_EQUIPPED },
    inventory: [],
    questProgress: defaultQuestProgress(),
    level: 1,
    xp: 0,
    titlesUnlocked: [],
    lastZone: 'training',
  }
}

function defaultState(): PlaygroundRpgState {
  return {
    playerProfile: defaultProfile(),
    skillXp: { ...DEFAULT_SKILL_XP },
    unlockedWorlds: ['training', 'agora'],
    completedQuests: [],
    hp: 100,
    hpMax: 100,
    mp: 50,
    mpMax: 50,
    sp: 80,
    spMax: 80,
    defeats: 0,
  }
}

function replayTutorialState(prev: PlaygroundRpgState): PlaygroundRpgState {
  return {
    ...prev,
    unlockedWorlds: ['training', 'agora'],
    completedQuests: [],
    hp: prev.hpMax,
    mp: prev.mpMax,
    sp: prev.spMax,
    playerProfile: {
      ...prev.playerProfile,
      equipped: { ...EMPTY_EQUIPPED },
      inventory: [...STARTER_INVENTORY],
      questProgress: defaultQuestProgress(),
      titlesUnlocked: prev.playerProfile.titlesUnlocked.filter((title) => title !== 'Initiate Builder'),
      lastZone: 'training',
    },
  }
}

function xpForNextLevel(level: number) {
  return 100 + (level - 1) * 75
}

function normalizeState(raw: Partial<PlaygroundRpgState> | null): PlaygroundRpgState {
  const base = defaultState()
  const rawProfile = raw?.playerProfile
  const completedQuests = Array.isArray(raw?.completedQuests) ? raw.completedQuests : []
  const legacy = raw as Partial<PlaygroundRpgState & {
    inventory: PlaygroundItemId[]
    level: number
    xp: number
  }> | null
  const legacyInventory = Array.isArray(legacy?.inventory) ? legacy.inventory : undefined
  const legacyLevel = typeof legacy?.level === 'number' ? legacy.level : undefined
  const legacyXp = typeof legacy?.xp === 'number' ? legacy.xp : undefined

  const profile: PlayerProfile = {
    ...base.playerProfile,
    ...rawProfile,
    displayName: rawProfile?.displayName ?? '',
    avatarConfig: { ...base.playerProfile.avatarConfig, ...(rawProfile?.avatarConfig ?? {}) },
    equipped: { ...EMPTY_EQUIPPED, ...(rawProfile?.equipped ?? {}) },
    inventory: Array.from(new Set(rawProfile?.inventory ?? legacyInventory ?? [])),
    questProgress: { ...defaultQuestProgress(), ...(rawProfile?.questProgress ?? {}) },
    level: rawProfile?.level ?? legacyLevel ?? base.playerProfile.level,
    xp: rawProfile?.xp ?? legacyXp ?? base.playerProfile.xp,
    titlesUnlocked: Array.from(new Set(rawProfile?.titlesUnlocked ?? [])),
    lastZone: rawProfile?.lastZone ?? (completedQuests.includes('training-q1') ? 'agora' : 'training'),
  }

  return {
    ...base,
    ...raw,
    playerProfile: profile,
    skillXp: { ...base.skillXp, ...(raw?.skillXp ?? {}) },
    unlockedWorlds: Array.from(new Set(raw?.unlockedWorlds ?? base.unlockedWorlds)),
    completedQuests: Array.from(new Set(completedQuests)),
  }
}

function loadState(): PlaygroundRpgState {
  if (typeof window === 'undefined') return defaultState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return normalizeState(raw ? JSON.parse(raw) : null)
  } catch {
    return defaultState()
  }
}

function activeQuestForState(state: PlaygroundRpgState) {
  return PLAYGROUND_QUESTS.find((quest) => !quest.optional && !state.completedQuests.includes(quest.id))
    ?? PLAYGROUND_QUESTS.find((quest) => !quest.optional)
}

function currentObjectiveForQuest(state: PlaygroundRpgState, quest: PlaygroundQuest | undefined) {
  if (!quest) return null
  const progress = state.playerProfile.questProgress[quest.id]
  return quest.objectives.find((objective) => !progress?.completedObjectives.includes(objective.id)) ?? null
}

function completeQuestState(
  prev: PlaygroundRpgState,
  quest: PlaygroundQuest,
) {
  if (prev.completedQuests.includes(quest.id)) return prev
  const reward = quest.reward
  let xp = prev.playerProfile.xp + reward.xp
  let level = prev.playerProfile.level
  let needed = xpForNextLevel(level)
  while (xp >= needed) {
    xp -= needed
    level += 1
    needed = xpForNextLevel(level)
  }

  const inventory = Array.from(
    new Set([...(prev.playerProfile.inventory ?? []), ...(reward.items ?? [])]),
  )
  const titlesUnlocked = reward.title
    ? Array.from(new Set([...prev.playerProfile.titlesUnlocked, reward.title]))
    : prev.playerProfile.titlesUnlocked
  const unlockedWorlds = Array.from(
    new Set([...(prev.unlockedWorlds ?? ['training', 'agora']), ...(reward.unlockWorlds ?? [])]),
  )
  const skillXp = { ...prev.skillXp }
  for (const [skill, amount] of Object.entries(reward.skillXp ?? {})) {
    skillXp[skill as PlaygroundSkillId] = (skillXp[skill as PlaygroundSkillId] ?? 0) + (amount ?? 0)
  }

  return {
    ...prev,
    skillXp,
    unlockedWorlds,
    completedQuests: Array.from(new Set([...prev.completedQuests, quest.id])),
    playerProfile: {
      ...prev.playerProfile,
      inventory,
      titlesUnlocked,
      level,
      xp,
      questProgress: {
        ...prev.playerProfile.questProgress,
        [quest.id]: {
          completed: true,
          completedObjectives: quest.objectives.map((objective) => objective.id),
        },
      },
    },
  }
}

export function usePlaygroundRpg() {
  const [state, setState] = useState<PlaygroundRpgState>(() => loadState())
  const [toasts, setToasts] = useState<RewardToast[]>([])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      window.localStorage.setItem(PLAYGROUND_DISPLAY_NAME_STORAGE_KEY, state.playerProfile.displayName)
    } catch {
      // ignore quota/private mode
    }
  }, [state])

  useEffect(() => {
    saveAvatarConfig(state.playerProfile.avatarConfig)
  }, [state.playerProfile.avatarConfig])

  const activeQuest = useMemo(() => activeQuestForState(state), [state])
  const currentObjective = useMemo(
    () => currentObjectiveForQuest(state, activeQuest),
    [activeQuest, state],
  )
  const optionalQuests = useMemo(
    () => PLAYGROUND_QUESTS.filter((quest) => quest.optional),
    [],
  )

  const levelProgress = useMemo(() => {
    const needed = xpForNextLevel(state.playerProfile.level)
    return {
      current: state.playerProfile.xp,
      needed,
      pct: Math.max(0, Math.min(100, (state.playerProfile.xp / needed) * 100)),
    }
  }, [state.playerProfile.level, state.playerProfile.xp])

  const stats = useMemo(() => {
    const values = { power: 0, guard: 0, command: 0, recall: 0, burst: 0 }
    for (const itemId of Object.values(state.playerProfile.equipped)) {
      if (!itemId) continue
      const item = itemById(itemId)
      const label = item?.stat?.label?.toLowerCase()
      if (!label || !item?.stat) continue
      if (label.includes('power')) values.power += item.stat.value
      if (label.includes('guard')) values.guard += item.stat.value
      if (label.includes('command')) values.command += item.stat.value
      if (label.includes('recall')) values.recall += item.stat.value
      if (label.includes('burst')) values.burst += item.stat.value
    }
    return values
  }, [state.playerProfile.equipped])

  const pushToast = useCallback((kind: ToastKind, title: string, body: string) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, kind, title, body }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 3500)
  }, [])

  const setDisplayName = useCallback((displayName: string) => {
    setState((prev) => ({
      ...prev,
      playerProfile: {
        ...prev.playerProfile,
        displayName,
      },
    }))
  }, [])

  const setAvatarConfig = useCallback((avatarConfig: AvatarConfig) => {
    setState((prev) => ({
      ...prev,
      playerProfile: {
        ...prev.playerProfile,
        avatarConfig,
      },
    }))
  }, [])

  const setLastZone = useCallback((lastZone: PlaygroundWorldId) => {
    setState((prev) => ({
      ...prev,
      playerProfile: {
        ...prev.playerProfile,
        lastZone,
      },
    }))
  }, [])

  const unlockWorld = useCallback((world: PlaygroundWorldId) => {
    setState((prev) => ({
      ...prev,
      unlockedWorlds: Array.from(new Set([...prev.unlockedWorlds, world])),
    }))
  }, [])

  const markObjective = useCallback((questId: string, objectiveId: string) => {
    const quest = PLAYGROUND_QUESTS.find((entry) => entry.id === questId)
    if (!quest) return
    let completedQuest: PlaygroundQuest | null = null
    setState((prev) => {
      const progress = prev.playerProfile.questProgress[questId] ?? {
        completed: false,
        completedObjectives: [],
      }
      if (progress.completedObjectives.includes(objectiveId)) return prev
      const completedObjectives = Array.from(new Set([...progress.completedObjectives, objectiveId]))
      const next = {
        ...prev,
        playerProfile: {
          ...prev.playerProfile,
          questProgress: {
            ...prev.playerProfile.questProgress,
            [questId]: {
              completed: progress.completed,
              completedObjectives,
            },
          },
        },
      }
      const complete = quest.objectives.every((objective) => completedObjectives.includes(objective.id))
      if (!complete || prev.completedQuests.includes(quest.id)) return next
      completedQuest = quest
      return completeQuestState(next, quest)
    })
    if (completedQuest) {
      pushToast('quest', 'Quest Complete', completedQuest.title)
      pushToast('xp', '+ XP', `+${completedQuest.reward.xp} XP`)
      if (completedQuest.reward.items?.length) {
        for (const itemId of completedQuest.reward.items) {
          const item = itemById(itemId)
          if (item) pushToast('item', '+ Item', item.name)
        }
      }
      if (completedQuest.reward.title) {
        pushToast('title', 'Title Unlocked', completedQuest.reward.title)
      }
    }
  }, [pushToast])

  const grantItems = useCallback((items: PlaygroundItemId[]) => {
    if (!items?.length) return
    setState((prev) => ({
      ...prev,
      playerProfile: {
        ...prev.playerProfile,
        inventory: Array.from(new Set([...prev.playerProfile.inventory, ...items])),
      },
    }))
    for (const itemId of items) {
      const item = itemById(itemId)
      if (item) pushToast('item', '+ Item', item.name)
    }
  }, [pushToast])

  const grantSkillXp = useCallback(
    (skillXp: Partial<Record<PlaygroundSkillId, number>>) => {
      setState((prev) => {
        const next = { ...prev.skillXp }
        for (const [skill, amount] of Object.entries(skillXp)) {
          next[skill as PlaygroundSkillId] =
            (next[skill as PlaygroundSkillId] ?? 0) + (amount ?? 0)
        }
        return { ...prev, skillXp: next }
      })
    },
    [],
  )

  const openInventory = useCallback(() => {
    markObjective('training-q2', 'open-kit')
  }, [markObjective])

  const equipItem = useCallback((itemId: PlaygroundItemId) => {
    const item = itemById(itemId)
    if (!item?.slot) return false
    setState((prev) => {
      if (!prev.playerProfile.inventory.includes(itemId)) return prev
      return {
        ...prev,
        playerProfile: {
          ...prev.playerProfile,
          equipped: {
            ...prev.playerProfile.equipped,
            [item.slot!]: itemId,
          },
        },
      }
    })
    const objectiveId =
      itemId === 'training-blade'
        ? 'equip-blade'
        : itemId === 'novice-cloak'
          ? 'equip-cloak'
          : null
    if (objectiveId) markObjective('training-q2', objectiveId)
    if (item.accent) {
      pushToast('item', 'Equipped', item.name)
    }
    return true
  }, [markObjective, pushToast])

  const unequipSlot = useCallback((slot: EquipmentSlot) => {
    setState((prev) => ({
      ...prev,
      playerProfile: {
        ...prev.playerProfile,
        equipped: {
          ...prev.playerProfile.equipped,
          [slot]: null,
        },
      },
    }))
  }, [])

  const completeQuest = useCallback((quest: PlaygroundQuest) => {
    if (!quest) return
    setState((prev) => completeQuestState(prev, quest))
    pushToast('quest', 'Quest Complete', quest.title)
    pushToast('xp', '+ XP', `+${quest.reward.xp} XP`)
    if (quest.reward.items?.length) {
      for (const itemId of quest.reward.items) {
        const item = itemById(itemId)
        if (item) pushToast('item', '+ Item', item.name)
      }
    }
    if (quest.reward.title) pushToast('title', 'Title Unlocked', quest.reward.title)
  }, [pushToast])

  const completeQuestById = useCallback((questId: string) => {
    const quest = PLAYGROUND_QUESTS.find((entry) => entry.id === questId)
    if (quest) completeQuest(quest)
  }, [completeQuest])

  const damagePlayer = useCallback((amount: number) => {
    setState((prev) => {
      const nextHp = amount < 0
        ? Math.min(prev.hpMax, prev.hp - amount)
        : Math.max(0, Math.min(prev.hpMax, prev.hp - amount))
      return { ...prev, hp: nextHp }
    })
  }, [])

  const useMp = useCallback((amount: number) => {
    let ok = false
    setState((prev) => {
      if (prev.mp < amount) return prev
      ok = true
      return { ...prev, mp: Math.max(0, prev.mp - amount) }
    })
    return ok
  }, [])

  const recordDefeat = useCallback((xpReward: number, itemDrop?: PlaygroundItemId) => {
    setState((prev) => {
      let xp = prev.playerProfile.xp + xpReward
      let level = prev.playerProfile.level
      let needed = xpForNextLevel(level)
      while (xp >= needed) {
        xp -= needed
        level += 1
        needed = xpForNextLevel(level)
      }
      return {
        ...prev,
        defeats: prev.defeats + 1,
        playerProfile: {
          ...prev.playerProfile,
          xp,
          level,
          inventory: itemDrop
            ? Array.from(new Set([...prev.playerProfile.inventory, itemDrop]))
            : prev.playerProfile.inventory,
        },
      }
    })
    pushToast('xp', '+ XP', `+${xpReward} XP`)
    if (itemDrop) {
      const item = itemById(itemDrop)
      if (item) pushToast('item', '+ Item', item.name)
    }
  }, [pushToast])

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((prev) => ({
        ...prev,
        hp: Math.min(prev.hpMax, prev.hp + 1),
        mp: Math.min(prev.mpMax, prev.mp + 1),
        sp: Math.min(prev.spMax, prev.sp + 2),
      }))
    }, 2500)
    return () => window.clearInterval(id)
  }, [])

  const resetRpg = useCallback(() => {
    setState(defaultState())
    setToasts([])
  }, [])

  const replayTutorial = useCallback(() => {
    setState((prev) => replayTutorialState(prev))
    setToasts([])
  }, [])

  return {
    state,
    activeQuest,
    currentObjective,
    optionalQuests,
    levelProgress,
    worlds: PLAYGROUND_WORLDS,
    skills: PLAYGROUND_SKILLS,
    stats,
    setDisplayName,
    setAvatarConfig,
    setLastZone,
    completeQuest,
    completeQuestById,
    markObjective,
    unlockWorld,
    grantItems,
    grantSkillXp,
    openInventory,
    equipItem,
    unequipSlot,
    damagePlayer,
    useMp,
    recordDefeat,
    resetRpg,
    replayTutorial,
    toasts,
  }
}
