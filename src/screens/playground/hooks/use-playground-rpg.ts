import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PLAYGROUND_QUESTS,
  PLAYGROUND_SKILLS,
  PLAYGROUND_WORLDS,
  type PlaygroundItemId,
  type PlaygroundQuest,
  type PlaygroundSkillId,
  type PlaygroundWorldId,
} from '../lib/playground-rpg'

const STORAGE_KEY = 'hermes-playground-rpg-state'

export type PlaygroundRpgState = {
  level: number
  xp: number
  inventory: PlaygroundItemId[]
  skillXp: Record<PlaygroundSkillId, number>
  unlockedWorlds: PlaygroundWorldId[]
  completedQuests: string[]
  activeQuestId: string
}

const DEFAULT_SKILL_XP = Object.fromEntries(
  PLAYGROUND_SKILLS.map((skill) => [skill.id, 0]),
) as Record<PlaygroundSkillId, number>

function defaultState(): PlaygroundRpgState {
  return {
    level: 1,
    xp: 0,
    inventory: [],
    skillXp: DEFAULT_SKILL_XP,
    unlockedWorlds: ['agora'],
    completedQuests: [],
    activeQuestId: PLAYGROUND_QUESTS[0]?.id ?? '',
  }
}

function xpForNextLevel(level: number) {
  return 100 + (level - 1) * 75
}

function normalizeState(raw: Partial<PlaygroundRpgState> | null): PlaygroundRpgState {
  const base = defaultState()
  if (!raw) return base
  return {
    ...base,
    ...raw,
    skillXp: { ...base.skillXp, ...(raw.skillXp ?? {}) },
    inventory: Array.from(new Set(raw.inventory ?? [])),
    unlockedWorlds: Array.from(new Set(raw.unlockedWorlds ?? ['agora'])),
    completedQuests: Array.from(new Set(raw.completedQuests ?? [])),
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

export function usePlaygroundRpg() {
  const [state, setState] = useState<PlaygroundRpgState>(() => loadState())
  const [lastReward, setLastReward] = useState<string | null>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore private mode/quota
    }
  }, [state])

  const activeQuest = useMemo(
    () => PLAYGROUND_QUESTS.find((q) => q.id === state.activeQuestId) ?? PLAYGROUND_QUESTS[0],
    [state.activeQuestId],
  )

  const levelProgress = useMemo(() => {
    const needed = xpForNextLevel(state.level)
    return {
      current: state.xp,
      needed,
      pct: Math.max(0, Math.min(100, (state.xp / needed) * 100)),
    }
  }, [state.level, state.xp])

  const completeQuest = useCallback((quest: PlaygroundQuest = activeQuest) => {
    if (!quest || state.completedQuests.includes(quest.id)) return
    setState((prev) => {
      const reward = quest.reward
      let xp = prev.xp + reward.xp
      let level = prev.level
      let needed = xpForNextLevel(level)
      while (xp >= needed) {
        xp -= needed
        level += 1
        needed = xpForNextLevel(level)
      }
      const nextQuest = PLAYGROUND_QUESTS.find(
        (q) => !prev.completedQuests.includes(q.id) && q.id !== quest.id,
      )
      const inventory = Array.from(new Set([...(prev.inventory ?? []), ...(reward.items ?? [])]))
      const unlockedWorlds = Array.from(
        new Set([...(prev.unlockedWorlds ?? ['agora']), ...(reward.unlockWorlds ?? [])]),
      )
      const skillXp = { ...prev.skillXp }
      for (const [skill, amount] of Object.entries(reward.skillXp ?? {})) {
        skillXp[skill as PlaygroundSkillId] = (skillXp[skill as PlaygroundSkillId] ?? 0) + (amount ?? 0)
      }
      return {
        ...prev,
        xp,
        level,
        inventory,
        unlockedWorlds,
        skillXp,
        completedQuests: Array.from(new Set([...prev.completedQuests, quest.id])),
        activeQuestId: nextQuest?.id ?? quest.id,
      }
    })
    const bits = [`+${quest.reward.xp} XP`]
    if (quest.reward.items?.length) bits.push(`Items: ${quest.reward.items.length}`)
    if (quest.reward.unlockWorlds?.length) bits.push(`Unlocked: ${quest.reward.unlockWorlds.join(', ')}`)
    setLastReward(`${quest.title} complete · ${bits.join(' · ')}`)
    window.setTimeout(() => setLastReward(null), 7000)
  }, [activeQuest, state.completedQuests])

  const unlockWorld = useCallback((world: PlaygroundWorldId) => {
    setState((prev) => ({
      ...prev,
      unlockedWorlds: Array.from(new Set([...prev.unlockedWorlds, world])),
    }))
  }, [])

  const resetRpg = useCallback(() => {
    setState(defaultState())
    setLastReward(null)
  }, [])

  return {
    state,
    activeQuest,
    levelProgress,
    worlds: PLAYGROUND_WORLDS,
    skills: PLAYGROUND_SKILLS,
    completeQuest,
    unlockWorld,
    resetRpg,
    lastReward,
  }
}
