import { describe, expect, it, vi } from 'vitest'
import { defaultHUDConfig, parseHUDConfig } from '../config'

describe('parseHUDConfig', () => {
  it('returns defaults when input is empty', () => {
    const cfg = parseHUDConfig('')
    expect(cfg).toEqual(defaultHUDConfig)
  })

  it('merges user toggles over defaults', () => {
    const yaml = 'widgets:\n  vm-health: false\n  agents: true\n'
    const cfg = parseHUDConfig(yaml)
    expect(cfg.widgets['vm-health']).toBe(false)
    expect(cfg.widgets['agents']).toBe(true)
  })

  it('preserves unknown user keys (forward-compat)', () => {
    const yaml = 'widgets:\n  future-widget: true\n'
    const cfg = parseHUDConfig(yaml)
    expect(cfg.widgets['future-widget']).toBe(true)
  })

  it('returns independent deep clones — mutating one result does not affect another', () => {
    const yaml = 'widgets:\n  agents: true\n'
    const cfg1 = parseHUDConfig(yaml)
    const cfg2 = parseHUDConfig(yaml)

    // Mutate nested references on cfg1
    ;(cfg1.dismissed_inbox_items as Record<string, unknown>)['poison'] = 999
    cfg1.mc_tile_order!.push('injected' as any)
    cfg1.mobile_tiles!.push('injected' as any)
    cfg1.inbox_severity_overrides!.starred_sms_contacts!.push('bad-contact')

    // cfg2 must be unaffected
    expect(
      (cfg2.dismissed_inbox_items as Record<string, unknown>)['poison'],
    ).toBeUndefined()
    expect(cfg2.mc_tile_order).not.toContain('injected')
    expect(cfg2.mobile_tiles).not.toContain('injected')
    expect(cfg2.inbox_severity_overrides!.starred_sms_contacts).toHaveLength(0)

    // defaultHUDConfig must also be unaffected
    expect(
      (defaultHUDConfig.dismissed_inbox_items as Record<string, unknown>)[
        'poison'
      ],
    ).toBeUndefined()
    expect(defaultHUDConfig.mc_tile_order).not.toContain('injected')
    expect(
      defaultHUDConfig.inbox_severity_overrides!.starred_sms_contacts,
    ).toHaveLength(0)
  })
})

describe('loadHUDConfig', () => {
  it('re-throws non-ENOENT errors (e.g. permission denied)', async () => {
    vi.mock('fs', () => ({
      promises: {
        readFile: vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('EACCES'), { code: 'EACCES' }),
          ),
      },
    }))
    // Re-import after mock is set up
    const { loadHUDConfig } = await import('../config')
    await expect(loadHUDConfig()).rejects.toThrow('EACCES')
    vi.restoreAllMocks()
  })
})
