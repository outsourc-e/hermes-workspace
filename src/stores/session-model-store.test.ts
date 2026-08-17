import { beforeEach, describe, expect, it } from 'vitest'
import {
  NEW_CHAT_MODEL_KEY,
  getSessionModelKey,
  useSessionModelStore,
} from './session-model-store'

describe('session model preferences', () => {
  beforeEach(() => {
    useSessionModelStore.setState({ models: {} })
  })

  it('provides a stable key for model selection before a session exists', () => {
    const key = getSessionModelKey(undefined)

    expect(key).toBe(NEW_CHAT_MODEL_KEY)
    useSessionModelStore
      .getState()
      .setModel(key, 'openrouter::deepseek/deepseek-v4-pro')
    expect(useSessionModelStore.getState().getModel(key)).toBe(
      'openrouter::deepseek/deepseek-v4-pro',
    )
  })

  it('uses the real session key after the session exists', () => {
    expect(getSessionModelKey('  session-123  ')).toBe('session-123')
  })
})
