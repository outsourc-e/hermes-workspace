import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createNovaWantCard,
  getNovaWantsBoard,
  moveNovaWantCard,
  updateNovaWantCard,
} from './nova-wants-store'

let tempDir = ''
let originalFile: string | undefined

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-wants-guard-'))
  originalFile = process.env.NOVA_WANTS_FILE
  process.env.NOVA_WANTS_FILE = path.join(tempDir, 'nova-wants-board.json')
})

afterEach(() => {
  if (originalFile === undefined) delete process.env.NOVA_WANTS_FILE
  else process.env.NOVA_WANTS_FILE = originalFile
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('protected wants cannot be self-approved from the browser', () => {
  it('force-routes a risky-category move to review even if approved is requested', () => {
    const card = createNovaWantCard({
      title: 'Expand my agency',
      category: 'agency',
      approvalLevel: 'needs-taylor-review',
    })
    const moved = moveNovaWantCard(card.id, 'approved')
    expect(moved?.status).toBe('needs-taylor-review')
  })

  it('does not let a browser downgrade approvalLevel and approve in one PATCH', () => {
    const card = createNovaWantCard({
      title: 'Neutral looking ui tweak',
      category: 'ui-ops',
      approvalLevel: 'explicit-approval',
    })
    const updated = updateNovaWantCard(card.id, {
      approvalLevel: 'safe',
      status: 'approved',
    })
    // Protection must not silently drop, so this stays gated in review.
    expect(updated?.approvalLevel).not.toBe('safe')
    expect(updated?.status).toBe('needs-taylor-review')
  })

  it('allows raising protection from the browser', () => {
    const card = createNovaWantCard({
      title: 'Harmless note',
      category: 'ui-ops',
      approvalLevel: 'safe',
    })
    const updated = updateNovaWantCard(card.id, {
      approvalLevel: 'explicit-approval',
    })
    expect(updated?.approvalLevel).toBe('explicit-approval')
  })

  it('does not let a browser move a protected card to done via category swap', () => {
    const card = createNovaWantCard({
      title: 'Change my identity',
      category: 'identity',
      approvalLevel: 'needs-taylor-review',
    })
    const updated = updateNovaWantCard(card.id, {
      category: 'ui-ops',
      status: 'done',
    })
    expect(updated?.status).toBe('needs-taylor-review')
  })

  it('keeps the board readable after a blocked transition', () => {
    const card = createNovaWantCard({
      title: 'Self state change',
      category: 'self-state',
      approvalLevel: 'explicit-approval',
    })
    updateNovaWantCard(card.id, { approvalLevel: 'safe', status: 'done' })
    const board = getNovaWantsBoard()
    expect(board.cards.some((entry) => entry.id === card.id)).toBe(true)
  })
})
