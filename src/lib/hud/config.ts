import * as YAML from 'yaml';
import { promises as fs } from 'fs';
import type { HUDConfig, WidgetId } from '../../server/hud/types';

export const HUD_CONFIG_PATH = `${process.env.CLAUDE_WORKSPACE_DIR || '/root/.hermes'}/hud-config.yaml`;

export const defaultHUDConfig: HUDConfig = {
  widgets: {
    'brief': true,
    'up-next': true,
    'recovery': true,
    'next-deadline': true,
    'timeline': true,
    'agents': true,
    'jobs': true,
    'sessions': true,
    'vm-health': true,
    'prs': true,
    'ci': true,
    'sms': true,
    'telegram': true,
    'plaud': true,
    'cliniko': true,
    'errors': true,
    'inbox': true,
  },
  mc_tile_order: [
    'agents', 'jobs', 'sessions', 'vm-health',
    'prs', 'ci', 'sms', 'telegram',
    'plaud', 'cliniko', 'errors',
  ],
  inbox_severity_overrides: { starred_sms_contacts: [] },
  dismissed_inbox_items: {},
  mobile_tiles: ['agents', 'jobs', 'prs', 'sms', 'telegram', 'plaud'],
};

export function parseHUDConfig(yamlStr: string): HUDConfig {
  if (!yamlStr.trim()) return structuredClone(defaultHUDConfig);
  const parsed = YAML.parse(yamlStr) as Partial<HUDConfig> | null;
  if (!parsed) return structuredClone(defaultHUDConfig);
  return {
    ...defaultHUDConfig,
    ...parsed,
    widgets: { ...defaultHUDConfig.widgets, ...(parsed.widgets ?? {}) },
  };
}

export async function loadHUDConfig(): Promise<HUDConfig> {
  try {
    const raw = await fs.readFile(HUD_CONFIG_PATH, 'utf8');
    return parseHUDConfig(raw);
  } catch (e: any) {
    if (e.code === 'ENOENT') return structuredClone(defaultHUDConfig);
    throw e;
  }
}

export async function saveHUDConfig(cfg: HUDConfig): Promise<void> {
  await fs.writeFile(HUD_CONFIG_PATH, YAML.stringify(cfg), 'utf8');
}
