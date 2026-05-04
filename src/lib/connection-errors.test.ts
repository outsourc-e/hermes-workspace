import { describe, expect, it } from 'vitest'

import {
  classifyConnectionError,
  getConnectionErrorInfo,
  getConnectionErrorMessage,
} from './connection-errors'

describe('classifyConnectionError', () => {
  it('returns gateway_unreachable when no error and no status', () => {
    expect(classifyConnectionError()).toBe('gateway_unreachable')
    expect(classifyConnectionError('')).toBe('gateway_unreachable')
    expect(classifyConnectionError(null, null)).toBe('gateway_unreachable')
  })

  it('classifies HTTP 401 as clawsuite_auth_required', () => {
    expect(classifyConnectionError('boom', 401)).toBe('clawsuite_auth_required')
  })

  it('classifies HTTP 403 as gateway_pairing_required', () => {
    expect(classifyConnectionError('boom', 403)).toBe(
      'gateway_pairing_required',
    )
  })

  it('classifies pairing keywords as gateway_pairing_required', () => {
    expect(classifyConnectionError('device is not paired')).toBe(
      'gateway_pairing_required',
    )
    expect(classifyConnectionError('please pair the device')).toBe(
      'gateway_pairing_required',
    )
  })

  it('classifies explicit gateway-token rejection as gateway_auth_rejected (issue #239)', () => {
    // The exact wording in the bug report.
    expect(
      classifyConnectionError('Hermes Agent rejected the connection token'),
    ).toBe('gateway_auth_rejected')
    expect(classifyConnectionError('missing gateway auth')).toBe(
      'gateway_auth_rejected',
    )
    expect(classifyConnectionError('invalid token')).toBe(
      'gateway_auth_rejected',
    )
    expect(classifyConnectionError('token expired')).toBe(
      'gateway_auth_rejected',
    )
    expect(classifyConnectionError('Unauthorized')).toBe(
      'gateway_auth_rejected',
    )
  })

  it('does NOT misclassify benign uses of the word "token" as auth failures', () => {
    // Regression: previously `lower.includes('token')` matched any error
    // mentioning the word "token", routing benign network errors to a
    // "Log in again" prompt.
    expect(classifyConnectionError('failed to fetch token from /api/foo')).toBe(
      'gateway_unreachable',
    )
    expect(classifyConnectionError('cancelled token before request')).toBe(
      'unknown',
    )
  })

  it('classifies network errors as gateway_unreachable', () => {
    expect(classifyConnectionError('ECONNREFUSED 127.0.0.1:8642')).toBe(
      'gateway_unreachable',
    )
    expect(classifyConnectionError('getaddrinfo ENOTFOUND example')).toBe(
      'gateway_unreachable',
    )
    expect(classifyConnectionError('NetworkError when fetching')).toBe(
      'gateway_unreachable',
    )
  })

  it('classifies handshake errors', () => {
    expect(classifyConnectionError('invalid nonce')).toBe('handshake_failed')
    expect(classifyConnectionError('handshake failed')).toBe('handshake_failed')
  })

  it('classifies timeouts', () => {
    expect(classifyConnectionError('request timeout')).toBe('handshake_timeout')
    expect(classifyConnectionError('timed out after 30s')).toBe(
      'handshake_timeout',
    )
  })

  it('classifies disconnects', () => {
    expect(classifyConnectionError('connection closed')).toBe('disconnected')
    expect(classifyConnectionError('client disconnect')).toBe('disconnected')
  })

  it('falls through to unknown for unrelated errors', () => {
    expect(classifyConnectionError('something weird happened')).toBe('unknown')
  })

  it('accepts Error instances as input', () => {
    expect(classifyConnectionError(new Error('Unauthorized'))).toBe(
      'gateway_auth_rejected',
    )
  })
})

describe('getConnectionErrorMessage', () => {
  it('returns a distinct gateway-specific message for gateway_auth_rejected', () => {
    // Regression: previously this case was a fallthrough that re-used the
    // ClawSuite-login text, telling users to "Enter your password" when
    // their actual problem was the gateway refusing their device token.
    const gateway = getConnectionErrorMessage('gateway_auth_rejected')
    const clawsuite = getConnectionErrorMessage('clawsuite_auth_required')
    expect(gateway.title).not.toBe(clawsuite.title)
    expect(gateway.description).not.toBe(clawsuite.description)
    expect(gateway.title.toLowerCase()).toContain('gateway')
    // The action should point the user at re-pairing / token config, not
    // at entering a password.
    expect(gateway.action?.toLowerCase()).not.toContain('password')
  })

  it('returns a non-empty message for every kind', () => {
    const kinds = [
      'clawsuite_auth_required',
      'gateway_auth_rejected',
      'gateway_pairing_required',
      'gateway_unreachable',
      'handshake_failed',
      'handshake_timeout',
      'disconnected',
      'unknown',
    ] as const
    for (const kind of kinds) {
      const info = getConnectionErrorMessage(kind)
      expect(info.title.length).toBeGreaterThan(0)
      expect(info.description.length).toBeGreaterThan(0)
    }
  })
})

describe('getConnectionErrorInfo', () => {
  it('combines kind, title, and details', () => {
    const info = getConnectionErrorInfo(
      'Hermes Agent rejected the connection token',
    )
    expect(info.kind).toBe('gateway_auth_rejected')
    expect(info.title.toLowerCase()).toContain('gateway')
    expect(info.details).toBe('Hermes Agent rejected the connection token')
  })

  it('suppresses generic details that duplicate the title', () => {
    const info = getConnectionErrorInfo('unauthorized', 401)
    expect(info.kind).toBe('clawsuite_auth_required')
    expect(info.details).toBeUndefined()
  })

  it('does not misroute benign "token" details to auth failure', () => {
    const info = getConnectionErrorInfo('failed to fetch token from /api/foo')
    expect(info.kind).toBe('gateway_unreachable')
  })
})
