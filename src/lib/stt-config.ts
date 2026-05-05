export const STT_PROVIDER_OPTIONS = [
  { value: 'local', label: 'Local (Whisper)' },
  { value: 'openai', label: 'OpenAI Whisper API' },
  { value: 'groq', label: 'Groq Whisper API' },
] as const

export const GROQ_STT_MODELS = [
  'whisper-large-v3-turbo',
  'whisper-large-v3',
  'distil-whisper-large-v3-en',
] as const
