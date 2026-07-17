import { describe, expect, test } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PROPOSAL_SCHEMA, REQUEST_JSON_LIMITS, buildProposalIdempotencyKey,
  compileShadowEventProposals, parseProposalCliArgs, parseProposalRequestJson,
  validateShadowPreview,
} from './kanban-autonomy-proposals.mjs';
import {
  buildCardEvaluation, canonicalJson as shadowCanonicalJson, compareCandidates,
} from './kanban-triage-policy.mjs';
import { canonicalJson, durableTaskId, projectTaskStateToKanban, validateEventPayload } from './kanban-autonomy-state.mjs';
import { scanDatabase } from './kanban-triage-shadow.mjs';
import {
  STORE_DATABASE_NAME, appendEvent, createTask, initStore, replayTaskState, verifyTaskChain,
} from './kanban-autonomy-store.mjs';

const worktree = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const node = process.execPath;
const wrapper = path.join(worktree, 'bin/kanban-autonomy-proposals');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/kanban-autonomy-proposals.json', import.meta.url), 'utf8'));
const shadowFixture = JSON.parse(readFileSync(new URL('./fixtures/kanban-triage-shadow.json', import.meta.url), 'utf8'));
const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

function sourceCard(id, { ineligible = false, snapshotSalt = id } = {}) {
  return {
    id,
    title: `Synthetic ${snapshotSalt}`,
    body: 'Synthetic fixture-only observation with enough bounded detail for deterministic scoring.',
    status: 'triage',
    priority: 50,
    created_by: 'fixture',
    tenant: 'fixture',
    metadata: {
      source_identity: `fixture:${id}`,
      awaiting_user: ineligible,
      factors: {
        expected_value: ineligible ? 40 : 80,
        urgency: 60,
        confidence: 75,
        effort: 35,
        risk: 20,
        strategic_fit: 80,
        dependency_readiness: 90,
        autonomous_readiness: 85,
        time_saved: 70,
        revenue_impact: 65,
        learning_reuse: 80,
        approval_free_work: 90,
      },
      portfolio_category: ineligible ? 'research_planning' : 'high_value_execution',
    },
    created_at: '2026-05-01T00:00:00Z',
  };
}

function candidateFrom(card) {
  const evaluation = buildCardEvaluation({
    card,
    configuredTriageStatus: 'triage',
    evaluationTimestamp: '2026-07-11T00:00:00Z',
    testMode: false,
    dependencies: { hardBlocked: false },
    activeTask: false,
    activeLease: false,
    authorityAvailable: true,
    retryState: {},
    capabilities: {
      metadata: true, updated_at: true, last_failure_at: true, next_run_after: true,
    },
  });
  const { normalized, eligibility, scoring, portfolio } = evaluation;
  return {
    card_id: normalized.id,
    card_snapshot_hash: normalized.card_snapshot_hash,
    title_preview_redacted: normalized.title_preview_redacted,
    title_hash: normalized.title_hash,
    source_identity_hash: normalized.source_identity_hash,
    shadow_eligible: eligibility.eligible,
    claim_eligible: false,
    claim_blocker_codes: ['SHADOW_SCANNER_HAS_NO_CLAIM_ENGINE'],
    ineligibility_reason_codes: eligibility.reason_codes,
    factor_inputs: scoring.factor_inputs,
    factor_provenance: scoring.factor_provenance,
    weighted_contributions: scoring.weighted_contributions,
    penalties: scoring.penalties,
    aging_bonus: scoring.aging_bonus,
    final_score: scoring.final_score,
    score_basis_points: scoring.score_basis_points,
    portfolio_category: portfolio.category,
    portfolio_advisory: portfolio.advisory,
    tie_break_values: {
      approval_free_work: scoring.factor_inputs.approval_free_work,
      risk: scoring.factor_inputs.risk,
      dependency_readiness: scoring.factor_inputs.dependency_readiness,
      created_at: normalized.created_at,
      created_at_ms: normalized.created_at_ms,
      created_at_fraction_ns: normalized.created_at_fraction_ns,
      stable_card_id: normalized.id,
    },
    proposed_outcome: evaluation.proposed_outcome,
    explanation_codes: [...new Set([
      ...eligibility.evidence_codes, ...eligibility.reason_codes, portfolio.advisory.explanation_code,
    ])].sort(),
  };
}

function preview({ cards = [sourceCard('synthetic-eligible')], overrides = {} } = {}) {
  const candidates = cards.map(candidateFrom).sort(compareCandidates)
    .map((candidate, index) => ({ rank: index + 1, ...candidate }));
  const eligible = candidates.filter((candidate) => candidate.shadow_eligible);
  const reasonCounts = {};
  for (const candidate of candidates) {
    for (const reason of candidate.ineligibility_reason_codes) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    }
  }
  const base = {
    schema: 'kan_aut_triage_shadow_preview.v1',
    mode: 'shadow_read_only',
    generated_at: '2026-07-11T00:00:00Z',
    policy: {
      eligibility_version: 'kanban_triage_eligibility.v1',
      scoring_version: 'kanban_priority_score.v1',
      portfolio_version: 'kanban_portfolio_advisory.v1',
      eligibility_scope: 'shadow_preview_only',
    },
    board: {
      slug: 'fixture-board',
      database_path_hash: HASH_A,
      scan_source: 'synthetic_fixture',
      source_database_path_hash: HASH_A,
      source_database_sha256: HASH_B,
      snapshot_sha256: HASH_B,
      snapshot_matches_source: true,
      source_wal_state: 'absent',
      snapshot_hash: HASH_C,
      sqlite_data_version: 1,
      configured_triage_status: 'triage',
      query_only: 1,
      sqlite_immutable: 1,
      schema_profile: 'kanban_tasks_full_v1',
      schema_degraded: false,
      missing_optional_fields: [],
      claim_capable: false,
      unavailable_capabilities: [],
      connection_total_changes: 0,
      sidecar_no_creation_verified: true,
    },
    ephemeral_artifacts: {
      temporary_snapshot_created: false,
      temporary_snapshot_removed: false,
      persistent_output_created: false,
    },
    summary: {
      total_cards: candidates.length,
      triage_cards: candidates.length,
      shadow_eligible_cards: eligible.length,
      shadow_ineligible_cards: candidates.length - eligible.length,
      scored_cards: candidates.length,
      returned_candidates: candidates.length,
      reason_code_counts: Object.fromEntries(Object.entries(reasonCounts).sort()),
    },
    side_effects: {
      database_write: false,
      card_created: false,
      card_moved: false,
      card_edited: false,
      comment_created: false,
      task_created: false,
      lease_created: false,
      approval_created: false,
      telegram_sent: false,
      obsidian_written: false,
      github_written: false,
      durable_store_written: false,
      source_written: false,
      model_calls: false,
      network_calls: false,
      service_changes: false,
      timer_changes: false,
    },
    candidates,
    winner: eligible.length > 0 ? {
      selection_performed: false,
      preview_card_id: eligible[0].card_id,
      preview_score: eligible[0].final_score,
      reason: 'HIGHEST_RANKED_ELIGIBLE_PREVIEW_ONLY',
    } : {
      selection_performed: false,
      preview_card_id: null,
      preview_score: null,
      reason: 'NO_ELIGIBLE_TRIAGE_CARDS',
    },
    warnings: [],
  };
  return { ...base, ...overrides };
}

function request(cardId = 'synthetic-eligible', shadowPreview = preview()) {
  return {
    schema: 'kan_aut_shadow_event_proposal_request.v1',
    shadow_preview: shadowPreview,
    card_id: cardId,
    authority_ceiling: 'A0',
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function errorCode(fn) {
  try { fn(); } catch (error) { return error.code; }
  return null;
}

function runWrapper(input, executable = wrapper, argv = ['compile', '--json', '--proposal-only']) {
  return spawnSync(executable, argv, { cwd: worktree, input, encoding: 'utf8' });
}

function createScannerDatabase(target) {
  const fullColumns = [
    'id TEXT PRIMARY KEY', 'title TEXT', 'body TEXT', 'status TEXT', 'priority INTEGER',
    'created_by TEXT', 'tenant TEXT', 'metadata TEXT', 'claim_lock TEXT', 'claim_expires TEXT',
    'worker_pid INTEGER', 'created_at TEXT', 'updated_at TEXT', 'consecutive_failures INTEGER',
    'last_failure_at TEXT', 'max_retries INTEGER', 'current_run_id TEXT', 'next_run_after TEXT',
    'idempotency_key TEXT',
  ];
  const db = new DatabaseSync(target);
  db.exec('PRAGMA journal_mode=DELETE');
  db.exec(`CREATE TABLE tasks (${fullColumns.join(',')})`);
  db.exec('CREATE TABLE task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL, PRIMARY KEY(parent_id, child_id))');
  const columns = fullColumns.map((definition) => definition.split(' ')[0]);
  const statement = db.prepare(`INSERT INTO tasks (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
  for (const input of shadowFixture.cards) {
    const defaults = {
      title: '', body: '', status: 'triage', priority: 50, created_by: 'fixture', tenant: 'fixture',
      metadata: {}, claim_lock: null, claim_expires: null, worker_pid: null, created_at: null,
      updated_at: null, consecutive_failures: 0, last_failure_at: null, max_retries: null,
      current_run_id: null, next_run_after: null, idempotency_key: null,
    };
    const row = { ...defaults, ...input, metadata: typeof input.metadata === 'string' ? input.metadata : JSON.stringify(input.metadata ?? {}) };
    statement.run(...columns.map((column) => row[column] ?? null));
  }
  const link = db.prepare('INSERT INTO task_links (parent_id, child_id) VALUES (?, ?)');
  for (const item of shadowFixture.links) link.run(item.parent_id, item.child_id);
  db.close();
}

function createLegacyScannerDatabase(target) {
  const columns = [
    'id TEXT PRIMARY KEY', 'title TEXT', 'body TEXT', 'status TEXT', 'priority INTEGER',
    'created_by TEXT', 'tenant TEXT', 'claim_lock TEXT', 'claim_expires INTEGER',
    'worker_pid INTEGER', 'created_at INTEGER', 'consecutive_failures INTEGER',
    'max_retries INTEGER', 'current_run_id INTEGER', 'idempotency_key TEXT',
  ];
  const db = new DatabaseSync(target);
  db.exec('PRAGMA journal_mode=DELETE');
  db.exec(`CREATE TABLE tasks (${columns.join(',')})`);
  db.exec('CREATE TABLE task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL, PRIMARY KEY(parent_id, child_id))');
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'legacy-synthetic-1',
    'Synthetic legacy fixture card',
    'Synthetic-only stable legacy observation with sufficient detail for deterministic scoring.',
    'triage', 60, 'fixture', 'fixture', null, null, null,
    Math.floor(Date.parse('2026-06-01T00:00:00Z') / 1000), 0, null, null,
    'fixture:legacy-synthetic-1',
  );
  db.close();
}

describe('request and complete preview validation', () => {
  test('valid eligible candidate compiles', () => {
    expect(compileShadowEventProposals(request())).toMatchObject({ schema: PROPOSAL_SCHEMA, mode: 'proposal_only' });
  });

  test('valid explicitly selected ineligible candidate compiles observation proposals', () => {
    const doc = preview({ cards: [sourceCard('synthetic-eligible'), sourceCard('synthetic-ineligible', { ineligible: true })] });
    const result = compileShadowEventProposals(request('synthetic-ineligible', doc));
    expect(result.event_proposals[0].input.payload).toMatchObject({ eligible: false, reason_codes: ['AWAITING_USER'] });
    expect(result.validation.authority_ceiling).toBe('A0');
  });

  test.each([
    ['unknown request field', (value) => { value.extra = true; }, 'INVALID_REQUEST'],
    ['missing request schema', (value) => { delete value.schema; }, 'INVALID_REQUEST'],
    ['wrong request schema', (value) => { value.schema = 'wrong'; }, 'UNSUPPORTED_REQUEST_SCHEMA'],
    ['unknown preview field', (value) => { value.shadow_preview.extra = true; }, 'INVALID_SHADOW_PREVIEW'],
    ['unknown preview schema', (value) => { value.shadow_preview.schema = 'wrong'; }, 'UNSUPPORTED_SHADOW_SCHEMA'],
    ['unknown policy', (value) => { value.shadow_preview.policy.eligibility_version = 'wrong'; }, 'UNSUPPORTED_SHADOW_POLICY'],
    ['missing authority', (value) => { delete value.authority_ceiling; }, 'INVALID_REQUEST'],
    ['authority below', (value) => { value.authority_ceiling = ''; }, 'AUTHORITY_CEILING_MUST_BE_A0'],
    ['authority above', (value) => { value.authority_ceiling = 'A1'; }, 'AUTHORITY_CEILING_MUST_BE_A0'],
    ['missing selected candidate', (value) => { value.card_id = 'missing-card'; }, 'SELECTED_CANDIDATE_NOT_FOUND'],
    ['invalid hash', (value) => { value.shadow_preview.board.snapshot_hash = 'sha256:BAD'; }, 'INVALID_HASH'],
    ['invalid timestamp', (value) => { value.shadow_preview.generated_at = '2026-07-11T00:00:00+00:00'; }, 'INVALID_GENERATED_AT'],
    ['inconsistent source hash', (value) => { value.shadow_preview.board.source_database_sha256 = HASH_C; }, 'INCONSISTENT_BOARD_ATTESTATION'],
    ['selection performed', (value) => { value.shadow_preview.winner.selection_performed = true; }, 'SELECTION_PERFORMED_FORBIDDEN'],
    ['true side effect', (value) => { value.shadow_preview.side_effects.database_write = true; }, 'SHADOW_SIDE_EFFECT_TRUE'],
  ])('rejects %s', (_name, mutate, code) => {
    const value = clone(request());
    mutate(value);
    expect(errorCode(() => compileShadowEventProposals(value))).toBe(code);
  });

  test.each([
    'database_write', 'card_created', 'card_moved', 'card_edited', 'comment_created',
    'task_created', 'lease_created', 'approval_created', 'telegram_sent', 'obsidian_written',
    'github_written', 'durable_store_written', 'source_written', 'model_calls', 'network_calls',
    'service_changes', 'timer_changes',
  ])('rejects input side-effect %s when individually true', (field) => {
    const value = request();
    value.shadow_preview.side_effects[field] = true;
    expect(errorCode(() => compileShadowEventProposals(value))).toBe('SHADOW_SIDE_EFFECT_TRUE');
  });

  test('duplicate candidate IDs are rejected before selection', () => {
    const doc = preview({ cards: [sourceCard('synthetic-eligible'), sourceCard('synthetic-second')] });
    doc.candidates[1].card_id = doc.candidates[0].card_id;
    doc.candidates[1].tie_break_values.stable_card_id = doc.candidates[0].card_id;
    expect(errorCode(() => compileShadowEventProposals(request('synthetic-eligible', doc)))).toBe('DUPLICATE_CANDIDATE_ID');
  });

  test('A0 is accepted exactly', () => {
    expect(compileShadowEventProposals(request()).validation.authority_ceiling).toBe('A0');
  });

  test('complete preview validator returns a recursively frozen stable snapshot', () => {
    const doc = preview();
    const validated = validateShadowPreview(doc);
    expect(validated).toStrictEqual(doc);
    expect(validated).not.toBe(doc);
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.board)).toBe(true);
    expect(Object.isFrozen(validated.candidates[0].factor_inputs)).toBe(true);
  });

  test('forged factor provenance is rejected', () => {
    const doc = preview();
    doc.candidates[0].factor_provenance.expected_value.confidence = 25;
    doc.candidates[0].factor_provenance.expected_value.source_reference_hash = HASH_A;
    expect(errorCode(() => validateShadowPreview(doc))).toBe('INVALID_FACTOR_PROVENANCE');
  });

  test('reason-linked penalty tampering is rejected', () => {
    const doc = preview({ cards: [sourceCard('synthetic-ineligible', { ineligible: true })] });
    doc.candidates[0].penalties.awaiting_user = 0;
    expect(errorCode(() => validateShadowPreview(doc))).toBe('INCONSISTENT_PENALTIES');
  });

  test('mandatory no-approval and no-claim explanations are enforced', () => {
    const doc = preview();
    doc.candidates[0].explanation_codes = doc.candidates[0].explanation_codes
      .filter((code) => !['MANUAL_STATUS_IS_NOT_APPROVAL_AUTHORITY', 'SHADOW_ONLY_NO_CLAIM'].includes(code));
    expect(errorCode(() => validateShadowPreview(doc))).toBe('INCONSISTENT_EXPLANATIONS');
  });

  test('producer-valid factor proposals remain valid for verified snapshot scans', () => {
    const card = sourceCard('synthetic-proposal');
    card.metadata.factor_proposal = card.metadata.factors;
    delete card.metadata.factors;
    const doc = preview({ cards: [card] });
    doc.board.scan_source = 'verified_temporary_snapshot';
    doc.ephemeral_artifacts.temporary_snapshot_created = true;
    doc.ephemeral_artifacts.temporary_snapshot_removed = true;
    expect(validateShadowPreview(doc)).toStrictEqual(doc);
  });

  test('source identity hash and missing-identity reason must agree', () => {
    const doc = preview();
    doc.candidates[0].source_identity_hash = null;
    expect(errorCode(() => validateShadowPreview(doc))).toBe('INCONSISTENT_SOURCE_IDENTITY');
  });

  test('unsafe title preview and arbitrary explanation codes are rejected', () => {
    const unsafe = preview();
    unsafe.candidates[0].title_preview_redacted = 'contact synthetic@example.invalid';
    expect(errorCode(() => validateShadowPreview(unsafe))).toBe('INVALID_REDACTED_TITLE');
    const unexplained = preview();
    unexplained.candidates[0].explanation_codes.push('UNRELATED_EXTRA_EVIDENCE');
    unexplained.candidates[0].explanation_codes.sort();
    expect(errorCode(() => validateShadowPreview(unexplained))).toBe('INCONSISTENT_EXPLANATIONS');
  });

  test('summary eligibility attestations are reconciled with returned candidates', () => {
    const doc = preview();
    doc.summary.shadow_eligible_cards = 0;
    doc.summary.shadow_ineligible_cards = doc.summary.triage_cards;
    expect(errorCode(() => validateShadowPreview(doc))).toBe('INCONSISTENT_SUMMARY');
  });

  test('nonempty triage cannot attest an empty returned prefix and reason counts are bounded', () => {
    const emptyPrefix = preview();
    emptyPrefix.candidates = [];
    emptyPrefix.summary.returned_candidates = 0;
    expect(errorCode(() => validateShadowPreview(emptyPrefix))).toBe('INCONSISTENT_SUMMARY');
    const excessiveReasons = preview({ cards: [sourceCard('synthetic-ineligible', { ineligible: true })] });
    excessiveReasons.summary.reason_code_counts.AWAITING_USER = 2;
    expect(errorCode(() => validateShadowPreview(excessiveReasons))).toBe('INCONSISTENT_SUMMARY');
  });

  test('candidate rank order is checked with the merged comparator', () => {
    const doc = preview({ cards: [sourceCard('synthetic-eligible'), sourceCard('synthetic-second')] });
    doc.candidates.reverse();
    doc.candidates.forEach((candidate, index) => { candidate.rank = index + 1; });
    expect(errorCode(() => validateShadowPreview(doc))).toBe('INVALID_CANDIDATE_ORDER');
  });

  test('returned winner must be the first ranked eligible candidate', () => {
    const doc = preview({ cards: [sourceCard('synthetic-eligible'), sourceCard('synthetic-second')] });
    const second = doc.candidates[1];
    doc.winner.preview_card_id = second.card_id;
    doc.winner.preview_score = second.final_score;
    expect(errorCode(() => validateShadowPreview(doc))).toBe('INCONSISTENT_WINNER_PREVIEW');
  });
});

describe('selection safety, authority, and privacy', () => {
  test('no card ID means no default selection', () => {
    const value = request();
    delete value.card_id;
    expect(errorCode(() => compileShadowEventProposals(value))).toBe('INVALID_REQUEST');
  });

  test('winner is never used implicitly', () => {
    const value = request();
    value.card_id = 'not-the-winner';
    expect(errorCode(() => compileShadowEventProposals(value))).toBe('SELECTED_CANDIDATE_NOT_FOUND');
  });

  test('explicit non-winner selection works', () => {
    const doc = preview({ cards: [sourceCard('synthetic-eligible'), sourceCard('synthetic-ineligible', { ineligible: true })] });
    expect(doc.winner.preview_card_id).not.toBe('synthetic-ineligible');
    expect(compileShadowEventProposals(request('synthetic-ineligible', doc)).source.card_id).toBe('synthetic-ineligible');
  });

  test('ineligible selection remains observation-only', () => {
    const doc = preview({ cards: [sourceCard('synthetic-ineligible', { ineligible: true })] });
    const output = compileShadowEventProposals(request('synthetic-ineligible', doc));
    expect(output.side_effects).toEqual(expect.objectContaining({ approval_requested: false, claim_performed: false, lease_created: false, execution_performed: false }));
    expect(output.event_proposals.map((proposal) => proposal.event_type)).toEqual([
      'CARD_ELIGIBILITY_EVALUATED', 'CARD_SCORED',
    ]);
  });

  test('output omits private and action-shaped source fields', () => {
    const output = canonicalJson(compileShadowEventProposals(request()));
    for (const forbidden of ['title_preview_redacted', 'Synthetic synthetic-eligible', 'body', 'metadata', 'database_path', 'queue_content', 'approval_content', 'credential']) {
      expect(output).not.toContain(forbidden);
    }
  });
});

describe('determinism, ordering, and KAN-AUT-3 acceptance', () => {
  test('exact deterministic task ID', () => {
    const output = compileShadowEventProposals(request());
    expect(output.event_proposals[0].input.taskId).toBe(durableTaskId('fixture-board', 'synthetic-eligible'));
    expect(output.event_proposals[0].input.taskId).toBe(fixture.expected.eligible_task_id);
  });

  test('operation order is create then eligibility then score', () => {
    const output = compileShadowEventProposals(request());
    expect([output.task_proposal.operation, ...output.event_proposals.map((item) => item.event_type)])
      .toEqual(['create_task', 'CARD_ELIGIBILITY_EVALUATED', 'CARD_SCORED']);
  });

  test('identical input produces byte-identical stable canonical output', () => {
    const value = request();
    const first = canonicalJson(compileShadowEventProposals(value));
    const second = canonicalJson(compileShadowEventProposals(clone(value)));
    expect(second).toBe(first);
    expect(first).toBe(shadowCanonicalJson(JSON.parse(first)));
  });

  test('stable expected idempotency keys match the fixture', () => {
    const output = compileShadowEventProposals(request());
    expect(output.task_proposal.input.idempotencyKey).toBe(fixture.expected.eligible_create_idempotency_key);
    expect(output.event_proposals[0].input.idempotencyKey).toBe(fixture.expected.eligible_eligibility_idempotency_key);
    expect(output.event_proposals[1].input.idempotencyKey).toBe(fixture.expected.eligible_score_idempotency_key);
    expect(new Set([output.task_proposal.input.idempotencyKey, ...output.event_proposals.map((item) => item.input.idempotencyKey)]).size).toBe(3);
  });

  test('changed card snapshot changes every relevant key', () => {
    const first = compileShadowEventProposals(request());
    const changedPreview = preview({ cards: [sourceCard('synthetic-eligible', { snapshotSalt: 'changed' })] });
    const second = compileShadowEventProposals(request('synthetic-eligible', changedPreview));
    expect(second.task_proposal.input.idempotencyKey).not.toBe(first.task_proposal.input.idempotencyKey);
    expect(second.event_proposals.map((item) => item.input.idempotencyKey))
      .not.toEqual(first.event_proposals.map((item) => item.input.idempotencyKey));
  });

  test('changed source identity changes every relevant key', () => {
    const value = preview();
    const first = compileShadowEventProposals(request('synthetic-eligible', value));
    value.candidates[0].source_identity_hash = HASH_C;
    const second = compileShadowEventProposals(request('synthetic-eligible', value));
    expect(second.task_proposal.input.idempotencyKey).not.toBe(first.task_proposal.input.idempotencyKey);
    expect(second.event_proposals.map((item) => item.input.idempotencyKey))
      .not.toEqual(first.event_proposals.map((item) => item.input.idempotencyKey));
  });

  test('changed unselected board evidence cannot collide with eligibility idempotency', () => {
    const root = mkdtempSync('/tmp/hermes-kan-autonomy-kan4a-collision-');
    const freshRoots = [];
    chmodSync(root, 0o700);
    const scannerDb = path.join(root, 'scanner-fixture.db');
    const storePath = path.join(root, STORE_DATABASE_NAME);
    try {
      createScannerDatabase(scannerDb);
      const scan = () => scanDatabase({
        board: 'fixture-board', db: scannerDb, triageStatus: 'triage', top: 50,
        fixture: true, asOf: shadowFixture.as_of,
      });
      const firstPreview = scan();
      const selectedCardId = firstPreview.candidates[0].card_id;
      const first = compileShadowEventProposals(request(selectedCardId, firstPreview));
      const unselected = shadowFixture.cards.find((card) => card.id !== selectedCardId);
      expect(unselected).toBeDefined();
      const db = new DatabaseSync(scannerDb);
      db.prepare('UPDATE tasks SET body = ? WHERE id = ?')
        .run(`${unselected.body ?? ''} Synthetic unrelated board-row change.`, unselected.id);
      db.close();
      const secondPreview = scan();
      const second = compileShadowEventProposals(request(selectedCardId, secondPreview));
      const firstEligibility = first.event_proposals[0].input;
      const secondEligibility = second.event_proposals[0].input;

      expect(secondPreview.board.snapshot_hash).not.toBe(firstPreview.board.snapshot_hash);
      expect(second.source.card_snapshot_hash).toBe(first.source.card_snapshot_hash);
      expect(second.source.source_identity_hash).toBe(first.source.source_identity_hash);
      expect(second.source.generated_at).toBe(first.source.generated_at);
      expect(secondEligibility.payload).not.toEqual(firstEligibility.payload);

      initStore({ storePath });
      createTask({ storePath, ...first.task_proposal.input });
      appendEvent({ storePath, ...firstEligibility });
      if (secondEligibility.idempotencyKey === firstEligibility.idempotencyKey) {
        let conflictCode = null;
        try { appendEvent({ storePath, ...secondEligibility }); } catch (error) { conflictCode = error.code; }
        expect(conflictCode).toBe('EVENT_IDEMPOTENCY_CONFLICT');
        throw new Error('RED_ELIGIBILITY_IDEMPOTENCY_COLLISION_PROVEN');
      }
      expect(appendEvent({ storePath, ...secondEligibility })).toMatchObject({ appended: true });

      for (const [name, proposal] of [['first', first], ['second', second]]) {
        const freshRoot = mkdtempSync(`/tmp/hermes-kan-autonomy-kan4a-${name}-`);
        freshRoots.push(freshRoot);
        chmodSync(freshRoot, 0o700);
        const freshStore = path.join(freshRoot, STORE_DATABASE_NAME);
        initStore({ storePath: freshStore });
        createTask({ storePath: freshStore, ...proposal.task_proposal.input });
        expect(appendEvent({ storePath: freshStore, ...proposal.event_proposals[0].input }))
          .toMatchObject({ appended: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
      freshRoots.forEach((item) => rmSync(item, { recursive: true, force: true }));
    }
    expect(existsSync(root)).toBe(false);
    expect(freshRoots.every((item) => !existsSync(item))).toBe(true);
  }, 15000);

  test('programmatic accessor input cannot change after validation', () => {
    const doc = preview();
    let reads = 0;
    Object.defineProperty(doc, 'generated_at', {
      enumerable: true,
      get() {
        reads += 1;
        return reads <= 5 ? '2026-07-11T00:00:00Z' : 'not-a-timestamp';
      },
    });
    let caught;
    try {
      const output = compileShadowEventProposals(request('synthetic-eligible', doc));
      expect(output.task_proposal.input.createdAt).toBe('not-a-timestamp');
      expect(output.validation).toMatchObject({ payloads_valid: true, reducer_sequence_valid: true });
      throw new Error('RED_PROGRAMMATIC_ACCESSOR_TOCTOU_PROVEN');
    } catch (error) {
      if (error.message === 'RED_PROGRAMMATIC_ACCESSOR_TOCTOU_PROVEN') throw error;
      caught = error;
    }
    expect(caught?.code).toBe('UNSAFE_PROPERTY_DESCRIPTOR');
    expect(reads).toBe(0);
  });

  test.each([
    ['generated_at', (doc) => [doc, 'generated_at']],
    ['hash evidence', (doc) => [doc.board, 'snapshot_hash']],
    ['candidate evidence', (doc) => [doc.candidates[0], 'card_snapshot_hash']],
    ['candidate array entry', (doc) => [doc.candidates, '0']],
    ['side-effect declaration', (doc) => [doc.side_effects, 'database_write']],
  ])('rejects nested accessor property: %s', (_name, locate) => {
    for (const api of ['validate', 'compile']) {
      const doc = preview();
      const [target, key] = locate(doc);
      const stable = target[key];
      let reads = 0;
      Object.defineProperty(target, key, {
        enumerable: true,
        get() { reads += 1; return stable; },
      });
      const invoke = api === 'validate'
        ? () => validateShadowPreview(doc)
        : () => compileShadowEventProposals(request('synthetic-eligible', doc));
      expect(errorCode(invoke)).toBe('UNSAFE_PROPERTY_DESCRIPTOR');
      expect(reads).toBe(0);
    }
  });

  test.each([
    ['generated_at', (doc) => [doc, null, 'generated_at', 'not-a-timestamp']],
    ['hash evidence', (doc) => [doc, 'board', 'snapshot_hash', 'sha256:invalid']],
    ['candidate evidence', (doc) => [doc.candidates, '0', 'card_snapshot_hash', 'sha256:invalid']],
    ['candidate array entry', (doc) => [doc, 'candidates', '0', null]],
    ['side-effect declaration', (doc) => [doc, 'side_effects', 'database_write', true]],
  ])('proxy-backed %s is snapshotted once without validation/compile mismatch', (_name, locate) => {
    const doc = preview();
    const [parent, parentKey, key, laterValue] = locate(doc);
    const target = parentKey === null ? parent : parent[parentKey];
    let descriptorReads = 0;
    const proxy = new Proxy(target, {
      getOwnPropertyDescriptor(inner, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(inner, property);
        if (property !== key || !descriptor) return descriptor;
        descriptorReads += 1;
        return { ...descriptor, value: descriptorReads === 1 ? descriptor.value : laterValue };
      },
    });
    const proposalRequest = parentKey === null
      ? request('synthetic-eligible', proxy)
      : (parent[parentKey] = proxy, request('synthetic-eligible', doc));
    const output = compileShadowEventProposals(proposalRequest);
    expect(output.validation).toMatchObject({ payloads_valid: true, reducer_sequence_valid: true });
    expect(descriptorReads).toBe(1);
  });

  test('caller-owned object is never read through ordinary property access after descriptor snapshot', () => {
    let propertyReads = 0;
    const proxy = new Proxy(request(), {
      get() { propertyReads += 1; throw new Error('CALLER_PROPERTY_REREAD'); },
    });
    expect(compileShadowEventProposals(proxy)).toMatchObject({
      schema: PROPOSAL_SCHEMA,
      validation: { payloads_valid: true, reducer_sequence_valid: true, authority_ceiling: 'A0' },
    });
    expect(propertyReads).toBe(0);
  });

  test('proxy descriptor failures are rejected with a stable bounded code', () => {
    const proxy = new Proxy(request(), {
      ownKeys() { throw new Error('hostile proxy detail must not escape'); },
    });
    expect(errorCode(() => compileShadowEventProposals(proxy))).toBe('UNSAFE_PROGRAMMATIC_OBJECT');
  });

  test.each([
    ['cycle', (doc) => { doc.board.loop = doc; }, 'CYCLIC_PROGRAMMATIC_VALUE'],
    ['symbol key', (doc) => { doc.board[Symbol('hidden')] = true; }, 'SYMBOL_PROPERTY_FORBIDDEN'],
    ['non-enumerable key', (doc) => { Object.defineProperty(doc.board, 'hidden', { value: true }); }, 'UNSAFE_PROPERTY_DESCRIPTOR'],
    ['sparse array', (doc) => { doc.candidates.length += 1; }, 'UNSUPPORTED_ARRAY_SHAPE'],
    ['unsupported prototype', (doc) => { Object.setPrototypeOf(doc.board, new Date(0)); }, 'UNSUPPORTED_PROGRAMMATIC_PROTOTYPE'],
  ])('rejects unsafe programmatic shape: %s', (_name, mutate, code) => {
    const doc = preview();
    mutate(doc);
    expect(errorCode(() => compileShadowEventProposals(request('synthetic-eligible', doc)))).toBe(code);
  });

  test('changed policy domain changes a domain-separated key', () => {
    const output = compileShadowEventProposals(request());
    const { idempotencyKey: _existingKey, ...semanticPayload } = output.event_proposals[1].input;
    const material = {
      kind: 'CARD_SCORED',
      proposalSchema: PROPOSAL_SCHEMA,
      taskId: semanticPayload.taskId,
      semanticPayload,
      policyDomain: HASH_A,
    };
    const first = buildProposalIdempotencyKey(material);
    const second = buildProposalIdempotencyKey({ ...material, policyDomain: HASH_B });
    expect(second).not.toBe(first);
  });

  test('payloads are accepted by KAN-AUT-3 validators', () => {
    const output = compileShadowEventProposals(request());
    expect(() => validateEventPayload('CARD_ELIGIBILITY_EVALUATED', 1, output.event_proposals[0].input.payload)).not.toThrow();
    expect(() => validateEventPayload('CARD_SCORED', 1, output.event_proposals[1].input.payload)).not.toThrow();
  });

  test('timestamps are deterministic, equal, strict UTC, and accepted as nondecreasing', () => {
    const output = compileShadowEventProposals(request());
    expect([output.task_proposal.input.createdAt, ...output.event_proposals.map((item) => item.input.occurredAt)])
      .toEqual(['2026-07-11T00:00:00Z', '2026-07-11T00:00:00Z', '2026-07-11T00:00:00Z']);
  });

  test('does not depend on current clock or randomness', () => {
    const source = readFileSync(new URL('./kanban-autonomy-proposals.mjs', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Date\.now|new Date|Math\.random|randomUUID|randomBytes/);
  });
});

describe('CLI and import-safe wrapper', () => {
  test('CLI argument parser accepts only the exact command', () => {
    expect(parseProposalCliArgs(['compile', '--json', '--proposal-only'])).toMatchObject({ command: 'compile' });
    expect(() => parseProposalCliArgs(['compile', '--proposal-only', '--json'])).toThrow(/INVALID_CLI_ARGUMENTS/);
  });

  test('successful real-path CLI emits exactly one canonical JSON document', () => {
    const result = runWrapper(canonicalJson(request()));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ schema: PROPOSAL_SCHEMA, mode: 'proposal_only' });
  });

  test('unknown flags fail closed with no success JSON', () => {
    const result = runWrapper(canonicalJson(request()), wrapper, ['compile', '--json', '--proposal-only', '--live']);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({ error: { code: 'INVALID_CLI_ARGUMENTS' } });
  });

  test('duplicate JSON keys fail closed', () => {
    const result = runWrapper('{"schema":"a","schema":"b"}');
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error.code).toBe('DUPLICATE_JSON_KEY');
  });

  test.each([
    ['maximum input bytes', () => {
      const left = 'a'.repeat(REQUEST_JSON_LIMITS.stringBytes);
      const right = 'b'.repeat(REQUEST_JSON_LIMITS.bytes - 7 - left.length);
      return { allowed: `["${left}","${right}"]`, rejected: `["${left}","${right}x"]` };
    }, 'JSON_INPUT_TOO_LARGE'],
    ['maximum nesting depth', () => ({
      allowed: `${'['.repeat(REQUEST_JSON_LIMITS.depth)}null${']'.repeat(REQUEST_JSON_LIMITS.depth)}`,
      rejected: `${'['.repeat(REQUEST_JSON_LIMITS.depth + 1)}null${']'.repeat(REQUEST_JSON_LIMITS.depth + 1)}`,
    }), 'PAYLOAD_DEPTH_EXCEEDED'],
    ['maximum node count', () => {
      const prefix = Array.from({ length: REQUEST_JSON_LIMITS.nodes - 2 }, () => 'null').join(',');
      return { allowed: `[${prefix},[]]`, rejected: `[${prefix},[null]]` };
    }, 'PAYLOAD_NODE_LIMIT_EXCEEDED'],
    ['maximum object-key count', () => {
      const build = (count) => `{${Array.from({ length: count }, (_, index) => `"k${index}":null`).join(',')}}`;
      return { allowed: build(REQUEST_JSON_LIMITS.objectKeys), rejected: build(REQUEST_JSON_LIMITS.objectKeys + 1) };
    }, 'PAYLOAD_OBJECT_KEY_LIMIT_EXCEEDED'],
    ['maximum array length', () => {
      const build = (count) => `[${Array.from({ length: count }, () => 'null').join(',')}]`;
      return { allowed: build(REQUEST_JSON_LIMITS.arrayLength), rejected: build(REQUEST_JSON_LIMITS.arrayLength + 1) };
    }, 'PAYLOAD_ARRAY_LIMIT_EXCEEDED'],
    ['maximum key byte length', () => ({
      allowed: `{"${'k'.repeat(REQUEST_JSON_LIMITS.keyBytes)}":null}`,
      rejected: `{"${'k'.repeat(REQUEST_JSON_LIMITS.keyBytes + 1)}":null}`,
    }), 'PAYLOAD_KEY_TOO_LONG'],
    ['maximum string byte length', () => ({
      allowed: `"${'s'.repeat(REQUEST_JSON_LIMITS.stringBytes)}"`,
      rejected: `"${'s'.repeat(REQUEST_JSON_LIMITS.stringBytes + 1)}"`,
    }), 'PAYLOAD_STRING_TOO_LONG'],
  ])('%s permits the exact boundary and rejects the first value beyond it', (_name, build, code) => {
    const { allowed, rejected } = build();
    expect(() => parseProposalRequestJson(allowed)).not.toThrow();
    expect(errorCode(() => parseProposalRequestJson(rejected))).toBe(code);
    expect(errorCode(() => parseProposalRequestJson(rejected))).toBe(code);
  });

  test.each([
    ['input bytes', (value) => { value.extra = ['x'.repeat(REQUEST_JSON_LIMITS.stringBytes), 'y'.repeat(REQUEST_JSON_LIMITS.stringBytes)]; }, 'JSON_INPUT_TOO_LARGE'],
    ['nesting depth', (value) => {
      let nested = null;
      for (let index = 0; index <= REQUEST_JSON_LIMITS.depth; index += 1) nested = [nested];
      value.extra = nested;
    }, 'PAYLOAD_DEPTH_EXCEEDED'],
    ['node count', (value) => { value.extra = Array.from({ length: REQUEST_JSON_LIMITS.arrayLength }, () => null); }, 'PAYLOAD_NODE_LIMIT_EXCEEDED'],
    ['object-key count', (value) => { value.extra = Object.fromEntries(Array.from({ length: REQUEST_JSON_LIMITS.objectKeys + 1 }, (_, index) => [`k${index}`, null])); }, 'PAYLOAD_OBJECT_KEY_LIMIT_EXCEEDED'],
    ['array length', (value) => { value.extra = Array.from({ length: REQUEST_JSON_LIMITS.arrayLength + 1 }, () => null); }, 'PAYLOAD_ARRAY_LIMIT_EXCEEDED'],
    ['key byte length', (value) => { value.extra = { ['k'.repeat(REQUEST_JSON_LIMITS.keyBytes + 1)]: null }; }, 'PAYLOAD_KEY_TOO_LONG'],
    ['string byte length', (value) => { value.extra = 's'.repeat(REQUEST_JSON_LIMITS.stringBytes + 1); }, 'PAYLOAD_STRING_TOO_LONG'],
  ])('programmatic input enforces the same %s bound before schema compilation', (_name, mutate, code) => {
    const value = request();
    mutate(value);
    expect(errorCode(() => compileShadowEventProposals(value))).toBe(code);
  });

  test('input byte and nesting bounds fail closed', () => {
    const large = `{"x":"${'a'.repeat(2_100_000)}"}`;
    expect(JSON.parse(runWrapper(large).stderr).error.code).toBe('JSON_INPUT_TOO_LARGE');
    const deep = `${'{"x":'.repeat(35)}null${'}'.repeat(35)}`;
    expect(JSON.parse(runWrapper(deep).stderr).error.code).toBe('PAYLOAD_DEPTH_EXCEEDED');
  });

  test('malformed UTF-8 fails closed before JSON parsing', () => {
    const result = runWrapper(Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d]));
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error.code).toBe('INVALID_UTF8');
  });

  test('package-bin style symlink execution works', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'kan4a-bin-'));
    try {
      const binDirectory = path.join(root, 'node_modules', '.bin');
      mkdirSync(binDirectory, { recursive: true });
      const link = path.join(binDirectory, 'kanban-autonomy-proposals');
      symlinkSync(wrapper, link);
      const result = runWrapper(canonicalJson(request()), link);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout).schema).toBe(PROPOSAL_SCHEMA);
    } finally { rmSync(root, { recursive: true, force: true }); }
    expect(existsSync(root)).toBe(false);
  });

  test('import is inert with hostile write-shaped argv and preserves process state', () => {
    const script = `
      const before = JSON.stringify({ argv: process.argv, exitCode: process.exitCode });
      await import(${JSON.stringify(pathToFileURL(wrapper).href)});
      const after = JSON.stringify({ argv: process.argv, exitCode: process.exitCode });
      process.stdout.write(JSON.stringify({ before, after }));
    `;
    const result = spawnSync(node, ['--input-type=module', '--eval', script, '/tmp/not-the-wrapper', 'compile', '--live', '--store', '/tmp/live.db'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const parsed = JSON.parse(result.stdout);
    expect(parsed.after).toBe(parsed.before);
  });

  test('missing argv[1] import is inert', () => {
    const script = `process.argv.splice(1); await import(${JSON.stringify(pathToFileURL(wrapper).href)}); process.stdout.write(String(process.exitCode ?? 'unset'));`;
    const result = spawnSync(node, ['--input-type=module', '--eval', script], { encoding: 'utf8' });
    expect(result).toMatchObject({ status: 0, stdout: 'unset', stderr: '' });
  });

  test('ENOENT direct-entry lookalike import is inert', () => {
    const argvEntry = path.join(os.tmpdir(), 'kan4a-definitely-missing', 'kanban-autonomy-proposals');
    const script = `process.argv[1] = ${JSON.stringify(argvEntry)}; await import(${JSON.stringify(pathToFileURL(wrapper).href)}); process.stdout.write(String(process.exitCode ?? 'unset'));`;
    const result = spawnSync(node, ['--input-type=module', '--eval', script], { encoding: 'utf8' });
    expect(result).toMatchObject({ status: 0, stdout: 'unset', stderr: '' });
  });

  test('ENOTDIR direct-entry lookalike import is inert', () => {
    const argvEntry = path.join(wrapper, 'kanban-autonomy-proposals');
    const script = `process.argv[1] = ${JSON.stringify(argvEntry)}; await import(${JSON.stringify(pathToFileURL(wrapper).href)}); process.stdout.write(String(process.exitCode ?? 'unset'));`;
    const result = spawnSync(node, ['--input-type=module', '--eval', script], { encoding: 'utf8' });
    expect(result).toMatchObject({ status: 0, stdout: 'unset', stderr: '' });
  });

  test('unexpected direct-entry realpath errors are surfaced', () => {
    const script = `process.argv[1] = '\\0/kanban-autonomy-proposals'; await import(${JSON.stringify(pathToFileURL(wrapper).href)});`;
    const result = spawnSync(node, ['--input-type=module', '--eval', script], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/ERR_INVALID_ARG_VALUE/);
  });
});

describe('forbidden runtime surfaces and synthetic end-to-end proof', () => {
  test('runtime adapter has no store, filesystem-write, network, model, subprocess, queue, service, scheduler, executor, or env activation surface', () => {
    const source = readFileSync(new URL('./kanban-autonomy-proposals.mjs', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from\s+['"](?:node:fs|node:sqlite|node:child_process|node:https?|\.\/kanban-autonomy-store)/);
    expect(source).not.toMatch(/\b(?:fetch|writeFile|appendFile|spawn|exec|execFile|fork|systemctl)\s*\(/);
    expect(source).not.toMatch(/process\.env|runScheduler|runExecutor|invokeModel|openQueue/);
  });

  test('fixture is explicitly synthetic and contains required named cases', () => {
    expect(fixture.synthetic_only).toBe(true);
    expect(fixture.cases.map((item) => item.name)).toEqual(expect.arrayContaining([
      'valid_eligible', 'valid_explicit_ineligible', 'malformed_request_schema', 'unknown_policy',
      'missing_candidate_id', 'duplicate_candidate_id', 'winner_not_selected', 'true_side_effect_rejected',
    ]));
    expect(Object.values(fixture.safety).every((value) => value === false)).toBe(true);
  });

  test('real legacy-profile KAN-AUT-2 output validates and compiles proposal-only', () => {
    const root = mkdtempSync('/tmp/hermes-kan-autonomy-kan4a-legacy-');
    chmodSync(root, 0o700);
    const scannerDb = path.join(root, 'legacy-scanner-fixture.db');
    try {
      createLegacyScannerDatabase(scannerDb);
      const shadowPreview = scanDatabase({
        board: 'fixture-board', db: scannerDb, triageStatus: 'triage', top: 50,
        fixture: true, asOf: shadowFixture.as_of,
      });
      expect(shadowPreview.board).toMatchObject({
        schema_profile: 'kanban_tasks_legacy_shadow_v1', schema_degraded: true,
      });
      const validated = validateShadowPreview(shadowPreview);
      const output = compileShadowEventProposals(request('legacy-synthetic-1', shadowPreview));
      expect(validated.candidates[0].factor_provenance.expected_value.source_type).toBe('policy_default');
      expect(output).toMatchObject({ schema: PROPOSAL_SCHEMA, mode: 'proposal_only' });
      expect(Object.values(output.side_effects).every((value) => value === false)).toBe(true);

      const forged = clone(shadowPreview);
      forged.candidates[0].factor_provenance.expected_value = {
        raw_value: 50,
        effective_value: 50,
        source_type: 'explicit_validated_card_value',
        source_reference_hash: HASH_A,
        confidence: 100,
        defaulted: false,
        explanation_code: 'FACTOR_EXPECTED_VALUE_FROM_CARD',
      };
      expect(errorCode(() => validateShadowPreview(forged))).toBe('INVALID_FACTOR_PROVENANCE');
    } finally { rmSync(root, { recursive: true, force: true }); }
    expect(existsSync(root)).toBe(false);
  });

  test('real KAN-AUT-2 fixture scanner to proposal adapter to temporary KAN-AUT-3 store replays to triaged and projects purely', () => {
    const root = mkdtempSync('/tmp/hermes-kan-autonomy-kan4a-');
    chmodSync(root, 0o700);
    const scannerDb = path.join(root, 'scanner-fixture.db');
    const storePath = path.join(root, STORE_DATABASE_NAME);
    try {
      createScannerDatabase(scannerDb);
      const shadowPreview = scanDatabase({
        board: 'fixture-board', db: scannerDb, triageStatus: 'triage', top: 50,
        fixture: true, asOf: shadowFixture.as_of,
      });
      const selectedCardId = shadowPreview.candidates[0].card_id;
      const proposalRequest = request(selectedCardId, shadowPreview);
      const first = compileShadowEventProposals(proposalRequest);
      const second = compileShadowEventProposals(clone(proposalRequest));
      expect(canonicalJson(second)).toBe(canonicalJson(first));
      const cli = runWrapper(shadowCanonicalJson(proposalRequest));
      expect(cli.status).toBe(0);
      expect(cli.stderr).toBe('');
      expect(cli.stdout.trim()).toBe(canonicalJson(first));
      initStore({ storePath });
      const created = createTask({ storePath, ...first.task_proposal.input });
      expect(created).toMatchObject({ created: true, reconstructed_state: 'created' });
      for (const proposal of first.event_proposals) {
        expect(appendEvent({ storePath, ...proposal.input })).toMatchObject({ appended: true });
      }
      expect(createTask({ storePath, ...first.task_proposal.input })).toMatchObject({ created: false });
      for (const proposal of first.event_proposals) {
        expect(appendEvent({ storePath, ...proposal.input })).toMatchObject({ appended: false });
      }
      expect(verifyTaskChain({ storePath, taskId: created.task_id })).toMatchObject({
        valid: true, checked_events: 3, reconstructed_state: 'triaged', authority_ceiling: 'A0',
      });
      const replay = replayTaskState({ storePath, taskId: created.task_id });
      expect(replay).toMatchObject({ valid: true, reconstructed_state: 'triaged' });
      const projection = projectTaskStateToKanban({ taskState: replay.reconstructed_state, currentCardStatus: 'triage' });
      expect(projection).toMatchObject({ projection_performed: false, kanban_write: false, desired_status: 'triage' });
    } finally { rmSync(root, { recursive: true, force: true }); }
    expect(existsSync(root)).toBe(false);
  }, 15000);
});
