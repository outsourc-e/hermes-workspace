import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock child_process at module-load time
vi.mock('child_process', () => ({
  execFile: (cmd: string, args: string[], cb: any) => {
    if (args.includes('pr')) {
      cb(null, { stdout: '[{"reviewDecision":"REVIEW_REQUIRED"},{"reviewDecision":null}]', stderr: '' });
    } else if (args.includes('run')) {
      cb(null, { stdout: '[{"conclusion":"success"}]', stderr: '' });
    } else {
      cb(new Error('unexpected gh args: ' + args.join(' ')), null);
    }
  },
}));

import { prsAdapter, ciAdapter } from '../pr-ci';

afterEach(() => vi.resetAllMocks());

describe('prsAdapter', () => {
  it('counts open PRs + review-needed', async () => {
    const r = await prsAdapter.fetch();
    expect(r.value).toBe('2');
    expect(r.sub).toContain('1 need review');
  });
});

describe('ciAdapter', () => {
  it('reports green when latest conclusion is success', async () => {
    const r = await ciAdapter.fetch();
    expect(r.value).toBe('green');
    expect(r.tone).toBe('ok');
  });
});
