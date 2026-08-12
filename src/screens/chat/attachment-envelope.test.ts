import { describe, expect, it } from 'vitest'

import {
  createTextAttachmentDataUrl,
  parsePortableAttachmentDataUrl,
} from './attachment-envelope'

describe('Chat attachment transport envelope', () => {
  it('encodes UTF-8 text as the base64 data URL required by send-stream', () => {
    const dataUrl = createTextAttachmentDataUrl('hello π', 'text/plain')

    expect(dataUrl).toBe('data:text/plain;base64,aGVsbG8gz4A=')
    expect(parsePortableAttachmentDataUrl(dataUrl, 'text/plain')).toEqual({
      contentType: 'text/plain',
      base64: 'aGVsbG8gz4A=',
    })
  })

  it.each([
    ['raw text', 'text/plain'],
    ['data:text/plain,hello', 'text/plain'],
    ['data:text/plain;base64,@@@', 'text/plain'],
    ['data:image/png;base64,aGVsbG8=', 'text/plain'],
  ])('rejects non-portable or MIME-mismatched data %j', (value, type) => {
    expect(parsePortableAttachmentDataUrl(value, type)).toBeNull()
  })
})
