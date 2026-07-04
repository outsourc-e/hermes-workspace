import { describe, expect, it } from 'vitest'
import { detectRtlText, textDirectionFor } from './bidi-text'

describe('Living V3 bidi text helpers', () => {
  it('detects Hebrew and Arabic text as RTL', () => {
    expect(detectRtlText('צריך אישור לפני פרסום')).toBe(true)
    expect(textDirectionFor('צריך אישור לפני פרסום')).toBe('rtl')
    expect(textDirectionFor('مرحبا من غرفة التحكم')).toBe('rtl')
  })

  it('keeps English labels, paths, ids, and commands LTR', () => {
    expect(textDirectionFor('Approval packet waiting')).toBe('ltr')
    expect(textDirectionFor('/Users/mac/hermes-workspace/src/lib/file.ts')).toBe('ltr')
    expect(textDirectionFor('packetId etsy-draft-gold-abc123')).toBe('ltr')
    expect(textDirectionFor('pnpm vitest run src/lib/war-room/living-v3')).toBe('ltr')
  })

  it('keeps mixed technical packet readbacks readable when technical ids lead the text', () => {
    expect(textDirectionFor('packetId etsy-approval-abc123 מחכה לאישור')).toBe('ltr')
    expect(textDirectionFor('מחכה לאישור packetId etsy-approval-abc123')).toBe('rtl')
  })
})
