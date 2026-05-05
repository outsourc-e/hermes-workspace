import { describe, expect, it } from 'vitest'

import { buildWorkspaceScopedTextMessage } from './workspace-message-scope'

describe('buildWorkspaceScopedTextMessage', () => {
  it('prepends an explicit active workspace directive to plain text chat messages', () => {
    expect(
      buildWorkspaceScopedTextMessage('Run the tests', {
        path: '/Users/eric/projects/hermes-workspace',
        folderName: 'hermes-workspace',
        isValid: true,
      }),
    ).toBe(
      '<workspace_context active="true" name="hermes-workspace" path="/Users/eric/projects/hermes-workspace" />\n\nRun the tests',
    )
  })

  it('does not duplicate the directive if the message is retried', () => {
    const scoped = buildWorkspaceScopedTextMessage('Run the tests', {
      path: '/Users/eric/work',
      folderName: 'work',
      isValid: true,
    })
    expect(
      buildWorkspaceScopedTextMessage(scoped, {
        path: '/Users/eric/other',
        folderName: 'other',
        isValid: true,
      }),
    ).toBe(scoped)
  })

  it('leaves messages unchanged when no valid workspace exists', () => {
    expect(
      buildWorkspaceScopedTextMessage('hello', {
        path: '',
        folderName: '',
        isValid: false,
      }),
    ).toBe('hello')
  })
})
