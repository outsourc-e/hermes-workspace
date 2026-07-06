#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatHumanTelegramMessage } from './telegram-message-format.mjs';

export const DEFAULT_DISCOVERY_INDEX_PATH = '/root/.hermes/reports/github-discovery/index.jsonl';
export const DEFAULT_TELEGRAM_APPROVAL_REQUESTS_PATH = '/root/.hermes/reports/github-discovery/telegram-approval-requests.jsonl';
export const ALLOWED_RECOMMENDATIONS = new Set(['use', 'fork', 'learn_from', 'avoid', 'build_from_scratch']);
export const APPROVAL_REQUEST_RECOMMENDATIONS = new Set(['use', 'fork', 'learn_from']);
export const SIDE_EFFECT_FLAGS = Object.freeze({
  githubCalls: false,
  githubWrites: false,
  cloneForkRunInstallCreateRepoPushPrMergeDelete: false,
  auditAppend: false,
  durableMutation: false,
  obsidianKanbanWrites: false,
});

export function redactSecret(value) {
  if (!value) return null;
  return '[REDACTED]';
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--report-path') args.reportPath = argv[++i];
    else if (arg === '--index-path') args.indexPath = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--mock-send') args.mockSend = true;
    else if (arg === '--state-path') args.statePath = argv[++i];
    else if (arg === '--env-file') args.envFile = argv[++i];
    else if (arg === '--bot-token') args.botToken = argv[++i];
    else if (arg === '--chat-id') args.chatId = argv[++i];
    else if (arg === '--now') args.now = argv[++i];
    else if (arg === '--ttl-minutes') args.ttlMinutes = Number(argv[++i]);
    else args._.push(arg);
  }
  return args;
}

function requireJson(args) {
  if (!args.json) throw new Error('This CLI is intentionally JSON-only. Pass --json.');
}

function firstMatch(text, regex, fallback = null) {
  const match = text.match(regex);
  return match ? match[1].trim() : fallback;
}

function normalizeRecommendation(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_RECOMMENDATIONS.has(normalized) ? normalized : 'avoid';
}

function stripSensitiveIdeaBody(report) {
  const sensitive = /idea_body_sensitive\s*[:=]\s*true|sensitive\s*[:=]\s*true|marked sensitive/i.test(report);
  if (!sensitive) return { sensitiveIdeaBodyOmitted: false };
  return { sensitiveIdeaBodyOmitted: true };
}

function parseCandidatesFromMarkdown(report) {
  const sections = report.split(/\n###\s+\d+\.\s+/).slice(1);
  return sections.slice(0, 3).map((section) => {
    const lines = section.split('\n');
    const fullName = lines[0]?.trim() || 'UNKNOWN';
    return {
      full_name: fullName,
      html_url: firstMatch(section, /^- URL:\s*(.+)$/m, null),
      recommendation: normalizeRecommendation(firstMatch(section, /^- Recommendation:\s*(.+)$/m, 'avoid')),
      score: Number(firstMatch(section, /^- Score:\s*(\d+)$/m, '0')),
      stars: Number(firstMatch(section, /^- Stars:\s*(\d+)$/m, '0')),
    };
  });
}

export function parseDiscoveryReportMarkdown(report, reportPath) {
  const titleLine = firstMatch(report, /^# GitHub discovery report:\s*(.+)$/m, 'UNKNOWN');
  const ideaTitle = titleLine.replace(/\s+/g, ' ').trim();
  const recommendation = normalizeRecommendation(firstMatch(report, /^Recommendation:\s*(.+)$/m, 'avoid'));
  const candidates = parseCandidatesFromMarkdown(report);
  return {
    ideaTitle,
    recommendation,
    topCandidates: candidates,
    reportPath,
    ...stripSensitiveIdeaBody(report),
  };
}

function normalizeIndexCandidate(candidate) {
  return {
    full_name: candidate.full_name || candidate.name || 'UNKNOWN',
    html_url: candidate.html_url || candidate.url || null,
    recommendation: normalizeRecommendation(candidate.recommendation),
    score: Number(candidate.score || 0),
    stars: Number(candidate.stars || 0),
  };
}

function mergeIndexRecord(reportData, indexRecord) {
  if (!indexRecord) return reportData;
  return {
    ...reportData,
    ideaTitle: indexRecord.idea_title || reportData.ideaTitle,
    recommendation: normalizeRecommendation(indexRecord.recommendation || reportData.recommendation),
    topCandidates: Array.isArray(indexRecord.top_candidate_summaries)
      ? indexRecord.top_candidate_summaries.slice(0, 3).map(normalizeIndexCandidate)
      : reportData.topCandidates,
    source: indexRecord.source || null,
    sanitized: indexRecord.sanitized === true,
  };
}

export function formatTelegramDiscoveryNotification(reportData) {
  const candidates = Array.isArray(reportData.topCandidates) ? reportData.topCandidates.slice(0, 3) : [];
  const top = candidates[0] || {};
  const alias = shortAliasForApprovalId(`${reportData.ideaTitle || 'discovery'}-${top.full_name || 'repo'}`);
  return formatHumanTelegramMessage({
    type: 'discovery',
    idea_title: reportData.ideaTitle,
    repo: top.full_name || 'UNKNOWN',
    recommendation: reportData.recommendation,
    alias,
    report_path: reportData.reportPath,
  });
}

function normalizeActionLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function selectApprovalCandidate(reportData) {
  const reportRecommendation = normalizeActionLabel(reportData.recommendation);
  const candidates = Array.isArray(reportData.topCandidates) ? reportData.topCandidates : [];
  const selected = candidates[0] || null;
  if (!selected) throw new Error('No selected repository candidate found in discovery report.');
  const candidateRecommendation = normalizeActionLabel(selected.recommendation);
  const recommendedNextAction = APPROVAL_REQUEST_RECOMMENDATIONS.has(reportRecommendation) ? reportRecommendation : candidateRecommendation;
  if (!APPROVAL_REQUEST_RECOMMENDATIONS.has(recommendedNextAction)) {
    throw new Error(`Approval request preview is only available for use/fork/learn_from recommendations. Got: ${recommendedNextAction}`);
  }
  return { selected, recommendedNextAction };
}

function buildApprovalId({ ideaTitle, selectedRepo, recommendedNextAction, reportPath }) {
  const seed = [ideaTitle, selectedRepo, recommendedNextAction, reportPath].join('\n');
  return `tg4_${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
}

function shortAliasForApprovalId(approvalId) {
  const match = String(approvalId || '').match(/([a-f0-9]{8})[a-f0-9]*$/i);
  return match ? match[1].toLowerCase() : String(approvalId || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 12);
}

function proposedScopeForAction(action, selectedRepo) {
  if (action === 'use') {
    return `Review ${selectedRepo} as a candidate implementation source in a later explicitly approved step: read public repo metadata/docs only, then produce a narrow adoption plan. No clone, install, run, fork, or GitHub write is approved by this preview.`;
  }
  if (action === 'fork') {
    return `Request explicit human approval for a later fork of ${selectedRepo}. This preview does not fork; the later approved scope must name the target account and audit path before any GitHub write.`;
  }
  return `Review ${selectedRepo} as a learning/reference source in a later explicitly approved step: read public metadata/docs only and extract lessons. No clone, install, run, fork, or GitHub write is approved by this preview.`;
}

export function formatTelegramApprovalRequestMessage(approval, { includeCommands = false, verbose = false } = {}) {
  return formatHumanTelegramMessage({
    type: 'approval',
    approval_id: approval.approval_id,
    alias: approval.short_alias,
    action: approval.recommended_next_action,
    recommendation: `Review ${approval.selected_repo.full_name}; approve only if this scope is right.`,
    if_approve: includeCommands
      ? `Reply /approve ${approval.short_alias} to allow this next step.`
      : 'This preview records no approval yet.',
    will_not: includeCommands
      ? 'No clone, fork, GitHub write, code edit, install, or executor run from this message alone.'
      : 'No approve/reject command is active, no Telegram send, no executor, and no GitHub write.',
    report_path: approval.report_path,
    verbose,
  });
}

export async function buildDiscoveryApprovalRequestPreview({ reportPath, indexPath = DEFAULT_DISCOVERY_INDEX_PATH, now = new Date(), ttlMinutes = 60 } = {}) {
  const notificationPreview = await buildDiscoveryNotificationPreview({ reportPath, indexPath });
  const reportData = notificationPreview.report;
  const { selected, recommendedNextAction } = selectApprovalCandidate(reportData);
  const selectedRepoName = selected.full_name || 'UNKNOWN';
  const expiry = new Date(new Date(now).getTime() + Number(ttlMinutes || 60) * 60 * 1000).toISOString();
  const approval = {
    approval_id: buildApprovalId({
      ideaTitle: reportData.ideaTitle,
      selectedRepo: selectedRepoName,
      recommendedNextAction,
      reportPath: reportData.reportPath,
    }),
    idea_title: reportData.ideaTitle,
    selected_repo: {
      full_name: selectedRepoName,
      html_url: selected.html_url || null,
      recommendation: normalizeActionLabel(selected.recommendation || recommendedNextAction),
      score: Number(selected.score || 0),
      stars: Number(selected.stars || 0),
    },
    recommended_next_action: recommendedNextAction,
    exact_proposed_scope: proposedScopeForAction(recommendedNextAction, selectedRepoName),
    allowed_side_effects: [
      'read existing discovery report/index from local disk',
      'generate JSON approval request preview on stdout',
      'generate Telegram-safe plain-text message preview',
    ],
    forbidden_side_effects: [
      'approve command',
      'reject command',
      'Telegram sendMessage call',
      'action execution',
      'clone',
      'fork',
      'GitHub API call or write',
      'repo creation/push/PR/merge/delete',
      'report/index/audit/durable-store write',
    ],
    expiry_time: expiry,
    report_path: reportData.reportPath,
  };
  approval.short_alias = shortAliasForApprovalId(approval.approval_id);
  approval.approve_command = `/approve ${approval.short_alias}`;
  approval.reject_command = `/reject ${approval.short_alias}`;
  return {
    ok: true,
    mode: 'approval_request_preview',
    sent: false,
    executed: false,
    approved: false,
    rejected: false,
    approval,
    approval_id: approval.approval_id,
    short_alias: approval.short_alias,
    approve_command: approval.approve_command,
    reject_command: approval.reject_command,
    idea_title: approval.idea_title,
    selected_repo: approval.selected_repo,
    recommended_next_action: approval.recommended_next_action,
    exact_proposed_scope: approval.exact_proposed_scope,
    allowed_side_effects: approval.allowed_side_effects,
    forbidden_side_effects: approval.forbidden_side_effects,
    expiry_time: approval.expiry_time,
    telegram_message_text: formatTelegramApprovalRequestMessage(approval),
    ...SIDE_EFFECT_FLAGS,
    note: 'No approve/reject commands. No action taken.',
  };
}

export function hashReportContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function readApprovalRequestRows(statePath = DEFAULT_TELEGRAM_APPROVAL_REQUESTS_PATH) {
  try {
    const content = await readFile(statePath, 'utf8');
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendApprovalRequestRow(statePath, row) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await appendFile(statePath, `${JSON.stringify(row)}\n`, 'utf8');
}

function approvalSendSideEffects({ sent = false, stateAppended = false } = {}) {
  return {
    sent,
    stateAppended,
    githubCalls: false,
    githubWrites: false,
    cloneForkRunInstallCreateRepoPushPrMergeDelete: false,
    auditAppend: false,
    durableMutation: false,
    obsidianKanbanWrites: false,
    getUpdatesPolling: false,
    approveRejectHandling: false,
    executor: false,
  };
}

async function sendTelegramApprovalMessage({ credentials, message, fetchImpl = globalThis.fetch, mockSend = false } = {}) {
  if (!credentials.botToken || !credentials.chatId) {
    return { ok: false, blocked: true, reason: 'MISSING_TELEGRAM_CREDENTIALS', messageId: null };
  }
  if (mockSend) return { ok: true, mocked: true, messageId: 'mock-message-id' };
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable for Telegram send.');
  const response = await fetchImpl(`https://api.telegram.org/bot${credentials.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: credentials.chatId,
      text: message,
      disable_web_page_preview: true,
    }),
  });
  let telegramOk = response.ok;
  let messageId = null;
  try {
    const body = await response.json();
    telegramOk = telegramOk && body.ok !== false;
    messageId = body?.result?.message_id ?? null;
  } catch {
    // Keep response metadata minimal and secret-free.
  }
  if (!telegramOk) throw new Error(`Telegram send failed with status ${response.status}`);
  return { ok: true, messageId };
}

export async function sendTelegramDiscoveryApprovalRequest({
  reportPath,
  indexPath = DEFAULT_DISCOVERY_INDEX_PATH,
  statePath = DEFAULT_TELEGRAM_APPROVAL_REQUESTS_PATH,
  dryRun = false,
  force = false,
  env = process.env,
  envFile = defaultTelegramEnvFile(),
  fetchImpl = globalThis.fetch,
  mockSend = false,
  botToken,
  chatId,
  now = new Date(),
  ttlMinutes = 60,
} = {}) {
  if (!reportPath) throw new Error('telegram-discovery-approval-send requires --report-path.');
  const resolvedReportPath = path.resolve(reportPath);
  const reportContent = await readFile(resolvedReportPath, 'utf8');
  const reportHash = hashReportContent(reportContent);
  const preview = await buildDiscoveryApprovalRequestPreview({ reportPath: resolvedReportPath, indexPath, now, ttlMinutes });
  const approval = {
    ...preview.approval,
    allowed_side_effects: dryRun
      ? preview.approval.allowed_side_effects
      : [
          ...preview.approval.allowed_side_effects,
          'send exactly one Telegram sendMessage approval request',
          'append one JSONL approval request state row after Telegram send succeeds',
        ],
    forbidden_side_effects: (dryRun
      ? preview.approval.forbidden_side_effects
      : preview.approval.forbidden_side_effects
        .filter((item) => item !== 'Telegram sendMessage call')
        .map((item) => item === 'report/index/audit/durable-store write'
          ? 'discovery report/index/audit/durable-store write except the approval request JSONL state row after successful send'
          : item)),
  };
  const message = formatTelegramApprovalRequestMessage(approval, { includeCommands: true });
  const existingRows = await readApprovalRequestRows(statePath);
  const duplicate = existingRows.find((row) => row.report_hash === reportHash && row.status === 'requested');
  const credentials = await resolveTelegramCredentialsWithEnvFile(env, { botToken, chatId, envFile });

  const base = {
    ok: true,
    mode: dryRun ? 'approval_send_dry_run' : 'approval_send',
    dryRun,
    force,
    approval_id: approval.approval_id,
    idea_title: approval.idea_title,
    selected_repo: approval.selected_repo,
    recommended_next_action: approval.recommended_next_action,
    exact_proposed_scope: approval.exact_proposed_scope,
    allowed_side_effects: approval.allowed_side_effects,
    forbidden_side_effects: approval.forbidden_side_effects,
    expiry_time: approval.expiry_time,
    short_alias: approval.short_alias,
    approve_command: approval.approve_command,
    reject_command: approval.reject_command,
    telegram_message_text: message,
    report_path: resolvedReportPath,
    report_hash: reportHash,
    state_path: statePath,
    telegram: credentials.redacted,
    ...approvalSendSideEffects({ sent: false, stateAppended: false }),
  };

  if (dryRun) {
    return { ...base, ok: true, note: 'Dry-run only. No Telegram send and no state write.' };
  }

  if (duplicate && !force) {
    return {
      ...base,
      ok: true,
      skipped: true,
      duplicate: true,
      existing_approval_id: duplicate.approval_id,
      existing_message_id: duplicate.message_id ?? null,
      note: 'Duplicate approval request skipped by report_hash. Use --force to send another request.',
    };
  }

  const sendResult = await sendTelegramApprovalMessage({ credentials, message, fetchImpl, mockSend });
  if (!sendResult.ok) {
    return {
      ...base,
      ok: false,
      blocked: true,
      reason: sendResult.reason,
      note: 'No state row appended because Telegram send did not succeed.',
    };
  }

  const sentAt = new Date(now).toISOString();
  const row = {
    approval_id: approval.approval_id,
    short_alias: approval.short_alias,
    approve_command: approval.approve_command,
    reject_command: approval.reject_command,
    report_path: resolvedReportPath,
    report_hash: reportHash,
    sent_at: sentAt,
    expires_at: approval.expiry_time,
    selected_repo: approval.selected_repo.full_name,
    recommended_next_action: approval.recommended_next_action,
    message_id: sendResult.messageId,
    status: 'requested',
  };
  await appendApprovalRequestRow(statePath, row);
  return {
    ...base,
    ok: true,
    sent: true,
    stateAppended: true,
    mocked: sendResult.mocked === true,
    message_id: sendResult.messageId,
    state_row: row,
    ...approvalSendSideEffects({ sent: true, stateAppended: true }),
    note: 'Telegram approval request sent. No approve/reject handling or executor ran.',
  };
}

export async function readLatestDiscoveryIndexRecord(indexPath = DEFAULT_DISCOVERY_INDEX_PATH) {
  const content = await readFile(indexPath, 'utf8');
  const records = content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((record) => record && record.report_path);
  if (!records.length) throw new Error(`No discovery reports found in index: ${indexPath}`);
  records.sort((a, b) => String(a.indexed_at || '').localeCompare(String(b.indexed_at || '')));
  return records.at(-1);
}

export async function findIndexRecordForReport(reportPath, indexPath = DEFAULT_DISCOVERY_INDEX_PATH) {
  try {
    const content = await readFile(indexPath, 'utf8');
    const resolved = path.resolve(reportPath);
    const records = content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    return records.find((record) => path.resolve(record.report_path || '') === resolved) || null;
  } catch {
    return null;
  }
}

export async function buildDiscoveryNotificationPreview({ reportPath, indexPath = DEFAULT_DISCOVERY_INDEX_PATH } = {}) {
  let selectedReportPath = reportPath;
  let indexRecord = null;
  if (!selectedReportPath) {
    indexRecord = await readLatestDiscoveryIndexRecord(indexPath);
    selectedReportPath = indexRecord.report_path;
  } else {
    indexRecord = await findIndexRecordForReport(selectedReportPath, indexPath);
  }

  if (!selectedReportPath) throw new Error('Missing report path.');
  const resolvedReportPath = path.resolve(selectedReportPath);
  const report = await readFile(resolvedReportPath, 'utf8');
  const reportData = mergeIndexRecord(parseDiscoveryReportMarkdown(report, resolvedReportPath), indexRecord);
  const message = formatTelegramDiscoveryNotification(reportData);

  return {
    ok: true,
    mode: 'preview',
    sent: false,
    message,
    report: {
      ideaTitle: reportData.ideaTitle,
      recommendation: reportData.recommendation,
      topCandidates: reportData.topCandidates.slice(0, 3),
      reportPath: resolvedReportPath,
      sensitiveIdeaBodyOmitted: reportData.sensitiveIdeaBodyOmitted === true,
    },
    telegram: {
      botToken: null,
      chatId: null,
    },
    ...SIDE_EFFECT_FLAGS,
    note: 'No action taken.',
  };
}

export function defaultTelegramEnvFile() {
  return path.join(os.homedir(), '.hermes', '.env');
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

async function readOptionalEnvFile(envFile) {
  try {
    return parseEnvContent(await readFile(envFile, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw error;
  }
}

export function resolveTelegramCredentials(env = process.env, overrides = {}) {
  const botToken = overrides.botToken || env.TELEGRAM_BOT_TOKEN || env.HERMES_TELEGRAM_BOT_TOKEN || env.TG_BOT_TOKEN || null;
  const chatId = overrides.chatId || env.TELEGRAM_CHAT_ID || env.HERMES_TELEGRAM_CHAT_ID || env.TG_CHAT_ID || null;
  return {
    botToken,
    chatId,
    redacted: {
      botToken: redactSecret(botToken),
      chatId: redactSecret(chatId),
    },
  };
}

async function resolveTelegramCredentialsWithEnvFile(env = process.env, overrides = {}) {
  const envFile = overrides.envFile || defaultTelegramEnvFile();
  const fileEnv = await readOptionalEnvFile(envFile);
  return resolveTelegramCredentials({ ...fileEnv, ...env }, overrides);
}

export async function sendTelegramDiscoveryNotification({ reportPath, indexPath = DEFAULT_DISCOVERY_INDEX_PATH, env = process.env, fetchImpl = globalThis.fetch, mockSend = false, botToken, chatId } = {}) {
  if (!reportPath) throw new Error('telegram-discovery-notification-send requires --report-path.');
  const preview = await buildDiscoveryNotificationPreview({ reportPath, indexPath });
  const credentials = resolveTelegramCredentials(env, { botToken, chatId });

  if (!credentials.botToken || !credentials.chatId) {
    return {
      ok: false,
      mode: 'send',
      sent: false,
      blocked: true,
      reason: 'MISSING_TELEGRAM_CREDENTIALS',
      message: preview.message,
      telegram: credentials.redacted,
      ...SIDE_EFFECT_FLAGS,
      note: 'No action taken.',
    };
  }

  if (mockSend) {
    return {
      ok: true,
      mode: 'send',
      sent: true,
      mocked: true,
      message: preview.message,
      telegram: credentials.redacted,
      ...SIDE_EFFECT_FLAGS,
      note: 'Mock send only. No action taken outside mock.',
    };
  }

  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable for Telegram send.');
  const response = await fetchImpl(`https://api.telegram.org/bot${credentials.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: credentials.chatId,
      text: preview.message,
      disable_web_page_preview: true,
    }),
  });

  let telegramOk = response.ok;
  let messageId = null;
  try {
    const body = await response.json();
    telegramOk = telegramOk && body.ok !== false;
    messageId = body?.result?.message_id ?? null;
  } catch {
    // Keep response metadata minimal and secret-free.
  }

  if (!telegramOk) throw new Error(`Telegram send failed with status ${response.status}`);
  return {
    ok: true,
    mode: 'send',
    sent: true,
    messageId,
    message: preview.message,
    telegram: credentials.redacted,
    ...SIDE_EFFECT_FLAGS,
    note: 'No action taken beyond Telegram notification.',
  };
}

export async function runTelegramDiscoveryNotificationCli(argv = process.argv.slice(2), invokedPath = process.argv[1] || '') {
  const args = parseArgs(argv);
  requireJson(args);
  const basename = path.basename(invokedPath);
  const command = basename.includes('approval-send') ? 'approval-send' : basename.includes('approval') ? 'approval-preview' : basename.includes('send') ? 'send' : 'preview';
  const result = command === 'approval-send'
    ? await sendTelegramDiscoveryApprovalRequest({
        reportPath: args.reportPath,
        indexPath: args.indexPath || DEFAULT_DISCOVERY_INDEX_PATH,
        statePath: args.statePath || DEFAULT_TELEGRAM_APPROVAL_REQUESTS_PATH,
        dryRun: args.dryRun === true,
        force: args.force === true,
        mockSend: args.mockSend,
        botToken: args.botToken,
        chatId: args.chatId,
        envFile: args.envFile || defaultTelegramEnvFile(),
        now: args.now ? new Date(args.now) : new Date(),
        ttlMinutes: args.ttlMinutes || 60,
      })
    : command === 'send'
      ? await sendTelegramDiscoveryNotification({
          reportPath: args.reportPath,
          indexPath: args.indexPath || DEFAULT_DISCOVERY_INDEX_PATH,
          mockSend: args.mockSend,
          botToken: args.botToken,
          chatId: args.chatId,
        })
      : command === 'approval-preview'
        ? await buildDiscoveryApprovalRequestPreview({
            reportPath: args.reportPath,
            indexPath: args.indexPath || DEFAULT_DISCOVERY_INDEX_PATH,
            now: args.now ? new Date(args.now) : new Date(),
            ttlMinutes: args.ttlMinutes || 60,
          })
        : await buildDiscoveryNotificationPreview({
            reportPath: args.reportPath,
            indexPath: args.indexPath || DEFAULT_DISCOVERY_INDEX_PATH,
          });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runTelegramDiscoveryNotificationCli().catch((error) => {
    const safe = {
      ok: false,
      sent: false,
      error: error.message.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]'),
      ...SIDE_EFFECT_FLAGS,
      note: 'No action taken.',
    };
    process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
    process.exitCode = 1;
  });
}
