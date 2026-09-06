import { promises as fs } from 'node:fs'
import * as YAML from 'yaml'
import type { HUDConfig, WidgetId } from '../../server/hud/types'

export const HUD_CONFIG_PATH = `${process.env.CLAUDE_WORKSPACE_DIR || '/root/.hermes'}/hud-config.yaml`

export const defaultHUDConfig: HUDConfig = {
  widgets: {
    brief: true,
    'up-next': true,
    recovery: true,
    'next-deadline': true,
    timeline: true,
    agents: true,
    jobs: true,
    sessions: true,
    'vm-health': true,
    prs: true,
    ci: true,
    sms: true,
    telegram: true,
    plaud: true,
    cliniko: true,
    errors: true,
    inbox: true,
  },
  mc_tile_order: [
    'agents',
    'jobs',
    'sessions',
    'vm-health',
    'prs',
    'ci',
    'sms',
    'telegram',
    'plaud',
    'cliniko',
    'errors',
  ],
  inbox_severity_overrides: { starred_sms_contacts: [] },
  dismissed_inbox_items: {},
  deadline_attendance: {},
  mobile_tiles: ['agents', 'jobs', 'prs', 'sms', 'telegram', 'plaud'],
}

/**
 * Parse a YAML string into a HUDConfig, merging with defaults.
 *
 * Merge semantics:
 *   - Top-level scalars/arrays (mc_tile_order, mobile_tiles,
 *     inbox_severity_overrides, dismissed_inbox_items): REPLACE — user value
 *     wholly replaces the default. Arrays are not appended; callers set their
 *     preferred order/set directly.
 *   - widgets: KEY-MERGE — user toggles are overlaid onto the full default
 *     widget map so unknown/new widgets keep their default visibility.
 *
 * The returned object is always a deep clone; mutating it never affects
 * defaultHUDConfig or any other previously returned config object.
 */
export function parseHUDConfig(yamlStr: string): HUDConfig {
  if (!yamlStr.trim()) return structuredClone(defaultHUDConfig)
  const parsed = YAML.parse(yamlStr) as Partial<HUDConfig> | null
  if (!parsed) return structuredClone(defaultHUDConfig)
  return structuredClone({
    ...defaultHUDConfig,
    ...parsed,
    widgets: { ...defaultHUDConfig.widgets, ...(parsed.widgets ?? {}) },
  })
}

export async function loadHUDConfig(): Promise<HUDConfig> {
  try {
    const raw = await fs.readFile(HUD_CONFIG_PATH, 'utf8')
    return parseHUDConfig(raw)
  } catch (e: any) {
    if (e.code === 'ENOENT') return structuredClone(defaultHUDConfig)
    throw e
  }
}

export async function saveHUDConfig(cfg: HUDConfig): Promise<void> {
  await fs.writeFile(HUD_CONFIG_PATH, YAML.stringify(cfg), 'utf8')
}
