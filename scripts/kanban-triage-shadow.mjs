#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync, fstatSync,
  fsyncSync, lstatSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, writeSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ELIGIBILITY_POLICY_VERSION, SCORING_POLICY_VERSION, PORTFOLIO_POLICY_VERSION,
  buildCardEvaluation, canonicalJson, compareCandidates, parseStrictUtc, sha256,
} from './kanban-triage-policy.mjs';

export const OUTPUT_SCHEMA = 'kan_aut_triage_shadow_preview.v1';
export const SCHEMA_PROFILES = Object.freeze({
  FULL: 'kanban_tasks_full_v1',
  LEGACY_SHADOW: 'kanban_tasks_legacy_shadow_v1',
});
const LIVE_ROOT = '/root/.hermes/kanban/boards';
const SNAPSHOT_DIRECTORY_PREFIX = '/tmp/kanban-triage-shadow-';
const SNAPSHOT_DATABASE_NAME = 'snapshot.db';
const HASH_BUFFER_BYTES = 1024 * 1024;
const CORE_TASK_COLUMNS = [
  'id', 'title', 'body', 'status', 'priority', 'created_by', 'tenant', 'claim_lock',
  'claim_expires', 'worker_pid', 'created_at', 'consecutive_failures', 'max_retries',
  'current_run_id', 'idempotency_key',
];
const OPTIONAL_TASK_COLUMNS = ['metadata', 'updated_at', 'last_failure_at', 'next_run_after'];
const FULL_TASK_COLUMNS = [...CORE_TASK_COLUMNS, ...OPTIONAL_TASK_COLUMNS];
const REQUIRED_LINK_COLUMNS = ['parent_id', 'child_id'];
const FULL_TYPES = Object.freeze({
  id:'TEXT', title:'TEXT', body:'TEXT', status:'TEXT', priority:'INTEGER', created_by:'TEXT', tenant:'TEXT',
  metadata:'TEXT', claim_lock:'TEXT', claim_expires:'TEXT', worker_pid:'INTEGER', created_at:'TEXT', updated_at:'TEXT',
  consecutive_failures:'INTEGER', last_failure_at:'TEXT', max_retries:'INTEGER', current_run_id:'TEXT',
  next_run_after:'TEXT', idempotency_key:'TEXT',
});
const LEGACY_TYPES = Object.freeze({
  id:'TEXT', title:'TEXT', body:'TEXT', status:'TEXT', priority:'INTEGER', created_by:'TEXT', tenant:'TEXT',
  claim_lock:'TEXT', claim_expires:'INTEGER', worker_pid:'INTEGER', created_at:'INTEGER',
  consecutive_failures:'INTEGER', max_retries:'INTEGER', current_run_id:'INTEGER', idempotency_key:'TEXT',
});
const SIDE_EFFECTS = Object.freeze({
  database_write: false, card_created: false, card_moved: false, card_edited: false,
  comment_created: false, task_created: false, lease_created: false, approval_created: false,
  telegram_sent: false, obsidian_written: false, github_written: false,
  durable_store_written: false, source_written: false, model_calls: false,
  network_calls: false, service_changes: false, timer_changes: false,
});

function fail(message) { throw new Error(message); }
function failCode(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}
function safeError(error) {
  const message = String(error?.message ?? error).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/(?:\/[^\s:]+)+/g, '[REDACTED_PATH]');
  return message.slice(0, 300);
}

export function parseCliArgs(argv) {
  const args = { json: false, shadow: false, readOnly: false, fixture: false };
  const valueFor = (flag, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith('-')) fail(`${flag} requires a value`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--shadow') args.shadow = true;
    else if (arg === '--read-only') args.readOnly = true;
    else if (arg === '--fixture') args.fixture = true;
    else if (['--board', '--db', '--triage-status', '--top', '--as-of'].includes(arg)) args[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = valueFor(arg, index++);
    else fail(`Unsupported option: ${arg}`);
  }
  for (const flag of ['json', 'shadow', 'readOnly', 'board', 'db', 'triageStatus', 'top']) if (!args[flag]) fail(`Required option missing: --${flag.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(args.board)) fail('Invalid board slug');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(args.triageStatus)) fail('Invalid triage status');
  if (!/^[1-9]\d*$/.test(args.top)) fail('--top must be an integer from 1 through 50');
  args.top = Number(args.top);
  if (args.top > 50) fail('--top exceeds hard maximum 50');
  if (args.asOf && !parseStrictUtc(args.asOf)) fail('--as-of must be a strict UTC RFC3339 timestamp');
  return Object.freeze(args);
}

function sidecarState(dbPath) {
  return ['-wal', '-shm'].map((suffix) => {
    const candidate = `${dbPath}${suffix}`;
    try {
      const stat = lstatSync(candidate);
      return { suffix, exists: true, size: stat.size, mtime_ms: Math.trunc(stat.mtimeMs) };
    } catch (error) {
      if (error?.code === 'ENOENT') return { suffix, exists: false, size: null, mtime_ms: null };
      throw error;
    }
  });
}

function exactLivePath(board) {
  return path.join(LIVE_ROOT, board, 'kanban.db');
}

export function isPathInsideRoot(candidatePath, rootPath = LIVE_ROOT) {
  const candidate = path.resolve(candidatePath);
  const root = path.resolve(rootPath);
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function classifyDatabaseScanRoute({ resolvedDatabasePath, boardSlug, fixtureMode, liveRoot = LIVE_ROOT }) {
  const resolved = path.resolve(resolvedDatabasePath);
  const insideLiveRoot = isPathInsideRoot(resolved, liveRoot);
  if (fixtureMode === true) {
    if (insideLiveRoot) failCode('FIXTURE_MODE_FORBIDDEN_FOR_LIVE_ROOT', 'fixture mode cannot target the live Kanban root');
    return 'immutable_fixture';
  }
  if (!insideLiveRoot) fail('Non-live database paths require --fixture');
  const expected = path.join(path.resolve(liveRoot), boardSlug, 'kanban.db');
  if (resolved !== expected) fail('Live database path does not match the exact validated board path');
  return 'verified_live_snapshot';
}

function openReadOnlyNoFollow(file) {
  return openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_CLOEXEC ?? 0));
}

function statMatches(left, right) {
  return ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].every((field) => left[field] === right[field]);
}

function statIdentityMatches(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function hashFileDescriptor(fd) {
  const digest = createHash('sha256');
  const buffer = Buffer.allocUnsafe(HASH_BUFFER_BYTES);
  let position = 0;
  for (;;) {
    const bytesRead = readSync(fd, buffer, 0, buffer.length, position);
    if (bytesRead === 0) break;
    digest.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return `sha256:${digest.digest('hex')}`;
}

function missingFileState() {
  return { exists: false, dev: null, ino: null, mode: null, nlink: null, size: null, mtimeNs: null, ctimeNs: null, sha256: null };
}

function captureStableFileState(file, { allowMissing = false, label = 'file' } = {}) {
  let pathBefore;
  try {
    pathBefore = lstatSync(file, { bigint: true });
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return missingFileState();
    if (error?.code === 'ENOENT') failCode('LIVE_SOURCE_CHANGED_DURING_SNAPSHOT', `${label} disappeared`);
    throw error;
  }
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile()) failCode('LIVE_SOURCE_UNSAFE', `${label} must be a non-symlink regular file`);

  let fd;
  try {
    fd = openReadOnlyNoFollow(file);
    const fdBefore = fstatSync(fd, { bigint: true });
    if (!fdBefore.isFile() || !statMatches(pathBefore, fdBefore)) failCode('LIVE_SOURCE_CHANGED_DURING_SNAPSHOT', `${label} identity changed before hashing`);
    const fileSha256 = hashFileDescriptor(fd);
    const fdAfter = fstatSync(fd, { bigint: true });
    let pathAfter;
    try {
      pathAfter = lstatSync(file, { bigint: true });
    } catch (error) {
      if (error?.code === 'ENOENT') failCode('LIVE_SOURCE_CHANGED_DURING_SNAPSHOT', `${label} disappeared while hashing`);
      throw error;
    }
    if (!statMatches(fdBefore, fdAfter) || !statMatches(fdAfter, pathAfter)) failCode('LIVE_SOURCE_CHANGED_DURING_SNAPSHOT', `${label} changed while hashing`);
    return {
      exists: true, dev: fdAfter.dev, ino: fdAfter.ino, mode: fdAfter.mode, nlink: fdAfter.nlink,
      size: fdAfter.size, mtimeNs: fdAfter.mtimeNs, ctimeNs: fdAfter.ctimeNs, sha256: fileSha256,
    };
  } catch (error) {
    if (error?.code === 'ELOOP') failCode('LIVE_SOURCE_UNSAFE', `${label} symlink traversal refused`);
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function captureSidecars(sourcePath) {
  return {
    wal: captureStableFileState(`${sourcePath}-wal`, { allowMissing: true, label: 'WAL sidecar' }),
    shm: captureStableFileState(`${sourcePath}-shm`, { allowMissing: true, label: 'SHM sidecar' }),
  };
}

function fileStatesMatch(left, right) {
  if (left.exists !== right.exists) return false;
  if (!left.exists) return true;
  return statMatches(left, right) && left.sha256 === right.sha256;
}

function sidecarStatesMatch(left, right) {
  return fileStatesMatch(left.wal, right.wal) && fileStatesMatch(left.shm, right.shm);
}

function boundedDecimal(value) {
  if (value === null) return null;
  const text = String(value);
  if (!/^\d{1,32}$/.test(text)) fail('Snapshot metadata integer was outside its bounded representation');
  return text;
}

function publicFileState(state) {
  if (!state.exists) return { exists: false, dev: null, inode: null, size: null, mtime_ns: null, sha256: null };
  return {
    exists: true, dev: boundedDecimal(state.dev), inode: boundedDecimal(state.ino),
    size: boundedDecimal(state.size), mtime_ns: boundedDecimal(state.mtimeNs), sha256: state.sha256,
  };
}

function snapshotDirectoryMode(directory) {
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) failCode('LIVE_SNAPSHOT_UNSAFE', 'temporary snapshot directory is not a real directory');
  return Number(stat.mode & 0o777n);
}

function copySourceToSnapshot(sourcePath, destination, expectedSource) {
  let sourceFd;
  let destinationFd;
  try {
    sourceFd = openReadOnlyNoFollow(sourcePath);
    const sourceBefore = fstatSync(sourceFd, { bigint: true });
    if (!sourceBefore.isFile() || !statMatches(sourceBefore, expectedSource)) failCode('LIVE_SOURCE_CHANGED_DURING_SNAPSHOT', 'database changed before copy');
    destinationFd = openSync(
      destination,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_CLOEXEC ?? 0),
      0o600,
    );
    fchmodSync(destinationFd, 0o600);
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(HASH_BUFFER_BYTES);
    let position = 0;
    for (;;) {
      const bytesRead = readSync(sourceFd, buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      digest.update(buffer.subarray(0, bytesRead));
      let written = 0;
      while (written < bytesRead) written += writeSync(destinationFd, buffer, written, bytesRead - written);
      position += bytesRead;
    }
    fsyncSync(destinationFd);
    const sourceAfter = fstatSync(sourceFd, { bigint: true });
    if (!statMatches(sourceBefore, sourceAfter)) failCode('LIVE_SOURCE_CHANGED_DURING_SNAPSHOT', 'database changed while copying');
    return `sha256:${digest.digest('hex')}`;
  } catch (error) {
    if (error?.code === 'ELOOP') failCode('LIVE_SOURCE_UNSAFE', 'database symlink traversal refused during copy');
    throw error;
  } finally {
    if (destinationFd !== undefined) closeSync(destinationFd);
    if (sourceFd !== undefined) closeSync(sourceFd);
  }
}

function removeSnapshotDirectory(directory) {
  if (path.dirname(directory) !== '/tmp' || !path.basename(directory).startsWith('kanban-triage-shadow-')) {
    failCode('LIVE_SNAPSHOT_CLEANUP_FAILED', 'refused to clean an unexpected path');
  }
  rmSync(directory, { recursive: true, force: true });
  if (existsSync(directory)) failCode('LIVE_SNAPSHOT_CLEANUP_FAILED', 'temporary snapshot directory still exists');
}

function createVerifiedLiveSnapshot(sourcePath, testHooks = {}) {
  let directory;
  try {
    const sourceBefore = captureStableFileState(sourcePath, { label: 'live database' });
    const sidecarsBefore = captureSidecars(sourcePath);
    if (sidecarsBefore.wal.exists && sidecarsBefore.wal.size > 0n) {
      failCode('LIVE_WAL_NOT_QUIESCENT', 'live database has a nonempty WAL');
    }
    testHooks.afterInitialCapture?.({ sourcePath });

    directory = mkdtempSync(SNAPSHOT_DIRECTORY_PREFIX);
    chmodSync(directory, 0o700);
    if (snapshotDirectoryMode(directory) !== 0o700) failCode('LIVE_SNAPSHOT_UNSAFE', 'temporary snapshot directory mode is not 0700');
    const databasePath = path.join(directory, SNAPSHOT_DATABASE_NAME);
    const copiedSha256 = copySourceToSnapshot(sourcePath, databasePath, sourceBefore);
    testHooks.afterCopy?.({ sourcePath, directory, databasePath });

    const sourceAfter = captureStableFileState(sourcePath, { label: 'live database' });
    const sidecarsAfter = captureSidecars(sourcePath);
    const walBecameNonempty = sidecarsAfter.wal.exists && sidecarsAfter.wal.size > 0n;
    if (walBecameNonempty || !fileStatesMatch(sourceBefore, sourceAfter) || !sidecarStatesMatch(sidecarsBefore, sidecarsAfter)) {
      failCode('LIVE_SOURCE_CHANGED_DURING_SNAPSHOT', 'database or sidecar state changed during snapshot');
    }
    if (copiedSha256 !== sourceBefore.sha256) failCode('LIVE_SOURCE_CHANGED_DURING_SNAPSHOT', 'copied database hash does not match source hash');

    const snapshotState = captureStableFileState(databasePath, { label: 'snapshot database' });
    if (snapshotState.sha256 !== sourceBefore.sha256 || snapshotState.size !== sourceBefore.size) {
      failCode('LIVE_SOURCE_CHANGED_DURING_SNAPSHOT', 'verified snapshot does not match source');
    }
    if (Number(snapshotState.mode & 0o777n) !== 0o600) failCode('LIVE_SNAPSHOT_UNSAFE', 'snapshot database mode is not 0600');

    return {
      databasePath,
      directory,
      attestation: {
        strategy: 'verified_stable_copy', sqlite_source_opened: false,
        source_before: publicFileState(sourceBefore), source_after: publicFileState(sourceAfter),
        sidecars_before: { wal: publicFileState(sidecarsBefore.wal), shm: publicFileState(sidecarsBefore.shm) },
        sidecars_after: { wal: publicFileState(sidecarsAfter.wal), shm: publicFileState(sidecarsAfter.shm) },
        snapshot: {
          destination_basename: SNAPSHOT_DATABASE_NAME, directory_mode: '0700', database_mode: '0600',
          size: boundedDecimal(snapshotState.size), sha256: snapshotState.sha256,
        },
        source_restat_verified: true, source_rehash_verified: true, sidecars_reverified: true,
        snapshot_hash_match_verified: true, cleanup_verified: false,
      },
    };
  } catch (error) {
    if (directory !== undefined) removeSnapshotDirectory(directory);
    throw error;
  }
}

export function withVerifiedLiveSnapshot(sourcePath, operation, { testHooks = {} } = {}) {
  if (typeof operation !== 'function') fail('Snapshot operation must be a function');
  const snapshot = createVerifiedLiveSnapshot(sourcePath, testHooks);
  try {
    return operation(snapshot);
  } finally {
    removeSnapshotDirectory(snapshot.directory);
  }
}

export function resolveDatabasePath({ db, board, fixture = false }) {
  if (typeof db !== 'string' || db.includes('\0') || !path.isAbsolute(db)) fail('Database path must be absolute');
  const resolved = path.resolve(db);
  const route = classifyDatabaseScanRoute({ resolvedDatabasePath: resolved, boardSlug: board, fixtureMode: fixture, liveRoot: LIVE_ROOT });
  let real;
  try {
    const linkStat = lstatSync(resolved);
    if (linkStat.isSymbolicLink()) {
      if (route === 'immutable_fixture') failCode('FIXTURE_SOURCE_SYMLINK_FORBIDDEN', 'fixture source must not be a symbolic link');
      failCode('LIVE_SOURCE_UNSAFE', 'live database must not be a symbolic link');
    }
    if (!linkStat.isFile()) fail('Database path must be a regular file');
    if (route === 'immutable_fixture' && linkStat.nlink !== 1) {
      failCode('FIXTURE_SOURCE_HARDLINK_FORBIDDEN', 'fixture source must have exactly one link');
    }
    real = realpathSync(resolved);
  } catch (error) {
    if (error?.code === 'ENOENT') fail('Database does not exist');
    throw error;
  }
  if (route === 'immutable_fixture' && isPathInsideRoot(real, LIVE_ROOT)) {
    failCode('FIXTURE_MODE_FORBIDDEN_FOR_LIVE_ROOT', 'fixture source resolves within the live Kanban root');
  }
  if (route === 'verified_live_snapshot' && real !== exactLivePath(board)) fail('Database symlink escape refused');
  return real;
}

function tableInfo(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

function hasExpectedTypes(byName, expected) {
  return Object.entries(expected).every(([name, type]) => String(byName.get(name)?.type ?? '').toUpperCase() === type);
}

export function validateSchema(db) {
  const taskInfo = tableInfo(db, 'tasks');
  const linkInfo = tableInfo(db, 'task_links');
  const tasks = new Map(taskInfo.map((row) => [row.name, row]));
  const links = new Map(linkInfo.map((row) => [row.name, row]));
  const missingCore = CORE_TASK_COLUMNS.filter((column) => !tasks.has(column));
  const missingLinks = REQUIRED_LINK_COLUMNS.filter((column) => !links.has(column));
  const missingOptional = OPTIONAL_TASK_COLUMNS.filter((column) => !tasks.has(column));
  const linksValid = missingLinks.length === 0
    && REQUIRED_LINK_COLUMNS.every((column) => String(links.get(column).type).toUpperCase() === 'TEXT')
    && Number(links.get('parent_id').pk) === 1 && Number(links.get('child_id').pk) === 2;
  const idPrimaryKey = Number(tasks.get('id')?.pk) === 1;
  if (missingCore.length === 0 && missingOptional.length === 0 && linksValid && idPrimaryKey && hasExpectedTypes(tasks, FULL_TYPES)) {
    return Object.freeze({ name: SCHEMA_PROFILES.FULL, degraded: false, missingOptional: [], taskColumns: FULL_TASK_COLUMNS, capabilities: { metadata:true, updated_at:true, last_failure_at:true, next_run_after:true } });
  }
  if (missingCore.length === 0 && missingOptional.length === OPTIONAL_TASK_COLUMNS.length && linksValid && idPrimaryKey && hasExpectedTypes(tasks, LEGACY_TYPES)) {
    return Object.freeze({ name: SCHEMA_PROFILES.LEGACY_SHADOW, degraded: true, missingOptional:[...OPTIONAL_TASK_COLUMNS], taskColumns:CORE_TASK_COLUMNS, capabilities: { metadata:false, updated_at:false, last_failure_at:false, next_run_after:false } });
  }
  fail(`Schema mismatch: unsupported tasks/task_links profile (core_missing=${missingCore.length}, optional_missing=${missingOptional.length}, links_valid=${linksValid})`);
}

function epochSecondsToUtc(value) {
  if (value === null || value === undefined) return null;
  return parseStrictUtc(value)?.value ?? value;
}

function adaptCardForProfile(card, profile) {
  if (profile.name === SCHEMA_PROFILES.FULL) return card;
  return {
    ...card,
    created_at: epochSecondsToUtc(card.created_at, 'created_at'),
    claim_expires: epochSecondsToUtc(card.claim_expires, 'claim_expires'),
    metadata: undefined, updated_at: undefined, last_failure_at: undefined, next_run_after: undefined,
  };
}

function dependencyMap(cards, links) {
  const byId = new Map(cards.map((card) => [String(card.id), card]));
  const map = new Map(cards.map((card) => [String(card.id), { hardBlocked: false, parents: [], children: [] }]));
  for (const link of links) {
    const parent = String(link.parent_id);
    const child = String(link.child_id);
    if (map.has(parent)) map.get(parent).children.push(child);
    if (map.has(child)) {
      map.get(child).parents.push(parent);
      const parentCard = byId.get(parent);
      if (!parentCard || !['done', 'completed'].includes(String(parentCard.status).toLowerCase())) map.get(child).hardBlocked = true;
    }
  }
  for (const value of map.values()) { value.parents.sort(); value.children.sort(); }
  return map;
}

function safeSnapshotCard(card, evaluation) {
  const normalized = evaluation.normalized;
  return {
    id: normalized.id, status: normalized.status, priority: normalized.priority,
    title_hash: normalized.title_hash, body_hash: normalized.body_hash,
    metadata_hash: normalized.metadata_hash, metadata_available:normalized.metadata_available,
    metadata_verified:normalized.metadata_verified, source_identity_hash: normalized.source_identity_hash,
    created_at: normalized.created_at, updated_at: normalized.updated_at,
    claim_lock_present: normalized.claim_lock !== null, claim_expires: normalized.claim_expires,
    current_run_present: normalized.current_run_id !== null, next_run_after: normalized.next_run_after,
    consecutive_failures: normalized.consecutive_failures, max_retries: normalized.max_retries,
    card_snapshot_hash: evaluation.normalized.card_snapshot_hash,
  };
}

function buildCandidate(card, evaluation) {
  const { normalized, eligibility, scoring, portfolio } = evaluation;
  return {
    card_id: normalized.id, card_snapshot_hash: normalized.card_snapshot_hash,
    title_preview_redacted: normalized.title_preview_redacted, title_hash: normalized.title_hash,
    source_identity_hash: normalized.source_identity_hash, shadow_eligible: eligibility.eligible,
    claim_eligible: false, claim_blocker_codes: [],
    ineligibility_reason_codes: eligibility.reason_codes, factor_inputs: scoring.factor_inputs,
    factor_provenance: scoring.factor_provenance, weighted_contributions: scoring.weighted_contributions,
    penalties: scoring.penalties, aging_bonus: scoring.aging_bonus, final_score: scoring.final_score,
    score_basis_points: scoring.score_basis_points, portfolio_category: portfolio.category,
    portfolio_advisory: portfolio.advisory,
    tie_break_values: {
      approval_free_work: scoring.factor_inputs.approval_free_work, risk: scoring.factor_inputs.risk,
      dependency_readiness: scoring.factor_inputs.dependency_readiness,
      created_at: normalized.created_at, created_at_ms: normalized.created_at_ms,
      created_at_fraction_ns: normalized.created_at_fraction_ns, stable_card_id: normalized.id,
    },
    proposed_outcome: evaluation.proposed_outcome,
    explanation_codes: [...new Set([...eligibility.evidence_codes, ...eligibility.reason_codes, portfolio.advisory.explanation_code])].sort(),
  };
}

function scanImmutableDatabase(databasePath, options, sourceMetadata) {
  const beforeSidecars = sidecarState(databasePath);
  const uri = pathToFileURL(databasePath);
  uri.searchParams.set('mode', 'ro');
  uri.searchParams.set('immutable', '1');
  const db = new DatabaseSync(uri, { readOnly: true, enableForeignKeyConstraints: false });
  let result;
  try {
    db.exec('PRAGMA query_only=ON');
    const queryOnly = Number(db.prepare('PRAGMA query_only').get().query_only);
    if (queryOnly !== 1) fail('SQLite query-only verification failed');
    const dataVersion = Number(db.prepare('PRAGMA data_version').get().data_version);
    db.exec('BEGIN');
    try {
      const profile = validateSchema(db);
      const cards = db.prepare(`SELECT ${profile.taskColumns.map((column) => `"${column}"`).join(', ')} FROM tasks`).all()
        .map((card) => adaptCardForProfile(card, profile));
      const links = db.prepare('SELECT "parent_id", "child_id" FROM task_links').all();
      const deps = dependencyMap(cards, links);
      const asOf = options.asOf ?? new Date().toISOString();
      const evaluations = cards.map((card) => buildCardEvaluation({
        card, configuredTriageStatus: options.triageStatus, evaluationTimestamp: asOf,
        testMode: options.testMode === true, dependencies: deps.get(String(card.id)) ?? { hardBlocked: false },
        activeTask: Boolean(card.current_run_id), activeLease: false, authorityAvailable: true,
        retryState: {}, capabilities: profile.capabilities,
      }));
      const snapshotCards = cards.map((card, index) => safeSnapshotCard(card, evaluations[index])).sort((a, b) => a.id.localeCompare(b.id));
      const snapshotLinks = links.map((link) => ({ parent_id: String(link.parent_id), child_id: String(link.child_id) })).sort((a, b) => a.parent_id.localeCompare(b.parent_id) || a.child_id.localeCompare(b.child_id));
      const snapshotHash = sha256(canonicalJson({ cards: snapshotCards, links: snapshotLinks }));
      const triage = cards.map((card, index) => ({ card, evaluation: evaluations[index] })).filter(({ evaluation }) => evaluation.normalized.status === options.triageStatus);
      const allCandidates = triage.map(({ card, evaluation }) => buildCandidate(card, evaluation)).sort(compareCandidates);
      const claimBlockers = profile.degraded ? ['LEGACY_SCHEMA_NOT_CLAIM_CAPABLE'] : ['SHADOW_SCANNER_HAS_NO_CLAIM_ENGINE'];
      const candidates = allCandidates.slice(0, options.top).map((candidate, index) => ({ rank: index + 1, ...candidate, claim_blocker_codes:claimBlockers }));
      const eligibleCandidates = allCandidates.filter((candidate) => candidate.shadow_eligible);
      const winner = eligibleCandidates[0];
      const reasonCounts = {};
      for (const candidate of allCandidates) for (const reason of candidate.ineligibility_reason_codes) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
      result = {
        schema: OUTPUT_SCHEMA, mode: 'shadow_read_only', generated_at: asOf,
        policy: { eligibility_version: ELIGIBILITY_POLICY_VERSION, scoring_version: SCORING_POLICY_VERSION, portfolio_version: PORTFOLIO_POLICY_VERSION, eligibility_scope:'shadow_preview_only' },
        board: {
          slug: options.board, database_path_hash: sourceMetadata.source_database_path_hash,
          scan_source: sourceMetadata.scan_source, source_database_path_hash: sourceMetadata.source_database_path_hash,
          source_database_sha256: sourceMetadata.source_database_sha256, snapshot_sha256: sourceMetadata.snapshot_sha256,
          snapshot_matches_source: sourceMetadata.snapshot_matches_source, source_wal_state: sourceMetadata.source_wal_state,
          snapshot_hash: snapshotHash, sqlite_data_version:dataVersion, configured_triage_status:options.triageStatus,
          query_only:queryOnly, sqlite_immutable:1, schema_profile:profile.name, schema_degraded:profile.degraded,
          missing_optional_fields:profile.missingOptional, claim_capable:false,
          unavailable_capabilities:profile.missingOptional.map((field) => ({ field, available:false, derived:false, source:null, rule:null, source_reference_hash:null })),
        },
        ephemeral_artifacts: {
          temporary_snapshot_created: sourceMetadata.temporary_snapshot_created,
          temporary_snapshot_removed: sourceMetadata.temporary_snapshot_removed,
          persistent_output_created: false,
        },
        summary: { total_cards: cards.length, triage_cards: triage.length, shadow_eligible_cards: eligibleCandidates.length, shadow_ineligible_cards: triage.length - eligibleCandidates.length, scored_cards: triage.length, returned_candidates: candidates.length, reason_code_counts: Object.fromEntries(Object.entries(reasonCounts).sort()) },
        side_effects: SIDE_EFFECTS, candidates,
        winner: winner ? { selection_performed: false, preview_card_id: winner.card_id, preview_score: winner.final_score, reason: 'HIGHEST_RANKED_ELIGIBLE_PREVIEW_ONLY' } : { selection_performed: false, preview_card_id: null, preview_score: null, reason: 'NO_ELIGIBLE_TRIAGE_CARDS' },
        warnings: profile.degraded ? ['LEGACY_SCHEMA_SHADOW_ONLY','METADATA_POLICY_CAPABILITIES_UNAVAILABLE'] : [],
      };
    } finally {
      db.exec('ROLLBACK');
    }
    const totalChanges = Number(db.prepare('SELECT total_changes() AS value').get().value);
    if (totalChanges !== 0) fail('SQLite connection reported unexpected changes');
  } finally {
    db.close();
  }
  const afterSidecars = sidecarState(databasePath);
  for (let index = 0; index < beforeSidecars.length; index += 1) {
    if (!beforeSidecars[index].exists && afterSidecars[index].exists) fail('Scanner created an unexpected SQLite sidecar');
  }
  result.board.connection_total_changes = 0;
  result.board.sidecar_no_creation_verified = true;
  return result;
}

export function dispatchDatabaseScanRoute(route, { scanFixture, scanVerifiedLiveSnapshot }) {
  switch (route) {
    case 'immutable_fixture':
      return scanFixture();
    case 'verified_live_snapshot':
      return scanVerifiedLiveSnapshot();
    default:
      failCode('DATABASE_SCAN_ROUTE_UNKNOWN', 'database scan route was not recognized');
  }
}

export function scanDatabase(options, dependencies = {}) {
  const sourcePath = resolveDatabasePath(options);
  const route = classifyDatabaseScanRoute({
    resolvedDatabasePath: sourcePath, boardSlug: options.board, fixtureMode: options.fixture === true, liveRoot: LIVE_ROOT,
  });
  const immutableScanner = dependencies.scanImmutableDatabase ?? scanImmutableDatabase;
  const verifiedSnapshotBoundary = dependencies.withVerifiedLiveSnapshot ?? withVerifiedLiveSnapshot;

  return dispatchDatabaseScanRoute(route, {
    scanFixture: () => {
      const sourceState = captureStableFileState(sourcePath, { label: 'fixture database' });
      return immutableScanner(sourcePath, options, {
        scan_source: 'synthetic_fixture', source_database_path_hash: sha256(sourcePath),
        source_database_sha256: sourceState.sha256, snapshot_sha256: sourceState.sha256,
        snapshot_matches_source: true, source_wal_state: 'absent',
        temporary_snapshot_created: false, temporary_snapshot_removed: false,
      });
    },
    scanVerifiedLiveSnapshot: () => {
      let result;
      verifiedSnapshotBoundary(sourcePath, (snapshot) => {
        const wal = snapshot.attestation.sidecars_before.wal;
        result = immutableScanner(snapshot.databasePath, options, {
          scan_source: 'verified_temporary_snapshot', source_database_path_hash: sha256(sourcePath),
          source_database_sha256: snapshot.attestation.source_before.sha256,
          snapshot_sha256: snapshot.attestation.snapshot.sha256, snapshot_matches_source: true,
          source_wal_state: wal.exists ? 'empty' : 'absent',
          temporary_snapshot_created: true, temporary_snapshot_removed: false,
        });
      }, { testHooks: options.snapshotTestHooks ?? {} });
      result.ephemeral_artifacts.temporary_snapshot_removed = true;
      return result;
    },
  });
}

export async function runCli(argv = process.argv.slice(2)) {
  try {
    const args = parseCliArgs(argv);
    const result = scanDatabase(args);
    process.stdout.write(`${canonicalJson(result)}\n`);
  } catch (error) {
    process.stderr.write(`${safeError(error)}\n`);
    process.exitCode = 1;
  }
}
