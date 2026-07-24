import { describe, expect, it } from 'vitest'
import { PLAYGROUND_QUESTS } from '../lib/playground-rpg'
import { isQuestObjectiveComplete } from './playground-sidepanel'

describe('PlaygroundSidePanel quest progress', () => {
  it('treats a missing persisted objective as incomplete', () => {
    const firstQuest = PLAYGROUND_QUESTS.at(0)
    const firstObjective = firstQuest?.objectives.at(0)

    expect(firstQuest).toBeDefined()
    expect(firstObjective).toBeDefined()
    if (!firstObjective) return

    expect(isQuestObjectiveComplete(undefined, firstObjective.id)).toBe(false)
  })
})
