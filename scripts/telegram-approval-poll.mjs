#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatHumanTelegramMessage } from './telegram-message-format.mjs';

export const DEFAULT_TELEGRAM_APPROVAL_REQUESTS_PATH = '/root/.hermes/reports/github-discovery/telegram-approval-requests.jsonl';
export const DEFAULT_TELEGRAM_CODE_EDIT_APPROVAL_PACKETS_PATH = '/root/.hermes/reports/github-discovery/telegram-code-edit-approval-packets.jsonl';
export const DEFAULT_TELEGRAM_APPROVAL_DECISIONS_PATH = '/root/.hermes/reports/github-discovery/telegram-approval-decisions.jsonl';
export const DEFAULT_TELEGRAM_APPROVAL_OFFSET_PATH = '/root/.hermes/reports/github-discovery/telegram-approval-offset.json';
export const LEGACY_CODE_EDIT_APPROVAL_ID = 'code_edit_build_impl_tg4_d3fd7da71ae557f3_8f61483465_d7420c166e_a033e3539084';

const SIDE_EFFECT_FLAGS = Object.freeze({
  executor: false,
  clone: false,
  fork: false,
  runCode: false,
  installDependencies: false,
  createRepo: false,
  push: false,
  prOpen: false,
  merge: false,
  delete: false,
  githubWrites: false,
  auditAppend: false,
  durableMutation: false,
  obsidianKanbanWrites: false,
});

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--requests-path') args.requestsPath = argv[++i];
    else if (arg === '--code-edit-approval-packets-path') args.codeEditApprovalPacketsPath = argv[++i];
    else if (arg === '--decisions-path') args.decisionsPath = argv[++i];
    else if (arg === '--offset-path') args.offsetPath = argv[++i];
    else if (arg === '--env-file') args.envFile = argv[++i];
    else if (arg === '--bot-token') args.botToken = argv[++i];
    else if (arg === '--chat-id') args.chatId = argv[++i];
    else if (arg === '--now') args.now = argv[++i];
    else args._.push(arg);
  }
  return args;
}

function requireJson(args) {
  if (!args.json) throw new Error('telegram-approval-poll is intentionally JSON-only. Pass --json.');
}

function sanitizeError(error) {
  return String(error?.message || error || 'unknown error')
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]')
    .replace(/(botToken|chatId|chat_id|token)=[^\s&]+/gi, '$1=[REDACTED]');
}

function parseEnvContent(content) {
  const parsed = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    parsed[key] = value;
  }
  return parsed;
}

async function readOptionalEnvFile(envFile) {
  try {
    return parseEnvContent(await readFile(envFile, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

export function defaultTelegramEnvFile() {
  return path.join(os.homedir(), '.hermes', '.env');
}

export async function resolveTelegramApprovalCredentials(env = process.env, overrides = {}) {
  const fileEnv = await readOptionalEnvFile(overrides.envFile || defaultTelegramEnvFile());
  const merged = { ...fileEnv, ...env };
  const botToken = overrides.botToken || merged.TELEGRAM_BOT_TOKEN || merged.HERMES_TELEGRAM_BOT_TOKEN || merged.TG_BOT_TOKEN || null;
  const chatId = overrides.chatId || merged.TELEGRAM_CHAT_ID || merged.HERMES_TELEGRAM_CHAT_ID || merged.TG_CHAT_ID || null;
  return {
    botToken,
    chatId: chatId == null ? null : String(chatId),
    redacted: {
      botToken: botToken ? '[REDACTED]' : null,
      chatId: chatId ? '[REDACTED]' : null,
    },
  };
}

async function readJsonl(pathname) {
  try {
    const content = await readFile(pathname, 'utf8');
    return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendJsonl(pathname, row) {
  await mkdir(path.dirname(pathname), { recursive: true });
  await appendFile(pathname, `${JSON.stringify(row)}\n`, 'utf8');
}

async function readOffset(offsetPath) {
  try {
    const parsed = JSON.parse(await readFile(offsetPath, 'utf8'));
    return Number.isSafeInteger(parsed.offset) ? parsed.offset : 0;
  } catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
}

async function writeOffset(offsetPath, offset, now) {
  await mkdir(path.dirname(offsetPath), { recursive: true });
  await writeFile(offsetPath, `${JSON.stringify({ offset, updated_at: new Date(now).toISOString(), sanitized: true }, null, 2)}\n`, 'utf8');
}

function parseDecisionCommand(text) {
  const match = String(text || '').trim().match(/^\/(approve|reject)\s+(tg4_[a-f0-9]{16}|[A-Za-z0-9_-]+)$/);
  if (!match) return null;
  return { decision: match[1] === 'approve' ? 'approved' : 'rejected', approval_token: match[2] };
}

export function shortAliasForApprovalId(approvalId) {
  const id = String(approvalId || '');
  if (id === LEGACY_CODE_EDIT_APPROVAL_ID) return 'edit1';
  const trailingHex = id.match(/([a-f0-9]{8})[a-f0-9]*$/i);
  if (trailingHex) return trailingHex[1].toLowerCase();
  const safe = id.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 12);
  return safe || null;
}

function normalizeDiscoveryApprovalRequest(row) {
  if (!row?.approval_id || row?.status !== 'requested') return null;
  const shortAlias = row.short_alias || shortAliasForApprovalId(row.approval_id);
  return {
    ...row,
    approval_id: row.approval_id,
    short_alias: shortAlias,
    approval_command: `/approve ${shortAlias}`,
    reject_command: `/reject ${shortAlias}`,
  };
}

function normalizeCodeEditApprovalPacket(row) {
  const approvalId = row?.approval_id || row?.code_edit_approval_id;
  if (!approvalId) return null;
  if (row.status && row.status !== 'requested') return null;
  const shortAlias = row.short_alias || shortAliasForApprovalId(approvalId);
  return {
    approval_id: approvalId,
    short_alias: shortAlias,
    approval_command: `/approve ${shortAlias}`,
    reject_command: `/reject ${shortAlias}`,
    report_path: row.report_path || row.approval_packet_report_path || null,
    report_hash: row.report_hash || row.approval_packet_report_hash || null,
    selected_repo: row.selected_repo || row.target_workspace || null,
    recommended_next_action: row.recommended_next_action || 'code_edit_approval',
    expires_at: row.expires_at || row.expiry_time || null,
    status: 'requested',
  };
}

function pendingApprovalRequests(requestRows, codeEditPacketRows) {
  return [
    ...requestRows.map(normalizeDiscoveryApprovalRequest),
    ...codeEditPacketRows.map(normalizeCodeEditApprovalPacket),
  ].filter(Boolean);
}

function requestByApprovalToken(requestRows, approvalToken) {
  const exactId = requestRows.find((row) => row?.approval_id === approvalToken) || null;
  if (exactId) return { request: exactId, reason: null, aliasUsed: null };
  const aliasMatches = requestRows.filter((row) => row?.short_alias === approvalToken);
  if (aliasMatches.length === 1) return { request: aliasMatches[0], reason: null, aliasUsed: approvalToken };
  if (aliasMatches.length > 1) return { request: null, reason: 'AMBIGUOUS_APPROVAL_ALIAS', aliasUsed: approvalToken };
  return { request: null, reason: 'UNKNOWN_APPROVAL_ID', aliasUsed: approvalToken };
}

function existingDecision(decisionRows, approvalId) {
  return decisionRows.find((row) => row?.approval_id === approvalId && (row?.status === 'approved' || row?.status === 'rejected')) || null;
}

function isExpired(request, now) {
  const expiresAt = request?.expires_at || request?.expiry_time;
  if (!expiresAt) return true;
  const expiryMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs)) return true;
  return expiryMs <= new Date(now).getTime();
}

function safeMessageSummary(update, reason, extra = {}) {
  return {
    telegram_update_id: update?.update_id ?? null,
    telegram_message_id: update?.message?.message_id ?? null,
    accepted: false,
    reason,
    ...extra,
  };
}

async function fetchTelegramUpdates({ credentials, offset, fetchImpl = globalThis.fetch } = {}) {
  if (!credentials.botToken || !credentials.chatId) {
    return { ok: false, blocked: true, reason: 'MISSING_TELEGRAM_CREDENTIALS', updates: [] };
  }
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable for Telegram getUpdates.');
  const url = `https://api.telegram.org/bot${credentials.botToken}/getUpdates?timeout=0&allowed_updates=%5B%22message%22%5D${offset ? `&offset=${offset}` : ''}`;
  const response = await fetchImpl(url, { method: 'GET' });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || body?.ok === false) throw new Error(`Telegram getUpdates failed with status ${response.status}`);
  return { ok: true, updates: Array.isArray(body?.result) ? body.result : [] };
}

export async function pollTelegramApprovals({
  requestsPath = DEFAULT_TELEGRAM_APPROVAL_REQUESTS_PATH,
  codeEditApprovalPacketsPath = DEFAULT_TELEGRAM_CODE_EDIT_APPROVAL_PACKETS_PATH,
  decisionsPath = DEFAULT_TELEGRAM_APPROVAL_DECISIONS_PATH,
  offsetPath = DEFAULT_TELEGRAM_APPROVAL_OFFSET_PATH,
  dryRun = false,
  env = process.env,
  envFile = defaultTelegramEnvFile(),
  botToken,
  chatId,
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  const credentials = await resolveTelegramApprovalCredentials(env, { envFile, botToken, chatId });
  const offsetBefore = await readOffset(offsetPath);
  const [requestStateRows, codeEditPacketRows] = await Promise.all([
    readJsonl(requestsPath),
    readJsonl(codeEditApprovalPacketsPath),
  ]);
  const requestRows = pendingApprovalRequests(requestStateRows, codeEditPacketRows);
  const initialDecisionRows = await readJsonl(decisionsPath);
  const fetchResult = await fetchTelegramUpdates({ credentials, offset: offsetBefore, fetchImpl });

  if (fetchResult.blocked) {
    return {
      ok: false,
      blocked: true,
      reason: fetchResult.reason,
      mode: dryRun ? 'telegram_approval_poll_dry_run' : 'telegram_approval_poll',
      dryRun,
      telegram: credentials.redacted,
      offset_before: offsetBefore,
      offset_after: offsetBefore,
      offsetUpdated: false,
      decisionsAppended: 0,
      decision_rows: [],
      handled_updates: [],
      ...SIDE_EFFECT_FLAGS,
      note: 'No state changed.',
    };
  }

  const handled = [];
  const decisionRows = [...initialDecisionRows];
  const appendedRows = [];
  let maxSeenUpdateId = null;

  for (const update of fetchResult.updates) {
    if (Number.isSafeInteger(update?.update_id)) maxSeenUpdateId = Math.max(maxSeenUpdateId ?? update.update_id, update.update_id);
    const message = update?.message || null;
    const updateChatId = message?.chat?.id == null ? null : String(message.chat.id);
    if (!message || updateChatId !== credentials.chatId) {
      handled.push(safeMessageSummary(update, 'WRONG_CHAT_OR_NO_MESSAGE'));
      continue;
    }

    const parsed = parseDecisionCommand(message.text || '');
    if (!parsed) {
      handled.push(safeMessageSummary(update, 'MALFORMED_COMMAND'));
      continue;
    }

    const resolved = requestByApprovalToken(requestRows, parsed.approval_token);
    const request = resolved.request;
    if (!request) {
      handled.push(safeMessageSummary(update, resolved.reason, { approval_alias_used: resolved.aliasUsed }));
      continue;
    }
    if (isExpired(request, now)) {
      handled.push(safeMessageSummary(update, 'EXPIRED_APPROVAL_ID', { approval_id: request.approval_id, approval_alias_used: resolved.aliasUsed }));
      continue;
    }
    if (existingDecision(decisionRows, request.approval_id)) {
      handled.push(safeMessageSummary(update, 'ALREADY_DECIDED', { approval_id: request.approval_id, approval_alias_used: resolved.aliasUsed }));
      continue;
    }

    const row = {
      approval_id: request.approval_id,
      approval_alias_used: resolved.aliasUsed,
      decision: parsed.decision,
      decided_at: new Date(now).toISOString(),
      report_path: request.report_path,
      report_hash: request.report_hash,
      selected_repo: request.selected_repo,
      recommended_next_action: request.recommended_next_action,
      telegram_update_id: update.update_id,
      telegram_message_id: message.message_id,
      telegram_chat_verified: true,
      status: parsed.decision,
      sanitized: true,
    };
    if (!dryRun) await appendJsonl(decisionsPath, row);
    decisionRows.push(row);
    appendedRows.push(row);
    handled.push({
      telegram_update_id: update.update_id,
      telegram_message_id: message.message_id,
      accepted: true,
      approval_id: request.approval_id,
      approval_alias_used: resolved.aliasUsed,
      decision: parsed.decision,
      telegram_message_text: formatHumanTelegramMessage({
        type: 'approval-recorded',
        approval_id: request.approval_id,
        alias: request.short_alias,
        decision: parsed.decision,
        report_path: request.report_path,
      }),
    });
  }

  const offsetAfter = maxSeenUpdateId == null ? offsetBefore : maxSeenUpdateId + 1;
  if (!dryRun && offsetAfter !== offsetBefore) await writeOffset(offsetPath, offsetAfter, now);

  return {
    ok: true,
    mode: dryRun ? 'telegram_approval_poll_dry_run' : 'telegram_approval_poll',
    dryRun,
    telegram: credentials.redacted,
    getUpdatesCalled: true,
    offset_before: offsetBefore,
    offset_after: dryRun ? offsetBefore : offsetAfter,
    computed_offset_after: offsetAfter,
    offsetUpdated: !dryRun && offsetAfter !== offsetBefore,
    requestsLoaded: requestRows.length,
    codeEditApprovalPacketsLoaded: codeEditPacketRows.length,
    existingDecisionsLoaded: initialDecisionRows.length,
    updatesSeen: fetchResult.updates.length,
    decisionsAppended: dryRun ? 0 : appendedRows.length,
    decision_rows: dryRun ? [] : appendedRows,
    dry_run_decision_rows: dryRun ? appendedRows : undefined,
    handled_updates: handled,
    approvalOneShotReplayBlocked: true,
    ...SIDE_EFFECT_FLAGS,
    note: dryRun ? 'Dry-run only. No decision row appended and no offset advanced.' : 'Approval/rejection decisions recorded only after validation. No executor ran.',
  };
}

export async function runTelegramApprovalPollCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  requireJson(args);
  const result = await pollTelegramApprovals({
    requestsPath: args.requestsPath || DEFAULT_TELEGRAM_APPROVAL_REQUESTS_PATH,
    codeEditApprovalPacketsPath: args.codeEditApprovalPacketsPath || DEFAULT_TELEGRAM_CODE_EDIT_APPROVAL_PACKETS_PATH,
    decisionsPath: args.decisionsPath || DEFAULT_TELEGRAM_APPROVAL_DECISIONS_PATH,
    offsetPath: args.offsetPath || DEFAULT_TELEGRAM_APPROVAL_OFFSET_PATH,
    dryRun: args.dryRun === true,
    envFile: args.envFile || defaultTelegramEnvFile(),
    botToken: args.botToken,
    chatId: args.chatId,
    now: args.now ? new Date(args.now) : new Date(),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runTelegramApprovalPollCli().catch((error) => {
    const safe = {
      ok: false,
      error: sanitizeError(error),
      telegram: { botToken: null, chatId: null },
      offsetUpdated: false,
      decisionsAppended: 0,
      decision_rows: [],
      ...SIDE_EFFECT_FLAGS,
      note: 'No executor ran. No approval decision recorded after this error.',
    };
    process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
    process.exitCode = 1;
  });
}
