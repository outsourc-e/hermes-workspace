import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, linkSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  classifyDatabaseScanRoute, dispatchDatabaseScanRoute, isPathInsideRoot, parseCliArgs,
  resolveDatabasePath, scanDatabase, SCHEMA_PROFILES, withVerifiedLiveSnapshot,
} from './kanban-triage-shadow.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/kanban-triage-shadow.json', import.meta.url), 'utf8'));
let directory;
let dbPath;
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const fullColumns = [
  'id TEXT PRIMARY KEY','title TEXT','body TEXT','status TEXT','priority INTEGER','created_by TEXT','tenant TEXT','metadata TEXT',
  'claim_lock TEXT','claim_expires TEXT','worker_pid INTEGER','created_at TEXT','updated_at TEXT','consecutive_failures INTEGER',
  'last_failure_at TEXT','max_retries INTEGER','current_run_id TEXT','next_run_after TEXT','idempotency_key TEXT',
];
const legacyColumns = [
  'id TEXT PRIMARY KEY','title TEXT','body TEXT','status TEXT','priority INTEGER','created_by TEXT','tenant TEXT',
  'claim_lock TEXT','claim_expires INTEGER','worker_pid INTEGER','created_at INTEGER','consecutive_failures INTEGER',
  'max_retries INTEGER','current_run_id INTEGER','idempotency_key TEXT',
];

function createDatabase(target, cards = fixture.cards, links = fixture.links, schema = {}) {
  const db = new DatabaseSync(target);
  db.exec('PRAGMA journal_mode=DELETE');
  let columns = [...(schema.profile === 'legacy' ? legacyColumns : fullColumns)];
  if (schema.omit) columns = columns.filter((definition) => !definition.startsWith(`${schema.omit} `));
  if (schema.typeConflict) columns = columns.map((definition) => definition.startsWith(`${schema.typeConflict} `) ? `${schema.typeConflict} BLOB` : definition);
  if (schema.extra) columns.push('harmless_note TEXT');
  db.exec(`CREATE TABLE tasks (${columns.join(',')})`);
  db.exec('CREATE TABLE task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL, PRIMARY KEY(parent_id, child_id))');
  const available = columns.map((definition) => definition.split(' ')[0]);
  const placeholders = available.map(() => '?').join(',');
  const statement = db.prepare(`INSERT INTO tasks (${available.join(',')}) VALUES (${placeholders})`);
  for (const input of cards) {
    const defaults = { title:'', body:'', status:'triage', priority:50, created_by:'fixture', tenant:'fixture', metadata:{}, claim_lock:null, claim_expires:null, worker_pid:null, created_at:null, updated_at:null, consecutive_failures:0, last_failure_at:null, max_retries:null, current_run_id:null, next_run_after:null, idempotency_key:null };
    const row = { ...defaults, ...input, metadata: typeof input.metadata === 'string' ? input.metadata : JSON.stringify(input.metadata ?? {}) };
    if (schema.profile === 'legacy' && schema.preserveCreatedAt !== true) {
      row.created_at = Math.floor(Date.parse(input.created_at ?? fixture.as_of) / 1000);
      row.claim_expires = input.claim_expires ? Math.floor(Date.parse(input.claim_expires) / 1000) : null;
    }
    statement.run(...available.map((column) => row[column] ?? null));
  }
  const link = db.prepare('INSERT INTO task_links (parent_id, child_id) VALUES (?, ?)');
  for (const item of links) link.run(item.parent_id, item.child_id);
  db.close();
}

function options(overrides = {}) {
  return { board:'fixture-board', db:dbPath, triageStatus:'triage', top:5, fixture:true, asOf:fixture.as_of, ...overrides };
}

beforeAll(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'kan-aut-2-'));
  dbPath = path.join(directory, 'fixture.db');
  createDatabase(dbPath);
});
afterAll(() => rmSync(directory, { recursive:true, force:true }));

describe('strict CLI parsing and path safety', () => {
  test('accepts every mandatory gate and fixed as-of', () => {
    const args = parseCliArgs(['--board','fixture-board','--db',dbPath,'--triage-status','triage','--top','5','--json','--shadow','--read-only','--fixture','--as-of',fixture.as_of]);
    expect(args).toMatchObject({ json:true, shadow:true, readOnly:true, top:5, fixture:true });
  });
  test.each(['--json','--shadow','--read-only'])('rejects missing %s', (missing) => {
    const argv = ['--board','fixture-board','--db',dbPath,'--triage-status','triage','--top','5','--json','--shadow','--read-only','--fixture'].filter((value) => value !== missing);
    expect(() => parseCliArgs(argv)).toThrow(/Required option missing/);
  });
  test('rejects missing and flag-like values, unknown/write flags and top above hard maximum', () => {
    expect(() => parseCliArgs(['--board','--db'])).toThrow(/requires a value/);
    expect(() => parseCliArgs(['--write'])).toThrow(/Unsupported option/);
    expect(() => parseCliArgs(['--output-file','x'])).toThrow(/Unsupported option/);
    expect(() => parseCliArgs(['--board','fixture-board','--db',dbPath,'--triage-status','triage','--top','51','--json','--shadow','--read-only','--fixture'])).toThrow(/hard maximum/);
  });
  test('rejects traversal-equivalent live paths and outside paths without explicit fixture mode', () => {
    expect(() => resolveDatabasePath({ db:dbPath, board:'fixture-board' })).toThrow(/require --fixture/);
    expect(() => resolveDatabasePath({ db:'/root/.hermes/kanban/boards/other/kanban.db', board:'hermes-ops' })).toThrow(/does not match/);
  });
  test('rejects symlink database paths', () => {
    const link = path.join(directory, 'link.db'); symlinkSync(dbPath, link);
    expect(() => resolveDatabasePath({ db:link, board:'fixture-board', fixture:true })).toThrow(/FIXTURE_SOURCE_SYMLINK_FORBIDDEN/);
  });
});

describe('fixture/live scan route isolation', () => {
  const liveRoot = '/root/.hermes/kanban/boards';
  const livePath = `${liveRoot}/hermes-ops/kanban.db`;

  test.each([
    livePath,
    `${liveRoot}/hermes-ops/../hermes-ops/kanban.db`,
    `${liveRoot}/hermes-ops/nested/example.db`,
    liveRoot,
  ])('rejects fixture mode inside the live root before filesystem or scan dispatch: %s', (candidate) => {
    const beforeDirs = new Set(readdirSync('/tmp').filter((name) => name.startsWith('kanban-triage-shadow-')));
    let immutableCalls = 0; let snapshotCalls = 0;
    expect(() => scanDatabase({
      board:'hermes-ops', db:candidate, triageStatus:'triage', top:5, fixture:true, asOf:fixture.as_of,
    }, {
      scanImmutableDatabase() { immutableCalls += 1; },
      withVerifiedLiveSnapshot() { snapshotCalls += 1; },
    })).toThrow(/FIXTURE_MODE_FORBIDDEN_FOR_LIVE_ROOT/);
    expect(immutableCalls).toBe(0); expect(snapshotCalls).toBe(0);
    expect(new Set(readdirSync('/tmp').filter((name) => name.startsWith('kanban-triage-shadow-')))).toEqual(beforeDirs);
  });

  test('uses path.relative containment without prefix confusion', () => {
    expect(isPathInsideRoot(liveRoot, liveRoot)).toBe(true);
    expect(isPathInsideRoot(livePath, liveRoot)).toBe(true);
    expect(isPathInsideRoot(`${liveRoot}/hermes-ops/../hermes-ops/kanban.db`, liveRoot)).toBe(true);
    expect(isPathInsideRoot('/root/.hermes/kanban/boards-backup/example.db', liveRoot)).toBe(false);
    expect(isPathInsideRoot('/tmp/kanban-triage-fixture/example.db', liveRoot)).toBe(false);
    expect(classifyDatabaseScanRoute({
      resolvedDatabasePath:'/root/.hermes/kanban/boards-backup/example.db', boardSlug:'hermes-ops', fixtureMode:true, liveRoot,
    })).toBe('immutable_fixture');
  });

  test('rejects symlink and hard-linked fixture sources before SQLite scanning', () => {
    const symlink = path.join(directory, 'route-link.db');
    const hardlinkSource = path.join(directory, 'route-hardlink-source.db');
    const hardlink = path.join(directory, 'route-hardlink.db');
    symlinkSync(dbPath, symlink); copyFileSync(dbPath, hardlinkSource); linkSync(hardlinkSource, hardlink);
    expect(() => resolveDatabasePath({ db:symlink, board:'fixture-board', fixture:true })).toThrow(/FIXTURE_SOURCE_SYMLINK_FORBIDDEN/);
    expect(() => resolveDatabasePath({ db:hardlink, board:'fixture-board', fixture:true })).toThrow(/FIXTURE_SOURCE_HARDLINK_FORBIDDEN/);
  });

  test('ordinary unique fixture dispatches only to immutable scanner', () => {
    const unique = path.join(directory, 'route-unique.db'); copyFileSync(dbPath, unique);
    const before = hash(unique); let immutablePath; let snapshotCalls = 0;
    const sentinel = { route:'immutable_fixture' };
    const result = scanDatabase(options({ db:unique }), {
      scanImmutableDatabase(candidate) { immutablePath = candidate; return sentinel; },
      withVerifiedLiveSnapshot() { snapshotCalls += 1; },
    });
    expect(result).toBe(sentinel); expect(immutablePath).toBe(unique); expect(snapshotCalls).toBe(0);
    expect(hash(unique)).toBe(before); expect(existsSync(`${unique}-wal`)).toBe(false); expect(existsSync(`${unique}-shm`)).toBe(false);
  });

  test('exact live path without fixture selects only verified snapshot dispatch', () => {
    expect(classifyDatabaseScanRoute({ resolvedDatabasePath:livePath, boardSlug:'hermes-ops', fixtureMode:false, liveRoot })).toBe('verified_live_snapshot');
    let fixtureCalls = 0; let snapshotCalls = 0;
    const value = dispatchDatabaseScanRoute('verified_live_snapshot', {
      scanFixture() { fixtureCalls += 1; },
      scanVerifiedLiveSnapshot() { snapshotCalls += 1; return 'snapshot-only'; },
    });
    expect(value).toBe('snapshot-only'); expect(snapshotCalls).toBe(1); expect(fixtureCalls).toBe(0);
  });

  test('unknown routes fail closed without invoking either scanner', () => {
    let calls = 0;
    expect(() => dispatchDatabaseScanRoute('unexpected', {
      scanFixture() { calls += 1; }, scanVerifiedLiveSnapshot() { calls += 1; },
    })).toThrow(/DATABASE_SCAN_ROUTE_UNKNOWN/);
    expect(calls).toBe(0);
  });
});

describe('read-only scanner', () => {
  test('opens fixture read-only, verifies query-only and creates no sidecars or byte changes', () => {
    const before = hash(dbPath);
    expect(existsSync(`${dbPath}-wal`)).toBe(false); expect(existsSync(`${dbPath}-shm`)).toBe(false);
    const result = scanDatabase(options());
    expect(result.board.query_only).toBe(1); expect(result.board.connection_total_changes).toBe(0);
    expect(result.board.sidecar_no_creation_verified).toBe(true);
    expect(hash(dbPath)).toBe(before); expect(existsSync(`${dbPath}-wal`)).toBe(false); expect(existsSync(`${dbPath}-shm`)).toBe(false);
  });
  test('returns exact schema, false side effects, bounded top N and advisory-only winner', () => {
    const result = scanDatabase(options());
    expect(result.schema).toBe('kan_aut_triage_shadow_preview.v1'); expect(result.mode).toBe('shadow_read_only');
    expect(result.board).toMatchObject({ schema_profile:SCHEMA_PROFILES.FULL, schema_degraded:false, missing_optional_fields:[], claim_capable:false });
    expect(result.policy.eligibility_scope).toBe('shadow_preview_only');
    expect(result.summary).toMatchObject({ total_cards:20, triage_cards:19, shadow_eligible_cards:6 });
    expect(result.candidates).toHaveLength(5); expect(result.summary.returned_candidates).toBe(5);
    expect(Object.values(result.side_effects).every((value) => value === false)).toBe(true);
    expect(result.winner.selection_performed).toBe(false);
    expect(result.winner.preview_card_id).toBe('refurbed-tool');
    expect(result.candidates.find((candidate) => candidate.card_id === 'refurbed-tool')?.rank).toBe(1);
  });
  test('blocked urgent card cannot win, vague idea penalized and maintenance competitive', () => {
    const result = scanDatabase(options({ top:50 }));
    const blocked = result.candidates.find((candidate) => candidate.card_id === 'urgent-blocked');
    const vague = result.candidates.find((candidate) => candidate.card_id === 'vague-idea');
    const maintenance = result.candidates.find((candidate) => candidate.card_id === 'maintenance');
    expect(blocked.shadow_eligible).toBe(false); expect(blocked.claim_eligible).toBe(false); expect(blocked.proposed_outcome).toBe('BLOCKED_DEPENDENCY');
    expect(vague.penalties.insufficient_specification).toBe(-1500);
    expect(maintenance.final_score).toBeGreaterThan(vague.final_score);
    expect(result.winner.preview_card_id).not.toBe('urgent-blocked');
  });
  test('reason counts only cover triage cards and output excludes raw body/metadata/sensitive title', () => {
    const result = scanDatabase(options({ top:50 }));
    expect(result.summary.total_cards).toBe(fixture.cards.length); expect(result.summary.triage_cards).toBe(fixture.cards.length - 1);
    expect(result.summary.reason_code_counts.NOT_IN_TRIAGE).toBeUndefined();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Sensitive synthetic example only');
    expect(serialized).not.toContain('person@example.com'); expect(serialized).not.toContain('fixture-secret'); expect(serialized).not.toContain('123456789');
    expect(serialized).not.toMatch(/"metadata"\s*:/);
  });
  test('fixed as-of produces byte-equivalent output and changed input changes snapshot hash', () => {
    const one = scanDatabase(options()); const two = scanDatabase(options());
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    const other = path.join(directory, 'other.db'); createDatabase(other, [...fixture.cards, { id:'new', title:'New', body:'New', status:'done', created_by:'fixture', tenant:'fixture', metadata:{source_identity:'new'}, created_at:fixture.as_of }]);
    expect(scanDatabase(options({ db:other })).board.snapshot_hash).not.toBe(one.board.snapshot_hash);
  });
  test('zero-triage board returns no candidates and null winner', () => {
    const empty = path.join(directory, 'zero.db'); createDatabase(empty, [fixture.cards[0]].map((item) => ({...item,status:'done'})), []);
    const result = scanDatabase(options({ db:empty }));
    expect(result.summary.triage_cards).toBe(0); expect(result.candidates).toEqual([]);
    expect(result.winner).toEqual({ selection_performed:false, preview_card_id:null, preview_score:null, reason:'NO_ELIGIBLE_TRIAGE_CARDS' });
  });
  test('missing, malformed and schema-mismatched databases fail closed', () => {
    expect(() => scanDatabase(options({ db:path.join(directory,'missing.db') }))).toThrow(/does not exist/);
    const malformed = path.join(directory,'malformed.db'); writeFileSync(malformed,'not sqlite');
    expect(() => scanDatabase(options({ db:malformed }))).toThrow();
    const mismatch = path.join(directory,'mismatch.db'); createDatabase(mismatch, [], [], { omit:'claim_lock' });
    expect(() => scanDatabase(options({ db:mismatch }))).toThrow(/Schema mismatch/);
  });

  test('accepts the exact legacy profile only for shadow ranking and exposes unavailable capabilities', () => {
    const legacy = path.join(directory, 'legacy.db');
    createDatabase(legacy, [{
      id:'legacy-1', title:'Paused test duplicate awaiting user prose', body:'paused awaiting-user duplicate approval text is not authority',
      status:'triage', priority:90, created_by:'fixture', tenant:'fixture', created_at:'2026-06-01T00:00:00Z',
      idempotency_key:'legacy:1', claim_lock:null, current_run_id:null,
    }], [], { profile:'legacy' });
    const result = scanDatabase(options({ db:legacy }));
    expect(result.board).toMatchObject({
      schema_profile:SCHEMA_PROFILES.LEGACY_SHADOW, schema_degraded:true, claim_capable:false,
      missing_optional_fields:['metadata','updated_at','last_failure_at','next_run_after'],
    });
    expect(result.warnings).toContain('LEGACY_SCHEMA_SHADOW_ONLY');
    expect(result.board.unavailable_capabilities.every((item) => item.available === false && item.derived === false)).toBe(true);
    expect(result.candidates[0]).toMatchObject({ shadow_eligible:true, claim_eligible:false, claim_blocker_codes:['LEGACY_SCHEMA_NOT_CLAIM_CAPABLE'] });
    expect(result.candidates[0].ineligibility_reason_codes).not.toEqual(expect.arrayContaining(['PAUSED','AWAITING_USER','DUPLICATE_CANDIDATE','TEST_CARD']));
    expect(result.winner.selection_performed).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/"metadata"\s*:\s*\{\s*\}/);
    expect(Object.values(result.side_effects).every((value) => value === false)).toBe(true);
  });

  test('legacy schema fails closed for a missing core column or conflicting type', () => {
    const missing = path.join(directory,'legacy-missing.db'); createDatabase(missing, [], [], { profile:'legacy', omit:'claim_lock' });
    const conflicting = path.join(directory,'legacy-conflict.db'); createDatabase(conflicting, [], [], { profile:'legacy', typeConflict:'priority' });
    expect(() => scanDatabase(options({ db:missing }))).toThrow(/Schema mismatch/);
    expect(() => scanDatabase(options({ db:conflicting }))).toThrow(/Schema mismatch/);
  });

  test('partial optional fields are unknown while harmless extras do not change legacy behavior', () => {
    const unknown = path.join(directory,'unknown.db'); createDatabase(unknown, [], [], { omit:'metadata' });
    expect(() => scanDatabase(options({ db:unknown }))).toThrow(/Schema mismatch/);
    const extra = path.join(directory,'legacy-extra.db'); createDatabase(extra, [], [], { profile:'legacy', extra:true });
    const result = scanDatabase(options({ db:extra }));
    expect(result.board.schema_profile).toBe(SCHEMA_PROFILES.LEGACY_SHADOW);
    expect(result.board.schema_degraded).toBe(true);
  });
  test('CLI emits one JSON document only on success and no misleading JSON on failure', () => {
    const bin = new URL('../bin/kanban-triage-shadow', import.meta.url);
    const success = spawnSync(process.execPath, [bin.pathname,'--board','fixture-board','--db',dbPath,'--triage-status','triage','--top','5','--json','--shadow','--read-only','--fixture','--as-of',fixture.as_of], { encoding:'utf8' });
    expect(success.status).toBe(0); expect(() => JSON.parse(success.stdout)).not.toThrow(); expect(success.stdout.trim().split('\n')).toHaveLength(1);
    const failure = spawnSync(process.execPath, [bin.pathname,'--json'], { encoding:'utf8' });
    expect(failure.status).toBe(1); expect(failure.stdout).toBe(''); expect(failure.stderr).not.toContain(dbPath);
  });
  test('source runtime has no mutation helper, model or network imports', () => {
    const source = readFileSync(new URL('./kanban-triage-shadow.mjs', import.meta.url), 'utf8');
    for (const pattern of ['node:child_process','writeFile','appendFile','unlink','rename','mkdir','fetch(','http:','https:','sendMessage','kanban mutation','model provider']) expect(source).not.toContain(pattern);
  });
  test('source files remain unchanged by scans', () => {
    const policy = new URL('./kanban-triage-policy.mjs', import.meta.url); const scanner = new URL('./kanban-triage-shadow.mjs', import.meta.url);
    const before = [hash(policy), hash(scanner)]; scanDatabase(options()); expect([hash(policy), hash(scanner)]).toEqual(before);
    expect(statSync(new URL('../bin/kanban-triage-shadow', import.meta.url)).mode & 0o111).toBeTruthy();
  });
});

describe('verified temporary snapshot safety', () => {
  function sourceCopy(name) { const target = path.join(directory, name); copyFileSync(dbPath, target); return target; }

  test('absent WAL permits a verified mode-bounded snapshot and cleans it after success', () => {
    const source = sourceCopy('snapshot-absent.db'); const before = hash(source);
    let temporaryDirectory; let snapshotPath;
    const value = withVerifiedLiveSnapshot(source, ({ directory: temp, databasePath, attestation }) => {
      temporaryDirectory = temp; snapshotPath = databasePath;
      expect(statSync(temp).mode & 0o777).toBe(0o700); expect(statSync(databasePath).mode & 0o777).toBe(0o600);
      expect(attestation.source_before.sha256).toBe(attestation.snapshot.sha256); return 'ok';
    });
    expect(value).toBe('ok'); expect(existsSync(snapshotPath)).toBe(false); expect(existsSync(temporaryDirectory)).toBe(false); expect(hash(source)).toBe(before);
  });

  test('zero-byte WAL permits snapshot while non-zero WAL fails closed before temp creation', () => {
    const zero = sourceCopy('snapshot-zero-wal.db'); writeFileSync(`${zero}-wal`, '');
    expect(withVerifiedLiveSnapshot(zero, () => 'ok')).toBe('ok');
    const busy = sourceCopy('snapshot-busy-wal.db'); writeFileSync(`${busy}-wal`, 'busy');
    const beforeDirs = new Set(readdirSync('/tmp').filter((name) => name.startsWith('kanban-triage-shadow-')));
    expect(() => withVerifiedLiveSnapshot(busy, () => null)).toThrow(/LIVE_WAL_NOT_QUIESCENT/);
    expect(new Set(readdirSync('/tmp').filter((name) => name.startsWith('kanban-triage-shadow-')))).toEqual(beforeDirs);
  });

  test('source content, size or mtime changes during copy fail closed and clean up', () => {
    const changed = sourceCopy('snapshot-changed.db'); let temp;
    expect(() => withVerifiedLiveSnapshot(changed, () => null, { testHooks: { afterCopy({ directory: d }) { temp = d; writeFileSync(changed, Buffer.concat([readFileSync(changed), Buffer.from('x')])); } } })).toThrow(/LIVE_SOURCE_CHANGED_DURING_SNAPSHOT/);
    expect(existsSync(temp)).toBe(false);
    const touched = sourceCopy('snapshot-touched.db'); let touchedTemp;
    expect(() => withVerifiedLiveSnapshot(touched, () => null, { testHooks: { afterCopy({ directory: d }) { touchedTemp = d; const now = new Date(); utimesSync(touched, now, new Date(now.getTime() + 2000)); } } })).toThrow(/LIVE_SOURCE_CHANGED_DURING_SNAPSHOT/);
    expect(existsSync(touchedTemp)).toBe(false);
  });

  test('WAL appearing during copy and copied snapshot mismatch fail closed', () => {
    const wal = sourceCopy('snapshot-wal-appears.db'); let walTemp;
    expect(() => withVerifiedLiveSnapshot(wal, () => null, { testHooks: { afterCopy({ directory }) { walTemp = directory; writeFileSync(`${wal}-wal`, 'appeared'); } } })).toThrow(/LIVE_SOURCE_CHANGED_DURING_SNAPSHOT/);
    expect(existsSync(walTemp)).toBe(false);
    const mismatch = sourceCopy('snapshot-mismatch.db'); let mismatchTemp;
    expect(() => withVerifiedLiveSnapshot(mismatch, () => null, { testHooks: { afterCopy({ directory, databasePath }) { mismatchTemp = directory; chmodSync(databasePath, 0o600); writeFileSync(databasePath, 'different'); } } })).toThrow(/LIVE_SOURCE_CHANGED_DURING_SNAPSHOT/);
    expect(existsSync(mismatchTemp)).toBe(false);
  });

  test('symlink sources are rejected and fixed destination cannot escape generated directory', () => {
    const source = sourceCopy('snapshot-real.db'); const link = path.join(directory, 'snapshot-link.db'); symlinkSync(source, link);
    expect(() => withVerifiedLiveSnapshot(link, () => null)).toThrow(/LIVE_SOURCE_UNSAFE/);
    const runtime = readFileSync(new URL('./kanban-triage-shadow.mjs', import.meta.url), 'utf8');
    expect(runtime).toContain("const SNAPSHOT_DATABASE_NAME = 'snapshot.db'"); expect(runtime).not.toContain('destinationName');
  });

  test('snapshot is removed after scanner/schema errors and leaves no persistent output', () => {
    const malformed = path.join(directory, 'snapshot-schema-error.db'); writeFileSync(malformed, 'not sqlite'); let temp;
    expect(() => withVerifiedLiveSnapshot(malformed, ({ directory: d }) => { temp = d; throw new Error('schema failure'); })).toThrow(/schema failure/);
    expect(existsSync(temp)).toBe(false);
  });

  test('immutable URI is constructed only inside snapshot/fixture scanner, never from supplied live path', () => {
    const runtime = readFileSync(new URL('./kanban-triage-shadow.mjs', import.meta.url), 'utf8');
    expect(runtime).toMatch(/function scanImmutableDatabase\(databasePath/); expect(runtime).toMatch(/withVerifiedLiveSnapshot\(sourcePath/);
    expect(runtime).not.toMatch(/pathToFileURL\(sourcePath\)/); expect(runtime).not.toContain('nolock');
    expect(runtime).not.toMatch(/wal_checkpoint|journal_mode|writable_schema/i);
  });
});

describe('mixed legacy created_at storage classes', () => {
  function mixedDatabase(name, cards) { const target = path.join(directory, name); createDatabase(target, cards, [], { profile:'legacy', preserveCreatedAt:true }); return target; }

  test('accepts integer epochs, bounded maximum and strict fractional UTC text', () => {
    const target = mixedDatabase('mixed-valid.db', [
      { id:'epoch', title:'Epoch', body:'valid', status:'triage', created_at:0, idempotency_key:'epoch' },
      { id:'maximum', title:'Maximum', body:'valid', status:'triage', created_at:253402300799, idempotency_key:'maximum' },
      { id:'fraction', title:'Fraction', body:'valid', status:'triage', created_at:'2026-06-01T00:00:00.123456Z', idempotency_key:'fraction' },
    ]);
    const result = scanDatabase(options({ db:target, top:50 }));
    expect(result.summary.triage_cards).toBe(3); expect(result.summary.reason_code_counts.INVALID_TIMESTAMP).toBeUndefined();
  });

  test('invalid timestamps do not abort, receive no aging, sort after valid and never become eligible', () => {
    const target = mixedDatabase('mixed-invalid.db', [
      { id:'valid', title:'Valid', body:'valid', status:'triage', created_at:1, idempotency_key:'valid' },
      { id:'invalid-a', title:'Invalid A', body:'invalid', status:'triage', created_at:'2026-06-01 00:00:00', idempotency_key:'invalid-a' },
      { id:'invalid-b', title:'Invalid B', body:'invalid', status:'triage', created_at:253402300800, idempotency_key:'invalid-b' },
    ]);
    const result = scanDatabase(options({ db:target, top:50 }));
    const invalid = result.candidates.filter((item) => item.ineligibility_reason_codes.includes('INVALID_TIMESTAMP'));
    expect(invalid.map((item) => item.card_id)).toEqual(['invalid-a','invalid-b']);
    expect(invalid.every((item) => item.aging_bonus === 0 && item.shadow_eligible === false && item.claim_eligible === false)).toBe(true);
    expect(result.candidates[0].card_id).toBe('valid');
  });

  test('invalid non-Triage timestamp counts but does not block or pollute zero-Triage result', () => {
    const target = mixedDatabase('mixed-zero-triage.db', [{ id:'done-invalid', title:'Done', body:'invalid', status:'done', created_at:'not-a-time', idempotency_key:'done-invalid' }]);
    const result = scanDatabase(options({ db:target, top:50 }));
    expect(result.summary.total_cards).toBe(1); expect(result.summary.triage_cards).toBe(0); expect(result.summary.reason_code_counts).toEqual({});
    expect(result.candidates).toEqual([]); expect(result.winner.reason).toBe('NO_ELIGIBLE_TRIAGE_CARDS');
  });
});
