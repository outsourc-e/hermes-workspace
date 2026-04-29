import { describe, expect, it } from 'vitest'

import { MARKDOWN_REHYPE_PLUGINS, MARKDOWN_REMARK_PLUGINS } from './markdown'

describe('Markdown math support', () => {
  it('wires remark-math into the markdown parser pipeline', () => {
    expect(
      MARKDOWN_REMARK_PLUGINS.some((plugin) => plugin.name === 'remarkMath'),
    ).toBe(true)
  })

  it('wires rehype-katex into the HTML renderer pipeline', () => {
    expect(
      MARKDOWN_REHYPE_PLUGINS.some((plugin) => plugin.name === 'rehypeKatex'),
    ).toBe(true)
  })
})
