import { describe, expect, it } from 'vitest'
import { mapDashboardOAuthStart } from './-oauth-device-code-utils'

describe('OAuth device-code route helpers', () => {
  it('maps dashboard OpenAI Codex device-code start responses to the UI contract', () => {
    expect(
      mapDashboardOAuthStart({
        session_id: 'session-123',
        user_code: 'ABCD-EFGH',
        verification_url: 'https://auth.openai.com/codex/device',
        poll_interval: 5,
        expires_in: 900,
      }),
    ).toEqual({
      device_code: 'session-123',
      user_code: 'ABCD-EFGH',
      verification_uri_complete: 'https://auth.openai.com/codex/device',
      verification_uri: 'https://auth.openai.com/codex/device',
      interval: 5,
      expires_in: 900,
    })
  })

  it('preserves RFC 8628 fields returned by legacy OAuth providers', () => {
    expect(
      mapDashboardOAuthStart({
        device_code: 'device-123',
        user_code: 'WXYZ-1234',
        verification_uri_complete: 'https://provider.example/activate?user_code=WXYZ-1234',
        verification_uri: 'https://provider.example/activate',
        interval: 3,
      }),
    ).toMatchObject({
      device_code: 'device-123',
      user_code: 'WXYZ-1234',
      verification_uri_complete: 'https://provider.example/activate?user_code=WXYZ-1234',
      verification_uri: 'https://provider.example/activate',
      interval: 3,
    })
  })
})
