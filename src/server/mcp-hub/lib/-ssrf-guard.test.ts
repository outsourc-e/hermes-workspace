/**
 * Tests for ssrf-guard helpers.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { isPrivateAddress, assertNotPrivate } from './ssrf-guard'

// ---------------------------------------------------------------------------
// isPrivateAddress
// ---------------------------------------------------------------------------

describe('isPrivateAddress', () => {
  describe('IPv4 private ranges', () => {
    it('returns true for 10.x.x.x (RFC 1918)', () => {
      expect(isPrivateAddress('10.0.0.1')).toBe(true)
      expect(isPrivateAddress('10.255.255.255')).toBe(true)
    })

    it('returns true for 172.16-31.x.x (RFC 1918)', () => {
      expect(isPrivateAddress('172.16.0.1')).toBe(true)
      expect(isPrivateAddress('172.31.255.255')).toBe(true)
    })

    it('returns false for 172.15.x.x (not in /12)', () => {
      expect(isPrivateAddress('172.15.0.1')).toBe(false)
    })

    it('returns false for 172.32.x.x (not in /12)', () => {
      expect(isPrivateAddress('172.32.0.1')).toBe(false)
    })

    it('returns true for 192.168.x.x (RFC 1918)', () => {
      expect(isPrivateAddress('192.168.0.1')).toBe(true)
      expect(isPrivateAddress('192.168.100.200')).toBe(true)
    })

    it('returns true for 127.x.x.x (loopback)', () => {
      expect(isPrivateAddress('127.0.0.1')).toBe(true)
      expect(isPrivateAddress('127.1.2.3')).toBe(true)
    })

    it('returns true for 169.254.x.x (link-local)', () => {
      expect(isPrivateAddress('169.254.0.1')).toBe(true)
      expect(isPrivateAddress('169.254.169.254')).toBe(true) // AWS metadata
    })

    it('returns true for 0.0.0.0', () => {
      expect(isPrivateAddress('0.0.0.0')).toBe(true)
    })

    it('returns false for public IPs', () => {
      expect(isPrivateAddress('8.8.8.8')).toBe(false)
      expect(isPrivateAddress('1.1.1.1')).toBe(false)
      expect(isPrivateAddress('93.184.216.34')).toBe(false)
    })
  })

  describe('IPv6 private ranges', () => {
    it('returns true for ::1 (loopback)', () => {
      expect(isPrivateAddress('::1')).toBe(true)
    })

    it('returns true for fe80::/10 (link-local)', () => {
      expect(isPrivateAddress('fe80::1')).toBe(true)
      expect(isPrivateAddress('fe80::dead:beef')).toBe(true)
    })

    it('returns true for fc00::/7 ULA (fc prefix)', () => {
      expect(isPrivateAddress('fc00::1')).toBe(true)
    })

    it('returns true for fc00::/7 ULA (fd prefix)', () => {
      expect(isPrivateAddress('fd00::1')).toBe(true)
      expect(isPrivateAddress('fd12:3456:789a::1')).toBe(true)
    })

    it('returns false for public IPv6', () => {
      expect(isPrivateAddress('2001:4860:4860::8888')).toBe(false) // Google DNS
      expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false) // Cloudflare DNS
    })
  })
})

// ---------------------------------------------------------------------------
// assertNotPrivate — mock dns/promises
// ---------------------------------------------------------------------------

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}))

import { lookup } from 'node:dns/promises'
const mockLookup = vi.mocked(lookup)

function makeLookupResult(addresses: string[]): { address: string; family: number }[] {
  return addresses.map((a) => ({ address: a, family: a.includes(':') ? 6 : 4 }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('assertNotPrivate', () => {
  it('rejects non-HTTPS schemes', async () => {
    await expect(assertNotPrivate('http://example.com/feed')).rejects.toThrow(/only HTTPS/)
  })

  it('rejects invalid URLs', async () => {
    await expect(assertNotPrivate('not-a-url')).rejects.toThrow(/invalid URL/)
  })

  it('allows a public IP literal', async () => {
    await expect(assertNotPrivate('https://8.8.8.8/feed')).resolves.toBeUndefined()
  })

  it('rejects a private IP literal directly', async () => {
    await expect(assertNotPrivate('https://192.168.1.1/feed')).rejects.toThrow(/private\/reserved/)
  })

  it('rejects loopback IP literal', async () => {
    await expect(assertNotPrivate('https://127.0.0.1/feed')).rejects.toThrow(/private\/reserved/)
  })

  it('allows a hostname that resolves to public IPs', async () => {
    mockLookup.mockResolvedValue(makeLookupResult(['93.184.216.34']) as never)
    await expect(assertNotPrivate('https://example.com/feed')).resolves.toBeUndefined()
  })

  it('rejects a hostname resolving to private IPv4', async () => {
    mockLookup.mockResolvedValue(makeLookupResult(['10.0.0.1']) as never)
    await expect(assertNotPrivate('https://internal.corp/feed')).rejects.toThrow(/private address/)
  })

  it('rejects a hostname resolving to loopback', async () => {
    mockLookup.mockResolvedValue(makeLookupResult(['127.0.0.1']) as never)
    await expect(assertNotPrivate('https://localhost-alias.example.com/feed')).rejects.toThrow(/private address/)
  })

  it('rejects a hostname resolving to link-local', async () => {
    mockLookup.mockResolvedValue(makeLookupResult(['169.254.169.254']) as never)
    await expect(assertNotPrivate('https://metadata.example.com/feed')).rejects.toThrow(/private address/)
  })

  it('rejects a hostname resolving to IPv6 ULA', async () => {
    mockLookup.mockResolvedValue(makeLookupResult(['fd00::1']) as never)
    await expect(assertNotPrivate('https://ipv6-ula.example.com/feed')).rejects.toThrow(/private address/)
  })

  it('rejects when ANY record is private (mixed public+private)', async () => {
    // First call (IPv4) returns public, second (IPv6) returns ULA
    mockLookup
      .mockResolvedValueOnce(makeLookupResult(['93.184.216.34']) as never)
      .mockResolvedValueOnce(makeLookupResult(['fd00::1']) as never)
    await expect(assertNotPrivate('https://mixed.example.com/feed')).rejects.toThrow(/private address/)
  })

  it('rejects when hostname cannot be resolved', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'))
    await expect(assertNotPrivate('https://nxdomain.example.com/feed')).rejects.toThrow(/could not resolve/)
  })
})
