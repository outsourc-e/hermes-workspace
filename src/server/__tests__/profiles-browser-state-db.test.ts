import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)

type SqliteDatabaseSync = {
  exec: (sql: string) => void
  close: () => void
}

type NodeSqliteModule = {
  DatabaseSync: new (path: string) => SqliteDatabaseSync
}

function loadNodeSqlite(): NodeSqliteModule | undefined {
  try {
    return require('node:sqlite') as NodeSqliteModule
  } catch {
    return undefined
  }
}

const sqlite = loadNodeSqlite()
const describeWithSqlite = sqlite ? describe : describe.skip

let hermesHome: string

beforeEach(() => {
  hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-profiles-'))
  process.env.HERMES_HOME = hermesHome
  vi.resetModules()
})

afterEach(() => {
  delete process.env.HERMES_HOME
  fs.rmSync(hermesHome, { recursive: true, force: true })
})

describeWithSqlite('profiles-browser state.db session counts', () => {
  it('counts sessions from profile state.db before falling back to legacy session files', async () => {
    const profilePath = path.join(hermesHome, 'profiles', 'agent')
    fs.mkdirSync(profilePath, { recursive: true })
    fs.writeFileSync(path.join(profilePath, 'config.yaml'), 'model:\n  default: gpt-5.5\n')

    const db = new sqlite!.DatabaseSync(path.join(profilePath, 'state.db'))
    db.exec('create table sessions (id text primary key)')
    db.exec("insert into sessions (id) values ('one'), ('two'), ('three')")
    db.close()

    const mod = await import('../profiles-browser')
    const profile = mod.listProfiles().find((entry) => entry.name === 'agent')

    expect(profile?.sessionCount).toBe(3)
  })
})
