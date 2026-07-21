import { describe, expect, it } from 'vitest'
import { APP_CSP, APP_CSP_DIRECTIVES, APP_CSP_META } from './csp'

describe('APP_CSP', () => {
  it('starts with default-src', () => {
    expect(APP_CSP_DIRECTIVES[0]).toBe("default-src 'self'")
  })

  it('serializes with semicolons only — no stray spaces or missing terminators', () => {
    // The single most common CSP regression is a malformed directive-boundary
    // that ends up looking like `' self' : default-src ...` after an edge
    // proxy concatenates a second policy. Locking this shape here makes it
    // impossible to ship a directive that starts with a leading `'`.
    //
    // (Note: `'unsafe-inline'` legitimately ends with a `'` because it's a
    // quoted source expression; we're matching the unbroken-by-rewrite
    // shape, not banning trailing quotes in general.)
    expect(APP_CSP).not.toMatch(/^\s*'/)
    expect(APP_CSP).not.toMatch(/' self'/)
    expect(APP_CSP).not.toMatch(/' self ;/)
    expect(APP_CSP).toMatch(/^default-src 'self'/)
  })

  it('lists every required directive in order', () => {
    const expectedOrder = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self'",
      "font-src 'self'",
      "connect-src 'self'",
      "worker-src 'self'",
      "media-src 'self'",
      "frame-src 'self'",
    ]
    let cursor = 0
    const joined = APP_CSP
    for (const needle of expectedOrder) {
      const idx = joined.indexOf(needle, cursor)
      expect(idx, `directive ${needle} should appear after cursor ${cursor}`).toBeGreaterThanOrEqual(cursor)
      cursor = idx + needle.length
    }
  })

  it('APP_CSP_META matches APP_CSP byte-for-byte so the SSR-emitted meta tag cannot disagree with the HTTP header', () => {
    expect(APP_CSP_META).toBe(APP_CSP)
  })

  it('does not include directives that are ignored when emitted as a `<meta>` tag', () => {
    // frame-ancestors and report-uri are intentionally omitted — they're
    // header-only. If someone adds them here by mistake the SSR meta will
    // silently ignore them and the HTTP header value gets out of sync.
    expect(APP_CSP).not.toMatch(/frame-ancestors/i)
    expect(APP_CSP).not.toMatch(/report-uri/i)
  })
})
