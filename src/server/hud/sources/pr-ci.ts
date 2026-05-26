import { execFile } from 'child_process';
import { promisify } from 'util';
import { registerAdapter, type SourceAdapter } from './index';

const execFileP = promisify(execFile);

const TRACKED_REPOS = (process.env.HUD_TRACKED_REPOS || 'SPACEMAN1898/CliniTrack-Suite').split(',').filter(Boolean);

interface PRsData { value: string; sub: string; tone: 'ok' | 'info'; }
interface CIData  { value: string; sub: string; tone: 'ok' | 'warn' | 'err'; }

async function fetchPRsForRepo(repo: string): Promise<{ open: number; reviewNeeded: number }> {
  try {
    const { stdout } = await execFileP('gh', ['pr', 'list', '-R', repo, '--state', 'open', '--json', 'number,reviewDecision']);
    const list = JSON.parse(stdout) as { reviewDecision: string | null }[];
    return { open: list.length, reviewNeeded: list.filter(p => p.reviewDecision === 'REVIEW_REQUIRED').length };
  } catch {
    return { open: 0, reviewNeeded: 0 };
  }
}

async function fetchCIForRepo(repo: string): Promise<'success' | 'failure' | 'unknown'> {
  try {
    const { stdout } = await execFileP('gh', ['run', 'list', '-R', repo, '--limit', '1', '--json', 'conclusion']);
    const list = JSON.parse(stdout) as { conclusion: string | null }[];
    const c = list[0]?.conclusion;
    if (c === 'success' || c === 'failure') return c;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export const prsAdapter: SourceAdapter<PRsData> = {
  id: 'prs',
  ttlMs: 5 * 60_000,
  async fetch() {
    const results = await Promise.all(TRACKED_REPOS.map(fetchPRsForRepo));
    const total = results.reduce((s, r) => s + r.open, 0);
    const reviewNeeded = results.reduce((s, r) => s + r.reviewNeeded, 0);
    return {
      value: String(total),
      sub: reviewNeeded > 0 ? reviewNeeded + ' need review' : 'all reviewed',
      tone: 'info',
    };
  },
};

export const ciAdapter: SourceAdapter<CIData> = {
  id: 'ci',
  ttlMs: 5 * 60_000,
  async fetch() {
    const results = await Promise.all(TRACKED_REPOS.map(fetchCIForRepo));
    const anyFailure = results.some(r => r === 'failure');
    const repoShort = TRACKED_REPOS[0]?.split('/')[1] || '';
    return {
      value: anyFailure ? 'red' : 'green',
      sub: repoShort,
      tone: anyFailure ? 'err' : 'ok',
    };
  },
};

registerAdapter(prsAdapter);
registerAdapter(ciAdapter);
