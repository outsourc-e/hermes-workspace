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

function ensureCheckpointRawDiffColumn(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(checkpoints)').all() as Array<{
    name: string
  }>
  const hasRawDiff = columns.some((column) => column.name === 'raw_diff')
  if (!hasRawDiff) {
    db.exec('ALTER TABLE checkpoints ADD COLUMN raw_diff TEXT')
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

function ensureAgentProfileColumns(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(agents)').all() as Array<{
    name: string
  }>
  const hasAvatar = columns.some((column) => column.name === 'avatar')
  const hasAvatarTone = columns.some((column) => column.name === 'avatar_tone')
  const hasDescription = columns.some((column) => column.name === 'description')
  const hasSystemPrompt = columns.some(
    (column) => column.name === 'system_prompt',
  )
  const hasPromptUpdatedAt = columns.some(
    (column) => column.name === 'prompt_updated_at',
  )

  if (!hasAvatar) {
    db.exec("ALTER TABLE agents ADD COLUMN avatar TEXT DEFAULT '🛰️'")
  }
  if (!hasAvatarTone) {
    db.exec("ALTER TABLE agents ADD COLUMN avatar_tone TEXT DEFAULT 'primary'")
  }
  if (!hasDescription) {
    db.exec('ALTER TABLE agents ADD COLUMN description TEXT')
  }
  if (!hasSystemPrompt) {
    db.exec('ALTER TABLE agents ADD COLUMN system_prompt TEXT')
  }
  if (!hasPromptUpdatedAt) {
    db.exec('ALTER TABLE agents ADD COLUMN prompt_updated_at TEXT')
  }
}

function ensureSessionIdColumn(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(task_runs)').all() as Array<{
    name: string
  }>
  const hasSessionId = columns.some((column) => column.name === 'session_id')
  if (!hasSessionId) {
    db.exec('ALTER TABLE task_runs ADD COLUMN session_id TEXT')
  }
}

function ensureEventsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_type_created_at ON events(type, created_at DESC);
  `)
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

function seedDefaultAgents(db: Database.Database): void {
  const getAgentById = db.prepare('SELECT id FROM agents WHERE id = ? LIMIT 1')
  const insertAgent = db.prepare(
    `INSERT INTO agents (
      id,
      name,
      role,
      adapter_type,
      adapter_config,
      model,
      status,
      avatar,
      avatar_tone,
      description,
      system_prompt,
      prompt_updated_at,
      capabilities
    ) VALUES (
      @id,
      @name,
      @role,
      @adapter_type,
      @adapter_config,
      @model,
      @status,
      @avatar,
      @avatar_tone,
      @description,
      @system_prompt,
      @prompt_updated_at,
      @capabilities
    )`,
  )

  const defaultAgents = [
    {
      id: 'aurora-coder',
      name: 'Aurora Coder',
      role: 'frontend',
      adapter_type: 'codex',
      adapter_config: '{}',
      model: 'gpt-5.4',
      status: 'online',
      avatar: '🎨',
      avatar_tone: 'accent',
      description:
        'Frontend implementation agent. React, Tailwind, TanStack. Owns src/screens/ and src/components/.',
      system_prompt:
        '# Aurora Coder\n\nYou are the frontend implementation agent for ClawSuite.\n\n## Stack\n- React + TanStack Router/Query in clawsuite/src/\n- Tailwind CSS with primary-50..950 scale + accent-* colors\n- HugeIcons (@hugeicons/core-free-icons + @hugeicons/react)\n- motion/react for animations (NOT framer-motion)\n- Components in src/components/ui/ (Button, toast, Switch)\n\n## Design system rules\n- Light theme: bg-surface, text-primary-900, borders border-primary-200\n- Standard page: <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">\n- Section: <section className="mx-auto w-full max-w-[1480px] space-y-5">\n\n## Verification\nAfter every change: npx tsc --noEmit from clawsuite/. Zero errors before commit.',
      prompt_updated_at: '2026-03-10T00:00:00.000Z',
      capabilities: JSON.stringify({
        repo_write: true,
        shell_commands: true,
        git_operations: true,
        browser: false,
        network: false,
      }),
    },
    {
      id: 'aurora-daemon',
      name: 'Aurora Daemon',
      role: 'backend',
      adapter_type: 'codex',
      adapter_config: '{}',
      model: 'gpt-5.4',
      status: 'online',
      avatar: '⚙️',
      avatar_tone: 'primary',
      description:
        'Backend/API agent. Express + SQLite workspace daemon. Owns workspace-daemon/src/.',
      system_prompt:
        '# Aurora Daemon\n\nYou are the backend implementation agent for the ClawSuite workspace daemon.\n\n## Stack\n- Express + better-sqlite3 in workspace-daemon/src/\n- Routes in src/routes/, DB in src/db/, types in src/types.ts\n- Tracker class (src/tracker.ts) is source of truth — ALL DB writes go through it\n- SSE via emitSse() in tracker — emit on every meaningful state change\n- Migrations: add ensureXxxColumn() in src/db/index.ts, call from getDatabase()\n\n## Patterns\n- Route files export createXxxRouter(tracker) functions\n- Always call tracker methods, never raw DB from routes\n- Return { error: string } with status on failures\n\n## Verification\nAfter every change: npx tsc --noEmit from workspace-daemon/. Zero errors before commit.',
      prompt_updated_at: '2026-03-10T00:00:00.000Z',
      capabilities: JSON.stringify({
        repo_write: true,
        shell_commands: true,
        git_operations: true,
        browser: false,
        network: false,
      }),
    },
    {
      id: 'aurora-qa',
      name: 'Aurora QA',
      role: 'reviewer',
      adapter_type: 'claude',
      adapter_config: '{}',
      model: 'claude-sonnet-4-6',
      status: 'online',
      avatar: '🔍',
      avatar_tone: 'green',
      description:
        'Code review and verification agent. Checks diffs for type errors, React issues, API correctness.',
      system_prompt:
        '# Aurora QA\n\nYou review git diffs and verify correctness before checkpoints are approved.\n\n## Checklist\n1. TypeScript: type errors in diff? Check function signatures, return types.\n2. React: missing useEffect deps? Infinite render risks? Missing key props?\n3. API: new routes have input validation? Consistent error shapes?\n4. DB: new columns have migrations? SQL uses prepared statements?\n5. Design: new UI uses correct color tokens?\n6. Regressions: does change touch shared utilities?\n\n## Output\nReturn JSON: { approved: boolean, issues: string[], summary: string }',
      prompt_updated_at: '2026-03-10T00:00:00.000Z',
      capabilities: JSON.stringify({
        repo_write: false,
        shell_commands: true,
        git_operations: true,
        browser: true,
        network: true,
      }),
    },
    {
      id: 'aurora-planner',
      name: 'Aurora Planner',
      role: 'planner',
      adapter_type: 'claude',
      adapter_config: '{}',
      model: 'claude-sonnet-4-6',
      status: 'online',
      avatar: '🗺️',
      avatar_tone: 'yellow',
      description:
        'Task decomposition agent. Breaks goals into implementation tasks with agent assignments.',
      system_prompt:
        '# Aurora Planner\n\nGiven a goal, produce a JSON array of implementation tasks.\n\n## Task schema\n{ name, description, estimated_minutes, depends_on, suggested_agent_type }\n- suggested_agent_type: codex for file edits, claude for analysis, openclaw for orchestration\n\n## Rules\n- Max 8 tasks per decomposition\n- Each task independently executable\n- Description specific enough to act without extra context\n- depends_on references exact task names in same array\n- Return ONLY the JSON array, no markdown, no explanation',
      prompt_updated_at: '2026-03-10T00:00:00.000Z',
      capabilities: JSON.stringify({
        repo_write: false,
        shell_commands: false,
        git_operations: false,
        browser: false,
        network: true,
      }),
    },
  ] as const

  const insertDefaults = db.transaction(() => {
    for (const agent of defaultAgents) {
      const existing = getAgentById.get(agent.id) as { id: string } | undefined
      if (existing) {
        continue
      }

      insertAgent.run(agent)
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
  ensureCheckpointRawDiffColumn(db)
  ensureProjectPolicyColumns(db)
  ensureAgentProfileColumns(db)
  ensureSessionIdColumn(db)
  ensureEventsTable(db)
  seedDefaultTeams(db)
  seedDefaultAgents(db)
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
