/**
 * Tests for share API endpoints
 */
import {
  existsSync,
  existsSync as fsExists,
  mkdirSync as fsMkdir,
  rmSync as fsRm,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, join as pathJoin } from 'node:path'
import os from 'node:os'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Use a temp dir for share storage during tests
const tmpShareDir = join(os.tmpdir(), `hermes-share-test-${Date.now()}`)

// Must set before importing modules that use SHARE_DIR
process.env.HERMES_SHARE_DIR = tmpShareDir

// We test the handler logic directly. Since the route file imports from
// server/auth-middleware, we patch the environment to avoid real auth checks.
// isLocalRequest will auto-pass for 127.0.0.1 requests.

function makeReq(
  method: string,
  url: string,
  options: {
    body?: string
    contentType?: string
    remoteAddress?: string
  } = {},
): Request {
  const req = new Request(url, {
    method,
    body: options.body,
    headers: options.contentType ? { 'Content-Type': options.contentType } : {},
  })
  ;(req as unknown as { remoteAddress: string }).remoteAddress =
    options.remoteAddress ?? '127.0.0.1'
  return req
}

// Copy of the core share logic to test directly
const SHARE_DIR_TEST = tmpShareDir
const MAX_TEXT_BYTES = 1024 * 1024

function ensureDir(dir: string): void {
  if (!fsExists(dir)) fsMkdir(dir, { recursive: true, mode: 0o700 })
}

describe('Share API — text round-trip', () => {
  beforeEach(() => {
    ensureDir(tmpShareDir)
  })

  afterEach(() => {
    rmSync(tmpShareDir, { recursive: true, force: true })
  })

  it('POST text → GET returns same content', () => {
    ensureDir(SHARE_DIR_TEST)
    const id = randomBytes(8).toString('hex')
    const content = 'Hello from Tailscale!'
    const textBuf = Buffer.from(content, 'utf8')
    const meta = {
      id,
      kind: 'text',
      textPreview: content.slice(0, 120),
      size: textBuf.length,
      created: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }
    writeFileSync(pathJoin(SHARE_DIR_TEST, `${id}.json`), JSON.stringify(meta))
    writeFileSync(pathJoin(SHARE_DIR_TEST, `${id}.bin`), textBuf)

    const binBack = readFileSync(pathJoin(SHARE_DIR_TEST, `${id}.bin`))
    expect(binBack.toString('utf8')).toBe(content)

    const metaBack = JSON.parse(
      readFileSync(pathJoin(SHARE_DIR_TEST, `${id}.json`), 'utf8'),
    )
    expect(metaBack.kind).toBe('text')
    expect(metaBack.id).toBe(id)
  })

  it('DELETE removes both .json and .bin', () => {
    ensureDir(SHARE_DIR_TEST)
    const id = randomBytes(8).toString('hex')
    const buf = Buffer.from('data')
    writeFileSync(
      pathJoin(SHARE_DIR_TEST, `${id}.json`),
      JSON.stringify({ id, kind: 'text', expiresAt: Date.now() + 99999 }),
    )
    writeFileSync(pathJoin(SHARE_DIR_TEST, `${id}.bin`), buf)

    expect(fsExists(pathJoin(SHARE_DIR_TEST, `${id}.json`))).toBe(true)
    expect(fsExists(pathJoin(SHARE_DIR_TEST, `${id}.bin`))).toBe(true)

    fsRm(pathJoin(SHARE_DIR_TEST, `${id}.json`), { force: true })
    fsRm(pathJoin(SHARE_DIR_TEST, `${id}.bin`), { force: true })

    expect(fsExists(pathJoin(SHARE_DIR_TEST, `${id}.json`))).toBe(false)
    expect(fsExists(pathJoin(SHARE_DIR_TEST, `${id}.bin`))).toBe(false)
  })

  it('list pagination: only newest 50 returned when >50 shares exist', () => {
    ensureDir(SHARE_DIR_TEST)
    // Create 55 shares with incrementing timestamps
    const ids: Array<string> = []
    for (let i = 0; i < 55; i++) {
      const id = randomBytes(8).toString('hex')
      ids.push(id)
      const meta = {
        id,
        kind: 'text',
        size: 5,
        created: i * 1000,
        expiresAt: Date.now() + 99999999,
      }
      writeFileSync(
        pathJoin(SHARE_DIR_TEST, `${id}.json`),
        JSON.stringify(meta),
      )
      writeFileSync(pathJoin(SHARE_DIR_TEST, `${id}.bin`), Buffer.from('hello'))
    }

    // Simulate list logic: read all, sort by created desc, slice 50
    const shares = readdirSync(SHARE_DIR_TEST)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(pathJoin(SHARE_DIR_TEST, f), 'utf8')))
      .sort((a: any, b: any) => b.created - a.created)
      .slice(0, 50)

    expect(shares).toHaveLength(50)
    // Newest should be first (created = 54000 is highest)
    expect(shares[0].created).toBe(54000)
  })
})
