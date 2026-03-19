'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { ProviderLogo } from '@/components/provider-logo'

const ONBOARDING_KEY = 'hermes-onboarding-complete'

type Step = 'welcome' | 'connect' | 'provider' | 'test' | 'done'

const PROVIDERS = [
  { id: 'nous', name: 'Nous Portal', logo: '/providers/nous.png', desc: 'Free via OAuth', authType: 'oauth' },
  { id: 'openai-codex', name: 'OpenAI Codex', logo: '/providers/openai.png', desc: 'Free via ChatGPT Pro', authType: 'oauth' },
  { id: 'anthropic', name: 'Anthropic', logo: '/providers/anthropic.png', desc: 'API key required', authType: 'api_key', envKey: 'ANTHROPIC_API_KEY' },
  { id: 'openrouter', name: 'OpenRouter', logo: '/providers/openrouter.png', desc: 'API key required', authType: 'api_key', envKey: 'OPENROUTER_API_KEY' },
  { id: 'ollama', name: 'Ollama', logo: '/providers/ollama.png', desc: 'Local models, no key needed', authType: 'none' },
  { id: 'custom', name: 'Custom (OpenAI-compat)', logo: '/providers/openai.png', desc: 'Any OpenAI-compatible endpoint', authType: 'custom' },
]

export function HermesOnboarding() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState<Step>('welcome')
  const [hermesOk, setHermesOk] = useState<boolean | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [configuredModel, setConfiguredModel] = useState('')

  const checkConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes-config')
      if (res.ok) {
        const data = await res.json() as { activeModel?: string; activeProvider?: string }
        return { activeModel: data.activeModel || '', activeProvider: data.activeProvider || '' }
      }
    } catch {}
    return { activeModel: '', activeProvider: '' }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const done = localStorage.getItem(ONBOARDING_KEY)
    if (!done) {
      setShow(true)
      return
    }
    // Even if previously completed, re-show if no model/provider configured
    checkConfig().then(({ activeModel, activeProvider }) => {
      if (!activeModel && !activeProvider) {
        setShow(true)
      }
    })
  }, [checkConfig])

  const complete = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setShow(false)
  }, [])

  const checkHermes = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes-config')
      if (res.ok) {
        const data = await res.json() as { activeModel?: string; activeProvider?: string }
        setHermesOk(true)
        setConfiguredModel(data.activeModel || '')
        setSelectedProvider(data.activeProvider || null)
        setStep('provider')
      } else {
        setHermesOk(false)
      }
    } catch {
      setHermesOk(false)
    }
  }, [])

  const provider = PROVIDERS.find((p) => p.id === selectedProvider)
  const needsApiKey = provider?.authType === 'api_key' || provider?.authType === 'custom'
  const needsBaseUrl = provider?.id === 'ollama' || provider?.authType === 'custom'

  const saveProviderConfig = useCallback(async () => {
    if (!selectedProvider) return
    setSaving(true)
    setSaveError('')
    setAvailableModels([])
    try {
      const prov = PROVIDERS.find((p) => p.id === selectedProvider)
      const body: Record<string, unknown> = {
        config: { model: { provider: selectedProvider } },
      }
      if (prov?.envKey && apiKey) {
        body.env = { [prov.envKey]: apiKey }
      }
      if (baseUrl) {
        body.config = { model: { provider: selectedProvider, baseUrl } }
      }

      const res = await fetch('/api/hermes-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Save failed: ${res.status}`)

      // Try to fetch available models
      try {
        const modelsRes = await fetch('/v1/models')
        if (modelsRes.ok) {
          const modelsData = await modelsRes.json() as { data?: Array<{ id: string }> }
          const models = (modelsData.data || []).map((m) => m.id).slice(0, 20)
          setAvailableModels(models)
          if (models.length > 0) setSelectedModel(models[0])
        }
      } catch {
        // Models endpoint not available — that's ok
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [selectedProvider, apiKey, baseUrl])

  const saveModelSelection = useCallback(async () => {
    if (!selectedModel) return
    try {
      await fetch('/api/hermes-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { model: { provider: selectedProvider, default: selectedModel } } }),
      })
      setConfiguredModel(selectedModel)
    } catch {}
  }, [selectedModel, selectedProvider])

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
      if (!res.ok) throw new Error(`HTTP ${res.status} — check your API key and model config`)
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
  const inputStyle: React.CSSProperties = { backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }

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
                {configuredModel ? `Currently using ${configuredModel}` : 'Select your AI model provider'}
              </p>
              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProvider(p.id); setApiKey(''); setBaseUrl(''); setSaveError(''); setAvailableModels([]) }}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all',
                      selectedProvider === p.id ? 'ring-2 ring-accent-500' : '',
                    )}
                    style={cardStyle}
                  >
                    <ProviderLogo provider={p.id} size={40} className="rounded-xl shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{p.name}</div>
                      <div className="text-xs" style={mutedStyle}>{p.desc}</div>
                    </div>
                    {selectedProvider === p.id && <span className="ml-auto size-2.5 rounded-full bg-green-500 shrink-0" />}
                  </button>
                ))}
              </div>

              {/* API key / base URL inputs */}
              {selectedProvider && (needsApiKey || needsBaseUrl) && (
                <div className="space-y-2 pt-1">
                  {needsBaseUrl && (
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={mutedStyle}>
                        {selectedProvider === 'ollama' ? 'Ollama URL' : 'Base URL'}
                      </label>
                      <input
                        type="text"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder={selectedProvider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500"
                        style={inputStyle}
                      />
                    </div>
                  )}
                  {needsApiKey && (
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={mutedStyle}>API Key</label>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500"
                        style={inputStyle}
                      />
                    </div>
                  )}
                </div>
              )}

              {saveError && <p className="text-xs text-red-400">{saveError}</p>}

              {/* Model selector if models were fetched */}
              {availableModels.length > 0 && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={mutedStyle}>Select Model</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500"
                    style={inputStyle}
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2">
                {/* Save button for key-based providers */}
                {selectedProvider && (needsApiKey || needsBaseUrl) && (
                  <button
                    onClick={saveProviderConfig}
                    disabled={saving || (needsApiKey && !apiKey && !needsBaseUrl)}
                    className="flex-1 rounded-xl py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Key'}
                  </button>
                )}
                <button
                  onClick={async () => {
                    // For OAuth providers, just save provider choice then proceed
                    if (selectedProvider && !needsApiKey && !needsBaseUrl) {
                      await saveProviderConfig()
                    }
                    if (availableModels.length > 0 && selectedModel) {
                      await saveModelSelection()
                    }
                    setStep('test')
                  }}
                  disabled={!selectedProvider}
                  className="flex-1 rounded-xl py-3 text-sm font-semibold text-white bg-accent-500 hover:bg-accent-600 transition-colors disabled:opacity-50"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step: Test */}
          {step === 'test' && (
            <div className="text-center space-y-4">
              <div className="text-4xl">🧪</div>
              <h2 className="text-lg font-bold">Test Connection</h2>
              {configuredModel ? (
                <p className="text-xs" style={mutedStyle}>
                  Model: <span className="font-mono text-accent-400">{configuredModel}</span>
                </p>
              ) : (
                <p className="text-xs" style={mutedStyle}>Send a test message to verify everything works.</p>
              )}

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
                  <div className="rounded-xl p-3 text-sm text-left bg-red-900/20 border border-red-500/30">
                    <p className="text-red-400 font-medium mb-1">Connection failed</p>
                    <p className="text-xs" style={mutedStyle}>{testMessage}</p>
                    {testMessage.includes('401') || testMessage.includes('key') ? (
                      <p className="text-xs mt-2 text-yellow-400">→ Check your API key is correct and has credits.</p>
                    ) : testMessage.includes('model') ? (
                      <p className="text-xs mt-2 text-yellow-400">→ The selected model may not be available on your plan.</p>
                    ) : (
                      <p className="text-xs mt-2 text-yellow-400">→ Is Hermes Agent running? Try: <code>hermes --web</code></p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={testConnection} className="flex-1 rounded-lg py-2 text-xs font-medium bg-accent-500 text-white">
                      Retry
                    </button>
                    <button onClick={() => setStep('provider')} className="flex-1 rounded-lg py-2 text-xs font-medium border" style={{ borderColor: 'var(--theme-border)' }}>
                      ← Back
                    </button>
                  </div>
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
