import { describe, expect, it } from 'vitest'

import { GROQ_STT_MODELS, STT_PROVIDER_OPTIONS } from './stt-config'

describe('stt config', () => {
  it('includes groq as a selectable STT provider', () => {
    expect(STT_PROVIDER_OPTIONS).toContainEqual({
      value: 'groq',
      label: 'Groq Whisper API',
    })
  })

  it('lists the supported Groq Whisper models in priority order', () => {
    expect(GROQ_STT_MODELS).toEqual([
      'whisper-large-v3-turbo',
      'whisper-large-v3',
      'distil-whisper-large-v3-en',
    ])
  })
})
