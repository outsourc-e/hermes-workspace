import { createHash } from 'node:crypto';

export const STATE_POLICY_VERSION = 'kanban_autonomy_state.v1';
export const COORDINATION_STATE_POLICY_VERSION = 'kanban_autonomy_state.v2';
export const AUTHORITY_LEVELS = Object.freeze(['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
export const ACTIVE_EVENT_TYPES = Object.freeze([
  'CARD_CLAIMED',
  'LEASE_RENEWED',
  'LEASE_RELEASED',
  'TASK_CREATED',
  'CARD_ELIGIBILITY_EVALUATED',
  'CARD_SCORED',
  'RESEARCH_STARTED',
  'RESEARCH_COMPLETED',
  'PLAN_CREATED',
  'APPROVAL_REQUESTED',
  'APPROVAL_GRANTED',
  'APPROVAL_REJECTED',
  'TASK_BLOCKED',
  'TASK_PAUSED',
  'TASK_RESUMED',
  'TASK_COMPLETED',
]);
export const RESERVED_EVENT_TYPES = Object.freeze([
  'BUILD_STARTED', 'TESTS_STARTED', 'TESTS_PASSED',
]);
export const SUPPORTED_EVENT_VERSIONS = Object.freeze(Object.fromEntries(
  ACTIVE_EVENT_TYPES.map((eventType) => [eventType, 1]),
));

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

const HASH_FIELD = { type: 'hash' };
const POLICY_FIELD = { type: 'token', min_length: 1, max_length: 128 };
const CODE_FIELD = { type: 'code', min_length: 1, max_length: 64 };
const CODE_ARRAY_FIELD = { type: 'code_array', max_items: 32, max_item_length: 64 };
const HASH_ARRAY_FIELD = { type: 'hash_array', max_items: 32 };
const AUTHORITY_FIELD = { type: 'authority' };
const BOOLEAN_FIELD = { type: 'boolean' };

function payloadPolicy(required, optional, fields, crossFieldRules = []) {
  return {
    required_keys: required,
    optional_keys: optional,
    forbidden_extra_keys: true,
    fields,
    cross_field_rules: crossFieldRules,
    safe_canonical_output: 'allowed_keys_only',
  };
}

export const EVENT_PAYLOAD_POLICIES = deepFreeze({
  CARD_CLAIMED: {
    1: payloadPolicy(
      ['coordination_policy_version', 'lease_id', 'claimant_id_hash', 'worker_session_id', 'lease_started_at', 'lease_expires_at',
        'requested_duration_seconds', 'claim_reason', 'eligibility_event_id', 'score_event_id',
        'card_snapshot_hash', 'selection_basis_hash'],
      [],
      {
        coordination_policy_version: { type: 'literal', value: COORDINATION_STATE_POLICY_VERSION },
        lease_id: POLICY_FIELD, claimant_id_hash: HASH_FIELD, worker_session_id: POLICY_FIELD,
        lease_started_at: { type: 'timestamp' }, lease_expires_at: { type: 'timestamp' },
        requested_duration_seconds: { type: 'integer', minimum: 30, maximum: 900 },
        claim_reason: { type: 'enum', values: ['INITIAL', 'REACQUIRED_AFTER_RELEASE', 'EXPIRED_TAKEOVER'] },
        eligibility_event_id: POLICY_FIELD, score_event_id: POLICY_FIELD,
        card_snapshot_hash: HASH_FIELD, selection_basis_hash: HASH_FIELD,
      },
    ),
  },
  LEASE_RENEWED: {
    1: payloadPolicy(
      ['coordination_policy_version', 'lease_id', 'previous_expires_at', 'renewed_at', 'lease_expires_at', 'requested_duration_seconds'],
      [],
      {
        coordination_policy_version: { type: 'literal', value: COORDINATION_STATE_POLICY_VERSION },
        lease_id: POLICY_FIELD, previous_expires_at: { type: 'timestamp' }, renewed_at: { type: 'timestamp' },
        lease_expires_at: { type: 'timestamp' },
        requested_duration_seconds: { type: 'integer', minimum: 30, maximum: 900 },
      },
    ),
  },
  LEASE_RELEASED: {
    1: payloadPolicy(
      ['coordination_policy_version', 'lease_id', 'released_at', 'reason_code'],
      [],
      {
        coordination_policy_version: { type: 'literal', value: COORDINATION_STATE_POLICY_VERSION },
        lease_id: POLICY_FIELD, released_at: { type: 'timestamp' },
        reason_code: { type: 'enum', values: ['WORK_COMPLETE', 'PAUSED', 'BLOCKED', 'HANDOFF', 'OPERATOR_REQUEST', 'WORKER_ERROR'] },
      },
    ),
  },
  TASK_CREATED: {
    1: payloadPolicy(
      ['task_id', 'board_slug_hash', 'kanban_card_id_hash', 'source_identity_hash', 'initial_card_snapshot_hash',
        'authority_ceiling', 'creation_idempotency_key_hash', 'policy_version'],
      [],
      {
        task_id: { type: 'task_id' }, board_slug_hash: HASH_FIELD, kanban_card_id_hash: HASH_FIELD,
        source_identity_hash: HASH_FIELD, initial_card_snapshot_hash: HASH_FIELD,
        authority_ceiling: AUTHORITY_FIELD, creation_idempotency_key_hash: HASH_FIELD, policy_version: POLICY_FIELD,
      },
    ),
  },
  CARD_ELIGIBILITY_EVALUATED: {
    1: payloadPolicy(
      ['card_snapshot_hash', 'eligibility_policy_version', 'eligible', 'reason_codes'],
      ['evidence_hashes'],
      {
        card_snapshot_hash: HASH_FIELD, eligibility_policy_version: POLICY_FIELD, eligible: BOOLEAN_FIELD,
        reason_codes: CODE_ARRAY_FIELD, evidence_hashes: HASH_ARRAY_FIELD,
      },
      ['eligible_requires_empty_reason_codes'],
    ),
  },
  CARD_SCORED: {
    1: payloadPolicy(
      ['card_snapshot_hash', 'scoring_policy_version', 'score_basis_points'],
      ['factor_evidence_hash', 'explanation_codes'],
      {
        card_snapshot_hash: HASH_FIELD, scoring_policy_version: POLICY_FIELD,
        score_basis_points: { type: 'integer', minimum: 0, maximum: 10_000 },
        factor_evidence_hash: HASH_FIELD, explanation_codes: CODE_ARRAY_FIELD,
      },
    ),
  },
  RESEARCH_STARTED: {
    1: payloadPolicy(
      ['research_run_id_hash', 'research_policy_version'],
      ['source_scope_hash'],
      { research_run_id_hash: HASH_FIELD, research_policy_version: POLICY_FIELD, source_scope_hash: HASH_FIELD },
    ),
  },
  RESEARCH_COMPLETED: {
    1: payloadPolicy(
      ['research_run_id_hash', 'report_hash', 'outcome'],
      ['source_count', 'recommendation_code'],
      {
        research_run_id_hash: HASH_FIELD, report_hash: HASH_FIELD,
        outcome: { type: 'enum', values: ['completed', 'no_useful_result', 'blocked'] },
        source_count: { type: 'integer', minimum: 0, maximum: 100_000 }, recommendation_code: CODE_FIELD,
      },
    ),
  },
  PLAN_CREATED: {
    1: payloadPolicy(
      ['plan_hash', 'plan_version', 'next_safe_action'],
      ['proposed_authority', 'file_scope_hash'],
      {
        plan_hash: HASH_FIELD, plan_version: POLICY_FIELD,
        next_safe_action: { type: 'enum', values: ['request_approval', 'defer', 'needs_information', 'research_more'] },
        proposed_authority: AUTHORITY_FIELD, file_scope_hash: HASH_FIELD,
      },
    ),
  },
  APPROVAL_REQUESTED: {
    1: payloadPolicy(
      ['approval_id_hash', 'approval_status', 'requested_authority', 'requested_action'],
      ['scope_hash', 'expires_at'],
      {
        approval_id_hash: HASH_FIELD, approval_status: { type: 'literal', value: 'requested' },
        requested_authority: AUTHORITY_FIELD, requested_action: { type: 'lower_code', min_length: 1, max_length: 64 },
        scope_hash: HASH_FIELD, expires_at: { type: 'timestamp' },
      },
    ),
  },
  APPROVAL_GRANTED: {
    1: payloadPolicy(
      ['approval_id_hash', 'approval_status'],
      ['grant_reference_hash', 'scope_hash'],
      {
        approval_id_hash: HASH_FIELD, approval_status: { type: 'literal', value: 'granted' },
        grant_reference_hash: HASH_FIELD, scope_hash: HASH_FIELD,
      },
    ),
  },
  APPROVAL_REJECTED: {
    1: payloadPolicy(
      ['approval_id_hash', 'approval_status'],
      ['rejection_reason_code'],
      {
        approval_id_hash: HASH_FIELD, approval_status: { type: 'literal', value: 'rejected' },
        rejection_reason_code: CODE_FIELD,
      },
    ),
  },
  TASK_BLOCKED: {
    1: payloadPolicy(
      ['blocker_code'],
      ['blocker_reference_hash', 'awaiting_user', 'retryable'],
      { blocker_code: CODE_FIELD, blocker_reference_hash: HASH_FIELD, awaiting_user: BOOLEAN_FIELD, retryable: BOOLEAN_FIELD },
    ),
  },
  TASK_PAUSED: {
    1: payloadPolicy(
      ['pause_reason_code'],
      ['resume_after', 'operator_reference_hash'],
      { pause_reason_code: CODE_FIELD, resume_after: { type: 'timestamp' }, operator_reference_hash: HASH_FIELD },
    ),
  },
  TASK_RESUMED: {
    1: payloadPolicy(
      ['resume_reason_code'],
      ['operator_reference_hash'],
      { resume_reason_code: CODE_FIELD, operator_reference_hash: HASH_FIELD },
    ),
  },
  TASK_COMPLETED: {
    1: payloadPolicy(
      ['completion_outcome'],
      ['result_hash', 'verification_hash'],
      {
        completion_outcome: { type: 'enum', values: ['completed', 'rejected', 'duplicate', 'deferred_terminal'] },
        result_hash: HASH_FIELD, verification_hash: HASH_FIELD,
      },
    ),
  },
});

const ACTIVE = new Set(ACTIVE_EVENT_TYPES);
const TERMINAL = new Set(['completed', 'rejected']);
const APPROVAL_REQUEST_ORIGINS = new Set(['created', 'triaged', 'researching', 'planning']);
const SUSPENSION_EVENT_TYPES = new Set(['TASK_PAUSED', 'TASK_BLOCKED']);
const COORDINATION_EVENT_TYPES = new Set(['CARD_CLAIMED', 'LEASE_RENEWED', 'LEASE_RELEASED']);
const TRUSTED_REDUCER_STATES = new WeakSet();

function nextSafeActionFor(status, pendingApproval = null) {
  if (pendingApproval) return 'resolve_approval';
  return {
    none: 'create_task', created: 'evaluate_eligibility', triaged: 'start_research', researching: 'complete_research',
    planning: 'request_approval_or_complete', awaiting_approval: 'resolve_approval', paused: 'resume_or_control',
    blocked: 'resume_or_control', completed: null, rejected: null,
  }[status] ?? null;
}

function freezeReducerState(value) {
  const state = {
    status: value.status,
    pending_approval: value.pending_approval ? Object.freeze({ ...value.pending_approval }) : null,
    used_approval_ids: Object.freeze([...(value.used_approval_ids ?? [])]),
    resolved_approval_ids: Object.freeze([...(value.resolved_approval_ids ?? [])]),
    suspension: value.suspension ? Object.freeze({ ...value.suspension }) : null,
    last_approval_resolution: value.last_approval_resolution
      ? Object.freeze({ ...value.last_approval_resolution }) : null,
    terminal: TERMINAL.has(value.status),
    next_safe_action: nextSafeActionFor(value.status, value.pending_approval),
    authority_ceiling: value.authority_ceiling ?? null,
  };
  Object.freeze(state);
  TRUSTED_REDUCER_STATES.add(state);
  return state;
}

function initialReducerState() {
  return freezeReducerState({
    status: 'none', pending_approval: null, used_approval_ids: [], resolved_approval_ids: [], suspension: null,
    last_approval_resolution: null, authority_ceiling: null,
  });
}

function requireReducerState(currentState) {
  if (currentState == null || currentState === 'none') return initialReducerState();
  if (!currentState || typeof currentState !== 'object' || !TRUSTED_REDUCER_STATES.has(currentState)) {
    codedError('INVALID_REDUCER_STATE');
  }
  return currentState;
}

function codedError(code, message = code) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

export function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

const SHA256_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function assertSha256Hash(value, context = 'hash') {
  if (typeof value !== 'string' || !SHA256_HASH_PATTERN.test(value)) codedError('MALFORMED_HASH', context);
  return value;
}

export const JSON_LIMITS = Object.freeze({
  MAX_JSON_INPUT_BYTES: 16_384,
  MAX_PAYLOAD_DEPTH: 16,
  MAX_PAYLOAD_NODES: 2_048,
  MAX_OBJECT_KEYS: 128,
  MAX_ARRAY_LENGTH: 256,
  MAX_KEY_BYTES: 128,
  MAX_STRING_BYTES: 8_192,
});

const FORBIDDEN_PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const utf8Bytes = (value) => Buffer.byteLength(value, 'utf8');

export function assertWellFormedUnicodeString(value, context = 'value') {
  if (typeof value !== 'string') codedError('PAYLOAD_INVALID');
  const code = context === 'key' ? 'PAYLOAD_KEY_INVALID_UNICODE' : 'PAYLOAD_STRING_INVALID_UNICODE';
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) codedError(code);
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) codedError(code);
  }
  return value;
}

function assertPrintableAsciiKey(key) {
  assertWellFormedUnicodeString(key, 'key');
  for (let index = 0; index < key.length; index += 1) {
    const unit = key.charCodeAt(index);
    if (unit < 0x20 || unit === 0x7f) codedError('PAYLOAD_KEY_CONTROL_CHARACTER_FORBIDDEN');
    if (unit > 0x7e) codedError('PAYLOAD_KEY_NON_ASCII_FORBIDDEN');
  }
}

function assertBoundedString(value, code) {
  assertWellFormedUnicodeString(value, 'value');
  if (utf8Bytes(value) > JSON_LIMITS.MAX_STRING_BYTES) codedError(code);
}

function assertCanonicalNumber(value) {
  if (!Number.isFinite(value)) codedError('NON_FINITE_NUMBER');
  if (Object.is(value, -0)) codedError('NEGATIVE_ZERO_FORBIDDEN');
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) codedError('UNSAFE_INTEGER_NUMBER');
}

export function validateBoundedJsonValue(root) {
  const active = new Set();
  const stack = [{ value: root, depth: 0, exiting: false }];
  let nodes = 0;
  while (stack.length > 0) {
    const frame = stack.pop();
    const { value, depth } = frame;
    if (frame.exiting) {
      active.delete(value);
      continue;
    }
    nodes += 1;
    if (nodes > JSON_LIMITS.MAX_PAYLOAD_NODES) codedError('PAYLOAD_NODE_LIMIT_EXCEEDED');
    if (depth > JSON_LIMITS.MAX_PAYLOAD_DEPTH) codedError('PAYLOAD_DEPTH_EXCEEDED');
    if (value === null || typeof value === 'boolean') continue;
    if (typeof value === 'string') {
      assertBoundedString(value, 'PAYLOAD_STRING_TOO_LONG');
      continue;
    }
    if (typeof value === 'number') {
      assertCanonicalNumber(value);
      continue;
    }
    if (typeof value !== 'object') codedError('PAYLOAD_INVALID');
    if (active.has(value)) codedError('PAYLOAD_INVALID');
    active.add(value);
    stack.push({ value, depth, exiting: true });
    if (Array.isArray(value)) {
      if (value.length > JSON_LIMITS.MAX_ARRAY_LENGTH) codedError('PAYLOAD_ARRAY_LIMIT_EXCEEDED');
      if (Object.keys(value).length !== value.length) codedError('PAYLOAD_INVALID');
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) codedError('PAYLOAD_INVALID');
        stack.push({ value: value[index], depth: depth + 1, exiting: false });
      }
      continue;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) codedError('PAYLOAD_INVALID');
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== 'string')) codedError('PAYLOAD_INVALID');
    if (ownKeys.length > JSON_LIMITS.MAX_OBJECT_KEYS) codedError('PAYLOAD_OBJECT_KEY_LIMIT_EXCEEDED');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of ownKeys) {
      assertPrintableAsciiKey(key);
      if (utf8Bytes(key) > JSON_LIMITS.MAX_KEY_BYTES) codedError('PAYLOAD_KEY_TOO_LONG');
      if (FORBIDDEN_PROTOTYPE_KEYS.has(key)) codedError('PROTOTYPE_JSON_KEY_FORBIDDEN');
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) codedError('PAYLOAD_INVALID');
      stack.push({ value: descriptor.value, depth: depth + 1, exiting: false });
    }
  }
  return root;
}

function parseError(code) {
  codedError(code);
}

export function parseStrictBoundedJson(text) {
  if (typeof text !== 'string') parseError('INVALID_JSON');
  if (utf8Bytes(text) > JSON_LIMITS.MAX_JSON_INPUT_BYTES) parseError('JSON_INPUT_TOO_LARGE');
  let index = 0;
  let nodes = 0;
  const whitespace = () => { while (index < text.length && /[\x20\x09\x0a\x0d]/.test(text[index])) index += 1; };
  const countNode = (depth) => {
    nodes += 1;
    if (nodes > JSON_LIMITS.MAX_PAYLOAD_NODES) parseError('PAYLOAD_NODE_LIMIT_EXCEEDED');
    if (depth > JSON_LIMITS.MAX_PAYLOAD_DEPTH) parseError('PAYLOAD_DEPTH_EXCEEDED');
  };
  const parseString = (isKey = false) => {
    if (text[index] !== '"') parseError('INVALID_JSON');
    index += 1;
    let result = '';
    while (index < text.length) {
      const character = text[index++];
      if (character === '"') {
        assertWellFormedUnicodeString(result, isKey ? 'key' : 'value');
        if (isKey) assertPrintableAsciiKey(result);
        const bytes = utf8Bytes(result);
        if (isKey && bytes > JSON_LIMITS.MAX_KEY_BYTES) parseError('PAYLOAD_KEY_TOO_LONG');
        if (!isKey && bytes > JSON_LIMITS.MAX_STRING_BYTES) parseError('PAYLOAD_STRING_TOO_LONG');
        return result;
      }
      if (character.charCodeAt(0) < 0x20) parseError('INVALID_JSON');
      if (character !== '\\') {
        result += character;
        continue;
      }
      if (index >= text.length) parseError('INVALID_JSON');
      const escape = text[index++];
      const simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (Object.hasOwn(simple, escape)) {
        result += simple[escape];
        continue;
      }
      if (escape !== 'u' || !/^[0-9a-fA-F]{4}$/.test(text.slice(index, index + 4))) parseError('INVALID_JSON');
      const first = Number.parseInt(text.slice(index, index + 4), 16);
      index += 4;
      if (first >= 0xd800 && first <= 0xdbff) {
        if (text.slice(index, index + 2) !== '\\u' || !/^[0-9a-fA-F]{4}$/.test(text.slice(index + 2, index + 6))) parseError('INVALID_JSON');
        const second = Number.parseInt(text.slice(index + 2, index + 6), 16);
        if (second < 0xdc00 || second > 0xdfff) parseError('INVALID_JSON');
        result += String.fromCodePoint(0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00));
        index += 6;
      } else {
        if (first >= 0xdc00 && first <= 0xdfff) parseError('INVALID_JSON');
        result += String.fromCharCode(first);
      }
    }
    parseError('INVALID_JSON');
  };
  const parseValue = (depth) => {
    countNode(depth);
    whitespace();
    const character = text[index];
    if (character === '"') return parseString();
    if (character === '{') {
      index += 1;
      const object = Object.create(null);
      const keys = new Set();
      whitespace();
      if (text[index] === '}') { index += 1; return object; }
      let keyCount = 0;
      while (true) {
        whitespace();
        const key = parseString(true);
        if (FORBIDDEN_PROTOTYPE_KEYS.has(key)) parseError('PROTOTYPE_JSON_KEY_FORBIDDEN');
        if (keys.has(key)) parseError('DUPLICATE_JSON_KEY');
        keys.add(key);
        keyCount += 1;
        if (keyCount > JSON_LIMITS.MAX_OBJECT_KEYS) parseError('PAYLOAD_OBJECT_KEY_LIMIT_EXCEEDED');
        whitespace();
        if (text[index++] !== ':') parseError('INVALID_JSON');
        object[key] = parseValue(depth + 1);
        whitespace();
        const delimiter = text[index++];
        if (delimiter === '}') return object;
        if (delimiter !== ',') parseError('INVALID_JSON');
        whitespace();
        if (text[index] === '}') parseError('INVALID_JSON');
      }
    }
    if (character === '[') {
      index += 1;
      const array = [];
      whitespace();
      if (text[index] === ']') { index += 1; return array; }
      while (true) {
        if (array.length >= JSON_LIMITS.MAX_ARRAY_LENGTH) parseError('PAYLOAD_ARRAY_LIMIT_EXCEEDED');
        array.push(parseValue(depth + 1));
        whitespace();
        const delimiter = text[index++];
        if (delimiter === ']') return array;
        if (delimiter !== ',') parseError('INVALID_JSON');
        whitespace();
        if (text[index] === ']') parseError('INVALID_JSON');
      }
    }
    const remainder = text.slice(index);
    const literal = remainder.match(/^(true|false|null)/)?.[1];
    if (literal) {
      index += literal.length;
      return literal === 'true' ? true : literal === 'false' ? false : null;
    }
    const number = remainder.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];
    if (!number) parseError('INVALID_JSON');
    index += number.length;
    const value = Number(number);
    assertCanonicalNumber(value);
    return value;
  };
  whitespace();
  if (index === text.length) parseError('INVALID_JSON');
  const value = parseValue(0);
  whitespace();
  if (index !== text.length) parseError('INVALID_JSON');
  return value;
}

function serializeCanonical(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serializeCanonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${serializeCanonical(value[key])}`).join(',')}}`;
}

export function canonicalize(value) {
  validateBoundedJsonValue(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
    return result;
  }
  return value;
}

export function canonicalJson(value) {
  validateBoundedJsonValue(value);
  return serializeCanonical(value);
}

export function parseStrictUtc(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,9}))?Z$/);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = ''] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || hour > 23 || minute > 59 || second > 59) return null;
  const fractionalNanosecondsText = fractionText.padEnd(9, '0');
  return Object.freeze({
    year, month, day, hour, minute, second,
    fraction: fractionText,
    fractional_nanoseconds: Number(fractionalNanosecondsText || '0'),
    comparison_key: `${yearText}${monthText}${dayText}${hourText}${minuteText}${secondText}${fractionalNanosecondsText}`,
  });
}

export function compareStrictUtc(left, right) {
  const parsedLeft = parseStrictUtc(left);
  const parsedRight = parseStrictUtc(right);
  if (!parsedLeft || !parsedRight) codedError('INVALID_TIMESTAMP');
  if (parsedLeft.comparison_key < parsedRight.comparison_key) return -1;
  if (parsedLeft.comparison_key > parsedRight.comparison_key) return 1;
  return 0;
}

function strictUtcNanoseconds(value) {
  const parsed = parseStrictUtc(value);
  if (!parsed) codedError('INVALID_TIMESTAMP');
  const wholeSecond = `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}T${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}:${String(parsed.second).padStart(2, '0')}Z`;
  const milliseconds = Date.parse(wholeSecond);
  if (!Number.isFinite(milliseconds)) codedError('INVALID_TIMESTAMP');
  return (BigInt(milliseconds) * 1_000_000n) + BigInt(parsed.fractional_nanoseconds);
}

export function assertExactLeaseDuration(start, end, requestedSeconds) {
  if (!Number.isSafeInteger(requestedSeconds) || requestedSeconds < 30 || requestedSeconds > 900) {
    codedError('LEASE_DURATION_MISMATCH');
  }
  const interval = strictUtcNanoseconds(end) - strictUtcNanoseconds(start);
  if (interval <= 0n || interval % 1_000_000_000n !== 0n
    || interval / 1_000_000_000n !== BigInt(requestedSeconds)) codedError('LEASE_DURATION_MISMATCH');
  return requestedSeconds;
}

export function deriveClaimSelectionBasis({ taskId, creationEvent, eligibilityEvent, scoreEvent }) {
  if (!creationEvent || creationEvent.event_type !== 'TASK_CREATED'
    || !eligibilityEvent || eligibilityEvent.event_type !== 'CARD_ELIGIBILITY_EVALUATED'
    || !scoreEvent || scoreEvent.event_type !== 'CARD_SCORED') codedError('CLAIM_EVIDENCE_EVENT_TYPE_MISMATCH');
  const creation = validateEventPayload('TASK_CREATED', creationEvent.event_version ?? 1, creationEvent.payload);
  const eligibility = validateEventPayload('CARD_ELIGIBILITY_EVALUATED', eligibilityEvent.event_version ?? 1, eligibilityEvent.payload);
  const score = validateEventPayload('CARD_SCORED', scoreEvent.event_version ?? 1, scoreEvent.payload);
  if (creation.task_id !== taskId) codedError('CLAIM_EVIDENCE_IDENTITY_MISMATCH');
  if (eligibility.eligible !== true) codedError('CLAIM_EVIDENCE_INELIGIBLE');
  if (eligibility.card_snapshot_hash !== score.card_snapshot_hash) codedError('CLAIM_EVIDENCE_SNAPSHOT_MISMATCH');
  const material = {
    domain: 'kanban_autonomy_selection_basis.v2',
    coordination_policy_version: COORDINATION_STATE_POLICY_VERSION,
    task_id: taskId,
    board_slug_hash: creation.board_slug_hash,
    kanban_card_id_hash: creation.kanban_card_id_hash,
    source_identity_hash: creation.source_identity_hash,
    task_policy_version: creation.policy_version,
    eligibility_event_id: eligibilityEvent.event_id,
    eligibility_event_hash: eligibilityEvent.event_hash,
    eligibility_policy_evidence: {
      eligibility_policy_version: eligibility.eligibility_policy_version,
      eligible: eligibility.eligible,
      reason_codes: eligibility.reason_codes,
      evidence_hashes: eligibility.evidence_hashes ?? [],
    },
    scoring_event_id: scoreEvent.event_id,
    scoring_event_hash: scoreEvent.event_hash,
    scoring_policy_evidence: {
      scoring_policy_version: score.scoring_policy_version,
      score_basis_points: score.score_basis_points,
      factor_evidence_hash: score.factor_evidence_hash ?? null,
      explanation_codes: score.explanation_codes ?? [],
    },
    card_snapshot_hash: score.card_snapshot_hash,
  };
  return Object.freeze({
    material: deepFreeze(material),
    selection_basis_hash: `sha256:${sha256Hex(canonicalJson(material))}`,
    card_snapshot_hash: score.card_snapshot_hash,
  });
}

export function normalizeBoardSlug(value) {
  if (typeof value !== 'string') codedError('INVALID_BOARD_SLUG');
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(normalized) || normalized.includes('--')) codedError('INVALID_BOARD_SLUG');
  return normalized;
}

export function normalizeStableId(value, field = 'identifier') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) codedError('INVALID_IDENTIFIER', field);
  return value;
}

export function durableTaskId(boardSlug, kanbanCardId) {
  const board = normalizeBoardSlug(boardSlug);
  const card = normalizeStableId(kanbanCardId, 'kanbanCardId');
  return `kt_${sha256Hex(canonicalJson({ board_slug: board, kanban_card_id: card })).slice(0, 24)}`;
}

export function authorityWithinCeiling(level, ceiling) {
  const levelIndex = AUTHORITY_LEVELS.indexOf(level);
  const ceilingIndex = AUTHORITY_LEVELS.indexOf(ceiling);
  if (levelIndex < 0 || ceilingIndex < 0) codedError('INVALID_AUTHORITY_LEVEL');
  return levelIndex <= ceilingIndex;
}

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const LOWER_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const TASK_ID_PATTERN = /^kt_[a-f0-9]{24}$/;

function semanticPayloadError() {
  codedError('EVENT_PAYLOAD_INVALID');
}

function validateSemanticField(value, descriptor) {
  if (descriptor.type === 'hash') {
    assertSha256Hash(value, 'event payload hash');
  } else if (descriptor.type === 'task_id') {
    if (typeof value !== 'string' || !TASK_ID_PATTERN.test(value)) semanticPayloadError();
  } else if (descriptor.type === 'token') {
    if (typeof value !== 'string' || value.length < descriptor.min_length || value.length > descriptor.max_length
      || !TOKEN_PATTERN.test(value)) semanticPayloadError();
  } else if (descriptor.type === 'code') {
    if (typeof value !== 'string' || value.length < descriptor.min_length || value.length > descriptor.max_length
      || !CODE_PATTERN.test(value)) semanticPayloadError();
  } else if (descriptor.type === 'lower_code') {
    if (typeof value !== 'string' || value.length < descriptor.min_length || value.length > descriptor.max_length
      || !LOWER_CODE_PATTERN.test(value)) semanticPayloadError();
  } else if (descriptor.type === 'authority') {
    if (!AUTHORITY_LEVELS.includes(value)) semanticPayloadError();
  } else if (descriptor.type === 'boolean') {
    if (typeof value !== 'boolean') semanticPayloadError();
  } else if (descriptor.type === 'integer') {
    if (!Number.isSafeInteger(value) || value < descriptor.minimum || value > descriptor.maximum) semanticPayloadError();
  } else if (descriptor.type === 'enum') {
    if (typeof value !== 'string' || !descriptor.values.includes(value)) semanticPayloadError();
  } else if (descriptor.type === 'literal') {
    if (value !== descriptor.value) semanticPayloadError();
  } else if (descriptor.type === 'timestamp') {
    if (!parseStrictUtc(value)) semanticPayloadError();
  } else if (descriptor.type === 'code_array') {
    if (!Array.isArray(value) || value.length > descriptor.max_items) semanticPayloadError();
    const seen = new Set();
    for (const item of value) {
      if (typeof item !== 'string' || item.length < 1 || item.length > descriptor.max_item_length
        || !CODE_PATTERN.test(item) || seen.has(item)) semanticPayloadError();
      seen.add(item);
    }
  } else if (descriptor.type === 'hash_array') {
    if (!Array.isArray(value) || value.length > descriptor.max_items) semanticPayloadError();
    const seen = new Set();
    for (const item of value) {
      assertSha256Hash(item, 'event payload hash array member');
      if (seen.has(item)) semanticPayloadError();
      seen.add(item);
    }
  } else semanticPayloadError();
}

export function validateEventPayload(eventType, eventVersion, payload) {
  if (!ACTIVE.has(eventType)) codedError('UNKNOWN_EVENT_TYPE');
  const policy = EVENT_PAYLOAD_POLICIES[eventType]?.[eventVersion];
  if (!policy) codedError('UNSUPPORTED_EVENT_PAYLOAD_POLICY');
  validateEventVersion(eventType, eventVersion);
  if (COORDINATION_EVENT_TYPES.has(eventType)
    && payload?.coordination_policy_version !== COORDINATION_STATE_POLICY_VERSION) {
    codedError('COORDINATION_POLICY_VERSION_MISMATCH');
  }
  try {
    validateBoundedJsonValue(payload);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) semanticPayloadError();
    const keys = Object.keys(payload);
    const allowed = new Set([...policy.required_keys, ...policy.optional_keys]);
    if (policy.required_keys.some((key) => !Object.hasOwn(payload, key))) semanticPayloadError();
    if (keys.some((key) => !allowed.has(key))) semanticPayloadError();
    for (const key of keys) validateSemanticField(payload[key], policy.fields[key]);
    if (policy.cross_field_rules.includes('eligible_requires_empty_reason_codes')
      && payload.eligible === true && payload.reason_codes.length !== 0) semanticPayloadError();
    const safe = Object.create(null);
    for (const key of keys.slice().sort()) {
      safe[key] = Array.isArray(payload[key]) ? Object.freeze([...payload[key]]) : payload[key];
    }
    return Object.freeze(safe);
  } catch (error) {
    if (error?.code === 'UNKNOWN_EVENT_TYPE' || error?.code === 'UNSUPPORTED_EVENT_VERSION'
      || error?.code === 'MALFORMED_HASH'
      || error?.code === 'UNSUPPORTED_EVENT_PAYLOAD_POLICY') throw error;
    semanticPayloadError();
  }
}

function invalidTransition(eventType, status) {
  codedError('INVALID_EVENT_TRANSITION', `${eventType} from ${status}`);
}

function approvalResolution(state, event, result) {
  const approvalHash = event.payload.approval_id_hash;
  if (!state.pending_approval) {
    if (state.resolved_approval_ids.includes(approvalHash)) codedError('APPROVAL_ALREADY_RESOLVED');
    codedError('APPROVAL_REQUEST_NOT_PENDING');
  }
  if (state.pending_approval.approval_id_hash !== approvalHash) {
    if (state.resolved_approval_ids.includes(approvalHash)) codedError('APPROVAL_ALREADY_RESOLVED');
    codedError('APPROVAL_REFERENCE_MISMATCH');
  }
  if (state.resolved_approval_ids.includes(approvalHash)) codedError('APPROVAL_ALREADY_RESOLVED');
  if (state.suspension && state.suspension.return_status !== 'awaiting_approval') {
    codedError('APPROVAL_REQUEST_NOT_PENDING');
  }
  if (!state.suspension && state.status !== 'awaiting_approval') codedError('APPROVAL_REQUEST_NOT_PENDING');
  if (result === 'granted' && state.pending_approval.expires_at) {
    if (!parseStrictUtc(event.occurred_at)) codedError('INVALID_TIMESTAMP');
    if (compareStrictUtc(event.occurred_at, state.pending_approval.expires_at) > 0) codedError('APPROVAL_EXPIRED');
  }
  const resolution = {
    approval_id_hash: approvalHash,
    result,
    requested_authority: state.pending_approval.requested_authority,
    requested_action: state.pending_approval.requested_action,
    request_event_id: state.pending_approval.request_event_id,
    resolution_event_id: event.event_id ?? null,
  };
  const resolvedIds = [...state.resolved_approval_ids, approvalHash];
  if (result === 'rejected') {
    return freezeReducerState({ ...state, status: 'rejected', pending_approval: null, resolved_approval_ids: resolvedIds,
      suspension: null, last_approval_resolution: resolution });
  }
  if (state.suspension) {
    return freezeReducerState({
      ...state,
      pending_approval: null,
      resolved_approval_ids: resolvedIds,
      suspension: { ...state.suspension, return_status: state.pending_approval.return_status },
      last_approval_resolution: resolution,
    });
  }
  return freezeReducerState({ ...state, status: state.pending_approval.return_status, pending_approval: null,
    resolved_approval_ids: resolvedIds, last_approval_resolution: resolution });
}

export function reduceTaskState(currentState, event) {
  const state = requireReducerState(currentState);
  if (!ACTIVE.has(event?.event_type)) codedError('UNKNOWN_EVENT_TYPE');
  validateEventVersion(event.event_type, event.event_version);
  const payload = validateEventPayload(event.event_type, event.event_version, event.payload);
  const eventType = event.event_type;

  if (COORDINATION_EVENT_TYPES.has(eventType)) {
    if (event.actor_type !== 'worker' || event.actor_id_hash !== (payload.claimant_id_hash ?? event.actor_id_hash)
      || event.worker_id !== (payload.worker_session_id ?? event.worker_id) || event.authority_level !== 'A0'
      || event.lease_id !== payload.lease_id || !Number.isSafeInteger(event.fencing_token) || event.fencing_token < 1) {
      codedError('COORDINATION_EVENT_ENVELOPE_INVALID');
    }
    const payloadTimestamp = eventType === 'CARD_CLAIMED' ? payload.lease_started_at
      : eventType === 'LEASE_RENEWED' ? payload.renewed_at : payload.released_at;
    if (event.occurred_at !== payloadTimestamp) codedError('COORDINATION_EVENT_TIMESTAMP_MISMATCH');
    if (eventType === 'CARD_CLAIMED') {
      if (!['triaged', 'researching', 'planning'].includes(state.status) || state.pending_approval || state.suspension) {
        codedError('CLAIM_STATE_INVALID');
      }
      assertExactLeaseDuration(payload.lease_started_at, payload.lease_expires_at,
        payload.requested_duration_seconds);
    }
    return state;
  }

  if (eventType === 'APPROVAL_REQUESTED') {
    if (state.pending_approval) codedError('APPROVAL_ALREADY_PENDING');
    if (state.suspension || !APPROVAL_REQUEST_ORIGINS.has(state.status)) codedError('APPROVAL_REQUEST_INVALID_STATE');
    if (state.used_approval_ids.includes(payload.approval_id_hash)) codedError('APPROVAL_ID_REUSE_FORBIDDEN');
    if (!authorityWithinCeiling(payload.requested_authority, state.authority_ceiling)) {
      codedError('APPROVAL_REQUEST_EXCEEDS_AUTHORITY_CEILING');
    }
    return freezeReducerState({
      ...state,
      status: 'awaiting_approval',
      used_approval_ids: [...state.used_approval_ids, payload.approval_id_hash],
      pending_approval: {
        approval_id_hash: payload.approval_id_hash,
        requested_authority: payload.requested_authority,
        requested_action: payload.requested_action,
        request_event_id: event.event_id ?? null,
        return_status: state.status,
        expires_at: payload.expires_at ?? null,
      },
    });
  }

  if (eventType === 'APPROVAL_GRANTED') return approvalResolution(state, { ...event, payload }, 'granted');
  if (eventType === 'APPROVAL_REJECTED') return approvalResolution(state, { ...event, payload }, 'rejected');

  if (state.terminal) {
    if (eventType === 'TASK_RESUMED') codedError('TASK_RESUME_INVALID');
    invalidTransition(eventType, state.status);
  }

  if (SUSPENSION_EVENT_TYPES.has(eventType)) {
    if (state.suspension) codedError('TASK_ALREADY_SUSPENDED');
    if (state.status === 'none') invalidTransition(eventType, state.status);
    const kind = eventType === 'TASK_PAUSED' ? 'paused' : 'blocked';
    return freezeReducerState({
      ...state,
      status: kind,
      suspension: {
        kind,
        return_status: state.status,
        source_event_id: event.event_id ?? null,
        awaiting_user: kind === 'blocked' ? (payload.awaiting_user ?? false) : false,
      },
    });
  }

  if (eventType === 'TASK_RESUMED') {
    if (!state.suspension) codedError('TASK_NOT_SUSPENDED');
    if (state.pending_approval && state.suspension.return_status !== 'awaiting_approval') codedError('TASK_RESUME_INVALID');
    if (!state.pending_approval && state.suspension.return_status === 'awaiting_approval') codedError('TASK_RESUME_INVALID');
    return freezeReducerState({ ...state, status: state.suspension.return_status, suspension: null });
  }

  if (state.pending_approval) codedError('PENDING_APPROVAL_UNRESOLVED');
  if (state.suspension || state.status === 'paused' || state.status === 'blocked') {
    codedError('TASK_ALREADY_SUSPENDED');
  }

  let nextStatus;
  if (eventType === 'TASK_CREATED' && state.status === 'none') nextStatus = 'created';
  else if (eventType === 'CARD_ELIGIBILITY_EVALUATED' && ['created', 'triaged'].includes(state.status)) nextStatus = 'triaged';
  else if (eventType === 'CARD_SCORED' && state.status === 'triaged') nextStatus = 'triaged';
  else if (eventType === 'RESEARCH_STARTED' && state.status === 'triaged') nextStatus = 'researching';
  else if (eventType === 'RESEARCH_COMPLETED' && state.status === 'researching') nextStatus = 'planning';
  else if (eventType === 'PLAN_CREATED' && state.status === 'planning') nextStatus = 'planning';
  else if (eventType === 'TASK_COMPLETED' && ['triaged', 'researching', 'planning'].includes(state.status)) nextStatus = 'completed';
  else invalidTransition(eventType, state.status);

  const authorityCeiling = eventType === 'TASK_CREATED' ? payload.authority_ceiling : state.authority_ceiling;
  return freezeReducerState({ ...state, status: nextStatus, authority_ceiling: authorityCeiling });
}

export function replayEvents(events) {
  return replayTask(events).status;
}

function coordinationStatus(coordination, asOf) {
  if (!coordination) return 'none';
  if (coordination.released_at !== null) return 'released';
  return compareStrictUtc(asOf, coordination.lease_expires_at) < 0 ? 'active' : 'expired';
}

export function replayTask(events, { asOf } = {}) {
  if (!Array.isArray(events)) codedError('INVALID_REPLAY_INPUT');
  if (asOf !== undefined) {
    if (!parseStrictUtc(asOf)) codedError('INVALID_TIMESTAMP');
    for (const event of events) if (!parseStrictUtc(event?.occurred_at)) codedError('INVALID_TIMESTAMP');
    const visible = events.filter((event) => compareStrictUtc(event.occurred_at, asOf) <= 0);
    if (visible.length !== events.length) return replayTask(visible, { asOf });
  }
  let state = null;
  let coordination = null;
  let creationEvent = null;
  let previousOccurredAt = null;
  const priorEventsById = new Map();
  const allEventPositions = new Map();
  const usedLeaseIds = new Set();
  events.forEach((event, index) => {
    if (typeof event?.event_id === 'string') {
      if (allEventPositions.has(event.event_id)) codedError('DUPLICATE_EVENT_ID');
      allEventPositions.set(event.event_id, index);
    }
  });
  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const event = events[eventIndex];
    if (!parseStrictUtc(event?.occurred_at)) codedError('INVALID_TIMESTAMP');
    if (previousOccurredAt !== null && compareStrictUtc(event.occurred_at, previousOccurredAt) < 0) {
      codedError('EVENT_TIMESTAMP_REGRESSION');
    }
    state = reduceTaskState(state, event);
    if (event.event_type === 'TASK_CREATED') creationEvent = event;
    if (event.event_type === 'CARD_CLAIMED') {
      const priorStatus = coordination ? coordinationStatus(coordination, event.occurred_at) : 'none';
      const expectedReason = priorStatus === 'none' ? 'INITIAL'
        : priorStatus === 'released' ? 'REACQUIRED_AFTER_RELEASE' : 'EXPIRED_TAKEOVER';
      if (priorStatus === 'active' || event.payload.claim_reason !== expectedReason
        || event.fencing_token !== (coordination?.lease_generation ?? 0) + 1) {
        codedError('COORDINATION_REPLAY_INVALID');
      }
      if (usedLeaseIds.has(event.payload.lease_id)) codedError('LEASE_ID_REUSE_FORBIDDEN');
      const evidenceEvent = (eventId, expectedType) => {
        const evidence = priorEventsById.get(eventId);
        if (!evidence) {
          if ((allEventPositions.get(eventId) ?? -1) >= eventIndex) codedError('CLAIM_EVIDENCE_EVENT_NOT_PRIOR');
          codedError('CLAIM_EVIDENCE_EVENT_MISSING');
        }
        if (evidence.event_type !== expectedType) codedError('CLAIM_EVIDENCE_EVENT_TYPE_MISMATCH');
        return evidence;
      };
      const eligibilityEvent = evidenceEvent(event.payload.eligibility_event_id, 'CARD_ELIGIBILITY_EVALUATED');
      const scoreEvent = evidenceEvent(event.payload.score_event_id, 'CARD_SCORED');
      const selection = deriveClaimSelectionBasis({
        taskId: creationEvent?.payload?.task_id,
        creationEvent,
        eligibilityEvent,
        scoreEvent,
      });
      if (event.payload.card_snapshot_hash !== selection.card_snapshot_hash) {
        codedError('CLAIM_EVIDENCE_SNAPSHOT_MISMATCH');
      }
      if (event.payload.selection_basis_hash !== selection.selection_basis_hash) {
        codedError('CLAIM_SELECTION_BASIS_MISMATCH');
      }
      assertExactLeaseDuration(event.payload.lease_started_at, event.payload.lease_expires_at,
        event.payload.requested_duration_seconds);
      usedLeaseIds.add(event.payload.lease_id);
      coordination = {
        lease_generation: event.fencing_token, fencing_token: event.fencing_token,
        lease_id: event.payload.lease_id, claimant_id_hash: event.payload.claimant_id_hash,
        worker_session_id: event.payload.worker_session_id, lease_started_at: event.payload.lease_started_at,
        lease_expires_at: event.payload.lease_expires_at, released_at: null, release_reason: null,
        last_coordination_event_id: event.event_id ?? null, last_coordination_event_hash: event.event_hash ?? null,
      };
    } else if (event.event_type === 'LEASE_RENEWED') {
      assertExactLeaseDuration(event.payload.renewed_at, event.payload.lease_expires_at,
        event.payload.requested_duration_seconds);
      if (!coordination || coordinationStatus(coordination, event.occurred_at) !== 'active'
        || event.payload.lease_id !== coordination.lease_id || event.fencing_token !== coordination.fencing_token
        || event.actor_id_hash !== coordination.claimant_id_hash || event.worker_id !== coordination.worker_session_id
        || event.payload.previous_expires_at !== coordination.lease_expires_at
        || compareStrictUtc(event.payload.lease_expires_at, coordination.lease_expires_at) <= 0) {
        codedError('COORDINATION_REPLAY_INVALID');
      }
      coordination = { ...coordination, lease_expires_at: event.payload.lease_expires_at,
        last_coordination_event_id: event.event_id ?? null, last_coordination_event_hash: event.event_hash ?? null };
    } else if (event.event_type === 'LEASE_RELEASED') {
      if (!coordination || coordinationStatus(coordination, event.occurred_at) !== 'active'
        || event.payload.lease_id !== coordination.lease_id || event.fencing_token !== coordination.fencing_token
        || event.actor_id_hash !== coordination.claimant_id_hash || event.worker_id !== coordination.worker_session_id) {
        codedError('COORDINATION_REPLAY_INVALID');
      }
      coordination = { ...coordination, released_at: event.payload.released_at,
        release_reason: event.payload.reason_code, last_coordination_event_id: event.event_id ?? null,
        last_coordination_event_hash: event.event_hash ?? null };
    }
    if (typeof event.event_id === 'string') priorEventsById.set(event.event_id, event);
    previousOccurredAt = event.occurred_at;
  }
  const workflow = state ?? initialReducerState();
  const explicitAsOf = asOf ?? previousOccurredAt;
  if (explicitAsOf !== null && !parseStrictUtc(explicitAsOf)) codedError('INVALID_TIMESTAMP');
  const projected = coordination ? Object.freeze({ ...coordination,
    status: coordinationStatus(coordination, explicitAsOf ?? coordination.lease_started_at) }) : Object.freeze({ status: 'none' });
  return Object.freeze({ status: workflow.status, workflow, coordination: projected });
}

export function projectCoordinationAt(events, asOf) {
  if (!parseStrictUtc(asOf)) codedError('INVALID_TIMESTAMP');
  return replayTask(events, { asOf }).coordination;
}

export function projectTaskStateToKanban({ taskState, currentCardStatus }) {
  if (typeof taskState !== 'string' || typeof currentCardStatus !== 'string') codedError('INVALID_PROJECTION_INPUT');
  const desired = {
    created: 'triage', triaged: 'triage', researching: 'in_progress', planning: 'in_progress',
    awaiting_approval: 'awaiting_approval', blocked: 'blocked', paused: 'paused', completed: 'done', rejected: 'rejected',
  }[taskState];
  if (!desired) codedError('INVALID_PROJECTION_INPUT');
  const required = desired !== currentCardStatus;
  return Object.freeze({
    task_state: taskState,
    current_card_status: currentCardStatus,
    desired_status: desired,
    reason_codes: required ? ['DURABLE_STATE_PROJECTION_DIFFERS'] : ['PROJECTION_ALREADY_ALIGNED'],
    projection_required: required,
    projection_performed: false,
    kanban_write: false,
    approval_inferred_from_card_status: false,
    authority_changed: false,
  });
}

export function validateEventVersion(eventType, eventVersion) {
  if (!ACTIVE.has(eventType)) codedError('UNKNOWN_EVENT_TYPE');
  if (!Number.isSafeInteger(eventVersion) || SUPPORTED_EVENT_VERSIONS[eventType] !== eventVersion) {
    codedError('UNSUPPORTED_EVENT_VERSION');
  }
  return eventVersion;
}

export function isActiveEventType(value) {
  return ACTIVE.has(value);
}
