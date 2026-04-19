import { describe, expect, it } from 'vitest'
import {
  getZeroForkModelInfoFlags,
  MODEL_SWITCH_BLOCKED_TOAST,
  shouldBlockZeroForkModelSwitch,
} from './chat-composer-model-switch'

describe('zero-fork model switch guard', () => {
  it('blocks picker swaps only for zero-fork vanilla agents', () => {
    expect(
      shouldBlockZeroForkModelSwitch('zero-fork', {
        vanillaAgent: true,
        supportsRuntimeSwitching: false,
      }),
    ).toBe(true)

    expect(
      shouldBlockZeroForkModelSwitch('enhanced-fork', {
        vanillaAgent: true,
        supportsRuntimeSwitching: false,
      }),
    ).toBe(false)

    expect(
      shouldBlockZeroForkModelSwitch('zero-fork', {
        vanillaAgent: false,
        supportsRuntimeSwitching: true,
      }),
    ).toBe(false)
  })

  it('infers vanilla zero-fork agents from realistic dashboard payloads', () => {
    const flags = getZeroForkModelInfoFlags({
      model: 'gpt-5.4',
      provider: 'openai-codex',
      capabilities: {
        supports_tools: true,
      },
    })

    expect(flags).toEqual({
      vanillaAgent: true,
      supportsRuntimeSwitching: false,
    })
    expect(shouldBlockZeroForkModelSwitch('zero-fork', flags)).toBe(true)
  })

  it('keeps the toast copy stable', () => {
    expect(MODEL_SWITCH_BLOCKED_TOAST).toBe(
      'Model switching requires the enhanced runtime. Set a default via `hermes config set model <id>` — the displayed model reflects your config.',
    )
  })
})
