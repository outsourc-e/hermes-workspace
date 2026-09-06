import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseBriefContent, readLatestBrief } from '../brief'

describe('readLatestBrief', () => {
  it('returns most recent file content', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brief-'))
    writeFileSync(join(dir, '2026-05-24_07-00-00.md'), 'old')
    writeFileSync(join(dir, '2026-05-25_07-00-00.md'), 'new')
    const b = await readLatestBrief(dir)
    expect(b.text).toBe('new')
  })

  it('throws if directory empty', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brief-empty-'))
    await expect(readLatestBrief(dir)).rejects.toThrow(/no brief/)
  })
})

describe('parseBriefContent', () => {
  it('extracts content after ## Response header', () => {
    const md =
      '## Prompt\n\nthe prompt is long\n\n## Response\n\nThe actual brief text here.'
    expect(parseBriefContent(md)).toBe('The actual brief text here.')
  })

  it('returns full content if no ## Response marker', () => {
    expect(parseBriefContent('Just plain text')).toBe('Just plain text')
  })
})
