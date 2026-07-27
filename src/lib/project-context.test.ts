import { describe, expect, it } from 'vitest'
import {
  buildProjectContextDirective,
  buildProjectScopedTextMessage,
  stripProjectContextDirective,
} from './project-context'

describe('project-context', () => {
  it('builds a hidden project directive with escaped attributes', () => {
    expect(
      buildProjectContextDirective({
        id: 'seo-aeo',
        name: 'SEO & AEO "Launch"',
        goal: 'Win <first> client',
        instructions: 'Keep it concise & revenue-first',
      }),
    ).toBe(
      '<project_context active="true" id="seo-aeo" name="SEO &amp; AEO &quot;Launch&quot;" goal="Win &lt;first&gt; client" instructions="Keep it concise &amp; revenue-first" />',
    )
  })

  it('prepends project context once', () => {
    const scoped = buildProjectScopedTextMessage('Draft the next step', {
      id: 'workspace-build',
      name: 'Workspace Build',
      goal: 'Shape Hermes Workspace',
    })

    expect(scoped).toContain('<project_context active="true"')
    expect(buildProjectScopedTextMessage(scoped, { id: 'x', name: 'X' })).toBe(
      scoped,
    )
  })

  it('strips the hidden project directive for visible chat rendering', () => {
    expect(
      stripProjectContextDirective(
        '<project_context active="true" id="seo" name="SEO" goal="Launch" />\n\nWhat next?',
      ),
    ).toBe('What next?')
  })
})
