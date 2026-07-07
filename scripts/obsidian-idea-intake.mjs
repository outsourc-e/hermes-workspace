#!/usr/bin/env node
import crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_OBSIDIAN_IDEAS_DIR = '/mnt/lachlan-pc-obsidian/LifeOS Vault/01 Ideas';
export const DEFAULT_CAPTURED_IDEAS_JSONL = '/root/.hermes/runtime/captured-ideas.jsonl';
export const SOURCE_KIND = 'obsidian_01_ideas';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(CONTROL_CHARS, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

export function sanitizeTitle(value) {
  const cleaned = normalizeWhitespace(value)
    .replace(/^#+\s+/u, '')
    .replace(/[\[\]{}<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 180) || 'Untitled idea';
}

export function sanitizeBody(value) {
  return normalizeWhitespace(value).slice(0, 20_000);
}

function stripFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) return markdown;
  const end = markdown.indexOf('\n---', 4);
  if (end === -1) return markdown;
  const after = markdown.slice(end + 4);
  return after.startsWith('\n') ? after.slice(1) : after;
}

function splitTitleAndBody(markdown, fallbackName) {
  const withoutFrontmatter = stripFrontmatter(markdown);
  const lines = withoutFrontmatter.split(/\n/);
  const h1Index = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (h1Index >= 0) {
    const title = lines[h1Index].replace(/^#\s+/, '');
    const body = [...lines.slice(0, h1Index), ...lines.slice(h1Index + 1)].join('\n');
    return { title, body };
  }
  return { title: fallbackName.replace(/\.md$/i, ''), body: withoutFrontmatter };
}

function assertInsideSource(sourceDir, notePath) {
  const source = path.resolve(sourceDir);
  const note = path.resolve(notePath);
  if (note !== source && !note.startsWith(`${source}${path.sep}`)) {
    throw new Error(`Refusing note outside source directory: ${note}`);
  }
}

export async function parseIdeaNote({ sourceDir, notePath, capturedAt }) {
  assertInsideSource(sourceDir, notePath);
  const markdown = await readFile(notePath, 'utf8');
  const { title, body } = splitTitleAndBody(markdown, path.basename(notePath));
  const ideaTitle = sanitizeTitle(title);
  const ideaBody = sanitizeBody(body);
  const relativePath = path.relative(path.resolve(sourceDir), path.resolve(notePath));
  const contentHash = sha256(JSON.stringify({ idea_title: ideaTitle, idea_body: ideaBody, source_kind: SOURCE_KIND }));
  return {
    idea_id: `obsidea_${contentHash.slice(0, 20)}`,
    idea_title: ideaTitle,
    idea_body: ideaBody,
    source: {
      kind: SOURCE_KIND,
      path: path.resolve(notePath),
      relative_path: relativePath,
    },
    captured_at: capturedAt,
    content_hash: contentHash,
    sanitized: true,
  };
}

async function walkMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walkMarkdownFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(full);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export async function readExistingCapturedIdeas(jsonlPath) {
  const hashes = new Set();
  const ids = new Set();
  try {
    const text = await readFile(jsonlPath, 'utf8');
    const lines = text.split(/\n/).filter((line) => line.trim().length > 0);
    lines.forEach((line, index) => {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        throw new Error(`Malformed captured ideas JSONL at line ${index + 1}: ${error.message}`);
      }
      if (!parsed || typeof parsed !== 'object') throw new Error(`Malformed captured ideas JSONL at line ${index + 1}: record is not an object`);
      if (typeof parsed.content_hash === 'string') hashes.add(parsed.content_hash);
      if (typeof parsed.idea_id === 'string') ids.add(parsed.idea_id);
    });
  } catch (error) {
    if (error && error.code === 'ENOENT') return { hashes, ids, exists: false };
    throw error;
  }
  return { hashes, ids, exists: true };
}

function validateRecord(record) {
  const requiredStrings = ['idea_id', 'idea_title', 'idea_body', 'captured_at', 'content_hash'];
  for (const key of requiredStrings) {
    if (typeof record[key] !== 'string') throw new Error(`Invalid captured idea record: ${key} must be a string`);
  }
  if (!record.source || typeof record.source !== 'object') throw new Error('Invalid captured idea record: source must be an object');
  if (record.sanitized !== true) throw new Error('Invalid captured idea record: sanitized must be true');
}

function isDefaultLiveTarget(targetPath) {
  return path.resolve(targetPath) === path.resolve(DEFAULT_CAPTURED_IDEAS_JSONL);
}

function isDefaultLiveSource(sourceDir) {
  return path.resolve(sourceDir) === path.resolve(DEFAULT_OBSIDIAN_IDEAS_DIR);
}

export async function collectObsidianIdeaRecords({
  sourceDir = DEFAULT_OBSIDIAN_IDEAS_DIR,
  jsonlPath = DEFAULT_CAPTURED_IDEAS_JSONL,
  capturedAt = new Date().toISOString(),
} = {}) {
  await access(sourceDir, fsConstants.R_OK);
  const existing = await readExistingCapturedIdeas(jsonlPath);
  const files = await walkMarkdownFiles(sourceDir);
  const records = [];
  const duplicates = [];
  for (const notePath of files) {
    const record = await parseIdeaNote({ sourceDir, notePath, capturedAt });
    validateRecord(record);
    if (existing.hashes.has(record.content_hash) || existing.ids.has(record.idea_id)) {
      duplicates.push({ path: notePath, idea_id: record.idea_id, content_hash: record.content_hash });
    } else {
      records.push(record);
    }
  }
  return {
    ok: true,
    mode: 'dry-run',
    sourceDir: path.resolve(sourceDir),
    jsonlPath: path.resolve(jsonlPath),
    scanned: files.length,
    duplicateCount: duplicates.length,
    appendCount: records.length,
    records,
    duplicates,
    sideEffects: sideEffects(false),
  };
}

function sideEffects(appended) {
  return {
    obsidianWrites: false,
    kanbanWrites: false,
    githubCalls: false,
    githubWrites: false,
    telegramSends: false,
    serviceTimerChanges: false,
    dispatcherSwarm: false,
    liveCapturedIdeasAppend: false,
    tempCapturedIdeasAppend: appended,
  };
}

function isTempPath(targetPath) {
  const resolved = path.resolve(targetPath);
  const tmp = path.resolve(process.env.TMPDIR || '/tmp');
  return resolved === tmp || resolved.startsWith(`${tmp}${path.sep}`);
}

export async function appendObsidianIdeaRecords({
  sourceDir = DEFAULT_OBSIDIAN_IDEAS_DIR,
  jsonlPath,
  capturedAt = new Date().toISOString(),
  allowLiveAppend = false,
} = {}) {
  if (!jsonlPath) throw new Error('--jsonl is required for append mode');
  if (isDefaultLiveTarget(jsonlPath) && !allowLiveAppend) {
    throw new Error('Refusing live append to /root/.hermes/runtime/captured-ideas.jsonl without --allow-live-append');
  }
  if (!isTempPath(jsonlPath) && !allowLiveAppend) {
    throw new Error('Refusing append outside temp JSONL without --allow-live-append');
  }
  if (isDefaultLiveSource(sourceDir) && allowLiveAppend !== true && !isTempPath(jsonlPath)) {
    throw new Error('Refusing live Obsidian source append outside temp JSONL');
  }

  const result = await collectObsidianIdeaRecords({ sourceDir, jsonlPath, capturedAt });
  const targetDir = path.dirname(path.resolve(jsonlPath));
  await mkdir(targetDir, { recursive: true });
  if (result.records.length > 0) {
    const payload = result.records.map((record) => `${JSON.stringify(record)}\n`).join('');
    await appendFile(jsonlPath, payload, 'utf8');
  }
  return {
    ...result,
    mode: 'append',
    wrote: result.records.length > 0 ? [path.resolve(jsonlPath)] : [],
    sideEffects: sideEffects(true),
  };
}

function parseArgs(argv) {
  const args = {
    json: false,
    dryRun: false,
    append: false,
    sourceDir: DEFAULT_OBSIDIAN_IDEAS_DIR,
    jsonlPath: DEFAULT_CAPTURED_IDEAS_JSONL,
    capturedAt: undefined,
    allowLiveAppend: false,
    requireReadonlySource: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--append') args.append = true;
    else if (arg === '--allow-live-append') args.allowLiveAppend = true;
    else if (arg === '--require-readonly-source') args.requireReadonlySource = true;
    else if (arg === '--source-dir') {
      i += 1;
      if (!argv[i]) throw new Error('--source-dir requires a value');
      args.sourceDir = argv[i];
    } else if (arg === '--jsonl') {
      i += 1;
      if (!argv[i]) throw new Error('--jsonl requires a value');
      args.jsonlPath = argv[i];
    } else if (arg === '--captured-at') {
      i += 1;
      if (!argv[i]) throw new Error('--captured-at requires a value');
      args.capturedAt = argv[i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

async function sourceIsWritable(sourceDir) {
  try {
    await access(sourceDir, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function assertReadonlySourceIfRequested(args) {
  if (!args.requireReadonlySource) return;
  if (!isDefaultLiveSource(args.sourceDir)) return;
  const writable = await sourceIsWritable(args.sourceDir);
  if (writable) throw new Error('Refusing live Obsidian dry-run because source mount is writable; expected read-only mount.');
}

function assertJson(args) {
  if (!args.json) throw new Error('This CLI is intentionally JSON-only. Pass --json.');
}

function render(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function runObsidianIdeaIntakeCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  assertJson(args);
  if (args.append && args.dryRun) throw new Error('Choose either --dry-run or --append, not both');
  if (!args.append) args.dryRun = true;
  await assertReadonlySourceIfRequested(args);
  const capturedAt = args.capturedAt || new Date().toISOString();
  const result = args.append
    ? await appendObsidianIdeaRecords({
        sourceDir: args.sourceDir,
        jsonlPath: args.jsonlPath,
        capturedAt,
        allowLiveAppend: args.allowLiveAppend,
      })
    : await collectObsidianIdeaRecords({ sourceDir: args.sourceDir, jsonlPath: args.jsonlPath, capturedAt });
  process.stdout.write(render(result));
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  runObsidianIdeaIntakeCli().catch((error) => {
    process.stdout.write(render({
      ok: false,
      error: error?.message || String(error),
      sideEffects: sideEffects(false),
    }));
    process.exitCode = 1;
  });
}
