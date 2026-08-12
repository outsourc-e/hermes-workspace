import { describe, expect, test } from 'vitest';
import {
  ELIGIBILITY_POLICY_VERSION, PORTFOLIO_POLICY_VERSION, SCORING_POLICY_VERSION,
  buildCardEvaluation, canonicalJson, compareCandidates, evaluateEligibility, normalizeCard,
  parseStrictUtc, redactTitle, scoreCard, sha256,
} from './kanban-triage-policy.mjs';

const asOf = '2026-07-11T00:00:00Z';
function card(overrides = {}) {
  return { id: 'card-1', title: 'Useful idea', body: 'Enough detail for deterministic research.', status: 'triage', priority: 50, created_by: 'fixture', tenant: 'fixture', metadata: { source_identity: 'fixture:card-1' }, created_at: '2026-06-01T00:00:00Z', ...overrides };
}
function evaluate(overrides = {}, input = {}) {
  return buildCardEvaluation({ card: card(overrides), configuredTriageStatus: 'triage', evaluationTimestamp: asOf, testMode: false, dependencies: { hardBlocked: false }, activeTask: false, activeLease: false, authorityAvailable: true, retryState: {}, ...input });
}

describe('strict normalization and eligibility', () => {
  test('exports exact policy identifiers', () => {
    expect([ELIGIBILITY_POLICY_VERSION, SCORING_POLICY_VERSION, PORTFOLIO_POLICY_VERSION]).toEqual(['kanban_triage_eligibility.v1', 'kanban_priority_score.v1', 'kanban_portfolio_advisory.v1']);
  });
  test('requires exact configured triage status and does not treat manual status as authority', () => {
    expect(evaluate({ status: 'Triage' }).eligibility.reason_codes).toContain('NOT_IN_TRIAGE');
    expect(evaluate().eligibility.evidence_codes).toContain('MANUAL_STATUS_IS_NOT_APPROVAL_AUTHORITY');
  });
  test('missing triage configuration fails closed', () => expect(evaluate({}, { configuredTriageStatus: '' }).eligibility.reason_codes).toContain('NO_TRIAGE_COLUMN'));
  test.each([
    [{ metadata: { archived: true, source_identity: 'x' } }, 'ARCHIVED'],
    [{ metadata: { deleted: true, source_identity: 'x' } }, 'DELETED'],
    [{ metadata: { terminal_outcome: 'ALREADY_IMPLEMENTED', source_identity: 'x' } }, 'TERMINAL_OUTCOME'],
    [{ title: '', body: '' }, 'EMPTY_IDEA'],
    [{ current_run_id: 'run' }, 'ACTIVE_TASK_EXISTS'],
    [{ metadata: { paused: true, source_identity: 'x' } }, 'PAUSED'],
    [{ metadata: { awaiting_user: true, source_identity: 'x' } }, 'AWAITING_USER'],
    [{ metadata: { duplicate_candidate: true, source_identity: 'x' } }, 'DUPLICATE_CANDIDATE'],
  ])('returns safety reason %s', (change, reason) => expect(evaluate(change).eligibility.reason_codes).toContain(reason));
  test('test markers are bounded and test mode is explicit', () => {
    expect(evaluate({ metadata: { simulation: true, source_identity: 'x' } }).eligibility.reason_codes).toContain('TEST_CARD');
    expect(evaluate({ metadata: { simulation: true, source_identity: 'x' } }, { testMode: true }).eligibility.reason_codes).not.toContain('TEST_CARD');
  });
  test('active leases, hard dependencies, retries, cooldown and unavailable authority fail closed', () => {
    const result = evaluate({ claim_lock: 'lock', claim_expires: '2026-07-12T00:00:00Z', consecutive_failures: 3, max_retries: 3, next_run_after: '2026-07-12T00:00:00Z' }, { activeLease: true, dependencies: { hardBlocked: true }, authorityAvailable: false });
    expect(result.eligibility.reason_codes).toEqual(expect.arrayContaining(['ACTIVE_LEASE_EXISTS', 'HARD_DEPENDENCY_BLOCKED', 'RETRY_LIMIT_REACHED', 'COOLDOWN_ACTIVE', 'AUTHORITY_UNAVAILABLE']));
  });
  test('expired claim is evidence only and never reclaim authority', () => {
    const result = evaluate({ metadata: { expired_claim: true, source_identity: 'x' }, claim_lock: 'old', claim_expires: '2026-01-01T00:00:00Z' });
    expect(result.eligibility.reason_codes).not.toContain('ACTIVE_LEASE_EXISTS');
    expect(result.eligibility.evidence_codes).toContain('EXPIRED_CLAIM_REPORTED_NO_RECLAIM_AUTHORITY');
  });
  test('malformed metadata, unsupported cards, missing identity and policy/snapshot mismatch fail closed', () => {
    expect(evaluate({ metadata: '[1,2]' }).eligibility.reason_codes).toEqual(expect.arrayContaining(['AMBIGUOUS_METADATA', 'MISSING_SOURCE_IDENTITY']));
    expect(evaluate({ metadata: { unsupported: true, source_identity: 'x' } }).eligibility.reason_codes).toContain('UNSUPPORTED_CARD');
    expect(evaluate({ metadata: { source_identity: 'x', policy_version: 'old' } }).eligibility.reason_codes).toContain('POLICY_VERSION_UNSUPPORTED');
    expect(evaluate({ metadata: { source_identity: 'x', board_snapshot_hash: 'a', expected_board_snapshot_hash: 'b' } }).eligibility.reason_codes).toContain('BOARD_SNAPSHOT_CHANGED');
  });
  test('all applicable reasons are returned simultaneously', () => {
    const reasons = evaluate({ title: '', body: '', status: 'todo', priority: 'urgent', created_at: 'bad', metadata: { paused: true, awaiting_user: true } }, { configuredTriageStatus: '' }).eligibility.reason_codes;
    expect(reasons).toEqual(expect.arrayContaining(['NO_TRIAGE_COLUMN', 'EMPTY_IDEA', 'PAUSED', 'AWAITING_USER', 'MALFORMED_PRIORITY', 'INVALID_TIMESTAMP', 'MISSING_SOURCE_IDENTITY']));
  });
  test('priority accepts bounded integer and P legacy form; malformed defaults safely', () => {
    expect(normalizeCard(card({ priority: 8 })).priority).toBe(8);
    expect(normalizeCard(card({ priority: 'P4' })).priority).toBe(4);
    const malformed = normalizeCard(card({ priority: 'urgent' }));
    expect(malformed.priority).toBe(50); expect(malformed.malformed_priority).toBe(true);
  });
  test('timestamps accept bounded integer epochs and 1-9 digit UTC fractions while rejecting ambiguous forms', () => {
    expect(parseStrictUtc(0)).toMatchObject({ value:'1970-01-01T00:00:00Z', sourceType:'integer_epoch_seconds' });
    expect(parseStrictUtc(253402300799)?.sourceType).toBe('integer_epoch_seconds');
    expect(parseStrictUtc(253402300800)).toBeNull();
    expect(parseStrictUtc(-1)).toBeNull(); expect(parseStrictUtc(1.5)).toBeNull(); expect(parseStrictUtc('123')).toBeNull();
    expect(parseStrictUtc('2026-07-11T00:00:00Z')?.epochMs).toBeTypeOf('number');
    expect(parseStrictUtc('2026-07-11T00:00:00.123456Z')?.fractionNanoseconds).toBe(123456000);
    expect(parseStrictUtc('2026-07-11T00:00:00.123456789Z')?.fractionNanoseconds).toBe(123456789);
    expect(parseStrictUtc('2026-02-30T00:00:00Z')).toBeNull();
    expect(parseStrictUtc('2026-07-11 00:00:00Z')).toBeNull();
    expect(parseStrictUtc('2026-07-11T00:00:00+10:00')).toBeNull();
  });
  test('invalid created_at blocks eligibility, contributes zero age and preserves stable invalid ordering', () => {
    const invalid = evaluate({ created_at:'2026-07-11 00:00:00' });
    expect(invalid.eligibility.reason_codes).toContain('INVALID_TIMESTAMP'); expect(invalid.scoring.aging_bonus).toBe(0); expect(invalid.eligibility.eligible).toBe(false);
    const base = invalid.scoring;
    const make = (id) => ({ card_id:id, ...base, ineligibility_reason_codes:['INVALID_TIMESTAMP'], factor_inputs:base.factor_inputs, tie_break_values:{ created_at_ms:null, created_at_fraction_ns:null } });
    expect([make('b'), make('a')].sort(compareCandidates).map((item) => item.card_id)).toEqual(['a','b']);
  });
  test('redaction removes sensitive title material and caps length', () => {
    const value = redactTitle('person@example.com https://private.test token=abc Telegram chat_id 123456789 '.repeat(3));
    expect(value).not.toMatch(/example\.com|private\.test|abc|123456789/); expect(value.length).toBeLessThanOrEqual(80);
  });
});

describe('deterministic scoring, provenance, outcomes and portfolio', () => {
  test('missing factors use every documented default with provenance', () => {
    const result = evaluate();
    expect(result.scoring.factor_inputs).toMatchObject({ expected_value: 50, urgency: 30, confidence: 25, effort: 60, risk: 60, approval_free_work: 25 });
    expect(Object.keys(result.scoring.factor_inputs)).toHaveLength(12);
    expect(Object.values(result.scoring.factor_provenance).every((entry) => entry.defaulted)).toBe(true);
    expect(Object.keys(result.scoring.weighted_contributions)).toHaveLength(12);
  });
  test('validated explicit values outrank bounded fixture proposal, invalid proposal defaults', () => {
    const normalized = normalizeCard(card({ metadata: { source_identity: 'x', factors: { urgency: 90 }, factor_proposal: { urgency: 10, expected_value: 70, risk: 101 } } }));
    const result = scoreCard({ normalized: { ...normalized, card_snapshot_hash: sha256('x') }, evaluationTimestamp: asOf });
    expect(result.factor_inputs.urgency).toBe(90);
    expect(result.factor_provenance.expected_value.source_type).toBe('validated_model_proposal_fixture_value');
    expect(result.factor_inputs.risk).toBe(60);
  });
  test('score clamps lower and upper bounds', () => {
    const high = evaluate({ created_at: '2020-01-01T00:00:00Z', metadata: { source_identity: 'x', factors: Object.fromEntries(['expected_value','urgency','confidence','strategic_fit','dependency_readiness','autonomous_readiness','time_saved','revenue_impact','learning_reuse','approval_free_work'].map((key) => [key,100]).concat([['effort',0],['risk',0]])) } });
    const low = evaluate({ metadata: { source_identity: 'x', duplicate_candidate: true, awaiting_user: true, hard_dependency_blocked: true, factors: { effort: 100, risk: 100, expected_value: 0, urgency: 0, confidence: 0, strategic_fit: 0, dependency_readiness: 0, autonomous_readiness: 0, time_saved: 0, revenue_impact: 0, learning_reuse: 0, approval_free_work: 0 } } });
    expect(high.scoring.final_score).toBe(100); expect(low.scoring.final_score).toBe(0);
  });
  test('all policy penalties and aging increments/cap are deterministic', () => {
    const normalized = normalizeCard(card({ created_at: '2020-01-01T00:00:00Z', metadata: { source_identity: 'x', insufficient_specification: true } }));
    const scoring = scoreCard({ normalized, evaluationTimestamp: asOf, reasonCodes: ['HARD_DEPENDENCY_BLOCKED','AUTHORITY_UNAVAILABLE','AWAITING_USER','RETRY_LIMIT_REACHED','DUPLICATE_CANDIDATE'] });
    expect(scoring.penalties).toEqual({ hard_dependency: -4000, authority_unavailable: -3500, awaiting_user: -2500, retry_limit: -2000, duplicate_candidate: -3000, insufficient_specification: -1500 });
    expect(scoring.aging_bonus).toBe(8);
    expect(scoreCard({ normalized: normalizeCard(card({ created_at: '2026-06-27T00:00:00Z' })), evaluationTimestamp: asOf }).aging_bonus).toBe(1);
  });
  test('tie-breakers follow exact order ending with lexical card ID', () => {
    const base = evaluate().scoring;
    const make = (id, overrides = {}) => ({ card_id: id, ...base, factor_inputs: { ...base.factor_inputs, ...overrides }, tie_break_values: { created_at_ms: 1 } });
    expect([make('b'), make('a')].sort(compareCandidates)[0].card_id).toBe('a');
    expect([make('a',{risk:50}), make('b',{risk:10})].sort(compareCandidates)[0].card_id).toBe('b');
  });
  test('outcomes and portfolio remain advisory and cannot make ineligible winner', () => {
    const blocked = evaluate({ title: 'Revenue operations tool', metadata: { source_identity: 'x', duplicate_candidate: true, portfolio_category: 'high_value_execution' } });
    expect(blocked.proposed_outcome).toBe('MERGE_DUPLICATE');
    expect(blocked.portfolio.advisory.eligibility_unchanged).toBe(true);
    expect(blocked.eligibility.eligible).toBe(false);
  });
  test('same input and as-of are byte-equivalent; changed input changes hash', () => {
    const first = canonicalJson(evaluate());
    const second = canonicalJson(evaluate());
    expect(first).toBe(second);
    expect(evaluate().eligibility.snapshot_hash).not.toBe(evaluate({ title: 'Changed' }).eligibility.snapshot_hash);
  });
});
