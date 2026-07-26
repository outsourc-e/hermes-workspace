import { describe, expect, it } from 'vitest'

import {
  buildTuiGatewayWebSocketUrl,
  normalizeSlashCommandCatalog,
} from './tui-command-catalog'

describe('normalizeSlashCommandCatalog', () => {
  it('keeps valid command metadata, trims fields, and deduplicates labels', () => {
    expect(
      normalizeSlashCommandCatalog({
        pairs: [
          ['/model', ' Switch model '],
          ['/model', 'Duplicate'],
          ['/skill', ''],
          ['not-a-command', 'Ignored'],
          ['/'],
          null,
        ],
      }),
    ).toEqual([
      { command: '/model', description: 'Switch model' },
      { command: '/skill', description: 'Run command' },
    ])
  })
})

describe('buildTuiGatewayWebSocketUrl', () => {
  it('preserves dashboard path prefixes and uses a loopback token', () => {
    expect(
      buildTuiGatewayWebSocketUrl('http://localhost:9119/hermes/', {
        kind: 'token',
        value: 'session-token',
      }),
    ).toBe('ws://localhost:9119/hermes/api/ws?token=session-token')
  })

  it('uses secure websocket transport and ticket auth for remote dashboards', () => {
    expect(
      buildTuiGatewayWebSocketUrl('https://dashboard.example.test', {
        kind: 'ticket',
        value: 'one-shot-ticket',
      }),
    ).toBe('wss://dashboard.example.test/api/ws?ticket=one-shot-ticket')
  })
})
