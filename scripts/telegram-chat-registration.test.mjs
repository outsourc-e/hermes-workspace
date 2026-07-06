import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  findChatIdByNonce,
  registerTelegramChat,
  telegramNotificationCredentialsStatus,
} from './telegram-chat-registration.mjs';

const execFileAsync = promisify(execFile);

async function fixtureEnv(content = 'HERMES_TELEGRAM_BOT_TOKEN="123456:SUPER_SECRET_TOKEN"\n') {
  const dir = await mkdtemp(path.join(tmpdir(), 'tg-chat-reg-'));
  const envFile = path.join(dir, '.env');
  await writeFile(envFile, content, 'utf8');
  return { dir, envFile };
}

function updatesFor(chatId, text) {
  return [{ update_id: 1, message: { message_id: 2, text, chat: { id: chatId, type: 'private' } } }];
}

describe('telegram chat registration', () => {
  it('status shows token present and chat id missing without printing secrets', async () => {
    const { envFile } = await fixtureEnv();
    const result = await telegramNotificationCredentialsStatus({ env: {}, envFile });
    expect(result.ok).toBe(true);
    expect(result.token_present).toBe(true);
    expect(result.chat_id_present).toBe(false);
    expect(result.telegram.botToken).toBe('[REDACTED]');
    expect(result.telegram.chatId).toBeNull();
    expect(result.next_nonce).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.stringify(result)).not.toContain('SUPER_SECRET_TOKEN');
    expect(result.sentTelegramMessages).toBe(false);
    expect(result.githubCalls).toBe(false);
    expect(result.auditAppend).toBe(false);
    expect(result.durableMutation).toBe(false);
    expect(result.obsidianKanbanWrites).toBe(false);
    expect(result.approvalActions).toBe(false);
  });

  it('registers exactly one chat by matching nonce from mocked getUpdates data', async () => {
    const { envFile } = await fixtureEnv();
    const result = await registerTelegramChat({
      expectedNonce: 'nonce-abc',
      env: {},
      envFile,
      updates: updatesFor('987654321', 'nonce-abc'),
    });
    expect(result.ok).toBe(true);
    expect(result.registered).toBe(true);
    expect(result.chat_id_present).toBe(true);
    expect(result.telegram.chatId).toBe('[REDACTED]');
    expect(JSON.stringify(result)).not.toContain('987654321');
    expect(JSON.stringify(result)).not.toContain('SUPER_SECRET_TOKEN');
    const stored = await readFile(envFile, 'utf8');
    expect(stored).toContain('HERMES_TELEGRAM_CHAT_ID="987654321"');
  });

  it('calls Telegram getUpdates exactly once with mocked fetch and never sends a message', async () => {
    const { envFile } = await fixtureEnv();
    const calls = [];
    const result = await registerTelegramChat({
      expectedNonce: 'nonce-fetch',
      env: {},
      envFile,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ ok: true, result: updatesFor('987654321', 'nonce-fetch') }) };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.telegramGetUpdatesCalls).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/getUpdates');
    expect(calls[0].url).not.toContain('/sendMessage');
    expect(result.sentTelegramMessages).toBe(false);
  });

  it('mismatched nonce blocks and does not store chat id', async () => {
    const { envFile } = await fixtureEnv();
    const result = await registerTelegramChat({
      expectedNonce: 'wanted',
      env: {},
      envFile,
      updates: updatesFor('987654321', 'wrong'),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('NONCE_NOT_FOUND');
    const stored = await readFile(envFile, 'utf8');
    expect(stored).not.toContain('HERMES_TELEGRAM_CHAT_ID');
  });

  it('multiple matching chats block unless exactly one chat matches', () => {
    const blocked = findChatIdByNonce([
      ...updatesFor('111', 'same'),
      ...updatesFor('222', 'same'),
    ], 'same');
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe('MULTIPLE_MATCHING_CHATS');

    const allowed = findChatIdByNonce([
      ...updatesFor('111', 'same'),
      ...updatesFor('111', 'same'),
      ...updatesFor('222', 'different'),
    ], 'same');
    expect(allowed.ok).toBe(true);
    expect(allowed.chatId).toBe('111');
  });

  it('after registration, status shows chat id present with redacted output', async () => {
    const { envFile } = await fixtureEnv();
    await registerTelegramChat({ expectedNonce: 'nonce', env: {}, envFile, updates: updatesFor('987654321', 'nonce') });
    const result = await telegramNotificationCredentialsStatus({ env: {}, envFile });
    expect(result.chat_id_present).toBe(true);
    expect(result.telegram.chatId).toBe('[REDACTED]');
    expect(JSON.stringify(result)).not.toContain('987654321');
  });

  it('CLI status and mocked registration are JSON-only and secret-redacted', async () => {
    const { dir, envFile } = await fixtureEnv();
    const mockUpdatesFile = path.join(dir, 'updates.json');
    await writeFile(mockUpdatesFile, JSON.stringify({ ok: true, result: updatesFor('987654321', 'nonce-cli') }), 'utf8');
    const status = await execFileAsync('node', ['bin/telegram-notification-credentials-status', '--json', '--env-file', envFile], {
      cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' },
    });
    const before = JSON.parse(status.stdout);
    expect(before.token_present).toBe(true);
    expect(before.chat_id_present).toBe(false);

    const registration = await execFileAsync('node', ['bin/telegram-register-chat', '--json', '--env-file', envFile, '--expected-nonce', 'nonce-cli', '--mock-updates-file', mockUpdatesFile], {
      cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' },
    });
    const registered = JSON.parse(registration.stdout);
    expect(registered.ok).toBe(true);
    expect(registered.sentTelegramMessages).toBe(false);
    expect(registered.githubCalls).toBe(false);
    expect(registered.githubWrites).toBe(false);
    expect(registered.auditAppend).toBe(false);
    expect(registered.durableMutation).toBe(false);
    expect(registered.obsidianKanbanWrites).toBe(false);
    expect(registered.approvalActions).toBe(false);
    expect(registration.stdout).not.toContain('987654321');
    expect(registration.stdout).not.toContain('SUPER_SECRET_TOKEN');
  });
});
