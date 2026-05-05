import { describe, expect, it } from 'vitest'
import { shouldResolveStreamSession } from './use-streaming-message'

describe('shouldResolveStreamSession', () => {
  it('does not promote backend api session ids over concrete Workspace sessions', () => {
    expect(
      shouldResolveStreamSession({
        requestedSessionKey: 'api-original-workspace',
        currentSessionKey: 'api-original-workspace',
        resolvedSessionKey: 'api-derived-backend',
      }),
    ).toBe(false)
  })

  it('allows bootstrap new chats to resolve once to a concrete session', () => {
    expect(
      shouldResolveStreamSession({
        requestedSessionKey: 'new',
        currentSessionKey: 'new',
        resolvedSessionKey: 'api-created-session',
      }),
    ).toBe(true)
  })

  it('allows bootstrap main chats to resolve to an existing concrete session', () => {
    expect(
      shouldResolveStreamSession({
        requestedSessionKey: 'main',
        currentSessionKey: 'main',
        resolvedSessionKey: 'existing-main-session',
      }),
    ).toBe(true)
  })
})
