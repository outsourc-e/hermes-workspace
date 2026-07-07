#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

export const TELEGRAM_CHAT_ENV_KEY = 'HERMES_TELEGRAM_CHAT_ID';
export const SIDE_EFFECT_FLAGS = Object.freeze({
  sentTelegramMessages: false,
  githubCalls: false,
  githubWrites: false,
  auditAppend: false,
  durableMutation: false,
  obsidianKanbanWrites: false,
  approvalActions: false,
});

const SECRET_RE = /bot\d+:[A-Za-z0-9_-]+|\b\d{5,}:[A-Za-z0-9_-]+\b/g;

export function redact(value) {
  return value ? '[REDACTED]' : null;
}

function safeErrorMessage(error) {
  return String(error?.message || error).replace(SECRET_RE, '[REDACTED]');
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--expected-nonce') args.expectedNonce = argv[++i];
    else if (arg === '--chat-id') args.chatId = argv[++i];
    else if (arg === '--env-file') args.envFile = argv[++i];
    else if (arg === '--bot-token') args.botToken = argv[++i];
    else if (arg === '--mock-updates-file') args.mockUpdatesFile = argv[++i];
    else args._.push(arg);
  }
  return args;
}

function requireJson(args) {
  if (!args.json) throw new Error('This CLI is intentionally JSON-only. Pass --json.');
}

export function defaultEnvFile() {
  return path.join(os.homedir(), '.hermes', '.env');
}

function parseEnvContent(content) {
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function readEnvFile(envFile) {
  try {
    return await readFile(envFile, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

async function resolveCredentialState({ env = process.env, envFile = defaultEnvFile(), botToken } = {}) {
  const fileContent = await readEnvFile(envFile);
  const fileEnv = parseEnvContent(fileContent);
  const token = botToken || env.TELEGRAM_BOT_TOKEN || env.HERMES_TELEGRAM_BOT_TOKEN || env.TG_BOT_TOKEN || fileEnv.TELEGRAM_BOT_TOKEN || fileEnv.HERMES_TELEGRAM_BOT_TOKEN || fileEnv.TG_BOT_TOKEN || null;
  const chatId = env.HERMES_TELEGRAM_CHAT_ID || env.TELEGRAM_CHAT_ID || env.TG_CHAT_ID || fileEnv.HERMES_TELEGRAM_CHAT_ID || fileEnv.TELEGRAM_CHAT_ID || fileEnv.TG_CHAT_ID || null;
  return { token, chatId, envFile, fileContent };
}

export async function telegramNotificationCredentialsStatus({ env = process.env, envFile = defaultEnvFile(), botToken } = {}) {
  const state = await resolveCredentialState({ env, envFile, botToken });
  return {
    ok: true,
    mode: 'status',
    token_present: Boolean(state.token),
    chat_id_present: Boolean(state.chatId),
    telegram: {
      botToken: redact(state.token),
      chatId: redact(state.chatId),
    },
    next_nonce: crypto.randomBytes(9).toString('base64url'),
    note: state.chatId ? 'Telegram chat is registered. Values redacted.' : 'Send next_nonce to the Hermes Telegram bot, then run telegram-register-chat --expected-nonce <nonce> --json.',
    ...SIDE_EFFECT_FLAGS,
  };
}

function extractMessageText(update) {
  return update?.message?.text ?? update?.edited_message?.text ?? update?.channel_post?.text ?? null;
}

function extractChatId(update) {
  return update?.message?.chat?.id ?? update?.edited_message?.chat?.id ?? update?.channel_post?.chat?.id ?? null;
}

export function findChatIdByNonce(updates, expectedNonce) {
  const matches = updates
    .map((update) => ({ text: extractMessageText(update), chatId: extractChatId(update) }))
    .filter((entry) => entry.chatId !== null && entry.chatId !== undefined && typeof entry.text === 'string' && entry.text.trim() === expectedNonce);

  const unique = [...new Set(matches.map((entry) => String(entry.chatId)))];
  if (unique.length === 0) return { ok: false, reason: 'NONCE_NOT_FOUND' };
  if (unique.length > 1) return { ok: false, reason: 'MULTIPLE_MATCHING_CHATS' };
  return { ok: true, chatId: unique[0] };
}

function renderEnvLine(key, value) {
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${key}="${escaped}"`;
}

function upsertEnvValue(content, key, value) {
  const line = renderEnvLine(key, value);
  const lines = content.split(/\r?\n/);
  let replaced = false;
  const next = lines.map((existing) => {
    if (existing.match(new RegExp(`^\\s*${key}\\s*=`))) {
      replaced = true;
      return line;
    }
    return existing;
  });
  if (!replaced) {
    if (next.length && next.at(-1) !== '') next.push('');
    next.push(line);
  }
  return `${next.join('\n').replace(/\n+$/u, '')}\n`;
}

async function storeChatId({ envFile = defaultEnvFile(), chatId }) {
  const content = await readEnvFile(envFile);
  const next = upsertEnvValue(content, TELEGRAM_CHAT_ENV_KEY, chatId);
  await writeFile(envFile, next, { encoding: 'utf8', mode: 0o600 });
}

async function getUpdatesOnce({ token, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable for Telegram getUpdates.');
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/getUpdates`, { method: 'GET' });
  if (!response.ok) throw new Error(`Telegram getUpdates failed with status ${response.status}`);
  const body = await response.json();
  if (body?.ok === false) throw new Error('Telegram getUpdates returned ok=false.');
  return Array.isArray(body?.result) ? body.result : [];
}

export async function registerTelegramChat({ expectedNonce, chatId, env = process.env, envFile = defaultEnvFile(), botToken, fetchImpl = globalThis.fetch, updates } = {}) {
  if (!expectedNonce && !chatId) throw new Error('telegram-register-chat requires --expected-nonce or explicit --chat-id manual mode.');
  const state = await resolveCredentialState({ env, envFile, botToken });
  if (!state.token && expectedNonce) {
    return {
      ok: false,
      mode: 'register',
      registered: false,
      blocked: true,
      reason: 'MISSING_TELEGRAM_BOT_TOKEN',
      token_present: false,
      chat_id_present: Boolean(state.chatId),
      telegram: { botToken: null, chatId: redact(state.chatId) },
      ...SIDE_EFFECT_FLAGS,
      note: 'No action taken.',
    };
  }

  let selectedChatId = chatId ? String(chatId) : null;
  let telegramGetUpdatesCalls = 0;
  if (!selectedChatId) {
    const telegramUpdates = updates || await getUpdatesOnce({ token: state.token, fetchImpl });
    telegramGetUpdatesCalls = updates ? 0 : 1;
    const match = findChatIdByNonce(telegramUpdates, expectedNonce);
    if (!match.ok) {
      return {
        ok: false,
        mode: 'register',
        registered: false,
        blocked: true,
        reason: match.reason,
        token_present: true,
        chat_id_present: Boolean(state.chatId),
        telegramGetUpdatesCalls,
        telegram: { botToken: redact(state.token), chatId: redact(state.chatId) },
        ...SIDE_EFFECT_FLAGS,
        note: 'No chat ID stored.',
      };
    }
    selectedChatId = match.chatId;
  }

  await storeChatId({ envFile, chatId: selectedChatId });
  return {
    ok: true,
    mode: 'register',
    registered: true,
    token_present: Boolean(state.token),
    chat_id_present: true,
    telegramGetUpdatesCalls,
    telegram: { botToken: redact(state.token), chatId: redact(selectedChatId) },
    ...SIDE_EFFECT_FLAGS,
    note: 'Stored matching Telegram chat ID. Values redacted. No Telegram message sent.',
  };
}

export async function runTelegramChatRegistrationCli(argv = process.argv.slice(2), invokedPath = process.argv[1] || '') {
  const args = parseArgs(argv);
  requireJson(args);
  const command = path.basename(invokedPath).includes('register') ? 'register' : 'status';
  let updates;
  if (args.mockUpdatesFile) {
    const mock = JSON.parse(await readFile(args.mockUpdatesFile, 'utf8'));
    updates = Array.isArray(mock) ? mock : mock.result;
  }
  const result = command === 'register'
    ? await registerTelegramChat({
        expectedNonce: args.expectedNonce,
        chatId: args.chatId,
        envFile: args.envFile || defaultEnvFile(),
        botToken: args.botToken,
        updates,
      })
    : await telegramNotificationCredentialsStatus({
        envFile: args.envFile || defaultEnvFile(),
        botToken: args.botToken,
      });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runTelegramChatRegistrationCli().catch((error) => {
    process.stdout.write(`${JSON.stringify({ ok: false, error: safeErrorMessage(error), ...SIDE_EFFECT_FLAGS, note: 'No action taken.' }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
