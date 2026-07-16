import { afterEach, describe, expect, test, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  chmodSync, closeSync, constants as fsConstants, copyFileSync, existsSync, fstatSync, linkSync, lstatSync,
  mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  STORE_DATABASE_NAME, STORE_SCHEMA_VERSION, appendEvent, buildCanonicalTaskCreatedEvent, canonicalEventHashMaterial,
  createTask, initStore, replayTaskState, normalizeSensitiveKeyName, parseStoredPayloadJson, taskStatus,
  validatePayload, validateTempStorePath, verifyStore, verifyTaskChain, verifyTaskChainRows,
} from './kanban-autonomy-store.mjs';
import {
  ACTIVE_EVENT_TYPES, EVENT_PAYLOAD_POLICIES, STATE_POLICY_VERSION, SUPPORTED_EVENT_VERSIONS, canonicalJson, sha256Hex,
  validateEventPayload,
} from './kanban-autonomy-state.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const EVENT_PAYLOADS = Object.freeze({
  TASK_CREATED: {
    task_id: `kt_${'a'.repeat(24)}`, board_slug_hash: HASH_A, kanban_card_id_hash: HASH_B,
    source_identity_hash: HASH_B, initial_card_snapshot_hash: HASH_A, authority_ceiling: 'A1',
    creation_idempotency_key_hash: HASH_A, policy_version: 'fixture-policy.v1',
  },
  CARD_ELIGIBILITY_EVALUATED: {
    card_snapshot_hash: HASH_A, eligibility_policy_version: 'fixture-eligibility.v1', eligible: true, reason_codes: [],
  },
  CARD_SCORED: { card_snapshot_hash: HASH_A, scoring_policy_version: 'fixture-scoring.v1', score_basis_points: 7200 },
  RESEARCH_STARTED: { research_run_id_hash: HASH_A, research_policy_version: 'fixture-research.v1' },
  RESEARCH_COMPLETED: { research_run_id_hash: HASH_A, report_hash: HASH_B, outcome: 'completed' },
  PLAN_CREATED: { plan_hash: HASH_A, plan_version: 'fixture-plan.v1', next_safe_action: 'request_approval' },
  APPROVAL_REQUESTED: {
    approval_id_hash: HASH_B, approval_status: 'requested', requested_authority: 'A1', requested_action: 'build_fixture',
  },
  APPROVAL_GRANTED: { approval_id_hash: HASH_B, approval_status: 'granted' },
  APPROVAL_REJECTED: { approval_id_hash: HASH_B, approval_status: 'rejected' },
  TASK_BLOCKED: { blocker_code: 'FIXTURE_BLOCKED' },
  TASK_PAUSED: { pause_reason_code: 'FIXTURE_PAUSED' },
  TASK_RESUMED: { resume_reason_code: 'FIXTURE_RESUMED' },
  TASK_COMPLETED: { completion_outcome: 'completed' },
});
const createdDirectories = [];

function tempStore(label = 'test') {
  const directory = mkdtempSync(`/tmp/hermes-kan-autonomy-${label}-`);
  chmodSync(directory, 0o700);
  createdDirectories.push(directory);
  return path.join(directory, STORE_DATABASE_NAME);
}

function baseTask(storePath, overrides = {}) {
  return {
    storePath, boardSlug: 'fixture-board', kanbanCardId: 'fixture-card', cardSnapshotHash: HASH_A,
    sourceIdentityHash: HASH_B, policyVersion: 'fixture-policy.v1', authorityCeiling: 'A1',
    idempotencyKey: 'task-create-1', createdAt: '2026-07-11T00:00:00Z', ...overrides,
  };
}

function eventInput(storePath, taskId, eventType, index, payload = undefined, overrides = {}) {
  const semanticPayload = EVENT_PAYLOADS[eventType]
    ? { ...EVENT_PAYLOADS[eventType], ...(payload ?? {}) }
    : (payload ?? {});
  return {
    storePath, taskId, eventType, eventVersion: 1, occurredAt: `2026-07-11T00:00:${String(index).padStart(2, '0')}Z`,
    actorType: 'fixture', actorIdHash: HASH_A, workerId: 'fixture-worker', authorityLevel: 'A1',
    fencingToken: null, payload: semanticPayload, idempotencyKey: `event-${index}`, policyVersion: 'fixture-policy.v1',
    correlationId: 'fixture-correlation', redactionClass: 'internal', ...overrides,
  };
}

function eventHashEnvelope(payload = EVENT_PAYLOADS.CARD_SCORED, overrides = {}) {
  const validated = validatePayload(payload);
  return {
    event_id: `ke_${'a'.repeat(24)}`, task_id: `kt_${'b'.repeat(24)}`, sequence: 2,
    event_type: 'CARD_SCORED', event_version: 1, occurred_at: '2026-07-11T00:00:01Z',
    actor_type: 'fixture', actor_id_hash: HASH_A, worker_id: 'fixture-worker', authority_level: 'A1',
    fencing_token: null, payload_json: validated.payloadJson, payload_hash: validated.payloadHash,
    idempotency_key: 'event-envelope-1', previous_event_id: null, previous_event_hash: null,
    policy_version: 'fixture-policy.v1', correlation_id: 'fixture-correlation', redaction_class: 'internal',
    ...overrides,
  };
}

function initializedTask(label = 'flow', overrides = {}) {
  const storePath = tempStore(label);
  initStore({ storePath });
  const result = createTask(baseTask(storePath, overrides));
  return { storePath, taskId: result.task.task_id, task: result.task, event: result.event, result };
}

function storeRows(storePath) {
  const db = new DatabaseSync(storePath, { readOnly: true });
  try {
    return {
      tasks: db.prepare('SELECT * FROM durable_tasks ORDER BY task_id').all(),
      events: db.prepare('SELECT * FROM durable_events ORDER BY task_id, sequence').all(),
    };
  } finally { db.close(); }
}

function installReplacementDirectory(directory) {
  const heldDirectory = `${directory}-held`;
  renameSync(directory, heldDirectory);
  createdDirectories.push(heldDirectory);
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
  return heldDirectory;
}

function replaceDatabaseEntry(context, replacementPath, kind = 'copy') {
  const heldPath = `${context.anchoredStorePath}.held`;
  renameSync(context.anchoredStorePath, heldPath);
  if (kind === 'copy') {
    copyFileSync(replacementPath, context.anchoredStorePath);
    chmodSync(context.anchoredStorePath, 0o600);
  } else if (kind === 'symlink') symlinkSync(replacementPath, context.anchoredStorePath);
  else if (kind === 'hardlink') linkSync(heldPath, context.anchoredStorePath);
  return heldPath;
}

function expectDescriptorsClosed(descriptors) {
  for (const descriptor of descriptors) expect(() => fstatSync(descriptor)).toThrow();
}

function descriptorCapture(target) {
  return (context) => target.push(context.directoryDescriptor, context.databaseDescriptor);
}

function appendNormalSeven(storePath, taskId) {
  const db = new DatabaseSync(storePath, { readOnly: true });
  const initial = db.prepare('SELECT * FROM durable_events WHERE task_id=? AND sequence=1').get(taskId);
  db.close();
  const items = [
    ['CARD_ELIGIBILITY_EVALUATED', EVENT_PAYLOADS.CARD_ELIGIBILITY_EVALUATED],
    ['CARD_SCORED', EVENT_PAYLOADS.CARD_SCORED],
    ['RESEARCH_STARTED', EVENT_PAYLOADS.RESEARCH_STARTED],
    ['RESEARCH_COMPLETED', EVENT_PAYLOADS.RESEARCH_COMPLETED],
    ['PLAN_CREATED', EVENT_PAYLOADS.PLAN_CREATED],
    ['APPROVAL_REQUESTED', EVENT_PAYLOADS.APPROVAL_REQUESTED],
  ];
  return [{ appended: true, event: initial }, ...items.map(([type, payload], index) => appendEvent(eventInput(storePath, taskId, type, index + 2, payload)))];
}

const EVENT_SECURITY_FIELDS = [
  'event_id', 'task_id', 'sequence', 'event_type', 'event_version', 'occurred_at', 'actor_type', 'actor_id_hash',
  'worker_id', 'authority_level', 'fencing_token', 'payload_json', 'payload_hash', 'idempotency_key',
  'previous_event_id', 'previous_event_hash', 'policy_version', 'correlation_id', 'redaction_class',
];

function attackerRehashEvent(row) {
  const envelope = Object.fromEntries(EVENT_SECURITY_FIELDS.map((key) => [key, row[key]]));
  return `sha256:${sha256Hex(canonicalJson(envelope))}`;
}

function rewriteAndRehashTaskChain(db, taskId, mutate) {
  const rows = db.prepare('SELECT * FROM durable_events WHERE task_id=? ORDER BY sequence').all(taskId);
  mutate(rows);
  for (let index = 0; index < rows.length; index += 1) {
    rows[index].previous_event_id = index === 0 ? rows[index].previous_event_id : rows[index - 1].event_id;
    rows[index].previous_event_hash = index === 0 ? rows[index].previous_event_hash : rows[index - 1].event_hash;
    rows[index].event_hash = attackerRehashEvent(rows[index]);
    db.prepare(`UPDATE durable_events SET
      event_id=?, event_type=?, event_version=?, occurred_at=?, actor_type=?, actor_id_hash=?, worker_id=?,
      authority_level=?, fencing_token=?, payload_json=?, payload_hash=?, idempotency_key=?, previous_event_id=?,
      previous_event_hash=?, event_hash=?, policy_version=?, correlation_id=?, redaction_class=?
      WHERE task_id=? AND sequence=?`).run(
      rows[index].event_id, rows[index].event_type, rows[index].event_version, rows[index].occurred_at,
      rows[index].actor_type, rows[index].actor_id_hash, rows[index].worker_id, rows[index].authority_level,
      rows[index].fencing_token, rows[index].payload_json, rows[index].payload_hash, rows[index].idempotency_key,
      rows[index].previous_event_id, rows[index].previous_event_hash, rows[index].event_hash,
      rows[index].policy_version, rows[index].correlation_id, rows[index].redaction_class,
      taskId, rows[index].sequence,
    );
  }
}

function insertRawTask(db, row) {
  db.prepare(`INSERT INTO durable_tasks (
    task_id, board_slug, kanban_card_id, source_identity_hash, initial_card_snapshot_hash,
    policy_version, created_at, authority_ceiling, creation_idempotency_key
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.task_id, row.board_slug, row.kanban_card_id, row.source_identity_hash, row.initial_card_snapshot_hash,
    row.policy_version, row.created_at, row.authority_ceiling, row.creation_idempotency_key,
  );
}

function insertRawEvent(db, row) {
  db.prepare(`INSERT INTO durable_events (
    event_id, task_id, sequence, event_type, event_version, occurred_at, actor_type, actor_id_hash,
    worker_id, authority_level, fencing_token, payload_json, payload_hash, idempotency_key,
    previous_event_id, previous_event_hash, event_hash, policy_version, correlation_id, redaction_class
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    ...EVENT_SECURITY_FIELDS.slice(0, 16).map((key) => row[key]),
    row.event_hash,
    ...EVENT_SECURITY_FIELDS.slice(16).map((key) => row[key]),
  );
}

function runCliAsync(bin, args, input) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin.pathname, ...args], { env: { ...process.env, NODE_NO_WARNINGS: '1' } });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('strict temporary-store boundary', () => {
  test.each([
    '/root/.hermes/kanban-autonomy.db',
    '/root/project/kanban-autonomy.db',
    './kanban-autonomy.db',
    '/tmp/hermes-kan-autonomy-safe-abc123/../escape/kanban-autonomy.db',
    '/tmp/arbitrary/kanban-autonomy.db',
    '/tmp/hermes-kan-autonomy-safe-abc123/wrong.db',
  ])('rejects unsafe path %s with stable refusal', (candidate) => {
    expect(() => validateTempStorePath(candidate)).toThrow(/PRODUCTION_DURABLE_STORE_DISABLED/);
  });
  test('creates only the exact direct /tmp directory and database with restrictive modes', () => {
    const storePath = tempStore('modes');
    const result = initStore({ storePath });
    expect(result.created).toBe(true);
    expect(lstatSync(path.dirname(storePath)).mode & 0o777).toBe(0o700);
    expect(lstatSync(storePath).mode & 0o777).toBe(0o600);
    expect(lstatSync(storePath).nlink).toBe(1);
  });
  test('can generate a missing direct temp directory at mode 0700', () => {
    const parent = `/tmp/hermes-kan-autonomy-generated-${process.pid}-abcdef`;
    createdDirectories.push(parent);
    const storePath = path.join(parent, STORE_DATABASE_NAME);
    initStore({ storePath });
    expect(lstatSync(parent).mode & 0o777).toBe(0o700);
    expect(lstatSync(storePath).mode & 0o777).toBe(0o600);
  });
  test('does not chmod a directory that appears during an EEXIST race', async () => {
    const parent = `/tmp/hermes-kan-autonomy-existing-race-${process.pid}-abcdef`;
    const storePath = path.join(parent, STORE_DATABASE_NAME);
    createdDirectories.push(parent);
    const actualFs = await vi.importActual('node:fs');
    vi.resetModules();
    vi.doMock('node:fs', () => ({
      ...actualFs,
      existsSync(candidate) {
        if (candidate === parent) return false;
        return actualFs.existsSync(candidate);
      },
      mkdirSync(candidate, options) {
        if (candidate !== parent) return actualFs.mkdirSync(candidate, options);
        actualFs.mkdirSync(parent, { mode: 0o700 });
        actualFs.chmodSync(parent, 0o755);
        const error = new Error('simulated EEXIST race');
        error.code = 'EEXIST';
        throw error;
      },
    }));
    try {
      const racedModule = await import('./kanban-autonomy-store.mjs?eexist-race');
      expect(() => racedModule.validateTempStorePath(storePath, { allowCreateDirectory: true })).toThrow(/PRODUCTION_DURABLE_STORE_DISABLED/);
      expect(lstatSync(parent).mode & 0o777).toBe(0o755);
    } finally {
      vi.doUnmock('node:fs');
      vi.resetModules();
    }
  });
  test('rejects a symlinked database and symlinked directory', () => {
    const original = tempStore('symlink-origin'); initStore({ storePath: original });
    const linkDirectory = mkdtempSync('/tmp/hermes-kan-autonomy-symlink-db-'); chmodSync(linkDirectory, 0o700); createdDirectories.push(linkDirectory);
    const linkPath = path.join(linkDirectory, STORE_DATABASE_NAME); symlinkSync(original, linkPath);
    expect(() => validateTempStorePath(linkPath, { mustExist: true })).toThrow(/PRODUCTION_DURABLE_STORE_DISABLED/);
    const realDirectory = mkdtempSync('/tmp/hermes-kan-autonomy-real-dir-'); chmodSync(realDirectory, 0o700); createdDirectories.push(realDirectory);
    const directoryLink = `/tmp/hermes-kan-autonomy-dir-link-${process.pid}-abcdef`; symlinkSync(realDirectory, directoryLink); createdDirectories.push(directoryLink);
    expect(() => validateTempStorePath(path.join(directoryLink, STORE_DATABASE_NAME), { allowCreateDirectory: true })).toThrow(/PRODUCTION_DURABLE_STORE_DISABLED/);
  });
  test('rejects a hard-linked existing database', () => {
    const original = tempStore('hard-origin'); initStore({ storePath: original });
    const hardDirectory = mkdtempSync('/tmp/hermes-kan-autonomy-hard-copy-'); chmodSync(hardDirectory, 0o700); createdDirectories.push(hardDirectory);
    const hardPath = path.join(hardDirectory, STORE_DATABASE_NAME); linkSync(original, hardPath);
    expect(() => validateTempStorePath(hardPath, { mustExist: true })).toThrow(/PRODUCTION_DURABLE_STORE_DISABLED/);
  });
  test('read operations require an explicit existing store and never create one', () => {
    const parent = `/tmp/hermes-kan-autonomy-read-missing-${process.pid}-abcdef`; createdDirectories.push(parent);
    const missing = path.join(parent, STORE_DATABASE_NAME);
    expect(() => verifyStore({ storePath: missing })).toThrow(/PRODUCTION_DURABLE_STORE_DISABLED/);
    expect(existsSync(parent)).toBe(false);
  });
});

describe('schema and SQLite safety', () => {
  test('init creates exact versioned tables and constraints', () => {
    const storePath = tempStore('schema'); initStore({ storePath });
    const db = new DatabaseSync(storePath);
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map((row) => row.name);
    expect(tables).toEqual(['durable_events', 'durable_tasks', 'store_meta']);
    expect(db.prepare("SELECT value FROM store_meta WHERE key='schema_version'").get().value).toBe(STORE_SCHEMA_VERSION);
    expect(Number(db.prepare('PRAGMA user_version').get().user_version)).toBe(1);
    const sql = db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='durable_events'").get().sql;
    expect(sql).toContain('UNIQUE(task_id, sequence)');
    expect(sql).toContain('UNIQUE(task_id, idempotency_key)');
    db.close();
  });
  test('foreign keys are active and safety pragmas are configured on runtime connections', () => {
    const { storePath } = initializedTask('pragmas');
    const verification = verifyStore({ storePath });
    expect(verification.valid).toBe(true);
    expect(verification.integrity_check).toBe('ok');
    const source = readFileSync(new URL('./kanban-autonomy-store.mjs', import.meta.url), 'utf8');
    expect(source).toContain('PRAGMA foreign_keys=ON');
    expect(source).toContain('PRAGMA trusted_schema=OFF');
    expect(source).toContain('PRAGMA synchronous=FULL');
    expect(source).toContain('BEGIN IMMEDIATE');
  });
  test('unknown or newer schema fails closed without repair', () => {
    const { storePath } = initializedTask('unknown-schema');
    const db = new DatabaseSync(storePath); db.prepare("UPDATE store_meta SET value='future.v99' WHERE key='schema_version'").run(); db.close();
    const before = readFileSync(storePath);
    const result = verifyStore({ storePath });
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual([{ code: 'UNKNOWN_SCHEMA_VERSION', task_id: null, sequence: null }]);
    expect(readFileSync(storePath)).toEqual(before);
  });
  test('integrity and foreign-key checks are exposed', () => {
    const { storePath } = initializedTask('integrity');
    const result = verifyStore({ storePath });
    expect(result).toMatchObject({ valid: true, integrity_check: 'ok', checked_tasks: 1, checked_events: 1 });
  });
});

describe('deterministic and atomic task initialization', () => {
  test('one board/card atomically creates one deterministic task and its bound TASK_CREATED event', () => {
    const { storePath, taskId, task, event: initialEvent, result } = initializedTask('identity');
    expect(taskId).toMatch(/^kt_[a-f0-9]{24}$/);
    expect(result).toMatchObject({
      created: true, initial_event_appended: true, task_id: taskId, initial_event_id: initialEvent.event_id,
      sequence: 1, reconstructed_state: 'created', temp_store_write: true,
    });
    expect(initialEvent).toMatchObject({
      task_id: taskId, sequence: 1, event_type: 'TASK_CREATED',
      event_version: SUPPORTED_EVENT_VERSIONS.TASK_CREATED, occurred_at: task.created_at,
      actor_type: 'system', actor_id_hash: null, worker_id: null, authority_level: 'A0',
      previous_event_id: null, previous_event_hash: null, policy_version: task.policy_version,
    });
    expect(parseStoredPayloadJson(initialEvent.payload_json).payload).toEqual({
      authority_ceiling: task.authority_ceiling,
      board_slug_hash: `sha256:${sha256Hex(task.board_slug)}`,
      creation_idempotency_key_hash: `sha256:${sha256Hex(task.creation_idempotency_key)}`,
      initial_card_snapshot_hash: task.initial_card_snapshot_hash,
      kanban_card_id_hash: `sha256:${sha256Hex(task.kanban_card_id)}`,
      policy_version: task.policy_version,
      source_identity_hash: task.source_identity_hash,
      task_id: taskId,
    });
    expect(initialEvent.payload_json).not.toContain(task.board_slug);
    expect(initialEvent.payload_json).not.toContain(task.kanban_card_id);
    expect(initialEvent.payload_json).not.toContain(task.creation_idempotency_key);
    expect(taskStatus({ storePath, taskId })).toMatchObject({
      valid: true, trusted: true, event_count: 1, reconstructed_state: 'created',
    });
    expect(verifyTaskChain({ storePath, taskId })).toMatchObject({
      valid: true, checked_events: 1, reconstructed_state: 'created',
    });
  });
  test('identical creation is idempotent and returns the existing initial event without a write', () => {
    const { storePath, taskId, event: initialEvent } = initializedTask('task-idempotent');
    const before = storeRows(storePath);
    const repeated = createTask(baseTask(storePath));
    expect(repeated).toMatchObject({
      created: false, initial_event_appended: false, temp_store_write: false,
      task_id: taskId, initial_event_id: initialEvent.event_id, sequence: 1, reconstructed_state: 'created',
    });
    expect(repeated.task.task_id).toBe(taskId);
    expect(repeated.event).toEqual(initialEvent);
    expect(storeRows(storePath)).toEqual(before);
    expect(verifyStore({ storePath })).toMatchObject({ checked_tasks: 1, checked_events: 1 });
  });
  test.each([
    ['after the task row', 'afterTaskInsertedBeforeInitialEvent'],
    ['after the initial event', 'afterInitialEventInsertedBeforeCommit'],
  ])('initialization failure %s rolls back both rows and can be retried', (_label, hookName) => {
    const storePath = tempStore(`initialization-rollback-${hookName}`); initStore({ storePath });
    const testHooks = { [hookName]() { throw new Error('synthetic initialization failure'); } };
    expect(() => createTask(baseTask(storePath), { testHooks })).toThrow(/synthetic initialization failure/);
    expect(storeRows(storePath)).toEqual({ tasks: [], events: [] });
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_tasks: 0, checked_events: 0 });
    const retried = createTask(baseTask(storePath));
    expect(retried).toMatchObject({ created: true, initial_event_appended: true, sequence: 1, reconstructed_state: 'created' });
    expect(storeRows(storePath).tasks).toHaveLength(1);
    expect(storeRows(storePath).events).toHaveLength(1);
  });
  test('an existing task missing its initial event fails closed and is never silently repaired', () => {
    const { storePath } = initializedTask('missing-initial-event');
    const db = new DatabaseSync(storePath); db.exec('DELETE FROM durable_events'); db.close();
    const before = storeRows(storePath);
    expect(() => createTask(baseTask(storePath))).toThrow(/TASK_INITIALIZATION_INCOMPLETE/);
    expect(storeRows(storePath)).toEqual(before);
    expect(verifyStore({ storePath }).findings.map((item) => item.code)).toContain('TASK_INITIALIZATION_INCOMPLETE');
  });
  test('idempotent creation validates the existing initialization chain before returning success', () => {
    const { storePath } = initializedTask('corrupt-initialization-idempotency');
    const db = new DatabaseSync(storePath);
    db.prepare('UPDATE durable_events SET event_hash=? WHERE sequence=1').run(HASH_B);
    db.close();
    const before = storeRows(storePath);
    expect(() => createTask(baseTask(storePath))).toThrow(/TASK_INITIALIZATION_INCOMPLETE/);
    expect(storeRows(storePath)).toEqual(before);
  });
  test('changed snapshot cannot create a second task and fails conflict', () => {
    const { storePath } = initializedTask('snapshot-conflict');
    expect(() => createTask(baseTask(storePath, { cardSnapshotHash: HASH_B }))).toThrow(/TASK_CREATION_IDEMPOTENCY_CONFLICT/);
    expect(verifyStore({ storePath })).toMatchObject({ checked_tasks: 1, checked_events: 1 });
  });
  test('changed immutable fields or creation key fail conflict', () => {
    const { storePath } = initializedTask('immutable-conflict');
    expect(() => createTask(baseTask(storePath, { authorityCeiling: 'A2' }))).toThrow(/TASK_CREATION_IDEMPOTENCY_CONFLICT/);
    expect(() => createTask(baseTask(storePath, { idempotencyKey: 'different-key' }))).toThrow(/TASK_CREATION_IDEMPOTENCY_CONFLICT/);
  });
  test('same card on different boards creates distinct task identities and initial chains', () => {
    const storePath = tempStore('cross-board'); initStore({ storePath });
    const first = createTask(baseTask(storePath));
    const second = createTask(baseTask(storePath, { boardSlug: 'another-board', idempotencyKey: 'task-create-2' }));
    expect(first.task.task_id).not.toBe(second.task.task_id);
    expect(first.event.event_id).not.toBe(second.event.event_id);
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_tasks: 2, checked_events: 2 });
  });
  test('two requests attempting the same board/card link cannot fork identity', () => {
    const { storePath } = initializedTask('link-conflict');
    expect(() => createTask(baseTask(storePath, { idempotencyKey: 'fork-attempt', sourceIdentityHash: HASH_A }))).toThrow(/TASK_CREATION_IDEMPOTENCY_CONFLICT/);
    expect(verifyStore({ storePath })).toMatchObject({ checked_tasks: 1, checked_events: 1 });
  });
});

describe('append-only events, versions, idempotency and authority', () => {
  test('valid events increment sequence and maintain exact chain links', () => {
    const { storePath, taskId } = initializedTask('chain');
    const events = appendNormalSeven(storePath, taskId).map((result) => result.event);
    expect(events.map((item) => item.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(events[0]).toMatchObject({ previous_event_id: null, previous_event_hash: null });
    for (let index = 1; index < events.length; index += 1) {
      expect(events[index].previous_event_id).toBe(events[index - 1].event_id);
      expect(events[index].previous_event_hash).toBe(events[index - 1].event_hash);
    }
    expect(verifyTaskChain({ storePath, taskId })).toMatchObject({ valid: true, checked_events: 7, reconstructed_state: 'awaiting_approval' });
  });
  test.each([0, 2, 1.5, '1', null, undefined])('append rejects unsupported event version %s before any write', (eventVersion) => {
    const { storePath, taskId } = initializedTask(`unsupported-version-${String(eventVersion).replace('.', '-')}`);
    const before = storeRows(storePath);
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, {}, { eventVersion })))
      .toThrow(/UNSUPPORTED_EVENT_VERSION/);
    expect(storeRows(storePath)).toEqual(before);
  });
  test('the event hash boundary rejects unsupported versions as part of the authenticated envelope', () => {
    expect(() => canonicalEventHashMaterial(eventHashEnvelope({}, { event_version: 2 })))
      .toThrow(/UNSUPPORTED_EVENT_VERSION/);
  });
  test('TASK_CREATED can only be emitted by atomic task initialization', () => {
    const { storePath, taskId, event: initialEvent } = initializedTask('duplicate-task-created');
    const before = storeRows(storePath);
    expect(() => appendEvent(eventInput(storePath, taskId, 'TASK_CREATED', 1)))
      .toThrow(/DUPLICATE_TASK_CREATED/);
    expect(storeRows(storePath)).toEqual(before);
    expect(verifyTaskChain({ storePath, taskId })).toMatchObject({ valid: true, checked_events: 1 });
    expect(storeRows(storePath).events[0].event_id).toBe(initialEvent.event_id);
  });
  test('identical event idempotency returns the existing non-initial event without append', () => {
    const { storePath, taskId } = initializedTask('event-idempotent');
    const input = eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, {
      eligible: false, reason_codes: ['FIXTURE'],
    });
    const first = appendEvent(input); const second = appendEvent(input);
    expect(first.appended).toBe(true); expect(second.appended).toBe(false);
    expect(second.temp_store_write).toBe(false);
    expect(second.event.event_id).toBe(first.event.event_id);
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_events: 2 });
  });
  test('same event idempotency key with different content fails without chain damage', () => {
    const { storePath, taskId } = initializedTask('event-conflict');
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, { card_snapshot_hash: HASH_A }));
    const before = storeRows(storePath);
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, { card_snapshot_hash: HASH_B })))
      .toThrow(/EVENT_IDEMPOTENCY_CONFLICT/);
    expect(storeRows(storePath)).toEqual(before);
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_events: 2 });
  });
  test('invalid transition, terminal append and unknown type fail closed', () => {
    const { storePath, taskId } = initializedTask('invalid-events');
    expect(() => appendEvent(eventInput(storePath, taskId, 'PLAN_CREATED', 1))).toThrow(/INVALID_EVENT_TRANSITION/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_CLAIMED', 1))).toThrow(/UNKNOWN_EVENT_TYPE/);
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    appendEvent(eventInput(storePath, taskId, 'TASK_COMPLETED', 3));
    expect(() => appendEvent(eventInput(storePath, taskId, 'TASK_BLOCKED', 4))).toThrow(/INVALID_EVENT_TRANSITION/);
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_events: 3, reconstructed_state: 'completed' });
  });
  test('authority within immutable ceiling passes and escalation fails', () => {
    const { storePath, taskId } = initializedTask('authority', { authorityCeiling: 'A1' });
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2, {}, { authorityLevel: 'A1' }));
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_SCORED', 3, {}, { authorityLevel: 'A2' }))).toThrow(/AUTHORITY_CEILING_EXCEEDED/);
    expect(taskStatus({ storePath, taskId }).task.authority_ceiling).toBe('A1');
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_events: 2 });
  });
  test('A6 is representable but creates no action surface', () => {
    const { storePath, taskId } = initializedTask('a6', { authorityCeiling: 'A6' });
    expect(appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, {}, { authorityLevel: 'A6' })).appended).toBe(true);
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_events: 2 });
  });
  test('strict timestamps, oversized payloads and sensitive fields are rejected', () => {
    const { storePath, taskId } = initializedTask('payload-safety');
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, {}, { occurredAt: '2026-07-11 00:00:00' }))).toThrow(/INVALID_TIMESTAMP/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, { report: 'x'.repeat(20_000) }))).toThrow(/PAYLOAD_STRING_TOO_LONG/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, { bot_token: 'synthetic' }))).toThrow(/SENSITIVE_PAYLOAD_REJECTED/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, { telegram_chat_id: '123456789' }))).toThrow(/SENSITIVE_PAYLOAD_REJECTED/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, { file_path: '/root/private' }))).toThrow(/SENSITIVE_PAYLOAD_REJECTED/);
    expect(taskStatus({ storePath, taskId }).event_count).toBe(1);
  });
  test('append failure before commit rolls back the event and permits a clean retry', () => {
    const { storePath, taskId } = initializedTask('append-rollback');
    const input = eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1);
    const before = storeRows(storePath);
    expect(() => appendEvent(input, { testHooks: {
      beforeAppendCommit() { throw new Error('synthetic append failure'); },
    } })).toThrow(/synthetic append failure/);
    expect(storeRows(storePath)).toEqual(before);
    expect(verifyTaskChain({ storePath, taskId })).toMatchObject({ valid: true, checked_events: 1, reconstructed_state: 'created' });
    expect(appendEvent(input)).toMatchObject({ appended: true, event: { sequence: 2 } });
  });
  test('payload must be a plain JSON object', () => {
    expect(() => validatePayload([])).toThrow(/PAYLOAD_ROOT_MUST_BE_OBJECT/);
    expect(() => validatePayload(new Date())).toThrow(/PAYLOAD_ROOT_MUST_BE_OBJECT/);
    expect(() => validatePayload({ nested: new Map() })).toThrow(/PAYLOAD_INVALID/);
  });
});

describe('canonical TASK_CREATED envelope trust binding', () => {
  test('builder is deterministic and exactly matches the persisted sequence-1 event', () => {
    const { task, event } = initializedTask('canonical-created');
    const first = buildCanonicalTaskCreatedEvent({ task });
    const second = buildCanonicalTaskCreatedEvent({ task, eventId: event.event_id, idempotencyKey: event.idempotency_key });
    expect(first).toEqual(second);
    expect(first).toEqual(event);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toMatchObject({
      event_type: 'TASK_CREATED', event_version: 1, sequence: 1, occurred_at: task.created_at,
      actor_type: 'system', actor_id_hash: null, worker_id: null, authority_level: 'A0', fencing_token: null,
      previous_event_id: null, previous_event_hash: null, policy_version: task.policy_version,
      correlation_id: null, redaction_class: 'internal',
    });
    expect(first.event_id).toMatch(/^ke_[a-f0-9]{24}$/);
    expect(first.idempotency_key).toMatch(/^task-init-[a-f0-9]{32}$/);
    expect(first.payload_json).not.toContain(task.board_slug);
    expect(first.payload_json).not.toContain(task.kanban_card_id);
    expect(first.payload_json).not.toContain(task.creation_idempotency_key);
  });

  test.each([
    ['actor_type', (row) => { row.actor_type = 'forged'; }],
    ['actor_id_hash', (row) => { row.actor_id_hash = HASH_A; }],
    ['worker_id', (row) => { row.worker_id = 'forged-worker'; }],
    ['authority_level', (row) => { row.authority_level = 'A1'; }],
    ['fencing_token', (row) => { row.fencing_token = 7; }],
    ['event_id', (row) => { row.event_id = `ke_${'f'.repeat(24)}`; }],
    ['idempotency_key', (row) => { row.idempotency_key = 'forged-initial-key'; }],
    ['occurred_at', (row) => { row.occurred_at = '2026-07-11T00:00:09Z'; }],
    ['policy_version', (row) => { row.policy_version = 'forged-policy.v1'; }],
    ['correlation_id', (row) => { row.correlation_id = 'forged-correlation'; }],
    ['redaction_class', (row) => { row.redaction_class = 'forged'; }],
    ['previous references', (row) => {
      row.previous_event_id = `ke_${'e'.repeat(24)}`;
      row.previous_event_hash = `sha256:${'e'.repeat(64)}`;
    }],
  ])('rejects independently forged %s despite full descendant-chain rehash', (_field, tamper) => {
    const { storePath, taskId } = initializedTask(`created-forge-${_field.replaceAll(' ', '-')}`);
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    appendEvent(eventInput(storePath, taskId, 'CARD_SCORED', 3));
    const db = new DatabaseSync(storePath);
    rewriteAndRehashTaskChain(db, taskId, (rows) => tamper(rows[0]));
    db.close();
    const verification = verifyTaskChain({ storePath, taskId });
    expect(verification).toMatchObject({ trusted: false, valid: false, reconstructed_state: null, chain_tip: null });
    expect(verification.findings.map((finding) => finding.code)).toContain('TASK_CREATED_ENVELOPE_MISMATCH');
    expect(taskStatus({ storePath, taskId })).toMatchObject({
      trusted: false, valid: false, reconstructed_state: null, chain_tip: null, next_action: null,
      authority_ceiling: null, authority_consumable: false, authority_data_trusted: false,
    });
    expect(() => replayTaskState({ storePath, taskId })).toThrow(/TASK_CHAIN_INVALID/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'RESEARCH_STARTED', 4)))
      .toThrow(/EXISTING_EVENT_CHAIN_INVALID/);
  });

  test('rejects forged TASK_CREATED payload identity despite full descendant-chain rehash', () => {
    const { storePath, taskId } = initializedTask('created-forge-payload');
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    const db = new DatabaseSync(storePath);
    rewriteAndRehashTaskChain(db, taskId, (rows) => {
      const payload = parseStoredPayloadJson(rows[0].payload_json).payload;
      payload.task_id = `kt_${'f'.repeat(24)}`;
      rows[0].payload_json = canonicalJson(payload);
      rows[0].payload_hash = `sha256:${sha256Hex(rows[0].payload_json)}`;
    });
    db.close();
    const verification = verifyTaskChain({ storePath, taskId });
    expect(verification).toMatchObject({ trusted: false, valid: false, reconstructed_state: null, chain_tip: null });
    expect(verification.findings.map((finding) => finding.code)).toContain('TASK_CREATED_IDENTITY_MISMATCH');
    expect(taskStatus({ storePath, taskId })).toMatchObject({ authority_ceiling: null, authority_consumable: false });
    expect(() => replayTaskState({ storePath, taskId })).toThrow(/TASK_CHAIN_INVALID/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_SCORED', 3)))
      .toThrow(/EXISTING_EVENT_CHAIN_INVALID/);
  });
});

describe('strict payload security and stored payload boundary', () => {
  const forbiddenVariants = [
    'private_key', 'private-key', 'privateKey', 'PrivateKey', 'api_key', 'api-key', 'apiKey',
    'chat_id', 'chat-id', 'chatId', 'customer_data', 'customer-data', 'customerData',
    'raw_card_body', 'rawCardBody', 'metadata_dump', 'metadataDump', 'Authorization', 'authorization',
    'auth-header', 'cookie', 'set-cookie', 'accessToken', 'refresh_token',
  ];
  test.each(forbiddenVariants)('rejects normalized sensitive key %s without echoing it', (key) => {
    expect(normalizeSensitiveKeyName(key)).toMatch(/^[a-z0-9]+$/);
    try { validatePayload({ nested: [{ [key]: 'attacker-secret-value' }] }); }
    catch (error) {
      expect(error.code).toBe('SENSITIVE_PAYLOAD_REJECTED');
      expect(error.message).not.toContain(key);
      expect(error.message).not.toContain('attacker-secret-value');
      return;
    }
    throw new Error('expected sensitive payload rejection');
  });
  test('allows closed-policy lookalike hash, count, status and policy keys', () => {
    const payload = {
      actor_id_hash: HASH_A, approval_id_hash: HASH_B, source_identity_hash: HASH_A,
      card_snapshot_hash: HASH_B, token_count: 2, authorization_status: 'not_authorized',
      cookie_policy: 'reject', customer_data_hash: HASH_A,
    };
    expect(validatePayload(payload).payloadJson).toContain('customer_data_hash');
  });
  test.each([[], 'x', 1, true, null])('rejects non-object event payload roots', (value) => {
    expect(() => validatePayload(value)).toThrow(/PAYLOAD_ROOT_MUST_BE_OBJECT/);
  });
  test('rejects aggregate encoded payload bytes above the payload limit', () => {
    expect(() => validatePayload({ a: 'x'.repeat(8192), b: 'y'.repeat(8192) })).toThrow(/PAYLOAD_TOO_LARGE/);
  });
  test('programmatic and parsed objects produce identical canonical bytes and hashes', () => {
    const programmatic = validatePayload({ z: [2, 1], a: { y: true, x: '💾' } });
    const parsed = parseStoredPayloadJson('{"z":[2,1],"a":{"y":true,"x":"💾"}}');
    expect(parsed.payloadJson).toBe(programmatic.payloadJson);
    expect(parsed.payloadHash).toBe(programmatic.payloadHash);
    expect(parsed.canonical).toBe(false);
    expect(parseStoredPayloadJson(programmatic.payloadJson).canonical).toBe(true);
  });
  test.each([
    ['{"a":1,"a":2}', 'DUPLICATE_JSON_KEY'],
    ['{"nested":{"privateKey":"hidden"}}', 'SENSITIVE_PAYLOAD_REJECTED'],
    [`${'{"a":'.repeat(17)}0${'}'.repeat(17)}`, 'PAYLOAD_DEPTH_EXCEEDED'],
  ])('stored payload rejects %s', (text, code) => {
    expect(() => parseStoredPayloadJson(text)).toThrow(new RegExp(code));
  });
  test('payload insertion order is hash-independent while array order is hash-sensitive', () => {
    expect(validatePayload({ b: 1, a: 2 }).payloadHash).toBe(validatePayload({ a: 2, b: 1 }).payloadHash);
    expect(validatePayload({ a: [1, 2] }).payloadHash).not.toBe(validatePayload({ a: [2, 1] }).payloadHash);
  });
  test.each(['prіvate_key', 'аpiKey', 'private＿key', 'private‒key', 'ｐｒｉｖａｔｅＫｅｙ', 'café'])
    ('rejects non-ASCII payload key %s at every durable boundary', (key) => {
      const payloads = [{ [key]: 'synthetic-secret' }, { nested: { [key]: 'synthetic-secret' } }, { rows: [{ [key]: 'synthetic-secret' }] }];
      for (const payload of payloads) {
        try { validatePayload(payload); } catch (error) {
          expect(error.code).toBe('PAYLOAD_KEY_NON_ASCII_FORBIDDEN');
          expect(error.message).not.toContain(key);
          expect(error.message).not.toContain('synthetic-secret');
          continue;
        }
        throw new Error('expected non-ASCII key rejection');
      }
    });
  test('retains exact sensitive-key matching without substring matching', () => {
    const blocked = ['private_key', 'private-key', 'privateKey', 'PrivateKey', 'api_key', 'apiKey', 'authorization', 'auth-header', 'cookie', 'set-cookie', 'chat_id', 'chatId', 'customer_data', 'customerData', 'raw_card_body', 'rawCardBody', 'metadata_dump', 'metadataDump', 'accessToken', 'refresh_token', 'clientSecret'];
    for (const key of blocked) expect(() => validatePayload({ [key]: 'synthetic-secret' })).toThrow(/SENSITIVE_PAYLOAD_REJECTED/);
    expect(() => validatePayload({ actor_id_hash: HASH_A, approval_id_hash: HASH_B, source_identity_hash: HASH_A, card_snapshot_hash: HASH_B, token_count: 1, authorization_status: 'none', cookie_policy: 'reject', customer_data_hash: HASH_A })).not.toThrow();
  });
  test('rejects malformed UTF-16 values, keys and stored payloads while valid Unicode values pass', () => {
    for (const payload of [{ note: '\ud800' }, { note: '\udfff' }, { note: 'prefix\ud800suffix' }, { nested: { note: '\ud800' } }, { rows: ['\udfff'] }]) {
      expect(() => validatePayload(payload)).toThrow(/PAYLOAD_STRING_INVALID_UNICODE/);
    }
    expect(() => validatePayload({ ['bad\ud800key']: 'x' })).toThrow(/PAYLOAD_KEY_INVALID_UNICODE/);
    expect(() => parseStoredPayloadJson('{"note":"\ud800"}')).toThrow(/PAYLOAD_STRING_INVALID_UNICODE/);
    expect(() => validatePayload({ note: 'café 😀 東京' })).not.toThrow();
  });
  test('internal event envelope composes strict canonical and closed semantic payload boundaries', () => {
    expect(() => validatePayload({ note: 'x'.repeat(8192) })).not.toThrow();
    expect(() => canonicalEventHashMaterial(eventHashEnvelope({ note: 'x'.repeat(8192) })))
      .toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(() => validatePayload({ note: 'x'.repeat(8193) })).toThrow(/PAYLOAD_STRING_TOO_LONG/);
    expect(() => validatePayload({ note: '"'.repeat(8192) })).toThrow(/PAYLOAD_TOO_LARGE/);
    const normal = eventHashEnvelope();
    expect(() => canonicalEventHashMaterial({
      ...normal, payload_json: JSON.stringify(EVENT_PAYLOADS.CARD_SCORED),
    })).toThrow(/PAYLOAD_JSON_NONCANONICAL/);
    expect(() => canonicalEventHashMaterial({ ...normal, payload_hash: HASH_B })).toThrow(/PAYLOAD_HASH_MISMATCH/);
    expect(canonicalEventHashMaterial(eventHashEnvelope())).not.toBe(canonicalEventHashMaterial(eventHashEnvelope({
      ...EVENT_PAYLOADS.CARD_SCORED, score_basis_points: 7201,
    })));
    expect(() => canonicalEventHashMaterial({ payload_json: '{}' })).toThrow(/EVENT_HASH_ENVELOPE_INVALID/);
  });
  test('programmatic append rejects malformed Unicode before store open and cannot poison an existing store', () => {
    const { storePath, taskId } = initializedTask('unicode-poison');
    const before = taskStatus({ storePath, taskId }).event_count;
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, { note: '\ud800' }))).toThrow(/PAYLOAD_STRING_INVALID_UNICODE/);
    expect(taskStatus({ storePath, taskId }).event_count).toBe(before);
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_events: before });
  });
  test('complete append path honors semantic field bounds after generic payload validation', () => {
    const { storePath, taskId } = initializedTask('payload-envelope-boundary');
    expect(appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, {
      eligibility_policy_version: 'x'.repeat(128),
    })).appended).toBe(true);
    expect(taskStatus({ storePath, taskId }).event_count).toBe(2);
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_SCORED', 2, {
      scoring_policy_version: 'x'.repeat(129),
    }))).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_SCORED', 3, {
      explanation_codes: Array(33).fill('TOO_MANY'),
    }))).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(taskStatus({ storePath, taskId }).event_count).toBe(2);
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_events: 2 });
  });
});

describe('restart replay, corruption detection and no repair', () => {
  test('close/reopen preserves all events and reconstructed state', () => {
    const { storePath, taskId } = initializedTask('restart'); appendNormalSeven(storePath, taskId);
    const status = taskStatus({ storePath, taskId });
    expect(status).toMatchObject({ event_count: 7, reconstructed_state: 'awaiting_approval' });
    expect(replayTaskState({ storePath, taskId })).toMatchObject({ valid: true, checked_events: 7, reconstructed_state: 'awaiting_approval' });
  });
  test.each([
    ['wrong previous hash', "UPDATE durable_events SET previous_event_hash='sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' WHERE sequence=2", 'PREVIOUS_EVENT_HASH_MISMATCH'],
    ['wrong previous event ID', "UPDATE durable_events SET previous_event_id='ke_000000000000000000000000' WHERE sequence=2", 'WRONG_PREVIOUS_EVENT_ID'],
    ['payload hash mismatch', "UPDATE durable_events SET payload_hash='sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' WHERE sequence=1", 'PAYLOAD_HASH_MISMATCH'],
    ['event hash mismatch', "UPDATE durable_events SET event_hash='sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' WHERE sequence=1", 'EVENT_HASH_MISMATCH'],
    ['missing sequence', 'UPDATE durable_events SET sequence=3 WHERE sequence=2', 'MISSING_OR_DUPLICATE_SEQUENCE'],
    ['malformed timestamp', "UPDATE durable_events SET occurred_at='2026-99-11T00:00:00Z' WHERE sequence=1", 'MALFORMED_TIMESTAMP'],
    ['authority violation', "UPDATE durable_events SET authority_level='A2' WHERE sequence=1", 'AUTHORITY_CEILING_EXCEEDED'],
  ])('detects %s and does not repair it', (_label, sql, expectedCode) => {
    const { storePath, taskId } = initializedTask(`corrupt-${expectedCode.toLowerCase()}`);
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    const db = new DatabaseSync(storePath); db.exec(sql); db.close();
    const before = readFileSync(storePath);
    const result = verifyStore({ storePath });
    expect(result.valid).toBe(false);
    expect(result.findings.map((item) => item.code)).toContain(expectedCode);
    expect(readFileSync(storePath)).toEqual(before);
  });
  test('detects a semantically valid but impossible transition and does not repair it', () => {
    const { storePath, taskId } = initializedTask('corrupt-invalid-transition');
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    const db = new DatabaseSync(storePath);
    const row = db.prepare('SELECT * FROM durable_events WHERE sequence=2').get();
    const payload = validatePayload(EVENT_PAYLOADS.PLAN_CREATED);
    Object.assign(row, {
      event_type: 'PLAN_CREATED', payload_json: payload.payloadJson, payload_hash: payload.payloadHash,
    });
    row.event_hash = attackerRehashEvent(row);
    db.prepare('UPDATE durable_events SET event_type=?, payload_json=?, payload_hash=?, event_hash=? WHERE sequence=2')
      .run(row.event_type, row.payload_json, row.payload_hash, row.event_hash);
    db.close();
    const before = readFileSync(storePath);
    expect(verifyStore({ storePath }).findings.map((item) => item.code)).toContain('INVALID_EVENT_TRANSITION');
    expect(readFileSync(storePath)).toEqual(before);
  });
  test('detects task/card identity conflict', () => {
    const { storePath } = initializedTask('identity-corrupt');
    const db = new DatabaseSync(storePath); db.exec("UPDATE durable_tasks SET kanban_card_id='different-card'"); db.close();
    expect(verifyStore({ storePath }).findings.map((item) => item.code)).toContain('TASK_CARD_IDENTITY_CONFLICT');
  });
  test('unknown stored event type is detected fail-closed', () => {
    const { storePath, taskId } = initializedTask('unknown-event-corrupt');
    const db = new DatabaseSync(storePath); db.exec("UPDATE durable_events SET event_type='SYNTHETIC_UNKNOWN_EVENT'"); db.close();
    const result = verifyStore({ storePath });
    expect(result.valid).toBe(false);
    expect(result.findings.map((item) => item.code)).toContain('UNKNOWN_EVENT_TYPE');
  });
  test('duplicate sequence corruption is rejected by the schema and leaves the chain valid', () => {
    const { storePath, taskId } = initializedTask('duplicate-sequence');
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    const db = new DatabaseSync(storePath);
    expect(() => db.exec('UPDATE durable_events SET sequence=1 WHERE sequence=2')).toThrow(/UNIQUE constraint failed/);
    db.close();
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_events: 2 });
  });
  test('invalid chains cannot replay as trusted state', () => {
    const { storePath, taskId } = initializedTask('replay-invalid');
    const db = new DatabaseSync(storePath); db.exec("UPDATE durable_events SET event_hash='sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'"); db.close();
    expect(() => replayTaskState({ storePath, taskId })).toThrow(/TASK_CHAIN_INVALID/);
  });
});

describe('C4A strict timestamp chronology and persisted hash trust', () => {
  const malformedHashes = [
    `md5:${'a'.repeat(64)}`, `SHA256:${'a'.repeat(64)}`, `sha256:${'A'.repeat(64)}`,
    `sha256:${'a'.repeat(63)}g`, `sha256:${'a'.repeat(63)}`, `sha256:${'a'.repeat(65)}`,
    'a'.repeat(64), ` ${HASH_A}`, `${HASH_A} `,
  ];

  function expectUntrusted(storePath, taskId, code = 'MALFORMED_HASH') {
    const verified = verifyTaskChain({ storePath, taskId });
    expect(verified).toMatchObject({
      trusted: false, valid: false, reconstructed_state: null, chain_tip: null,
      authority_ceiling: null, authority_consumable: false,
    });
    expect(verified.findings.map((item) => item.code)).toContain(code);
    expect(taskStatus({ storePath, taskId })).toMatchObject({
      trusted: false, valid: false, task: null, reconstructed_state: null, chain_tip: null,
      authority_ceiling: null, authority_consumable: false, authority_data_trusted: false,
    });
    expect(() => replayTaskState({ storePath, taskId })).toThrow(/TASK_CHAIN_INVALID/);
  }

  test('append accepts equal, increasing and rollover instants but rejects second and fractional regressions', () => {
    const equal = initializedTask('c4a-chronology-equal');
    expect(appendEvent(eventInput(equal.storePath, equal.taskId, 'CARD_ELIGIBILITY_EVALUATED', 2, undefined, {
      occurredAt: '2026-07-11T00:00:00.0Z',
    })).appended).toBe(true);
    expect(appendEvent(eventInput(equal.storePath, equal.taskId, 'CARD_SCORED', 3, undefined, {
      occurredAt: '2026-07-11T00:00:00.000000001Z',
    })).appended).toBe(true);
    const before = storeRows(equal.storePath).events.length;
    expect(() => appendEvent(eventInput(equal.storePath, equal.taskId, 'RESEARCH_STARTED', 4, undefined, {
      occurredAt: '2026-07-11T00:00:00Z',
    }))).toThrow(/EVENT_TIMESTAMP_REGRESSION/);
    expect(storeRows(equal.storePath).events).toHaveLength(before);

    const second = initializedTask('c4a-chronology-second', { createdAt: '2026-07-11T00:00:10Z' });
    expect(() => appendEvent(eventInput(second.storePath, second.taskId, 'CARD_ELIGIBILITY_EVALUATED', 2, undefined, {
      occurredAt: '2026-07-11T00:00:09Z',
    }))).toThrow(/EVENT_TIMESTAMP_REGRESSION/);

    const rollover = initializedTask('c4a-chronology-rollover', { createdAt: '2026-12-31T23:59:59.999999999Z' });
    expect(appendEvent(eventInput(rollover.storePath, rollover.taskId, 'CARD_ELIGIBILITY_EVALUATED', 2, undefined, {
      occurredAt: '2027-01-01T00:00:00Z',
    })).appended).toBe(true);
  });

  test('fully rehashed timestamp regression remains invalid and blocks status, replay and append', () => {
    const { storePath, taskId } = initializedTask('c4a-rehashed-regression');
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    appendEvent(eventInput(storePath, taskId, 'CARD_SCORED', 3));
    const db = new DatabaseSync(storePath);
    rewriteAndRehashTaskChain(db, taskId, (rows) => { rows[1].occurred_at = '2026-07-10T23:59:59.999999999Z'; });
    db.close();
    expectUntrusted(storePath, taskId, 'EVENT_TIMESTAMP_REGRESSION');
    const before = storeRows(storePath).events.length;
    expect(() => appendEvent(eventInput(storePath, taskId, 'RESEARCH_STARTED', 4))).toThrow(/EXISTING_EVENT_CHAIN_INVALID/);
    expect(storeRows(storePath).events).toHaveLength(before);
  });

  test('TASK_CREATED must equal task.created_at as an instant even after complete rehash', () => {
    const equivalent = initializedTask('c4a-created-equivalent');
    let db = new DatabaseSync(equivalent.storePath);
    rewriteAndRehashTaskChain(db, equivalent.taskId, (rows) => { rows[0].occurred_at = '2026-07-11T00:00:00.000000000Z'; });
    db.close();
    expect(verifyTaskChain({ storePath: equivalent.storePath, taskId: equivalent.taskId })).toMatchObject({ valid: true, trusted: true });

    const mismatched = initializedTask('c4a-created-mismatch');
    db = new DatabaseSync(mismatched.storePath);
    rewriteAndRehashTaskChain(db, mismatched.taskId, (rows) => { rows[0].occurred_at = '2026-07-11T00:00:01Z'; });
    db.close();
    expectUntrusted(mismatched.storePath, mismatched.taskId, 'TASK_CREATED_ENVELOPE_MISMATCH');
  });

  test('year 0000 fails at task, event, optional-payload and exported hash-material boundaries without reflection', () => {
    const invalidTimestamp = '0000-01-01T00:00:00Z';
    const emptyStore = tempStore('c4a-year-zero-task'); initStore({ storePath: emptyStore });
    for (const action of [
      () => createTask(baseTask(emptyStore, { createdAt: invalidTimestamp })),
      () => canonicalEventHashMaterial(eventHashEnvelope(undefined, { occurred_at: invalidTimestamp })),
    ]) {
      try { action(); throw new Error('expected rejection'); } catch (error) {
        expect(error.code).toBe('INVALID_TIMESTAMP');
        expect(error.message).not.toContain(invalidTimestamp);
      }
    }
    expect(storeRows(emptyStore)).toMatchObject({ tasks: [], events: [] });

    const { storePath, taskId } = initializedTask('c4a-year-zero-event');
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2, undefined, {
      occurredAt: invalidTimestamp,
    }))).toThrow(/INVALID_TIMESTAMP/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'TASK_PAUSED', 3, {
      resume_after: invalidTimestamp,
    }))).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(storeRows(storePath).events).toHaveLength(1);

    const persistedEvent = initializedTask('c4a-year-zero-persisted-event');
    let db = new DatabaseSync(persistedEvent.storePath);
    rewriteAndRehashTaskChain(db, persistedEvent.taskId, (rows) => { rows[0].occurred_at = invalidTimestamp; });
    db.close();
    expectUntrusted(persistedEvent.storePath, persistedEvent.taskId, 'MALFORMED_TIMESTAMP');

    const persistedTask = initializedTask('c4a-year-zero-persisted-task');
    db = new DatabaseSync(persistedTask.storePath);
    db.prepare('UPDATE durable_tasks SET created_at=? WHERE task_id=?').run(invalidTimestamp, persistedTask.taskId);
    rewriteAndRehashTaskChain(db, persistedTask.taskId, (rows) => { rows[0].occurred_at = invalidTimestamp; });
    db.close();
    expectUntrusted(persistedTask.storePath, persistedTask.taskId, 'INVALID_TIMESTAMP');
  });

  test('task creation rejects every malformed source and snapshot hash class without row insertion or reflection', () => {
    const storePath = tempStore('c4a-task-input-hashes'); initStore({ storePath });
    for (const [field, mappedField] of [['sourceIdentityHash', 'source_identity_hash'], ['cardSnapshotHash', 'initial_card_snapshot_hash']]) {
      for (const [index, value] of malformedHashes.entries()) {
        try {
          createTask(baseTask(storePath, { [field]: value, idempotencyKey: `${mappedField}-${index}` }));
          throw new Error('expected rejection');
        } catch (error) {
          expect(error.code).toBe('MALFORMED_HASH');
          expect(error.message).not.toContain(value);
        }
      }
    }
    expect(storeRows(storePath)).toMatchObject({ tasks: [], events: [] });
  });

  test.each(['source_identity_hash', 'initial_card_snapshot_hash'])(
    'persisted malformed task %s fails before trusted identity and idempotent reuse', (field) => {
      const { storePath, taskId } = initializedTask(`c4a-task-corrupt-${field}`);
      const malformed = `sha256:${'A'.repeat(64)}`;
      const db = new DatabaseSync(storePath);
      db.exec('PRAGMA ignore_check_constraints=ON');
      db.prepare(`UPDATE durable_tasks SET ${field}=? WHERE task_id=?`).run(malformed, taskId);
      const row = db.prepare('SELECT * FROM durable_events WHERE task_id=? AND sequence=1').get(taskId);
      const payload = JSON.parse(row.payload_json); payload[field] = malformed;
      row.payload_json = canonicalJson(payload);
      row.payload_hash = `sha256:${sha256Hex(row.payload_json)}`;
      row.event_hash = attackerRehashEvent(row);
      db.prepare('UPDATE durable_events SET payload_json=?, payload_hash=?, event_hash=? WHERE task_id=? AND sequence=1')
        .run(row.payload_json, row.payload_hash, row.event_hash, taskId);
      db.close();
      expectUntrusted(storePath, taskId);
      expect(() => createTask(baseTask(storePath))).toThrow(/TASK_INITIALIZATION_INCOMPLETE/);
    },
  );

  test('valid previous-event hash syntax with the wrong value emits only PREVIOUS_EVENT_HASH_MISMATCH', () => {
    const { storePath, taskId } = initializedTask('c4a-previous-hash-value-mismatch');
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    appendEvent(eventInput(storePath, taskId, 'CARD_SCORED', 3));
    appendEvent(eventInput(storePath, taskId, 'RESEARCH_STARTED', 4));

    const db = new DatabaseSync(storePath);
    const rows = db.prepare('SELECT * FROM durable_events WHERE task_id=? ORDER BY sequence').all(taskId);
    rows[1].previous_event_hash = rows[0].event_hash === HASH_B ? HASH_A : HASH_B;
    rows[1].event_hash = attackerRehashEvent(rows[1]);
    for (let index = 2; index < rows.length; index += 1) {
      rows[index].previous_event_hash = rows[index - 1].event_hash;
      rows[index].event_hash = attackerRehashEvent(rows[index]);
    }
    for (const row of rows.slice(1)) {
      db.prepare('UPDATE durable_events SET previous_event_hash=?, event_hash=? WHERE task_id=? AND sequence=?')
        .run(row.previous_event_hash, row.event_hash, taskId, row.sequence);
    }
    db.close();

    const eventCount = storeRows(storePath).events.length;
    const verified = verifyTaskChain({ storePath, taskId });
    const findingCodes = verified.findings.map((finding) => finding.code);
    expect(verified).toMatchObject({
      valid: false, trusted: false, reconstructed_state: null, chain_tip: null,
      authority_ceiling: null, authority_consumable: false,
    });
    expect(findingCodes).toEqual(['PREVIOUS_EVENT_HASH_MISMATCH']);
    expect(findingCodes).not.toContain('WRONG_PREVIOUS_EVENT_HASH');
    expect(findingCodes).not.toContain('MALFORMED_HASH');
    expect(findingCodes).not.toContain('EVENT_HASH_MISMATCH');

    expect(taskStatus({ storePath, taskId })).toMatchObject({
      valid: false, trusted: false, task: null, reconstructed_state: null, chain_tip: null,
      authority_ceiling: null, authority_consumable: false, authority_data_trusted: false,
      error_code: 'TASK_CHAIN_INVALID',
    });
    expect(() => replayTaskState({ storePath, taskId })).toThrow(/TASK_CHAIN_INVALID/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'RESEARCH_COMPLETED', 5)))
      .toThrow(/EXISTING_EVENT_CHAIN_INVALID/);
    expect(storeRows(storePath).events).toHaveLength(eventCount);

    const bin = new URL('../bin/kanban-autonomy-store', import.meta.url);
    for (const command of ['status', 'replay']) {
      const result = spawnSync(process.execPath, [
        bin.pathname, command, '--json', '--temp-store', '--store', storePath, '--task-id', taskId,
      ], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim()).toBe('TASK_CHAIN_INVALID');
    }
  });

  test.each(['actor_id_hash', 'payload_hash', 'previous_event_hash', 'event_hash'])(
    'persisted malformed event %s is distinct from a validly shaped mismatch', (field) => {
      const { storePath, taskId } = initializedTask(`c4a-event-corrupt-${field}`);
      appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
      const db = new DatabaseSync(storePath);
      const row = db.prepare('SELECT * FROM durable_events WHERE task_id=? AND sequence=2').get(taskId);
      row[field] = `sha256:${'A'.repeat(64)}`;
      if (field !== 'event_hash') row.event_hash = attackerRehashEvent(row);
      db.prepare(`UPDATE durable_events SET ${field}=?, event_hash=? WHERE task_id=? AND sequence=2`)
        .run(row[field], row.event_hash, taskId);
      db.close();
      expectUntrusted(storePath, taskId);
    },
  );

  test('rehashed semantic event with malformed payload-policy hash fails as MALFORMED_HASH before insertion trust', () => {
    const { storePath, taskId } = initializedTask('c4a-payload-policy-corrupt');
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    const db = new DatabaseSync(storePath);
    const row = db.prepare('SELECT * FROM durable_events WHERE task_id=? AND sequence=2').get(taskId);
    const payload = JSON.parse(row.payload_json); payload.card_snapshot_hash = `sha256:${'A'.repeat(64)}`;
    row.payload_json = canonicalJson(payload);
    row.payload_hash = `sha256:${sha256Hex(row.payload_json)}`;
    row.event_hash = attackerRehashEvent(row);
    db.prepare('UPDATE durable_events SET payload_json=?, payload_hash=?, event_hash=? WHERE task_id=? AND sequence=2')
      .run(row.payload_json, row.payload_hash, row.event_hash, taskId);
    db.close();
    expect(verifyTaskChain({ storePath, taskId }).findings.map((item) => item.code)).toEqual(['MALFORMED_HASH']);
    expectUntrusted(storePath, taskId);
  });
});

describe('C3 verification-first integrity and concurrency', () => {
  test.each([
    ['payload hash', "UPDATE durable_events SET payload_hash='sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' WHERE sequence=1"],
    ['event hash', "UPDATE durable_events SET event_hash='sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' WHERE sequence=1"],
    ['previous event id', "UPDATE durable_events SET previous_event_id='ke_000000000000000000000000' WHERE sequence=2"],
    ['previous event hash', "UPDATE durable_events SET previous_event_hash='sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' WHERE sequence=2"],
    ['missing sequence', 'UPDATE durable_events SET sequence=3 WHERE sequence=2'],
    ['unsupported version', 'UPDATE durable_events SET event_version=2 WHERE sequence=2'],
    ['invalid stored payload', "UPDATE durable_events SET payload_json='[]' WHERE sequence=2"],
    ['over-ceiling authority', "UPDATE durable_events SET authority_level='A2' WHERE sequence=2"],
    ['invalid transition', "UPDATE durable_events SET event_type='PLAN_CREATED' WHERE sequence=2"],
  ])('existing %s corruption blocks append and preserves event count', (_label, sql) => {
    const { storePath, taskId } = initializedTask(`append-corruption-${_label.replaceAll(' ', '-')}`);
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    const db = new DatabaseSync(storePath); db.exec(sql); db.close();
    const before = storeRows(storePath).events.length;
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_SCORED', 3))).toThrow(/EXISTING_EVENT_CHAIN_INVALID/);
    expect(storeRows(storePath).events).toHaveLength(before);
    expect(taskStatus({ storePath, taskId })).toMatchObject({ trusted: false, valid: false, reconstructed_state: null, chain_tip: null, next_action: null });
    expect(() => replayTaskState({ storePath, taskId })).toThrow(/TASK_CHAIN_INVALID/);
  });

  test.each([
    ['noncanonical', '{"z":1,"a":2}', 'PAYLOAD_JSON_NONCANONICAL'],
    ['duplicate-key', '{"a":1,"a":2}', 'PAYLOAD_JSON_INVALID'],
    ['nested-secret', '{"nested":{"privateKey":"synthetic"}}', 'PAYLOAD_JSON_INVALID'],
    ['non-ascii-key', '{"café":"synthetic"}', 'PAYLOAD_JSON_INVALID'],
    ['non-object-root', '[]', 'PAYLOAD_JSON_INVALID'],
  ])('semantic stored payload %s is rejected despite attacker-recomputed hashes', (_label, payloadJson, code) => {
    const { storePath, taskId } = initializedTask(`semantic-${_label}`);
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    const db = new DatabaseSync(storePath);
    const row = db.prepare('SELECT * FROM durable_events WHERE task_id=? AND sequence=2').get(taskId);
    row.payload_json = payloadJson;
    row.payload_hash = `sha256:${sha256Hex(payloadJson)}`;
    row.event_hash = attackerRehashEvent(row);
    db.prepare('UPDATE durable_events SET payload_json=?, payload_hash=?, event_hash=? WHERE task_id=? AND sequence=2')
      .run(row.payload_json, row.payload_hash, row.event_hash, taskId);
    db.close();
    const result = verifyTaskChain({ storePath, taskId });
    expect(result).toMatchObject({ trusted: false, valid: false, reconstructed_state: null, chain_tip: null });
    expect(result.findings.map((item) => item.code)).toContain(code);
  });

  test.each([
    ['score string', 3, null, (payload) => { payload.score_basis_points = 'forged'; }],
    ['score below range', 3, null, (payload) => { payload.score_basis_points = -1; }],
    ['score above range', 3, null, (payload) => { payload.score_basis_points = 10_001; }],
    ['extra unknown key', 3, null, (payload) => { payload.untrusted_extra = 'FORGED'; }],
    ['missing required field', 3, null, (payload) => { delete payload.score_basis_points; }],
    ['invalid reason code', 2, null, (payload) => { payload.eligible = false; payload.reason_codes = ['not_uppercase']; }],
    ['unsupported research outcome', 5, null, (payload) => { payload.outcome = 'invented'; }],
    ['unsafe plan next action', 6, null, (payload) => { payload.next_safe_action = 'execute_now'; }],
    ['wrong approval requested status', 7, null, (payload) => { payload.approval_status = 'granted'; }],
    ['unsupported completion outcome', 7, 'TASK_COMPLETED', (payload) => { payload.completion_outcome = 'invented'; }],
  ])('semantic policy rejects rehashed stored %s and all descendants', (_label, sequence, replacementType, mutatePayload) => {
    const { storePath, taskId } = initializedTask(`semantic-policy-${_label.replaceAll(' ', '-')}`);
    appendNormalSeven(storePath, taskId);
    const db = new DatabaseSync(storePath);
    rewriteAndRehashTaskChain(db, taskId, (rows) => {
      const row = rows[sequence - 1];
      const payload = replacementType
        ? structuredClone(EVENT_PAYLOADS[replacementType])
        : parseStoredPayloadJson(row.payload_json).payload;
      if (replacementType) row.event_type = replacementType;
      mutatePayload(payload);
      row.payload_json = canonicalJson(payload);
      row.payload_hash = `sha256:${sha256Hex(row.payload_json)}`;
    });
    db.close();
    const verification = verifyTaskChain({ storePath, taskId });
    expect(verification).toMatchObject({
      trusted: false, valid: false, reconstructed_state: null, chain_tip: null,
      authority_ceiling: null, authority_consumable: false, authority_data_trusted: false,
    });
    expect(verification.findings.map((finding) => finding.code)).toContain('EVENT_PAYLOAD_INVALID');
    expect(verifyStore({ storePath })).toMatchObject({ trusted: false, valid: false, checked_tasks: 1, checked_events: 7 });
    expect(taskStatus({ storePath, taskId })).toMatchObject({
      trusted: false, valid: false, reconstructed_state: null, chain_tip: null, next_action: null,
      authority_ceiling: null, authority_consumable: false,
    });
    expect(() => replayTaskState({ storePath, taskId })).toThrow(/TASK_CHAIN_INVALID/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'TASK_BLOCKED', 9)))
      .toThrow(/EXISTING_EVENT_CHAIN_INVALID/);
  });

  test('proposed CARD_SCORED semantic failures are rejected before append', () => {
    const { storePath, taskId } = initializedTask('semantic-score-proposed');
    appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    for (const score_basis_points of ['forged', -1, 10_001]) {
      expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_SCORED', 3, { score_basis_points }, {
        idempotencyKey: `bad-score-${String(score_basis_points)}`,
      }))).toThrow(/EVENT_PAYLOAD_INVALID/);
    }
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_events: 2 });
  });

  test('verifyStore detects zero-event tasks and foreign-key-bypassed orphan events', () => {
    const { storePath, taskId } = initializedTask('orphan-and-incomplete');
    const db = new DatabaseSync(storePath);
    db.exec('PRAGMA foreign_keys=OFF');
    const row = db.prepare('SELECT * FROM durable_events WHERE task_id=?').get(taskId);
    db.exec('DELETE FROM durable_events');
    row.event_id = `ke_${'c'.repeat(24)}`; row.task_id = `kt_${'d'.repeat(24)}`;
    insertRawEvent(db, row);
    db.close();
    const result = verifyStore({ storePath });
    expect(result.valid).toBe(false);
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining(['TASK_INITIALIZATION_INCOMPLETE', 'ORPHAN_EVENT']));
  });

  test('simultaneous create-task produces one task and one TASK_CREATED event', async () => {
    const bin = new URL('../bin/kanban-autonomy-store', import.meta.url);
    const storePath = tempStore('concurrent-create'); initStore({ storePath });
    const args = ['create-task', '--json', '--temp-store', '--allow-temp-write', '--store', storePath];
    const input = JSON.stringify(baseTask(undefined, { storePath: undefined }));
    const results = await Promise.all([runCliAsync(bin, args, input), runCliAsync(bin, args, input)]);
    expect(results.map((result) => result.status)).toEqual([0, 0]);
    expect(results.map((result) => JSON.parse(result.stdout).created).sort()).toEqual([false, true]);
    expect(storeRows(storePath)).toMatchObject({ tasks: [expect.any(Object)], events: [expect.objectContaining({ event_type: 'TASK_CREATED', sequence: 1 })] });
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_tasks: 1, checked_events: 1 });
  });

  test('concurrent distinct, identical and conflicting appends remain serialized and valid', async () => {
    const bin = new URL('../bin/kanban-autonomy-store', import.meta.url);
    const runPair = async (label, left, right) => {
      const { storePath, taskId } = initializedTask(label);
      const args = ['append-event', '--json', '--temp-store', '--allow-temp-write', '--store', storePath];
      for (const value of [left, right]) { value.taskId = taskId; delete value.storePath; }
      const results = await Promise.all([runCliAsync(bin, args, JSON.stringify(left)), runCliAsync(bin, args, JSON.stringify(right))]);
      return { storePath, taskId, results };
    };
    const distinct = await runPair(
      'concurrent-distinct',
      eventInput(undefined, '', 'CARD_ELIGIBILITY_EVALUATED', 2, { eligible: false, reason_codes: ['LEFT'] }, { occurredAt: '2026-07-11T00:00:02Z' }),
      eventInput(undefined, '', 'CARD_ELIGIBILITY_EVALUATED', 3, { eligible: false, reason_codes: ['RIGHT'] }, { occurredAt: '2026-07-11T00:00:02Z' }),
    );
    expect(distinct.results.every((result) => result.status === 0)).toBe(true);
    expect(storeRows(distinct.storePath).events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(verifyStore({ storePath: distinct.storePath })).toMatchObject({ valid: true, checked_events: 3 });

    const identicalInput = eventInput(undefined, '', 'CARD_ELIGIBILITY_EVALUATED', 2);
    const identical = await runPair('concurrent-identical', { ...identicalInput }, { ...identicalInput });
    expect(identical.results.every((result) => result.status === 0)).toBe(true);
    expect(identical.results.map((result) => JSON.parse(result.stdout).appended).sort()).toEqual([false, true]);
    expect(verifyStore({ storePath: identical.storePath })).toMatchObject({ valid: true, checked_events: 2 });

    const conflicting = await runPair(
      'concurrent-conflict',
      eventInput(undefined, '', 'CARD_ELIGIBILITY_EVALUATED', 2, { eligible: false, reason_codes: ['LEFT'] }),
      eventInput(undefined, '', 'CARD_ELIGIBILITY_EVALUATED', 2, { eligible: false, reason_codes: ['RIGHT'] }),
    );
    expect(conflicting.results.filter((result) => result.status === 0)).toHaveLength(1);
    expect(conflicting.results.filter((result) => result.stderr.trim() === 'EVENT_IDEMPOTENCY_CONFLICT')).toHaveLength(1);
    expect(verifyStore({ storePath: conflicting.storePath })).toMatchObject({ valid: true, checked_events: 2 });
  });
});

describe('C4B cross-event approval linkage and deterministic suspension repair', () => {
  const appendPlanning = (storePath, taskId) => {
    for (const [type, index] of [
      ['CARD_ELIGIBILITY_EVALUATED', 2], ['CARD_SCORED', 3], ['RESEARCH_STARTED', 4],
      ['RESEARCH_COMPLETED', 5], ['PLAN_CREATED', 6],
    ]) appendEvent(eventInput(storePath, taskId, type, index));
  };
  const pendingPlanning = (label, overrides = {}) => {
    const target = initializedTask(label, overrides);
    appendPlanning(target.storePath, target.taskId);
    appendEvent(eventInput(target.storePath, target.taskId, 'APPROVAL_REQUESTED', 7, overrides.requestPayload));
    return target;
  };
  const appendControl = (target, type, index, payload = undefined, extra = {}) => appendEvent(
    eventInput(target.storePath, target.taskId, type, index, payload, { idempotencyKey: `${type}-${index}`, ...extra }),
  );

  test('status and replay expose only bounded hashed pending evidence without granting consumable authority', () => {
    const target = pendingPlanning('c4b-pending-output');
    for (const output of [taskStatus({ storePath: target.storePath, taskId: target.taskId }),
      replayTaskState({ storePath: target.storePath, taskId: target.taskId }), verifyStore({ storePath: target.storePath })]) {
      expect(output).toMatchObject({ trusted: true, reconstructed_state: 'awaiting_approval', authority_ceiling: 'A1',
        authority_consumable: false, pending_approval_present: true, pending_approval_id_hash: HASH_B,
        pending_requested_authority: 'A1', pending_requested_action: 'build_fixture', suspended: false });
      expect(JSON.stringify(output)).not.toContain('external-approval-secret');
    }
  });

  test('grant while paused repairs the return state and resume restores exact planning state', () => {
    const target = pendingPlanning('c4b-grant-paused');
    appendControl(target, 'TASK_PAUSED', 8);
    appendControl(target, 'APPROVAL_GRANTED', 9);
    expect(taskStatus({ storePath: target.storePath, taskId: target.taskId })).toMatchObject({
      reconstructed_state: 'paused', pending_approval_present: false, suspended: true,
      suspension_kind: 'paused', suspension_return_status: 'planning', last_approval_status: 'granted',
      authority_ceiling: 'A1', authority_consumable: false,
    });
    appendControl(target, 'TASK_RESUMED', 10);
    expect(taskStatus({ storePath: target.storePath, taskId: target.taskId })).toMatchObject({
      trusted: true, reconstructed_state: 'planning', pending_approval_present: false, suspended: false,
      last_approval_status: 'granted', authority_ceiling: 'A1', authority_consumable: false,
    });
  });

  test('grant while blocked and rejection while either suspension is deterministic', () => {
    const granted = pendingPlanning('c4b-grant-blocked');
    appendControl(granted, 'TASK_BLOCKED', 8, { awaiting_user: true });
    appendControl(granted, 'APPROVAL_GRANTED', 9);
    expect(taskStatus({ storePath: granted.storePath, taskId: granted.taskId })).toMatchObject({
      reconstructed_state: 'blocked', suspension_return_status: 'planning', last_approval_status: 'granted',
    });
    appendControl(granted, 'TASK_RESUMED', 10);
    expect(taskStatus({ storePath: granted.storePath, taskId: granted.taskId }).reconstructed_state).toBe('planning');

    for (const suspension of ['TASK_PAUSED', 'TASK_BLOCKED']) {
      const target = pendingPlanning(`c4b-reject-${suspension.toLowerCase()}`);
      appendControl(target, suspension, 8);
      appendControl(target, 'APPROVAL_REJECTED', 9);
      expect(taskStatus({ storePath: target.storePath, taskId: target.taskId })).toMatchObject({
        reconstructed_state: 'rejected', terminal: true, pending_approval_present: false, suspended: false,
        last_approval_status: 'rejected', authority_consumable: false,
      });
      const before = storeRows(target.storePath).events.length;
      expect(() => appendControl(target, 'TASK_RESUMED', 10)).toThrow(/TASK_RESUME_INVALID/);
      expect(() => appendControl(target, 'PLAN_CREATED', 11)).toThrow(/INVALID_EVENT_TRANSITION/);
      expect(storeRows(target.storePath).events).toHaveLength(before);
    }
  });

  test('pending approval blocks ordinary progress while pause and block remain allowed', () => {
    for (const control of ['TASK_PAUSED', 'TASK_BLOCKED']) {
      const target = pendingPlanning(`c4b-control-${control.toLowerCase()}`);
      const before = storeRows(target.storePath).events.length;
      for (const type of ['RESEARCH_STARTED', 'PLAN_CREATED', 'TASK_COMPLETED']) {
        expect(() => appendControl(target, type, 8, undefined, { idempotencyKey: `blocked-${type}` }))
          .toThrow(/PENDING_APPROVAL_UNRESOLVED/);
      }
      expect(storeRows(target.storePath).events).toHaveLength(before);
      appendControl(target, control, 8);
      expect(taskStatus({ storePath: target.storePath, taskId: target.taskId })).toMatchObject({
        pending_approval_present: true, suspended: true, suspension_return_status: 'awaiting_approval',
      });
      expect(() => appendControl(target, 'PLAN_CREATED', 9)).toThrow(/PENDING_APPROVAL_UNRESOLVED/);
    }
  });

  test('linkage mismatch, duplicate resolution and approval ID reuse fail before append', () => {
    const target = pendingPlanning('c4b-linkage-replay');
    const before = storeRows(target.storePath).events.length;
    expect(() => appendControl(target, 'APPROVAL_GRANTED', 8, { approval_id_hash: HASH_A }))
      .toThrow(/APPROVAL_REFERENCE_MISMATCH/);
    expect(storeRows(target.storePath).events).toHaveLength(before);
    appendControl(target, 'APPROVAL_GRANTED', 8);
    expect(() => appendControl(target, 'APPROVAL_GRANTED', 9)).toThrow(/APPROVAL_ALREADY_RESOLVED/);
    expect(() => appendControl(target, 'APPROVAL_REJECTED', 10)).toThrow(/APPROVAL_ALREADY_RESOLVED/);
    expect(() => appendControl(target, 'APPROVAL_REQUESTED', 11)).toThrow(/APPROVAL_ID_REUSE_FORBIDDEN/);
  });

  test('request authority may equal ceiling but above-ceiling append fails without changing task authority', () => {
    const equal = initializedTask('c4b-authority-equal', { authorityCeiling: 'A2' });
    appendPlanning(equal.storePath, equal.taskId);
    appendControl(equal, 'APPROVAL_REQUESTED', 7, { requested_authority: 'A2' }, { authorityLevel: 'A1' });
    expect(taskStatus({ storePath: equal.storePath, taskId: equal.taskId })).toMatchObject({
      authority_ceiling: 'A2', pending_requested_authority: 'A2', authority_consumable: false,
    });
    const above = initializedTask('c4b-authority-above', { authorityCeiling: 'A1' });
    appendPlanning(above.storePath, above.taskId);
    const before = storeRows(above.storePath).events.length;
    expect(() => appendControl(above, 'APPROVAL_REQUESTED', 7, { requested_authority: 'A2' }))
      .toThrow(/APPROVAL_REQUEST_EXCEEDS_AUTHORITY_CEILING/);
    expect(storeRows(above.storePath).events).toHaveLength(before);
    expect(taskStatus({ storePath: above.storePath, taskId: above.taskId }).authority_ceiling).toBe('A1');
  });

  test.each([
    ['wrong approval cross-reference', 'APPROVAL_GRANTED', (payload) => { payload.approval_id_hash = HASH_A; }, 'APPROVAL_REFERENCE_MISMATCH'],
    ['above-ceiling request', 'APPROVAL_REQUESTED', (payload) => { payload.requested_authority = 'A2'; }, 'APPROVAL_REQUEST_EXCEEDS_AUTHORITY_CEILING'],
  ])('fully rehashed forged %s remains untrusted everywhere', (_label, eventType, mutatePayload, expectedCode) => {
    const target = initializedTask(`c4b-forged-${eventType.toLowerCase()}`);
    appendPlanning(target.storePath, target.taskId);
    if (eventType === 'APPROVAL_GRANTED') {
      appendControl(target, 'APPROVAL_REQUESTED', 7);
      appendControl(target, 'APPROVAL_GRANTED', 8);
      appendControl(target, 'PLAN_CREATED', 9);
    } else appendControl(target, 'APPROVAL_REQUESTED', 7);
    const sequence = eventType === 'APPROVAL_GRANTED' ? 8 : 7;
    const db = new DatabaseSync(target.storePath);
    rewriteAndRehashTaskChain(db, target.taskId, (rows) => {
      const row = rows[sequence - 1];
      const payload = parseStoredPayloadJson(row.payload_json).payload;
      mutatePayload(payload);
      row.payload_json = canonicalJson(payload);
      row.payload_hash = `sha256:${sha256Hex(row.payload_json)}`;
    });
    db.close();
    const verified = verifyTaskChain({ storePath: target.storePath, taskId: target.taskId });
    expect(verified.findings.map((finding) => finding.code)).toContain(expectedCode);
    expect(verified).toMatchObject({ trusted: false, reconstructed_state: null, authority_ceiling: null,
      authority_consumable: false, pending_approval_present: null, suspended: null });
    expect(verifyStore({ storePath: target.storePath })).toMatchObject({ trusted: false, reconstructed_state: null,
      authority_ceiling: null, authority_consumable: false, pending_approval_present: null, suspended: null });
    expect(taskStatus({ storePath: target.storePath, taskId: target.taskId })).toMatchObject({ trusted: false,
      reconstructed_state: null, authority_ceiling: null, authority_consumable: false,
      pending_approval_present: null, suspended: null });
    expect(() => replayTaskState({ storePath: target.storePath, taskId: target.taskId })).toThrow(/TASK_CHAIN_INVALID/);
    expect(() => appendControl(target, 'TASK_BLOCKED', 12)).toThrow(/EXISTING_EVENT_CHAIN_INVALID/);
  });

  test('fully rehashed expired grant is rejected by append and stored-chain chronology', () => {
    const target = pendingPlanning('c4b-expiry', {
      requestPayload: { expires_at: '2026-07-11T00:00:07.5Z' },
    });
    const before = storeRows(target.storePath).events.length;
    expect(() => appendControl(target, 'APPROVAL_GRANTED', 8)).toThrow(/APPROVAL_EXPIRED/);
    expect(storeRows(target.storePath).events).toHaveLength(before);

    appendControl(target, 'APPROVAL_REJECTED', 8);
    const db = new DatabaseSync(target.storePath);
    rewriteAndRehashTaskChain(db, target.taskId, (rows) => {
      const row = rows[7];
      row.event_type = 'APPROVAL_GRANTED';
      const payload = structuredClone(EVENT_PAYLOADS.APPROVAL_GRANTED);
      row.payload_json = canonicalJson(payload);
      row.payload_hash = `sha256:${sha256Hex(row.payload_json)}`;
    });
    db.close();
    expect(verifyTaskChain({ storePath: target.storePath, taskId: target.taskId }).findings.map((item) => item.code))
      .toContain('APPROVAL_EXPIRED');
  });

  test('resume restores reducer-derived state and nested suspension is rejected', () => {
    const target = initializedTask('c4b-suspension-derived');
    appendControl(target, 'CARD_ELIGIBILITY_EVALUATED', 2);
    appendControl(target, 'RESEARCH_STARTED', 3);
    appendControl(target, 'TASK_PAUSED', 4);
    expect(() => appendControl(target, 'TASK_BLOCKED', 5)).toThrow(/TASK_ALREADY_SUSPENDED/);
    expect(() => appendControl(target, 'TASK_PAUSED', 6)).toThrow(/TASK_ALREADY_SUSPENDED/);
    appendControl(target, 'TASK_RESUMED', 7);
    expect(taskStatus({ storePath: target.storePath, taskId: target.taskId })).toMatchObject({
      reconstructed_state: 'researching', suspended: false,
    });
    expect(() => appendControl(target, 'TASK_RESUMED', 8)).toThrow(/TASK_NOT_SUSPENDED/);
  });
});

describe('C3B store snapshot, policy marker and initialization authority', () => {
  const bin = new URL('../bin/kanban-autonomy-store', import.meta.url);
  const cli = (args, input = '') => spawnSync(process.execPath, [bin.pathname, ...args], {
    input, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  const cliArgs = (command, storePath, taskId = null) => [
    command, '--json', '--temp-store', ...(new Set(['init', 'create-task', 'append-event']).has(command) ? ['--allow-temp-write'] : []),
    '--store', storePath, ...(taskId ? ['--task-id', taskId] : []),
  ];
  const enableWal = (storePath) => {
    const db = new DatabaseSync(storePath);
    try { expect(db.prepare('PRAGMA journal_mode=WAL').get().journal_mode).toBe('wal'); }
    finally { db.close(); }
  };
  const tamperPolicyMarker = (storePath, value) => {
    const db = new DatabaseSync(storePath);
    try {
      db.exec('PRAGMA ignore_check_constraints=ON');
      if (value === null) db.prepare("DELETE FROM store_meta WHERE key='state_policy_version'").run();
      else db.prepare("UPDATE store_meta SET value=? WHERE key='state_policy_version'").run(value);
    } finally { db.close(); }
  };

  test('verifyStore holds one read snapshot while a complete task/event transaction commits', () => {
    const target = initializedTask('snapshot-task-target');
    const donor = initializedTask('snapshot-task-donor', {
      boardSlug: 'fixture-board-b', kanbanCardId: 'fixture-card-b', idempotencyKey: 'task-create-b',
    });
    const donorRows = storeRows(donor.storePath);
    enableWal(target.storePath);
    let hookCalls = 0;
    const first = verifyStore({ storePath: target.storePath }, { testHooks: {
      afterVerifySnapshotEstablished() {
        hookCalls += 1;
        const writer = new DatabaseSync(target.storePath);
        try {
          writer.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
          insertRawTask(writer, donorRows.tasks[0]);
          insertRawEvent(writer, donorRows.events[0]);
          writer.exec('COMMIT');
        } finally { writer.close(); }
      },
    } });
    expect(hookCalls).toBe(1);
    expect(first).toMatchObject({
      valid: true, trusted: true, checked_tasks: 1, checked_events: 1,
      snapshot_consistent: true, snapshot_transaction: 'read_only',
    });
    expect(first.reconstructed_state).toBe('created');
    expect(verifyStore({ storePath: target.storePath })).toMatchObject({ valid: true, checked_tasks: 2, checked_events: 2 });
  });

  test('verifyStore holds the old complete chain while an event append commits', () => {
    const target = initializedTask('snapshot-event-target');
    const donor = initializedTask('snapshot-event-donor');
    appendEvent(eventInput(donor.storePath, donor.taskId, 'CARD_ELIGIBILITY_EVALUATED', 2));
    const appended = storeRows(donor.storePath).events[1];
    enableWal(target.storePath);
    const first = verifyStore({ storePath: target.storePath }, { testHooks: {
      afterVerifySnapshotEstablished() {
        const writer = new DatabaseSync(target.storePath);
        try { writer.exec('BEGIN IMMEDIATE'); insertRawEvent(writer, appended); writer.exec('COMMIT'); }
        finally { writer.close(); }
      },
    } });
    expect(first).toMatchObject({ valid: true, checked_tasks: 1, checked_events: 1, reconstructed_state: 'created' });
    expect(verifyStore({ storePath: target.storePath })).toMatchObject({
      valid: true, checked_tasks: 1, checked_events: 2, reconstructed_state: 'triaged',
    });
  });

  test('verifyStore rolls back its explicit read transaction on valid and invalid results without writing', () => {
    const { storePath } = initializedTask('snapshot-rollback');
    const before = readFileSync(storePath);
    const transactions = [];
    expect(verifyStore({ storePath }, { testHooks: {
      beforeVerifyTaskEnumeration({ db }) { transactions.push(db.isTransaction); },
      beforeVerifyTransactionRollback({ db }) { transactions.push(db.isTransaction); },
    } })).toMatchObject({ valid: true, snapshot_consistent: true });
    expect(transactions).toEqual([true, true]);
    expect(readFileSync(storePath)).toEqual(before);

    const corrupt = new DatabaseSync(storePath);
    corrupt.prepare("UPDATE durable_events SET payload_hash=? WHERE sequence=1").run(HASH_B);
    corrupt.close();
    let invalidRollbackWasActive = false;
    expect(verifyStore({ storePath }, { testHooks: {
      beforeVerifyTransactionRollback({ db }) { invalidRollbackWasActive = db.isTransaction; },
    } })).toMatchObject({ valid: false, trusted: false });
    expect(invalidRollbackWasActive).toBe(true);
    const lockProbe = new DatabaseSync(storePath);
    expect(() => lockProbe.exec('BEGIN IMMEDIATE; ROLLBACK')).not.toThrow();
    lockProbe.close();
  });

  test('verifyStore rollback still occurs when a private rollback hook fails', () => {
    const { storePath } = initializedTask('snapshot-hook-failure');
    expect(() => verifyStore({ storePath }, { testHooks: {
      beforeVerifyTransactionRollback({ db }) { expect(db.isTransaction).toBe(true); throw new Error('synthetic hook failure'); },
    } })).toThrow(/synthetic hook failure/);
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_events: 1 });
  });

  test.each([
    ['missing', null], ['empty', ''], ['future', 'kanban-autonomy-state.v999'], ['arbitrary', 'arbitrary-policy'],
  ])('state_policy_version %s fails closed without automatic repair', (_label, marker) => {
    const { storePath, taskId } = initializedTask(`policy-${_label}`);
    tamperPolicyMarker(storePath, marker);
    const before = storeRows(storePath);
    expect(() => initStore({ storePath })).toThrow(/UNSUPPORTED_STATE_POLICY_VERSION/);
    expect(() => createTask(baseTask(storePath, { boardSlug: 'other', kanbanCardId: 'other', idempotencyKey: 'other' })))
      .toThrow(/UNSUPPORTED_STATE_POLICY_VERSION/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2)))
      .toThrow(/UNSUPPORTED_STATE_POLICY_VERSION/);
    expect(() => taskStatus({ storePath, taskId })).toThrow(/UNSUPPORTED_STATE_POLICY_VERSION/);
    expect(() => verifyStore({ storePath })).toThrow(/UNSUPPORTED_STATE_POLICY_VERSION/);
    expect(() => replayTaskState({ storePath, taskId })).toThrow(/UNSUPPORTED_STATE_POLICY_VERSION/);
    expect(storeRows(storePath)).toEqual(before);
  });

  test('the current immutable state policy marker is accepted and written exactly once', () => {
    const storePath = tempStore('policy-current');
    expect(initStore({ storePath })).toMatchObject({ initialized: true, state_policy_version: STATE_POLICY_VERSION });
    expect(initStore({ storePath })).toMatchObject({ initialized: false, state_policy_version: STATE_POLICY_VERSION, temp_store_write: false });
    const db = new DatabaseSync(storePath, { readOnly: true });
    expect(db.prepare("SELECT value FROM store_meta WHERE key='state_policy_version'").all()).toEqual([{ value: STATE_POLICY_VERSION }]);
    db.close();
  });

  test('every CLI store command rejects an unsupported policy marker without row mutation', () => {
    const { storePath, taskId } = initializedTask('policy-all-cli');
    tamperPolicyMarker(storePath, 'kanban-autonomy-state.v999');
    const before = storeRows(storePath);
    const createInput = baseTask(undefined, {
      storePath: undefined, boardSlug: 'future-board', kanbanCardId: 'future-card', idempotencyKey: 'future-task',
    });
    const appendInput = eventInput(undefined, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2); delete appendInput.storePath;
    const probes = [
      ['init', null, ''], ['create-task', null, JSON.stringify(createInput)],
      ['append-event', null, JSON.stringify(appendInput)], ['status', taskId, ''],
      ['verify', null, ''], ['verify', taskId, ''], ['replay', taskId, ''],
      ['projection-preview', null, JSON.stringify({ taskState: 'created', currentCardStatus: 'todo' })],
    ];
    for (const [command, id, input] of probes) {
      const result = cli(cliArgs(command, storePath, id), input);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim()).toBe('UNSUPPORTED_STATE_POLICY_VERSION');
      expect(result.stderr).not.toContain(storePath);
    }
    expect(storeRows(storePath)).toEqual(before);
  });

  test.each(['afterInitTransactionBegan', 'afterSchemaCreatedBeforeMetadata', 'afterMetadataInsertedBeforeInitCommit'])
  ('initialization failure at %s rolls back every schema and metadata write', (hookName) => {
    const storePath = tempStore(`init-failure-${hookName}`);
    expect(() => initStore({ storePath }, { testHooks: {
      [hookName]({ db }) { expect(db.isTransaction).toBe(true); throw new Error('synthetic init failure'); },
    } })).toThrow(/synthetic init failure/);
    const db = new DatabaseSync(storePath, { readOnly: true });
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all()).toEqual([]);
    expect(Number(db.prepare('PRAGMA user_version').get().user_version)).toBe(0);
    db.close();
    expect(initStore({ storePath })).toMatchObject({ initialized: true });
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_tasks: 0, checked_events: 0 });
  });

  test('partial initialization is rejected and is not completed automatically', () => {
    const storePath = tempStore('partial-init');
    const db = new DatabaseSync(storePath);
    db.exec('CREATE TABLE store_meta(key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL) STRICT');
    db.close(); chmodSync(storePath, 0o600);
    const before = readFileSync(storePath);
    expect(() => initStore({ storePath })).toThrow(/STORE_SCHEMA_PARTIAL_INITIALIZATION/);
    expect(readFileSync(storePath)).toEqual(before);
  });

  test('two and four concurrent initializers serialize from the first schema check', async () => {
    for (const count of [2, 4]) {
      const directory = `/tmp/hermes-kan-autonomy-concurrent-init-${count}-${process.pid}-${Date.now()}`;
      createdDirectories.push(directory);
      const storePath = path.join(directory, STORE_DATABASE_NAME);
      const args = cliArgs('init', storePath);
      const results = await Promise.all(Array.from({ length: count }, () => runCliAsync(bin, args, '')));
      expect(results.every((result) => result.status === 0)).toBe(true);
      const initialized = results.map((result) => JSON.parse(result.stdout).initialized);
      expect(initialized.filter(Boolean)).toHaveLength(1);
      expect(initialized.filter((value) => !value)).toHaveLength(count - 1);
      const db = new DatabaseSync(storePath, { readOnly: true });
      expect(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map((row) => row.name))
        .toEqual(['durable_events', 'durable_tasks', 'store_meta']);
      expect(db.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL ORDER BY name").all().map((row) => row.name))
        .toEqual(['durable_events_task_sequence']);
      expect(db.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok');
      expect(db.prepare("SELECT key, count(*) AS count FROM store_meta GROUP BY key ORDER BY key").all())
        .toEqual([{ key: 'schema_version', count: 1 }, { key: 'state_policy_version', count: 1 }]);
      db.close();
    }
  });
});

describe('descriptor-anchored secure store opening', () => {
  test('normal init uses the held directory descriptor path', () => {
    const storePath = tempStore('anchored-init');
    let receivedPath;
    const result = initStore({ storePath }, { testHooks: {
      databaseFactory(databasePath, options) {
        receivedPath = databasePath;
        return new DatabaseSync(databasePath, options);
      },
    } });
    expect(result.initialized).toBe(true);
    expect(receivedPath).toMatch(/^\/proc\/self\/fd\/\d+\/kanban-autonomy\.db$/);
    expect(receivedPath).not.toBe(storePath);
  });

  test('normal reopen uses the descriptor anchor', () => {
    const storePath = tempStore('anchored-reopen'); initStore({ storePath });
    let receivedPath;
    const result = createTask(baseTask(storePath), { testHooks: {
      databaseFactory(databasePath, options) {
        receivedPath = databasePath;
        return new DatabaseSync(databasePath, options);
      },
    } });
    expect(result.created).toBe(true);
    expect(receivedPath).toMatch(/^\/proc\/self\/fd\/\d+\/kanban-autonomy\.db$/);
  });

  test('read-only commands use the same anchored read-only open', () => {
    const { storePath, taskId } = initializedTask('anchored-read');
    let received;
    const status = taskStatus({ storePath, taskId }, { testHooks: {
      databaseFactory(databasePath, options) {
        received = { databasePath, options };
        return new DatabaseSync(databasePath, options);
      },
    } });
    expect(status.task.task_id).toBe(taskId);
    expect(received.databasePath).toMatch(/^\/proc\/self\/fd\/\d+\/kanban-autonomy\.db$/);
    expect(received.options.readOnly).toBe(true);
  });

  test('DatabaseSync never receives the original user pathname', () => {
    const storePath = tempStore('never-raw-path');
    initStore({ storePath }, { testHooks: {
      databaseFactory(databasePath, options) {
        expect(databasePath).not.toBe(storePath);
        expect(databasePath).toContain('/proc/self/fd/');
        return new DatabaseSync(databasePath, options);
      },
    } });
  });

  test('parent directory renamed after validation fails closed', () => {
    const { storePath, taskId } = initializedTask('parent-renamed');
    const directory = path.dirname(storePath);
    expect(() => taskStatus({ storePath, taskId }, { testHooks: {
      afterParentValidated() {
        const held = `${directory}-renamed`;
        renameSync(directory, held);
        createdDirectories.push(held);
      },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
  });

  test('replacement directory installed at the original pathname fails closed', () => {
    const { storePath, taskId } = initializedTask('parent-replaced');
    expect(() => taskStatus({ storePath, taskId }, { testHooks: {
      afterParentValidated({ directory }) { installReplacementDirectory(directory); },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
  });

  test('database directory entry replaced after descriptor validation fails closed', () => {
    const { storePath, taskId } = initializedTask('db-entry-replaced');
    const replacement = tempStore('db-entry-source'); initStore({ storePath: replacement });
    expect(() => taskStatus({ storePath, taskId }, { testHooks: {
      afterDatabaseDescriptorValidated(context) { replaceDatabaseEntry(context, replacement); },
    } })).toThrow(/SQLITE_OPENED_STORE_IDENTITY_UNPROVEN|STORE_PATH_IDENTITY_CHANGED/);
  });

  test('database replaced with a symlink before SQLite open fails closed', () => {
    const { storePath, taskId } = initializedTask('db-symlink-race');
    const replacement = tempStore('db-symlink-target'); initStore({ storePath: replacement });
    expect(() => taskStatus({ storePath, taskId }, { testHooks: {
      afterDatabaseDescriptorValidated(context) { replaceDatabaseEntry(context, replacement, 'symlink'); },
    } })).toThrow(/SQLITE_OPENED_STORE_IDENTITY_UNPROVEN|STORE_PATH_IDENTITY_CHANGED/);
  });

  test('database replaced with a hard link before SQLite open fails closed', () => {
    const { storePath, taskId } = initializedTask('db-hardlink-race');
    expect(() => taskStatus({ storePath, taskId }, { testHooks: {
      afterDatabaseDescriptorValidated(context) { replaceDatabaseEntry(context, null, 'hardlink'); },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
  });

  test('parent mode changed before SQLite open fails closed', () => {
    const { storePath, taskId } = initializedTask('parent-mode-open');
    expect(() => taskStatus({ storePath, taskId }, { testHooks: {
      afterDatabaseDescriptorValidated({ directory }) { chmodSync(directory, 0o755); },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
  });

  test('parent identity changed before BEGIN fails closed', () => {
    const storePath = tempStore('parent-before-begin'); initStore({ storePath });
    expect(() => createTask(baseTask(storePath), { testHooks: {
      beforeTransaction({ directory }) { installReplacementDirectory(directory); },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
  });

  test('database identity changed before BEGIN fails closed', () => {
    const storePath = tempStore('db-before-begin'); initStore({ storePath });
    const replacement = tempStore('db-before-begin-source'); initStore({ storePath: replacement });
    expect(() => createTask(baseTask(storePath), { testHooks: {
      beforeTransaction(context) { replaceDatabaseEntry(context, replacement); },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
  });

  test('parent identity changed before COMMIT rolls back', () => {
    const storePath = tempStore('parent-before-commit'); initStore({ storePath });
    let heldDirectory;
    expect(() => createTask(baseTask(storePath), { testHooks: {
      beforeCommit({ directory }) { heldDirectory = installReplacementDirectory(directory); },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
    const db = new DatabaseSync(path.join(heldDirectory, STORE_DATABASE_NAME), { readOnly: true });
    expect(Number(db.prepare('SELECT count(*) AS count FROM durable_tasks').get().count)).toBe(0);
    db.close();
  });

  test('database entry changed before COMMIT rolls back', () => {
    const storePath = tempStore('db-before-commit'); initStore({ storePath });
    const replacement = tempStore('db-before-commit-source'); initStore({ storePath: replacement });
    expect(() => createTask(baseTask(storePath), { testHooks: {
      beforeCommit(context) { replaceDatabaseEntry(context, replacement); },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
    const heldPath = `${storePath}.held`;
    const db = new DatabaseSync(heldPath, { readOnly: true });
    expect(Number(db.prepare('SELECT count(*) AS count FROM durable_tasks').get().count)).toBe(0);
    db.close();
  });

  test('database mode changed before COMMIT rolls back', () => {
    const storePath = tempStore('db-mode-commit'); initStore({ storePath });
    expect(() => createTask(baseTask(storePath), { testHooks: {
      beforeCommit({ anchoredStorePath }) { chmodSync(anchoredStorePath, 0o640); },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
    chmodSync(storePath, 0o600);
    expect(verifyStore({ storePath }).checked_tasks).toBe(0);
  });

  test('database link count changed before COMMIT rolls back', () => {
    const storePath = tempStore('db-link-commit'); initStore({ storePath });
    expect(() => createTask(baseTask(storePath), { testHooks: {
      beforeCommit({ anchoredStorePath }) { linkSync(anchoredStorePath, `${anchoredStorePath}.extra-link`); },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
    rmSync(`${storePath}.extra-link`);
    expect(verifyStore({ storePath }).checked_tasks).toBe(0);
  });

  test('identity mismatch causes transaction rollback with no reported success', () => {
    const storePath = tempStore('rollback-proof'); initStore({ storePath });
    let returned = false;
    try {
      createTask(baseTask(storePath), { testHooks: {
        beforeCommit({ anchoredStorePath }) { chmodSync(anchoredStorePath, 0o644); },
      } });
      returned = true;
    } catch (error) {
      expect(error.code).toBe('STORE_PATH_IDENTITY_CHANGED');
    }
    expect(returned).toBe(false);
    chmodSync(storePath, 0o600);
    expect(verifyStore({ storePath }).checked_tasks).toBe(0);
  });

  test('replacement target remains byte-identical', () => {
    const storePath = tempStore('replacement-bytes'); initStore({ storePath });
    const replacement = tempStore('replacement-bytes-source'); initStore({ storePath: replacement });
    const before = readFileSync(replacement);
    expect(() => createTask(baseTask(storePath), { testHooks: {
      beforeCommit(context) { replaceDatabaseEntry(context, replacement); },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
    expect(readFileSync(replacement)).toEqual(before);
  });

  test('unrelated file remains byte-identical during a rejected race', () => {
    const storePath = tempStore('unrelated-file'); initStore({ storePath });
    const sentinel = path.join(path.dirname(storePath), 'unrelated.bin');
    writeFileSync(sentinel, Buffer.from('unchanged-sentinel'));
    const before = readFileSync(sentinel);
    expect(() => createTask(baseTask(storePath), { testHooks: {
      beforeCommit({ anchoredStorePath }) { chmodSync(anchoredStorePath, 0o640); },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
    expect(readFileSync(sentinel)).toEqual(before);
  });

  test('held descriptors are closed after success', () => {
    const storePath = tempStore('fd-success');
    const descriptors = [];
    initStore({ storePath }, { testHooks: { afterDatabaseDescriptorValidated: descriptorCapture(descriptors) } });
    expectDescriptorsClosed(descriptors);
  });

  test('held descriptors are closed after constructor failure', () => {
    const storePath = tempStore('fd-constructor');
    const descriptors = [];
    expect(() => initStore({ storePath }, { testHooks: {
      afterDatabaseDescriptorValidated: descriptorCapture(descriptors),
      databaseFactory() { throw new Error('synthetic constructor failure'); },
    } })).toThrow(/synthetic constructor failure/);
    expectDescriptorsClosed(descriptors);
  });

  test('held descriptors are closed after identity failure', () => {
    const storePath = tempStore('fd-identity');
    const descriptors = [];
    const fakeDb = { close() {}, prepare() { throw new Error('must not reach pragma'); } };
    expect(() => initStore({ storePath }, { testHooks: {
      afterDatabaseDescriptorValidated: descriptorCapture(descriptors),
      databaseFactory() { return fakeDb; },
    } })).toThrow(/SQLITE_OPENED_STORE_IDENTITY_UNPROVEN/);
    expectDescriptorsClosed(descriptors);
  });

  test('held descriptors are closed after SQL failure', () => {
    const { storePath } = initializedTask('fd-sql');
    const descriptors = [];
    expect(() => createTask(baseTask(storePath, { cardSnapshotHash: HASH_B }), { testHooks: {
      beforeTransaction: descriptorCapture(descriptors),
    } })).toThrow(/TASK_CREATION_IDEMPOTENCY_CONFLICT/);
    expectDescriptorsClosed(descriptors);
  });

  test('descriptor enumeration tolerates disappearing descriptors', () => {
    const storePath = tempStore('fd-disappear');
    initStore({ storePath }, { testHooks: {
      afterSqliteOpenedBeforeIdentityProof() {
        const probe = openSync(storePath, fsConstants.O_RDONLY);
        closeSync(probe);
      },
    } });
    expect(verifyStore({ storePath }).valid).toBe(true);
  });

  test('identity proof is device/inode multiset based, not descriptor-number based', () => {
    const source = readFileSync(new URL('./kanban-autonomy-store.mjs', import.meta.url), 'utf8');
    expect(source).toContain('descriptorIdentityMultiset');
    expect(source).toContain('stat.dev');
    expect(source).toContain('stat.ino');
    expect(source).toContain('matchingCount <= preOpenIdentityCount');
    expect(source).not.toMatch(/sqliteDescriptor\s*=\s*\d/);
  });

  test('failure to prove the actual SQLite-opened inode fails closed', () => {
    const storePath = tempStore('identity-unproven');
    const fakeDb = { close() {}, prepare() { throw new Error('must not reach pragma'); } };
    expect(() => initStore({ storePath }, { testHooks: {
      databaseFactory() { return fakeDb; },
    } })).toThrow(/SQLITE_OPENED_STORE_IDENTITY_UNPROVEN/);
    expect(existsSync(storePath)).toBe(true);
    expect(lstatSync(storePath).size).toBe(0);
  });

  test('/proc/self/fd unavailable fails closed with the stable platform code', () => {
    const storePath = tempStore('proc-unavailable');
    const missingProc = `/tmp/hermes-kan-autonomy-missing-proc-${process.pid}`;
    expect(() => initStore({ storePath }, { testHooks: { procFdRoot: missingProc } }))
      .toThrow(/SECURE_STORE_OPEN_UNAVAILABLE/);
    expect(existsSync(storePath)).toBe(false);
  });

  test('no ordinary pathname fallback exists', () => {
    const source = readFileSync(new URL('./kanban-autonomy-store.mjs', import.meta.url), 'utf8');
    expect(source.match(/new DatabaseSync\(/g)).toHaveLength(1);
    expect(source).toContain('new DatabaseSync(databasePath, options)');
    expect(source).not.toContain('new DatabaseSync(storePath');
    expect(source).not.toContain('openDatabase(');
  });

  test('identity is rechecked after COMMIT before success is reported', () => {
    const storePath = tempStore('after-commit'); initStore({ storePath });
    let heldDirectory;
    expect(() => createTask(baseTask(storePath), { testHooks: {
      afterCommit({ directory }) { heldDirectory = installReplacementDirectory(directory); },
    } })).toThrow(/STORE_PATH_IDENTITY_CHANGED/);
    const db = new DatabaseSync(path.join(heldDirectory, STORE_DATABASE_NAME), { readOnly: true });
    expect(Number(db.prepare('SELECT count(*) AS count FROM durable_tasks').get().count)).toBe(1);
    db.close();
  });
});

describe('strict JSON CLI and static safety', () => {
  const bin = new URL('../bin/kanban-autonomy-store', import.meta.url);
  const run = (args, input = '') => spawnSync(process.execPath, [bin.pathname, ...args], {
    input, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });

  test('importing the real wrapper is inert even with write-shaped CLI operands', () => {
    const storePath = tempStore('wrapper-import-inert');
    const directory = path.dirname(storePath);
    const importerEntrypoint = new URL(import.meta.url).pathname;
    const importScript = `
      const initialExitCode = process.exitCode;
      await import(${JSON.stringify(bin.href)});
      if (process.exitCode !== initialExitCode) throw new Error('WRAPPER_IMPORT_CHANGED_EXIT_STATE');
    `;
    try {
      const result = spawnSync(process.execPath, [
        '--input-type=module', '--eval', importScript, importerEntrypoint,
        'init', '--json', '--temp-store', '--allow-temp-write', '--store', storePath,
      ], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(existsSync(storePath)).toBe(false);
      expect(existsSync(`${storePath}-wal`)).toBe(false);
      expect(existsSync(`${storePath}-shm`)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    expect(existsSync(directory)).toBe(false);
  });

  test('package-bin symlink direct invocation reaches the CLI instead of silently succeeding as a no-op', () => {
    const directory = mkdtempSync('/tmp/hermes-kan-autonomy-package-bin-');
    chmodSync(directory, 0o700);
    createdDirectories.push(directory);
    const packageBinDirectory = path.join(directory, 'node_modules', '.bin');
    mkdirSync(packageBinDirectory, { recursive: true, mode: 0o700 });
    const packageBin = path.join(packageBinDirectory, 'kanban-autonomy-store');
    const storePath = path.join(directory, STORE_DATABASE_NAME);
    symlinkSync(bin.pathname, packageBin);
    try {
      const result = spawnSync(process.execPath, [
        packageBin, 'init', '--json', '--temp-store', '--allow-temp-write', '--store', storePath,
      ], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
      const packageBinSilentNoop = result.status === 0 && result.stdout === '' && result.stderr === ''
        && !existsSync(storePath) && !existsSync(`${storePath}-wal`) && !existsSync(`${storePath}-shm`);
      expect(
        packageBinSilentNoop,
        'PACKAGE_BIN_SYMLINK_SILENT_NOOP: symlink invocation exited 0 without CLI JSON or store initialization',
      ).toBe(false);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.trim().split('\n')).toHaveLength(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        production_store_write: false, temp_store_write: true, kanban_write: false,
        network_calls: false, model_calls: false,
      });
      expect(existsSync(storePath)).toBe(true);
      expect(existsSync(`${storePath}-wal`)).toBe(false);
      expect(existsSync(`${storePath}-shm`)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    expect(existsSync(directory)).toBe(false);
  });

  test('CLI enforces JSON/temp/store/write gates and has no hidden default', () => {
    const storePath = tempStore('cli-gates');
    for (const args of [
      ['init', '--temp-store', '--store', storePath, '--allow-temp-write'],
      ['init', '--json', '--store', storePath, '--allow-temp-write'],
      ['init', '--json', '--temp-store', '--allow-temp-write'],
      ['init', '--json', '--temp-store', '--store', storePath],
    ]) expect(run(args).status).not.toBe(0);
    expect(existsSync(storePath)).toBe(false);
  });
  test('unknown flags, commands and flag-like operands fail closed', () => {
    const storePath = tempStore('cli-flags');
    expect(run(['unknown', '--json', '--temp-store', '--store', storePath]).status).not.toBe(0);
    expect(run(['init', '--json', '--temp-store', '--store', '--allow-temp-write']).status).not.toBe(0);
    expect(run(['init', '--json', '--temp-store', '--store', storePath, '--allow-temp-write', '--output-file', '/tmp/out']).status).not.toBe(0);
  });
  test('successful stdout is one JSON document with accurate side effects', () => {
    const storePath = tempStore('cli-success');
    const result = run(['init', '--json', '--temp-store', '--allow-temp-write', '--store', storePath]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({ production_store_write: false, temp_store_write: true, kanban_write: false, network_calls: false, model_calls: false });
  });
  test('CLI create, append, status, verify, replay and projection stay JSON-only', () => {
    const storePath = tempStore('cli-flow');
    expect(run(['init', '--json', '--temp-store', '--allow-temp-write', '--store', storePath]).status).toBe(0);
    const taskResult = run(['create-task', '--json', '--temp-store', '--allow-temp-write', '--store', storePath], JSON.stringify(baseTask(undefined, { storePath: undefined })));
    expect(taskResult.status).toBe(0);
    const taskId = JSON.parse(taskResult.stdout).task.task_id;
    const firstEvent = eventInput(undefined, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2); delete firstEvent.storePath;
    expect(run(['append-event', '--json', '--temp-store', '--allow-temp-write', '--store', storePath], JSON.stringify(firstEvent)).status).toBe(0);
    for (const command of ['status', 'verify', 'replay']) {
      const result = run([command, '--json', '--temp-store', '--store', storePath, '--task-id', taskId]);
      expect(result.status).toBe(0); expect(() => JSON.parse(result.stdout)).not.toThrow();
    }
    const projection = run(['projection-preview', '--json', '--temp-store', '--store', storePath], JSON.stringify({ taskState: 'created', currentCardStatus: 'todo' }));
    expect(JSON.parse(projection.stdout)).toMatchObject({ projection_performed: false, kanban_write: false, temp_store_write: false });
  });
  test('CLI rejects malformed task/event hashes and timestamp regression without success JSON or row mutation', () => {
    const storePath = tempStore('cli-c4a-fail-closed');
    expect(run(['init', '--json', '--temp-store', '--allow-temp-write', '--store', storePath]).status).toBe(0);
    const malformed = `sha256:${'A'.repeat(64)}`;
    const badTask = baseTask(undefined, { storePath: undefined, sourceIdentityHash: malformed });
    let result = run(['create-task', '--json', '--temp-store', '--allow-temp-write', '--store', storePath], JSON.stringify(badTask));
    expect(result.status).not.toBe(0); expect(result.stdout).toBe(''); expect(result.stderr.trim()).toBe('MALFORMED_HASH');
    expect(result.stderr).not.toContain(malformed);
    expect(storeRows(storePath)).toMatchObject({ tasks: [], events: [] });

    const created = run(
      ['create-task', '--json', '--temp-store', '--allow-temp-write', '--store', storePath],
      JSON.stringify(baseTask(undefined, { storePath: undefined })),
    );
    const taskId = JSON.parse(created.stdout).task.task_id;
    const before = storeRows(storePath).events.length;
    const badEvent = eventInput(undefined, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2, undefined, { actorIdHash: malformed });
    delete badEvent.storePath;
    result = run(['append-event', '--json', '--temp-store', '--allow-temp-write', '--store', storePath], JSON.stringify(badEvent));
    expect(result.status).not.toBe(0); expect(result.stdout).toBe(''); expect(result.stderr.trim()).toBe('MALFORMED_HASH');
    expect(result.stderr).not.toContain(malformed);

    const regression = eventInput(undefined, taskId, 'CARD_ELIGIBILITY_EVALUATED', 3, undefined, {
      occurredAt: '2026-07-10T23:59:59.999999999Z',
    });
    delete regression.storePath;
    result = run(['append-event', '--json', '--temp-store', '--allow-temp-write', '--store', storePath], JSON.stringify(regression));
    expect(result.status).not.toBe(0); expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('EVENT_TIMESTAMP_REGRESSION');
    expect(storeRows(storePath).events).toHaveLength(before);
  });
  test('failures are nonzero, sanitized and never emit misleading success JSON', () => {
    const result = run(['init', '--json', '--temp-store', '--allow-temp-write', '--store', '/root/.hermes/kanban-autonomy.db']);
    expect(result.status).not.toBe(0); expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('PRODUCTION_DURABLE_STORE_DISABLED');
    expect(result.stderr).not.toContain('/root/.hermes');
  });
  test('stdin control fields cannot override --store or CLI safety gates', () => {
    const storeA = tempStore('cli-authority-a'); initStore({ storePath: storeA });
    const storeB = tempStore('cli-authority-b'); initStore({ storePath: storeB });
    const thirdStore = tempStore('cli-authority-third');
    const args = ['create-task', '--json', '--temp-store', '--allow-temp-write', '--store', storeA];
    const controls = {
      store: storeB, storePath: storeB, store_path: storeB, tempStore: true, temp_store: true,
      allowTempWrite: true, allow_temp_write: true, json: true, command: 'init', output: '--store',
      outputFile: thirdStore, output_file: thirdStore, inputFile: '--allow-temp-write', input_file: thirdStore,
    };
    for (const [field, value] of Object.entries(controls)) {
      const beforeA = readFileSync(storeA); const beforeB = readFileSync(storeB);
      const result = run(args, JSON.stringify({ ...baseTask(undefined, { storePath: undefined }), [field]: value }));
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim()).toBe('CLI_CONTROL_FIELD_FORBIDDEN');
      expect(result.stderr).not.toContain(storeA); expect(result.stderr).not.toContain(storeB);
      expect(readFileSync(storeA)).toEqual(beforeA); expect(readFileSync(storeB)).toEqual(beforeB);
      expect(existsSync(thirdStore)).toBe(false);
    }
    const duplicateSpellings = run(args, JSON.stringify({
      ...baseTask(undefined, { storePath: undefined }), store: storeB, storePath: '--store', tempStore: true,
    }));
    expect(duplicateSpellings.status).not.toBe(0);
    expect(duplicateSpellings.stderr.trim()).toBe('CLI_CONTROL_FIELD_FORBIDDEN');
  });

  test('append-event stdin cannot redirect to another store and unknown roots fail closed', () => {
    const { storePath: storeA, taskId } = initializedTask('cli-append-authority-a');
    const storeB = tempStore('cli-append-authority-b'); initStore({ storePath: storeB });
    const args = ['append-event', '--json', '--temp-store', '--allow-temp-write', '--store', storeA];
    const base = eventInput(undefined, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2); delete base.storePath;
    for (const control of [{ storePath: storeB }, { store: storeB }, { tempStore: true }, { allowTempWrite: true }]) {
      const beforeA = readFileSync(storeA); const beforeB = readFileSync(storeB);
      const result = run(args, JSON.stringify({ ...base, ...control }));
      expect(result.status).not.toBe(0); expect(result.stdout).toBe('');
      expect(result.stderr.trim()).toBe('CLI_CONTROL_FIELD_FORBIDDEN');
      expect(readFileSync(storeA)).toEqual(beforeA); expect(readFileSync(storeB)).toEqual(beforeB);
    }
    const unknown = run(args, JSON.stringify({ ...base, untrustedRoot: 'synthetic' }));
    expect(unknown.status).not.toBe(0); expect(unknown.stderr.trim()).toBe('CLI_INPUT_FIELD_UNSUPPORTED');
    expect(taskStatus({ storePath: storeA, taskId }).event_count).toBe(1);
  });

  test('no-input commands reject piped JSON and private hook names are unavailable to CLI', () => {
    const { storePath, taskId } = initializedTask('cli-no-input');
    for (const [command, extra] of [
      ['init', ['--allow-temp-write']], ['status', ['--task-id', taskId]], ['verify', []], ['replay', ['--task-id', taskId]],
    ]) {
      const result = run([command, '--json', '--temp-store', ...extra, '--store', storePath], '{"afterVerifySnapshotEstablished":true}');
      expect(result.status).not.toBe(0); expect(result.stdout).toBe('');
      expect(result.stderr.trim()).toBe('CLI_INPUT_FIELD_UNSUPPORTED');
    }
    expect(run(['verify', '--json', '--temp-store', '--store', storePath], '  \n\t').status).toBe(0);
  });

  test('legitimate nested event payload content cannot affect CLI routing', () => {
    const { storePath, taskId } = initializedTask('cli-nested-authority');
    const storeB = tempStore('cli-nested-authority-b'); initStore({ storePath: storeB });
    const input = eventInput(undefined, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2, {
      eligible: false, reason_codes: [`STORE_PATH_${sha256Hex(storeB).slice(0, 8).toUpperCase()}`],
    });
    delete input.storePath;
    const result = run(['append-event', '--json', '--temp-store', '--allow-temp-write', '--store', storePath], JSON.stringify(input));
    expect(result.status).toBe(0);
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_events: 2 });
    expect(verifyStore({ storePath: storeB })).toMatchObject({ valid: true, checked_events: 0 });
  });

  test('append-event CLI rejects duplicate, deep, oversized and nested-sensitive stdin without append', () => {
    const storePath = tempStore('cli-payload-security');
    expect(run(['init', '--json', '--temp-store', '--allow-temp-write', '--store', storePath]).status).toBe(0);
    const task = baseTask(undefined, { storePath: undefined });
    const created = run(['create-task', '--json', '--temp-store', '--allow-temp-write', '--store', storePath], JSON.stringify(task));
    const taskId = JSON.parse(created.stdout).task.task_id;
    const args = ['append-event', '--json', '--temp-store', '--allow-temp-write', '--store', storePath];
    const base = eventInput(undefined, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2); delete base.storePath;
    const serializedBase = JSON.stringify(base);
    const serializedPayload = JSON.stringify(base.payload);
    const probes = [
      [serializedBase.replace(serializedPayload, '{"a":1,"a":2}'), 'DUPLICATE_JSON_KEY', null],
      [JSON.stringify({ ...base, payload: { nested: { privateKey: 'never-print-this-secret' } } }), 'SENSITIVE_PAYLOAD_REJECTED', 'never-print-this-secret'],
      [JSON.stringify({ ...base, payload: { nested: { authorization: 'never-print-this-auth' } } }), 'SENSITIVE_PAYLOAD_REJECTED', 'never-print-this-auth'],
      [JSON.stringify({ ...base, payload: JSON.parse(`${'['.repeat(17)}0${']'.repeat(17)}`) }), 'PAYLOAD_DEPTH_EXCEEDED', null],
      [`${JSON.stringify(base)}${' '.repeat(16_385)}`, 'JSON_INPUT_TOO_LARGE', null],
    ];
    for (const [input, code, secret] of probes) {
      const result = run(args, input);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim()).toBe(code);
      expect(result.stderr).not.toContain(storePath);
      if (secret) expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
      expect(taskStatus({ storePath, taskId }).event_count).toBe(1);
    }
  });
  test('programmatic unsafe integer and negative zero fail before any append', () => {
    const { storePath, taskId } = initializedTask('programmatic-number-reject');
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 1, { n: 9007199254740993 }))).toThrow(/UNSAFE_INTEGER_NUMBER/);
    expect(() => appendEvent(eventInput(storePath, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2, { n: -0 }))).toThrow(/NEGATIVE_ZERO_FORBIDDEN/);
    expect(taskStatus({ storePath, taskId }).event_count).toBe(1);
  });
  test('CLI rejects escaped confusable and ordinary non-ASCII keys without inserting or reflecting secrets', () => {
    const storePath = tempStore('cli-unicode-key');
    expect(run(['init', '--json', '--temp-store', '--allow-temp-write', '--store', storePath]).status).toBe(0);
    const created = run(['create-task', '--json', '--temp-store', '--allow-temp-write', '--store', storePath], JSON.stringify(baseTask(undefined, { storePath: undefined })));
    const taskId = JSON.parse(created.stdout).task.task_id;
    const base = eventInput(undefined, taskId, 'CARD_ELIGIBILITY_EVALUATED', 2); delete base.storePath;
    const serializedBase = JSON.stringify(base);
    const prefix = serializedBase.replace(JSON.stringify(base.payload), 'PAYLOAD');
    for (const payloadText of ['{"pr\\u0456vate_key":"synthetic-secret"}', '{"\\u0430piKey":"synthetic-secret"}', '{"caf\\u00e9":"synthetic-secret"}']) {
      const result = run(['append-event', '--json', '--temp-store', '--allow-temp-write', '--store', storePath], prefix.replace('PAYLOAD', payloadText));
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim()).toBe('PAYLOAD_KEY_NON_ASCII_FORBIDDEN');
      expect(`${result.stdout}${result.stderr}`).not.toContain('synthetic-secret');
      expect(taskStatus({ storePath, taskId }).event_count).toBe(1);
    }
    expect(verifyStore({ storePath })).toMatchObject({ valid: true, checked_events: 1 });
  });
  test('runtime has no live Kanban, network, model, subprocess, production enablement or event editing surface', () => {
    const source = readFileSync(new URL('./kanban-autonomy-store.mjs', import.meta.url), 'utf8');
    for (const forbidden of [
      'node:child_process', 'fetch(', 'http:', 'https:', 'sendMessage', 'getUpdates', '/root/.hermes',
      'process.env', 'ATTACH ', 'loadExtension', 'enable-load-extension', 'systemctl', 'gh api', 'git push',
      'UPDATE durable_events', 'DELETE FROM durable_events', 'KANBAN_DATABASE_PATH', 'production-enable',
    ]) expect(source).not.toContain(forbidden);
    expect(source).not.toMatch(/\b(?:updateEvent|deleteEvent|editEvent)\b/);
  });
  test('binary is executable and package exposes only the approved mapping', () => {
    expect(lstatSync(bin).mode & 0o111).toBeTruthy();
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(packageJson.bin['kanban-autonomy-store']).toBe('./bin/kanban-autonomy-store');
  });
  test('synthetic fixture corpus covers and validates every active event contract', () => {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/kanban-autonomy-events.json', import.meta.url), 'utf8'));
    expect(fixture.synthetic_only).toBe(true);
    expect(fixture.flows.normal).toHaveLength(7);
    expect(Object.keys(fixture.flows)).toEqual(expect.arrayContaining(['approval_granted', 'approval_rejected', 'blocked_resumed', 'completed']));
    expect(Object.keys(fixture.event_payloads)).toEqual(ACTIVE_EVENT_TYPES);
    for (const eventType of ACTIVE_EVENT_TYPES) {
      expect(() => validateEventPayload(eventType, 1, fixture.event_payloads[eventType])).not.toThrow();
      expect(EVENT_PAYLOAD_POLICIES[eventType][1]).toBeDefined();
    }
    const storePath = tempStore('fixture-contract');
    initStore({ storePath });
    const created = createTask({ storePath, ...fixture.tasks[0] });
    expect(parseStoredPayloadJson(created.event.payload_json).payload).toEqual(fixture.event_payloads.TASK_CREATED);
    expect(fixture.cases.map((item) => item.name)).toEqual(expect.arrayContaining([
      'duplicate_creation_request', 'duplicate_event_idempotency_request', 'idempotency_conflict',
      'authority_escalation_attempt', 'invalid_transition', 'corrupt_previous_hash',
      'corrupt_payload_hash', 'missing_sequence', 'two_cards_same_task_link_identity',
    ]));
    expect(fixture.cases.find((item) => item.name === 'corrupt_previous_hash')).toMatchObject({
      expected_finding: 'PREVIOUS_EVENT_HASH_MISMATCH',
    });
    expect(JSON.stringify(fixture)).not.toMatch(/(?:token|customer|private key|chat_id|\/root\/|[A-Za-z]:\\\\)/i);
  });
});
