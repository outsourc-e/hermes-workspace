import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createNovaWantCard,
  getNovaWantsBoard,
  getNovaWantsSnapshot,
  moveNovaWantCard,
  parkNovaWantCard,
} from './nova-wants-store'

let tempDir = ''
let originalFile: string | undefined

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-wants-'))
  originalFile = process.env.NOVA_WANTS_FILE
  process.env.NOVA_WANTS_FILE = path.join(tempDir, 'board.json')
})

afterEach(() => {
  if (originalFile === undefined) {
    delete process.env.NOVA_WANTS_FILE
  } else {
    process.env.NOVA_WANTS_FILE = originalFile
  }
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('nova wants store', () => {
  it('seeds the board from the Nova/Mycelia continuity receipt', () => {
    const board = getNovaWantsBoard()

    expect(board.boardId).toBe('nova-wants')
    expect(board.cards.length).toBeGreaterThanOrEqual(15)
    expect(board.cards.map((card) => card.id)).toContain('continuity-spine')
    expect(board.cards.map((card) => card.id)).toContain('protected-self-state')
    expect(board.cards.map((card) => card.id)).toContain(
      'paperclip-ui-patterns',
    )
    expect(board.cards[0].provenance).toContain('20260707_122218_b31ec036')
  })

  it('gates risky self-state cards into Taylor review by default', () => {
    const card = createNovaWantCard({
      title: 'Change Nova identity',
      description: 'Update self-state and role title.',
      category: 'identity',
      approvalLevel: 'explicit-approval',
      status: 'approved',
      whyThisMatters: 'Identity changes need a receipt.',
    })

    expect(card.status).toBe('needs-taylor-review')
  })

  it('keeps risky cards in Taylor review instead of trusting client approval', () => {
    const risky = getNovaWantsBoard().cards.find(
      (card) => card.id === 'protected-self-state',
    )
    expect(risky).toBeTruthy()

    const blocked = moveNovaWantCard(risky!.id, 'approved')
    expect(blocked?.status).toBe('needs-taylor-review')

    const stillBlocked = moveNovaWantCard(risky!.id, 'approved', 10)
    expect(stillBlocked?.status).toBe('needs-taylor-review')

    const doneBlocked = moveNovaWantCard(risky!.id, 'done', 20)
    expect(doneBlocked?.status).toBe('needs-taylor-review')
  })

  it('creates a backup before writes and preserves corrupt board files', () => {
    createNovaWantCard({
      title: 'Persistence check',
      description: 'A card that forces a second write.',
      category: 'continuity',
      approvalLevel: 'safe',
      whyThisMatters: 'The board should keep a backup before replacement.',
    })
    expect(fs.existsSync(path.join(tempDir, 'nova-wants-board.backup.json'))).toBe(true)

    fs.writeFileSync(path.join(tempDir, 'board.json'), '{not valid json', 'utf-8')
    const snapshot = getNovaWantsSnapshot()
    expect(snapshot.ok).toBe(false)
    expect(snapshot.degraded).toBe(true)
    expect(snapshot.warning).toContain('Nova Wants degraded')
    expect(fs.readFileSync(path.join(tempDir, 'board.json'), 'utf-8')).toBe('{not valid json')
  })

  it('parks cards instead of hard deleting them', () => {
    const card = createNovaWantCard({
      title: 'Temporary want',
      description: 'A reversible parking test.',
      category: 'continuity',
      approvalLevel: 'safe',
      whyThisMatters: 'CRUD should avoid destructive deletion.',
    })

    const parked = parkNovaWantCard(card.id)
    expect(parked?.status).toBe('parked-rejected')
    expect(getNovaWantsBoard().cards.some((item) => item.id === card.id)).toBe(
      true,
    )
  })

  it('stores fabric references on cards', () => {
    const seeded = getNovaWantsBoard().cards.find(
      (card) => card.id === 'protected-self-state',
    )

    expect(seeded?.fabricEventIds).toContain('event-protected-self-state')
    expect(seeded?.fabricSelfStateIds).toContain('self-protected-state-v1')
    expect(seeded?.fabricReviewIds).toContain('review-protected-self-state')

    const custom = createNovaWantCard({
      title: 'Link a fabric receipt',
      description: 'A test card with fabric links.',
      fabricEventIds: ['event-test'],
      fabricSelfStateIds: ['self-test'],
      fabricSourceMapIds: ['source-test'],
      fabricReviewIds: ['review-test'],
    })

    expect(custom.fabricEventIds).toEqual(['event-test'])
    expect(custom.fabricSelfStateIds).toEqual(['self-test'])
    expect(custom.fabricSourceMapIds).toEqual(['source-test'])
    expect(custom.fabricReviewIds).toEqual(['review-test'])
  })
})
