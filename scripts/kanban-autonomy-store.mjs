#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import {
  closeSync, constants as fsConstants, existsSync, fchmodSync, fstatSync, lstatSync, mkdirSync,
  openSync, readdirSync, realpathSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTIVE_EVENT_TYPES, COORDINATION_STATE_POLICY_VERSION, JSON_LIMITS, STATE_POLICY_VERSION, SUPPORTED_EVENT_VERSIONS, assertSha256Hash, assertWellFormedUnicodeString,
  authorityWithinCeiling, canonicalJson, compareStrictUtc, deriveClaimSelectionBasis, durableTaskId, isActiveEventType, normalizeBoardSlug, normalizeStableId, parseStrictBoundedJson, parseStrictUtc,
  projectTaskStateToKanban, projectCoordinationAt, replayTask, reduceTaskState, sha256Hex, validateBoundedJsonValue, validateEventPayload,
  validateEventVersion,
} from './kanban-autonomy-state.mjs';

export const STORE_SCHEMA_VERSION = 'kanban_autonomy_store.v2';
export const STORE_USER_VERSION = 2;
export const STORE_DIRECTORY_PREFIX = 'hermes-kan-autonomy-';
export const STORE_DATABASE_NAME = 'kanban-autonomy.db';
export const MAX_PAYLOAD_BYTES = JSON_LIMITS.MAX_JSON_INPUT_BYTES;
const MAX_EVENT_BYTES = 32_768;
const BUSY_TIMEOUT_MS = 2_000;
const MAX_STORE_BYTES = 128 * 1024 * 1024;
const PROC_FD_ROOT = '/proc/self/fd';
const SIDE_EFFECTS = Object.freeze({
  production_store_write: false,
  temp_store_write: false,
  kanban_write: false,
  card_created: false,
  card_moved: false,
  lease_created: false,
  approval_created: false,
  telegram_sent: false,
  github_written: false,
  obsidian_written: false,
  network_calls: false,
  model_calls: false,
  service_changes: false,
  timer_changes: false,
});

class TrustedDomainError extends Error {
  constructor(code, message = code) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

function codedError(code, message = code) {
  throw new TrustedDomainError(code, message);
}

function boundedText(value, field, maximum, pattern = /^[\x20-\x7e]+$/) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || !pattern.test(value)) codedError('INVALID_FIELD', field);
  return value;
}

function assertPlainObject(value, code = 'PAYLOAD_ROOT_MUST_BE_OBJECT') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) codedError(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) codedError(code);
}

const FORBIDDEN_SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'token', 'bottoken', 'accesstoken', 'refreshtoken', 'bearertoken', 'sessiontoken', 'apikey',
  'secret', 'clientsecret', 'privatekey', 'authorization', 'authorizationheader', 'authheader', 'cookie',
  'setcookie', 'sessioncookie', 'credential', 'credentials', 'environment', 'environmentdump', 'envdump',
  'chatid', 'telegramchatid', 'rawcardbody', 'cardbody', 'metadatadump', 'customerdata',
  'telegramid', 'rawbody', 'environmentvariable', 'env', 'filesystempath', 'filepath',
]);

export function normalizeSensitiveKeyName(key) {
  if (typeof key !== 'string') codedError('PAYLOAD_INVALID');
  assertWellFormedUnicodeString(key, 'key');
  for (let index = 0; index < key.length; index += 1) {
    const unit = key.charCodeAt(index);
    if (unit < 0x20 || unit === 0x7f) codedError('PAYLOAD_KEY_CONTROL_CHARACTER_FORBIDDEN');
    if (unit > 0x7e) codedError('PAYLOAD_KEY_NON_ASCII_FORBIDDEN');
  }
  if (Buffer.byteLength(key, 'utf8') > JSON_LIMITS.MAX_KEY_BYTES) codedError('PAYLOAD_KEY_TOO_LONG');
  return key.replace(/[A-Z]/g, (character) => character.toLowerCase()).replace(/[^a-z0-9]/g, '');
}

function walkPayload(value) {
  if (Array.isArray(value)) {
    for (const item of value) walkPayload(item);
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(value) || /\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/.test(value)) codedError('SENSITIVE_PAYLOAD_REJECTED');
      if (/^(?:\/root|\/home|\/etc|\/var|[A-Za-z]:\\)/.test(value)) codedError('SENSITIVE_PAYLOAD_REJECTED');
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_SENSITIVE_KEYS.has(normalizeSensitiveKeyName(key))) codedError('SENSITIVE_PAYLOAD_REJECTED');
    walkPayload(item);
  }
}

export function validatePayload(payload) {
  assertPlainObject(payload);
  validateBoundedJsonValue(payload);
  walkPayload(payload);
  const payloadJson = canonicalJson(payload);
  if (Buffer.byteLength(payloadJson, 'utf8') > MAX_PAYLOAD_BYTES) codedError('PAYLOAD_TOO_LARGE');
  return Object.freeze({ payload, payloadJson, payloadHash: `sha256:${sha256Hex(payloadJson)}` });
}

export function parseStoredPayloadJson(payloadJson) {
  const payload = parseStrictBoundedJson(payloadJson);
  assertPlainObject(payload);
  const validated = validatePayload(payload);
  return Object.freeze({
    payload,
    payloadJson: validated.payloadJson,
    payloadHash: validated.payloadHash,
    canonical: payloadJson === validated.payloadJson,
  });
}

function storeRefusal() {
  codedError('PRODUCTION_DURABLE_STORE_DISABLED');
}

function expectedOwner(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function exactMode(stat, mode) {
  return (stat.mode & 0o777) === mode;
}

function closeQuietly(descriptor) {
  if (descriptor === null || descriptor === undefined) return;
  try { closeSync(descriptor); } catch {}
}

export function validateTempStorePath(storePath, { mustExist = false, allowCreateDirectory = false } = {}) {
  if (typeof storePath !== 'string' || storePath.includes('\0') || !path.isAbsolute(storePath)) storeRefusal();
  if (path.normalize(storePath) !== storePath || path.resolve(storePath) !== storePath) storeRefusal();
  if (path.basename(storePath) !== STORE_DATABASE_NAME) storeRefusal();
  const directory = path.dirname(storePath);
  if (path.dirname(directory) !== '/tmp') storeRefusal();
  const directoryName = path.basename(directory);
  if (!directoryName.startsWith(STORE_DIRECTORY_PREFIX) || !/^hermes-kan-autonomy-[A-Za-z0-9][A-Za-z0-9_-]{5,80}$/.test(directoryName)) storeRefusal();

  if (!existsSync(directory)) {
    if (!allowCreateDirectory) storeRefusal();
    try { mkdirSync(directory, { mode: 0o700 }); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
  }
  const directoryStat = lstatSync(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory() || directoryStat.nlink < 2 || !expectedOwner(directoryStat)) storeRefusal();
  if ((directoryStat.mode & 0o777) !== 0o700 || realpathSync(directory) !== directory) storeRefusal();

  if (existsSync(storePath)) {
    const databaseStat = lstatSync(storePath);
    if (databaseStat.isSymbolicLink() || !databaseStat.isFile() || databaseStat.nlink !== 1 || !expectedOwner(databaseStat)) storeRefusal();
    if (realpathSync(storePath) !== storePath || (databaseStat.mode & 0o777) !== 0o600) storeRefusal();
  } else if (mustExist) storeRefusal();
  return Object.freeze({ storePath, directory });
}

function configureDatabase(db, { write = false } = {}) {
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL; PRAGMA busy_timeout=${BUSY_TIMEOUT_MS};`);
  if (write) db.exec('PRAGMA journal_mode=DELETE');
  const foreignKeys = Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys);
  const trustedSchema = Number(db.prepare('PRAGMA trusted_schema').get().trusted_schema);
  const synchronous = Number(db.prepare('PRAGMA synchronous').get().synchronous);
  const busyTimeout = Number(db.prepare('PRAGMA busy_timeout').get().timeout);
  if (foreignKeys !== 1 || trustedSchema !== 0 || synchronous !== 2 || busyTimeout !== BUSY_TIMEOUT_MS) codedError('SQLITE_SAFETY_PRAGMA_FAILED');
}

function descriptorIdentityMultiset(procFdRoot = PROC_FD_ROOT) {
  let entries;
  try { entries = readdirSync(procFdRoot); } catch { codedError('SECURE_STORE_OPEN_UNAVAILABLE'); }
  const counts = new Map();
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = fstatSync(Number(entry));
      if (!stat.isFile()) continue;
      const key = `${stat.dev}:${stat.ino}:regular`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    } catch {
      // Descriptor enumeration races are expected: entries may disappear or be reused.
    }
  }
  return counts;
}

function identityKey(stat) {
  return `${stat.dev}:${stat.ino}:regular`;
}

function assertParentDescriptor(stat, expected) {
  if (!stat.isDirectory() || !expectedOwner(stat) || !exactMode(stat, 0o700) || !sameIdentity(stat, expected)) {
    codedError('STORE_PATH_IDENTITY_CHANGED');
  }
}

function assertDatabaseDescriptor(stat, expected) {
  if (!stat.isFile() || !expectedOwner(stat) || !exactMode(stat, 0o600) || stat.nlink !== 1
    || stat.size > MAX_STORE_BYTES || !sameIdentity(stat, expected)) codedError('STORE_PATH_IDENTITY_CHANGED');
}

function invokeTestHook(testHooks, name, context) {
  const hook = testHooks?.[name];
  if (hook !== undefined && typeof hook !== 'function') codedError('INVALID_TEST_HOOK');
  hook?.(context);
}

function openAnchoredTempStore({ storePath, accessMode, initialize, testHooks }) {
  if (fsConstants.O_NOFOLLOW === undefined || fsConstants.O_DIRECTORY === undefined) {
    codedError('SECURE_STORE_OPEN_UNAVAILABLE');
  }
  const write = accessMode === 'readwrite';
  if (!write && accessMode !== 'readonly') codedError('INVALID_STORE_ACCESS_MODE');
  const validated = validateTempStorePath(storePath, {
    mustExist: !initialize,
    allowCreateDirectory: initialize,
  });
  const expectedParent = lstatSync(validated.directory);
  let directoryDescriptor = null;
  let databaseDescriptor = null;
  let db = null;
  let transactionActive = false;
  let closed = false;
  let created = false;
  let sqliteIdentityProven = false;
  let preOpenIdentityCount = 0;
  const procFdRoot = testHooks?.procFdRoot ?? PROC_FD_ROOT;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (transactionActive && db) {
      try { db.exec('ROLLBACK'); } catch {}
      transactionActive = false;
    }
    try { db?.close(); } catch {}
    db = null;
    closeQuietly(databaseDescriptor);
    databaseDescriptor = null;
    closeQuietly(directoryDescriptor);
    directoryDescriptor = null;
  };

  try {
    const directoryFlags = fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | (fsConstants.O_NOFOLLOW ?? 0)
      | (fsConstants.O_CLOEXEC ?? 0);
    directoryDescriptor = openSync(validated.directory, directoryFlags);
    const heldParent = fstatSync(directoryDescriptor);
    assertParentDescriptor(heldParent, expectedParent);
    if (realpathSync(validated.directory) !== validated.directory) codedError('STORE_PATH_IDENTITY_CHANGED');
    invokeTestHook(testHooks, 'afterParentValidated', {
      storePath, directory: validated.directory, directoryDescriptor,
    });

    descriptorIdentityMultiset(procFdRoot);
    const anchoredStorePath = `${procFdRoot}/${directoryDescriptor}/${STORE_DATABASE_NAME}`;
    const databaseExists = existsSync(anchoredStorePath);
    if (!databaseExists && !initialize) storeRefusal();
    if (!databaseExists) {
      try {
        databaseDescriptor = openSync(
          anchoredStorePath,
          fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW ?? 0)
            | (fsConstants.O_CLOEXEC ?? 0),
          0o600,
        );
        fchmodSync(databaseDescriptor, 0o600);
        created = true;
      } catch (error) {
        if (error?.code !== 'EEXIST' || !initialize) throw error;
        databaseDescriptor = openSync(
          anchoredStorePath,
          fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_CLOEXEC ?? 0),
        );
      }
    } else {
      const flags = (write ? fsConstants.O_RDWR : fsConstants.O_RDONLY) | (fsConstants.O_NOFOLLOW ?? 0)
        | (fsConstants.O_CLOEXEC ?? 0);
      databaseDescriptor = openSync(anchoredStorePath, flags);
    }
    const expectedDatabase = fstatSync(databaseDescriptor);
    assertDatabaseDescriptor(expectedDatabase, expectedDatabase);
    const anchoredEntry = lstatSync(anchoredStorePath);
    assertDatabaseDescriptor(anchoredEntry, expectedDatabase);
    invokeTestHook(testHooks, 'afterDatabaseDescriptorValidated', {
      storePath, anchoredStorePath, directory: validated.directory, directoryDescriptor, databaseDescriptor,
    });

    const before = descriptorIdentityMultiset(procFdRoot);
    preOpenIdentityCount = before.get(identityKey(expectedDatabase)) ?? 0;
    const databaseFactory = testHooks?.databaseFactory ?? ((databasePath, options) => new DatabaseSync(databasePath, options));
    db = databaseFactory(anchoredStorePath, {
      enableForeignKeyConstraints: true,
      readOnly: !write,
    });
    invokeTestHook(testHooks, 'afterSqliteOpenedBeforeIdentityProof', {
      storePath, anchoredStorePath, directory: validated.directory, directoryDescriptor, databaseDescriptor, db,
    });

    const proveSqliteIdentity = () => {
      const after = descriptorIdentityMultiset(procFdRoot);
      const matchingCount = after.get(identityKey(expectedDatabase)) ?? 0;
      if (matchingCount <= preOpenIdentityCount) codedError('SQLITE_OPENED_STORE_IDENTITY_UNPROVEN');
      const databaseList = db.prepare('PRAGMA database_list').all();
      const main = databaseList.find((row) => row.name === 'main');
      let listedIdentity;
      try {
        if (!main || typeof main.file !== 'string' || !path.isAbsolute(main.file)) throw new Error('database_list');
        listedIdentity = lstatSync(main.file);
      } catch { codedError('SQLITE_OPENED_STORE_IDENTITY_UNPROVEN'); }
      if (!listedIdentity.isFile() || !sameIdentity(listedIdentity, expectedDatabase)) {
        codedError('SQLITE_OPENED_STORE_IDENTITY_UNPROVEN');
      }
      sqliteIdentityProven = true;
    };

    const verifyAnchoredStoreIdentity = (context) => {
      void context;
      let currentParent;
      let currentEntry;
      let heldParentNow;
      let heldDatabaseNow;
      try {
        currentParent = lstatSync(validated.directory);
        if (currentParent.isSymbolicLink() || realpathSync(validated.directory) !== validated.directory) throw new Error('parent');
        currentEntry = lstatSync(anchoredStorePath);
        heldParentNow = fstatSync(directoryDescriptor);
        heldDatabaseNow = fstatSync(databaseDescriptor);
      } catch { codedError('STORE_PATH_IDENTITY_CHANGED'); }
      assertParentDescriptor(currentParent, expectedParent);
      assertParentDescriptor(heldParentNow, expectedParent);
      assertDatabaseDescriptor(currentEntry, expectedDatabase);
      assertDatabaseDescriptor(heldDatabaseNow, expectedDatabase);
      if (!sqliteIdentityProven) codedError('SQLITE_OPENED_STORE_IDENTITY_UNPROVEN');
      const currentCounts = descriptorIdentityMultiset(procFdRoot);
      if ((currentCounts.get(identityKey(expectedDatabase)) ?? 0) <= preOpenIdentityCount) {
        codedError('SQLITE_OPENED_STORE_IDENTITY_UNPROVEN');
      }
      return true;
    };

    proveSqliteIdentity();
    verifyAnchoredStoreIdentity('after-sqlite-open');
    configureDatabase(db, { write });

    return {
      db,
      created,
      anchoredStorePath,
      verifyAnchoredStoreIdentity,
      beginTransaction() {
        invokeTestHook(testHooks, 'beforeTransaction', {
          storePath, anchoredStorePath, directory: validated.directory, directoryDescriptor, databaseDescriptor, db,
        });
        verifyAnchoredStoreIdentity('before-begin-immediate');
        db.exec('BEGIN IMMEDIATE');
        transactionActive = true;
      },
      beginReadTransaction() {
        verifyAnchoredStoreIdentity('before-begin-read');
        db.exec('BEGIN');
        transactionActive = true;
      },
      commitTransaction() {
        invokeTestHook(testHooks, 'beforeCommit', {
          storePath, anchoredStorePath, directory: validated.directory, directoryDescriptor, databaseDescriptor, db,
        });
        verifyAnchoredStoreIdentity('before-commit');
        db.exec('COMMIT');
        transactionActive = false;
        invokeTestHook(testHooks, 'afterCommit', {
          storePath, anchoredStorePath, directory: validated.directory, directoryDescriptor, databaseDescriptor, db,
        });
        verifyAnchoredStoreIdentity('after-commit');
      },
      rollbackTransaction() {
        if (!transactionActive) return;
        try { db.exec('ROLLBACK'); } finally { transactionActive = false; }
      },
      close: cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

const SCHEMA_SQL = `
CREATE TABLE store_meta (
  key TEXT PRIMARY KEY CHECK(length(key) BETWEEN 1 AND 64),
  value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 256)
) STRICT;
CREATE TABLE durable_tasks (
  task_id TEXT PRIMARY KEY CHECK(length(task_id) BETWEEN 4 AND 64),
  board_slug TEXT NOT NULL CHECK(length(board_slug) BETWEEN 1 AND 63),
  kanban_card_id TEXT NOT NULL CHECK(length(kanban_card_id) BETWEEN 1 AND 128),
  source_identity_hash TEXT NOT NULL CHECK(length(source_identity_hash) = 71),
  initial_card_snapshot_hash TEXT NOT NULL CHECK(length(initial_card_snapshot_hash) = 71),
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 128),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 40),
  authority_ceiling TEXT NOT NULL CHECK(authority_ceiling IN ('A0','A1','A2','A3','A4','A5','A6')),
  creation_idempotency_key TEXT NOT NULL UNIQUE CHECK(length(creation_idempotency_key) BETWEEN 1 AND 128),
  UNIQUE(board_slug, kanban_card_id)
) STRICT;
CREATE TABLE durable_events (
  event_id TEXT PRIMARY KEY CHECK(length(event_id) BETWEEN 4 AND 64),
  task_id TEXT NOT NULL REFERENCES durable_tasks(task_id),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  event_type TEXT NOT NULL CHECK(length(event_type) BETWEEN 1 AND 64),
  event_version INTEGER NOT NULL CHECK(event_version BETWEEN 1 AND 1000),
  occurred_at TEXT NOT NULL CHECK(length(occurred_at) BETWEEN 20 AND 40),
  actor_type TEXT NOT NULL CHECK(length(actor_type) BETWEEN 1 AND 64),
  actor_id_hash TEXT CHECK(actor_id_hash IS NULL OR length(actor_id_hash) = 71),
  worker_id TEXT CHECK(worker_id IS NULL OR length(worker_id) BETWEEN 1 AND 128),
  authority_level TEXT NOT NULL CHECK(authority_level IN ('A0','A1','A2','A3','A4','A5','A6')),
  fencing_token INTEGER CHECK(fencing_token IS NULL OR fencing_token >= 0),
  lease_id TEXT CHECK(lease_id IS NULL OR (length(lease_id) BETWEEN 8 AND 80 AND lease_id LIKE 'klease_%')),
  payload_json TEXT NOT NULL CHECK(length(payload_json) <= ${MAX_PAYLOAD_BYTES}),
  payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 71),
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 128),
  previous_event_id TEXT CHECK(previous_event_id IS NULL OR length(previous_event_id) BETWEEN 4 AND 64),
  previous_event_hash TEXT CHECK(previous_event_hash IS NULL OR length(previous_event_hash) = 71),
  event_hash TEXT NOT NULL CHECK(length(event_hash) = 71),
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 128),
  correlation_id TEXT CHECK(correlation_id IS NULL OR length(correlation_id) BETWEEN 1 AND 128),
  redaction_class TEXT NOT NULL CHECK(length(redaction_class) BETWEEN 1 AND 64),
  CHECK((event_type IN ('CARD_CLAIMED','LEASE_RENEWED','LEASE_RELEASED')
    AND fencing_token IS NOT NULL AND fencing_token >= 1 AND lease_id IS NOT NULL
    AND actor_id_hash IS NOT NULL AND worker_id IS NOT NULL)
    OR (event_type NOT IN ('CARD_CLAIMED','LEASE_RENEWED','LEASE_RELEASED')
      AND fencing_token IS NULL AND lease_id IS NULL)),
  UNIQUE(task_id, sequence),
  UNIQUE(task_id, idempotency_key)
) STRICT;
CREATE INDEX durable_events_task_sequence ON durable_events(task_id, sequence);
CREATE UNIQUE INDEX durable_events_unique_claim_lease_id ON durable_events(lease_id) WHERE event_type='CARD_CLAIMED';
CREATE TABLE durable_task_coordination (
  task_id TEXT PRIMARY KEY REFERENCES durable_tasks(task_id),
  lease_generation INTEGER NOT NULL CHECK(lease_generation >= 1),
  lease_id TEXT NOT NULL UNIQUE CHECK(length(lease_id) BETWEEN 8 AND 80 AND lease_id LIKE 'klease_%'),
  claimant_id_hash TEXT NOT NULL CHECK(length(claimant_id_hash) = 71),
  worker_session_id TEXT NOT NULL CHECK(length(worker_session_id) BETWEEN 5 AND 80 AND worker_session_id LIKE 'kws_%'),
  lease_started_at TEXT NOT NULL CHECK(length(lease_started_at) BETWEEN 20 AND 40),
  lease_expires_at TEXT NOT NULL CHECK(length(lease_expires_at) BETWEEN 20 AND 40),
  released_at TEXT CHECK(released_at IS NULL OR length(released_at) BETWEEN 20 AND 40),
  release_reason_code TEXT CHECK(release_reason_code IS NULL OR release_reason_code IN ('WORK_COMPLETE','PAUSED','BLOCKED','HANDOFF','OPERATOR_REQUEST','WORKER_ERROR')),
  last_coordination_event_id TEXT NOT NULL REFERENCES durable_events(event_id),
  last_coordination_event_hash TEXT NOT NULL CHECK(length(last_coordination_event_hash) = 71),
  CHECK((released_at IS NULL AND release_reason_code IS NULL)
    OR (released_at IS NOT NULL AND release_reason_code IS NOT NULL))
) STRICT;
`;

function schemaVersion(db) {
  const row = db.prepare("SELECT value FROM store_meta WHERE key='schema_version'").get();
  return row?.value ?? null;
}

function statePolicyVersion(db) {
  const row = db.prepare("SELECT value FROM store_meta WHERE key='state_policy_version'").get();
  return row?.value ?? null;
}

const EXPECTED_SCHEMA_COLUMNS = Object.freeze({
  store_meta: Object.freeze(['key:TEXT:1:1', 'value:TEXT:1:0']),
  durable_tasks: Object.freeze([
    'task_id:TEXT:1:1', 'board_slug:TEXT:1:0', 'kanban_card_id:TEXT:1:0', 'source_identity_hash:TEXT:1:0',
    'initial_card_snapshot_hash:TEXT:1:0', 'policy_version:TEXT:1:0', 'created_at:TEXT:1:0',
    'authority_ceiling:TEXT:1:0', 'creation_idempotency_key:TEXT:1:0',
  ]),
  durable_events: Object.freeze([
    'event_id:TEXT:1:1', 'task_id:TEXT:1:0', 'sequence:INTEGER:1:0', 'event_type:TEXT:1:0',
    'event_version:INTEGER:1:0', 'occurred_at:TEXT:1:0', 'actor_type:TEXT:1:0', 'actor_id_hash:TEXT:0:0',
    'worker_id:TEXT:0:0', 'authority_level:TEXT:1:0', 'fencing_token:INTEGER:0:0', 'lease_id:TEXT:0:0', 'payload_json:TEXT:1:0',
    'payload_hash:TEXT:1:0', 'idempotency_key:TEXT:1:0', 'previous_event_id:TEXT:0:0',
    'previous_event_hash:TEXT:0:0', 'event_hash:TEXT:1:0', 'policy_version:TEXT:1:0',
    'correlation_id:TEXT:0:0', 'redaction_class:TEXT:1:0',
  ]),
  durable_task_coordination: Object.freeze([
    'task_id:TEXT:1:1', 'lease_generation:INTEGER:1:0', 'lease_id:TEXT:1:0', 'claimant_id_hash:TEXT:1:0',
    'worker_session_id:TEXT:1:0', 'lease_started_at:TEXT:1:0', 'lease_expires_at:TEXT:1:0',
    'released_at:TEXT:0:0', 'release_reason_code:TEXT:0:0', 'last_coordination_event_id:TEXT:1:0',
    'last_coordination_event_hash:TEXT:1:0',
  ]),
});

const EXPECTED_SCHEMA_INDEXES = Object.freeze({
  store_meta: Object.freeze({
    sqlite_autoindex_store_meta_1: Object.freeze({ unique: 1, origin: 'pk', columns: Object.freeze(['key']) }),
  }),
  durable_tasks: Object.freeze({
    sqlite_autoindex_durable_tasks_1: Object.freeze({ unique: 1, origin: 'pk', columns: Object.freeze(['task_id']) }),
    sqlite_autoindex_durable_tasks_2: Object.freeze({ unique: 1, origin: 'u', columns: Object.freeze(['creation_idempotency_key']) }),
    sqlite_autoindex_durable_tasks_3: Object.freeze({ unique: 1, origin: 'u', columns: Object.freeze(['board_slug', 'kanban_card_id']) }),
  }),
  durable_events: Object.freeze({
    durable_events_task_sequence: Object.freeze({ unique: 0, origin: 'c', columns: Object.freeze(['task_id', 'sequence']) }),
    durable_events_unique_claim_lease_id: Object.freeze({ unique: 1, origin: 'c', partial: 1, columns: Object.freeze(['lease_id']) }),
    sqlite_autoindex_durable_events_1: Object.freeze({ unique: 1, origin: 'pk', columns: Object.freeze(['event_id']) }),
    sqlite_autoindex_durable_events_2: Object.freeze({ unique: 1, origin: 'u', columns: Object.freeze(['task_id', 'sequence']) }),
    sqlite_autoindex_durable_events_3: Object.freeze({ unique: 1, origin: 'u', columns: Object.freeze(['task_id', 'idempotency_key']) }),
  }),
  durable_task_coordination: Object.freeze({
    sqlite_autoindex_durable_task_coordination_1: Object.freeze({ unique: 1, origin: 'pk', columns: Object.freeze(['task_id']) }),
    sqlite_autoindex_durable_task_coordination_2: Object.freeze({ unique: 1, origin: 'u', columns: Object.freeze(['lease_id']) }),
  }),
});

function normalizedSchemaSql(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

function expectedSchemaDefinitions() {
  return SCHEMA_SQL.split(';').map((statement) => statement.trim()).filter(Boolean).map((statement) => {
    const match = /^CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX)\s+([a-z_][a-z0-9_]*)/i.exec(statement);
    if (!match) codedError('STORE_SCHEMA_PARTIAL_INITIALIZATION');
    return { type: match[1].toLowerCase(), name: match[2], sql: normalizedSchemaSql(statement) };
  }).sort((left, right) => `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`));
}

function assertSchema(db) {
  const schemaDefinitions = db.prepare(`SELECT type, name, sql FROM sqlite_schema
    WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`).all()
    .map((row) => ({ type: row.type, name: row.name, sql: normalizedSchemaSql(row.sql) }));
  if (canonicalJson(schemaDefinitions) !== canonicalJson(expectedSchemaDefinitions())) {
    codedError('STORE_SCHEMA_PARTIAL_INITIALIZATION');
  }
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map((row) => row.name);
  if (canonicalJson(tables) !== canonicalJson(['durable_events', 'durable_task_coordination', 'durable_tasks', 'store_meta'])) {
    codedError('STORE_SCHEMA_PARTIAL_INITIALIZATION');
  }
  for (const [table, expectedColumns] of Object.entries(EXPECTED_SCHEMA_COLUMNS)) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all()
      .map((row) => `${row.name}:${row.type}:${Number(row.notnull)}:${Number(row.pk)}`);
    if (canonicalJson(columns) !== canonicalJson(expectedColumns)) codedError('STORE_SCHEMA_PARTIAL_INITIALIZATION');
    const expectedIndexes = EXPECTED_SCHEMA_INDEXES[table];
    const indexRows = db.prepare(`PRAGMA index_list(${table})`).all().sort((left, right) => left.name.localeCompare(right.name));
    if (canonicalJson(indexRows.map((row) => row.name)) !== canonicalJson(Object.keys(expectedIndexes).sort())) {
      codedError('STORE_SCHEMA_PARTIAL_INITIALIZATION');
    }
    for (const row of indexRows) {
      const expected = expectedIndexes[row.name];
      const columnsForIndex = db.prepare(`PRAGMA index_info(${row.name})`).all()
        .sort((left, right) => Number(left.seqno) - Number(right.seqno)).map((item) => item.name);
      if (!expected || Number(row.unique) !== expected.unique || row.origin !== expected.origin
        || Number(row.partial) !== (expected.partial ?? 0)
        || canonicalJson(columnsForIndex) !== canonicalJson(expected.columns)) {
        codedError('STORE_SCHEMA_PARTIAL_INITIALIZATION');
      }
    }
  }
  const foreignKeys = db.prepare('PRAGMA foreign_key_list(durable_events)').all().map((row) => ({
    table: row.table, from: row.from, to: row.to, on_update: row.on_update, on_delete: row.on_delete, match: row.match,
  }));
  const expectedForeignKeys = [{
    table: 'durable_tasks', from: 'task_id', to: 'task_id', on_update: 'NO ACTION', on_delete: 'NO ACTION', match: 'NONE',
  }];
  if (canonicalJson(foreignKeys) !== canonicalJson(expectedForeignKeys)) codedError('STORE_SCHEMA_PARTIAL_INITIALIZATION');
  const coordinationForeignKeys = db.prepare('PRAGMA foreign_key_list(durable_task_coordination)').all().map((row) => ({
    table: row.table, from: row.from, to: row.to, on_update: row.on_update, on_delete: row.on_delete, match: row.match,
  })).sort((left, right) => left.from.localeCompare(right.from));
  const expectedCoordinationForeignKeys = [
    { table: 'durable_events', from: 'last_coordination_event_id', to: 'event_id', on_update: 'NO ACTION', on_delete: 'NO ACTION', match: 'NONE' },
    { table: 'durable_tasks', from: 'task_id', to: 'task_id', on_update: 'NO ACTION', on_delete: 'NO ACTION', match: 'NONE' },
  ].sort((left, right) => left.from.localeCompare(right.from));
  if (canonicalJson(coordinationForeignKeys) !== canonicalJson(expectedCoordinationForeignKeys)) codedError('STORE_SCHEMA_PARTIAL_INITIALIZATION');
  const version = schemaVersion(db);
  const userVersion = Number(db.prepare('PRAGMA user_version').get().user_version);
  if (version !== STORE_SCHEMA_VERSION || userVersion !== STORE_USER_VERSION) codedError('UNKNOWN_SCHEMA_VERSION');
  if (statePolicyVersion(db) !== STATE_POLICY_VERSION) codedError('UNSUPPORTED_STATE_POLICY_VERSION');
}

export function initStore({ storePath }, { testHooks } = {}) {
  const store = openAnchoredTempStore({ storePath, accessMode: 'readwrite', initialize: true, testHooks });
  const { db, created } = store;
  let initialized = false;
  try {
    store.beginTransaction();
    try {
      invokeTestHook(testHooks, 'afterInitTransactionBegan', { db });
      const objectCount = Number(db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%'").get().count);
      const userVersion = Number(db.prepare('PRAGMA user_version').get().user_version);
      if (objectCount === 0 && userVersion === 0) {
        db.exec(SCHEMA_SQL);
        invokeTestHook(testHooks, 'afterSchemaCreatedBeforeMetadata', { db });
        db.prepare('INSERT INTO store_meta(key, value) VALUES (?, ?)').run('schema_version', STORE_SCHEMA_VERSION);
        db.prepare('INSERT INTO store_meta(key, value) VALUES (?, ?)').run('state_policy_version', STATE_POLICY_VERSION);
        invokeTestHook(testHooks, 'afterMetadataInsertedBeforeInitCommit', { db });
        db.exec(`PRAGMA user_version=${STORE_USER_VERSION}`);
        assertSchema(db);
        initialized = true;
        store.commitTransaction();
      } else {
        assertSchema(db);
        store.rollbackTransaction();
      }
    } catch (error) { store.rollbackTransaction(); throw error; }
    store.verifyAnchoredStoreIdentity('before-report');
    return {
      initialized, created, schema_version: STORE_SCHEMA_VERSION, state_policy_version: STATE_POLICY_VERSION,
      ...SIDE_EFFECTS, temp_store_write: initialized,
    };
  } finally { store.close(); }
}

function taskFromRow(row) {
  if (!row) return null;
  return {
    task_id: row.task_id, board_slug: row.board_slug, kanban_card_id: row.kanban_card_id,
    source_identity_hash: row.source_identity_hash, initial_card_snapshot_hash: row.initial_card_snapshot_hash,
    policy_version: row.policy_version, created_at: row.created_at, authority_ceiling: row.authority_ceiling,
    creation_idempotency_key: row.creation_idempotency_key,
  };
}

function normalizedTaskInput(input) {
  const boardSlug = normalizeBoardSlug(input.boardSlug);
  const kanbanCardId = normalizeStableId(input.kanbanCardId, 'kanbanCardId');
  const taskId = durableTaskId(boardSlug, kanbanCardId);
  if (!parseStrictUtc(input.createdAt)) codedError('INVALID_TIMESTAMP');
  authorityWithinCeiling('A0', input.authorityCeiling);
  return {
    task_id: taskId,
    board_slug: boardSlug,
    kanban_card_id: kanbanCardId,
    source_identity_hash: assertSha256Hash(input.sourceIdentityHash, 'sourceIdentityHash'),
    initial_card_snapshot_hash: assertSha256Hash(input.cardSnapshotHash, 'cardSnapshotHash'),
    policy_version: boundedText(input.policyVersion, 'policyVersion', 128),
    created_at: input.createdAt,
    authority_ceiling: input.authorityCeiling,
    creation_idempotency_key: boundedText(input.idempotencyKey, 'idempotencyKey', 128),
  };
}

function sameObject(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function initialEventPayload(task) {
  return {
    authority_ceiling: task.authority_ceiling,
    board_slug_hash: `sha256:${sha256Hex(task.board_slug)}`,
    creation_idempotency_key_hash: `sha256:${sha256Hex(task.creation_idempotency_key)}`,
    initial_card_snapshot_hash: task.initial_card_snapshot_hash,
    kanban_card_id_hash: `sha256:${sha256Hex(task.kanban_card_id)}`,
    policy_version: task.policy_version,
    source_identity_hash: task.source_identity_hash,
    task_id: task.task_id,
  };
}

function canonicalTaskCreatedIds(task) {
  const idempotencyKey = `task-init-${sha256Hex(canonicalJson({
    task_id: task.task_id,
    creation_idempotency_key: task.creation_idempotency_key,
  })).slice(0, 32)}`;
  return {
    idempotencyKey,
    eventId: `ke_${sha256Hex(canonicalJson({ task_id: task.task_id, idempotency_key: idempotencyKey })).slice(0, 24)}`,
  };
}

export function buildCanonicalTaskCreatedEvent({ task, eventId, idempotencyKey }) {
  assertPlainObject(task, 'TASK_CREATED_ENVELOPE_MISMATCH');
  const canonicalIds = canonicalTaskCreatedIds(task);
  if ((eventId !== undefined && eventId !== canonicalIds.eventId)
    || (idempotencyKey !== undefined && idempotencyKey !== canonicalIds.idempotencyKey)) {
    codedError('TASK_CREATED_ENVELOPE_MISMATCH');
  }
  const safePayload = validateEventPayload('TASK_CREATED', 1, initialEventPayload(task));
  const payload = validatePayload(safePayload);
  const eventWithoutHash = {
    event_id: canonicalIds.eventId,
    task_id: task.task_id,
    sequence: 1,
    event_type: 'TASK_CREATED',
    event_version: 1,
    occurred_at: task.created_at,
    actor_type: 'system',
    actor_id_hash: null,
    worker_id: null,
    authority_level: 'A0',
    fencing_token: null,
    lease_id: null,
    payload_json: payload.payloadJson,
    payload_hash: payload.payloadHash,
    idempotency_key: canonicalIds.idempotencyKey,
    previous_event_id: null,
    previous_event_hash: null,
    policy_version: task.policy_version,
    correlation_id: null,
    redaction_class: 'internal',
  };
  return Object.freeze({
    ...eventWithoutHash,
    event_hash: `sha256:${sha256Hex(canonicalEventHashMaterial(eventWithoutHash))}`,
  });
}

function insertEventRow(db, event) {
  db.prepare(`INSERT INTO durable_events (
    event_id, task_id, sequence, event_type, event_version, occurred_at, actor_type, actor_id_hash,
    worker_id, authority_level, fencing_token, lease_id, payload_json, payload_hash, idempotency_key,
    previous_event_id, previous_event_hash, event_hash, policy_version, correlation_id, redaction_class
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    event.event_id, event.task_id, event.sequence, event.event_type, event.event_version, event.occurred_at,
    event.actor_type, event.actor_id_hash, event.worker_id, event.authority_level, event.fencing_token, event.lease_id,
    event.payload_json, event.payload_hash, event.idempotency_key, event.previous_event_id,
    event.previous_event_hash, event.event_hash, event.policy_version, event.correlation_id, event.redaction_class,
  );
}

export function createTask(input, { testHooks } = {}) {
  const normalized = normalizedTaskInput(input);
  const store = openAnchoredTempStore({
    storePath: input.storePath, accessMode: 'readwrite', initialize: false, testHooks,
  });
  const { db } = store;
  try {
    store.beginTransaction();
    try {
      assertSchema(db);
      const existingByTask = taskFromRow(db.prepare('SELECT * FROM durable_tasks WHERE task_id=?').get(normalized.task_id));
      const existingByKey = taskFromRow(db.prepare('SELECT * FROM durable_tasks WHERE creation_idempotency_key=?').get(normalized.creation_idempotency_key));
      const existing = existingByTask ?? existingByKey;
      if (existing) {
        const rows = rowsForTask(db, existing.task_id);
        if (rows.length === 0) codedError('TASK_INITIALIZATION_INCOMPLETE');
        const checked = verifyTaskChainRows({ task: existing, rows, stopAfterFirstFatal: true });
        if (!checked.valid || rows[0]?.event_type !== 'TASK_CREATED') codedError('TASK_INITIALIZATION_INCOMPLETE');
        if (!sameObject(existing, normalized)) codedError('TASK_CREATION_IDEMPOTENCY_CONFLICT');
        store.commitTransaction();
        return {
          created: false, initial_event_appended: false, task: existing, event: rows[0],
          task_id: existing.task_id, initial_event_id: rows[0].event_id, sequence: 1,
          reconstructed_state: checked.reconstructedState, ...SIDE_EFFECTS,
        };
      }
      db.prepare(`INSERT INTO durable_tasks (
        task_id, board_slug, kanban_card_id, source_identity_hash, initial_card_snapshot_hash,
        policy_version, created_at, authority_ceiling, creation_idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        normalized.task_id, normalized.board_slug, normalized.kanban_card_id, normalized.source_identity_hash,
        normalized.initial_card_snapshot_hash, normalized.policy_version, normalized.created_at,
        normalized.authority_ceiling, normalized.creation_idempotency_key,
      );
      invokeTestHook(testHooks, 'afterTaskInsertedBeforeInitialEvent', { db, task: normalized });
      const event = buildCanonicalTaskCreatedEvent({ task: normalized });
      insertEventRow(db, event);
      invokeTestHook(testHooks, 'afterInitialEventInsertedBeforeCommit', { db, task: normalized, event });
      const checked = verifyTaskChainRows({ task: normalized, rows: [event], stopAfterFirstFatal: true });
      if (!checked.valid) codedError('TASK_INITIALIZATION_INCOMPLETE');
      store.commitTransaction();
      return {
        created: true, initial_event_appended: true, task: normalized, event,
        task_id: normalized.task_id, initial_event_id: event.event_id, sequence: 1,
        reconstructed_state: checked.reconstructedState, ...SIDE_EFFECTS, temp_store_write: true,
      };
    } catch (error) { store.rollbackTransaction(); throw error; }
  } finally { store.close(); }
}

function eventFromRow(row) {
  if (!row) return null;
  return {
    event_id: row.event_id, task_id: row.task_id, sequence: Number(row.sequence), event_type: row.event_type,
    event_version: Number(row.event_version), occurred_at: row.occurred_at, actor_type: row.actor_type,
    actor_id_hash: row.actor_id_hash, worker_id: row.worker_id, authority_level: row.authority_level,
    fencing_token: row.fencing_token === null ? null : Number(row.fencing_token), lease_id: row.lease_id,
    payload_json: row.payload_json,
    payload_hash: row.payload_hash, idempotency_key: row.idempotency_key, previous_event_id: row.previous_event_id,
    previous_event_hash: row.previous_event_hash, event_hash: row.event_hash, policy_version: row.policy_version,
    correlation_id: row.correlation_id, redaction_class: row.redaction_class,
  };
}

function eventSecurityFields(event) {
  const { event_hash: ignored, ...covered } = event;
  void ignored;
  return covered;
}

const EVENT_HASH_FIELDS = Object.freeze([
  'actor_id_hash', 'actor_type', 'authority_level', 'correlation_id', 'event_id', 'event_type', 'event_version',
  'fencing_token', 'idempotency_key', 'lease_id', 'occurred_at', 'payload_hash', 'payload_json', 'policy_version',
  'previous_event_hash', 'previous_event_id', 'redaction_class', 'sequence', 'task_id', 'worker_id',
]);

function serializeCanonicalEnvelope(value) {
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${JSON.stringify(value[key])}`).join(',')}}`;
}

export function canonicalEventHashMaterial(eventWithoutHash) {
  assertPlainObject(eventWithoutHash, 'EVENT_HASH_ENVELOPE_INVALID');
  const ownKeys = Reflect.ownKeys(eventWithoutHash);
  const descriptors = Object.getOwnPropertyDescriptors(eventWithoutHash);
  if (ownKeys.some((key) => typeof key !== 'string')) codedError('EVENT_HASH_ENVELOPE_INVALID');
  const keys = ownKeys.slice().sort();
  if (keys.length !== EVENT_HASH_FIELDS.length || keys.some((key, index) => key !== EVENT_HASH_FIELDS[index])) {
    codedError('EVENT_HASH_ENVELOPE_INVALID');
  }
  if (keys.some((key) => !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) {
    codedError('EVENT_HASH_ENVELOPE_INVALID');
  }
  if (eventWithoutHash.actor_id_hash !== null) assertSha256Hash(eventWithoutHash.actor_id_hash, 'actor_id_hash');
  assertSha256Hash(eventWithoutHash.payload_hash, 'payload_hash');
  if (eventWithoutHash.previous_event_hash !== null) assertSha256Hash(eventWithoutHash.previous_event_hash, 'previous_event_hash');
  boundedText(eventWithoutHash.event_id, 'event_id', 64, /^ke_[a-f0-9]{24}$/);
  normalizeStableId(eventWithoutHash.task_id, 'task_id');
  if (!Number.isSafeInteger(eventWithoutHash.sequence) || eventWithoutHash.sequence < 1) codedError('EVENT_HASH_ENVELOPE_INVALID');
  if (!isActiveEventType(eventWithoutHash.event_type)) codedError('UNKNOWN_EVENT_TYPE');
  validateEventVersion(eventWithoutHash.event_type, eventWithoutHash.event_version);
  if (!parseStrictUtc(eventWithoutHash.occurred_at)) codedError('INVALID_TIMESTAMP');
  boundedText(eventWithoutHash.actor_type, 'actor_type', 64, /^[A-Za-z][A-Za-z0-9_-]*$/);
  if (eventWithoutHash.worker_id !== null) normalizeStableId(eventWithoutHash.worker_id, 'worker_id');
  authorityWithinCeiling(eventWithoutHash.authority_level, eventWithoutHash.authority_level);
  if (eventWithoutHash.fencing_token !== null && (!Number.isSafeInteger(eventWithoutHash.fencing_token) || eventWithoutHash.fencing_token < 0)) codedError('EVENT_HASH_ENVELOPE_INVALID');
  if (eventWithoutHash.lease_id !== null) boundedText(eventWithoutHash.lease_id, 'lease_id', 80, /^klease_[a-f0-9]{32}$/);
  if (typeof eventWithoutHash.payload_json !== 'string') codedError('EVENT_HASH_ENVELOPE_INVALID');
  assertWellFormedUnicodeString(eventWithoutHash.payload_json, 'value');
  if (Buffer.byteLength(eventWithoutHash.payload_json, 'utf8') > MAX_PAYLOAD_BYTES) codedError('PAYLOAD_TOO_LARGE');
  const stored = parseStoredPayloadJson(eventWithoutHash.payload_json);
  if (!stored.canonical || stored.payloadJson !== eventWithoutHash.payload_json) codedError('PAYLOAD_JSON_NONCANONICAL');
  validateEventPayload(eventWithoutHash.event_type, eventWithoutHash.event_version, stored.payload);
  if (stored.payloadHash !== eventWithoutHash.payload_hash) codedError('PAYLOAD_HASH_MISMATCH');
  boundedText(eventWithoutHash.idempotency_key, 'idempotency_key', 128);
  if (eventWithoutHash.previous_event_id !== null) normalizeStableId(eventWithoutHash.previous_event_id, 'previous_event_id');
  boundedText(eventWithoutHash.policy_version, 'policy_version', 128);
  if (eventWithoutHash.correlation_id !== null) normalizeStableId(eventWithoutHash.correlation_id, 'correlation_id');
  boundedText(eventWithoutHash.redaction_class, 'redaction_class', 64, /^[a-z][a-z0-9_-]*$/);
  const encoded = serializeCanonicalEnvelope(eventWithoutHash);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_EVENT_BYTES) codedError('EVENT_TOO_LARGE');
  return encoded;
}

function eventComparable(event) {
  return {
    task_id: event.task_id, event_type: event.event_type, event_version: event.event_version,
    occurred_at: event.occurred_at, actor_type: event.actor_type, actor_id_hash: event.actor_id_hash,
    worker_id: event.worker_id, authority_level: event.authority_level, fencing_token: event.fencing_token,
    lease_id: event.lease_id,
    payload_json: event.payload_json, payload_hash: event.payload_hash, idempotency_key: event.idempotency_key,
    policy_version: event.policy_version, correlation_id: event.correlation_id, redaction_class: event.redaction_class,
  };
}

function normalizedEventInput(input) {
  if (!isActiveEventType(input.eventType)) codedError('UNKNOWN_EVENT_TYPE');
  if (!parseStrictUtc(input.occurredAt)) codedError('INVALID_TIMESTAMP');
  validateEventVersion(input.eventType, input.eventVersion);
  if (input.fencingToken !== null && input.fencingToken !== undefined && (!Number.isSafeInteger(input.fencingToken) || input.fencingToken < 0)) codedError('INVALID_FIELD', 'fencingToken');
  const genericPayload = validatePayload(input.payload);
  const safePayload = validateEventPayload(input.eventType, input.eventVersion, genericPayload.payload);
  const payload = validatePayload(safePayload);
  return {
    task_id: normalizeStableId(input.taskId, 'taskId'),
    event_type: input.eventType,
    event_version: input.eventVersion,
    occurred_at: input.occurredAt,
    actor_type: boundedText(input.actorType, 'actorType', 64, /^[A-Za-z][A-Za-z0-9_-]*$/),
    actor_id_hash: input.actorIdHash == null ? null : assertSha256Hash(input.actorIdHash, 'actorIdHash'),
    worker_id: input.workerId == null ? null : normalizeStableId(input.workerId, 'workerId'),
    authority_level: input.authorityLevel,
    fencing_token: input.fencingToken ?? null,
    lease_id: input.leaseId ?? null,
    payload: payload.payload,
    payload_json: payload.payloadJson,
    payload_hash: payload.payloadHash,
    idempotency_key: boundedText(input.idempotencyKey, 'idempotencyKey', 128),
    policy_version: boundedText(input.policyVersion, 'policyVersion', 128),
    correlation_id: input.correlationId == null ? null : normalizeStableId(input.correlationId, 'correlationId'),
    redaction_class: boundedText(input.redactionClass, 'redactionClass', 64, /^[a-z][a-z0-9_-]*$/),
  };
}

function rowsForTask(db, taskId) {
  return db.prepare('SELECT * FROM durable_events WHERE task_id=? ORDER BY sequence').all(taskId).map(eventFromRow);
}

export function appendEvent(input, { testHooks } = {}) {
  if (['CARD_CLAIMED', 'LEASE_RENEWED', 'LEASE_RELEASED'].includes(input?.eventType)) {
    codedError('COORDINATION_EVENT_REQUIRES_ATOMIC_API');
  }
  if (input?.leaseId !== undefined && input.leaseId !== null) codedError('INVALID_FIELD');
  const normalized = normalizedEventInput(input);
  if (normalized.event_type === 'TASK_CREATED') codedError('DUPLICATE_TASK_CREATED');
  const { payload, ...comparable } = normalized;
  void payload;
  const store = openAnchoredTempStore({
    storePath: input.storePath, accessMode: 'readwrite', initialize: false, testHooks,
  });
  const { db } = store;
  try {
    store.beginTransaction();
    try {
      assertSchema(db);
      const task = taskFromRow(db.prepare('SELECT * FROM durable_tasks WHERE task_id=?').get(normalized.task_id));
      if (!task) codedError('TASK_NOT_FOUND');
      const rows = rowsForTask(db, normalized.task_id);
      invokeTestHook(testHooks, 'afterExistingChainLoadedBeforeVerification', { db, task, rows });
      const checked = verifyTaskChainRows({ task, rows, stopAfterFirstFatal: true });
      if (!checked.valid) codedError('EXISTING_EVENT_CHAIN_INVALID');
      invokeTestHook(testHooks, 'afterChainVerifiedBeforeAppendInsert', { db, task, rows, verification: checked });
      const existing = eventFromRow(db.prepare('SELECT * FROM durable_events WHERE task_id=? AND idempotency_key=?').get(normalized.task_id, normalized.idempotency_key));
      if (existing) {
        if (!sameObject(eventComparable(existing), comparable)) codedError('EVENT_IDEMPOTENCY_CONFLICT');
        store.commitTransaction();
        return { appended: false, event: existing, ...SIDE_EFFECTS };
      }
      const tail = rows.at(-1);
      if (compareStrictUtc(normalized.occurred_at, tail.occurred_at) < 0) codedError('EVENT_TIMESTAMP_REGRESSION');
      if (!authorityWithinCeiling(normalized.authority_level, task.authority_ceiling)) codedError('AUTHORITY_CEILING_EXCEEDED');
      const sequence = tail.sequence + 1;
      const eventId = `ke_${sha256Hex(canonicalJson({ task_id: normalized.task_id, idempotency_key: normalized.idempotency_key })).slice(0, 24)}`;
      reduceTaskState(checked.reducerState, {
        event_id: eventId,
        occurred_at: normalized.occurred_at,
        event_type: normalized.event_type,
        event_version: normalized.event_version,
        payload: normalized.payload,
      });
      const eventWithoutHash = {
        event_id: eventId, task_id: normalized.task_id, sequence, ...comparable,
        previous_event_id: tail.event_id, previous_event_hash: tail.event_hash,
      };
      const encoded = canonicalEventHashMaterial(eventWithoutHash);
      const event = { ...eventWithoutHash, event_hash: `sha256:${sha256Hex(encoded)}` };
      insertEventRow(db, event);
      invokeTestHook(testHooks, 'beforeAppendCommit', { db, task, event });
      store.commitTransaction();
      return { appended: true, event, ...SIDE_EFFECTS, temp_store_write: true };
    } catch (error) { store.rollbackTransaction(); throw error; }
  } finally { store.close(); }
}

function finding(code, taskId = null, sequence = null) {
  return { code, task_id: taskId, sequence };
}

function storedPayloadFindingCode(error) {
  if (error?.code === 'MALFORMED_HASH') return 'MALFORMED_HASH';
  if (error?.code === 'PAYLOAD_JSON_NONCANONICAL') return 'PAYLOAD_JSON_NONCANONICAL';
  if (error?.code === 'EVENT_PAYLOAD_INVALID') return 'EVENT_PAYLOAD_INVALID';
  if (error?.code === 'UNSUPPORTED_EVENT_PAYLOAD_POLICY') return 'UNSUPPORTED_EVENT_PAYLOAD_POLICY';
  return 'PAYLOAD_JSON_INVALID';
}

const TASK_CREATED_ENVELOPE_FIELDS = Object.freeze([
  'event_id', 'task_id', 'sequence', 'event_type', 'event_version', 'occurred_at', 'actor_type', 'actor_id_hash',
  'worker_id', 'authority_level', 'fencing_token', 'lease_id', 'idempotency_key', 'previous_event_id', 'previous_event_hash',
  'policy_version', 'correlation_id', 'redaction_class',
]);

export function verifyTaskChainRows({ task, rows, stopAfterFirstFatal = false }) {
  const findings = [];
  const add = (code, sequence = null) => {
    findings.push(finding(code, task?.task_id ?? null, sequence));
    return stopAfterFirstFatal;
  };
  if (!task) return { valid: false, findings: [finding('TASK_NOT_FOUND')], reconstructedState: null, chainTip: null };
  try {
    assertSha256Hash(task.source_identity_hash, 'source_identity_hash');
    assertSha256Hash(task.initial_card_snapshot_hash, 'initial_card_snapshot_hash');
  } catch (error) {
    if (error?.code === 'MALFORMED_HASH') {
      add('MALFORMED_HASH');
      return { valid: false, findings, reconstructedState: null, chainTip: null };
    }
    throw error;
  }
  if (!parseStrictUtc(task.created_at)) {
    add('INVALID_TIMESTAMP');
    return { valid: false, findings, reconstructedState: null, chainTip: null };
  }
  try {
    const normalizedBoard = normalizeBoardSlug(task.board_slug);
    const normalizedCard = normalizeStableId(task.kanban_card_id, 'kanban_card_id');
    if (normalizedBoard !== task.board_slug || durableTaskId(normalizedBoard, normalizedCard) !== task.task_id) {
      if (add('TASK_CARD_IDENTITY_CONFLICT')) return { valid: false, findings, reconstructedState: null, chainTip: null };
    }
    boundedText(task.policy_version, 'policy_version', 128);
    authorityWithinCeiling('A0', task.authority_ceiling);
    boundedText(task.creation_idempotency_key, 'creation_idempotency_key', 128);
  } catch {
    if (add('TASK_CREATED_IDENTITY_MISMATCH')) return { valid: false, findings, reconstructedState: null, chainTip: null };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    add('TASK_INITIALIZATION_INCOMPLETE');
    return { valid: false, findings, reconstructedState: null, chainTip: null };
  }

  const createdCount = rows.filter((event) => event.event_type === 'TASK_CREATED').length;
  if (rows[0].event_type !== 'TASK_CREATED') {
    if (add('TASK_CREATED_NOT_FIRST', rows[0].sequence)) return { valid: false, findings, reconstructedState: null, chainTip: null };
  }
  if (createdCount === 0) {
    if (add('TASK_INITIALIZATION_INCOMPLETE')) return { valid: false, findings, reconstructedState: null, chainTip: null };
  } else if (createdCount > 1) {
    if (add('DUPLICATE_TASK_CREATED')) return { valid: false, findings, reconstructedState: null, chainTip: null };
  }

  let state = null;
  let previous = null;
  const replayRows = [];
  for (let index = 0; index < rows.length; index += 1) {
    const event = rows[index];
    const expectedSequence = index + 1;
    try {
      if (event.actor_id_hash !== null) assertSha256Hash(event.actor_id_hash, 'actor_id_hash');
      assertSha256Hash(event.payload_hash, 'payload_hash');
      if (event.previous_event_hash !== null) assertSha256Hash(event.previous_event_hash, 'previous_event_hash');
      assertSha256Hash(event.event_hash, 'event_hash');
    } catch (error) {
      if (error?.code === 'MALFORMED_HASH') {
        add('MALFORMED_HASH', event.sequence);
        break;
      }
      throw error;
    }
    if (!parseStrictUtc(event.occurred_at)) {
      add('MALFORMED_TIMESTAMP', event.sequence);
      break;
    }
    if (event.sequence !== expectedSequence && add('MISSING_OR_DUPLICATE_SEQUENCE', event.sequence)) break;
    if (!isActiveEventType(event.event_type)) {
      if (add('UNKNOWN_EVENT_TYPE', event.sequence)) break;
    } else {
      try { validateEventVersion(event.event_type, event.event_version); }
      catch { if (add('UNSUPPORTED_EVENT_VERSION', event.sequence)) break; }
    }
    try {
      if (!authorityWithinCeiling(event.authority_level, task.authority_ceiling) && add('AUTHORITY_CEILING_EXCEEDED', event.sequence)) break;
    } catch { if (add('AUTHORITY_CEILING_EXCEEDED', event.sequence)) break; }

    let stored = null;
    try {
      stored = parseStoredPayloadJson(event.payload_json);
      if (!stored.canonical && add('PAYLOAD_JSON_NONCANONICAL', event.sequence)) break;
      validateEventPayload(event.event_type, event.event_version, stored.payload);
    } catch (error) {
      const code = index === 0 && event.event_type === 'TASK_CREATED' && error?.code === 'EVENT_PAYLOAD_INVALID'
        ? 'TASK_CREATED_IDENTITY_MISMATCH'
        : storedPayloadFindingCode(error);
      add(code, event.sequence);
      break;
    }
    const payloadHash = typeof event.payload_json === 'string' ? `sha256:${sha256Hex(event.payload_json)}` : null;
    if (payloadHash !== event.payload_hash && add('PAYLOAD_HASH_MISMATCH', event.sequence)) break;
    let expectedEventHash = null;
    try { expectedEventHash = `sha256:${sha256Hex(canonicalEventHashMaterial(eventSecurityFields(event)))}`; } catch {}
    if (expectedEventHash !== event.event_hash && add('EVENT_HASH_MISMATCH', event.sequence)) break;
    if ((event.previous_event_id ?? null) !== (previous?.event_id ?? null)
      && add('WRONG_PREVIOUS_EVENT_ID', event.sequence)) break;
    if ((event.previous_event_hash ?? null) !== (previous?.event_hash ?? null)
      && add('PREVIOUS_EVENT_HASH_MISMATCH', event.sequence)) break;
    if (previous && compareStrictUtc(event.occurred_at, previous.occurred_at) < 0) {
      add('EVENT_TIMESTAMP_REGRESSION', event.sequence);
      break;
    }
    if (index === 0 && event.event_type === 'TASK_CREATED') {
      let expectedInitial = null;
      try { expectedInitial = buildCanonicalTaskCreatedEvent({ task }); } catch {}
      const envelopeMatches = expectedInitial && TASK_CREATED_ENVELOPE_FIELDS.every((field) => (
        field === 'occurred_at'
          ? compareStrictUtc(event.occurred_at, expectedInitial.occurred_at) === 0
          : sameObject(event[field], expectedInitial[field])
      ));
      if (!envelopeMatches && add('TASK_CREATED_ENVELOPE_MISMATCH', event.sequence)) break;
    }

    if (index === 0 && event.event_type === 'TASK_CREATED') {
      if (stored && !sameObject(stored.payload, initialEventPayload(task))) {
        if (add('TASK_CREATED_IDENTITY_MISMATCH', event.sequence)) break;
      }
    } else if (event.event_type === 'TASK_CREATED' && add('DUPLICATE_TASK_CREATED', event.sequence)) break;

    if (stored && isActiveEventType(event.event_type) && SUPPORTED_EVENT_VERSIONS[event.event_type] === event.event_version) {
      try {
        state = reduceTaskState(state, {
          event_id: event.event_id,
          event_hash: event.event_hash,
          occurred_at: event.occurred_at,
          event_type: event.event_type,
          event_version: event.event_version,
          actor_type: event.actor_type,
          actor_id_hash: event.actor_id_hash,
          worker_id: event.worker_id,
          authority_level: event.authority_level,
          fencing_token: event.fencing_token,
          lease_id: event.lease_id,
          payload: stored.payload,
        });
        replayRows.push({ ...event, payload: stored.payload });
      } catch (error) {
        const code = error?.code === 'EVENT_PAYLOAD_INVALID' ? 'EVENT_PAYLOAD_INVALID'
          : (typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'INVALID_EVENT_TRANSITION');
        add(code, event.sequence);
        break;
      }
    }
    previous = event;
  }
  if (findings.length === 0) {
    try { replayTask(replayRows); }
    catch (error) {
      add(typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'COORDINATION_REPLAY_INVALID');
    }
  }
  const valid = findings.length === 0;
  return {
    valid,
    findings,
    reconstructedState: valid ? state.status : null,
    reducerState: valid ? state : null,
    chainTip: valid && previous ? { event_id: previous.event_id, event_hash: previous.event_hash, sequence: previous.sequence } : null,
  };
}

function workflowStateOutput(state, trusted) {
  if (!trusted || !state) {
    return {
      pending_approval_present: null, pending_approval_id_hash: null, pending_requested_authority: null,
      pending_requested_action: null, suspended: null, suspension_kind: null, suspension_return_status: null,
      last_approval_status: null, terminal: null, next_safe_action: null,
    };
  }
  return {
    pending_approval_present: state.pending_approval !== null,
    pending_approval_id_hash: state.pending_approval?.approval_id_hash ?? null,
    pending_requested_authority: state.pending_approval?.requested_authority ?? null,
    pending_requested_action: state.pending_approval?.requested_action ?? null,
    suspended: state.suspension !== null,
    suspension_kind: state.suspension?.kind ?? null,
    suspension_return_status: state.suspension?.return_status ?? null,
    last_approval_status: state.last_approval_resolution?.result ?? null,
    terminal: state.terminal,
    next_safe_action: state.next_safe_action,
  };
}

export function verifyTaskChain({ storePath, taskId }, { testHooks } = {}) {
  const store = openAnchoredTempStore({ storePath, accessMode: 'readonly', initialize: false, testHooks });
  const { db } = store;
  try {
    assertSchema(db);
    const task = taskFromRow(db.prepare('SELECT * FROM durable_tasks WHERE task_id=?').get(taskId));
    if (!task) codedError('TASK_NOT_FOUND');
    const rows = rowsForTask(db, task.task_id);
    const checked = verifyTaskChainRows({ task, rows });
    store.verifyAnchoredStoreIdentity('before-report');
    return {
      trusted: checked.valid, valid: checked.valid, checked_tasks: 1, checked_events: rows.length,
      findings: checked.findings, chain_tip: checked.chainTip, reconstructed_state: checked.reconstructedState,
      authority_ceiling: checked.valid ? task.authority_ceiling : null,
      authority_consumable: false,
      authority_data_trusted: checked.valid,
      ...workflowStateOutput(checked.reducerState, checked.valid),
      ...SIDE_EFFECTS,
    };
  } finally { store.close(); }
}

export function verifyStore({ storePath }, { testHooks } = {}) {
  const store = openAnchoredTempStore({ storePath, accessMode: 'readonly', initialize: false, testHooks });
  const { db } = store;
  let result;
  let operationError = null;
  try {
    store.beginReadTransaction();
    try {
      db.prepare("SELECT type, name FROM sqlite_schema ORDER BY type, name LIMIT 64").all();
      invokeTestHook(testHooks, 'afterVerifySnapshotEstablished', { db });
      const findings = [];
      try { assertSchema(db); }
      catch (error) {
        if (error?.code !== 'UNKNOWN_SCHEMA_VERSION') throw error;
        findings.push(finding('UNKNOWN_SCHEMA_VERSION'));
        store.verifyAnchoredStoreIdentity('before-report');
        result = {
          trusted: false, valid: false, checked_tasks: 0, checked_events: 0, findings,
          chain_tip: null, reconstructed_state: null, authority_ceiling: null, authority_consumable: false,
          authority_data_trusted: false, ...workflowStateOutput(null, false), snapshot_consistent: true,
          snapshot_transaction: 'read_only', ...SIDE_EFFECTS,
        };
      }
      if (!result) {
        const integrity = db.prepare('PRAGMA integrity_check').all();
        if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') findings.push(finding('SQLITE_INTEGRITY_CHECK_FAILED'));
        const foreignKeyFindings = db.prepare('PRAGMA foreign_key_check').all();
        if (foreignKeyFindings.length > 0) findings.push(finding('FOREIGN_KEY_CHECK_FAILED'));
        const orphanRows = db.prepare(`SELECT e.task_id, e.sequence FROM durable_events e
          LEFT JOIN durable_tasks t ON t.task_id=e.task_id WHERE t.task_id IS NULL ORDER BY e.task_id, e.sequence`).all();
        for (const orphan of orphanRows) findings.push(finding('ORPHAN_EVENT', orphan.task_id, Number(orphan.sequence)));
        const identityDuplicates = db.prepare(`SELECT board_slug, kanban_card_id FROM durable_tasks
          GROUP BY board_slug, kanban_card_id HAVING count(*) > 1`).all();
        for (const duplicate of identityDuplicates) {
          void duplicate;
          findings.push(finding('TASK_IDENTITY_CONFLICT'));
        }
        invokeTestHook(testHooks, 'beforeVerifyTaskEnumeration', { db });
        const tasks = db.prepare('SELECT * FROM durable_tasks ORDER BY task_id').all().map(taskFromRow);
        const checkedEvents = Number(db.prepare('SELECT count(*) AS count FROM durable_events').get().count);
        const tips = [];
        const states = {};
        const reducerStates = {};
        const taskIds = new Set(tasks.map((task) => task.task_id));
        const coordinationTaskIds = db.prepare('SELECT task_id FROM durable_task_coordination ORDER BY task_id').all();
        for (const row of coordinationTaskIds) {
          if (!taskIds.has(row.task_id)) findings.push(finding('COORDINATION_PROJECTION_MISMATCH', row.task_id));
        }
        for (const task of tasks) {
          const rows = rowsForTask(db, task.task_id);
          const checked = verifyTaskChainRows({ task, rows });
          findings.push(...checked.findings);
          if (checked.valid && !coordinationProjectionMatches(db, task.task_id, rows)) {
            findings.push(finding('COORDINATION_PROJECTION_MISMATCH', task.task_id));
          }
          tips.push({ task_id: task.task_id, chain_tip: checked.chainTip });
          states[task.task_id] = checked.reconstructedState;
          reducerStates[task.task_id] = checked.reducerState;
        }
        const valid = findings.length === 0;
        const singleTask = tasks.length === 1 ? tasks[0] : null;
        const singleReducerState = valid && singleTask ? reducerStates[singleTask.task_id] : null;
        store.verifyAnchoredStoreIdentity('before-report');
        result = {
          trusted: valid, valid, checked_tasks: tasks.length, checked_events: checkedEvents,
          findings, chain_tip: valid ? (tasks.length === 1 ? tips[0].chain_tip : tips) : null,
          reconstructed_state: valid ? (tasks.length === 1 ? states[tasks[0].task_id] : states) : null,
          authority_ceiling: valid && singleTask ? singleTask.authority_ceiling : null,
          authority_consumable: false, authority_data_trusted: valid,
          ...workflowStateOutput(singleReducerState, valid && Boolean(singleTask)),
          integrity_check: integrity[0]?.integrity_check ?? null,
          snapshot_consistent: true, snapshot_transaction: 'read_only',
          ...SIDE_EFFECTS,
        };
      }
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      let hookError = null;
      try { invokeTestHook(testHooks, 'beforeVerifyTransactionRollback', { db, result }); }
      catch (error) { hookError = error; }
      store.rollbackTransaction();
      if (!operationError && hookError) throw hookError;
    }
    return result;
  } finally { store.close(); }
}

export function replayTaskState({ storePath, taskId }, { testHooks } = {}) {
  const verification = verifyTaskChain({ storePath, taskId }, { testHooks });
  if (!verification.valid) codedError('TASK_CHAIN_INVALID');
  return verification;
}

export function taskStatus({ storePath, taskId }, { testHooks } = {}) {
  const store = openAnchoredTempStore({ storePath, accessMode: 'readonly', initialize: false, testHooks });
  const { db } = store;
  try {
    assertSchema(db);
    const task = taskFromRow(db.prepare('SELECT * FROM durable_tasks WHERE task_id=?').get(taskId));
    if (!task) codedError('TASK_NOT_FOUND');
    const events = rowsForTask(db, taskId);
    const checked = verifyTaskChainRows({ task, rows: events, stopAfterFirstFatal: true });
    store.verifyAnchoredStoreIdentity('before-report');
    if (!checked.valid) {
      return {
        task: null, event_count: events.length, trusted: false, valid: false,
        reconstructed_state: null, chain_tip: null, findings: checked.findings,
        authority_ceiling: null, authority_consumable: false, authority_data_trusted: false,
        ...workflowStateOutput(null, false),
        next_action: null, error_code: 'TASK_CHAIN_INVALID', ...SIDE_EFFECTS,
      };
    }
    return {
      task, event_count: events.length, trusted: true, valid: true,
      reconstructed_state: checked.reconstructedState, chain_tip: checked.chainTip, findings: [],
      authority_ceiling: task.authority_ceiling, authority_consumable: false, authority_data_trusted: true,
      ...workflowStateOutput(checked.reducerState, true),
      ...SIDE_EFFECTS,
    };
  } finally { store.close(); }
}

const RELEASE_REASONS = new Set(['WORK_COMPLETE', 'PAUSED', 'BLOCKED', 'HANDOFF', 'OPERATOR_REQUEST', 'WORKER_ERROR']);

function coordinationInput(input, { duration = false, fence = false, release = false } = {}) {
  assertPlainObject(input, 'INVALID_FIELD');
  const allowed = new Set(['storePath', 'taskId', 'claimantIdHash', 'workerSessionId', 'idempotencyKey', 'authorityLevel']);
  if (duration) allowed.add('durationSeconds');
  if (fence) { allowed.add('leaseId'); allowed.add('fencingToken'); }
  if (release) allowed.add('reasonCode');
  if (Object.keys(input).some((key) => !allowed.has(key))) codedError('INVALID_FIELD');
  const result = {
    storePath: input.storePath,
    taskId: normalizeStableId(input.taskId, 'taskId'),
    claimantIdHash: assertSha256Hash(input.claimantIdHash, 'claimantIdHash'),
    workerSessionId: boundedText(input.workerSessionId, 'workerSessionId', 68, /^kws_[A-Za-z0-9_-]{8,64}$/),
    idempotencyKey: boundedText(input.idempotencyKey, 'idempotencyKey', 128),
  };
  if (input.authorityLevel !== 'A0') codedError('AUTHORITY_CEILING_EXCEEDED');
  if (duration) {
    if (!Number.isSafeInteger(input.durationSeconds) || input.durationSeconds < 30 || input.durationSeconds > 900) {
      codedError('LEASE_DURATION_INVALID');
    }
    result.durationSeconds = input.durationSeconds;
  }
  if (fence) {
    result.leaseId = boundedText(input.leaseId, 'leaseId', 80, /^klease_[a-f0-9]{32}$/);
    if (!Number.isSafeInteger(input.fencingToken) || input.fencingToken < 1) codedError('FENCING_TOKEN_REQUIRED');
    result.fencingToken = input.fencingToken;
  }
  if (release) {
    if (!RELEASE_REASONS.has(input.reasonCode)) codedError('INVALID_FIELD', 'reasonCode');
    result.reasonCode = input.reasonCode;
  }
  return result;
}

function eventWithPayload(event) {
  return { ...event, payload: parseStoredPayloadJson(event.payload_json).payload };
}

function immutableMaterializedCoordination(row) {
  if (!row) return null;
  return {
    task_id: row.task_id, lease_generation: Number(row.lease_generation), lease_id: row.lease_id,
    claimant_id_hash: row.claimant_id_hash, worker_session_id: row.worker_session_id,
    lease_started_at: row.lease_started_at, lease_expires_at: row.lease_expires_at,
    released_at: row.released_at, release_reason_code: row.release_reason_code,
    last_coordination_event_id: row.last_coordination_event_id,
    last_coordination_event_hash: row.last_coordination_event_hash,
  };
}

function immutableReplayCoordination(taskId, rows) {
  const replayRows = rows.map(eventWithPayload);
  const materializedAsOf = rows.at(-1)?.occurred_at ?? '1970-01-01T00:00:00Z';
  const materializedProjection = projectCoordinationAt(replayRows, materializedAsOf);
  if (materializedProjection.status === 'none') return null;
  return {
    task_id: taskId, lease_generation: materializedProjection.lease_generation,
    lease_id: materializedProjection.lease_id, claimant_id_hash: materializedProjection.claimant_id_hash,
    worker_session_id: materializedProjection.worker_session_id,
    lease_started_at: materializedProjection.lease_started_at,
    lease_expires_at: materializedProjection.lease_expires_at,
    released_at: materializedProjection.released_at,
    release_reason_code: materializedProjection.release_reason,
    last_coordination_event_id: materializedProjection.last_coordination_event_id,
    last_coordination_event_hash: materializedProjection.last_coordination_event_hash,
  };
}

function coordinationProjectionMatches(db, taskId, rows) {
  const expected = immutableReplayCoordination(taskId, rows);
  const actual = immutableMaterializedCoordination(
    db.prepare('SELECT * FROM durable_task_coordination WHERE task_id=?').get(taskId),
  );
  return sameObject(expected, actual);
}

function verifyCoordinationProjection(db, taskId, rows, asOf) {
  if (!coordinationProjectionMatches(db, taskId, rows)) codedError('COORDINATION_PROJECTION_MISMATCH');
  const replayRows = rows.map(eventWithPayload);
  return projectCoordinationAt(replayRows, asOf);
}

function clockOnce(clock) {
  const value = (clock ?? (() => new Date().toISOString()))();
  if (!parseStrictUtc(value)) codedError('INVALID_TIMESTAMP');
  return value;
}

function addUtcSeconds(instant, seconds) {
  const milliseconds = Date.parse(instant);
  if (!Number.isFinite(milliseconds)) codedError('INVALID_TIMESTAMP');
  return new Date(milliseconds + (seconds * 1000)).toISOString();
}

function selectionEvidence(rows, task) {
  let creationEvent = null;
  let eligibilityEvent = null;
  let scoreEvent = null;
  for (const row of rows) {
    const event = eventWithPayload(row);
    if (event.event_type === 'TASK_CREATED') creationEvent = event;
    if (event.event_type === 'CARD_ELIGIBILITY_EVALUATED') eligibilityEvent = event;
    if (event.event_type === 'CARD_SCORED') scoreEvent = event;
  }
  if (!creationEvent || !eligibilityEvent || !scoreEvent) codedError('CLAIM_EVIDENCE_EVENT_MISSING');
  let derived;
  try {
    derived = deriveClaimSelectionBasis({ taskId: task.task_id, creationEvent, eligibilityEvent, scoreEvent });
  } catch (error) {
    if (error?.code === 'CLAIM_EVIDENCE_INELIGIBLE') codedError('CLAIM_EVIDENCE_INELIGIBLE');
    if (error?.code === 'CLAIM_EVIDENCE_SNAPSHOT_MISMATCH') codedError('CLAIM_EVIDENCE_SNAPSHOT_MISMATCH');
    throw error;
  }
  return {
    eligibilityEventId: eligibilityEvent.event_id,
    scoreEventId: scoreEvent.event_id,
    cardSnapshotHash: derived.card_snapshot_hash,
    selectionBasisHash: derived.selection_basis_hash,
  };
}

function coordinationEvent({ task, rows, type, now, claimantIdHash, workerSessionId, fencingToken, leaseId,
  idempotencyKey, payload }) {
  const tail = rows.at(-1);
  if (compareStrictUtc(now, tail.occurred_at) < 0) codedError('EVENT_TIMESTAMP_REGRESSION');
  const safePayload = validatePayload(validateEventPayload(type, 1, payload));
  const sequence = tail.sequence + 1;
  const eventId = `ke_${sha256Hex(canonicalJson({ task_id: task.task_id, idempotency_key: idempotencyKey })).slice(0, 24)}`;
  const withoutHash = {
    event_id: eventId, task_id: task.task_id, sequence, event_type: type, event_version: 1,
    occurred_at: now, actor_type: 'worker', actor_id_hash: claimantIdHash, worker_id: workerSessionId,
    authority_level: 'A0', fencing_token: fencingToken, lease_id: leaseId,
    payload_json: safePayload.payloadJson, payload_hash: safePayload.payloadHash, idempotency_key: idempotencyKey,
    previous_event_id: tail.event_id, previous_event_hash: tail.event_hash, policy_version: COORDINATION_STATE_POLICY_VERSION,
    correlation_id: null, redaction_class: 'internal',
  };
  return { ...withoutHash, event_hash: `sha256:${sha256Hex(canonicalEventHashMaterial(withoutHash))}` };
}

function exactCoordinationRetry(existing, normalized, type) {
  if (!existing || existing.event_type !== type || existing.actor_id_hash !== normalized.claimantIdHash
    || existing.worker_id !== normalized.workerSessionId || existing.authority_level !== 'A0') {
    codedError('EVENT_IDEMPOTENCY_CONFLICT');
  }
  const payload = parseStoredPayloadJson(existing.payload_json).payload;
  if (normalized.durationSeconds !== undefined && payload.requested_duration_seconds !== normalized.durationSeconds) {
    codedError('EVENT_IDEMPOTENCY_CONFLICT');
  }
  if (normalized.leaseId !== undefined && (existing.lease_id !== normalized.leaseId
    || existing.fencing_token !== normalized.fencingToken)) codedError('EVENT_IDEMPOTENCY_CONFLICT');
  if (normalized.reasonCode !== undefined && payload.reason_code !== normalized.reasonCode) codedError('EVENT_IDEMPOTENCY_CONFLICT');
  return { event: existing, payload };
}

function currentOwnerOrError(projection, normalized, now) {
  if (projection.status === 'released') codedError('LEASE_NOT_ACTIVE');
  if (projection.status === 'expired' || compareStrictUtc(now, projection.lease_expires_at) >= 0) codedError('LEASE_EXPIRED');
  if (projection.status !== 'active') codedError('LEASE_NOT_ACTIVE');
  if (projection.lease_id !== normalized.leaseId) codedError('LEASE_ID_MISMATCH');
  if (projection.claimant_id_hash !== normalized.claimantIdHash || projection.worker_session_id !== normalized.workerSessionId) {
    codedError('LEASE_OWNER_MISMATCH');
  }
  if (projection.fencing_token !== normalized.fencingToken) codedError('STALE_FENCING_TOKEN');
}

function mapCoordinationError(error) {
  if (error instanceof TrustedDomainError) throw error;
  const nativeCode = typeof error?.code === 'string' ? error.code : '';
  if (/^(?:ERR_SQLITE_)?(?:BUSY|LOCKED)(?:_|$)/.test(nativeCode)
    || /(?:database|sqlite).*(?:busy|locked)|(?:busy|locked).*(?:database|sqlite)/i.test(String(error?.message ?? ''))) {
    codedError('STORE_BUSY');
  }
  codedError('COORDINATION_STORE_FAILED');
}

export function claimTaskLease(input, { testHooks, clock } = {}) {
  const normalized = coordinationInput(input, { duration: true });
  let store;
  try {
    store = openAnchoredTempStore({ storePath: normalized.storePath, accessMode: 'readwrite', initialize: false, testHooks });
    const { db } = store;
    store.beginTransaction();
    try {
      store.verifyAnchoredStoreIdentity('coordination-transaction');
      assertSchema(db);
      const task = taskFromRow(db.prepare('SELECT * FROM durable_tasks WHERE task_id=?').get(normalized.taskId));
      if (!task) codedError('TASK_NOT_FOUND');
      const rows = rowsForTask(db, task.task_id);
      const checked = verifyTaskChainRows({ task, rows, stopAfterFirstFatal: true });
      if (!checked.valid) codedError('EXISTING_EVENT_CHAIN_INVALID');
      verifyCoordinationProjection(db, task.task_id, rows, rows.at(-1).occurred_at);
      const existing = eventFromRow(db.prepare('SELECT * FROM durable_events WHERE task_id=? AND idempotency_key=?').get(task.task_id, normalized.idempotencyKey));
      if (existing) {
        const retry = exactCoordinationRetry(existing, normalized, 'CARD_CLAIMED');
        store.commitTransaction();
        return { claimed: false, task_id: task.task_id, lease_id: existing.lease_id,
          fencing_token: existing.fencing_token, lease_started_at: retry.payload.lease_started_at,
          lease_expires_at: retry.payload.lease_expires_at, event_id: existing.event_id, ...SIDE_EFFECTS };
      }
      const now = clockOnce(clock);
      const prior = verifyCoordinationProjection(db, task.task_id, rows, now);
      if (!['triaged', 'researching', 'planning'].includes(checked.reconstructedState)
        || checked.reducerState.pending_approval || checked.reducerState.suspension || checked.reducerState.terminal) {
        codedError('CLAIM_STATE_INVALID');
      }
      if (prior.status === 'active') codedError('CLAIM_CONFLICT_ACTIVE_LEASE');
      const evidence = selectionEvidence(rows, task);
      const generation = (prior.lease_generation ?? 0) + 1;
      if (!Number.isSafeInteger(generation)) codedError('FENCING_TOKEN_EXHAUSTED');
      const leaseId = `klease_${sha256Hex(canonicalJson({ domain: COORDINATION_STATE_POLICY_VERSION, task_id: task.task_id,
        generation, claimant_id_hash: normalized.claimantIdHash, worker_session_id: normalized.workerSessionId,
        claim_request_identity: normalized.idempotencyKey, selection_basis_hash: evidence.selectionBasisHash })).slice(0, 32)}`;
      const expires = addUtcSeconds(now, normalized.durationSeconds);
      const reason = prior.status === 'none' ? 'INITIAL' : prior.status === 'released' ? 'REACQUIRED_AFTER_RELEASE' : 'EXPIRED_TAKEOVER';
      const event = coordinationEvent({ task, rows, type: 'CARD_CLAIMED', now, claimantIdHash: normalized.claimantIdHash,
        workerSessionId: normalized.workerSessionId, fencingToken: generation, leaseId,
        idempotencyKey: normalized.idempotencyKey, payload: {
          coordination_policy_version: COORDINATION_STATE_POLICY_VERSION, lease_id: leaseId,
          claimant_id_hash: normalized.claimantIdHash, worker_session_id: normalized.workerSessionId,
          lease_started_at: now, lease_expires_at: expires, requested_duration_seconds: normalized.durationSeconds,
          claim_reason: reason, eligibility_event_id: evidence.eligibilityEventId, score_event_id: evidence.scoreEventId,
          card_snapshot_hash: evidence.cardSnapshotHash, selection_basis_hash: evidence.selectionBasisHash } });
      insertEventRow(db, event);
      invokeTestHook(testHooks, 'afterCoordinationEventInserted', { db, event });
      db.prepare(`INSERT INTO durable_task_coordination (task_id, lease_generation, lease_id, claimant_id_hash,
        worker_session_id, lease_started_at, lease_expires_at, released_at, release_reason_code,
        last_coordination_event_id, last_coordination_event_hash) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET lease_generation=excluded.lease_generation, lease_id=excluded.lease_id,
        claimant_id_hash=excluded.claimant_id_hash, worker_session_id=excluded.worker_session_id,
        lease_started_at=excluded.lease_started_at, lease_expires_at=excluded.lease_expires_at,
        released_at=NULL, release_reason_code=NULL, last_coordination_event_id=excluded.last_coordination_event_id,
        last_coordination_event_hash=excluded.last_coordination_event_hash`).run(task.task_id, generation, leaseId,
        normalized.claimantIdHash, normalized.workerSessionId, now, expires, event.event_id, event.event_hash);
      invokeTestHook(testHooks, 'afterCoordinationMaterialized', { db, event });
      verifyCoordinationProjection(db, task.task_id, [...rows, event], now);
      store.commitTransaction();
      return { claimed: true, task_id: task.task_id, lease_id: leaseId, fencing_token: generation,
        lease_started_at: now, lease_expires_at: expires, event_id: event.event_id,
        ...SIDE_EFFECTS, temp_store_write: true };
    } catch (error) { store.rollbackTransaction(); throw error; }
  } catch (error) { mapCoordinationError(error); }
  finally { store?.close(); }
}

function mutateCurrentLease(input, options, type) {
  const normalized = coordinationInput(input, { duration: type === 'LEASE_RENEWED', fence: true, release: type === 'LEASE_RELEASED' });
  let store;
  try {
    store = openAnchoredTempStore({ storePath: normalized.storePath, accessMode: 'readwrite', initialize: false, testHooks: options.testHooks });
    const { db } = store;
    store.beginTransaction();
    try {
      store.verifyAnchoredStoreIdentity('coordination-transaction');
      assertSchema(db);
      const task = taskFromRow(db.prepare('SELECT * FROM durable_tasks WHERE task_id=?').get(normalized.taskId));
      if (!task) codedError('TASK_NOT_FOUND');
      const rows = rowsForTask(db, task.task_id);
      const checked = verifyTaskChainRows({ task, rows, stopAfterFirstFatal: true });
      if (!checked.valid) codedError('EXISTING_EVENT_CHAIN_INVALID');
      verifyCoordinationProjection(db, task.task_id, rows, rows.at(-1).occurred_at);
      const existing = eventFromRow(db.prepare('SELECT * FROM durable_events WHERE task_id=? AND idempotency_key=?').get(task.task_id, normalized.idempotencyKey));
      if (existing) {
        const retry = exactCoordinationRetry(existing, normalized, type);
        store.commitTransaction();
        return { changed: false, renewed: type === 'LEASE_RENEWED' ? false : undefined,
          released: type === 'LEASE_RELEASED' ? false : undefined, task_id: task.task_id, lease_id: existing.lease_id,
          fencing_token: existing.fencing_token, lease_expires_at: retry.payload.lease_expires_at ?? null,
          released_at: retry.payload.released_at ?? null, event_id: existing.event_id, ...SIDE_EFFECTS };
      }
      const now = clockOnce(options.clock);
      const projection = verifyCoordinationProjection(db, task.task_id, rows, now);
      currentOwnerOrError(projection, normalized, now);
      let payload;
      let expires = projection.lease_expires_at;
      if (type === 'LEASE_RENEWED') {
        expires = addUtcSeconds(now, normalized.durationSeconds);
        if (compareStrictUtc(expires, projection.lease_expires_at) <= 0) codedError('LEASE_RENEWAL_NOT_EXTENDED');
        payload = { coordination_policy_version: COORDINATION_STATE_POLICY_VERSION,
          lease_id: normalized.leaseId, previous_expires_at: projection.lease_expires_at,
          renewed_at: now, lease_expires_at: expires, requested_duration_seconds: normalized.durationSeconds };
      } else payload = { coordination_policy_version: COORDINATION_STATE_POLICY_VERSION,
        lease_id: normalized.leaseId, released_at: now, reason_code: normalized.reasonCode };
      const event = coordinationEvent({ task, rows, type, now, claimantIdHash: normalized.claimantIdHash,
        workerSessionId: normalized.workerSessionId, fencingToken: normalized.fencingToken,
        leaseId: normalized.leaseId, idempotencyKey: normalized.idempotencyKey, payload });
      insertEventRow(db, event);
      invokeTestHook(options.testHooks, 'afterCoordinationEventInserted', { db, event });
      let coordinationUpdate;
      if (type === 'LEASE_RENEWED') {
        coordinationUpdate = db.prepare(`UPDATE durable_task_coordination SET lease_expires_at=?, last_coordination_event_id=?,
          last_coordination_event_hash=? WHERE task_id=? AND lease_id=? AND lease_generation=?`)
          .run(expires, event.event_id, event.event_hash, task.task_id, normalized.leaseId, normalized.fencingToken);
      } else {
        coordinationUpdate = db.prepare(`UPDATE durable_task_coordination SET released_at=?, release_reason_code=?, last_coordination_event_id=?,
          last_coordination_event_hash=? WHERE task_id=? AND lease_id=? AND lease_generation=?`)
          .run(now, normalized.reasonCode, event.event_id, event.event_hash, task.task_id,
            normalized.leaseId, normalized.fencingToken);
      }
      if (Number(coordinationUpdate.changes) !== 1) codedError('STALE_FENCING_TOKEN');
      invokeTestHook(options.testHooks, 'afterCoordinationMaterialized', { db, event });
      verifyCoordinationProjection(db, task.task_id, [...rows, event], now);
      store.commitTransaction();
      return { changed: true, renewed: type === 'LEASE_RENEWED' ? true : undefined,
        released: type === 'LEASE_RELEASED' ? true : undefined, task_id: task.task_id,
        lease_id: normalized.leaseId, fencing_token: normalized.fencingToken,
        lease_expires_at: type === 'LEASE_RENEWED' ? expires : null,
        released_at: type === 'LEASE_RELEASED' ? now : null, event_id: event.event_id,
        ...SIDE_EFFECTS, temp_store_write: true };
    } catch (error) { store.rollbackTransaction(); throw error; }
  } catch (error) { mapCoordinationError(error); }
  finally { store?.close(); }
}

export function renewTaskLease(input, options = {}) { return mutateCurrentLease(input, options, 'LEASE_RENEWED'); }
export function releaseTaskLease(input, options = {}) { return mutateCurrentLease(input, options, 'LEASE_RELEASED'); }

export function readCurrentTaskLease(input, { testHooks, clock } = {}) {
  assertPlainObject(input, 'INVALID_FIELD');
  if (Object.keys(input).some((key) => !['storePath', 'taskId', 'asOf'].includes(key))) codedError('INVALID_FIELD');
  const { storePath, taskId, asOf } = input;
  const normalizedTaskId = normalizeStableId(taskId, 'taskId');
  const diagnosticAt = asOf ?? clockOnce(clock);
  if (!parseStrictUtc(diagnosticAt)) codedError('INVALID_TIMESTAMP');
  const store = openAnchoredTempStore({ storePath, accessMode: 'readonly', initialize: false, testHooks });
  const { db } = store;
  try {
    store.beginReadTransaction();
    try {
      assertSchema(db);
      const task = taskFromRow(db.prepare('SELECT * FROM durable_tasks WHERE task_id=?').get(normalizedTaskId));
      if (!task) codedError('TASK_NOT_FOUND');
      const rows = rowsForTask(db, task.task_id);
      const checked = verifyTaskChainRows({ task, rows, stopAfterFirstFatal: true });
      if (!checked.valid) codedError('EXISTING_EVENT_CHAIN_INVALID');
      const projection = verifyCoordinationProjection(db, task.task_id, rows, diagnosticAt);
      store.rollbackTransaction();
      return Object.freeze({ task_id: task.task_id, as_of: diagnosticAt, ...projection, ...SIDE_EFFECTS });
    } catch (error) { store.rollbackTransaction(); throw error; }
  } finally { store.close(); }
}

export function assertCurrentTaskFence(input, { testHooks, clock } = {}) {
  assertPlainObject(input, 'INVALID_FIELD');
  if (Object.keys(input).some((key) => !['storePath', 'taskId', 'leaseId', 'workerSessionId', 'fencingToken', 'asOf'].includes(key))) {
    codedError('INVALID_FIELD');
  }
  const taskId = normalizeStableId(input.taskId, 'taskId');
  const leaseId = boundedText(input.leaseId, 'leaseId', 80, /^klease_[a-f0-9]{32}$/);
  const workerSessionId = boundedText(input.workerSessionId, 'workerSessionId', 68, /^kws_[A-Za-z0-9_-]{8,64}$/);
  if (!Number.isSafeInteger(input.fencingToken) || input.fencingToken < 1) codedError('FENCING_TOKEN_REQUIRED');
  const lease = readCurrentTaskLease({ storePath: input.storePath, taskId, asOf: input.asOf }, { testHooks, clock });
  if (lease.status === 'released') codedError('LEASE_NOT_ACTIVE');
  if (lease.status === 'expired') codedError('LEASE_EXPIRED');
  if (lease.status !== 'active') codedError('LEASE_NOT_ACTIVE');
  if (lease.lease_id !== leaseId) codedError('LEASE_ID_MISMATCH');
  if (lease.worker_session_id !== workerSessionId) codedError('LEASE_OWNER_MISMATCH');
  if (lease.fencing_token !== input.fencingToken) codedError('STALE_FENCING_TOKEN');
  return Object.freeze({ valid: true, task_id: taskId, lease_id: leaseId, worker_session_id: workerSessionId,
    fencing_token: input.fencingToken, ownership_only: true, execution_authority_granted: false, ...SIDE_EFFECTS });
}

function parseCli(argv) {
  if (argv.length === 0 || argv[0].startsWith('-')) codedError('UNKNOWN_COMMAND');
  const command = argv[0];
  const supported = new Set(['init', 'create-task', 'append-event', 'status', 'verify', 'replay', 'projection-preview']);
  if (!supported.has(command)) codedError('UNKNOWN_COMMAND');
  const args = { command, json: false, tempStore: false, allowTempWrite: false };
  const valueFor = (flag, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith('-')) codedError('FLAG_VALUE_REQUIRED', flag);
    return value;
  };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--json') args.json = true;
    else if (flag === '--temp-store') args.tempStore = true;
    else if (flag === '--allow-temp-write') args.allowTempWrite = true;
    else if (flag === '--store') args.store = valueFor(flag, index++);
    else if (flag === '--task-id') args.taskId = valueFor(flag, index++);
    else codedError('UNKNOWN_FLAG');
  }
  if (!args.json || !args.tempStore || !args.store) codedError('REQUIRED_SAFETY_GATE_MISSING');
  const write = new Set(['init', 'create-task', 'append-event']).has(command);
  if (write && !args.allowTempWrite) codedError('TEMP_WRITE_GATE_REQUIRED');
  if (!write && args.allowTempWrite) codedError('UNKNOWN_FLAG');
  if (['status', 'replay'].includes(command) && !args.taskId) codedError('INVALID_FIELD', 'taskId');
  if (!['status', 'replay', 'verify'].includes(command) && args.taskId) codedError('UNKNOWN_FLAG');
  validateTempStorePath(args.store, { mustExist: command !== 'init', allowCreateDirectory: command === 'init' });
  return args;
}

function safeError(error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'KANBAN_AUTONOMY_STORE_FAILED';
  return code;
}

async function readStdinText({ required }) {
  if (!required && process.stdin.isTTY) return '';
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = JSON_LIMITS.MAX_JSON_INPUT_BYTES + 1 - bytes;
    if (remaining > 0) chunks.push(buffer.subarray(0, remaining));
    bytes += buffer.length;
    if (bytes > JSON_LIMITS.MAX_JSON_INPUT_BYTES) codedError('JSON_INPUT_TOO_LARGE');
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { codedError('INVALID_JSON'); }
  if (required && !text.trim()) codedError('INPUT_REQUIRED');
  return text;
}

const CLI_CONTROL_FIELDS = new Set([
  'store', 'storePath', 'store_path', 'tempStore', 'temp_store', 'allowTempWrite', 'allow_temp_write',
  'json', 'command', 'output', 'outputFile', 'output_file', 'inputFile', 'input_file',
]);

const CLI_INPUT_FIELDS = Object.freeze({
  'create-task': Object.freeze([
    'boardSlug', 'kanbanCardId', 'cardSnapshotHash', 'sourceIdentityHash', 'policyVersion',
    'authorityCeiling', 'idempotencyKey', 'createdAt',
  ]),
  'append-event': Object.freeze([
    'taskId', 'eventType', 'eventVersion', 'occurredAt', 'actorType', 'actorIdHash', 'workerId',
    'authorityLevel', 'fencingToken', 'payload', 'idempotencyKey', 'policyVersion', 'correlationId', 'redactionClass',
  ]),
  'projection-preview': Object.freeze(['taskState', 'currentCardStatus']),
});

function validateCliInputEnvelope(command, value) {
  const keys = Object.keys(value);
  if (keys.some((key) => CLI_CONTROL_FIELDS.has(key))) codedError('CLI_CONTROL_FIELD_FORBIDDEN');
  const allowed = new Set(CLI_INPUT_FIELDS[command] ?? []);
  if (keys.some((key) => !allowed.has(key))) codedError('CLI_INPUT_FIELD_UNSUPPORTED');
  return value;
}

async function readStdinJson(command) {
  const text = await readStdinText({ required: true });
  const value = parseStrictBoundedJson(text);
  assertPlainObject(value, 'PAYLOAD_ROOT_MUST_BE_OBJECT');
  return validateCliInputEnvelope(command, value);
}

async function rejectUnexpectedStdin() {
  const text = await readStdinText({ required: false });
  if (text.trim()) codedError('CLI_INPUT_FIELD_UNSUPPORTED');
}

function assertStoreCompatible({ storePath }) {
  const store = openAnchoredTempStore({ storePath, accessMode: 'readonly', initialize: false });
  try {
    assertSchema(store.db);
    store.verifyAnchoredStoreIdentity('before-report');
  } finally { store.close(); }
}

function taskInputFromCli(input, storePath) {
  return {
    boardSlug: input.boardSlug, kanbanCardId: input.kanbanCardId, cardSnapshotHash: input.cardSnapshotHash,
    sourceIdentityHash: input.sourceIdentityHash, policyVersion: input.policyVersion,
    authorityCeiling: input.authorityCeiling, idempotencyKey: input.idempotencyKey,
    createdAt: input.createdAt, storePath,
  };
}

function eventInputFromCli(input, storePath) {
  return {
    taskId: input.taskId, eventType: input.eventType, eventVersion: input.eventVersion,
    occurredAt: input.occurredAt, actorType: input.actorType, actorIdHash: input.actorIdHash,
    workerId: input.workerId, authorityLevel: input.authorityLevel, fencingToken: input.fencingToken,
    payload: input.payload, idempotencyKey: input.idempotencyKey, policyVersion: input.policyVersion,
    correlationId: input.correlationId, redactionClass: input.redactionClass, storePath,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  try {
    const args = parseCli(argv);
    const takesInput = new Set(['create-task', 'append-event', 'projection-preview']).has(args.command);
    const input = takesInput ? await readStdinJson(args.command) : null;
    if (!takesInput) await rejectUnexpectedStdin();
    let result;
    if (args.command === 'init') result = initStore({ storePath: args.store });
    else if (args.command === 'create-task') result = createTask(taskInputFromCli(input, args.store));
    else if (args.command === 'append-event') result = appendEvent(eventInputFromCli(input, args.store));
    else if (args.command === 'status') result = taskStatus({ storePath: args.store, taskId: args.taskId });
    else if (args.command === 'verify') result = args.taskId ? verifyTaskChain({ storePath: args.store, taskId: args.taskId }) : verifyStore({ storePath: args.store });
    else if (args.command === 'replay') result = replayTaskState({ storePath: args.store, taskId: args.taskId });
    else {
      assertStoreCompatible({ storePath: args.store });
      result = { ...projectTaskStateToKanban(input), ...SIDE_EFFECTS };
    }
    if (args.command === 'status' && result?.valid === false) codedError('TASK_CHAIN_INVALID');
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  } catch (error) {
    process.stderr.write(`${safeError(error)}\n`);
    process.exitCode = 1;
    return null;
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) await runCli();

export { projectTaskStateToKanban };
