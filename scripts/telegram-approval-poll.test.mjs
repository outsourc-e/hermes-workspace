import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pollTelegramApprovals, LEGACY_CODE_EDIT_APPROVAL_ID } from './telegram-approval-poll.mjs';

const SECRET_TOKEN = '123456:SUPER_SECRET_TOKEN';
const CHAT_ID = '987654321';
const OTHER_CHAT_ID = '111111111';
const APPROVAL_ID = 'tg4_d3fd7da71ae557f3';

async function exists(pathname) {
  try {
    await stat(pathname);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function fixture({ expiresAt = '2026-07-05T10:00:00.000Z', withDecision = null } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tg-approval-poll-'));
  const requestsPath = path.join(dir, 'telegram-approval-requests.jsonl');
  const decisionsPath = path.join(dir, 'telegram-approval-decisions.jsonl');
  const offsetPath = path.join(dir, 'telegram-approval-offset.json');
  const codeEditApprovalPacketsPath = path.join(dir, 'telegram-code-edit-approval-packets.jsonl');
  await writeFile(requestsPath, `${JSON.stringify({
    approval_id: APPROVAL_ID,
    report_path: '/tmp/report.md',
    report_hash: 'abc123',
    sent_at: '2026-07-05T08:00:00.000Z',
    expires_at: expiresAt,
    selected_repo: 'owner/repo',
    recommended_next_action: 'learn_from',
    message_id: 77,
    status: 'requested',
  })}\n`, 'utf8');
  if (withDecision) {
    await writeFile(decisionsPath, `${JSON.stringify({
      approval_id: APPROVAL_ID,
      decision: withDecision,
      decided_at: '2026-07-05T08:10:00.000Z',
      report_path: '/tmp/report.md',
      report_hash: 'abc123',
      selected_repo: 'owner/repo',
      recommended_next_action: 'learn_from',
      telegram_update_id: 1,
      telegram_message_id: 2,
      telegram_chat_verified: true,
      status: withDecision,
      sanitized: true,
    })}\n`, 'utf8');
  }
  return { dir, requestsPath, decisionsPath, offsetPath, codeEditApprovalPacketsPath };
}

function updatesFetch(updates, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ ok: true, result: updates }) };
  };
}

function message(updateId, text, chatId = CHAT_ID, messageId = updateId + 100) {
  return { update_id: updateId, message: { message_id: messageId, chat: { id: chatId }, text } };
}

async function readJsonl(pathname) {
  return (await readFile(pathname, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

describe('telegram approval reply intake', () => {
  it('approve command writes one sanitized decision row and advances offset', async () => {
    const f = await fixture();
    const calls = [];
    const result = await pollTelegramApprovals({
      ...f,
      env: { TELEGRAM_BOT_TOKEN: SECRET_TOKEN, TELEGRAM_CHAT_ID: CHAT_ID },
      fetchImpl: updatesFetch([message(10, `/approve ${APPROVAL_ID}`, CHAT_ID, 501)], calls),
      now: new Date('2026-07-05T09:00:00.000Z'),
    });
    expect(result.ok).toBe(true);
    expect(result.decisionsAppended).toBe(1);
    expect(result.decision_rows[0]).toMatchObject({ approval_id: APPROVAL_ID, decision: 'approved', status: 'approved', telegram_chat_verified: true, sanitized: true });
    expect(result.decision_rows[0].telegram_message_id).toBe(501);
    expect(result.offset_after).toBe(11);
    expect(JSON.parse(await readFile(f.offsetPath, 'utf8')).offset).toBe(11);
    expect(await readJsonl(f.decisionsPath)).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(SECRET_TOKEN);
    expect(JSON.stringify(result)).not.toContain(CHAT_ID);
    expect(calls[0].url).toContain('/getUpdates');
  });

  it('reject command writes one sanitized decision row', async () => {
    const f = await fixture();
    const result = await pollTelegramApprovals({
      ...f,
      env: { TELEGRAM_BOT_TOKEN: SECRET_TOKEN, TELEGRAM_CHAT_ID: CHAT_ID },
      fetchImpl: updatesFetch([message(11, `/reject ${APPROVAL_ID}`)]),
      now: new Date('2026-07-05T09:00:00.000Z'),
    });
    expect(result.decisionsAppended).toBe(1);
    expect(result.decision_rows[0].decision).toBe('rejected');
    expect(result.decision_rows[0].status).toBe('rejected');
  });

  it('duplicate approve and approve-after-reject are blocked one-shot', async () => {
    for (const prior of ['approved', 'rejected']) {
      const f = await fixture({ withDecision: prior });
      const result = await pollTelegramApprovals({
        ...f,
        env: { TELEGRAM_BOT_TOKEN: SECRET_TOKEN, TELEGRAM_CHAT_ID: CHAT_ID },
        fetchImpl: updatesFetch([message(12, `/approve ${APPROVAL_ID}`)]),
        now: new Date('2026-07-05T09:00:00.000Z'),
      });
      expect(result.decisionsAppended).toBe(0);
      expect(result.handled_updates[0].reason).toBe('ALREADY_DECIDED');
      expect(await readJsonl(f.decisionsPath)).toHaveLength(1);
    }
  });

  it('reject after approve is blocked one-shot', async () => {
    const f = await fixture({ withDecision: 'approved' });
    const result = await pollTelegramApprovals({
      ...f,
      env: { TELEGRAM_BOT_TOKEN: SECRET_TOKEN, TELEGRAM_CHAT_ID: CHAT_ID },
      fetchImpl: updatesFetch([message(13, `/reject ${APPROVAL_ID}`)]),
      now: new Date('2026-07-05T09:00:00.000Z'),
    });
    expect(result.decisionsAppended).toBe(0);
    expect(result.handled_updates[0].reason).toBe('ALREADY_DECIDED');
  });

  it('unknown and expired approval_id are blocked', async () => {
    const unknown = await fixture();
    const unknownResult = await pollTelegramApprovals({
      ...unknown,
      env: { TELEGRAM_BOT_TOKEN: SECRET_TOKEN, TELEGRAM_CHAT_ID: CHAT_ID },
      fetchImpl: updatesFetch([message(14, '/approve tg4_unknownapproval')]),
      now: new Date('2026-07-05T09:00:00.000Z'),
    });
    expect(unknownResult.decisionsAppended).toBe(0);
    expect(unknownResult.handled_updates[0].reason).toBe('UNKNOWN_APPROVAL_ID');

    const expired = await fixture({ expiresAt: '2026-07-05T08:59:59.000Z' });
    const expiredResult = await pollTelegramApprovals({
      ...expired,
      env: { TELEGRAM_BOT_TOKEN: SECRET_TOKEN, TELEGRAM_CHAT_ID: CHAT_ID },
      fetchImpl: updatesFetch([message(15, `/approve ${APPROVAL_ID}`)]),
      now: new Date('2026-07-05T09:00:00.000Z'),
    });
    expect(expiredResult.decisionsAppended).toBe(0);
    expect(expiredResult.handled_updates[0].reason).toBe('EXPIRED_APPROVAL_ID');
  });

  it('wrong chat and malformed commands are ignored without decision rows', async () => {
    const f = await fixture();
    const result = await pollTelegramApprovals({
      ...f,
      env: { TELEGRAM_BOT_TOKEN: SECRET_TOKEN, TELEGRAM_CHAT_ID: CHAT_ID },
      fetchImpl: updatesFetch([
        message(16, `/approve ${APPROVAL_ID}`, OTHER_CHAT_ID),
        message(17, `approve ${APPROVAL_ID}`, CHAT_ID),
      ]),
      now: new Date('2026-07-05T09:00:00.000Z'),
    });
    expect(result.decisionsAppended).toBe(0);
    expect(result.handled_updates.map((item) => item.reason)).toEqual(['WRONG_CHAT_OR_NO_MESSAGE', 'MALFORMED_COMMAND']);
    expect(await exists(f.decisionsPath)).toBe(false);
    expect(JSON.parse(await readFile(f.offsetPath, 'utf8')).offset).toBe(18);
  });

  it('dry-run writes nothing and advances no offset', async () => {
    const f = await fixture();
    const result = await pollTelegramApprovals({
      ...f,
      dryRun: true,
      env: { TELEGRAM_BOT_TOKEN: SECRET_TOKEN, TELEGRAM_CHAT_ID: CHAT_ID },
      fetchImpl: updatesFetch([message(18, `/approve ${APPROVAL_ID}`)]),
      now: new Date('2026-07-05T09:00:00.000Z'),
    });
    expect(result.decisionsAppended).toBe(0);
    expect(result.dry_run_decision_rows).toHaveLength(1);
    expect(result.offset_after).toBe(0);
    expect(await exists(f.decisionsPath)).toBe(false);
    expect(await exists(f.offsetPath)).toBe(false);
  });

  it('accepts exact alias for the legacy code edit approval packet and stores approval_alias_used', async () => {
    const f = await fixture();
    await writeFile(f.codeEditApprovalPacketsPath, `${JSON.stringify({
      code_edit_approval_id: LEGACY_CODE_EDIT_APPROVAL_ID,
      approval_packet_report_path: '/tmp/code-edit-packet.md',
      approval_packet_report_hash: 'packet-hash',
      target_workspace: '/root/hermes-workspace',
      expiry_time: '2026-07-05T10:00:00.000Z',
    })}\n`, 'utf8');
    const result = await pollTelegramApprovals({
      ...f,
      env: { TELEGRAM_BOT_TOKEN: SECRET_TOKEN, TELEGRAM_CHAT_ID: CHAT_ID },
      fetchImpl: updatesFetch([message(19, '/approve edit1')]),
      now: new Date('2026-07-05T09:00:00.000Z'),
    });
    expect(result.decisionsAppended).toBe(1);
    expect(result.decision_rows[0]).toMatchObject({
      approval_id: LEGACY_CODE_EDIT_APPROVAL_ID,
      approval_alias_used: 'edit1',
      decision: 'approved',
      recommended_next_action: 'code_edit_approval',
      status: 'approved',
    });
  });

  it('accepts exact full approval_id while storing null approval_alias_used', async () => {
    const f = await fixture();
    const result = await pollTelegramApprovals({
      ...f,
      env: { TELEGRAM_BOT_TOKEN: SECRET_TOKEN, TELEGRAM_CHAT_ID: CHAT_ID },
      fetchImpl: updatesFetch([message(20, `/approve ${APPROVAL_ID}`)]),
      now: new Date('2026-07-05T09:00:00.000Z'),
    });
    expect(result.decisionsAppended).toBe(1);
    expect(result.decision_rows[0].approval_id).toBe(APPROVAL_ID);
    expect(result.decision_rows[0].approval_alias_used).toBeNull();
  });

  it('rejects ambiguous and unknown aliases without decision rows', async () => {
    const f = await fixture();
    await writeFile(f.requestsPath, `${JSON.stringify({
      approval_id: 'tg4_aaaaaaaaaaaaaaaa',
      short_alias: 'same',
      expires_at: '2026-07-05T10:00:00.000Z',
      status: 'requested',
    })}\n${JSON.stringify({
      approval_id: 'tg4_bbbbbbbbbbbbbbbb',
      short_alias: 'same',
      expires_at: '2026-07-05T10:00:00.000Z',
      status: 'requested',
    })}\n`, 'utf8');
    const result = await pollTelegramApprovals({
      ...f,
      env: { TELEGRAM_BOT_TOKEN: SECRET_TOKEN, TELEGRAM_CHAT_ID: CHAT_ID },
      fetchImpl: updatesFetch([message(21, '/approve same'), message(22, '/approve missing')]),
      now: new Date('2026-07-05T09:00:00.000Z'),
    });
    expect(result.decisionsAppended).toBe(0);
    expect(result.handled_updates.map((item) => item.reason)).toEqual(['AMBIGUOUS_APPROVAL_ALIAS', 'UNKNOWN_APPROVAL_ID']);
    expect(await exists(f.decisionsPath)).toBe(false);
  });

  it('offset prevents replay by using saved offset in getUpdates URL and token/chat are never printed', async () => {
    const f = await fixture();
    await writeFile(f.offsetPath, JSON.stringify({ offset: 44 }), 'utf8');
    const calls = [];
    const result = await pollTelegramApprovals({
      ...f,
      env: { TELEGRAM_BOT_TOKEN: SECRET_TOKEN, TELEGRAM_CHAT_ID: CHAT_ID },
      fetchImpl: updatesFetch([], calls),
      now: new Date('2026-07-05T09:00:00.000Z'),
    });
    expect(calls[0].url).toContain('offset=44');
    expect(result.offset_before).toBe(44);
    expect(result.offset_after).toBe(44);
    const raw = JSON.stringify(result);
    expect(raw).not.toContain(SECRET_TOKEN);
    expect(raw).not.toContain(CHAT_ID);
    expect(result.githubWrites).toBe(false);
    expect(result.auditAppend).toBe(false);
    expect(result.durableMutation).toBe(false);
    expect(result.obsidianKanbanWrites).toBe(false);
    expect(result.executor).toBe(false);
  });
});
