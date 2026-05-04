import { describe, expect, it } from 'vitest'
import { parseMcpServerInput } from './mcp-input-validate'

describe('parseMcpServerInput', () => {
  // --- HIGH-2: unknown transport ---
  it('rejects unknown transport "sse" with unsupported transport error', () => {
    const result = parseMcpServerInput({
      name: 'test',
      transportType: 'sse',
      url: 'https://example.com',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'transportType')
      expect(err).toBeDefined()
      expect(err?.message).toBe('unsupported transport')
    }
  })

  it('rejects unknown transport "websocket" with unsupported transport error', () => {
    const result = parseMcpServerInput({
      name: 'test',
      transportType: 'websocket',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'transportType')
      expect(err?.message).toBe('unsupported transport')
    }
  })

  // --- HIGH-2: http-with-args ---
  it('rejects http transport with args field', () => {
    const result = parseMcpServerInput({
      name: 'test',
      transportType: 'http',
      url: 'https://example.com',
      args: ['-y', 'something'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'args')
      expect(err).toBeDefined()
      expect(err?.message).toMatch(/not allowed for http/)
    }
  })

  // --- HIGH-2: http-with-command ---
  it('rejects http transport with command field', () => {
    const result = parseMcpServerInput({
      name: 'test',
      transportType: 'http',
      url: 'https://example.com',
      command: 'npx',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'command')
      expect(err).toBeDefined()
      expect(err?.message).toMatch(/not allowed for http/)
    }
  })

  // --- HIGH-2: stdio-missing-args ---
  it('rejects stdio transport missing args', () => {
    const result = parseMcpServerInput({
      name: 'test',
      transportType: 'stdio',
      command: 'npx',
      // no args
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'args')
      expect(err).toBeDefined()
      expect(err?.message).toMatch(/required for stdio/)
    }
  })

  // --- HIGH-2: stdio-with-url ---
  it('rejects stdio transport with url field', () => {
    const result = parseMcpServerInput({
      name: 'test',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', 'pkg'],
      url: 'https://example.com',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'url')
      expect(err).toBeDefined()
      expect(err?.message).toMatch(/not allowed for stdio/)
    }
  })

  // --- valid cases ---
  it('accepts valid http transport', () => {
    const result = parseMcpServerInput({
      name: 'test',
      transportType: 'http',
      url: 'https://example.com/mcp',
    })
    expect(result.ok).toBe(true)
  })

  it('accepts valid stdio transport with args', () => {
    const result = parseMcpServerInput({
      name: 'test',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    })
    expect(result.ok).toBe(true)
  })
})
