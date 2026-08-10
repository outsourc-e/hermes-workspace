import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { requireProviderRuntimeMutationAuth } from './auth-middleware'

const original = {
  HERMES_PASSWORD: process.env.HERMES_PASSWORD,
  CLAUDE_PASSWORD: process.env.CLAUDE_PASSWORD,
  HOST: process.env.HOST,
  HERMES_HOST: process.env.HERMES_HOST,
}

beforeEach(() => {
  delete process.env.HERMES_PASSWORD
  delete process.env.CLAUDE_PASSWORD
  delete process.env.HOST
  delete process.env.HERMES_HOST
})

afterEach(() => {
  for (const [key, value] of Object.entries({
    HERMES_PASSWORD: original.HERMES_PASSWORD,
    CLAUDE_PASSWORD: original.CLAUDE_PASSWORD,
    HOST: original.HOST,
    HERMES_HOST: original.HERMES_HOST,
  })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('provider runtime mutation authentication', () => {
  it('fails closed without dashboard authentication', () => {
    expect(requireProviderRuntimeMutationAuth(new Request('http://localhost/api/provider-runtimes'))).toBe(false)
  })

  it('does not treat a loopback-looking request as sufficient authority', () => {
    expect(requireProviderRuntimeMutationAuth(new Request('http://localhost/api/provider-runtimes'))).toBe(false)
    const loopback = Object.assign(new Request('http://localhost/api/provider-runtimes'), { remoteAddress: '127.0.0.1' })
    expect(requireProviderRuntimeMutationAuth(loopback)).toBe(false)
  })

  it('allows no-password operation only when the trusted server bind and request are both loopback', () => {
    process.env.HOST = '127.0.0.1'
    expect(requireProviderRuntimeMutationAuth(new Request('http://127.0.0.1/api/provider-runtimes'))).toBe(true)
    expect(requireProviderRuntimeMutationAuth(new Request('http://192.168.1.22/api/provider-runtimes'))).toBe(false)
    process.env.HOST = '0.0.0.0'
    expect(requireProviderRuntimeMutationAuth(new Request('http://127.0.0.1/api/provider-runtimes'))).toBe(false)
  })

  it('requires a valid session when password protection is enabled', () => {
    process.env.HERMES_PASSWORD = 'configured'
    const loopback = Object.assign(new Request('http://localhost/api/provider-runtimes'), { remoteAddress: '127.0.0.1' })
    expect(requireProviderRuntimeMutationAuth(loopback)).toBe(false)
  })
})
