import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_DB_DIR = path.resolve(process.cwd(), ".data");
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, "workspace-daemon.sqlite");

let dbInstance: Database.Database | null = null;

function ensureDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readSchemaSql(): string {
  const schemaPath = path.resolve(process.cwd(), "src/db/schema.sql");
  return fs.readFileSync(schemaPath, "utf8");
}

function ensureCheckpointCommitHashColumn(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(checkpoints)").all() as Array<{ name: string }>;
  const hasCommitHash = columns.some((column) => column.name === "commit_hash");
  if (!hasCommitHash) {
    db.exec("ALTER TABLE checkpoints ADD COLUMN commit_hash TEXT");
  }

  const hasVerification = columns.some((column) => column.name === "verification");
  if (!hasVerification) {
    db.exec("ALTER TABLE checkpoints ADD COLUMN verification TEXT");
  }
}

export function getDatabase(dbPath = process.env.WORKSPACE_DAEMON_DB_PATH ?? DEFAULT_DB_PATH): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  ensureDirectory(dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(readSchemaSql());
  ensureCheckpointCommitHashColumn(db);
  dbInstance = db;
  return db;
}

export function closeDatabase(): void {
  if (!dbInstance) {
    return;
  }

  dbInstance.close();
  dbInstance = null;
}

export type SqliteDatabase = Database.Database;
