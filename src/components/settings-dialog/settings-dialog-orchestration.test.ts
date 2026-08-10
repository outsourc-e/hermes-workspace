import { describe, expect, it } from 'vitest'
import {
  OAUTH_ROLE_ASSIGNMENT_SURFACES,
  modelLabel,
} from '../settings/orchestration-settings'
import { SETTINGS_DIALOG_SECTIONS } from './settings-dialog'

describe('SettingsDialog orchestration navigation', () => {
  it('exposes subscription orchestration in the primary settings dialog', () => {
    expect(SETTINGS_DIALOG_SECTIONS).toContainEqual(
      expect.objectContaining({ id: 'orchestration', label: 'Orchestration' }),
    )
  })

  it('covers every configurable agent role with the canonical OAuth registry', () => {
    expect(OAUTH_ROLE_ASSIGNMENT_SURFACES).toEqual([
      'current-chat',
      'orchestrator',
      'default-subagent',
      'named-worker',
      'fallback',
      'swarm-role',
    ])
  })

  it('renders human Claude Max account and Antigravity Gemini labels instead of raw route IDs', () => {
    expect(
      modelLabel({
        id: 'claude-cwm4tx/sonnet',
        provider: 'claude-max-relay',
        account: 'cwm4tx',
        model: 'sonnet',
        transport: 'claude-cli-oauth',
        billingClass: 'subscription_included',
        status: 'available',
        selectable: true,
        warning: '',
        resetAt: null,
      }),
    ).toBe('Claude Max CWM · Sonnet')
    expect(
      modelLabel({
        id: 'claude-gp/claude-opus-5',
        provider: 'claude-max-relay',
        account: 'gp',
        model: 'claude-opus-5',
        transport: 'claude-cli-oauth',
        billingClass: 'subscription_included',
        status: 'quota_limited',
        selectable: true,
        warning: '',
        resetAt: null,
      }),
    ).toBe('Claude Max GP · Claude Opus 5 · quota limited')
    expect(
      modelLabel({
        id: 'google-antigravity/gemini-3.6-flash-high',
        provider: 'google-antigravity',
        account: 'google-antigravity',
        model: 'gemini-3.6-flash-high',
        transport: 'google-antigravity-oauth',
        billingClass: 'subscription_included',
        status: 'available',
        selectable: true,
        warning: '',
        resetAt: null,
      }),
    ).toBe('Antigravity · Gemini 3.6 Flash (High)')
  })
})
