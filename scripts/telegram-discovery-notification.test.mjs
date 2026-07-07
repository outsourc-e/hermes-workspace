import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  buildDiscoveryApprovalRequestPreview,
  buildDiscoveryNotificationPreview,
  sendTelegramDiscoveryApprovalRequest,
  sendTelegramDiscoveryNotification,
} from './telegram-discovery-notification.mjs';

const execFileAsync = promisify(execFile);

const reportMarkdown = `# GitHub discovery report: Sensitive workflow helper

Status: PASS_PUBLIC_GITHUB_REPO_DISCOVERY_REPORT
Recommendation: learn_from
sensitive: true
idea_body: SHOULD_NOT_BE_SENT

## Safety

Read-only public GitHub discovery only.

## Candidates

### 1. owner/alpha
- URL: https://github.com/owner/alpha
- Recommendation: use
- Score: 99
- Stars: 123

### 2. owner/beta
- URL: https://github.com/owner/beta
- Recommendation: fork
- Score: 88
- Stars: 45

### 3. owner/gamma
- URL: https://github.com/owner/gamma
- Recommendation: avoid
- Score: 77
- Stars: 6

### 4. owner/delta
- URL: https://github.com/owner/delta
- Recommendation: use
- Score: 66
- Stars: 5
`;

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tg-disc-test-'));
  const reportPath = path.join(dir, 'report.md');
  const indexPath = path.join(dir, 'index.jsonl');
  await writeFile(reportPath, reportMarkdown, 'utf8');
  await writeFile(indexPath, `${JSON.stringify({
    schema: 'github_discovery_captured_idea_index_v1',
    indexed_at: '2026-07-04T00:00:00Z',
    idea_title: 'Sensitive workflow helper',
    recommendation: 'learn_from',
    report_path: reportPath,
    github_write: false,
    audit_append: false,
    durable_mutation: false,
    obsidian_kanban_discord_write: false,
    sanitized: true,
    top_candidate_summaries: [
      { full_name: 'owner/alpha', html_url: 'https://github.com/owner/alpha', recommendation: 'use', score: 99, stars: 123 },
      { full_name: 'owner/beta', html_url: 'https://github.com/owner/beta', recommendation: 'fork', score: 88, stars: 45 },
      { full_name: 'owner/gamma', html_url: 'https://github.com/owner/gamma', recommendation: 'avoid', score: 77, stars: 6 },
      { full_name: 'owner/delta', html_url: 'https://github.com/owner/delta', recommendation: 'use', score: 66, stars: 5 },
    ],
  })}\n`, 'utf8');
  return { dir, reportPath, indexPath };
}

describe('telegram discovery notification bridge', () => {
  it('preview CLI emits a read-only JSON notification from an existing discovery report', async () => {
    const { indexPath } = await fixture();
    const { stdout } = await execFileAsync('node', ['bin/telegram-discovery-notification-preview', '--json', '--index-path', indexPath], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' },
    });
    const result = JSON.parse(stdout);
    expect(result.ok).toBe(true);
    expect(result.sent).toBe(false);
    expect(result.githubCalls).toBe(false);
    expect(result.githubWrites).toBe(false);
    expect(result.auditAppend).toBe(false);
    expect(result.durableMutation).toBe(false);
    expect(result.obsidianKanbanWrites).toBe(false);
    expect(result.message).toContain('What happened: Found owner/alpha for Sensitive workflow helper.');
    expect(result.message).toContain('Recommendation: learn_from');
    expect(result.message).toContain('If you approve:');
    expect(result.message).toContain('What will NOT happen:');
    expect(result.message).toContain('Reply:');
    expect(result.message).not.toContain('owner/delta');
    expect(result.message).toContain('Details saved in report');
    expect(result.message).not.toContain('SHOULD_NOT_BE_SENT');
  });

  it('send blocks safely when Telegram credentials are missing', async () => {
    const { reportPath, indexPath } = await fixture();
    const result = await sendTelegramDiscoveryNotification({ reportPath, indexPath, env: {} });
    expect(result.ok).toBe(false);
    expect(result.sent).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('MISSING_TELEGRAM_CREDENTIALS');
    expect(result.telegram.botToken).toBeNull();
    expect(result.telegram.chatId).toBeNull();
    expect(result.githubCalls).toBe(false);
    expect(result.auditAppend).toBe(false);
    expect(result.durableMutation).toBe(false);
  });

  it('send requires explicit report_path', async () => {
    const result = await sendTelegramDiscoveryNotification({ env: {}, fetchImpl: async () => ({ ok: true }) }).catch((error) => error);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('--report-path');
  });

  it('send path is mocked in tests and redacts token/chat values', async () => {
    const { reportPath, indexPath } = await fixture();
    const result = await sendTelegramDiscoveryNotification({
      reportPath,
      indexPath,
      env: { TELEGRAM_BOT_TOKEN: '123456:SUPER_SECRET_TOKEN', TELEGRAM_CHAT_ID: '987654321' },
      mockSend: true,
    });
    expect(result.ok).toBe(true);
    expect(result.sent).toBe(true);
    expect(result.mocked).toBe(true);
    expect(result.telegram.botToken).toBe('[REDACTED]');
    expect(result.telegram.chatId).toBe('[REDACTED]');
    const raw = JSON.stringify(result);
    expect(raw).not.toContain('SUPER_SECRET_TOKEN');
    expect(raw).not.toContain('987654321');
    expect(result.githubCalls).toBe(false);
    expect(result.githubWrites).toBe(false);
    expect(result.auditAppend).toBe(false);
    expect(result.durableMutation).toBe(false);
    expect(result.obsidianKanbanWrites).toBe(false);
  });

  it('live send uses exactly one Telegram API request when a fetch implementation is supplied', async () => {
    const { reportPath, indexPath } = await fixture();
    const calls = [];
    const result = await sendTelegramDiscoveryNotification({
      reportPath,
      indexPath,
      env: { TELEGRAM_BOT_TOKEN: '123456:SUPER_SECRET_TOKEN', TELEGRAM_CHAT_ID: '987654321' },
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 42 } }) };
      },
    });
    expect(calls).toHaveLength(1);
    expect(result.sent).toBe(true);
    expect(result.messageId).toBe(42);
    expect(calls[0].url).toContain('/sendMessage');
    expect(JSON.parse(calls[0].init.body).text).toContain('What will NOT happen');
  });

  it('approval preview emits read-only Telegram-safe approval request fields without commands or execution', async () => {
    const { reportPath, indexPath } = await fixture();
    const result = await buildDiscoveryApprovalRequestPreview({
      reportPath,
      indexPath,
      now: new Date('2026-07-04T10:00:00.000Z'),
      ttlMinutes: 30,
    });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('approval_request_preview');
    expect(result.sent).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.approved).toBe(false);
    expect(result.rejected).toBe(false);
    expect(result.approval_id).toMatch(/^tg4_[a-f0-9]{16}$/);
    expect(result.idea_title).toBe('Sensitive workflow helper');
    expect(result.selected_repo.full_name).toBe('owner/alpha');
    expect(result.recommended_next_action).toBe('learn_from');
    expect(result.exact_proposed_scope).toContain('owner/alpha');
    expect(result.allowed_side_effects).toEqual([
      'read existing discovery report/index from local disk',
      'generate JSON approval request preview on stdout',
      'generate Telegram-safe plain-text message preview',
    ]);
    expect(result.forbidden_side_effects).toContain('approve command');
    expect(result.forbidden_side_effects).toContain('reject command');
    expect(result.forbidden_side_effects).toContain('fork');
    expect(result.forbidden_side_effects).toContain('GitHub API call or write');
    expect(result.expiry_time).toBe('2026-07-04T10:30:00.000Z');
    expect(result.telegram_message_text).toContain('Approval needed');
    expect(result.telegram_message_text).not.toContain(result.approval_id);
    expect(result.telegram_message_text).toContain('This preview records no approval yet.');
    expect(result.telegram_message_text).not.toContain('SHOULD_NOT_BE_SENT');
    expect(result.githubCalls).toBe(false);
    expect(result.githubWrites).toBe(false);
    expect(result.auditAppend).toBe(false);
    expect(result.durableMutation).toBe(false);
  });

  it('approval preview CLI emits JSON and performs no Telegram/GitHub/write side effects', async () => {
    const { indexPath } = await fixture();
    const { stdout } = await execFileAsync('node', ['bin/telegram-discovery-approval-preview', '--json', '--index-path', indexPath, '--now', '2026-07-04T10:00:00.000Z', '--ttl-minutes', '30'], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' },
    });
    const result = JSON.parse(stdout);
    expect(result.sent).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.selected_repo.full_name).toBe('owner/alpha');
    expect(result.recommended_next_action).toBe('learn_from');
    expect(result.expiry_time).toBe('2026-07-04T10:30:00.000Z');
    expect(result.telegram_message_text).toContain('Review owner/alpha');
    expect(result.githubWrites).toBe(false);
    expect(result.cloneForkRunInstallCreateRepoPushPrMergeDelete).toBe(false);
  });

  it('approval send dry-run generates approval text without sending or writing state', async () => {
    const { reportPath, indexPath, dir } = await fixture();
    const statePath = path.join(dir, 'telegram-approval-requests.jsonl');
    const { stdout } = await execFileAsync('node', ['bin/telegram-discovery-approval-send', '--report-path', reportPath, '--dry-run', '--json', '--index-path', indexPath, '--state-path', statePath, '--now', '2026-07-04T10:00:00.000Z'], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1', TELEGRAM_BOT_TOKEN: '123456:SUPER_SECRET_TOKEN', TELEGRAM_CHAT_ID: '987654321' },
    });
    const result = JSON.parse(stdout);
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.sent).toBe(false);
    expect(result.stateAppended).toBe(false);
    expect(result.short_alias).toBeTruthy();
    expect(result.telegram_message_text).toContain(`/approve ${result.short_alias}`);
    expect(result.telegram_message_text).toContain(`/reject ${result.short_alias}`);
    expect(result.telegram_message_text).not.toContain(result.approval_id);
    await expect(stat(statePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(stdout).not.toContain('SUPER_SECRET_TOKEN');
    expect(stdout).not.toContain('987654321');
  });

  it('mocked approval send appends one state row and skips duplicate reports', async () => {
    const { reportPath, indexPath, dir } = await fixture();
    const statePath = path.join(dir, 'telegram-approval-requests.jsonl');
    const first = await sendTelegramDiscoveryApprovalRequest({
      reportPath,
      indexPath,
      statePath,
      mockSend: true,
      env: { TELEGRAM_BOT_TOKEN: '123456:SUPER_SECRET_TOKEN', TELEGRAM_CHAT_ID: '987654321' },
      now: new Date('2026-07-04T10:00:00.000Z'),
    });
    expect(first.ok).toBe(true);
    expect(first.sent).toBe(true);
    expect(first.stateAppended).toBe(true);
    expect(first.message_id).toBe('mock-message-id');
    let rows = (await readFile(statePath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      approval_id: first.approval_id,
      report_path: reportPath,
      report_hash: first.report_hash,
      sent_at: '2026-07-04T10:00:00.000Z',
      expires_at: first.expiry_time,
      selected_repo: 'owner/alpha',
      recommended_next_action: 'learn_from',
      message_id: 'mock-message-id',
      status: 'requested',
    });

    const second = await sendTelegramDiscoveryApprovalRequest({
      reportPath,
      indexPath,
      statePath,
      mockSend: true,
      env: { TELEGRAM_BOT_TOKEN: '123456:SUPER_SECRET_TOKEN', TELEGRAM_CHAT_ID: '987654321' },
      now: new Date('2026-07-04T10:01:00.000Z'),
    });
    expect(second.skipped).toBe(true);
    expect(second.sent).toBe(false);
    expect(second.stateAppended).toBe(false);
    rows = (await readFile(statePath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(rows).toHaveLength(1);
  });

  it('--force creates a second approval request only when explicit', async () => {
    const { reportPath, indexPath, dir } = await fixture();
    const statePath = path.join(dir, 'telegram-approval-requests.jsonl');
    await sendTelegramDiscoveryApprovalRequest({ reportPath, indexPath, statePath, mockSend: true, env: { TELEGRAM_BOT_TOKEN: '123456:SUPER_SECRET_TOKEN', TELEGRAM_CHAT_ID: '987654321' } });
    const forced = await sendTelegramDiscoveryApprovalRequest({ reportPath, indexPath, statePath, force: true, mockSend: true, env: { TELEGRAM_BOT_TOKEN: '123456:SUPER_SECRET_TOKEN', TELEGRAM_CHAT_ID: '987654321' } });
    expect(forced.sent).toBe(true);
    const rows = (await readFile(statePath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(rows).toHaveLength(2);
  });

  it('approval send blocks invalid reports before sending or writing state', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tg-disc-invalid-'));
    const reportPath = path.join(dir, 'invalid.md');
    const statePath = path.join(dir, 'telegram-approval-requests.jsonl');
    await writeFile(reportPath, '# Not a discovery report\nRecommendation: avoid\n', 'utf8');
    const result = await sendTelegramDiscoveryApprovalRequest({
      reportPath,
      statePath,
      env: { TELEGRAM_BOT_TOKEN: '123456:SUPER_SECRET_TOKEN', TELEGRAM_CHAT_ID: '987654321' },
      fetchImpl: async () => { throw new Error('should not send'); },
    }).catch((error) => error);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('No selected repository candidate');
    await expect(stat(statePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('approval send output redacts token and chat values', async () => {
    const { reportPath, indexPath, dir } = await fixture();
    const statePath = path.join(dir, 'telegram-approval-requests.jsonl');
    const result = await sendTelegramDiscoveryApprovalRequest({
      reportPath,
      indexPath,
      statePath,
      dryRun: true,
      env: { TELEGRAM_BOT_TOKEN: '123456:SUPER_SECRET_TOKEN', TELEGRAM_CHAT_ID: '987654321' },
    });
    const raw = JSON.stringify(result);
    expect(raw).not.toContain('SUPER_SECRET_TOKEN');
    expect(raw).not.toContain('987654321');
    expect(result.telegram.botToken).toBe('[REDACTED]');
    expect(result.telegram.chatId).toBe('[REDACTED]');
  });
});
