import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const DEFAULT_DB_DIR = path.resolve(process.cwd(), '.data')
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, 'workspace-daemon.sqlite')

let dbInstance: Database.Database | null = null

function ensureDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function readSchemaSql(): string {
  const schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql')
  return fs.readFileSync(schemaPath, 'utf8')
}

function ensureCheckpointCommitHashColumn(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(checkpoints)').all() as Array<{
    name: string
  }>
  const hasCommitHash = columns.some((column) => column.name === 'commit_hash')
  if (!hasCommitHash) {
    db.exec('ALTER TABLE checkpoints ADD COLUMN commit_hash TEXT')
  }

  const hasVerification = columns.some(
    (column) => column.name === 'verification',
  )
  if (!hasVerification) {
    db.exec('ALTER TABLE checkpoints ADD COLUMN verification TEXT')
  }
}

function ensureProjectPolicyColumns(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(projects)').all() as Array<{
    name: string
  }>
  const hasAutoApprove = columns.some(
    (column) => column.name === 'auto_approve',
  )
  const hasMaxConcurrent = columns.some(
    (column) => column.name === 'max_concurrent',
  )
  const hasRequiredChecks = columns.some(
    (column) => column.name === 'required_checks',
  )
  const hasAllowedTools = columns.some(
    (column) => column.name === 'allowed_tools',
  )

  if (!hasAutoApprove) {
    db.exec('ALTER TABLE projects ADD COLUMN auto_approve INTEGER DEFAULT 0')
  }
  if (!hasMaxConcurrent) {
    db.exec('ALTER TABLE projects ADD COLUMN max_concurrent INTEGER DEFAULT 2')
  }
  if (!hasRequiredChecks) {
    db.exec(
      "ALTER TABLE projects ADD COLUMN required_checks TEXT DEFAULT 'tsc'",
    )
  }
  if (!hasAllowedTools) {
    db.exec(
      "ALTER TABLE projects ADD COLUMN allowed_tools TEXT DEFAULT 'git,shell'",
    )
  }
}

function seedDefaultTeams(db: Database.Database): void {
  const row = db.prepare('SELECT COUNT(*) AS count FROM teams').get() as {
    count: number
  }
  if (row.count > 0) {
    return
  }

  const insertTeam = db.prepare(
    `INSERT INTO teams (id, name, description, permissions)
     VALUES (@id, @name, @description, @permissions)`,
  )

  const defaultTeams = [
    {
      id: 'admin',
      name: 'Admin',
      description: 'Full workspace access',
      permissions: ['workspace.admin'],
    },
    {
      id: 'dev',
      name: 'Dev',
      description: 'Can run tasks and view runs',
      permissions: ['tasks.run', 'runs.view'],
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      description: 'Can approve and reject checkpoints',
      permissions: ['checkpoints.review'],
    },
  ]

  const insertDefaults = db.transaction(() => {
    for (const team of defaultTeams) {
      insertTeam.run({
        ...team,
        permissions: JSON.stringify(team.permissions),
      })
    }
  })

  insertDefaults()
}

export function getDatabase(
  dbPath = process.env.WORKSPACE_DAEMON_DB_PATH ?? DEFAULT_DB_PATH,
): Database.Database {
  if (dbInstance) {
    return dbInstance
  }

  ensureDirectory(dbPath)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(readSchemaSql())
  ensureCheckpointCommitHashColumn(db)
  ensureProjectPolicyColumns(db)
  seedDefaultTeams(db)
  dbInstance = db
  return db
}

export function closeDatabase(): void {
  if (!dbInstance) {
    return
  }

  dbInstance.close()
  dbInstance = null
}

export type SqliteDatabase = Database.Database
