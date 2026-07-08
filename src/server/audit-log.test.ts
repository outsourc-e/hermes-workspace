import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appendAudit, listAudit, verifyAuditChain } from './audit-log'

let dir: string
const prev = {
  log: process.env.HERMES_AUDIT_LOG_PATH,
  key: process.env.HERMES_AUDIT_KEY_PATH,
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'audit-'))
  process.env.HERMES_AUDIT_LOG_PATH = join(dir, 'audit.jsonl')
  process.env.HERMES_AUDIT_KEY_PATH = join(dir, 'audit.key')
})

afterAll(() => {
  if (prev.log === undefined) delete process.env.HERMES_AUDIT_LOG_PATH
  else process.env.HERMES_AUDIT_LOG_PATH = prev.log
  if (prev.key === undefined) delete process.env.HERMES_AUDIT_KEY_PATH
  else process.env.HERMES_AUDIT_KEY_PATH = prev.key
  rmSync(dir, { recursive: true, force: true })
})

describe('audit log', () => {
  it('appends a verifiable hash chain', () => {
    appendAudit({ actor: 'test', action: 'dispatch', detail: 'builder: x' })
    appendAudit({ actor: 'test', action: 'queue:cancel', detail: 'q-123' })
    appendAudit({ actor: 'test', action: 'goal:create', detail: 'goal text' })
    expect(listAudit()).toHaveLength(3)
    expect(listAudit()[0].action).toBe('goal:create')
    expect(verifyAuditChain()).toEqual({ ok: true, entries: 3, brokenAt: null })
  })

  it('detects tampering', () => {
    const path = process.env.HERMES_AUDIT_LOG_PATH!
    const lines = readFileSync(path, 'utf8').trim().split('\n')
    const doctored = JSON.parse(lines[1])
    doctored.detail = 'q-999 (edited)'
    lines[1] = JSON.stringify(doctored)
    writeFileSync(path, lines.join('\n') + '\n')
    const chain = verifyAuditChain()
    expect(chain.ok).toBe(false)
    expect(chain.brokenAt).toBe(1)
  })
})
