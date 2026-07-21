import { describe, expect, it } from 'vitest'

import { normalizeSessionMessageList } from './session-message-normalize'

type Row = { id: number }

const row: Row = { id: 1 }

describe('normalizeSessionMessageList', () => {
  it.each([
    ['bare array', [row]],
    ['messages envelope', { messages: [row] }],
    ['items envelope', { items: [row] }],
    ['data envelope', { data: [row] }],
  ])('normalizes %s', (_label, input) => {
    expect(normalizeSessionMessageList<Row>(input)).toEqual([row])
  })

  it.each([undefined, null, {}, { messages: null }, { items: 'invalid' }])(
    'returns an empty array for malformed input %#',
    (input) => {
      expect(normalizeSessionMessageList<Row>(input)).toEqual([])
    },
  )
})
