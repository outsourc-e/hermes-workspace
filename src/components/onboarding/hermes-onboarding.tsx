'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
// Provider icons — simple colored letter badges (SSR-safe, no @lobehub/icons ESM issues)

const ONBOARDING_KEY = 'hermes-onboarding-complete'

type Step = 'welcome' | 'connect' | 'provider' | 'test' | 'done'

const PROVIDERS = [
  { id: 'nous', name: 'Nous Portal', letter: 'N', color: '#8B5CF6', desc: 'Free via OAuth' },
  { id: 'openai-codex', name: 'OpenAI Codex', letter: 'O', color: '#10B981', desc: 'Free via ChatGPT Pro' },
  { id: 'anthropic', name: 'Anthropic', letter: 'A', color: '#D97706', desc: 'API key required' },
  { id: 'openrouter', name: 'OpenRouter', letter: 'R', color: '#6366F1', desc: 'API key required' },
  { id: 'ollama', name: 'Ollama', letter: 'L', color: '#3B82F6', desc: 'Local models, no key needed' },
]

export function HermesOnboarding() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState<Step>('welcome')
  const [hermesOk, setHermesOk] = useState<boolean | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [model, setModel] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const done = localStorage.getItem(ONBOARDING_KEY)
    if (!done) setShow(true)
  }, [])

  const complete = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setShow(false)
  }, [])

  const checkHermes = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes-config')
      if (res.ok) {
        const data = await res.json() as any
        setHermesOk(true)
        setModel(data.activeModel || '')
        setSelectedProvider(data.activeProvider || null)
        setStep('provider')
      } else {
        setHermesOk(false)
      }
    } catch {
      setHermesOk(false)
    }
  }, [])

  const testConnection = useCallback(async () => {
    setTestStatus('testing')
    setTestMessage('')
    try {
      const res = await fetch('/api/send-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'Say "Hello! Hermes Workspace is ready." in one sentence.',
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream')
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const matches = chunk.match(/(?:delta|text|content)":"([^"]+)"/g)
        if (matches) {
          for (const m of matches) {
            const val = m.replace(/.*":"/, '').replace(/"$/, '')
            text += val
          }
        }
      }
      setTestMessage(text.slice(0, 200) || 'Connected successfully!')
      setTestStatus('success')
    } catch (err) {
      setTestMessage(err instanceof Error ? err.message : 'Connection failed')
      setTestStatus('error')
    }
  }, [])

  if (!show) return null

  const cardStyle: React.CSSProperties = { backgroundColor: 'var(--theme-card)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }
  const mutedStyle: React.CSSProperties = { color: 'var(--theme-muted)' }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.97 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full max-w-md rounded-2xl p-8"
          style={cardStyle}
        >
          {/* Progress dots removed — cleaner */}

          {/* Step: Welcome */}
          {step === 'welcome' && (
            <div className="text-center space-y-4">
              <img src="/hermes-avatar.webp" alt="Hermes" className="size-20 rounded-2xl mx-auto" style={{ filter: 'drop-shadow(0 8px 24px rgba(99,102,241,0.3))' }} />
              <h2 className="text-xl font-bold">Welcome to Hermes Workspace</h2>
              <p className="text-sm" style={mutedStyle}>
                Your native web control surface for Hermes Agent. Chat, tools, memory, skills — all in one place.
              </p>
              <button
                onClick={() => { setStep('connect'); checkHermes() }}
                className="w-full rounded-xl py-3 text-sm font-semibold text-white bg-accent-500 hover:bg-accent-600 transition-colors"
              >
                Get Started
              </button>
              <button onClick={complete} className="text-xs" style={mutedStyle}>
                Skip setup
              </button>
            </div>
          )}

          {/* Step: Connect */}
          {step === 'connect' && (
            <div className="text-center space-y-4">
              <div className="text-4xl">🔌</div>
              <h2 className="text-lg font-bold">Connecting to Hermes Agent</h2>
              {hermesOk === null && (
                <div className="flex items-center justify-center gap-2 text-sm" style={mutedStyle}>
                  <span className="size-2 rounded-full bg-accent-500 animate-pulse" />
                  Checking localhost:8642...
                </div>
              )}
              {hermesOk === true && (
                <div className="flex items-center justify-center gap-2 text-sm text-green-500">
                  <span className="size-2 rounded-full bg-green-500" />
                  Hermes Agent is running
                </div>
              )}
              {hermesOk === false && (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 text-sm text-red-400">
                    <span className="size-2 rounded-full bg-red-500" />
                    Hermes Agent not found
                  </div>
                  <div className="rounded-xl p-3 text-xs text-left font-mono" style={{ ...cardStyle, borderColor: 'var(--theme-border)' }}>
                    <p style={mutedStyle}>Start Hermes Agent:</p>
                    <p className="mt-1">pip install hermes-agent</p>
                    <p>hermes setup</p>
                    <p>hermes --web</p>
                  </div>
                  <button onClick={checkHermes} className="rounded-lg px-4 py-2 text-xs font-medium bg-accent-500 text-white">
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step: Provider */}
          {step === 'provider' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-center">Choose Provider</h2>
              <p className="text-xs text-center" style={mutedStyle}>
                {model ? `Currently using ${model}` : 'Select your AI model provider'}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProvider(p.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all',
                      selectedProvider === p.id ? 'ring-2 ring-accent-500' : '',
                    )}
                    style={cardStyle}
                  >
                    <div className="flex size-10 items-center justify-center rounded-xl text-white text-sm font-bold shrink-0" style={{ backgroundColor: p.color }}>
                      {p.letter}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{p.name}</div>
                      <div className="text-xs" style={mutedStyle}>{p.desc}</div>
                    </div>
                    {selectedProvider === p.id && <span className="ml-auto size-2.5 rounded-full bg-green-500 shrink-0" />}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setStep('test')}
                disabled={!selectedProvider}
                className="w-full rounded-xl py-3 text-sm font-semibold text-white bg-accent-500 hover:bg-accent-600 transition-colors disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step: Test */}
          {step === 'test' && (
            <div className="text-center space-y-4">
              <div className="text-4xl">🧪</div>
              <h2 className="text-lg font-bold">Test Connection</h2>
              <p className="text-xs" style={mutedStyle}>Send a test message to verify everything works.</p>

              {testStatus === 'idle' && (
                <button
                  onClick={testConnection}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-white bg-accent-500 hover:bg-accent-600 transition-colors"
                >
                  Send Test Message
                </button>
              )}
              {testStatus === 'testing' && (
                <div className="flex items-center justify-center gap-2 text-sm" style={mutedStyle}>
                  <span className="size-2 rounded-full bg-accent-500 animate-pulse" />
                  Thinking...
                </div>
              )}
              {testStatus === 'success' && (
                <div className="space-y-3">
                  <div className="rounded-xl p-3 text-sm text-left" style={cardStyle}>
                    <span className="text-green-500 font-medium">⚕ Hermes:</span>{' '}
                    <span>{testMessage}</span>
                  </div>
                  <button
                    onClick={() => setStep('done')}
                    className="w-full rounded-xl py-3 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors"
                  >
                    ✓ It works!
                  </button>
                </div>
              )}
              {testStatus === 'error' && (
                <div className="space-y-3">
                  <p className="text-sm text-red-400">{testMessage}</p>
                  <button onClick={testConnection} className="rounded-lg px-4 py-2 text-xs font-medium bg-accent-500 text-white">
                    Retry
                  </button>
                  <button onClick={() => setStep('done')} className="block mx-auto text-xs" style={mutedStyle}>
                    Skip for now
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && (
            <div className="text-center space-y-4">
              <div className="text-5xl">🎉</div>
              <h2 className="text-xl font-bold">You're all set!</h2>
              <p className="text-sm" style={mutedStyle}>
                Hermes Workspace is ready. Start chatting, explore tools, browse skills.
              </p>
              <div className="grid grid-cols-3 gap-2 text-xs" style={mutedStyle}>
                <div className="rounded-xl p-2" style={cardStyle}>
                  <div className="text-lg mb-1">💬</div>
                  <div>Chat</div>
                </div>
                <div className="rounded-xl p-2" style={cardStyle}>
                  <div className="text-lg mb-1">🛠</div>
                  <div>28+ Tools</div>
                </div>
                <div className="rounded-xl p-2" style={cardStyle}>
                  <div className="text-lg mb-1">📦</div>
                  <div>90 Skills</div>
                </div>
              </div>
              <button
                onClick={complete}
                className="w-full rounded-xl py-3 text-sm font-semibold text-white bg-accent-500 hover:bg-accent-600 transition-colors"
              >
                Open Workspace
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
