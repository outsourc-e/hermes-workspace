import { describe, expect, it } from 'vitest'
import {
  canonicalizeWorkspacePacketContent,
  sha256Hex,
  workspacePacketContentHash,
} from './canonical-json'

describe('canonical workspace Packet JSON', () => {
  it('matches standard SHA-256 vectors in the browser-safe implementation', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('sorts object keys recursively while preserving array order', () => {
    expect(canonicalizeWorkspacePacketContent({
      z: 3,
      nested: { beta: true, alpha: null },
      list: [{ y: 2, x: 1 }, 'second'],
      a: 'first',
    })).toBe('{"a":"first","list":[{"x":1,"y":2},"second"],"nested":{"alpha":null,"beta":true},"z":3}')
  })

  it('produces the same SHA-256 for semantic content with different key order', () => {
    const first = { b: 2, nested: { y: 'yes', x: 'ex' }, a: 1 }
    const second = { a: 1, nested: { x: 'ex', y: 'yes' }, b: 2 }

    expect(workspacePacketContentHash(first)).toBe(workspacePacketContentHash(second))
    expect(workspacePacketContentHash(first)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('excludes only top-level derived fields from the content hash', () => {
    const base = {
      packetId: 'packet-1',
      payload: { status: 'payload-status-is-content' },
    }
    const hash = workspacePacketContentHash(base)

    expect(workspacePacketContentHash({
      ...base,
      contentHash: 'f'.repeat(64),
      status: 'accepted',
      readback: { outcome: 'confirmed' },
      lifecycleEvents: [{ type: 'offered' }],
      acks: [{ outcome: 'accepted' }],
    })).toBe(hash)
    expect(workspacePacketContentHash({
      ...base,
      payload: { status: 'changed-payload-content' },
    })).not.toBe(hash)
  })

  it.each([
    ['undefined', { value: undefined }],
    ['non-finite number', { value: Number.POSITIVE_INFINITY }],
    ['bigint', { value: 1n }],
    ['date object', { value: new Date('2026-07-18T00:00:00.000Z') }],
  ])('rejects unsupported %s values instead of guessing', (_name, value) => {
    expect(() => canonicalizeWorkspacePacketContent(value)).toThrow()
  })
})
