import { describe, expect, it } from 'vitest'
import {
  parseSwarmModelLabel,
  resolveSwarmModelKey,
  swarmModelKeyFromOption,
  toSwarmModelKey,
} from './swarm-model-resolver'

describe('parseSwarmModelLabel', () => {
  it('returns null for empty / blank / null labels', () => {
    expect(parseSwarmModelLabel(null)).toBeNull()
    expect(parseSwarmModelLabel('')).toBeNull()
    expect(parseSwarmModelLabel('   ')).toBeNull()
  })

  it('parses simple provider/model-id format', () => {
    expect(parseSwarmModelLabel('openai-codex/gpt-5.5')).toEqual({
      provider: 'openai-codex',
      default: 'gpt-5.5',
    })
    expect(parseSwarmModelLabel('anthropic-oauth/claude-opus-4-7')).toEqual({
      provider: 'anthropic-oauth',
      default: 'claude-opus-4-7',
    })
    expect(parseSwarmModelLabel('anthropic/claude-sonnet-4-5')).toEqual({
      provider: 'anthropic',
      default: 'claude-sonnet-4-5',
    })
  })

  it('parses custom: providers and upstream model ids with slashes', () => {
    expect(parseSwarmModelLabel('custom:example-gateway/DeepSeek-V4-Pro-Seed')).toEqual({
      provider: 'custom:example-gateway',
      default: 'DeepSeek-V4-Pro-Seed',
    })
    expect(parseSwarmModelLabel('custom:example-gateway/deepseek-ai/deepseek-v4-pro')).toEqual({
      provider: 'custom:example-gateway',
      default: 'deepseek-ai/deepseek-v4-pro',
    })
  })

  it('avoids doubling upstream org prefixes in swarm keys', () => {
    expect(toSwarmModelKey('nvidia', 'minimaxai/minimax-m2.7')).toBe(
      'nvidia/minimaxai/minimax-m2.7',
    )
    expect(toSwarmModelKey('minimaxai', 'minimaxai/minimax-m2.7')).toBe(
      'minimaxai/minimax-m2.7',
    )
  })

  it('builds swarm keys from /api/models entries', () => {
    const option = {
      id: 'deepseek-ai/deepseek-v4-pro',
      name: 'deepseek-v4-pro',
      provider: 'custom:example-gateway',
    }
    expect(swarmModelKeyFromOption(option)).toBe(
      'custom:example-gateway/deepseek-ai/deepseek-v4-pro',
    )
    expect(resolveSwarmModelKey('deepseek-ai/deepseek-v4-pro', 'deepseek-ai', [option])).toBe(
      'custom:example-gateway/deepseek-ai/deepseek-v4-pro',
    )
  })

  it('returns null for unknown labels (no slash)', () => {
    expect(parseSwarmModelLabel('Unknown 9000')).toBeNull()
    expect(parseSwarmModelLabel('GPT-5.5')).toBeNull()
    expect(parseSwarmModelLabel('Opus 4.7')).toBeNull()
    expect(parseSwarmModelLabel('Worker')).toBeNull()
  })
})
