import { describe, it, expect } from 'vitest';
import { computeWhoopData } from '../whoop';

describe('computeWhoopData', () => {
  it('formats recovery + sleep hours', () => {
    const w = computeWhoopData({ recovery_pct: 58, sleep_hours: 6.2 });
    expect(w.title).toBe('58%');
    expect(w.sub).toContain('6.2h');
    expect(w.label).toBe('RECOVERY');
  });

  it('handles missing sleep_hours', () => {
    const w = computeWhoopData({ recovery_pct: 80 });
    expect(w.title).toBe('80%');
    expect(w.sub).toBe('—');
  });

  it('handles zero recovery', () => {
    expect(computeWhoopData({ recovery_pct: 0 }).title).toBe('0%');
  });
});
