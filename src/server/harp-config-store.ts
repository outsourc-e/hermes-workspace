import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'

// ── Path resolution ────────────────────────────────────────────────────────
// Probes standard locations in priority order.
// Override all of these with the HARP_CONFIG_PATH environment variable.

function candidatePaths(): Array<string> {
  const home = os.homedir()
  const hermesHome =
    process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? path.join(home, '.hermes')
  const openClawHome = process.env.OPENCLAW_HOME ?? path.join(home, '.openclaw')

  return [
    // 1. Explicit env override — highest priority
    process.env.HARP_CONFIG_PATH ?? '',
    // 2. Standard Hermes home location (most common for new setups)
    path.join(hermesHome, 'harp-config.yaml'),
    // 3. OpenClaw home
    path.join(openClawHome, 'harp-config.yaml'),
    // 4. XDG config
    path.join(home, '.config', 'hermes', 'harp-config.yaml'),
    // 5. Legacy / custom control-repo layout
    '/srv/projects/_hermes-control/harp-config.yaml',
    path.join(home, 'hermes-control', 'harp-config.yaml'),
  ].filter(Boolean)
}

export function resolveHarpConfigPath(): string {
  for (const candidate of candidatePaths()) {
    if (fs.existsSync(candidate)) return candidate
  }
  // Default write location when creating a fresh config
  const hermesHome =
    process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.hermes')
  return process.env.HARP_CONFIG_PATH ?? path.join(hermesHome, 'harp-config.yaml')
}

export function getHarpCandidatePaths(): Array<string> {
  return candidatePaths()
}

// ── Types ──────────────────────────────────────────────────────────────────

export type HarpTierModel = {
  model: string
  role: string
  provider?: string
  notes?: string
  bin?: string
  command?: string
  skill?: string
  tier?: string
}

export type HarpTier = {
  key: 'tier1_free' | 'tier2_paid' | 'tier3_codex' | 'tier4_gemini' | 'tier5_local'
  label: string
  provider: string
  trigger: unknown
  models: Array<HarpTierModel>
  base_url?: string
  key_env?: string
  setup_instructions?: string
}

export type HarpBlocklistEntry = {
  model: string
  reason: string
}

export type HarpGlobalSettings = {
  enabled: boolean
  mode: string
  auto_route: boolean
  route_delegation_only: boolean
  allow_paid_benchmarking: boolean
  paid_benchmark_daily_cap_usd: number
  require_paid_final_review_for_production: boolean
}

export type HarpAutoImprove = {
  enabled: boolean
  script: string
  trigger: unknown
  min_evals_to_rank: number
  report_dir: string
  deliver: string
  notes?: string
}

export type HarpConfig = {
  harp_vm: HarpGlobalSettings
  routing: {
    strategy: string
    free_first: boolean
    tier1_free: { provider: string; trigger: unknown; models: Array<HarpTierModel> }
    tier2_paid: { provider: string; trigger: unknown; models: Array<HarpTierModel> }
    tier3_codex?: { provider: string; trigger: unknown; models: Array<HarpTierModel>; auth_check?: string; setup_instructions?: string }
    tier4_gemini?: { provider: string; trigger: unknown; models: Array<HarpTierModel>; base_url?: string; key_env?: string; setup_instructions?: string }
    tier5_local?: { provider: string; trigger: unknown; model?: string; base_url?: string }
  }
  routing_blocklist: Array<HarpBlocklistEntry>
  auto_improve: HarpAutoImprove
  [key: string]: unknown
}

// ── Read ───────────────────────────────────────────────────────────────────

export function readHarpConfig(): HarpConfig | null {
  const configPath = resolveHarpConfigPath()
  try {
    if (!fs.existsSync(configPath)) return null
    const raw = fs.readFileSync(configPath, 'utf-8')
    return YAML.parse(raw) as HarpConfig
  } catch {
    return null
  }
}

// ── Write ──────────────────────────────────────────────────────────────────

function writeHarpConfig(config: HarpConfig): void {
  const configPath = resolveHarpConfigPath()
  const raw = YAML.stringify(config, { lineWidth: 120 })
  fs.writeFileSync(configPath, raw, 'utf-8')
}

// ── Patch Actions ──────────────────────────────────────────────────────────

export type HarpPatchSetGlobal = {
  action: 'set-global'
  field: keyof HarpGlobalSettings
  value: unknown
}

export type HarpPatchReorderTierModels = {
  action: 'reorder-tier-models'
  tier: 'tier1_free' | 'tier2_paid'
  models: Array<HarpTierModel>
}

export type HarpPatchAddTierModel = {
  action: 'add-tier-model'
  tier: 'tier1_free' | 'tier2_paid'
  model: HarpTierModel
}

export type HarpPatchRemoveTierModel = {
  action: 'remove-tier-model'
  tier: 'tier1_free' | 'tier2_paid'
  modelId: string
}

export type HarpPatchAddBlocklist = {
  action: 'add-blocklist'
  entry: HarpBlocklistEntry
}

export type HarpPatchRemoveBlocklist = {
  action: 'remove-blocklist'
  modelId: string
}

export type HarpPatchSetAutoImprove = {
  action: 'set-auto-improve'
  field: keyof HarpAutoImprove
  value: unknown
}

export type HarpPatch =
  | HarpPatchSetGlobal
  | HarpPatchReorderTierModels
  | HarpPatchAddTierModel
  | HarpPatchRemoveTierModel
  | HarpPatchAddBlocklist
  | HarpPatchRemoveBlocklist
  | HarpPatchSetAutoImprove

export type HarpPatchResult = { ok: boolean; error?: string }

export function applyHarpPatch(patch: HarpPatch): HarpPatchResult {
  const config = readHarpConfig()
  if (!config) {
    return { ok: false, error: 'HARP config file not found or unreadable' }
  }

  try {
    switch (patch.action) {
      case 'set-global': {
        const hv = config.harp_vm as Record<string, unknown>
        hv[patch.field] = patch.value
        break
      }

      case 'reorder-tier-models': {
        config.routing[patch.tier].models = patch.models
        break
      }

      case 'add-tier-model': {
        config.routing[patch.tier].models.push(patch.model)
        break
      }

      case 'remove-tier-model': {
        config.routing[patch.tier].models = config.routing[patch.tier].models.filter(
          (m) => m.model !== patch.modelId,
        )
        break
      }

      case 'add-blocklist': {
        const exists = config.routing_blocklist.some(
          (e) => e.model === patch.entry.model,
        )
        if (!exists) {
          config.routing_blocklist.push(patch.entry)
        }
        break
      }

      case 'remove-blocklist': {
        config.routing_blocklist = config.routing_blocklist.filter(
          (e) => e.model !== patch.modelId,
        )
        break
      }

      case 'set-auto-improve': {
        const ai = config.auto_improve as Record<string, unknown>
        ai[patch.field] = patch.value
        break
      }
    }

    writeHarpConfig(config)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Starter config ─────────────────────────────────────────────────────────

export function createStarterHarpConfig(): HarpPatchResult {
  const configPath = resolveHarpConfigPath()
  if (fs.existsSync(configPath)) return { ok: false, error: 'Config already exists' }
  const starter: HarpConfig = {
    harp_vm: {
      enabled: true,
      mode: 'tiered_with_degradation',
      auto_route: true,
      route_delegation_only: false,
      allow_paid_benchmarking: false,
      paid_benchmark_daily_cap_usd: 0.1,
      require_paid_final_review_for_production: false,
    },
    routing: {
      strategy: 'tiered_with_degradation',
      free_first: true,
      tier1_free: {
        provider: 'openrouter',
        trigger: 'always',
        models: [
          { model: 'nvidia/nemotron-3-super-120b-a12b:free', role: 'primary' },
          { model: 'google/gemma-4-31b-it:free', role: 'fallback' },
        ],
      },
      tier2_paid: {
        provider: 'openrouter',
        trigger: ['tier1_exhausted', 'tier1_unavailable'],
        models: [
          { model: 'deepseek/deepseek-v4-pro', provider: 'openrouter', role: 'primary' },
        ],
      },
    },
    routing_blocklist: [],
    auto_improve: {
      enabled: false,
      script: '',
      trigger: [],
      min_evals_to_rank: 3,
      report_dir: '',
      deliver: '',
    },
  }
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    writeHarpConfig(starter)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Serialised view for the UI ─────────────────────────────────────────────

export type HarpConfigView = {
  available: boolean
  configPath: string
  candidatePaths: Array<string>
  global: HarpGlobalSettings
  tiers: Array<HarpTier>
  blocklist: Array<HarpBlocklistEntry>
  autoImprove: HarpAutoImprove
}

const TIER_META: Record<string, { label: string }> = {
  tier1_free: { label: 'Tier 1 — OpenRouter Free' },
  tier2_paid: { label: 'Tier 2 — Paid / Claude CLI' },
  tier3_codex: { label: 'Tier 3 — OpenAI Codex' },
  tier4_gemini: { label: 'Tier 4 — Gemini Free' },
  tier5_local: { label: 'Tier 5 — Local Ollama' },
}

export function getHarpConfigView(): HarpConfigView {
  const configPath = resolveHarpConfigPath()
  const config = readHarpConfig()

  if (!config) {
    return {
      available: false,
      configPath,
      candidatePaths: getHarpCandidatePaths(),
      global: {
        enabled: false,
        mode: 'tiered_with_degradation',
        auto_route: false,
        route_delegation_only: false,
        allow_paid_benchmarking: false,
        paid_benchmark_daily_cap_usd: 0.1,
        require_paid_final_review_for_production: false,
      },
      tiers: [],
      blocklist: [],
      autoImprove: {
        enabled: false,
        script: '',
        trigger: [],
        min_evals_to_rank: 3,
        report_dir: '',
        deliver: '',
      },
    }
  }

  const tierKeys = ['tier1_free', 'tier2_paid', 'tier3_codex', 'tier4_gemini', 'tier5_local'] as const
  const tiers: Array<HarpTier> = tierKeys
    .filter((k) => k in config.routing)
    .map((k) => {
      const raw = config.routing[k] as Record<string, unknown>
      return {
        key: k,
        label: TIER_META[k].label,
        provider: String(raw.provider ?? ''),
        trigger: (raw.trigger ?? []) as Array<unknown>,
        models: (raw.models as Array<HarpTierModel> | undefined) ?? (raw.model ? [{ model: String(raw.model), role: 'primary' }] : []),
        base_url: raw.base_url as string | undefined,
        key_env: raw.key_env as string | undefined,
        setup_instructions: raw.setup_instructions as string | undefined,
      }
    })

  return {
    available: true,
    configPath,
    candidatePaths: getHarpCandidatePaths(),
    global: config.harp_vm,
    tiers,
    blocklist: config.routing_blocklist,
    autoImprove: config.auto_improve,
  }
}
