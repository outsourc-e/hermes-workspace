import { describe, expect, it } from 'vitest'
import { parseManualOverride, classifyTask } from './task-classifier'

// ── parseManualOverride ───────────────────────────────────────────────────────

describe('parseManualOverride', () => {
  it('returns null when no override keyword present', () => {
    expect(parseManualOverride('Write me a poem about the sea')).toBeNull()
    expect(parseManualOverride('')).toBeNull()
  })

  it('parses use:opus', () => {
    const r = parseManualOverride('use:opus Please refactor this file')
    expect(r).not.toBeNull()
    expect(r?.provider).toBe('anthropic')
    expect(r?.model).toBe('claude-opus-4-8')
  })

  it('parses use:sonnet', () => {
    const r = parseManualOverride('use:sonnet explain this code')
    expect(r?.provider).toBe('anthropic')
    expect(r?.model).toBe('claude-sonnet-4-6')
  })

  it('parses use:codex', () => {
    const r = parseManualOverride('use:codex generate a function')
    expect(r?.provider).toBe('openai')
    expect(r?.model).toBe('codex-mini-latest')
  })

  it('parses use:gemini', () => {
    const r = parseManualOverride('use:gemini analyse this dataset')
    expect(r?.provider).toBe('google')
    expect(r?.model).toBe('gemini-2.5-pro')
  })

  it('parses use:deepseek with base_url', () => {
    const r = parseManualOverride('use:deepseek translate this')
    expect(r?.provider).toBe('deepseek')
    expect(r?.model).toBe('deepseek-chat')
    expect(r?.base_url).toContain('deepseek.com')
  })

  it('parses use:local with base_url', () => {
    const r = parseManualOverride('use:local quick question')
    expect(r?.provider).toBe('ollama')
    expect(r?.base_url).toContain('localhost')
  })

  it('parses use:fast into urgency signal', () => {
    const r = parseManualOverride('use:fast answer me')
    expect(r?.urgency).toBe('fast')
    expect(r?.model).toBeUndefined()
    expect(r?.provider).toBeUndefined()
  })

  it('parses model:<id> and takes precedence over use:X', () => {
    const r = parseManualOverride('use:sonnet model:gpt-5.4 do the thing')
    expect(r?.model).toBe('gpt-5.4')
    expect(r?.provider).toBeUndefined()
  })

  it('parses model:<id> alone', () => {
    const r = parseManualOverride('model:claude-opus-4-8')
    expect(r?.model).toBe('claude-opus-4-8')
  })

  it('is case-insensitive for use:X keywords', () => {
    expect(parseManualOverride('USE:OPUS please')).not.toBeNull()
    expect(parseManualOverride('Use:Gemini translate')).not.toBeNull()
  })
})

// ── classifyTask ──────────────────────────────────────────────────────────────

describe('classifyTask — token estimation and context_len', () => {
  it('classifies short context for tiny messages', () => {
    const r = classifyTask({ messages: [{ role: 'user', content: 'Hello' }] })
    expect(r.context_len).toBe('short')
    expect(r.estimated_tokens).toBeLessThan(1000)
  })

  it('classifies medium context for moderate messages', () => {
    const content = 'word '.repeat(1200) // ~1200 words, ~4800 chars → ~1200 tokens
    const r = classifyTask({ messages: [{ role: 'user', content }] })
    expect(r.context_len).toBe('medium')
  })

  it('classifies long context for large messages', () => {
    const content = 'word '.repeat(4000) // ~4000 tokens
    const r = classifyTask({ messages: [{ role: 'user', content }] })
    expect(r.context_len).toBe('long')
  })

  it('accumulates tokens across all messages', () => {
    const msgs = [
      { role: 'system', content: 'x'.repeat(4000) },
      { role: 'user', content: 'x'.repeat(4000) },
    ]
    const r = classifyTask({ messages: msgs })
    expect(r.estimated_tokens).toBeGreaterThan(1000)
  })
})

describe('classifyTask — task_type detection', () => {
  it('detects coding from keywords', () => {
    const r = classifyTask({ messages: [{ role: 'user', content: 'Refactor this TypeScript function to use async/await' }] })
    expect(r.task_type).toBe('coding')
  })

  it('detects summarisation', () => {
    const r = classifyTask({ messages: [{ role: 'user', content: 'TL;DR this article for me please' }] })
    expect(r.task_type).toBe('summarisation')
  })

  it('detects creative writing', () => {
    const r = classifyTask({ messages: [{ role: 'user', content: 'Write a short story about a robot' }] })
    expect(r.task_type).toBe('creative')
  })

  it('detects research', () => {
    const r = classifyTask({ messages: [{ role: 'user', content: 'Research the latest techniques for neural architecture search' }] })
    expect(r.task_type).toBe('research')
  })

  it('detects ops keywords', () => {
    const r = classifyTask({ messages: [{ role: 'user', content: 'How do I deploy this to Kubernetes?' }] })
    expect(r.task_type).toBe('ops')
  })

  it('falls back to qa for generic questions', () => {
    const r = classifyTask({ messages: [{ role: 'user', content: 'What is the capital of France?' }] })
    expect(r.task_type).toBe('qa')
  })
})

describe('classifyTask — complexity scoring', () => {
  it('returns complexity in [0, 1] range', () => {
    const r = classifyTask({ messages: [{ role: 'user', content: 'Hi' }] })
    expect(r.complexity).toBeGreaterThanOrEqual(0)
    expect(r.complexity).toBeLessThanOrEqual(1)
  })

  it('scores higher complexity for long sophisticated coding messages', () => {
    const content = 'Implement a comprehensive architecture for a distributed system with performance optimization ' + 'x '.repeat(2000)
    const high = classifyTask({ messages: [{ role: 'user', content }] })
    const low = classifyTask({ messages: [{ role: 'user', content: 'Fix this bug' }] })
    expect(high.complexity).toBeGreaterThan(low.complexity)
  })

  it('scores lower complexity for simple/quick messages', () => {
    const simple = classifyTask({ messages: [{ role: 'user', content: 'Quick question: what is 2+2?' }] })
    const complex = classifyTask({ messages: [{ role: 'user', content: 'Implement an in-depth advanced security system with comprehensive architecture' }] })
    expect(simple.complexity).toBeLessThan(complex.complexity)
  })
})

describe('classifyTask — urgency detection', () => {
  it('marks normal urgency by default', () => {
    const r = classifyTask({ messages: [{ role: 'user', content: 'explain async/await' }] })
    expect(r.urgency).toBe('normal')
  })

  it('marks fast urgency when last user message contains urgency keyword', () => {
    const r = classifyTask({
      messages: [
        { role: 'assistant', content: 'How can I help?' },
        { role: 'user', content: 'asap give me a summary' },
      ],
    })
    expect(r.urgency).toBe('fast')
  })

  it('does not mark fast urgency based on non-user messages', () => {
    const r = classifyTask({
      messages: [
        { role: 'system', content: 'Respond quickly always' },
        { role: 'user', content: 'Tell me about React' },
      ],
    })
    expect(r.urgency).toBe('normal')
  })
})

describe('classifyTask — attachments', () => {
  it('defaults has_attachments to false', () => {
    const r = classifyTask({ messages: [{ role: 'user', content: 'hello' }] })
    expect(r.has_attachments).toBe(false)
  })

  it('passes through hasAttachments=true', () => {
    const r = classifyTask({ messages: [{ role: 'user', content: 'hello' }], hasAttachments: true })
    expect(r.has_attachments).toBe(true)
  })
})
