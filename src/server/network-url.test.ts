import { describe, expect, it } from 'vitest'
import {
  firstLanIpv4,
  isTailscaleIpv4,
  parsePort,
  resolveNetworkUrl,
} from './network-url'

describe('parsePort', () => {
  it('accepts a valid port', () => {
    expect(parsePort('3002')).toBe(3002)
  })

  it('falls back for missing or invalid values', () => {
    expect(parsePort(null)).toBe(3000)
    expect(parsePort('abc')).toBe(3000)
    expect(parsePort('0')).toBe(3000)
    expect(parsePort('70000')).toBe(3000)
  })
})

describe('isTailscaleIpv4', () => {
  it('accepts CGNAT 100.x addresses', () => {
    expect(isTailscaleIpv4('100.68.35.48')).toBe(true)
  })

  it('rejects LAN and localhost', () => {
    expect(isTailscaleIpv4('192.168.4.24')).toBe(false)
    expect(isTailscaleIpv4('127.0.0.1')).toBe(false)
    expect(isTailscaleIpv4('')).toBe(false)
  })
})

describe('resolveNetworkUrl', () => {
  it('prefers Tailscale MagicDNS when the node is online', () => {
    expect(
      resolveNetworkUrl({
        port: 3002,
        tailscaleIpv4: '100.68.35.48',
        tailscaleHostname: 'marios-mac-mini.tailb948ab.ts.net.',
        lanIpv4: '192.168.4.24',
      }),
    ).toEqual({
      url: 'http://marios-mac-mini.tailb948ab.ts.net:3002',
      source: 'tailscale',
      hostname: 'marios-mac-mini.tailb948ab.ts.net',
    })
  })

  it('uses the Tailscale IP when MagicDNS is missing', () => {
    expect(
      resolveNetworkUrl({
        port: 3002,
        tailscaleIpv4: '100.68.35.48',
        lanIpv4: '192.168.4.24',
      }),
    ).toEqual({
      url: 'http://100.68.35.48:3002',
      source: 'tailscale',
      hostname: null,
    })
  })

  it('falls back to LAN, then localhost', () => {
    expect(
      resolveNetworkUrl({
        port: 3000,
        lanIpv4: '192.168.4.24',
      }),
    ).toMatchObject({ url: 'http://192.168.4.24:3000', source: 'lan' })

    expect(resolveNetworkUrl({ port: 3000 })).toEqual({
      url: 'http://127.0.0.1:3000',
      source: 'localhost',
      hostname: null,
    })
  })
})

describe('firstLanIpv4', () => {
  it('skips loopback and Tailscale CGNAT', () => {
    expect(
      firstLanIpv4({
        lo0: [
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '',
            internal: true,
            cidr: '127.0.0.1/8',
          },
        ],
        utun: [
          {
            address: '100.68.35.48',
            netmask: '255.255.255.255',
            family: 'IPv4',
            mac: '',
            internal: false,
            cidr: '100.68.35.48/32',
          },
        ],
        en0: [
          {
            address: '192.168.4.24',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: 'aa:bb:cc:dd:ee:ff',
            internal: false,
            cidr: '192.168.4.24/24',
          },
        ],
      }),
    ).toBe('192.168.4.24')
  })
})
