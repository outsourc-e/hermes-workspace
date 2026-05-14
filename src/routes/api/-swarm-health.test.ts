import { describe, expect, it } from 'vitest'
import { parseModelAuthEventsFromText, summarizeSwarmHealth } from './swarm-health'

describe('swarm-health model/auth readiness', () => {
  it('detects primary auth failure and fallback provider from Hermes logs', () => {
    const events = parseModelAuthEventsFromText(`
2026-05-04 18:37:56,770 WARNING cli: Primary provider auth failed (No Codex credentials stored. Run \`hermes auth\` to authenticate.). Falling through to fallback: minimax/MiniMax-M2.7
2026-05-04 18:37:56,771 WARNING provider: resolve_provider_client: openai-codex requested but no Codex OAuth token found
`)

    expect(events.authErrorCount).toBe(2)
    expect(events.fallbackCount).toBe(1)
    expect(events.fallbackProvider).toBe('minimax')
    expect(events.fallbackModel).toBe('MiniMax-M2.7')
    expect(events.modelAuthStatus).toBe('fallback-active')
    expect(events.primaryAuthOk).toBe(false)
  })

  it('detects Copilot classic PAT validation failures as primary auth failures', () => {
    const events = parseModelAuthEventsFromText('2026-05-04 18:38:04,950 WARNING cli: Copilot token validation failed: Token from `gh auth token` is a classic PAT (ghp_*). Classic PATs are not supported by the Copilot API.')

    expect(events.authErrorCount).toBe(1)
    expect(events.modelAuthStatus).toBe('primary-auth-failed')
    expect(events.primaryAuthOk).toBe(false)
  })

  it('marks summary degraded when any worker is falling back', () => {
    const workerBase = {
      displayName: 'Worker',
      humanLabel: 'Worker — Role',
      role: 'Role',
      specialty: null,
      mission: null,
      skills: [],
      capabilities: [],
      profileFound: true,
      wrapperFound: false,
      model: 'gpt-5.5',
      provider: 'openai-codex',
      recentAuthErrors: 0,
      recentFallbacks: 0,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastFallbackAt: null,
      lastFallbackMessage: null,
      modelAuthStatus: 'unknown' as const,
      primaryAuthOk: null,
      fallbackActive: false,
      fallbackProvider: null,
      fallbackModel: null,
    }
    const summary = summarizeSwarmHealth([
      { ...workerBase, workerId: 'swarm2', recentAuthErrors: 1, recentFallbacks: 1, modelAuthStatus: 'fallback-active', primaryAuthOk: false, fallbackActive: true, fallbackProvider: 'minimax', fallbackModel: 'MiniMax-M2.7' },
      { ...workerBase, workerId: 'swarm5' },
    ])

    expect(summary.workersUsingFallback).toBe(1)
    expect(summary.workersPrimaryAuthFailed).toBe(1)
    expect(summary.degraded).toBe(true)
    expect(summary.warnings.join('\n')).toContain('fallback')
  })
})
