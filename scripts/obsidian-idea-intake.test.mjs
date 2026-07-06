import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  appendObsidianIdeaRecords,
  collectObsidianIdeaRecords,
} from './obsidian-idea-intake.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const capturedAt = '2026-07-05T00:00:00.000Z';

async function makeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'obs-idea-fixture-'));
  const ideas = path.join(root, '01 Ideas');
  await mkdir(path.join(ideas, 'Nested'), { recursive: true });
  await writeFile(path.join(ideas, 'Alpha.md'), '---\nprivate: yes\n---\n# Alpha <Idea>\n\nBody with\u0000 control.\n\n[[Wiki Link]]\n', 'utf8');
  await writeFile(path.join(ideas, 'Nested', 'Beta.md'), 'No heading body\nsecond line\n', 'utf8');
  await writeFile(path.join(ideas, '.ignored.md'), '# Ignored\n', 'utf8');
  return { root, ideas };
}

async function runCli(args) {
  const { stdout, stderr } = await execFileAsync(path.join(repoRoot, 'bin/obsidian-idea-intake'), args, {
    cwd: repoRoot,
    env: { ...process.env, GITHUB_TOKEN: 'must-not-be-read', TELEGRAM_BOT_TOKEN: 'must-not-be-read' },
  });
  expect(stderr).toBe('');
  return JSON.parse(stdout);
}

describe('Obsidian idea intake bridge', () => {
  it('temp fixture dry-run emits sanitized captured idea records without writes', async () => {
    const { root, ideas } = await makeFixture();
    const jsonl = path.join(root, 'captured-ideas.jsonl');
    try {
      const result = await runCli(['--dry-run', '--json', '--source-dir', ideas, '--jsonl', jsonl, '--captured-at', capturedAt]);

      expect(result.ok).toBe(true);
      expect(result.mode).toBe('dry-run');
      expect(result.scanned).toBe(2);
      expect(result.appendCount).toBe(2);
      expect(result.duplicateCount).toBe(0);
      expect(result.records).toHaveLength(2);
      expect(result.records[0]).toMatchObject({
        idea_title: 'Alpha Idea',
        captured_at: capturedAt,
        sanitized: true,
      });
      expect(result.records[0].idea_body).not.toContain('\u0000');
      expect(result.records[0].content_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.records[0].idea_id).toBe(`obsidea_${result.records[0].content_hash.slice(0, 20)}`);
      await expect(readFile(jsonl, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      expect(result.sideEffects).toMatchObject({
        obsidianWrites: false,
        kanbanWrites: false,
        githubCalls: false,
        githubWrites: false,
        telegramSends: false,
        serviceTimerChanges: false,
        dispatcherSwarm: false,
        liveCapturedIdeasAppend: false,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('temp fixture append writes only to temp JSONL', async () => {
    const { root, ideas } = await makeFixture();
    const jsonl = path.join(root, 'runtime', 'captured-ideas.jsonl');
    try {
      const result = await appendObsidianIdeaRecords({ sourceDir: ideas, jsonlPath: jsonl, capturedAt });
      expect(result.mode).toBe('append');
      expect(result.wrote).toEqual([jsonl]);
      expect(result.sideEffects.tempCapturedIdeasAppend).toBe(true);
      expect(result.sideEffects.liveCapturedIdeasAppend).toBe(false);
      const lines = (await readFile(jsonl, 'utf8')).trim().split('\n');
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(Object.keys(parsed).sort()).toEqual(['captured_at', 'content_hash', 'idea_body', 'idea_id', 'idea_title', 'sanitized', 'source'].sort());
        expect(parsed.sanitized).toBe(true);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('duplicate prevention skips records already present in captured ideas JSONL', async () => {
    const { root, ideas } = await makeFixture();
    const jsonl = path.join(root, 'captured-ideas.jsonl');
    try {
      const first = await appendObsidianIdeaRecords({ sourceDir: ideas, jsonlPath: jsonl, capturedAt });
      expect(first.appendCount).toBe(2);
      const second = await collectObsidianIdeaRecords({ sourceDir: ideas, jsonlPath: jsonl, capturedAt: '2026-07-06T00:00:00.000Z' });
      expect(second.records).toEqual([]);
      expect(second.appendCount).toBe(0);
      expect(second.duplicateCount).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('malformed JSONL fails closed before append', async () => {
    const { root, ideas } = await makeFixture();
    const jsonl = path.join(root, 'bad.jsonl');
    try {
      await writeFile(jsonl, '{"content_hash":"ok"}\nnot-json\n', 'utf8');
      await expect(appendObsidianIdeaRecords({ sourceDir: ideas, jsonlPath: jsonl, capturedAt })).rejects.toThrow('Malformed captured ideas JSONL at line 2');
      const text = await readFile(jsonl, 'utf8');
      expect(text).toBe('{"content_hash":"ok"}\nnot-json\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses live captured ideas append without explicit approval flag', async () => {
    const { root, ideas } = await makeFixture();
    try {
      await expect(appendObsidianIdeaRecords({
        sourceDir: ideas,
        jsonlPath: '/root/.hermes/runtime/captured-ideas.jsonl',
        capturedAt,
      })).rejects.toThrow('Refusing live append');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
