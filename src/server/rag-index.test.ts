import { describe, expect, it } from 'vitest'
import { chunkMarkdown, ragIndexStats } from './rag-index'

describe('chunkMarkdown', () => {
  it('splits on h2 headings and drops tiny fragments', () => {
    const doc = [
      '# Title',
      '',
      'Intro paragraph long enough to survive the minimum chunk filter easily.',
      '',
      '## Section A',
      'Body of section A with enough characters to count as real content here.',
      '',
      '## Section B',
      'Body of section B with enough characters to count as real content here.',
    ].join('\n')
    const chunks = chunkMarkdown(doc)
    expect(chunks.length).toBe(3)
    expect(chunks[1].startsWith('## Section A')).toBe(true)
  })

  it('caps oversized sections', () => {
    const doc = `## Big\n${'x'.repeat(5000)}`
    const chunks = chunkMarkdown(doc)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1400)
  })
})

describe('ragIndexStats', () => {
  it('returns stats without throwing', () => {
    const stats = ragIndexStats()
    expect(typeof stats.chunks).toBe('number')
    expect(typeof stats.model).toBe('string')
  })
})
