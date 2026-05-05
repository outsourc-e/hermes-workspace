import { describe, expect, it } from 'vitest'

import { parseInlineArtifacts } from './message-item'

describe('parseInlineArtifacts', () => {
  it('strips artifact tags from visible text and returns artifact cards', () => {
    const result = parseInlineArtifacts(`Here's a prototype.\n\n<artifact type="html" title="Demo UI"><html><body><h1>Hello</h1></body></html></artifact>\n\nLet me know what to change.`)

    expect(result.cleanedText).toBe(`Here's a prototype.\n\nLet me know what to change.`)
    expect(result.artifacts).toEqual([
      {
        type: 'html',
        title: 'Demo UI',
        content: '<html><body><h1>Hello</h1></body></html>',
      },
    ])
  })

  it('parses multiple artifacts and defaults the title when omitted', () => {
    const result = parseInlineArtifacts(`<artifact type="svg"><svg></svg></artifact>\n\n<artifact type="markdown" title="Notes"># Heading</artifact>`)

    expect(result.cleanedText).toBe('')
    expect(result.artifacts).toEqual([
      {
        type: 'svg',
        title: 'Artifact',
        content: '<svg></svg>',
      },
      {
        type: 'markdown',
        title: 'Notes',
        content: '# Heading',
      },
    ])
  })
})
