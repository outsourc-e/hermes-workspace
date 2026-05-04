import { describe, expect, it } from 'vitest'
import {
  MASK_SENTINEL,
  maskSecretsInPlace,
  normalizeMcpList,
  normalizeMcpListFromConfig,
  normalizeMcpServer,
  normalizeMcpServerFromConfig,
  normalizeTestResult,
  payloadContainsString,
} from './mcp-normalize'

describe('normalizeMcpServer', () => {
  it('returns null for missing name/id', () => {
    expect(normalizeMcpServer({})).toBeNull()
    expect(normalizeMcpServer(null)).toBeNull()
    expect(normalizeMcpServer('not-an-object')).toBeNull()
  })

  it('coerces transport, auth, status with safe defaults', () => {
    const s = normalizeMcpServer({ name: 'github' })!
    expect(s.transportType).toBe('http')
    expect(s.authType).toBe('none')
    expect(s.status).toBe('unknown')
    expect(s.toolMode).toBe('all')
    expect(s.enabled).toBe(true)
    expect(s.source).toBe('configured')
  })

  it('preserves legitimate stdio + http shapes', () => {
    const stdio = normalizeMcpServer({
      name: 'fs',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
    })!
    expect(stdio.transportType).toBe('stdio')
    expect(stdio.command).toBe('npx')
    expect(stdio.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem'])

    const http = normalizeMcpServer({
      name: 'linear',
      transportType: 'http',
      url: 'https://mcp.linear.app/sse',
      authType: 'oauth',
    })!
    expect(http.url).toBe('https://mcp.linear.app/sse')
    expect(http.authType).toBe('oauth')
  })

  it('drops malformed entries from a list with a warn log', () => {
    const list = normalizeMcpList({
      servers: [
        { name: 'good' },
        { id: '' },
        { totally: 'invalid' },
        { name: 'good2' },
      ],
    })
    expect(list.map((s) => s.name).sort()).toEqual(['good', 'good2'])
  })

  it('accepts top-level array, items, mcpServers shapes', () => {
    expect(normalizeMcpList([{ name: 'a' }]).length).toBe(1)
    expect(normalizeMcpList({ items: [{ name: 'b' }] }).length).toBe(1)
    expect(normalizeMcpList({ mcpServers: [{ name: 'c' }] }).length).toBe(1)
  })

  it('reports presence flags for secrets without echoing values', () => {
    const s = normalizeMcpServer({
      name: 'x',
      bearerToken: 'sk-secret-sentinel',
      oauth: { clientId: 'id', clientSecret: 'shh' },
    })!
    expect(s.hasBearerToken).toBe(true)
    expect(s.hasOAuthClientSecret).toBe(true)
    // Make sure the secret didn't leak into the output object anywhere.
    expect(payloadContainsString(s, 'sk-secret-sentinel')).toBe(false)
    expect(payloadContainsString(s, 'shh')).toBe(false)
  })
})

describe('maskSecretsInPlace (secret echo guard)', () => {
  it('replaces all env values with the mask sentinel', () => {
    const s = normalizeMcpServer({
      name: 'gh',
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_DO_NOT_LEAK', NON_SECRET: 'ok' },
    })!
    // Normalizer already masks env at read time.
    expect(Object.values(s.env)).toEqual([MASK_SENTINEL, MASK_SENTINEL])
    maskSecretsInPlace(s)
    expect(payloadContainsString(s, 'ghp_DO_NOT_LEAK')).toBe(false)
    expect(payloadContainsString(s, 'ok')).toBe(false)
  })

  it('masks header values that look like secrets by key hint', () => {
    const s = normalizeMcpServer({
      name: 'h',
      headers: { Authorization: 'Bearer X', 'X-Trace-Id': 'abc' },
    })!
    maskSecretsInPlace(s)
    expect(payloadContainsString(s, 'Bearer X')).toBe(false)
    expect(payloadContainsString(s, 'abc')).toBe(false)
  })

  it('is idempotent', () => {
    const s = normalizeMcpServer({ name: 'x', env: { K: 'v' } })!
    const first = JSON.stringify(maskSecretsInPlace(s))
    const second = JSON.stringify(maskSecretsInPlace(s))
    expect(first).toBe(second)
  })
})

describe('normalizeTestResult', () => {
  it('infers ok from status when ok flag missing', () => {
    expect(normalizeTestResult({ status: 'connected' }).ok).toBe(true)
    expect(normalizeTestResult({ status: 'failed' }).ok).toBe(false)
  })

  it('returns latencyMs only when finite', () => {
    expect(normalizeTestResult({ status: 'connected', latencyMs: 42 }).latencyMs).toBe(42)
    expect(normalizeTestResult({ status: 'connected', latencyMs: 'fast' }).latencyMs).toBeUndefined()
  })

  it('normalizes discovered tools (drops empty names)', () => {
    const r = normalizeTestResult({
      status: 'connected',
      discoveredTools: [{ name: 'list_repos' }, { name: '' }, 'invalid'],
    })
    expect(r.discoveredTools.map((t) => t.name)).toEqual(['list_repos'])
  })
})

describe('payloadContainsString', () => {
  it('finds nested matches', () => {
    expect(payloadContainsString({ a: { b: ['x', 'sentinel'] } }, 'sentinel')).toBe(true)
    expect(payloadContainsString({ a: { b: ['x'] } }, 'sentinel')).toBe(false)
  })
})

describe('maskSecretsInPlace (US-503 — env-ref preservation)', () => {
  it('preserves ${VAR_NAME} env-ref form in env without masking', () => {
    const s = normalizeMcpServer({
      name: 'dart',
      env: { DART_TOKEN: '${DART_TOKEN}' },
    })!
    // After normalization env values are masked — but maskSecretsInPlace
    // should preserve the env-ref form when re-applied.
    // First, manually set the env value to the ref form to simulate
    // a server that stores env-refs literally.
    ;(s.env as Record<string, string>)['DART_TOKEN'] = '${DART_TOKEN}'
    maskSecretsInPlace(s)
    expect(s.env['DART_TOKEN']).toBe('${DART_TOKEN}')
  })

  it('preserves ${X} env-ref in oauth clientSecret via headers', () => {
    const s = normalizeMcpServer({
      name: 'srv',
      headers: { Authorization: '${MY_SECRET}' },
    })!
    // Set the header to env-ref form before masking
    ;(s.headers as Record<string, string>)['Authorization'] = '${MY_SECRET}'
    maskSecretsInPlace(s)
    expect(s.headers['Authorization']).toBe('${MY_SECRET}')
  })

  it('still masks non-env-ref values', () => {
    const s = normalizeMcpServer({
      name: 'gh',
      env: { GITHUB_TOKEN: 'ghp_real_token' },
    })!
    maskSecretsInPlace(s)
    expect(s.env['GITHUB_TOKEN']).toBe(MASK_SENTINEL)
  })
})

describe('normalizeMcpServer (US-503 — authEnvRef population)', () => {
  it('populates authEnvRef when bearer token is env-ref', () => {
    const s = normalizeMcpServer({
      name: 'dart',
      auth: { type: 'bearer', token: '${DART_TOKEN}' },
    })!
    expect(s.authEnvRef).toBe('${DART_TOKEN}')
  })

  it('populates authEnvRef when oauth.clientSecret is env-ref', () => {
    const s = normalizeMcpServer({
      name: 'srv',
      auth: { type: 'oauth', oauth: { clientSecret: '${X}' } },
    })!
    expect(s.authEnvRef).toBe('${X}')
  })

  it('populates authEnvRef when Authorization header is env-ref', () => {
    const s = normalizeMcpServer({
      name: 'srv',
      headers: { Authorization: '${MY_SECRET}' },
    })!
    expect(s.authEnvRef).toBe('${MY_SECRET}')
  })

  it('does not populate authEnvRef for non-env-ref values', () => {
    const s = normalizeMcpServer({
      name: 'srv',
      auth: { type: 'bearer', token: 'sk-real-token' },
    })!
    expect(s.authEnvRef).toBeUndefined()
  })
})

describe('normalizeMcpServerFromConfig (Phase 1.5 fallback)', () => {
  it('returns null for empty name', () => {
    expect(normalizeMcpServerFromConfig('', {})).toBeNull()
    expect(normalizeMcpServerFromConfig('   ', { transport: 'stdio' })).toBeNull()
  })

  it('normalizes a stdio entry', () => {
    const s = normalizeMcpServerFromConfig('fs', {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
    })!
    expect(s.id).toBe('fs')
    expect(s.name).toBe('fs')
    expect(s.transportType).toBe('stdio')
    expect(s.command).toBe('npx')
    expect(s.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem'])
    expect(s.status).toBe('unknown')
    expect(s.enabled).toBe(true)
    expect(s.discoveredToolsCount).toBe(0)
    expect(s.discoveredTools).toEqual([])
  })

  it('infers http transport from url when transport key missing', () => {
    const s = normalizeMcpServerFromConfig('linear', {
      url: 'https://mcp.linear.app/sse',
    })!
    expect(s.transportType).toBe('http')
    expect(s.url).toBe('https://mcp.linear.app/sse')
  })

  it('infers stdio transport when no url and no transport key', () => {
    const s = normalizeMcpServerFromConfig('local', { command: 'foo' })!
    expect(s.transportType).toBe('stdio')
  })

  it('masks env values regardless of key', () => {
    const s = normalizeMcpServerFromConfig('gh', {
      transport: 'stdio',
      command: 'gh-mcp',
      env: { GITHUB_TOKEN: 'ghp_DO_NOT_LEAK', NON_SECRET: 'visible-config' },
    })!
    expect(payloadContainsString(s, 'ghp_DO_NOT_LEAK')).toBe(false)
    expect(payloadContainsString(s, 'visible-config')).toBe(false)
    // Both env values should be present as masked sentinels.
    expect(Object.values(s.env).every((v) => v === MASK_SENTINEL)).toBe(true)
  })

  it('detects bearer + oauth presence flags from nested auth object', () => {
    const s = normalizeMcpServerFromConfig('x', {
      url: 'https://example.com',
      auth: {
        type: 'bearer',
        token: 'sk-PRESENCE-ONLY',
        oauth: { clientId: 'id', clientSecret: 'shh' },
      },
    })!
    expect(s.authType).toBe('bearer')
    expect(s.hasBearerToken).toBe(true)
    expect(s.hasOAuthClientSecret).toBe(true)
    expect(payloadContainsString(s, 'sk-PRESENCE-ONLY')).toBe(false)
    expect(payloadContainsString(s, 'shh')).toBe(false)
  })

  it('treats string `auth` as the auth type', () => {
    const s = normalizeMcpServerFromConfig('y', {
      url: 'https://example.com',
      auth: 'oauth',
    })!
    expect(s.authType).toBe('oauth')
  })

  it('falls back to safe defaults when fields are missing', () => {
    const s = normalizeMcpServerFromConfig('bare', {})!
    expect(s.transportType).toBe('stdio')
    expect(s.authType).toBe('none')
    expect(s.toolMode).toBe('all')
    expect(s.includeTools).toEqual([])
    expect(s.excludeTools).toEqual([])
    expect(s.args).toEqual([])
    expect(s.env).toEqual({})
    expect(s.headers).toEqual({})
    expect(s.url).toBeUndefined()
    expect(s.command).toBeUndefined()
  })
})

describe('normalizeMcpListFromConfig (Phase 1.5 fallback)', () => {
  it('returns [] when mcp_servers is missing or wrong shape', () => {
    expect(normalizeMcpListFromConfig({})).toEqual([])
    expect(normalizeMcpListFromConfig({ mcp_servers: [] })).toEqual([])
    expect(normalizeMcpListFromConfig({ mcp_servers: 'oops' })).toEqual([])
    expect(normalizeMcpListFromConfig(null)).toEqual([])
  })

  it('walks the map and returns one McpServer per entry', () => {
    const list = normalizeMcpListFromConfig({
      mcp_servers: {
        fs: { transport: 'stdio', command: 'npx', args: ['fs-mcp'] },
        linear: { url: 'https://mcp.linear.app/sse', auth: 'oauth' },
      },
    })
    expect(list.map((s) => s.name).sort()).toEqual(['fs', 'linear'])
    const linear = list.find((s) => s.name === 'linear')!
    expect(linear.transportType).toBe('http')
    expect(linear.authType).toBe('oauth')
  })

  it('unwraps `{ config: {...} }` envelope', () => {
    const list = normalizeMcpListFromConfig({
      config: { mcp_servers: { gh: { transport: 'stdio', command: 'gh-mcp' } } },
    })
    expect(list.length).toBe(1)
    expect(list[0].name).toBe('gh')
  })
})
