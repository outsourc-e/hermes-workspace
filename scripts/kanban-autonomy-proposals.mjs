import {
  STATE_POLICY_VERSION,
  canonicalJson,
  durableTaskId,
  normalizeBoardSlug,
  normalizeStableId,
  parseStrictUtc,
  reduceTaskState,
  sha256Hex,
  validateEventPayload,
} from './kanban-autonomy-state.mjs';
import {
  ELIGIBILITY_POLICY_VERSION,
  PORTFOLIO_POLICY_VERSION,
  REASON_CODES,
  SCORING_POLICY_VERSION,
  compareCandidates,
  parseStrictUtc as parseShadowUtc,
  redactTitle,
  sha256,
} from './kanban-triage-policy.mjs';

export const PROPOSAL_SCHEMA = 'kan_aut_shadow_event_proposals.v1';
const REQUEST_SCHEMA = 'kan_aut_shadow_event_proposal_request.v1';
const SHADOW_SCHEMA = 'kan_aut_triage_shadow_preview.v1';

const FACTORS = Object.freeze([
  'expected_value', 'urgency', 'confidence', 'effort', 'risk', 'strategic_fit',
  'dependency_readiness', 'autonomous_readiness', 'time_saved', 'revenue_impact',
  'learning_reuse', 'approval_free_work',
]);
const FACTOR_DEFAULTS = Object.freeze({
  expected_value: 50, urgency: 30, confidence: 25, effort: 60, risk: 60,
  strategic_fit: 40, dependency_readiness: 40, autonomous_readiness: 30,
  time_saved: 30, revenue_impact: 20, learning_reuse: 40, approval_free_work: 25,
});
const WEIGHTS = Object.freeze({
  expected_value: 14, urgency: 10, confidence: 8, effort: -12, risk: -14,
  strategic_fit: 10, dependency_readiness: 8, autonomous_readiness: 10,
  time_saved: 8, revenue_impact: 12, learning_reuse: 6, approval_free_work: 8,
});
const PENALTIES = Object.freeze({
  hard_dependency: -4000,
  authority_unavailable: -3500,
  awaiting_user: -2500,
  retry_limit: -2000,
  duplicate_candidate: -3000,
  insufficient_specification: -1500,
});
const SIDE_EFFECT_KEYS = Object.freeze([
  'database_write', 'card_created', 'card_moved', 'card_edited', 'comment_created',
  'task_created', 'lease_created', 'approval_created', 'telegram_sent', 'obsidian_written',
  'github_written', 'durable_store_written', 'source_written', 'model_calls', 'network_calls',
  'service_changes', 'timer_changes',
]);
const OUTPUT_SIDE_EFFECTS = Object.freeze({
  selection_performed: false,
  task_created: false,
  event_appended: false,
  store_written: false,
  kanban_write: false,
  queue_read: false,
  queue_written: false,
  approval_requested: false,
  claim_performed: false,
  lease_created: false,
  network_calls: false,
  model_calls: false,
  execution_performed: false,
});
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const SOURCE_TYPES = new Set([
  'policy_default', 'explicit_validated_card_value', 'deterministic_derived_value',
  'validated_model_proposal_fixture_value',
]);
const PORTFOLIO_CATEGORIES = new Set([
  'high_value_execution', 'research_planning', 'maintenance_reliability', 'experimental_opportunity',
]);
const PROPOSED_OUTCOMES = new Set([
  'ADVANCE_TO_RESEARCH', 'NEEDS_INFORMATION', 'BLOCKED_DEPENDENCY', 'MERGE_DUPLICATE', 'DEFER',
]);
const ERROR_LIMIT = 160;
export const REQUEST_JSON_LIMITS = Object.freeze({
  bytes: 2_097_152,
  depth: 32,
  nodes: 100_000,
  objectKeys: 256,
  arrayLength: 99_999,
  keyBytes: 128,
  stringBytes: 1_048_576,
});
const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function proposalError(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function utf8Bytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

function validateUnicode(value, key = false) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        proposalError(key ? 'PAYLOAD_KEY_INVALID_UNICODE' : 'PAYLOAD_STRING_INVALID_UNICODE');
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      proposalError(key ? 'PAYLOAD_KEY_INVALID_UNICODE' : 'PAYLOAD_STRING_INVALID_UNICODE');
    }
  }
}

function validateJsonKey(key) {
  validateUnicode(key, true);
  for (let index = 0; index < key.length; index += 1) {
    const unit = key.charCodeAt(index);
    if (unit < 0x20 || unit === 0x7f) proposalError('PAYLOAD_KEY_CONTROL_CHARACTER_FORBIDDEN');
    if (unit > 0x7e) proposalError('PAYLOAD_KEY_NON_ASCII_FORBIDDEN');
  }
  if (utf8Bytes(key) > REQUEST_JSON_LIMITS.keyBytes) proposalError('PAYLOAD_KEY_TOO_LONG');
}

function validateJsonNumber(value) {
  if (!Number.isFinite(value)) proposalError('NON_FINITE_NUMBER');
  if (Object.is(value, -0)) proposalError('NEGATIVE_ZERO_FORBIDDEN');
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) proposalError('UNSAFE_INTEGER_NUMBER');
}

function jsonStringBytes(value) {
  let bytes = 2;
  for (const character of value) {
    const code = character.codePointAt(0);
    if (character === '"' || character === '\\' || ['\b', '\f', '\n', '\r', '\t'].includes(character)) {
      bytes += 2;
    } else if (code < 0x20) {
      bytes += 6;
    } else {
      bytes += utf8Bytes(character);
    }
  }
  return bytes;
}

function jsonEncodedBytes(value) {
  if (value === null) return 4;
  if (typeof value === 'boolean') return value ? 4 : 5;
  if (typeof value === 'number') return utf8Bytes(String(value));
  if (typeof value === 'string') return jsonStringBytes(value);
  if (Array.isArray(value)) {
    return 2 + Math.max(0, value.length - 1)
      + value.reduce((total, item) => total + jsonEncodedBytes(item), 0);
  }
  const entries = Object.entries(value);
  return 2 + Math.max(0, entries.length - 1) + entries.reduce(
    (total, [key, item]) => total + jsonStringBytes(key) + 1 + jsonEncodedBytes(item), 0,
  );
}

export function parseProposalRequestJson(text) {
  if (typeof text !== 'string') proposalError('INVALID_JSON');
  if (utf8Bytes(text) > REQUEST_JSON_LIMITS.bytes) proposalError('JSON_INPUT_TOO_LARGE');
  let index = 0;
  let nodes = 0;
  const whitespace = () => {
    while (index < text.length && [0x20, 0x09, 0x0a, 0x0d].includes(text.charCodeAt(index))) index += 1;
  };
  const countNode = (depth) => {
    nodes += 1;
    if (nodes > REQUEST_JSON_LIMITS.nodes) proposalError('PAYLOAD_NODE_LIMIT_EXCEEDED');
    if (depth > REQUEST_JSON_LIMITS.depth) proposalError('PAYLOAD_DEPTH_EXCEEDED');
  };
  const parseString = (isKey = false) => {
    if (text[index] !== '"') proposalError('INVALID_JSON');
    index += 1;
    let result = '';
    while (index < text.length) {
      const character = text[index++];
      if (character === '"') {
        validateUnicode(result, isKey);
        if (isKey) validateJsonKey(result);
        if (!isKey && utf8Bytes(result) > REQUEST_JSON_LIMITS.stringBytes) {
          proposalError('PAYLOAD_STRING_TOO_LONG');
        }
        return result;
      }
      if (character.charCodeAt(0) < 0x20) proposalError('INVALID_JSON');
      if (character !== '\\') {
        result += character;
        continue;
      }
      if (index >= text.length) proposalError('INVALID_JSON');
      const escape = text[index++];
      const simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (Object.hasOwn(simple, escape)) {
        result += simple[escape];
        continue;
      }
      if (escape !== 'u' || !/^[0-9a-fA-F]{4}$/.test(text.slice(index, index + 4))) {
        proposalError('INVALID_JSON');
      }
      const first = Number.parseInt(text.slice(index, index + 4), 16);
      index += 4;
      if (first >= 0xd800 && first <= 0xdbff) {
        if (text.slice(index, index + 2) !== '\\u'
          || !/^[0-9a-fA-F]{4}$/.test(text.slice(index + 2, index + 6))) proposalError('INVALID_JSON');
        const second = Number.parseInt(text.slice(index + 2, index + 6), 16);
        if (second < 0xdc00 || second > 0xdfff) proposalError('INVALID_JSON');
        result += String.fromCodePoint(0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00));
        index += 6;
      } else {
        if (first >= 0xdc00 && first <= 0xdfff) proposalError('INVALID_JSON');
        result += String.fromCharCode(first);
      }
    }
    proposalError('INVALID_JSON');
  };
  const parseValue = (depth) => {
    countNode(depth);
    whitespace();
    const character = text[index];
    if (character === '"') return parseString();
    if (character === '{') {
      index += 1;
      const result = Object.create(null);
      const keys = new Set();
      whitespace();
      if (text[index] === '}') { index += 1; return result; }
      while (true) {
        whitespace();
        const key = parseString(true);
        if (FORBIDDEN_JSON_KEYS.has(key)) proposalError('PROTOTYPE_JSON_KEY_FORBIDDEN');
        if (keys.has(key)) proposalError('DUPLICATE_JSON_KEY');
        keys.add(key);
        if (keys.size > REQUEST_JSON_LIMITS.objectKeys) proposalError('PAYLOAD_OBJECT_KEY_LIMIT_EXCEEDED');
        whitespace();
        if (text[index++] !== ':') proposalError('INVALID_JSON');
        result[key] = parseValue(depth + 1);
        whitespace();
        const delimiter = text[index++];
        if (delimiter === '}') return result;
        if (delimiter !== ',') proposalError('INVALID_JSON');
        whitespace();
        if (text[index] === '}') proposalError('INVALID_JSON');
      }
    }
    if (character === '[') {
      index += 1;
      const result = [];
      whitespace();
      if (text[index] === ']') { index += 1; return result; }
      while (true) {
        if (result.length >= REQUEST_JSON_LIMITS.arrayLength) proposalError('PAYLOAD_ARRAY_LIMIT_EXCEEDED');
        result.push(parseValue(depth + 1));
        whitespace();
        const delimiter = text[index++];
        if (delimiter === ']') return result;
        if (delimiter !== ',') proposalError('INVALID_JSON');
        whitespace();
        if (text[index] === ']') proposalError('INVALID_JSON');
      }
    }
    const remainder = text.slice(index);
    const literal = remainder.match(/^(true|false|null)/)?.[1];
    if (literal) {
      index += literal.length;
      return literal === 'true' ? true : literal === 'false' ? false : null;
    }
    const number = remainder.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];
    if (!number) proposalError('INVALID_JSON');
    index += number.length;
    const value = Number(number);
    validateJsonNumber(value);
    return value;
  };
  whitespace();
  if (index === text.length) proposalError('INVALID_JSON');
  const value = parseValue(0);
  whitespace();
  if (index !== text.length) proposalError('INVALID_JSON');
  return value;
}

function snapshotProgrammaticValue(input) {
  let nodes = 0;
  const active = new Set();

  const snapshot = (value, depth) => {
    nodes += 1;
    if (nodes > REQUEST_JSON_LIMITS.nodes) proposalError('PAYLOAD_NODE_LIMIT_EXCEEDED');
    if (depth > REQUEST_JSON_LIMITS.depth) proposalError('PAYLOAD_DEPTH_EXCEEDED');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      validateUnicode(value);
      if (utf8Bytes(value) > REQUEST_JSON_LIMITS.stringBytes) proposalError('PAYLOAD_STRING_TOO_LONG');
      return value;
    }
    if (typeof value === 'number') {
      validateJsonNumber(value);
      return value;
    }
    if (typeof value !== 'object') proposalError('INVALID_PROGRAMMATIC_VALUE');
    if (active.has(value)) proposalError('CYCLIC_PROGRAMMATIC_VALUE');

    let prototype;
    let descriptors;
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      proposalError('UNSAFE_PROGRAMMATIC_OBJECT');
    }
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === 'symbol')) proposalError('SYMBOL_PROPERTY_FORBIDDEN');

    active.add(value);
    try {
      if (Array.isArray(value)) {
        if (prototype !== Array.prototype) proposalError('UNSUPPORTED_PROGRAMMATIC_PROTOTYPE');
        const lengthDescriptor = descriptors.length;
        if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')
          || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0
          || lengthDescriptor.value > REQUEST_JSON_LIMITS.arrayLength) {
          proposalError('PAYLOAD_ARRAY_LIMIT_EXCEEDED');
        }
        const length = lengthDescriptor.value;
        const expectedKeys = Array.from({ length }, (_, index) => String(index));
        const actualKeys = keys.filter((key) => key !== 'length');
        if (actualKeys.length !== expectedKeys.length
          || actualKeys.some((key, index) => key !== expectedKeys[index])) {
          proposalError('UNSUPPORTED_ARRAY_SHAPE');
        }
        const copy = [];
        for (const key of expectedKeys) {
          const descriptor = descriptors[key];
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
            proposalError('UNSAFE_PROPERTY_DESCRIPTOR');
          }
          copy.push(snapshot(descriptor.value, depth + 1));
        }
        return Object.freeze(copy);
      }

      if (prototype !== Object.prototype && prototype !== null) {
        proposalError('UNSUPPORTED_PROGRAMMATIC_PROTOTYPE');
      }
      if (keys.length > REQUEST_JSON_LIMITS.objectKeys) {
        proposalError('PAYLOAD_OBJECT_KEY_LIMIT_EXCEEDED');
      }
      const copy = prototype === null ? Object.create(null) : {};
      for (const key of keys) {
        validateJsonKey(key);
        if (FORBIDDEN_JSON_KEYS.has(key)) proposalError('PROTOTYPE_JSON_KEY_FORBIDDEN');
        const descriptor = descriptors[key];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          proposalError('UNSAFE_PROPERTY_DESCRIPTOR');
        }
        Object.defineProperty(copy, key, {
          value: snapshot(descriptor.value, depth + 1),
          enumerable: true,
          writable: false,
          configurable: false,
        });
      }
      return Object.freeze(copy);
    } finally {
      active.delete(value);
    }
  };

  const result = snapshot(input, 0);
  if (jsonEncodedBytes(result) > REQUEST_JSON_LIMITS.bytes) {
    proposalError('JSON_INPUT_TOO_LARGE');
  }
  return result;
}

function object(value, code = 'INVALID_OBJECT') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) proposalError(code);
  return value;
}

function exactKeys(value, required, code = 'UNKNOWN_OR_MISSING_FIELD') {
  object(value, code);
  const actual = Object.keys(value).sort();
  const expected = [...required].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    proposalError(code);
  }
}

function boolean(value, code = 'INVALID_BOOLEAN') {
  if (typeof value !== 'boolean') proposalError(code);
}

function integer(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER, code = 'INVALID_INTEGER') {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) proposalError(code);
}

function string(value, code = 'INVALID_STRING') {
  if (typeof value !== 'string') proposalError(code);
}

function hash(value, code = 'INVALID_HASH') {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) proposalError(code);
}

function codeArray(value, allowed = null) {
  if (!Array.isArray(value) || value.length > 32) proposalError('INVALID_CODE_ARRAY');
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !CODE_PATTERN.test(item) || seen.has(item)
      || (allowed && !allowed.has(item))) proposalError('INVALID_CODE_ARRAY');
    seen.add(item);
  }
  if (value.some((item, index) => index > 0 && value[index - 1] >= item)) {
    proposalError('NONCANONICAL_CODE_ARRAY');
  }
}

function validatePolicy(policy) {
  exactKeys(policy, ['eligibility_version', 'scoring_version', 'portfolio_version', 'eligibility_scope'], 'INVALID_SHADOW_POLICY');
  if (policy.eligibility_version !== ELIGIBILITY_POLICY_VERSION
    || policy.scoring_version !== SCORING_POLICY_VERSION
    || policy.portfolio_version !== PORTFOLIO_POLICY_VERSION
    || policy.eligibility_scope !== 'shadow_preview_only') proposalError('UNSUPPORTED_SHADOW_POLICY');
}

function validateBoard(board) {
  exactKeys(board, [
    'slug', 'database_path_hash', 'scan_source', 'source_database_path_hash',
    'source_database_sha256', 'snapshot_sha256', 'snapshot_matches_source', 'source_wal_state',
    'snapshot_hash', 'sqlite_data_version', 'configured_triage_status', 'query_only',
    'sqlite_immutable', 'schema_profile', 'schema_degraded', 'missing_optional_fields',
    'claim_capable', 'unavailable_capabilities', 'connection_total_changes',
    'sidecar_no_creation_verified',
  ], 'INVALID_BOARD_ATTESTATION');
  string(board.slug, 'INVALID_BOARD_SLUG');
  if (normalizeBoardSlug(board.slug) !== board.slug) proposalError('INVALID_BOARD_SLUG');
  for (const field of ['database_path_hash', 'source_database_path_hash', 'source_database_sha256', 'snapshot_sha256', 'snapshot_hash']) hash(board[field]);
  if (board.database_path_hash !== board.source_database_path_hash) proposalError('INCONSISTENT_BOARD_ATTESTATION');
  if (!['synthetic_fixture', 'verified_temporary_snapshot'].includes(board.scan_source)) proposalError('INVALID_BOARD_ATTESTATION');
  if (board.snapshot_matches_source !== true || board.source_database_sha256 !== board.snapshot_sha256) {
    proposalError('INCONSISTENT_BOARD_ATTESTATION');
  }
  if (!['absent', 'empty'].includes(board.source_wal_state)
    || (board.scan_source === 'synthetic_fixture' && board.source_wal_state !== 'absent')) {
    proposalError('INVALID_BOARD_ATTESTATION');
  }
  integer(board.sqlite_data_version, 1);
  string(board.configured_triage_status);
  if (board.query_only !== 1 || board.sqlite_immutable !== 1 || board.connection_total_changes !== 0
    || board.sidecar_no_creation_verified !== true || board.claim_capable !== false) {
    proposalError('INCONSISTENT_BOARD_ATTESTATION');
  }
  const full = board.schema_profile === 'kanban_tasks_full_v1';
  const legacy = board.schema_profile === 'kanban_tasks_legacy_shadow_v1';
  if (!full && !legacy) proposalError('UNKNOWN_SCHEMA_PROFILE');
  if (board.schema_degraded !== legacy) proposalError('INCONSISTENT_BOARD_ATTESTATION');
  const missing = legacy ? ['metadata', 'updated_at', 'last_failure_at', 'next_run_after'] : [];
  if (!Array.isArray(board.missing_optional_fields)
    || canonicalJson(board.missing_optional_fields) !== canonicalJson(missing)) {
    proposalError('INCONSISTENT_BOARD_ATTESTATION');
  }
  if (!Array.isArray(board.unavailable_capabilities)
    || board.unavailable_capabilities.length !== missing.length) proposalError('INCONSISTENT_BOARD_ATTESTATION');
  board.unavailable_capabilities.forEach((capability, index) => {
    exactKeys(capability, ['field', 'available', 'derived', 'source', 'rule', 'source_reference_hash'], 'INVALID_BOARD_ATTESTATION');
    if (capability.field !== missing[index] || capability.available !== false || capability.derived !== false
      || capability.source !== null || capability.rule !== null || capability.source_reference_hash !== null) {
      proposalError('INCONSISTENT_BOARD_ATTESTATION');
    }
  });
}

function validateFactorEvidence(candidate, generatedAt, schemaProfile) {
  exactKeys(candidate.factor_inputs, FACTORS, 'INVALID_FACTOR_INPUTS');
  exactKeys(candidate.factor_provenance, FACTORS, 'INVALID_FACTOR_PROVENANCE');
  exactKeys(candidate.weighted_contributions, FACTORS, 'INVALID_WEIGHTED_CONTRIBUTIONS');
  let weightedTotal = 0;
  for (const factor of FACTORS) {
    integer(candidate.factor_inputs[factor], 0, 100, 'INVALID_FACTOR_INPUT');
    const expectedContribution = candidate.factor_inputs[factor] * WEIGHTS[factor];
    if (candidate.weighted_contributions[factor] !== expectedContribution) proposalError('INCONSISTENT_SCORE');
    weightedTotal += expectedContribution;
    const provenance = candidate.factor_provenance[factor];
    exactKeys(provenance, ['raw_value', 'effective_value', 'source_type', 'source_reference_hash', 'confidence', 'defaulted', 'explanation_code'], 'INVALID_FACTOR_PROVENANCE');
    if (provenance.raw_value !== null) integer(provenance.raw_value, 0, 100, 'INVALID_FACTOR_PROVENANCE');
    if (provenance.effective_value !== candidate.factor_inputs[factor]
      || !SOURCE_TYPES.has(provenance.source_type)) proposalError('INVALID_FACTOR_PROVENANCE');
    const defaulted = provenance.source_type === 'policy_default';
    const expectedConfidence = defaulted ? 25
      : provenance.source_type === 'validated_model_proposal_fixture_value' ? 50 : 100;
    if ((defaulted && (provenance.raw_value !== null
        || provenance.effective_value !== FACTOR_DEFAULTS[factor]))
      || (!defaulted && provenance.raw_value !== provenance.effective_value)
      || (schemaProfile === 'kanban_tasks_legacy_shadow_v1'
        && ['explicit_validated_card_value', 'validated_model_proposal_fixture_value']
          .includes(provenance.source_type))
      || (provenance.source_type === 'deterministic_derived_value'
        && !((factor === 'dependency_readiness' && provenance.effective_value === 0
            && candidate.ineligibility_reason_codes.includes('HARD_DEPENDENCY_BLOCKED'))
          || (factor === 'approval_free_work' && provenance.effective_value === 0
            && candidate.ineligibility_reason_codes.includes('AUTHORITY_UNAVAILABLE'))))) {
      proposalError('INVALID_FACTOR_PROVENANCE');
    }
    if (provenance.source_reference_hash
        !== sha256(`${candidate.card_snapshot_hash}:${factor}:${provenance.raw_value ?? 'default'}`)
      || provenance.confidence !== expectedConfidence
      || provenance.defaulted !== defaulted
      || provenance.explanation_code !== provenance.source_type.toUpperCase()) {
      proposalError('INVALID_FACTOR_PROVENANCE');
    }
  }
  exactKeys(candidate.penalties, Object.keys(PENALTIES), 'INVALID_PENALTIES');
  let penaltyTotal = 0;
  for (const [name, activeValue] of Object.entries(PENALTIES)) {
    if (![0, activeValue].includes(candidate.penalties[name])) proposalError('INVALID_PENALTIES');
    penaltyTotal += candidate.penalties[name];
  }
  const reasonPenalty = {
    hard_dependency: 'HARD_DEPENDENCY_BLOCKED',
    authority_unavailable: 'AUTHORITY_UNAVAILABLE',
    awaiting_user: 'AWAITING_USER',
    retry_limit: 'RETRY_LIMIT_REACHED',
    duplicate_candidate: 'DUPLICATE_CANDIDATE',
  };
  for (const [penalty, reason] of Object.entries(reasonPenalty)) {
    const expectedPenalty = candidate.ineligibility_reason_codes.includes(reason) ? PENALTIES[penalty] : 0;
    if (candidate.penalties[penalty] !== expectedPenalty) proposalError('INCONSISTENT_PENALTIES');
  }
  integer(candidate.aging_bonus, 0, 8, 'INVALID_AGING_BONUS');
  const generated = parseShadowUtc(generatedAt);
  const createdMs = candidate.tie_break_values?.created_at_ms;
  const timestampInvalid = candidate.ineligibility_reason_codes.includes('INVALID_TIMESTAMP');
  const ageDays = !timestampInvalid && generated && createdMs !== null
    ? Math.max(0, Math.floor((generated.epochMs - createdMs) / 86_400_000)) : 0;
  if (candidate.aging_bonus !== Math.min(8, Math.floor(ageDays / 14))) {
    proposalError('INCONSISTENT_AGING_BONUS');
  }
  integer(candidate.score_basis_points, 0, 10000, 'INVALID_SCORE');
  const expected = Math.max(0, Math.min(10000, weightedTotal + penaltyTotal + (candidate.aging_bonus * 100)));
  if (candidate.score_basis_points !== expected || candidate.final_score !== expected / 100) {
    proposalError('INCONSISTENT_SCORE');
  }
}

function validateCandidate(candidate, expectedRank, schemaProfile, generatedAt) {
  exactKeys(candidate, [
    'rank', 'card_id', 'card_snapshot_hash', 'title_preview_redacted', 'title_hash',
    'source_identity_hash', 'shadow_eligible', 'claim_eligible', 'claim_blocker_codes',
    'ineligibility_reason_codes', 'factor_inputs', 'factor_provenance',
    'weighted_contributions', 'penalties', 'aging_bonus', 'final_score',
    'score_basis_points', 'portfolio_category', 'portfolio_advisory', 'tie_break_values',
    'proposed_outcome', 'explanation_codes',
  ], 'INVALID_CANDIDATE');
  if (candidate.rank !== expectedRank) proposalError('INVALID_CANDIDATE_RANK');
  normalizeStableId(candidate.card_id, 'card_id');
  hash(candidate.card_snapshot_hash);
  string(candidate.title_preview_redacted);
  if (candidate.title_preview_redacted.length > 80
    || redactTitle(candidate.title_preview_redacted) !== candidate.title_preview_redacted) {
    proposalError('INVALID_REDACTED_TITLE');
  }
  hash(candidate.title_hash);
  if (candidate.source_identity_hash !== null) hash(candidate.source_identity_hash);
  boolean(candidate.shadow_eligible);
  if (candidate.claim_eligible !== false) proposalError('CLAIM_AUTHORITY_FORBIDDEN');
  const blockers = schemaProfile === 'kanban_tasks_full_v1'
    ? ['SHADOW_SCANNER_HAS_NO_CLAIM_ENGINE'] : ['LEGACY_SCHEMA_NOT_CLAIM_CAPABLE'];
  if (canonicalJson(candidate.claim_blocker_codes) !== canonicalJson(blockers)) proposalError('INVALID_CLAIM_BLOCKERS');
  codeArray(candidate.ineligibility_reason_codes, new Set(REASON_CODES));
  if (['NO_TRIAGE_COLUMN', 'NOT_IN_TRIAGE', 'AUTHORITY_UNAVAILABLE']
    .some((reason) => candidate.ineligibility_reason_codes.includes(reason))) {
    proposalError('PRODUCER_IMPOSSIBLE_ELIGIBILITY_REASON');
  }
  if (candidate.ineligibility_reason_codes.includes('MISSING_SOURCE_IDENTITY')
    !== (candidate.source_identity_hash === null)) {
    proposalError('INCONSISTENT_SOURCE_IDENTITY');
  }
  if (candidate.shadow_eligible !== (candidate.ineligibility_reason_codes.length === 0)) {
    proposalError('INCONSISTENT_ELIGIBILITY');
  }
  validateFactorEvidence(candidate, generatedAt, schemaProfile);
  if (!PORTFOLIO_CATEGORIES.has(candidate.portfolio_category)) proposalError('INVALID_PORTFOLIO');
  exactKeys(candidate.portfolio_advisory, ['advisory_only', 'eligibility_unchanged', 'target_allocation_percent', 'explanation_code'], 'INVALID_PORTFOLIO');
  if (candidate.portfolio_advisory.advisory_only !== true
    || candidate.portfolio_advisory.eligibility_unchanged !== true) proposalError('INVALID_PORTFOLIO');
  exactKeys(candidate.portfolio_advisory.target_allocation_percent, [...PORTFOLIO_CATEGORIES], 'INVALID_PORTFOLIO');
  if (canonicalJson(candidate.portfolio_advisory.target_allocation_percent) !== canonicalJson({
    high_value_execution: 50, research_planning: 25, maintenance_reliability: 15, experimental_opportunity: 10,
  })) proposalError('INVALID_PORTFOLIO');
  const portfolioExplanationCategories = {
    DERIVED_HIGH_VALUE_EXECUTION: 'high_value_execution',
    DERIVED_MAINTENANCE_RELIABILITY: 'maintenance_reliability',
    DERIVED_EXPERIMENTAL_OPPORTUNITY: 'experimental_opportunity',
    DEFAULT_RESEARCH_PLANNING_UNRELIABLE_CATEGORY: 'research_planning',
  };
  const portfolioExplanation = candidate.portfolio_advisory.explanation_code;
  if (portfolioExplanation !== 'EXPLICIT_VALIDATED_CATEGORY'
    && portfolioExplanationCategories[portfolioExplanation] !== candidate.portfolio_category) {
    proposalError('INVALID_PORTFOLIO');
  }
  if (schemaProfile === 'kanban_tasks_legacy_shadow_v1'
    && portfolioExplanation === 'EXPLICIT_VALIDATED_CATEGORY') proposalError('INVALID_PORTFOLIO');
  exactKeys(candidate.tie_break_values, ['approval_free_work', 'risk', 'dependency_readiness', 'created_at', 'created_at_ms', 'created_at_fraction_ns', 'stable_card_id'], 'INVALID_TIE_BREAK');
  if (candidate.tie_break_values.approval_free_work !== candidate.factor_inputs.approval_free_work
    || candidate.tie_break_values.risk !== candidate.factor_inputs.risk
    || candidate.tie_break_values.dependency_readiness !== candidate.factor_inputs.dependency_readiness
    || candidate.tie_break_values.stable_card_id !== candidate.card_id) proposalError('INVALID_TIE_BREAK');
  const createdAt = candidate.tie_break_values.created_at;
  if (createdAt === null) {
    if (candidate.tie_break_values.created_at_ms !== null || candidate.tie_break_values.created_at_fraction_ns !== null) {
      proposalError('INVALID_TIE_BREAK');
    }
  } else {
    const parsed = parseShadowUtc(createdAt);
    if (!parsed || parsed.sourceType !== 'rfc3339_utc_text'
      || candidate.tie_break_values.created_at_ms !== parsed.epochMs
      || candidate.tie_break_values.created_at_fraction_ns !== parsed.fractionNanoseconds) {
      proposalError('INVALID_TIE_BREAK');
    }
  }
  if (!PROPOSED_OUTCOMES.has(candidate.proposed_outcome)) proposalError('INVALID_PROPOSED_OUTCOME');
  const expectedOutcome = candidate.ineligibility_reason_codes.includes('DUPLICATE_CANDIDATE') ? 'MERGE_DUPLICATE'
    : candidate.ineligibility_reason_codes.includes('HARD_DEPENDENCY_BLOCKED') ? 'BLOCKED_DEPENDENCY'
      : candidate.ineligibility_reason_codes.includes('AWAITING_USER') ? 'NEEDS_INFORMATION'
        : candidate.shadow_eligible ? 'ADVANCE_TO_RESEARCH' : 'DEFER';
  if (candidate.proposed_outcome !== expectedOutcome) proposalError('INVALID_PROPOSED_OUTCOME');
  codeArray(candidate.explanation_codes);
  for (const reason of candidate.ineligibility_reason_codes) {
    if (!candidate.explanation_codes.includes(reason)) proposalError('INCONSISTENT_EXPLANATIONS');
  }
  for (const safetyCode of ['MANUAL_STATUS_IS_NOT_APPROVAL_AUTHORITY', 'SHADOW_ONLY_NO_CLAIM']) {
    if (!candidate.explanation_codes.includes(safetyCode)) proposalError('INCONSISTENT_EXPLANATIONS');
  }
  if (!candidate.explanation_codes.includes(candidate.portfolio_advisory.explanation_code)) {
    proposalError('INCONSISTENT_EXPLANATIONS');
  }
  const optionalEvidence = candidate.explanation_codes.includes('EXPIRED_CLAIM_REPORTED_NO_RECLAIM_AUTHORITY')
    ? ['EXPIRED_CLAIM_REPORTED_NO_RECLAIM_AUTHORITY'] : [];
  const expectedExplanations = [...new Set([
    'MANUAL_STATUS_IS_NOT_APPROVAL_AUTHORITY', 'SHADOW_ONLY_NO_CLAIM',
    ...optionalEvidence, ...candidate.ineligibility_reason_codes, portfolioExplanation,
  ])].sort();
  if (canonicalJson(candidate.explanation_codes) !== canonicalJson(expectedExplanations)) {
    proposalError('INCONSISTENT_EXPLANATIONS');
  }
}

function validateSummary(summary, candidates) {
  exactKeys(summary, ['total_cards', 'triage_cards', 'shadow_eligible_cards', 'shadow_ineligible_cards', 'scored_cards', 'returned_candidates', 'reason_code_counts'], 'INVALID_SUMMARY');
  for (const key of ['total_cards', 'triage_cards', 'shadow_eligible_cards', 'shadow_ineligible_cards', 'scored_cards', 'returned_candidates']) integer(summary[key]);
  if (summary.total_cards < summary.triage_cards || summary.triage_cards !== summary.scored_cards
    || summary.shadow_eligible_cards + summary.shadow_ineligible_cards !== summary.triage_cards
    || summary.returned_candidates !== candidates.length || candidates.length > summary.triage_cards
    || (summary.triage_cards > 0 && candidates.length === 0)) {
    proposalError('INCONSISTENT_SUMMARY');
  }
  const returnedEligible = candidates.filter((candidate) => candidate.shadow_eligible).length;
  if (summary.shadow_eligible_cards < returnedEligible
    || summary.shadow_ineligible_cards < candidates.length - returnedEligible) {
    proposalError('INCONSISTENT_SUMMARY');
  }
  object(summary.reason_code_counts, 'INVALID_SUMMARY');
  const reasonKeys = Object.keys(summary.reason_code_counts);
  if (reasonKeys.some((key, index) => !REASON_CODES.includes(key)
    || (index > 0 && reasonKeys[index - 1] >= key))) proposalError('INVALID_SUMMARY');
  for (const value of Object.values(summary.reason_code_counts)) {
    integer(value, 1);
    if (value > summary.shadow_ineligible_cards) proposalError('INCONSISTENT_SUMMARY');
  }
  const returnedReasonCounts = {};
  for (const candidate of candidates) {
    for (const reason of candidate.ineligibility_reason_codes) {
      returnedReasonCounts[reason] = (returnedReasonCounts[reason] ?? 0) + 1;
    }
  }
  for (const [reason, count] of Object.entries(returnedReasonCounts)) {
    if ((summary.reason_code_counts[reason] ?? 0) < count) proposalError('INCONSISTENT_SUMMARY');
  }
}

function validateShadowPreviewSnapshot(preview) {
  exactKeys(preview, ['schema', 'mode', 'generated_at', 'policy', 'board', 'ephemeral_artifacts', 'summary', 'side_effects', 'candidates', 'winner', 'warnings'], 'INVALID_SHADOW_PREVIEW');
  if (preview.schema !== SHADOW_SCHEMA) proposalError('UNSUPPORTED_SHADOW_SCHEMA');
  if (preview.mode !== 'shadow_read_only') proposalError('INVALID_SHADOW_MODE');
  if (!parseStrictUtc(preview.generated_at)) proposalError('INVALID_GENERATED_AT');
  validatePolicy(preview.policy);
  validateBoard(preview.board);
  exactKeys(preview.ephemeral_artifacts, ['temporary_snapshot_created', 'temporary_snapshot_removed', 'persistent_output_created'], 'INVALID_EPHEMERAL_ATTESTATION');
  const fixture = preview.board.scan_source === 'synthetic_fixture';
  if (preview.ephemeral_artifacts.temporary_snapshot_created !== !fixture
    || preview.ephemeral_artifacts.temporary_snapshot_removed !== !fixture
    || preview.ephemeral_artifacts.persistent_output_created !== false) {
    proposalError('INCONSISTENT_EPHEMERAL_ATTESTATION');
  }
  exactKeys(preview.side_effects, SIDE_EFFECT_KEYS, 'INVALID_SIDE_EFFECT_ATTESTATION');
  for (const key of SIDE_EFFECT_KEYS) {
    if (preview.side_effects[key] !== false) proposalError('SHADOW_SIDE_EFFECT_TRUE');
  }
  if (!Array.isArray(preview.candidates) || preview.candidates.length > 50) proposalError('INVALID_CANDIDATES');
  const ids = new Set();
  preview.candidates.forEach((candidate, index) => {
    validateCandidate(
      candidate, index + 1, preview.board.schema_profile, preview.generated_at,
    );
    if (ids.has(candidate.card_id)) proposalError('DUPLICATE_CANDIDATE_ID');
    ids.add(candidate.card_id);
  });
  for (let index = 1; index < preview.candidates.length; index += 1) {
    if (compareCandidates(preview.candidates[index - 1], preview.candidates[index]) > 0) {
      proposalError('INVALID_CANDIDATE_ORDER');
    }
  }
  validateSummary(preview.summary, preview.candidates);
  exactKeys(preview.winner, ['selection_performed', 'preview_card_id', 'preview_score', 'reason'], 'INVALID_WINNER_PREVIEW');
  if (preview.winner.selection_performed !== false) proposalError('SELECTION_PERFORMED_FORBIDDEN');
  if (preview.winner.reason === 'NO_ELIGIBLE_TRIAGE_CARDS') {
    if (preview.winner.preview_card_id !== null || preview.winner.preview_score !== null
      || preview.summary.shadow_eligible_cards !== 0) proposalError('INCONSISTENT_WINNER_PREVIEW');
  } else if (preview.winner.reason === 'HIGHEST_RANKED_ELIGIBLE_PREVIEW_ONLY') {
    normalizeStableId(preview.winner.preview_card_id, 'winner_card_id');
    if (typeof preview.winner.preview_score !== 'number' || preview.summary.shadow_eligible_cards < 1) {
      proposalError('INCONSISTENT_WINNER_PREVIEW');
    }
    const returnedWinner = preview.candidates.find((candidate) => candidate.card_id === preview.winner.preview_card_id);
    const firstReturnedEligible = preview.candidates.find((candidate) => candidate.shadow_eligible);
    if (returnedWinner && (!returnedWinner.shadow_eligible
        || returnedWinner.final_score !== preview.winner.preview_score)) {
      proposalError('INCONSISTENT_WINNER_PREVIEW');
    }
    if (firstReturnedEligible
      && (firstReturnedEligible.card_id !== preview.winner.preview_card_id
        || firstReturnedEligible.final_score !== preview.winner.preview_score)) {
      proposalError('INCONSISTENT_WINNER_PREVIEW');
    }
  } else proposalError('INVALID_WINNER_PREVIEW');
  if (!Array.isArray(preview.warnings)) proposalError('INVALID_WARNINGS');
  const expectedWarnings = preview.board.schema_degraded
    ? ['LEGACY_SCHEMA_SHADOW_ONLY', 'METADATA_POLICY_CAPABILITIES_UNAVAILABLE'] : [];
  if (canonicalJson(preview.warnings) !== canonicalJson(expectedWarnings)) proposalError('INVALID_WARNINGS');
  return preview;
}

export function validateShadowPreview(preview) {
  return validateShadowPreviewSnapshot(snapshotProgrammaticValue(preview));
}

export function buildProposalIdempotencyKey(input) {
  const materialInput = snapshotProgrammaticValue(input);
  exactKeys(materialInput, [
    'kind', 'proposalSchema', 'taskId', 'semanticPayload', 'policyDomain',
  ], 'INVALID_IDEMPOTENCY_MATERIAL');
  const {
    kind, proposalSchema, taskId, semanticPayload, policyDomain,
  } = materialInput;
  if (!['CREATE_TASK', 'CARD_ELIGIBILITY_EVALUATED', 'CARD_SCORED'].includes(kind)) {
    proposalError('INVALID_PROPOSAL_KIND');
  }
  if (proposalSchema !== PROPOSAL_SCHEMA) proposalError('INVALID_PROPOSAL_SCHEMA');
  normalizeStableId(taskId, 'task_id');
  hash(policyDomain, 'INVALID_POLICY_DOMAIN');
  object(semanticPayload, 'INVALID_SEMANTIC_PAYLOAD');
  const semanticPayloadDigest = prefixedCanonicalHash(semanticPayload);
  const material = {
    proposal_schema: proposalSchema,
    operation_kind: kind,
    task_id: taskId,
    semantic_payload_sha256: semanticPayloadDigest,
    policy_domain: policyDomain,
  };
  return `kan4a-${kind.toLowerCase().replaceAll('_', '-')}-${sha256Hex(canonicalJson(material))}`;
}

function proposalPolicyDomain(preview) {
  return prefixedCanonicalHash({
    proposal_schema: PROPOSAL_SCHEMA,
    shadow_schema: SHADOW_SCHEMA,
    eligibility_policy_version: preview.policy.eligibility_version,
    scoring_policy_version: preview.policy.scoring_version,
    portfolio_policy_version: preview.policy.portfolio_version,
    state_policy_version: STATE_POLICY_VERSION,
  });
}

function prefixedCanonicalHash(value) {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}

function prefixedTextHash(value) {
  return `sha256:${sha256Hex(value)}`;
}

function taskCreatedReducerEvent(taskId, input) {
  return {
    event_type: 'TASK_CREATED', event_version: 1, occurred_at: input.createdAt,
    payload: {
      task_id: taskId,
      board_slug_hash: prefixedTextHash(input.boardSlug),
      kanban_card_id_hash: prefixedTextHash(input.kanbanCardId),
      source_identity_hash: input.sourceIdentityHash,
      initial_card_snapshot_hash: input.cardSnapshotHash,
      authority_ceiling: input.authorityCeiling,
      creation_idempotency_key_hash: prefixedTextHash(input.idempotencyKey),
      policy_version: input.policyVersion,
    },
  };
}

function appendSemanticInput(taskId, eventType, occurredAt, payload) {
  return {
    taskId,
    eventType,
    eventVersion: 1,
    occurredAt,
    actorType: 'system',
    actorIdHash: null,
    workerId: null,
    authorityLevel: 'A0',
    fencingToken: null,
    payload,
    policyVersion: STATE_POLICY_VERSION,
    correlationId: null,
    redactionClass: 'internal',
  };
}

export function compileShadowEventProposals(request) {
  const safeRequest = snapshotProgrammaticValue(request);
  exactKeys(safeRequest, ['schema', 'shadow_preview', 'card_id', 'authority_ceiling'], 'INVALID_REQUEST');
  if (safeRequest.schema !== REQUEST_SCHEMA) proposalError('UNSUPPORTED_REQUEST_SCHEMA');
  if (safeRequest.authority_ceiling !== 'A0') proposalError('AUTHORITY_CEILING_MUST_BE_A0');
  normalizeStableId(safeRequest.card_id, 'card_id');
  const preview = validateShadowPreviewSnapshot(safeRequest.shadow_preview);
  const matches = preview.candidates.filter((candidate) => candidate.card_id === safeRequest.card_id);
  if (matches.length !== 1) proposalError(matches.length === 0 ? 'SELECTED_CANDIDATE_NOT_FOUND' : 'DUPLICATE_CANDIDATE_ID');
  const candidate = matches[0];
  if (candidate.source_identity_hash === null) proposalError('SELECTED_SOURCE_IDENTITY_REQUIRED');
  const taskId = durableTaskId(preview.board.slug, candidate.card_id);
  const taskSemanticInput = {
    boardSlug: preview.board.slug,
    kanbanCardId: candidate.card_id,
    cardSnapshotHash: candidate.card_snapshot_hash,
    sourceIdentityHash: candidate.source_identity_hash,
    policyVersion: STATE_POLICY_VERSION,
    authorityCeiling: 'A0',
    createdAt: preview.generated_at,
  };
  const eligibilityPayload = validateEventPayload('CARD_ELIGIBILITY_EVALUATED', 1, {
    card_snapshot_hash: candidate.card_snapshot_hash,
    eligibility_policy_version: preview.policy.eligibility_version,
    eligible: candidate.shadow_eligible,
    reason_codes: [...candidate.ineligibility_reason_codes],
    evidence_hashes: [prefixedCanonicalHash({
      board_snapshot_hash: preview.board.snapshot_hash,
      source_identity_hash: candidate.source_identity_hash,
      card_snapshot_hash: candidate.card_snapshot_hash,
      eligibility_policy_version: preview.policy.eligibility_version,
      explanation_codes: candidate.explanation_codes,
    })],
  });
  const scorePayload = validateEventPayload('CARD_SCORED', 1, {
    card_snapshot_hash: candidate.card_snapshot_hash,
    scoring_policy_version: preview.policy.scoring_version,
    score_basis_points: candidate.score_basis_points,
    factor_evidence_hash: prefixedCanonicalHash({
      factor_inputs: candidate.factor_inputs,
      factor_provenance: candidate.factor_provenance,
      weighted_contributions: candidate.weighted_contributions,
      penalties: candidate.penalties,
      aging_bonus: candidate.aging_bonus,
      portfolio_category: candidate.portfolio_category,
      portfolio_policy_version: preview.policy.portfolio_version,
    }),
    explanation_codes: [...candidate.explanation_codes],
  });
  const eligibilitySemanticInput = appendSemanticInput(
    taskId, 'CARD_ELIGIBILITY_EVALUATED', preview.generated_at, eligibilityPayload,
  );
  const scoreSemanticInput = appendSemanticInput(
    taskId, 'CARD_SCORED', preview.generated_at, scorePayload,
  );
  const policyDomain = proposalPolicyDomain(preview);
  const createKey = buildProposalIdempotencyKey({
    kind: 'CREATE_TASK', proposalSchema: PROPOSAL_SCHEMA, taskId,
    semanticPayload: taskSemanticInput, policyDomain,
  });
  const eligibilityKey = buildProposalIdempotencyKey({
    kind: 'CARD_ELIGIBILITY_EVALUATED', proposalSchema: PROPOSAL_SCHEMA, taskId,
    semanticPayload: eligibilitySemanticInput, policyDomain,
  });
  const scoreKey = buildProposalIdempotencyKey({
    kind: 'CARD_SCORED', proposalSchema: PROPOSAL_SCHEMA, taskId,
    semanticPayload: scoreSemanticInput, policyDomain,
  });
  const taskInput = { ...taskSemanticInput, idempotencyKey: createKey };
  const eligibilityInput = { ...eligibilitySemanticInput, idempotencyKey: eligibilityKey };
  const scoreInput = { ...scoreSemanticInput, idempotencyKey: scoreKey };
  let reducerState = reduceTaskState(null, taskCreatedReducerEvent(taskId, taskInput));
  reducerState = reduceTaskState(reducerState, {
    event_type: eligibilityInput.eventType, event_version: 1,
    occurred_at: eligibilityInput.occurredAt, payload: eligibilityInput.payload,
  });
  reducerState = reduceTaskState(reducerState, {
    event_type: scoreInput.eventType, event_version: 1,
    occurred_at: scoreInput.occurredAt, payload: scoreInput.payload,
  });
  if (reducerState.status !== 'triaged') proposalError('REDUCER_SEQUENCE_INVALID');
  return {
    schema: PROPOSAL_SCHEMA,
    mode: 'proposal_only',
    source: {
      shadow_schema: preview.schema,
      board_slug: preview.board.slug,
      board_snapshot_hash: preview.board.snapshot_hash,
      source_identity_hash: candidate.source_identity_hash,
      card_id: candidate.card_id,
      card_snapshot_hash: candidate.card_snapshot_hash,
      generated_at: preview.generated_at,
    },
    task_proposal: { operation: 'create_task', input: taskInput },
    event_proposals: [
      { operation: 'append_event', event_type: 'CARD_ELIGIBILITY_EVALUATED', input: eligibilityInput },
      { operation: 'append_event', event_type: 'CARD_SCORED', input: scoreInput },
    ],
    validation: { payloads_valid: true, reducer_sequence_valid: true, authority_ceiling: 'A0' },
    side_effects: { ...OUTPUT_SIDE_EFFECTS },
  };
}

export function parseProposalCliArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 3
    || argv[0] !== 'compile' || argv[1] !== '--json' || argv[2] !== '--proposal-only') {
    proposalError('INVALID_CLI_ARGUMENTS');
  }
  return Object.freeze({ command: 'compile', json: true, proposalOnly: true });
}

async function readStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
    bytes += buffer.length;
    if (bytes > REQUEST_JSON_LIMITS.bytes) proposalError('JSON_INPUT_TOO_LARGE');
    chunks.push(buffer);
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    proposalError('INVALID_UTF8');
  }
  if (text.trim() === '') proposalError('INVALID_JSON');
  return text;
}

function safeErrorCode(error) {
  const candidate = typeof error?.code === 'string' ? error.code : 'PROPOSAL_COMPILE_FAILED';
  const safe = candidate.replace(/[^A-Z0-9_]/g, '_').slice(0, ERROR_LIMIT);
  return safe || 'PROPOSAL_COMPILE_FAILED';
}

export async function runCli(argv = process.argv.slice(2)) {
  try {
    parseProposalCliArgs(argv);
    const request = parseProposalRequestJson(await readStdin());
    const result = compileShadowEventProposals(request);
    process.stdout.write(`${canonicalJson(result)}\n`);
  } catch (error) {
    process.stderr.write(`${canonicalJson({ error: { code: safeErrorCode(error) } })}\n`);
    process.exitCode = 1;
  }
}
