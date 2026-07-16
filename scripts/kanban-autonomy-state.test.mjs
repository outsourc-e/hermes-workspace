import { describe, expect, test } from 'vitest';
import {
  ACTIVE_EVENT_TYPES, EVENT_PAYLOAD_POLICIES, JSON_LIMITS, RESERVED_EVENT_TYPES, STATE_POLICY_VERSION,
  SUPPORTED_EVENT_VERSIONS, assertSha256Hash, assertWellFormedUnicodeString, authorityWithinCeiling, canonicalJson,
  compareStrictUtc, durableTaskId, normalizeBoardSlug, parseStrictBoundedJson, parseStrictUtc, projectTaskStateToKanban,
  reduceTaskState, replayEvents, validateBoundedJsonValue, validateEventPayload, validateEventVersion,
} from './kanban-autonomy-state.mjs';

const hash = `sha256:${'a'.repeat(64)}`;
const otherHash = `sha256:${'b'.repeat(64)}`;
const EVENT_PAYLOADS = Object.freeze({
  TASK_CREATED: {
    task_id: `kt_${'a'.repeat(24)}`, board_slug_hash: hash, kanban_card_id_hash: otherHash,
    source_identity_hash: hash, initial_card_snapshot_hash: otherHash, authority_ceiling: 'A1',
    creation_idempotency_key_hash: hash, policy_version: 'fixture-policy.v1',
  },
  CARD_ELIGIBILITY_EVALUATED: {
    card_snapshot_hash: hash, eligibility_policy_version: 'fixture-eligibility.v1', eligible: true, reason_codes: [],
  },
  CARD_SCORED: { card_snapshot_hash: hash, scoring_policy_version: 'fixture-scoring.v1', score_basis_points: 7500 },
  RESEARCH_STARTED: { research_run_id_hash: hash, research_policy_version: 'fixture-research.v1' },
  RESEARCH_COMPLETED: { research_run_id_hash: hash, report_hash: otherHash, outcome: 'completed' },
  PLAN_CREATED: { plan_hash: hash, plan_version: 'fixture-plan.v1', next_safe_action: 'request_approval' },
  APPROVAL_REQUESTED: {
    approval_id_hash: hash, approval_status: 'requested', requested_authority: 'A1', requested_action: 'build_fixture',
  },
  APPROVAL_GRANTED: { approval_id_hash: hash, approval_status: 'granted' },
  APPROVAL_REJECTED: { approval_id_hash: hash, approval_status: 'rejected' },
  TASK_BLOCKED: { blocker_code: 'FIXTURE_BLOCKED' },
  TASK_PAUSED: { pause_reason_code: 'FIXTURE_PAUSED' },
  TASK_RESUMED: { resume_reason_code: 'FIXTURE_RESUMED' },
  TASK_COMPLETED: { completion_outcome: 'completed' },
});
const event = (event_type, payload = EVENT_PAYLOADS[event_type], event_version = 1) => ({
  event_type, event_version, payload,
  occurred_at: '2026-07-11T00:00:00Z',
});

const normalFlow = [
  event('TASK_CREATED'),
  event('CARD_ELIGIBILITY_EVALUATED'),
  event('CARD_SCORED'),
  event('RESEARCH_STARTED'),
  event('RESEARCH_COMPLETED'),
  event('PLAN_CREATED'),
  event('APPROVAL_REQUESTED'),
];

describe('canonical identity and serialization', () => {
  test('exports a versioned bounded registry with reserved types inactive', () => {
    expect(STATE_POLICY_VERSION).toBe('kanban_autonomy_state.v1');
    expect(ACTIVE_EVENT_TYPES).toContain('TASK_CREATED');
    expect(RESERVED_EVENT_TYPES).toContain('CARD_CLAIMED');
    expect(ACTIVE_EVENT_TYPES).not.toContain('CARD_CLAIMED');
  });
  test('exports one immutable supported version for every and only active event type', () => {
    expect(SUPPORTED_EVENT_VERSIONS).toEqual(Object.fromEntries(ACTIVE_EVENT_TYPES.map((eventType) => [eventType, 1])));
    expect(Object.keys(SUPPORTED_EVENT_VERSIONS)).toEqual(ACTIVE_EVENT_TYPES);
    expect(Object.isFrozen(SUPPORTED_EVENT_VERSIONS)).toBe(true);
  });
  test.each(ACTIVE_EVENT_TYPES)('accepts the declared version for %s and rejects other versions', (eventType) => {
    expect(validateEventVersion(eventType, SUPPORTED_EVENT_VERSIONS[eventType])).toBe(1);
    for (const unsupported of [0, 2, 1.5, '1', null, undefined]) {
      expect(() => validateEventVersion(eventType, unsupported)).toThrow(/UNSUPPORTED_EVENT_VERSION/);
    }
  });
  test('event-version validation distinguishes unknown and reserved types from unsupported versions', () => {
    expect(() => validateEventVersion('CARD_CLAIMED', 1)).toThrow(/UNKNOWN_EVENT_TYPE/);
    expect(() => validateEventVersion('INVENTED', 1)).toThrow(/UNKNOWN_EVENT_TYPE/);
  });
  test('canonical JSON sorts nested keys and retains array order', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: [3, 1] } })).toBe('{"a":{"x":[3,1],"y":2},"z":1}');
  });
  test('canonical JSON rejects prototypes, undefined and non-finite numbers', () => {
    expect(() => canonicalJson(new Date())).toThrow(/PAYLOAD_INVALID/);
    expect(() => canonicalJson({ bad: undefined })).toThrow(/PAYLOAD_INVALID/);
    expect(() => canonicalJson({ bad: Infinity })).toThrow(/NON_FINITE_NUMBER/);
  });
  test('task ID is deterministic, private-data-free and independent of card text', () => {
    const one = durableTaskId('Fixture_Board', 'card-42');
    const two = durableTaskId('fixture-board', 'card-42');
    expect(one).toBe(two);
    expect(one).toMatch(/^kt_[a-f0-9]{24}$/);
    expect(one).not.toContain('card-42');
  });
  test('same card ID on another board has another task ID', () => {
    expect(durableTaskId('board-one', 'same-card')).not.toBe(durableTaskId('board-two', 'same-card'));
  });
  test('board normalization is conservative', () => {
    expect(normalizeBoardSlug(' Fixture_Board ')).toBe('fixture-board');
    expect(() => normalizeBoardSlug('../bad')).toThrow(/INVALID_BOARD_SLUG/);
    expect(() => normalizeBoardSlug('bad--slug')).toThrow(/INVALID_BOARD_SLUG/);
  });
  test('strict UTC parser rejects offsets, invalid days and loose timestamps', () => {
    expect(parseStrictUtc('2026-07-11T00:00:00Z')).toBeTruthy();
    expect(parseStrictUtc('2026-07-11T00:00:00.123456789Z')).toBeTruthy();
    expect(parseStrictUtc('2026-02-30T00:00:00Z')).toBeNull();
    expect(parseStrictUtc('2026-07-11T10:00:00+10:00')).toBeNull();
    expect(parseStrictUtc('2026-07-11 00:00:00')).toBeNull();
  });
  test('strict UTC parser enforces calendar, year and fractional boundaries', () => {
    expect(parseStrictUtc('0001-01-01T00:00:00Z')).toMatchObject({ year: 1, fractional_nanoseconds: 0 });
    expect(parseStrictUtc('9999-12-31T23:59:59.999999999Z')).toMatchObject({ year: 9999, fractional_nanoseconds: 999999999 });
    for (let digits = 1; digits <= 9; digits += 1) {
      expect(parseStrictUtc(`2024-02-29T23:59:59.${'1'.repeat(digits)}Z`)).toBeTruthy();
    }
    for (const invalid of [
      '0000-01-01T00:00:00Z', '2023-02-29T00:00:00Z', '2026-07-11t00:00:00Z',
      '2026-07-11T00:00:00z', '2026-07-11T00:00:00+00:00', '2026-07-11T00:00:60Z',
      '2026-07-11T00:00:00.1234567890Z',
    ]) expect(parseStrictUtc(invalid)).toBeNull();
  });
  test('strict UTC comparison is exact through nanoseconds and calendar rollover', () => {
    expect(compareStrictUtc('2026-01-01T00:00:00Z', '2026-01-01T00:00:00.0Z')).toBe(0);
    expect(compareStrictUtc('2026-01-01T00:00:00.1Z', '2026-01-01T00:00:00.100000000Z')).toBe(0);
    expect(compareStrictUtc('2026-01-01T00:00:00.01Z', '2026-01-01T00:00:00.1Z')).toBe(-1);
    expect(compareStrictUtc('2026-01-01T00:00:00.9Z', '2026-01-01T00:00:00.10Z')).toBe(1);
    expect(compareStrictUtc('2025-12-31T23:59:59.999999999Z', '2026-01-01T00:00:00Z')).toBe(-1);
    expect(() => compareStrictUtc('0000-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toThrow(/INVALID_TIMESTAMP/);
  });
  test('shared SHA-256 validator accepts only exact persisted syntax without reflecting invalid values', () => {
    expect(assertSha256Hash(hash, 'fixture')).toBe(hash);
    const invalid = [
      `md5:${'a'.repeat(64)}`, `SHA256:${'a'.repeat(64)}`, `sha256:${'A'.repeat(64)}`,
      `sha256:${'a'.repeat(63)}g`, `sha256:${'a'.repeat(63)}`, `sha256:${'a'.repeat(65)}`,
      'a'.repeat(64), ` ${hash}`, `${hash} `, null, { toString: () => hash },
    ];
    for (const value of invalid) {
      try {
        assertSha256Hash(value, 'fixture');
        throw new Error('expected rejection');
      } catch (error) {
        expect(error.code).toBe('MALFORMED_HASH');
        if (typeof value === 'string') expect(error.message).not.toContain(value);
      }
    }
  });
});

describe('versioned state reducer', () => {
  const detailsAfter = (events) => events.reduce((state, item) => reduceTaskState(state, item), null);
  test('normal seven-event flow reconstructs awaiting approval', () => {
    expect(replayEvents(normalFlow)).toBe('awaiting_approval');
  });
  test('approval granted uses only a validated external approval reference', () => {
    const pending = detailsAfter(normalFlow);
    const granted = event('APPROVAL_GRANTED', { approval_id_hash: hash, approval_status: 'granted' });
    expect(reduceTaskState(pending, granted).status).toBe('planning');
    expect(() => reduceTaskState(pending, event('APPROVAL_GRANTED', { approval_status: 'granted' }))).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(() => reduceTaskState(pending, event('APPROVAL_GRANTED', { approval_id_hash: hash, approval_status: 'granted', visual_status: 'approved' }))).toThrow(/EVENT_PAYLOAD_INVALID/);
  });
  test('approval rejected is terminal', () => {
    const rejected = reduceTaskState(detailsAfter(normalFlow), event('APPROVAL_REJECTED', { approval_id_hash: hash, approval_status: 'rejected' }));
    expect(rejected.status).toBe('rejected');
    expect(() => reduceTaskState(rejected, event('TASK_RESUMED'))).toThrow(/TASK_RESUME_INVALID/);
  });
  test('blocked and paused tasks restore the exact prior state', () => {
    const planning = detailsAfter(normalFlow.slice(0, 6));
    const blocked = reduceTaskState(planning, event('TASK_BLOCKED'));
    expect(blocked.status).toBe('blocked');
    expect(reduceTaskState(blocked, event('TASK_RESUMED')).status).toBe('planning');
    const researching = detailsAfter(normalFlow.slice(0, 4));
    const paused = reduceTaskState(researching, event('TASK_PAUSED'));
    expect(paused.status).toBe('paused');
    expect(reduceTaskState(paused, event('TASK_RESUMED')).status).toBe('researching');
  });
  test('completion is terminal without a reopen event', () => {
    const planning = detailsAfter(normalFlow.slice(0, 6));
    const completed = reduceTaskState(planning, event('TASK_COMPLETED'));
    expect(completed.status).toBe('completed');
    expect(() => reduceTaskState(completed, event('TASK_CREATED'))).toThrow(/INVALID_EVENT_TRANSITION/);
  });
  test('unknown and reserved event types fail closed', () => {
    const created = detailsAfter(normalFlow.slice(0, 1));
    expect(() => reduceTaskState(created, event('CARD_CLAIMED'))).toThrow(/UNKNOWN_EVENT_TYPE/);
    expect(() => reduceTaskState(created, event('INVENTED'))).toThrow(/UNKNOWN_EVENT_TYPE/);
  });
  test('invalid transition fails', () => {
    const created = detailsAfter(normalFlow.slice(0, 1));
    expect(() => reduceTaskState(created, event('PLAN_CREATED'))).toThrow(/INVALID_EVENT_TRANSITION/);
    expect(() => reduceTaskState(null, event('RESEARCH_STARTED'))).toThrow(/INVALID_EVENT_TRANSITION/);
  });
});

describe('C4B durable approval linkage and deterministic suspension state', () => {
  const at = (eventType, payload, second, eventId = undefined) => ({
    ...event(eventType, payload), occurred_at: `2026-07-11T00:00:${String(second).padStart(2, '0')}Z`, event_id: eventId,
  });
  const reduceAll = (events) => events.reduce((state, item) => reduceTaskState(state, item), null);
  const prefixFor = (status, authorityCeiling = 'A2') => {
    const created = at('TASK_CREATED', { ...EVENT_PAYLOADS.TASK_CREATED, authority_ceiling: authorityCeiling }, 0, 'ke_created');
    if (status === 'created') return [created];
    const triaged = at('CARD_ELIGIBILITY_EVALUATED', EVENT_PAYLOADS.CARD_ELIGIBILITY_EVALUATED, 1, 'ke_triaged');
    if (status === 'triaged') return [created, triaged];
    const researching = at('RESEARCH_STARTED', EVENT_PAYLOADS.RESEARCH_STARTED, 2, 'ke_researching');
    if (status === 'researching') return [created, triaged, researching];
    const planning = at('RESEARCH_COMPLETED', EVENT_PAYLOADS.RESEARCH_COMPLETED, 3, 'ke_planning');
    return [created, triaged, researching, planning];
  };
  const request = (approvalIdHash = hash, authority = 'A2', second = 4, extra = {}) => at('APPROVAL_REQUESTED', {
    ...EVENT_PAYLOADS.APPROVAL_REQUESTED, approval_id_hash: approvalIdHash, requested_authority: authority, ...extra,
  }, second, `ke_request_${second}`);
  const grant = (approvalIdHash = hash, second = 5) => at('APPROVAL_GRANTED', {
    ...EVENT_PAYLOADS.APPROVAL_GRANTED, approval_id_hash: approvalIdHash,
  }, second, `ke_grant_${second}`);
  const reject = (approvalIdHash = hash, second = 5) => at('APPROVAL_REJECTED', {
    ...EVENT_PAYLOADS.APPROVAL_REJECTED, approval_id_hash: approvalIdHash,
  }, second, `ke_reject_${second}`);

  test.each(['created', 'triaged', 'researching', 'planning'])('requests approval from allowed state %s and records exact return state', (status) => {
    const state = reduceAll([...prefixFor(status), request()]);
    expect(state).toMatchObject({ status: 'awaiting_approval', authority_ceiling: 'A2', terminal: false });
    expect(state.pending_approval).toMatchObject({ approval_id_hash: hash, requested_authority: 'A2', return_status: status });
  });

  test('requested authority may equal or stay below the immutable ceiling but never exceed it', () => {
    expect(reduceAll([...prefixFor('planning'), request(hash, 'A2')]).authority_ceiling).toBe('A2');
    expect(reduceAll([...prefixFor('planning'), request(hash, 'A1')]).authority_ceiling).toBe('A2');
    expect(() => reduceAll([...prefixFor('planning'), request(hash, 'A3')]))
      .toThrow(/APPROVAL_REQUEST_EXCEEDS_AUTHORITY_CEILING/);
  });

  test('a second pending request and every later reuse of its ID fail closed', () => {
    const pending = reduceAll([...prefixFor('planning'), request()]);
    expect(() => reduceTaskState(pending, request(otherHash, 'A1', 5))).toThrow(/APPROVAL_ALREADY_PENDING/);
    const resolved = reduceTaskState(pending, grant());
    expect(() => reduceTaskState(resolved, request(hash, 'A1', 6))).toThrow(/APPROVAL_ID_REUSE_FORBIDDEN/);
  });

  test('grant and rejection require the exact current request and cannot resolve twice', () => {
    const planning = reduceAll(prefixFor('planning'));
    expect(() => reduceTaskState(planning, grant())).toThrow(/APPROVAL_REQUEST_NOT_PENDING/);
    const pending = reduceTaskState(planning, request());
    expect(() => reduceTaskState(pending, grant(otherHash))).toThrow(/APPROVAL_REFERENCE_MISMATCH/);
    const granted = reduceTaskState(pending, grant());
    expect(granted).toMatchObject({ status: 'planning', pending_approval: null, terminal: false });
    expect(granted.last_approval_resolution).toMatchObject({ approval_id_hash: hash, result: 'granted' });
    expect(() => reduceTaskState(granted, grant())).toThrow(/APPROVAL_ALREADY_RESOLVED/);
    expect(() => reduceTaskState(granted, reject())).toThrow(/APPROVAL_ALREADY_RESOLVED/);
  });

  test('rejection is terminal and blocks every later workflow/control event', () => {
    const rejected = reduceTaskState(reduceAll([...prefixFor('planning'), request()]), reject());
    expect(rejected).toMatchObject({ status: 'rejected', terminal: true, pending_approval: null, suspension: null });
    expect(() => reduceTaskState(rejected, grant())).toThrow(/APPROVAL_ALREADY_RESOLVED/);
    expect(() => reduceTaskState(rejected, request(otherHash, 'A1', 6))).toThrow(/APPROVAL_REQUEST_INVALID_STATE/);
    for (const later of [at('TASK_RESUMED', EVENT_PAYLOADS.TASK_RESUMED, 6),
      at('PLAN_CREATED', EVENT_PAYLOADS.PLAN_CREATED, 6), at('TASK_COMPLETED', EVENT_PAYLOADS.TASK_COMPLETED, 6)]) {
      expect(() => reduceTaskState(rejected, later)).toThrow();
    }
  });

  test('approval requests from suspended and completed states fail with the closed-state code', () => {
    const planning = reduceAll(prefixFor('planning'));
    const paused = reduceTaskState(planning, at('TASK_PAUSED', EVENT_PAYLOADS.TASK_PAUSED, 4));
    const blocked = reduceTaskState(planning, at('TASK_BLOCKED', EVENT_PAYLOADS.TASK_BLOCKED, 4));
    const completed = reduceTaskState(planning, at('TASK_COMPLETED', EVENT_PAYLOADS.TASK_COMPLETED, 4));
    for (const state of [paused, blocked, completed]) {
      expect(() => reduceTaskState(state, request(otherHash, 'A1', 6))).toThrow(/APPROVAL_REQUEST_INVALID_STATE/);
    }
  });

  test('resume payload cannot select or inject a caller-chosen return state', () => {
    const paused = reduceTaskState(reduceAll(prefixFor('researching')), at('TASK_PAUSED', EVENT_PAYLOADS.TASK_PAUSED, 4));
    expect(() => reduceTaskState(paused, at('TASK_RESUMED', {
      ...EVENT_PAYLOADS.TASK_RESUMED, return_status: 'planning',
    }, 5))).toThrow(/EVENT_PAYLOAD_INVALID/);
  });

  test('expired requests cannot be granted when chronology proves the grant is later', () => {
    const pending = reduceAll([...prefixFor('planning'), request(hash, 'A2', 4, { expires_at: '2026-07-11T00:00:05Z' })]);
    expect(() => reduceTaskState(pending, grant(hash, 6))).toThrow(/APPROVAL_EXPIRED/);
    expect(reduceTaskState(pending, grant(hash, 5)).status).toBe('planning');
  });

  test('researching pause and planning block resume to their exact prior states', () => {
    const researching = reduceAll(prefixFor('researching'));
    const paused = reduceTaskState(researching, at('TASK_PAUSED', EVENT_PAYLOADS.TASK_PAUSED, 4, 'ke_pause'));
    expect(paused).toMatchObject({ status: 'paused', suspension: { kind: 'paused', return_status: 'researching' } });
    expect(reduceTaskState(paused, at('TASK_RESUMED', EVENT_PAYLOADS.TASK_RESUMED, 5)).status).toBe('researching');
    const planning = reduceAll(prefixFor('planning'));
    const blocked = reduceTaskState(planning, at('TASK_BLOCKED', { ...EVENT_PAYLOADS.TASK_BLOCKED, awaiting_user: true }, 4));
    expect(blocked).toMatchObject({ status: 'blocked', suspension: { kind: 'blocked', return_status: 'planning', awaiting_user: true } });
    expect(reduceTaskState(blocked, at('TASK_RESUMED', EVENT_PAYLOADS.TASK_RESUMED, 5)).status).toBe('planning');
  });

  test('nested suspension and resume without suspension fail with stable codes', () => {
    const planning = reduceAll(prefixFor('planning'));
    expect(() => reduceTaskState(planning, at('TASK_RESUMED', EVENT_PAYLOADS.TASK_RESUMED, 4))).toThrow(/TASK_NOT_SUSPENDED/);
    const paused = reduceTaskState(planning, at('TASK_PAUSED', EVENT_PAYLOADS.TASK_PAUSED, 4));
    expect(() => reduceTaskState(paused, at('TASK_PAUSED', EVENT_PAYLOADS.TASK_PAUSED, 5))).toThrow(/TASK_ALREADY_SUSPENDED/);
    expect(() => reduceTaskState(paused, at('TASK_BLOCKED', EVENT_PAYLOADS.TASK_BLOCKED, 5))).toThrow(/TASK_ALREADY_SUSPENDED/);
  });

  test('pending approval survives pause/resume and remains an execution barrier', () => {
    const pending = reduceAll([...prefixFor('planning'), request()]);
    for (const progress of [at('RESEARCH_STARTED', EVENT_PAYLOADS.RESEARCH_STARTED, 5),
      at('PLAN_CREATED', EVENT_PAYLOADS.PLAN_CREATED, 5), at('TASK_COMPLETED', EVENT_PAYLOADS.TASK_COMPLETED, 5)]) {
      expect(() => reduceTaskState(pending, progress)).toThrow(/PENDING_APPROVAL_UNRESOLVED/);
    }
    const paused = reduceTaskState(pending, at('TASK_PAUSED', EVENT_PAYLOADS.TASK_PAUSED, 5, 'ke_pause'));
    expect(paused.pending_approval).toEqual(pending.pending_approval);
    expect(() => reduceTaskState(paused, at('PLAN_CREATED', EVENT_PAYLOADS.PLAN_CREATED, 6)))
      .toThrow(/PENDING_APPROVAL_UNRESOLVED/);
    const resumed = reduceTaskState(paused, at('TASK_RESUMED', EVENT_PAYLOADS.TASK_RESUMED, 6));
    expect(resumed).toMatchObject({ status: 'awaiting_approval', pending_approval: { approval_id_hash: hash } });
  });

  test.each(['TASK_PAUSED', 'TASK_BLOCKED'])('matching grant while suspended by %s repairs return state before resume', (kind) => {
    const pending = reduceAll([...prefixFor('planning'), request()]);
    const suspended = reduceTaskState(pending, at(kind, EVENT_PAYLOADS[kind], 5, 'ke_suspend'));
    const granted = reduceTaskState(suspended, grant(hash, 6));
    expect(granted).toMatchObject({ status: kind === 'TASK_PAUSED' ? 'paused' : 'blocked', pending_approval: null,
      suspension: { return_status: 'planning' }, last_approval_resolution: { result: 'granted' } });
    expect(reduceTaskState(granted, at('TASK_RESUMED', EVENT_PAYLOADS.TASK_RESUMED, 7)).status).toBe('planning');
  });

  test('matching rejection while suspended clears suspension and becomes terminal', () => {
    const pending = reduceAll([...prefixFor('planning'), request()]);
    const blocked = reduceTaskState(pending, at('TASK_BLOCKED', EVENT_PAYLOADS.TASK_BLOCKED, 5));
    expect(reduceTaskState(blocked, reject(hash, 6))).toMatchObject({
      status: 'rejected', terminal: true, pending_approval: null, suspension: null,
    });
  });

  test('ordinary suspension cannot fabricate an approval-resolution route', () => {
    const paused = reduceTaskState(reduceAll(prefixFor('researching')), at('TASK_PAUSED', EVENT_PAYLOADS.TASK_PAUSED, 4));
    expect(() => reduceTaskState(paused, grant())).toThrow(/APPROVAL_REQUEST_NOT_PENDING/);
  });

  test('replayEvents applies the same rules and returns the compatible status string', () => {
    const flow = [...prefixFor('planning'), request(), at('TASK_PAUSED', EVENT_PAYLOADS.TASK_PAUSED, 5), grant(hash, 6),
      at('TASK_RESUMED', EVENT_PAYLOADS.TASK_RESUMED, 7)];
    expect(replayEvents(flow)).toBe('planning');
    expect(() => replayEvents([...prefixFor('planning'), grant()])).toThrow(/APPROVAL_REQUEST_NOT_PENDING/);
  });
});

describe('closed versioned event payload policies', () => {
  test('defines one deeply frozen v1 policy for every active type and none for reserved types', () => {
    expect(Object.keys(EVENT_PAYLOAD_POLICIES)).toEqual(ACTIVE_EVENT_TYPES);
    for (const eventType of ACTIVE_EVENT_TYPES) {
      expect(Object.keys(EVENT_PAYLOAD_POLICIES[eventType])).toEqual(['1']);
      expect(Object.isFrozen(EVENT_PAYLOAD_POLICIES[eventType][1])).toBe(true);
      expect(validateEventPayload(eventType, 1, EVENT_PAYLOADS[eventType])).toEqual(EVENT_PAYLOADS[eventType]);
    }
    for (const eventType of RESERVED_EVENT_TYPES) expect(EVENT_PAYLOAD_POLICIES[eventType]).toBeUndefined();
    expect(() => validateEventPayload('CARD_SCORED', 2, EVENT_PAYLOADS.CARD_SCORED))
      .toThrow(/UNSUPPORTED_EVENT_PAYLOAD_POLICY/);
    expect(Object.isFrozen(EVENT_PAYLOAD_POLICIES)).toBe(true);
  });

  test.each(ACTIVE_EVENT_TYPES.flatMap((eventType) =>
    EVENT_PAYLOAD_POLICIES[eventType][1].required_keys.map((key) => [eventType, key])))
  ('rejects %s when required field %s is missing', (eventType, key) => {
    const payload = { ...EVENT_PAYLOADS[eventType] };
    delete payload[key];
    expect(() => validateEventPayload(eventType, 1, payload)).toThrow(/EVENT_PAYLOAD_INVALID/);
  });

  test.each(ACTIVE_EVENT_TYPES)('rejects extra payload keys for %s', (eventType) => {
    expect(() => validateEventPayload(eventType, 1, { ...EVENT_PAYLOADS[eventType], unexpected: 'FORGED' }))
      .toThrow(/EVENT_PAYLOAD_INVALID/);
  });

  test.each(ACTIVE_EVENT_TYPES)('returns detached frozen canonical-safe output for %s', (eventType) => {
    const input = structuredClone(EVENT_PAYLOADS[eventType]);
    const safe = validateEventPayload(eventType, 1, input);
    expect(Object.isFrozen(safe)).toBe(true);
    expect(safe).not.toBe(input);
    expect(canonicalJson(safe)).toBe(canonicalJson(EVENT_PAYLOADS[eventType]));
  });

  test('enforces score type/range, reason-code bounds and eligibility cross-field rule', () => {
    const score = EVENT_PAYLOADS.CARD_SCORED;
    for (const value of ['forged', -1, 10_001]) {
      expect(() => validateEventPayload('CARD_SCORED', 1, { ...score, score_basis_points: value }))
        .toThrow(/EVENT_PAYLOAD_INVALID/);
    }
    const eligibility = EVENT_PAYLOADS.CARD_ELIGIBILITY_EVALUATED;
    expect(() => validateEventPayload('CARD_ELIGIBILITY_EVALUATED', 1, {
      ...eligibility, eligible: true, reason_codes: ['NOT_EMPTY'],
    })).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(() => validateEventPayload('CARD_ELIGIBILITY_EVALUATED', 1, {
      ...eligibility, eligible: false, reason_codes: ['lowercase'],
    })).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(() => validateEventPayload('CARD_ELIGIBILITY_EVALUATED', 1, {
      ...eligibility, eligible: false, reason_codes: Array(33).fill(0).map((_, index) => `CODE_${index}`),
    })).toThrow(/EVENT_PAYLOAD_INVALID/);
  });

  test('enforces hashes, enums, timestamps, authorities and status literals', () => {
    expect(() => validateEventPayload('CARD_SCORED', 1, {
      ...EVENT_PAYLOADS.CARD_SCORED, card_snapshot_hash: 'sha256:bad',
    })).toThrow(/MALFORMED_HASH/);
    expect(() => validateEventPayload('RESEARCH_COMPLETED', 1, {
      ...EVENT_PAYLOADS.RESEARCH_COMPLETED, outcome: 'invented',
    })).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(() => validateEventPayload('PLAN_CREATED', 1, {
      ...EVENT_PAYLOADS.PLAN_CREATED, next_safe_action: 'execute_now',
    })).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(() => validateEventPayload('TASK_COMPLETED', 1, {
      ...EVENT_PAYLOADS.TASK_COMPLETED, completion_outcome: 'unknown',
    })).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(() => validateEventPayload('APPROVAL_REQUESTED', 1, {
      ...EVENT_PAYLOADS.APPROVAL_REQUESTED, approval_status: 'granted',
    })).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(() => validateEventPayload('APPROVAL_REQUESTED', 1, {
      ...EVENT_PAYLOADS.APPROVAL_REQUESTED, requested_authority: 'ROOT',
    })).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(() => validateEventPayload('TASK_PAUSED', 1, {
      ...EVENT_PAYLOADS.TASK_PAUSED, resume_after: 'tomorrow',
    })).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(() => validateEventPayload('TASK_PAUSED', 1, {
      ...EVENT_PAYLOADS.TASK_PAUSED, resume_after: '0000-01-01T00:00:00Z',
    })).toThrow(/EVENT_PAYLOAD_INVALID/);
  });

  test('every payload-policy hash scalar and array member uses the exact shared validator', () => {
    let checked = 0;
    for (const eventType of ACTIVE_EVENT_TYPES) {
      const policy = EVENT_PAYLOAD_POLICIES[eventType][1];
      for (const [key, descriptor] of Object.entries(policy.fields)) {
        if (descriptor.type !== 'hash' && descriptor.type !== 'hash_array') continue;
        const malformed = descriptor.type === 'hash_array'
          ? [hash, `sha256:${'A'.repeat(64)}`]
          : `sha256:${'A'.repeat(64)}`;
        expect(() => validateEventPayload(eventType, 1, { ...EVENT_PAYLOADS[eventType], [key]: malformed }))
          .toThrow(/MALFORMED_HASH/);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(validateEventPayload('CARD_ELIGIBILITY_EVALUATED', 1, {
      ...EVENT_PAYLOADS.CARD_ELIGIBILITY_EVALUATED, evidence_hashes: [hash, otherHash],
    }).evidence_hashes).toEqual([hash, otherHash]);
    expect(() => validateEventPayload('CARD_ELIGIBILITY_EVALUATED', 1, {
      ...EVENT_PAYLOADS.CARD_ELIGIBILITY_EVALUATED, evidence_hashes: [hash, hash],
    })).toThrow(/EVENT_PAYLOAD_INVALID/);
  });
});

describe('exported reducer and replay validation', () => {
  test('rejects missing, unsupported and reserved event versions before reduction', () => {
    expect(() => reduceTaskState(null, { event_type: 'TASK_CREATED', payload: EVENT_PAYLOADS.TASK_CREATED }))
      .toThrow(/UNSUPPORTED_EVENT_VERSION/);
    expect(() => reduceTaskState(null, event('TASK_CREATED', EVENT_PAYLOADS.TASK_CREATED, 2)))
      .toThrow(/UNSUPPORTED_EVENT_VERSION/);
    expect(() => reduceTaskState(null, { event_type: 'CARD_CLAIMED', event_version: 1, payload: {} }))
      .toThrow(/UNKNOWN_EVENT_TYPE/);
  });
  test('rejects semantically invalid direct reducer and replay payloads', () => {
    const triaged = normalFlow.slice(0, 2).reduce((state, item) => reduceTaskState(state, item), null);
    expect(() => reduceTaskState(triaged, event('CARD_SCORED', {
      ...EVENT_PAYLOADS.CARD_SCORED, score_basis_points: 'forged',
    }))).toThrow(/EVENT_PAYLOAD_INVALID/);
    expect(() => replayEvents([...normalFlow.slice(0, 2), event('CARD_SCORED', {
      ...EVENT_PAYLOADS.CARD_SCORED, extra: true,
    })])).toThrow(/EVENT_PAYLOAD_INVALID/);
  });
  test('replay rejects malformed and regressing timestamps while accepting equal instants', () => {
    expect(replayEvents(normalFlow)).toBe('awaiting_approval');
    expect(() => replayEvents([
      event('TASK_CREATED'),
      { ...event('CARD_ELIGIBILITY_EVALUATED'), occurred_at: '0000-01-01T00:00:00Z' },
    ])).toThrow(/INVALID_TIMESTAMP/);
    expect(() => replayEvents([
      { ...event('TASK_CREATED'), occurred_at: '2026-07-11T00:00:00.1Z' },
      { ...event('CARD_ELIGIBILITY_EVALUATED'), occurred_at: '2026-07-11T00:00:00.01Z' },
    ])).toThrow(/EVENT_TIMESTAMP_REGRESSION/);
  });
});

describe('authority and projection preview', () => {
  test('authority ordering accepts within ceiling and rejects malformed levels', () => {
    expect(authorityWithinCeiling('A0', 'A1')).toBe(true);
    expect(authorityWithinCeiling('A1', 'A1')).toBe(true);
    expect(authorityWithinCeiling('A2', 'A1')).toBe(false);
    expect(() => authorityWithinCeiling('ROOT', 'A1')).toThrow(/INVALID_AUTHORITY_LEVEL/);
  });
  test('projection preview suggests awaiting approval without writing', () => {
    expect(projectTaskStateToKanban({ taskState: 'awaiting_approval', currentCardStatus: 'in_progress' })).toEqual({
      task_state: 'awaiting_approval', current_card_status: 'in_progress', desired_status: 'awaiting_approval',
      reason_codes: ['DURABLE_STATE_PROJECTION_DIFFERS'], projection_required: true, projection_performed: false,
      kanban_write: false, approval_inferred_from_card_status: false, authority_changed: false,
    });
  });
  test('manual visual status never grants authority or approval', () => {
    const result = projectTaskStateToKanban({ taskState: 'created', currentCardStatus: 'approved' });
    expect(result.desired_status).toBe('triage');
    expect(result.approval_inferred_from_card_status).toBe(false);
    expect(result.authority_changed).toBe(false);
  });
  test('aligned projection remains a pure no-op', () => {
    expect(projectTaskStateToKanban({ taskState: 'completed', currentCardStatus: 'done' })).toMatchObject({
      projection_required: false, projection_performed: false, kanban_write: false,
    });
  });
});

describe('strict bounded RFC 8259 parser', () => {
  test('exports one immutable exact limit contract and defines root depth as zero', () => {
    expect(JSON_LIMITS).toEqual({
      MAX_JSON_INPUT_BYTES: 16384, MAX_PAYLOAD_DEPTH: 16, MAX_PAYLOAD_NODES: 2048,
      MAX_OBJECT_KEYS: 128, MAX_ARRAY_LENGTH: 256, MAX_KEY_BYTES: 128, MAX_STRING_BYTES: 8192,
    });
    expect(Object.isFrozen(JSON_LIMITS)).toBe(true);
    expect(parseStrictBoundedJson('{"a":[true,null,{"b":"x"}]}')).toEqual({ a: [true, null, { b: 'x' }] });
    expect(Object.getPrototypeOf(parseStrictBoundedJson('{}'))).toBeNull();
  });
  test.each([
    ['{"a":1,"a":2}', 'DUPLICATE_JSON_KEY'],
    ['{"a":1,"\\u0061":2}', 'DUPLICATE_JSON_KEY'],
    ['{"nested":{"x":1,"x":2}}', 'DUPLICATE_JSON_KEY'],
    ['[{"x":1,"x":2}]', 'DUPLICATE_JSON_KEY'],
    ['{"a":1} trailing', 'INVALID_JSON'],
    ['{"a":1,}', 'INVALID_JSON'],
    ['{/*x*/"a":1}', 'INVALID_JSON'],
    ['{"a":"\\q"}', 'INVALID_JSON'],
    ['{"a":"\\ud800"}', 'INVALID_JSON'],
    ['{"a":"\\udc00"}', 'INVALID_JSON'],
    ['{"__proto__":1}', 'PROTOTYPE_JSON_KEY_FORBIDDEN'],
    ['{"prototype":1}', 'PROTOTYPE_JSON_KEY_FORBIDDEN'],
    ['{"constructor":1}', 'PROTOTYPE_JSON_KEY_FORBIDDEN'],
  ])('rejects hostile JSON without reflecting it: %s', (text, code) => {
    expect(() => parseStrictBoundedJson(text)).toThrow(new RegExp(`^${code}:`));
    try { parseStrictBoundedJson(text); } catch (error) { expect(error.message.length).toBeLessThan(80); expect(error.message).not.toContain(text); }
  });
  test('enforces exact UTF-8 input, depth, key, string, array and object boundaries', () => {
    expect(() => parseStrictBoundedJson(`{}${' '.repeat(JSON_LIMITS.MAX_JSON_INPUT_BYTES - 2)}`)).not.toThrow();
    expect(() => parseStrictBoundedJson(`{}${' '.repeat(JSON_LIMITS.MAX_JSON_INPUT_BYTES - 1)}`)).toThrow(/JSON_INPUT_TOO_LARGE/);
    const nest = (depth) => `${'['.repeat(depth)}0${']'.repeat(depth)}`;
    expect(() => parseStrictBoundedJson(nest(16))).not.toThrow();
    expect(() => parseStrictBoundedJson(nest(17))).toThrow(/PAYLOAD_DEPTH_EXCEEDED/);
    expect(() => parseStrictBoundedJson(JSON.stringify({ ['k'.repeat(128)]: 1 }))).not.toThrow();
    expect(() => parseStrictBoundedJson(JSON.stringify({ ['k'.repeat(129)]: 1 }))).toThrow(/PAYLOAD_KEY_TOO_LONG/);
    expect(() => parseStrictBoundedJson(JSON.stringify('x'.repeat(8192)))).not.toThrow();
    expect(() => parseStrictBoundedJson(JSON.stringify('x'.repeat(8193)))).toThrow(/PAYLOAD_STRING_TOO_LONG/);
    expect(() => parseStrictBoundedJson(JSON.stringify(Array(256).fill(0)))).not.toThrow();
    expect(() => parseStrictBoundedJson(JSON.stringify(Array(257).fill(0)))).toThrow(/PAYLOAD_ARRAY_LIMIT_EXCEEDED/);
    expect(() => parseStrictBoundedJson(JSON.stringify(Object.fromEntries(Array.from({ length: 128 }, (_, i) => [`k${i}`, 0]))))).not.toThrow();
    expect(() => parseStrictBoundedJson(JSON.stringify(Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`k${i}`, 0]))))).toThrow(/PAYLOAD_OBJECT_KEY_LIMIT_EXCEEDED/);
  });
  test('enforces node count exactly', () => {
    const tree = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`k${index}`, Array(index < 7 ? 256 : 247).fill(null)]));
    expect(() => validateBoundedJsonValue(tree)).not.toThrow();
    expect(() => parseStrictBoundedJson(JSON.stringify(tree))).not.toThrow();
    tree.k7.push(null);
    expect(() => validateBoundedJsonValue(tree)).toThrow(/PAYLOAD_NODE_LIMIT_EXCEEDED/);
    expect(() => parseStrictBoundedJson(JSON.stringify(tree))).toThrow(/PAYLOAD_NODE_LIMIT_EXCEEDED/);
  });
});

describe('bounded programmatic JSON and canonical numbers', () => {
  test.each([
    ['lone high surrogate', '\ud800', 'PAYLOAD_STRING_INVALID_UNICODE'],
    ['lone low surrogate', '\udfff', 'PAYLOAD_STRING_INVALID_UNICODE'],
    ['embedded lone surrogate', 'prefix\ud800suffix', 'PAYLOAD_STRING_INVALID_UNICODE'],
  ])('rejects malformed UTF-16 %s before serialization', (_label, value, code) => {
    expect(() => assertWellFormedUnicodeString(value, 'value')).toThrow(new RegExp(code));
    expect(() => canonicalJson({ note: value })).toThrow(new RegExp(code));
  });
  test('rejects malformed UTF-16 in nested values, arrays and object keys', () => {
    expect(() => canonicalJson({ nested: { note: '\ud800' } })).toThrow(/PAYLOAD_STRING_INVALID_UNICODE/);
    expect(() => canonicalJson({ items: ['\udfff'] })).toThrow(/PAYLOAD_STRING_INVALID_UNICODE/);
    expect(() => canonicalJson({ ['bad\ud800key']: 'x' })).toThrow(/PAYLOAD_KEY_INVALID_UNICODE/);
  });
  test('accepts ordinary, accented and paired Unicode string values', () => {
    const value = { ascii: 'ok', cafe: 'café', emoji: '😀', pairs: '😀💾🚀', nested: ['naïve', '東京'] };
    expect(() => canonicalJson(value)).not.toThrow();
    expect(assertWellFormedUnicodeString('😀💾', 'value')).toBe('😀💾');
  });
  test.each([
    ['prіvate_key', 'PAYLOAD_KEY_NON_ASCII_FORBIDDEN'],
    ['аpiKey', 'PAYLOAD_KEY_NON_ASCII_FORBIDDEN'],
    ['private＿key', 'PAYLOAD_KEY_NON_ASCII_FORBIDDEN'],
    ['private‒key', 'PAYLOAD_KEY_NON_ASCII_FORBIDDEN'],
    ['ｐｒｉｖａｔｅＫｅｙ', 'PAYLOAD_KEY_NON_ASCII_FORBIDDEN'],
    ['café', 'PAYLOAD_KEY_NON_ASCII_FORBIDDEN'],
    ['bad\u0001key', 'PAYLOAD_KEY_CONTROL_CHARACTER_FORBIDDEN'],
    ['bad\u007fkey', 'PAYLOAD_KEY_CONTROL_CHARACTER_FORBIDDEN'],
  ])('rejects unsafe programmatic key %s', (key, code) => {
    expect(() => canonicalJson({ [key]: 'synthetic-secret' })).toThrow(new RegExp(code));
  });
  test('strict parser rejects decoded confusable keys but permits Unicode values', () => {
    expect(() => parseStrictBoundedJson('{"pr\\u0456vate_key":"synthetic-secret"}')).toThrow(/PAYLOAD_KEY_NON_ASCII_FORBIDDEN/);
    expect(() => parseStrictBoundedJson('{"note":"café 😀"}')).not.toThrow();
  });
  test('rejects a 12000-level value stably without stack exhaustion', () => {
    let value = null;
    for (let index = 0; index < 12000; index += 1) value = [value];
    expect(() => validateBoundedJsonValue(value)).toThrow(/PAYLOAD_DEPTH_EXCEEDED/);
    try { validateBoundedJsonValue(value); } catch (error) { expect(error).not.toBeInstanceOf(RangeError); }
  });
  test.each([
    ['undefined', () => ({ bad: undefined })], ['function', () => ({ bad() {} })],
    ['symbol', () => ({ bad: Symbol('x') })], ['bigint', () => ({ bad: 1n })],
    ['Date', () => new Date()], ['Map', () => new Map()], ['Set', () => new Set()],
    ['Buffer', () => Buffer.from('x')], ['ArrayBuffer', () => new ArrayBuffer(8)],
    ['typed array', () => new Uint8Array([1])],
    ['RegExp', () => /x/], ['Error', () => new Error('x')],
    ['class instance', () => new (class Example {})()],
  ])('rejects %s values', (_name, build) => expect(() => canonicalJson(build())).toThrow(/PAYLOAD_INVALID/));
  test('rejects cycles, getters, symbols, non-enumerable properties and sparse arrays', () => {
    const cycle = {}; cycle.self = cycle;
    const getter = {}; Object.defineProperty(getter, 'x', { enumerable: true, get() { return 1; } });
    const symbol = { ok: 1 }; symbol[Symbol('x')] = 2;
    const hidden = {}; Object.defineProperty(hidden, 'x', { enumerable: false, value: 1 });
    expect(() => canonicalJson(cycle)).toThrow(/PAYLOAD_INVALID/);
    expect(() => canonicalJson(getter)).toThrow(/PAYLOAD_INVALID/);
    expect(() => canonicalJson(symbol)).toThrow(/PAYLOAD_INVALID/);
    expect(() => canonicalJson(hidden)).toThrow(/PAYLOAD_INVALID/);
    expect(() => canonicalJson(Array(2))).toThrow(/PAYLOAD_INVALID/);
  });
  test('canonical numbers are exact and deterministic', () => {
    expect(canonicalJson({ n: Number.MAX_SAFE_INTEGER, f: 1.25, z: 0 })).toBe('{"f":1.25,"n":9007199254740991,"z":0}');
    expect(() => canonicalJson({ n: 9007199254740993 })).toThrow(/UNSAFE_INTEGER_NUMBER/);
    expect(() => canonicalJson({ n: -0 })).toThrow(/NEGATIVE_ZERO_FORBIDDEN/);
    for (const n of [NaN, Infinity, -Infinity]) expect(() => canonicalJson({ n })).toThrow(/NON_FINITE_NUMBER/);
  });
  test('canonical output sorts every object, preserves arrays and Unicode, and distinguishes array order', () => {
    expect(canonicalJson({ z: true, a: { y: null, x: '💾' } })).toBe('{"a":{"x":"💾","y":null},"z":true}');
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
    const parsed = parseStrictBoundedJson('{"b":1,"a":{"d":4,"c":3}}');
    expect(canonicalJson(parsed)).toBe(canonicalJson({ a: { c: 3, d: 4 }, b: 1 }));
  });
});
