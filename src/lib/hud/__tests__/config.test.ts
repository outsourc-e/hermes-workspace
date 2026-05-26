import { describe, it, expect } from 'vitest';
import { parseHUDConfig, defaultHUDConfig } from '../config';

describe('parseHUDConfig', () => {
  it('returns defaults when input is empty', () => {
    const cfg = parseHUDConfig('');
    expect(cfg).toEqual(defaultHUDConfig);
  });

  it('merges user toggles over defaults', () => {
    const yaml = 'widgets:\n  vm-health: false\n  agents: true\n';
    const cfg = parseHUDConfig(yaml);
    expect(cfg.widgets['vm-health']).toBe(false);
    expect(cfg.widgets['agents']).toBe(true);
  });

  it('preserves unknown user keys (forward-compat)', () => {
    const yaml = 'widgets:\n  future-widget: true\n';
    const cfg = parseHUDConfig(yaml);
    expect(cfg.widgets['future-widget']).toBe(true);
  });
});
