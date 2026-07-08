import { describe, expect, it } from 'vitest'
import { heuristicPlan } from './nl-command'

describe('heuristicPlan', () => {
  it('routes goal: prefix to the goals engine', () => {
    expect(heuristicPlan('goal: raise coverage to 90%')).toEqual({
      action: 'goal',
      goal: 'raise coverage to 90%',
    })
  })
  it('routes "ask <worker> to …" to direct dispatch', () => {
    expect(heuristicPlan('ask builder to fix the header')).toEqual({
      action: 'dispatch',
      worker: 'builder',
      task: 'fix the header',
    })
  })
  it('routes questions to answer', () => {
    expect(heuristicPlan('what is the queue depth?')).toEqual({
      action: 'answer',
      question: 'what is the queue depth?',
    })
  })
  it('leaves ambiguous text to the classifier', () => {
    expect(heuristicPlan('tidy up the vault sometime')).toBeNull()
  })
})
