import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getStateDir } from '../workspace-state-dir'
import { MissionSchema } from './types'
import type { Lease, Mission } from './types'

function databasePath(): string {
  return join(getStateDir(), 'coordination.db')
}

let database: DatabaseSync | null = null
let activeDatabasePath: string | null = null

function getDatabase(): DatabaseSync {
  const path = databasePath()
  if (database && activeDatabasePath === path) return database
  database?.close()
  mkdirSync(dirname(path), { recursive: true })
  database = new DatabaseSync(path)
  activeDatabasePath = path
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      version INTEGER NOT NULL,
      max_parallelism INTEGER NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scheduler_leases (
      mission_id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resource_leases (
      resource TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS coordination_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mission_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webhook_receipts (
      event_id TEXT PRIMARY KEY,
      mission_id TEXT,
      event_type TEXT NOT NULL,
      received_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_resource_leases_expiry ON resource_leases(expires_at);
    CREATE INDEX IF NOT EXISTS idx_events_mission_time ON coordination_events(mission_id, created_at);
  `)
  return database
}

export function closeCoordinationDatabase(): void {
  database?.close()
  database = null
  activeDatabasePath = null
}

export class MissionVersionConflictError extends Error {
  constructor(public readonly missionId: string, public readonly expected: number, public readonly actual: number) {
    super(`Mission ${missionId} version conflict: expected < ${expected}, found ${actual}`)
  }
}

export function saveMission(mission: Mission): void {
  const db = getDatabase()
  const now = Date.now()
  db.exec('BEGIN IMMEDIATE')
  try {
    const existing = db.prepare('SELECT version FROM missions WHERE id = ?').get(mission.id) as { version: number } | undefined
    if (existing && existing.version >= mission.version) {
      db.exec('ROLLBACK')
      throw new MissionVersionConflictError(mission.id, mission.version, existing.version)
    }
    db.prepare(
      `
      INSERT INTO missions (id, title, version, max_parallelism, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        version=excluded.version,
        max_parallelism=excluded.max_parallelism,
        payload=excluded.payload,
        updated_at=excluded.updated_at
    `,
    ).run(
      mission.id,
      mission.title,
      mission.version,
      mission.maxParallelism,
      JSON.stringify(mission),
      now,
      now,
    )
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* preserve original error */ }
    throw error
  }
}

export function deleteMission(missionId: string): void {
  const db = getDatabase()
  releaseSchedulerLeaseForMission(missionId)
  const mission = getMission(missionId)
  if (mission)
    releaseResourceLeasesForMission(
      missionId,
      mission.nodes.flatMap((node) => node.locks),
    )
  db.prepare('DELETE FROM coordination_events WHERE mission_id = ?').run(
    missionId,
  )
  db.prepare('DELETE FROM missions WHERE id = ?').run(missionId)
}

export function getMission(missionId: string): Mission | null {
  const row = getDatabase()
    .prepare('SELECT payload FROM missions WHERE id = ?')
    .get(missionId) as { payload?: string } | undefined
  if (!row?.payload) return null
  try {
    const parsed = MissionSchema.safeParse(JSON.parse(row.payload))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function listMissions(): Array<Mission> {
  return (
    getDatabase()
      .prepare('SELECT payload FROM missions ORDER BY updated_at DESC')
      .all() as Array<{ payload: string }>
  ).flatMap((row) => {
    try {
      const parsed = MissionSchema.safeParse(JSON.parse(row.payload))
      return parsed.success ? [parsed.data] : []
    } catch {
      return []
    }
  })
}

export function appendCoordinationEvent(
  missionId: string,
  type: string,
  payload: Record<string, unknown>,
): void {
  getDatabase()
    .prepare(
      'INSERT INTO coordination_events (mission_id, type, payload, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(missionId, type, JSON.stringify(payload), Date.now())
}

export function recordWebhookReceipt(input: {
  eventId: string
  missionId: string | null
  eventType: string
}): boolean {
  const result = getDatabase()
    .prepare(
      'INSERT OR IGNORE INTO webhook_receipts (event_id, mission_id, event_type, received_at) VALUES (?, ?, ?, ?)',
    )
    .run(input.eventId, input.missionId, input.eventType, Date.now())
  return result.changes > 0
}

export function acquireSchedulerLease(
  missionId: string,
  owner: string,
  ttlMs: number,
): Lease | null {
  const db = getDatabase()
  const now = Date.now()
  const expiresAt = now + ttlMs
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('DELETE FROM scheduler_leases WHERE expires_at <= ?').run(now)
    const existing = db
      .prepare(
        'SELECT owner, expires_at FROM scheduler_leases WHERE mission_id = ?',
      )
      .get(missionId) as { owner?: string; expires_at?: number } | undefined
    if (existing && existing.owner !== owner) {
      db.exec('ROLLBACK')
      return null
    }
    db.prepare(
      `
      INSERT INTO scheduler_leases (mission_id, owner, expires_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(mission_id) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at, updated_at=excluded.updated_at
    `,
    ).run(missionId, owner, expiresAt, now)
    db.exec('COMMIT')
    return { resource: `scheduler:${missionId}`, owner, expiresAt }
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* preserve original error */
    }
    throw error
  }
}

export function acquireResourceLeases(
  missionId: string,
  owner: string,
  resources: Array<string>,
  ttlMs: number,
): Array<Lease> | null {
  const db = getDatabase()
  const now = Date.now()
  const expiresAt = now + ttlMs
  const sorted = [...new Set(resources)].sort()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('DELETE FROM resource_leases WHERE expires_at <= ?').run(now)
    for (const resource of sorted) {
      const existing = db
        .prepare('SELECT owner FROM resource_leases WHERE resource = ?')
        .get(resource) as { owner?: string } | undefined
      if (existing && existing.owner !== owner) {
        db.exec('ROLLBACK')
        return null
      }
    }
    const statement = db.prepare(`
      INSERT INTO resource_leases (resource, owner, mission_id, expires_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(resource) DO UPDATE SET owner=excluded.owner, mission_id=excluded.mission_id, expires_at=excluded.expires_at, updated_at=excluded.updated_at
    `)
    for (const resource of sorted)
      statement.run(resource, owner, missionId, expiresAt, now)
    db.exec('COMMIT')
    return sorted.map((resource) => ({ resource, owner, expiresAt }))
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* preserve original error */
    }
    throw error
  }
}

export function releaseLeases(owner: string, resources: Array<string>): void {
  const db = getDatabase()
  const statement = db.prepare(
    'DELETE FROM resource_leases WHERE owner = ? AND resource = ?',
  )
  for (const resource of resources) statement.run(owner, resource)
}

export function releaseResourceLeasesForMission(
  missionId: string,
  resources: Array<string>,
): void {
  if (!resources.length) return
  const db = getDatabase()
  const statement = db.prepare(
    'DELETE FROM resource_leases WHERE mission_id = ? AND resource = ?',
  )
  for (const resource of resources) statement.run(missionId, resource)
}

export function releaseSchedulerLeaseForMission(missionId: string): void {
  getDatabase()
    .prepare('DELETE FROM scheduler_leases WHERE mission_id = ?')
    .run(missionId)
}

export function renewSchedulerLease(
  missionId: string,
  owner: string,
  ttlMs: number,
): Lease | null {
  const expiresAt = Date.now() + ttlMs
  const result = getDatabase()
    .prepare(
      'UPDATE scheduler_leases SET expires_at = ?, updated_at = ? WHERE mission_id = ? AND owner = ? AND expires_at > ?',
    )
    .run(expiresAt, Date.now(), missionId, owner, Date.now())
  if (!result.changes) return null
  return { resource: `scheduler:${missionId}`, owner, expiresAt }
}

export function renewResourceLeases(
  owner: string,
  resources: Array<string>,
  ttlMs: number,
): Array<Lease> {
  const expiresAt = Date.now() + ttlMs
  const statement = getDatabase().prepare(
    'UPDATE resource_leases SET expires_at = ?, updated_at = ? WHERE resource = ? AND owner = ? AND expires_at > ?',
  )
  return resources.flatMap((resource) => {
    const result = statement.run(
      expiresAt,
      Date.now(),
      resource,
      owner,
      Date.now(),
    )
    return result.changes ? [{ resource, owner, expiresAt }] : []
  })
}

export function releaseSchedulerLease(missionId: string, owner: string): void {
  getDatabase()
    .prepare('DELETE FROM scheduler_leases WHERE mission_id = ? AND owner = ?')
    .run(missionId, owner)
}

export function expireLeases(now = Date.now()): {
  scheduler: number
  resources: number
} {
  const db = getDatabase()
  const scheduler = Number(
    db.prepare('DELETE FROM scheduler_leases WHERE expires_at <= ?').run(now)
      .changes,
  )
  const resources = Number(
    db.prepare('DELETE FROM resource_leases WHERE expires_at <= ?').run(now)
      .changes,
  )
  return { scheduler, resources }
}

export function listLeases(now = Date.now()): {
  scheduler: Array<Lease & { missionId: string }>
  resources: Array<Lease & { missionId: string }>
} {
  const db = getDatabase()
  const scheduler = (
    db
      .prepare(
        'SELECT mission_id, owner, expires_at FROM scheduler_leases WHERE expires_at > ?',
      )
      .all(now) as Array<{
      mission_id: string
      owner: string
      expires_at: number
    }>
  ).map((row) => ({
    resource: `scheduler:${row.mission_id}`,
    missionId: row.mission_id,
    owner: row.owner,
    expiresAt: row.expires_at,
  }))
  const resources = (
    db
      .prepare(
        'SELECT resource, mission_id, owner, expires_at FROM resource_leases WHERE expires_at > ?',
      )
      .all(now) as Array<{
      resource: string
      mission_id: string
      owner: string
      expires_at: number
    }>
  ).map((row) => ({
    resource: row.resource,
    missionId: row.mission_id,
    owner: row.owner,
    expiresAt: row.expires_at,
  }))
  return { scheduler, resources }
}

export function listCoordinationEvents(
  missionId: string,
): Array<{
  type: string
  payload: Record<string, unknown>
  createdAt: number
}> {
  return (
    getDatabase()
      .prepare(
        'SELECT type, payload, created_at FROM coordination_events WHERE mission_id = ? ORDER BY id',
      )
      .all(missionId) as Array<{
      type: string
      payload: string
      created_at: number
    }>
  ).flatMap((row) => {
    try {
      return [
        {
          type: row.type,
          payload: JSON.parse(row.payload) as Record<string, unknown>,
          createdAt: row.created_at,
        },
      ]
    } catch {
      return []
    }
  })
}

export function coordinationDatabasePath(): string {
  return databasePath()
}
