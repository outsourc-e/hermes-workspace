import { createHash } from 'node:crypto';

export const ELIGIBILITY_POLICY_VERSION = 'kanban_triage_eligibility.v1';
export const SCORING_POLICY_VERSION = 'kanban_priority_score.v1';
export const PORTFOLIO_POLICY_VERSION = 'kanban_portfolio_advisory.v1';
export const MAX_METADATA_BYTES = 16_384;

export const REASON_CODES = Object.freeze([
  'NO_TRIAGE_COLUMN', 'NOT_IN_TRIAGE', 'ARCHIVED', 'DELETED', 'TEST_CARD', 'EMPTY_IDEA',
  'ACTIVE_TASK_EXISTS', 'ACTIVE_LEASE_EXISTS', 'PAUSED', 'AWAITING_USER',
  'HARD_DEPENDENCY_BLOCKED', 'RETRY_LIMIT_REACHED', 'COOLDOWN_ACTIVE',
  'AUTHORITY_UNAVAILABLE', 'UNSUPPORTED_CARD', 'DUPLICATE_CANDIDATE', 'TERMINAL_OUTCOME',
  'MALFORMED_PRIORITY', 'INVALID_TIMESTAMP', 'MISSING_SOURCE_IDENTITY',
  'POLICY_VERSION_UNSUPPORTED', 'BOARD_SNAPSHOT_CHANGED', 'AMBIGUOUS_METADATA',
]);

const STRICT_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;
const MAX_EPOCH_SECONDS = 253_402_300_799;
const FACTOR_DEFAULTS = Object.freeze({
  expected_value: 50, urgency: 30, confidence: 25, effort: 60, risk: 60,
  strategic_fit: 40, dependency_readiness: 40, autonomous_readiness: 30,
  time_saved: 30, revenue_impact: 20, learning_reuse: 40, approval_free_work: 25,
});
const FACTOR_WEIGHTS = Object.freeze({
  expected_value: 14, urgency: 10, confidence: 8, effort: -12, risk: -14,
  strategic_fit: 10, dependency_readiness: 8, autonomous_readiness: 10,
  time_saved: 8, revenue_impact: 12, learning_reuse: 6, approval_free_work: 8,
});
const ALLOWED_METADATA = new Set([
  'test', 'is_test', 'simulation', 'synthetic', 'dry_run', 'paused', 'awaiting_user',
  'duplicate_candidate', 'terminal_outcome', 'deleted', 'archived', 'unsupported',
  'hard_dependency_blocked', 'insufficient_specification', 'factors', 'factor_proposal',
  'portfolio_category', 'source_identity', 'policy_version', 'board_snapshot_hash',
  'expected_board_snapshot_hash', 'expired_claim',
]);
const TEST_MARKERS = ['test', 'is_test', 'simulation', 'synthetic', 'dry_run'];
const CATEGORIES = new Set(['high_value_execution', 'research_planning', 'maintenance_reliability', 'experimental_opportunity']);
const OUTCOMES = new Set([
  'ADVANCE_TO_RESEARCH', 'ADVANCE_TO_PLANNING', 'AWAITING_APPROVAL', 'NEEDS_INFORMATION',
  'BLOCKED_DEPENDENCY', 'MERGE_DUPLICATE', 'DEFER', 'REJECT_WITH_EVIDENCE',
  'EXISTING_TOOL_RECOMMENDED', 'ALREADY_IMPLEMENTED', 'SPLIT_INTO_SUBTASKS',
]);

export function sha256(value) {
  return `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function epochMilliseconds(year, month, day, hour, minute, second, milliseconds) {
  // Date.UTC treats years 0 through 99 as 1900 through 1999. setUTCFullYear does
  // not, so four-digit RFC3339 years retain their literal meaning.
  const date = new Date(0);
  date.setUTCHours(hour, minute, second, milliseconds);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

export function parseStrictUtc(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_EPOCH_SECONDS) return null;
    const epochMs = value * 1000;
    const canonical = new Date(epochMs).toISOString().replace('.000Z', 'Z');
    return { value: canonical, epochMs, fractionNanoseconds: 0, sourceType: 'integer_epoch_seconds' };
  }
  if (typeof value !== 'string') return null;
  const match = value.match(STRICT_UTC);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss, fraction = ''] = match;
  const values = [y, m, d, hh, mm, ss].map(Number);
  if (values[1] < 1 || values[1] > 12 || values[2] < 1 || values[2] > daysInMonth(values[0], values[1]) || values[3] > 23 || values[4] > 59 || values[5] > 59) return null;
  const fractionNanoseconds = fraction ? Number(fraction.padEnd(9, '0')) : 0;
  const milliseconds = Math.floor(fractionNanoseconds / 1_000_000);
  const epochMs = epochMilliseconds(values[0], values[1], values[2], values[3], values[4], values[5], milliseconds);
  if (!Number.isFinite(epochMs)) return null;
  return { value, epochMs, fractionNanoseconds, sourceType: 'rfc3339_utc_text' };
}

function safeText(value, maximum = 10_000) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximum) : '';
}

export function redactTitle(value) {
  return safeText(value, 500)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\bhttps?:\/\/\S+/gi, '[REDACTED_URL]')
    .replace(/\b(?:token|password|secret|api[_-]?key|bearer)\s*[:=]\s*\S+/gi, '[REDACTED_CREDENTIAL]')
    .replace(/\b(?:chat[_ -]?id|telegram(?:[_ -]?id)?)\s*[:=]?\s*-?\d{5,}\b/gi, '[REDACTED_TELEGRAM]')
    .slice(0, 80);
}

function normalizeMetadata(raw, { available = true } = {}) {
  if (!available) return { safe: {}, ambiguous: false, malformed: false, available: false, verified: false, metadata_hash: sha256('UNAVAILABLE:metadata') };
  const result = { safe: {}, ambiguous: false, malformed: false, available: true, verified: true, metadata_hash: sha256(raw ?? '') };
  if (raw === null || raw === undefined || raw === '') return result;
  const text = typeof raw === 'string' ? raw : canonicalJson(raw);
  if (Buffer.byteLength(text, 'utf8') > MAX_METADATA_BYTES) return { ...result, malformed: true, ambiguous: true };
  let object;
  try { object = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { ...result, malformed: true, ambiguous: true }; }
  if (!object || typeof object !== 'object' || Array.isArray(object)) return { ...result, malformed: true, ambiguous: true };
  for (const [key, value] of Object.entries(object)) {
    if (!ALLOWED_METADATA.has(key)) continue;
    if (TEST_MARKERS.includes(key)) {
      if (typeof value !== 'boolean') result.ambiguous = true;
      else result.safe[key] = value;
    } else if (['paused', 'awaiting_user', 'duplicate_candidate', 'deleted', 'archived', 'unsupported', 'hard_dependency_blocked', 'insufficient_specification', 'expired_claim'].includes(key)) {
      if (typeof value !== 'boolean') result.ambiguous = true;
      else result.safe[key] = value;
    } else if (key === 'terminal_outcome') {
      if (value !== null && !OUTCOMES.has(value)) result.ambiguous = true;
      else result.safe[key] = value;
    } else if (key === 'portfolio_category') {
      if (!CATEGORIES.has(value)) result.ambiguous = true;
      else result.safe[key] = value;
    } else if (key === 'factors' || key === 'factor_proposal') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) result.ambiguous = true;
      else result.safe[key] = value;
    } else if (typeof value === 'string' && value.length <= 256) result.safe[key] = value;
    else result.ambiguous = true;
  }
  return result;
}

function normalizePriority(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 100) return { value, malformed: false, source: 'integer' };
  if (typeof value === 'string' && /^(?:P)?(?:[0-9]|[1-9][0-9]|100)$/i.test(value)) {
    return { value: Number(value.replace(/^P/i, '')), malformed: false, source: 'legacy_integer_string' };
  }
  if (value === null || value === undefined || value === '') return { value: 50, malformed: false, source: 'default' };
  return { value: 50, malformed: true, source: 'malformed_default' };
}

export function normalizeCard(card = {}, capabilities = {}) {
  const metadata = normalizeMetadata(card.metadata, { available: capabilities.metadata !== false });
  const title = safeText(card.title);
  const body = safeText(card.body, 100_000);
  const created = parseStrictUtc(card.created_at);
  const updated = card.updated_at == null ? null : parseStrictUtc(card.updated_at);
  const claimExpires = card.claim_expires == null ? null : parseStrictUtc(card.claim_expires);
  const nextRun = card.next_run_after == null ? null : parseStrictUtc(card.next_run_after);
  const lastFailure = card.last_failure_at == null ? null : parseStrictUtc(card.last_failure_at);
  const priority = normalizePriority(card.priority);
  const id = safeText(card.id, 256);
  const currentRunId = (typeof card.current_run_id === 'string' || Number.isSafeInteger(card.current_run_id))
    ? String(card.current_run_id).trim().slice(0, 256) || null : null;
  const sourceIdentity = safeText(metadata.safe.source_identity || card.idempotency_key || '', 512);
  const invalidTimestamp = [card.created_at != null && !created, card.updated_at != null && !updated, card.claim_expires != null && !claimExpires, card.next_run_after != null && !nextRun, card.last_failure_at != null && !lastFailure].some(Boolean);
  return Object.freeze({
    id, status: safeText(card.status, 128), title, title_hash: sha256(title), title_preview_redacted: redactTitle(title),
    body_length: body.length, body_hash: sha256(body), priority: priority.value, priority_source: priority.source,
    malformed_priority: priority.malformed, metadata_safe: Object.freeze(metadata.safe), metadata_hash: metadata.metadata_hash,
    metadata_available: metadata.available, metadata_verified: metadata.verified && !metadata.ambiguous && !metadata.malformed,
    ambiguous_metadata: metadata.ambiguous || metadata.malformed, created_at: created?.value ?? null,
    created_at_ms: created?.epochMs ?? null, created_at_fraction_ns: created?.fractionNanoseconds ?? null,
    updated_at: updated?.value ?? null, claim_lock: safeText(card.claim_lock, 256) || null,
    claim_expires: claimExpires?.value ?? null, claim_expires_ms: claimExpires?.epochMs ?? null,
    worker_pid: Number.isInteger(card.worker_pid) ? card.worker_pid : null,
    consecutive_failures: Number.isInteger(card.consecutive_failures) && card.consecutive_failures >= 0 ? card.consecutive_failures : 0,
    max_retries: Number.isInteger(card.max_retries) && card.max_retries >= 0 ? card.max_retries : null,
    current_run_id: currentRunId, next_run_after: nextRun?.value ?? null,
    next_run_after_ms: nextRun?.epochMs ?? null, invalid_timestamp: invalidTimestamp,
    source_identity_hash: sourceIdentity ? sha256(sourceIdentity) : null,
    archived: card.archived === true || metadata.safe.archived === true, deleted: card.deleted === true || metadata.safe.deleted === true,
  });
}

function uniqueSorted(values) { return [...new Set(values)].sort(); }

export function evaluateEligibility(input) {
  const normalized = input.normalized ?? normalizeCard(input.card);
  const reasons = [];
  const evidence = [];
  const asOf = parseStrictUtc(input.evaluationTimestamp);
  if (!input.configuredTriageStatus) reasons.push('NO_TRIAGE_COLUMN');
  if (input.configuredTriageStatus && normalized.status !== input.configuredTriageStatus) reasons.push('NOT_IN_TRIAGE');
  if (normalized.archived) reasons.push('ARCHIVED');
  if (normalized.deleted) reasons.push('DELETED');
  if (TEST_MARKERS.some((key) => normalized.metadata_safe[key] === true) && input.testMode !== true) reasons.push('TEST_CARD');
  if (!normalized.title && normalized.body_length === 0) reasons.push('EMPTY_IDEA');
  if (input.activeTask === true || normalized.current_run_id) reasons.push('ACTIVE_TASK_EXISTS');
  const leaseActive = input.activeLease === true || (normalized.claim_lock && normalized.claim_expires_ms !== null && asOf && normalized.claim_expires_ms > asOf.epochMs);
  if (leaseActive) reasons.push('ACTIVE_LEASE_EXISTS');
  if (normalized.metadata_safe.paused === true) reasons.push('PAUSED');
  if (normalized.metadata_safe.awaiting_user === true) reasons.push('AWAITING_USER');
  if (input.dependencies?.hardBlocked === true || normalized.metadata_safe.hard_dependency_blocked === true) reasons.push('HARD_DEPENDENCY_BLOCKED');
  const retryLimit = input.retryState?.limitReached === true || (normalized.max_retries !== null && normalized.consecutive_failures >= normalized.max_retries);
  if (retryLimit) reasons.push('RETRY_LIMIT_REACHED');
  if (input.retryState?.cooldownActive === true || (normalized.next_run_after_ms !== null && asOf && normalized.next_run_after_ms > asOf.epochMs)) reasons.push('COOLDOWN_ACTIVE');
  if (input.authorityAvailable !== true) reasons.push('AUTHORITY_UNAVAILABLE');
  if (normalized.metadata_safe.unsupported === true) reasons.push('UNSUPPORTED_CARD');
  if (normalized.metadata_safe.duplicate_candidate === true) reasons.push('DUPLICATE_CANDIDATE');
  if (normalized.metadata_safe.terminal_outcome) reasons.push('TERMINAL_OUTCOME');
  if (normalized.malformed_priority) reasons.push('MALFORMED_PRIORITY');
  if (normalized.invalid_timestamp || !asOf) reasons.push('INVALID_TIMESTAMP');
  if (!normalized.source_identity_hash) reasons.push('MISSING_SOURCE_IDENTITY');
  if (normalized.metadata_safe.policy_version && normalized.metadata_safe.policy_version !== ELIGIBILITY_POLICY_VERSION) reasons.push('POLICY_VERSION_UNSUPPORTED');
  if (normalized.metadata_safe.expected_board_snapshot_hash && normalized.metadata_safe.board_snapshot_hash !== normalized.metadata_safe.expected_board_snapshot_hash) reasons.push('BOARD_SNAPSHOT_CHANGED');
  if (normalized.ambiguous_metadata) reasons.push('AMBIGUOUS_METADATA');
  if (normalized.metadata_safe.expired_claim === true) evidence.push('EXPIRED_CLAIM_REPORTED_NO_RECLAIM_AUTHORITY');
  evidence.push('MANUAL_STATUS_IS_NOT_APPROVAL_AUTHORITY', 'SHADOW_ONLY_NO_CLAIM');
  const reasonCodes = uniqueSorted(reasons);
  const snapshotSafe = {
    id: normalized.id, status: normalized.status, title_hash: normalized.title_hash, body_hash: normalized.body_hash,
    metadata_hash: normalized.metadata_hash, priority: normalized.priority, created_at: normalized.created_at,
    claim_lock_present: normalized.claim_lock !== null, claim_expires: normalized.claim_expires,
    current_run_present: normalized.current_run_id !== null, consecutive_failures: normalized.consecutive_failures,
    max_retries: normalized.max_retries, next_run_after: normalized.next_run_after,
  };
  return Object.freeze({
    eligible: reasonCodes.length === 0, reason_codes: reasonCodes, evidence_codes: uniqueSorted(evidence),
    snapshot_hash: sha256(canonicalJson(snapshotSafe)), policy_version: ELIGIBILITY_POLICY_VERSION,
    normalized_safe_fields: snapshotSafe,
  });
}

function boundedFactor(value) { return Number.isInteger(value) && value >= 0 && value <= 100; }

export function scoreCard({ normalized, evaluationTimestamp, dependencies = {}, authorityAvailable = true, reasonCodes = [] }) {
  const explicit = normalized.metadata_safe.factors ?? {};
  const proposal = normalized.metadata_safe.factor_proposal ?? {};
  const factorInputs = {};
  const provenance = {};
  const weighted = {};
  let weightedBasisPoints = 0;
  for (const [factor, fallback] of Object.entries(FACTOR_DEFAULTS)) {
    const explicitValue = explicit[factor];
    const proposalValue = proposal[factor];
    let value = fallback;
    let sourceType = 'policy_default';
    let rawValue = null;
    if (boundedFactor(explicitValue)) { value = explicitValue; sourceType = 'explicit_validated_card_value'; rawValue = explicitValue; }
    else if (factor === 'dependency_readiness' && dependencies.hardBlocked === true) { value = 0; sourceType = 'deterministic_derived_value'; rawValue = 0; }
    else if (factor === 'approval_free_work' && authorityAvailable !== true) { value = 0; sourceType = 'deterministic_derived_value'; rawValue = 0; }
    else if (boundedFactor(proposalValue)) { value = proposalValue; sourceType = 'validated_model_proposal_fixture_value'; rawValue = proposalValue; }
    factorInputs[factor] = value;
    const contribution = value * FACTOR_WEIGHTS[factor];
    weighted[factor] = contribution;
    weightedBasisPoints += contribution;
    provenance[factor] = {
      raw_value: rawValue, effective_value: value, source_type: sourceType,
      source_reference_hash: sha256(`${normalized.card_snapshot_hash ?? normalized.id}:${factor}:${rawValue ?? 'default'}`),
      confidence: sourceType === 'policy_default' ? 25 : sourceType === 'validated_model_proposal_fixture_value' ? 50 : 100,
      defaulted: sourceType === 'policy_default', explanation_code: sourceType.toUpperCase(),
    };
  }
  const asOf = parseStrictUtc(evaluationTimestamp);
  const timestampInvalid = normalized.invalid_timestamp === true || reasonCodes.includes('INVALID_TIMESTAMP') || !asOf;
  const ageDays = !timestampInvalid && normalized.created_at_ms !== null ? Math.max(0, Math.floor((asOf.epochMs - normalized.created_at_ms) / 86_400_000)) : 0;
  const agingBonus = Math.min(8, Math.floor(ageDays / 14));
  const penaltyRules = [
    ['hard_dependency', -40, reasonCodes.includes('HARD_DEPENDENCY_BLOCKED')],
    ['authority_unavailable', -35, reasonCodes.includes('AUTHORITY_UNAVAILABLE')],
    ['awaiting_user', -25, reasonCodes.includes('AWAITING_USER')],
    ['retry_limit', -20, reasonCodes.includes('RETRY_LIMIT_REACHED')],
    ['duplicate_candidate', -30, reasonCodes.includes('DUPLICATE_CANDIDATE')],
    ['insufficient_specification', -15, normalized.metadata_safe.insufficient_specification === true || (!normalized.title && normalized.body_length < 40)],
  ];
  const penalties = Object.fromEntries(penaltyRules.map(([name, points, active]) => [name, active ? points * 100 : 0]));
  const penaltyBasisPoints = Object.values(penalties).reduce((sum, value) => sum + value, 0);
  const rawBasisPoints = weightedBasisPoints + (agingBonus * 100) + penaltyBasisPoints;
  const scoreBasisPoints = Math.max(0, Math.min(10_000, rawBasisPoints));
  return Object.freeze({
    factor_inputs: factorInputs, factor_provenance: provenance, weighted_contributions: weighted,
    penalties, aging_bonus: agingBonus, final_score: scoreBasisPoints / 100, score_basis_points: scoreBasisPoints,
  });
}

export function portfolioAdvisory(normalized) {
  let category = normalized.metadata_safe.portfolio_category;
  let explanation = 'EXPLICIT_VALIDATED_CATEGORY';
  if (!category) {
    const title = normalized.title.toLowerCase();
    if (/refurb|revenue|listing|inventory|operations? tool/.test(title)) { category = 'high_value_execution'; explanation = 'DERIVED_HIGH_VALUE_EXECUTION'; }
    else if (/maint|reliab|repair|stabili[sz]|monitor/.test(title)) { category = 'maintenance_reliability'; explanation = 'DERIVED_MAINTENANCE_RELIABILITY'; }
    else if (/experiment|prototype|spike/.test(title)) { category = 'experimental_opportunity'; explanation = 'DERIVED_EXPERIMENTAL_OPPORTUNITY'; }
    else { category = 'research_planning'; explanation = 'DEFAULT_RESEARCH_PLANNING_UNRELIABLE_CATEGORY'; }
  }
  return { category, advisory: { advisory_only: true, eligibility_unchanged: true, target_allocation_percent: { high_value_execution: 50, research_planning: 25, maintenance_reliability: 15, experimental_opportunity: 10 }, explanation_code: explanation } };
}

export function proposedOutcome(reasonCodes, eligible) {
  if (reasonCodes.includes('DUPLICATE_CANDIDATE')) return 'MERGE_DUPLICATE';
  if (reasonCodes.includes('HARD_DEPENDENCY_BLOCKED')) return 'BLOCKED_DEPENDENCY';
  if (reasonCodes.includes('AWAITING_USER')) return 'NEEDS_INFORMATION';
  if (eligible) return 'ADVANCE_TO_RESEARCH';
  return 'DEFER';
}

export function compareCandidates(left, right) {
  const leftInvalidTimestamp = left.ineligibility_reason_codes?.includes('INVALID_TIMESTAMP') === true;
  const rightInvalidTimestamp = right.ineligibility_reason_codes?.includes('INVALID_TIMESTAMP') === true;
  return Number(leftInvalidTimestamp) - Number(rightInvalidTimestamp)
    || right.score_basis_points - left.score_basis_points
    || right.factor_inputs.approval_free_work - left.factor_inputs.approval_free_work
    || left.factor_inputs.risk - right.factor_inputs.risk
    || right.factor_inputs.dependency_readiness - left.factor_inputs.dependency_readiness
    || ((left.tie_break_values.created_at_ms ?? Number.MAX_SAFE_INTEGER) - (right.tie_break_values.created_at_ms ?? Number.MAX_SAFE_INTEGER))
    || ((left.tie_break_values.created_at_fraction_ns ?? 0) - (right.tie_break_values.created_at_fraction_ns ?? 0))
    || left.card_id.localeCompare(right.card_id);
}

export function buildCardEvaluation(input) {
  const normalized = normalizeCard(input.card, input.capabilities ?? {});
  const cardSnapshotHash = sha256(canonicalJson({ ...normalized, title: undefined, title_preview_redacted: undefined, created_at_ms: undefined, claim_expires_ms: undefined, next_run_after_ms: undefined }));
  const normalizedWithHash = { ...normalized, card_snapshot_hash: cardSnapshotHash };
  const eligibility = evaluateEligibility({ ...input, normalized: normalizedWithHash });
  const scoring = scoreCard({ normalized: normalizedWithHash, evaluationTimestamp: input.evaluationTimestamp, dependencies: input.dependencies, authorityAvailable: input.authorityAvailable, reasonCodes: eligibility.reason_codes });
  const portfolio = portfolioAdvisory(normalizedWithHash);
  return Object.freeze({ normalized: normalizedWithHash, eligibility, scoring, portfolio, proposed_outcome: proposedOutcome(eligibility.reason_codes, eligibility.eligible) });
}
