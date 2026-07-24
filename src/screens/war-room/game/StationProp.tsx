import type { OlympusAgentInstance, OlympusPoint, OlympusStation } from './types'

const STATION_LABEL_PLAQUE = '/war-room/vNext/ui/station-label-plaque.png?v=20260512-premium-labels'
const AGENT_CORE_IDLE = '/war-room/vNext/ui/realm-marker-idle.png?v=20260512-agent-core-reset'
const AGENT_CORE_WORKING = '/war-room/vNext/ui/realm-marker-working.png?v=20260512-agent-core-reset'

const HEPHAESTUS_FULL_BODY_ASSET_BASE = '/war-room/hephaestus-90frame-v2/processed'

const GOD_PORTRAITS: Record<string, string> = {
  hermes: '/war-room/olympus-command/hermes-90frame-v1/processed/hermes-model.png',
  hercules: '/war-room/pantheon-hercules-fresh-v1/processed/hercules-model.png',
  athena: '/war-room/agora-athena-v2/processed/athena-model.png',
  'oracle-researcher': '/war-room/direct-overhead-v2/gods/oracle-researcher/model.png',
  oracle: '/war-room/oracle-signals-90frame-v1/processed/oracle-model.png',
  hephaestus: `${HEPHAESTUS_FULL_BODY_ASSET_BASE}/hephaestus-model.png`,
  njord: '/war-room/merchant-harbor-njord-v1/processed/njord-model.png',
  poseidon: '/war-room/atlantis-vault-poseidon-v4/processed/poseidon-model.png',
  'atlantis-archivist': '/war-room/atlantis-vault-archivist-v1/processed/atlantis-archivist-model.png',
  'treasury-watcher': '/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-model.png',
}

const GOD_IDLE_STRIPS: Record<string, string> = {
  hermes: '/war-room/olympus-command/hermes-90frame-v1/processed/hermes-idle-strip.png',
  hercules: '/war-room/pantheon-hercules-fresh-v1/processed/hercules-idle-strip.png',
  athena: '/war-room/agora-athena-v2/processed/athena-idle-strip.png',
  'oracle-researcher': '/war-room/direct-overhead-v2/gods/oracle-researcher/idle-strip.png',
  oracle: '/war-room/oracle-signals-90frame-v1/processed/oracle-idle-strip.png',
  hephaestus: `${HEPHAESTUS_FULL_BODY_ASSET_BASE}/hephaestus-idle-strip.png`,
  njord: '/war-room/merchant-harbor-njord-v1/processed/njord-idle-strip.png',
  poseidon: '/war-room/atlantis-vault-poseidon-v4/processed/poseidon-idle-strip.png',
  'atlantis-archivist': '/war-room/atlantis-vault-archivist-v1/processed/atlantis-archivist-idle-strip.png',
  'treasury-watcher': '/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-idle-strip.png',
}

const GOD_WALK_STRIPS: Record<string, string> = {
  hermes: '/war-room/olympus-command/hermes-90frame-v1/processed/hermes-walk-strip.png',
  hercules: '/war-room/pantheon-hercules-fresh-v1/processed/hercules-walk-strip.png',
  athena: '/war-room/agora-athena-v2/processed/athena-walk-strip.png',
  'oracle-researcher': '/war-room/direct-overhead-v2/gods/oracle-researcher/walk-strip.png',
  oracle: '/war-room/oracle-signals-90frame-v1/processed/walk-strip.png',
  hephaestus: `${HEPHAESTUS_FULL_BODY_ASSET_BASE}/hephaestus-walk-loop-6-strip.png`,
  njord: '/war-room/merchant-harbor-njord-v1/processed/njord-walk-strip.png',
  poseidon: '/war-room/atlantis-vault-poseidon-v4/processed/poseidon-walk-s-strip.png',
  'atlantis-archivist': '/war-room/atlantis-vault-archivist-v1/processed/atlantis-archivist-walk-strip.png',
  'treasury-watcher': '/war-room/direct-overhead-v2/gods/treasury-watcher/walk-strip.png',
}

const GOD_WORK_STRIPS: Record<string, string> = {
  hermes: '/war-room/olympus-command/hermes-90frame-v1/processed/hermes-work-strip.png',
  hercules: '/war-room/pantheon-hercules-fresh-v1/processed/hercules-work-strip.png',
  athena: '/war-room/agora-athena-v2/processed/athena-work-strip.png',
  'oracle-researcher': '/war-room/direct-overhead-v2/gods/oracle-researcher/work-strip.png',
  oracle: '/war-room/oracle-signals-90frame-v1/processed/work-strip.png',
  hephaestus: `${HEPHAESTUS_FULL_BODY_ASSET_BASE}/hephaestus-work-strip.png`,
  njord: '/war-room/merchant-harbor-njord-v1/processed/njord-work-strip.png',
  poseidon: '/war-room/atlantis-vault-poseidon-v4/processed/poseidon-work-s-strip.png',
  'atlantis-archivist': '/war-room/atlantis-vault-archivist-v1/processed/atlantis-archivist-work-strip.png',
  'treasury-watcher': '/war-room/direct-overhead-v2/gods/treasury-watcher/work-strip.png',
}

const GOD_FULL_BODY: Record<string, { idle: string; walkStrip: string }> = {}

// Most direct-overhead god sheets are authored facing north/up at 0°.
// Hermes uses authored directional rows instead of CSS-rotating
// front-facing humanoid art; rotating that kind of strip reads as a flat token.
const GOD_SOURCE_ROTATION_OFFSETS: Record<string, number> = {}

// All in-room gods share the same runtime token scale. Do not per-room enlarge
// individual models: it makes the Treasury dwarf read as a giant beside tools.
const GOD_VISIBLE_SCALE: Record<string, number> = {
  hermes: 1.0,
  // Hercules' source art reads visually bulkier than the other remade room gods.
  // Keep the same asset/design/proportions, but render him at the same perceived
  // operator scale as the already-remade rooms instead of a hero-sized token.
  hercules: 0.54,
  athena: 0.62,
  'oracle-researcher': 1.0,
  oracle: 1.0,
  hephaestus: 1.0,
  njord: 1.0,
  poseidon: 1.0,
  'atlantis-archivist': 1.0,
  'treasury-watcher': 1.0,
}

type WalkDirection = 'down' | 'up' | 'left' | 'right'

type DirectionalGodAnimationSet = Record<WalkDirection, { idle: string; walkStrip: string; workStrip: string }>

const HERMES_COMMAND_ASSET_VERSION = '20260516-hephaestus-directional-fullbody-v3'
const HEPHAESTUS_ASSET_VERSION = '20260516-hephaestus-pro-v1-true-8dir-work'
const HERCULES_ASSET_VERSION = '20260525-hercules-perceived-scale-v3'
const ATHENA_AGORA_ASSET_VERSION = '20260521-athena-v2-stable-side-strip-renderer'
const ORACLE_ASSET_VERSION = '20260516-oracle-stable-no-tool-flicker-v2'
const TREASURY_DWARF_ASSET_VERSION = '20260516-treasury-dwarf-360-v2-cleaned'
const TREASURY_RUNTIME_PROOF_FRAMES = 60
const NJORD_ASSET_VERSION = '20260517-merchant-harbor-njord-v1'
const POSEIDON_ASSET_VERSION = '20260521-poseidon-facing-corrected-v1'
const ATLANTIS_ARCHIVIST_ASSET_VERSION = '20260517-atlantis-archivist-v1-clean'
const HERMES_COMMAND_ASSET_BASE = '/war-room/olympus-command/hermes-90frame-v1/processed'
const ORACLE_ASSET_BASE = '/war-room/oracle-signals-90frame-v1/processed-stable'
const ORACLE_TOOL_ASSET_BASE = '/war-room/oracle-signals-90frame-v1/tools-animated'
const TREASURY_DWARF_ASSET_BASE = '/war-room/treasury-dwarf-360-v2/processed'
const TREASURY_TOOL_ASSET_BASE = '/war-room/treasury-dwarf-360-v1/processed'
const HERCULES_STYLE_ASSET_BASE = '/war-room/pantheon-hercules-fresh-v1/processed'
const HERCULES_STYLE_MODEL = `${HERCULES_STYLE_ASSET_BASE}/hercules-model.png`
const HERCULES_STYLE_WALK_STRIP = `${HERCULES_STYLE_ASSET_BASE}/hercules-walk-strip.png`
const HERCULES_STYLE_WORK_STRIP = `${HERCULES_STYLE_ASSET_BASE}/hercules-work-strip.png`
const HERCULES_RIGHT_FACING_WORK_STATIONS = new Set(['roster-board', 'model-statues'])
const HERCULES_PANTHEON_TOOL_STRIPS: Partial<Record<string, string>> = {
  'agent-chambers': '/war-room/hercules-style/pantheon-tools-v1/agent-chambers-strip.png',
  'roster-board': '/war-room/hercules-style/pantheon-tools-v1/roster-board-strip.png',
  'review-table': '/war-room/hercules-style/pantheon-tools-v1/review-table-strip.png',
  'training-yard': '/war-room/hercules-style/pantheon-tools-v1/training-yard-strip.png',
  'model-statues': '/war-room/hercules-style/pantheon-tools-v1/model-statues-strip.png',
}
const ATHENA_AGORA_TOOL_STRIPS: Partial<Record<string, string>> = {
  'idea-stalls': '/war-room/agora-athena-v1/processed/idea-stalls-strip.png',
  'competitor-board': '/war-room/agora-athena-v1/processed/competitor-board-strip.png',
  'alura-etsy-counter': '/war-room/agora-athena-v1/processed/alura-etsy-counter-strip.png',
  'niche-scroll-rack': '/war-room/agora-athena-v1/processed/niche-scroll-rack-strip.png',
  'shop-expansion-stalls': '/war-room/agora-athena-v1/processed/shop-expansion-stalls-strip.png',
}
const HERMES_COMMAND_TOOL_STRIPS: Partial<Record<string, string>> = {
  'dispatch-beacon': '/war-room/olympus-command/hermes-90frame-v1/tools/dispatch-beacon-strip.png',
  'gateway-console': '/war-room/olympus-command/hermes-90frame-v1/tools/gateway-console-strip.png',
  'aegis-approval-seal': '/war-room/olympus-command/hermes-90frame-v1/tools/aegis-approval-seal-strip.png',
  'mission-archive-pedestal': '/war-room/olympus-command/hermes-90frame-v1/tools/mission-archive-pedestal-strip.png',
}

const HEPHAESTUS_PRO_ASSET_BASE = '/war-room/hephaestus-pro-v1/processed'
const HEPHAESTUS_FORGE_ASSET_BASE = HEPHAESTUS_FULL_BODY_ASSET_BASE
const HEPHAESTUS_FORGE_TOOL_STRIPS: Partial<Record<string, string>> = {
  'approval-shrine': '/war-room/forge-hephaestus-caesar-source-v1/tools-animated/approval-shrine-strip.png',
  'prompt-anvil': '/war-room/forge-hephaestus-caesar-source-v1/tools-animated/prompt-anvil-strip.png',
  'model-bellows': '/war-room/forge-hephaestus-caesar-source-v1/tools-animated/model-bellows-strip.png',
  'sorting-rack': '/war-room/forge-hephaestus-caesar-source-v1/tools-animated/sorting-rack-strip.png',
  'listing-easel': '/war-room/forge-hephaestus-caesar-source-v1/tools-animated/listing-easel-strip.png',
  'skills-forge': '/war-room/forge-hephaestus-caesar-source-v1/tools-animated/skills-forge-strip.png',
}

const HEPHAESTUS_90_WORK_STRIPS: Record<string, string> = {
  'approval-shrine': `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-work-approval-shrine-strip.png`,
  'prompt-anvil': `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-work-prompt-anvil-strip.png`,
  'model-bellows': `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-work-model-bellows-strip.png`,
  'sorting-rack': `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-work-sorting-rack-strip.png`,
  'listing-easel': `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-work-listing-easel-strip.png`,
  'skills-forge': `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-work-skills-forge-strip.png`,
}

const HEPHAESTUS_90_WALK_STRIPS: Record<'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw', string> = {
  n: `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-walk-n-strip.png`,
  ne: `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-walk-ne-strip.png`,
  e: `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-walk-e-strip.png`,
  se: `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-walk-se-strip.png`,
  s: `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-walk-s-strip.png`,
  sw: `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-walk-sw-strip.png`,
  w: `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-walk-w-strip.png`,
  nw: `${HEPHAESTUS_PRO_ASSET_BASE}/hephaestus-walk-nw-strip.png`,
}

const HEPHAESTUS_RIGHT_FACING_WORK_STATIONS = new Set(['model-bellows', 'listing-easel'])

const HERMES_90_WALK_STRIPS: Record<'n' | 'ne' | 'e' | 'se' | 's', string> = {
  n: `${HERMES_COMMAND_ASSET_BASE}/hermes-walk-n-strip.png`,
  ne: `${HERMES_COMMAND_ASSET_BASE}/hermes-walk-ne-strip.png`,
  e: `${HERMES_COMMAND_ASSET_BASE}/hermes-walk-e-strip.png`,
  se: `${HERMES_COMMAND_ASSET_BASE}/hermes-walk-se-strip.png`,
  s: `${HERMES_COMMAND_ASSET_BASE}/hermes-walk-s-strip.png`,
}


const HERMES_90_WORK_STRIPS: Record<string, string> = {
  'dispatch-beacon': `${HERMES_COMMAND_ASSET_BASE}/hermes-work-dispatch-beacon-strip.png`,
  'gateway-console': `${HERMES_COMMAND_ASSET_BASE}/hermes-work-gateway-console-strip.png`,
  'aegis-approval-seal': `${HERMES_COMMAND_ASSET_BASE}/hermes-work-aegis-approval-seal-strip.png`,
  'mission-archive-pedestal': `${HERMES_COMMAND_ASSET_BASE}/hermes-work-mission-archive-pedestal-strip.png`,
  'war-table': `${HERMES_COMMAND_ASSET_BASE}/hermes-work-war-table-strip.png`,
  command: `${HERMES_COMMAND_ASSET_BASE}/hermes-dispatch-send-strip.png`,
  approval: `${HERMES_COMMAND_ASSET_BASE}/hermes-work-aegis-approval-seal-strip.png`,
  archive: `${HERMES_COMMAND_ASSET_BASE}/hermes-work-mission-archive-pedestal-strip.png`,
}

const ORACLE_90_WALK_STRIPS: Record<'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw', string> = {
  n: `${ORACLE_ASSET_BASE}/oracle-walk-n-strip.png`,
  ne: `${ORACLE_ASSET_BASE}/oracle-walk-ne-strip.png`,
  e: `${ORACLE_ASSET_BASE}/oracle-walk-e-strip.png`,
  se: `${ORACLE_ASSET_BASE}/oracle-walk-se-strip.png`,
  s: `${ORACLE_ASSET_BASE}/oracle-walk-s-strip.png`,
  sw: `${ORACLE_ASSET_BASE}/oracle-walk-sw-strip.png`,
  w: `${ORACLE_ASSET_BASE}/oracle-walk-w-strip.png`,
  nw: `${ORACLE_ASSET_BASE}/oracle-walk-nw-strip.png`,
}

const ORACLE_90_WORK_STRIPS: Record<'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw', string> = {
  n: `${ORACLE_ASSET_BASE}/oracle-work-n-strip.png`,
  ne: `${ORACLE_ASSET_BASE}/oracle-work-ne-strip.png`,
  e: `${ORACLE_ASSET_BASE}/oracle-work-e-strip.png`,
  se: `${ORACLE_ASSET_BASE}/oracle-work-se-strip.png`,
  s: `${ORACLE_ASSET_BASE}/oracle-work-s-strip.png`,
  sw: `${ORACLE_ASSET_BASE}/oracle-work-sw-strip.png`,
  w: `${ORACLE_ASSET_BASE}/oracle-work-w-strip.png`,
  nw: `${ORACLE_ASSET_BASE}/oracle-work-nw-strip.png`,
}

const ORACLE_TOOL_STRIPS: Partial<Record<string, string>> = {
  'signal-pool': `${ORACLE_TOOL_ASSET_BASE}/signal-pool-strip.png`,
  'keyword-crystal': `${ORACLE_TOOL_ASSET_BASE}/keyword-crystal-strip.png`,
  'trend-stars': `${ORACLE_TOOL_ASSET_BASE}/trend-stars-strip.png`,
  'stats-observatory': `${ORACLE_TOOL_ASSET_BASE}/stats-observatory-strip.png`,
  'alert-bell': `${ORACLE_TOOL_ASSET_BASE}/alert-bell-strip.png`,
}

const TREASURY_360_WALK_STRIPS: Record<'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw', string> = {
  n: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-walk-n-strip.png`,
  ne: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-walk-ne-strip.png`,
  e: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-walk-e-strip.png`,
  se: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-walk-se-strip.png`,
  s: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-walk-s-strip.png`,
  sw: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-walk-sw-strip.png`,
  w: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-walk-w-strip.png`,
  nw: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-walk-nw-strip.png`,
}

const TREASURY_360_WORK_STRIPS: Record<'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw', string> = {
  n: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-work-n-strip.png`,
  ne: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-work-ne-strip.png`,
  e: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-work-e-strip.png`,
  se: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-work-se-strip.png`,
  s: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-work-s-strip.png`,
  sw: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-work-sw-strip.png`,
  w: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-work-w-strip.png`,
  nw: `${TREASURY_DWARF_ASSET_BASE}/treasury-dwarf-work-nw-strip.png`,
}

const POSEIDON_ASSET_BASE = '/war-room/atlantis-vault-poseidon-v4/processed'
const POSEIDON_360_WALK_STRIPS: Record<'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw', string> = {
  n: `${POSEIDON_ASSET_BASE}/poseidon-walk-n-strip.png`,
  ne: `${POSEIDON_ASSET_BASE}/poseidon-walk-ne-strip.png`,
  e: `${POSEIDON_ASSET_BASE}/poseidon-walk-e-strip.png`,
  se: `${POSEIDON_ASSET_BASE}/poseidon-walk-se-strip.png`,
  s: `${POSEIDON_ASSET_BASE}/poseidon-walk-s-strip.png`,
  sw: `${POSEIDON_ASSET_BASE}/poseidon-walk-sw-strip.png`,
  w: `${POSEIDON_ASSET_BASE}/poseidon-walk-w-strip.png`,
  nw: `${POSEIDON_ASSET_BASE}/poseidon-walk-nw-strip.png`,
}

const POSEIDON_360_WORK_STRIPS: Record<'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw', string> = {
  n: `${POSEIDON_ASSET_BASE}/poseidon-work-n-strip.png`,
  ne: `${POSEIDON_ASSET_BASE}/poseidon-work-ne-strip.png`,
  e: `${POSEIDON_ASSET_BASE}/poseidon-work-e-strip.png`,
  se: `${POSEIDON_ASSET_BASE}/poseidon-work-se-strip.png`,
  s: `${POSEIDON_ASSET_BASE}/poseidon-work-s-strip.png`,
  sw: `${POSEIDON_ASSET_BASE}/poseidon-work-sw-strip.png`,
  w: `${POSEIDON_ASSET_BASE}/poseidon-work-w-strip.png`,
  nw: `${POSEIDON_ASSET_BASE}/poseidon-work-nw-strip.png`,
}

const TREASURY_TOOL_STRIPS: Partial<Record<string, string>> = {
  'margin-chest': `${TREASURY_TOOL_ASSET_BASE}/margin-chest-strip.png`,
  'cost-scales': `${TREASURY_TOOL_ASSET_BASE}/cost-scales-strip.png`,
  'ad-spend-gate': `${TREASURY_TOOL_ASSET_BASE}/ad-spend-gate-strip.png`,
  'api-usage-meter': `${TREASURY_TOOL_ASSET_BASE}/api-usage-meter-strip.png`,
  'revenue-ledger': `${TREASURY_TOOL_ASSET_BASE}/revenue-ledger-strip.png`,
  'approval-vault': `${TREASURY_TOOL_ASSET_BASE}/approval-vault-strip.png`,
}

const hermesCommandAnimation = {
  idle: `${HERMES_COMMAND_ASSET_BASE}/hermes-idle.png`,
  walkStrip: `${HERMES_COMMAND_ASSET_BASE}/hermes-walk-strip.png`,
  workStrip: `${HERMES_COMMAND_ASSET_BASE}/hermes-work-strip.png`,
}

const HERCULES_STYLE_GODS: Record<string, DirectionalGodAnimationSet> = {
  // Deprecated side-view Hermes command operator kept only as a rollback source.
  // Live Hermes now uses the direct-overhead strip renderer below for true 360° walking.
  hermes: {
    down: hermesCommandAnimation,
    up: hermesCommandAnimation,
    left: hermesCommandAnimation,
    right: hermesCommandAnimation,
  },
}

type GodTone = 'gold' | 'cyan' | 'violet' | 'emerald' | 'blue'

const GOD_TONES: Record<string, GodTone> = {
  hermes: 'cyan',
  hercules: 'gold',
  athena: 'blue',
  'oracle-researcher': 'violet',
  oracle: 'violet',
  hephaestus: 'gold',
  'merchant-scout': 'emerald',
  'atlantis-archivist': 'blue',
  'treasury-watcher': 'gold',
}

function godToneClasses(tone: GodTone) {
  if (tone === 'cyan') return { border: 'border-cyan-100/58', shadow: 'shadow-[0_0_26px_rgba(103,232,249,.36),0_16px_24px_rgba(0,0,0,.72)]', aura: 'border-cyan-100/58 shadow-[0_0_28px_rgba(103,232,249,.38)] bg-cyan-300/9' }
  if (tone === 'violet') return { border: 'border-violet-100/58', shadow: 'shadow-[0_0_26px_rgba(196,181,253,.36),0_16px_24px_rgba(0,0,0,.72)]', aura: 'border-violet-100/58 shadow-[0_0_28px_rgba(196,181,253,.38)] bg-violet-300/9' }
  if (tone === 'emerald') return { border: 'border-emerald-100/58', shadow: 'shadow-[0_0_26px_rgba(110,231,183,.34),0_16px_24px_rgba(0,0,0,.72)]', aura: 'border-emerald-100/58 shadow-[0_0_28px_rgba(110,231,183,.36)] bg-emerald-300/9' }
  if (tone === 'blue') return { border: 'border-sky-100/58', shadow: 'shadow-[0_0_26px_rgba(125,211,252,.34),0_16px_24px_rgba(0,0,0,.72)]', aura: 'border-sky-100/58 shadow-[0_0_28px_rgba(125,211,252,.36)] bg-sky-300/9' }
  return { border: 'border-amber-100/58', shadow: 'shadow-[0_0_26px_rgba(251,191,36,.36),0_16px_24px_rgba(0,0,0,.72)]', aura: 'border-amber-100/58 shadow-[0_0_28px_rgba(251,191,36,.34)] bg-amber-300/9' }
}

function hermes90WalkVisual(facingAngle: number): { strip: string; mirror: boolean } {
  const angle = ((facingAngle + 540) % 360) - 180
  if (angle >= -22.5 && angle < 22.5) return { strip: HERMES_90_WALK_STRIPS.n, mirror: false }
  if (angle >= 22.5 && angle < 67.5) return { strip: HERMES_90_WALK_STRIPS.ne, mirror: false }
  if (angle >= 67.5 && angle < 112.5) return { strip: HERMES_90_WALK_STRIPS.e, mirror: false }
  if (angle >= 112.5 && angle < 157.5) return { strip: HERMES_90_WALK_STRIPS.se, mirror: false }
  if (angle >= 157.5 || angle < -157.5) return { strip: HERMES_90_WALK_STRIPS.s, mirror: false }
  if (angle >= -157.5 && angle < -112.5) return { strip: HERMES_90_WALK_STRIPS.se, mirror: true }
  if (angle >= -112.5 && angle < -67.5) return { strip: HERMES_90_WALK_STRIPS.e, mirror: true }
  return { strip: HERMES_90_WALK_STRIPS.ne, mirror: true }
}

function oracle90Direction(facingAngle: number): 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' {
  const angle = ((facingAngle + 540) % 360) - 180
  if (angle >= -22.5 && angle < 22.5) return 'n'
  if (angle >= 22.5 && angle < 67.5) return 'ne'
  if (angle >= 67.5 && angle < 112.5) return 'e'
  if (angle >= 112.5 && angle < 157.5) return 'se'
  if (angle >= 157.5 || angle < -157.5) return 's'
  if (angle >= -157.5 && angle < -112.5) return 'sw'
  if (angle >= -112.5 && angle < -67.5) return 'w'
  return 'nw'
}

function oracle90WalkVisual(facingAngle: number): string {
  return ORACLE_90_WALK_STRIPS[oracle90Direction(facingAngle)]
}

function oracle90WorkVisual(facingAngle: number): string {
  return ORACLE_90_WORK_STRIPS[oracle90Direction(facingAngle)]
}

function treasury360Direction(facingAngle: number): 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' {
  return oracle90Direction(facingAngle)
}

function treasury360WalkVisual(facingAngle: number): string {
  return TREASURY_360_WALK_STRIPS[treasury360Direction(facingAngle)]
}

function treasury360WorkVisual(facingAngle: number): string {
  return TREASURY_360_WORK_STRIPS[treasury360Direction(facingAngle)]
}

function poseidon360WalkVisual(facingAngle: number): string {
  return POSEIDON_360_WALK_STRIPS[oracle90Direction(facingAngle)]
}

function poseidon360WorkVisual(facingAngle: number): string {
  return POSEIDON_360_WORK_STRIPS[oracle90Direction(facingAngle)]
}

function hephaestus360WalkStrip(facingAngle: number): string {
  return HEPHAESTUS_90_WALK_STRIPS[oracle90Direction(facingAngle)]
}

type MiniGodProps = {
  agent: OlympusAgentInstance
  target: OlympusPoint
  walking: boolean
  direction?: WalkDirection
  facingAngle?: number
  working?: boolean
  workKind?: string
}

export function MiniGod({ agent, target, walking, direction = 'down', facingAngle = 0, working = false, workKind }: MiniGodProps) {
  const coreAsset = walking ? AGENT_CORE_WORKING : AGENT_CORE_IDLE
  const portraitAsset = GOD_PORTRAITS[agent.id]
  const idleStrip = GOD_IDLE_STRIPS[agent.id]
  const walkStrip = GOD_WALK_STRIPS[agent.id]
  const workStrip = GOD_WORK_STRIPS[agent.id]
  const useHermes90FramePackage = agent.id === 'hermes'
  const useOracle90FramePackage = agent.id === 'oracle'
  const useTreasury360FramePackage = agent.id === 'treasury-watcher'
  const useNjordFramePackage = agent.id === 'njord'
  const usePoseidonFramePackage = agent.id === 'poseidon'
  const useAtlantisArchivistFramePackage = agent.id === 'atlantis-archivist'
  const useHerculesStyleModel = agent.id === 'hercules'
  const useAthenaSideStripModel = agent.id === 'athena'
  const hermesWalk = useHermes90FramePackage ? hermes90WalkVisual(facingAngle) : null
  const oracleWalk = useOracle90FramePackage ? oracle90WalkVisual(facingAngle) : null
  const treasuryWalk = useTreasury360FramePackage ? treasury360WalkVisual(facingAngle) : null
  const poseidonWalk = usePoseidonFramePackage ? poseidon360WalkVisual(facingAngle) : null
  const activeWalkStrip = useHermes90FramePackage ? hermesWalk?.strip : useOracle90FramePackage ? oracleWalk : useTreasury360FramePackage ? treasuryWalk : usePoseidonFramePackage ? poseidonWalk : agent.id === 'hephaestus' ? hephaestus360WalkStrip(facingAngle) : walkStrip
  const activeGodAssetVersion = usePoseidonFramePackage ? POSEIDON_ASSET_VERSION : useAtlantisArchivistFramePackage ? ATLANTIS_ARCHIVIST_ASSET_VERSION : useNjordFramePackage ? NJORD_ASSET_VERSION : useTreasury360FramePackage ? TREASURY_DWARF_ASSET_VERSION : agent.id === 'athena' ? ATHENA_AGORA_ASSET_VERSION : agent.id === 'oracle' ? ORACLE_ASSET_VERSION : agent.id === 'hephaestus' ? HEPHAESTUS_ASSET_VERSION : agent.id === 'hercules' ? HERCULES_ASSET_VERSION : HERMES_COMMAND_ASSET_VERSION
  const activeWorkStrip = useHermes90FramePackage
    ? (HERMES_90_WORK_STRIPS[workKind ?? ''] ?? workStrip)
    : useOracle90FramePackage
      ? oracle90WorkVisual(facingAngle)
      : useTreasury360FramePackage
        ? treasury360WorkVisual(facingAngle)
      : usePoseidonFramePackage
        ? poseidon360WorkVisual(facingAngle)
      : agent.id === 'hephaestus'
        ? (HEPHAESTUS_90_WORK_STRIPS[workKind ?? ''] ?? workStrip)
        : workStrip

  // The side-view Hermes command operator was not true 360° and looked buggy
  // while walking. Keep the asset around for rollback, but render Hermes through
  // the same overhead rotating strip path as the room/council scale.
  const usePortraitOperator = Boolean(portraitAsset)
  const facingFlip = 1
  const spriteScale = agent.id === 'hermes' ? 1 : agent.id === 'athena' ? 1 : agent.id === 'hephaestus' ? 1 : useHerculesStyleModel ? 1 : 0.96
  const visualScale = GOD_VISIBLE_SCALE[agent.id] ?? 1
  // Overhead strips are authored facing up/north. Rotate the whole token to
  // the actual movement angle, not just four cardinals. This makes horizontal
  // and diagonal station walks look smooth while avoiding mirror+rotate glitches.
  const cardinalRotation = direction === 'down' ? 180 : direction === 'right' ? 90 : direction === 'left' ? -90 : 0
  const sourceRotationOffset = GOD_SOURCE_ROTATION_OFFSETS[agent.id] ?? 0
  const overheadRotation = (walking || working ? facingAngle : cardinalRotation) + sourceRotationOffset
  const depth = 40 + Math.round(target.y)
  const overheadGodSize = agent.id === 'hermes' || agent.id === 'athena' || agent.id === 'hephaestus' || agent.id === 'treasury-watcher' || agent.id === 'njord' || agent.id === 'poseidon' || agent.id === 'atlantis-archivist' ? 99 : 86
  const herculesFrameSize = 160
  const herculesFrameCount = 6
  const athenaFrameSize = 160
  const athenaFrameCount = 6
  const overheadIdleFrameCount = agent.id === 'hermes' ? 1 : agent.id === 'hephaestus' ? 30 : agent.id === 'athena' || agent.id === 'treasury-watcher' || agent.id === 'njord' || agent.id === 'poseidon' || agent.id === 'atlantis-archivist' ? 6 : 4
  const overheadWalkFrameCount = agent.id === 'hephaestus' ? 6 : 6
  const overheadWorkFrameCount = agent.id === 'hephaestus' ? 6 : 6
  const runtimeProofFrames = agent.id === 'treasury-watcher' ? TREASURY_RUNTIME_PROOF_FRAMES : walking ? overheadWalkFrameCount : working ? overheadWorkFrameCount : overheadIdleFrameCount
  const activeAnimationState = walking ? 'walk' : working ? 'work' : 'rest'
  const activeStrip = walking ? activeWalkStrip : working ? activeWorkStrip : idleStrip
  const overheadIdleStripWidth = overheadGodSize * overheadIdleFrameCount
  const overheadWalkStripWidth = overheadGodSize * overheadWalkFrameCount
  const overheadWorkStripWidth = overheadGodSize * overheadWorkFrameCount
  // Travel one full strip width with steps(frameCount, end). Using
  // (frameCount - 1) made the browser sample between cells (e.g. 82.5px offsets
  // on 99px Hephaestus frames), which created the visible slideshow/tearing bug.
  const overheadIdleStripTravel = overheadGodSize * overheadIdleFrameCount
  const overheadWalkStripTravel = overheadGodSize * overheadWalkFrameCount
  const overheadWorkStripTravel = overheadGodSize * overheadWorkFrameCount
  // Hephaestus now has authored true 8-direction walk strips. Do not mirror the
  // directional sheet; choose the correct strip from facingAngle instead.
  const hephaestusWalkFlip = 1
  const hephaestusWorkFlip = working && agent.id === 'hephaestus' && HEPHAESTUS_RIGHT_FACING_WORK_STATIONS.has(workKind ?? '') ? -1 : 1
  // Hercules' strip is authored facing right. Mirror only when he actually moves left;
  // the old sign was inverted, so he walked backwards on rightward paths.
  const herculesMoveFlip = useHerculesStyleModel && Math.sin((facingAngle * Math.PI) / 180) < -0.08 ? -1 : 1
  const poseidonMoveFlip = usePoseidonFramePackage && Math.sin((facingAngle * Math.PI) / 180) < -0.08 ? -1 : 1
  const athenaMoveFlip = useAthenaSideStripModel && Math.sin((facingAngle * Math.PI) / 180) > 0.08 ? -1 : 1
  const herculesWorkFlip = useHerculesStyleModel && HERCULES_RIGHT_FACING_WORK_STATIONS.has(workKind ?? '') ? -1 : 1
  // Original War Room coordinates are floor/operator positions, not sprite centers.
  // The transparent 160px god cells place the feet/ground contact around 75–82%
  // down the frame. Anchor the runtime token there so rotations turn in place
  // instead of orbiting/sliding around the station target.
  const overheadGroundAnchorY = 82
  // Council commanders render at ~99px. Hermes should match them exactly and be
  // distinguished only by his light blue glow, not by being bigger.
  const figureBox = usePortraitOperator ? '' : 'h-[66px] w-[58px]'

  return (
    <div
      className="pointer-events-none absolute flex flex-col items-center will-change-[left,top,transform]"
      style={{ left: `${target.x}%`, top: `${target.y}%`, transform: `translate3d(-50%, -${usePortraitOperator ? overheadGroundAnchorY : 50}%, 0)`, zIndex: depth }}
      aria-hidden="true"
      title={agent.name}
      data-war-room-agent-id={agent.id}
      data-war-room-agent-animation-state={activeAnimationState}
      data-war-room-agent-runtime-proof-frames={runtimeProofFrames}
      data-war-room-agent-reduced-motion-fallback={agent.id === 'treasury-watcher' ? 'single-frame-station-lock' : undefined}
      data-war-room-agent-work-kind={workKind}
      data-war-room-agent-active-strip={activeStrip}
    >
      <style>{`
        @keyframes god-idle-strip-cycle { from { background-position-x: 0; } to { background-position-x: calc(-1 * var(--god-strip-travel, 472px)); } }
        @keyframes god-walk-strip-cycle { from { background-position-x: 0; } to { background-position-x: calc(-1 * var(--god-strip-travel, 708px)); } }
        @keyframes god-work-strip-cycle { from { background-position-x: 0; } to { background-position-x: calc(-1 * var(--god-strip-travel, 708px)); } }
        @keyframes hephaestus-walk-cycle { from { background-position-x: 0; } to { background-position-x: -416px; } }
        @keyframes hermes-command-strip-cycle { from { transform: translateX(0); } to { transform: translateX(-83.333333%); } }
        @keyframes hephaestus-body-bob { 0%,100% { transform: translate3d(0,0,0) rotate(var(--lean)); } 25% { transform: translate3d(0,-2px,0) rotate(var(--lean)); } 50% { transform: translate3d(0,.9px,0) rotate(var(--lean)); } 75% { transform: translate3d(0,-1.4px,0) rotate(var(--lean)); } }
        @keyframes hephaestus-idle-breathe { 0%,100% { transform: translate3d(0,0,0); filter: saturate(1.08) contrast(1.04); } 50% { transform: translate3d(0,-1.4px,0); filter: saturate(1.2) contrast(1.08); } }
        @keyframes hercules-style-work-bob { 0%,100% { transform: translate3d(0,0,0) rotate(-8deg); } 45% { transform: translate3d(7px,-8px,0) rotate(18deg); } 70% { transform: translate3d(2px,1px,0) rotate(-18deg); } }
        @keyframes hercules-style-tool-flash { 0%,100% { opacity: .25; transform: translate(-50%,-50%) scale(.76); } 45% { opacity: .95; transform: translate(-50%,-50%) scale(1.18); } }
        @keyframes god-portrait-rise { 0%,100% { transform: translate(-50%, -58%) scale(.98); opacity: .86; } 50% { transform: translate(-50%, -62%) scale(1.02); opacity: .98; } }
        @media (prefers-reduced-motion: reduce) {
          [data-war-room-agent-id='treasury-watcher'] [data-war-room-agent-sprite='treasury-watcher'] {
            animation: none !important;
            background-position: 0 0 !important;
            transition: none !important;
          }
        }
      `}</style>
      <div
          className={`absolute left-1/2 top-[76%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/82 blur-md transition-all duration-200 ${usePortraitOperator ? 'h-5 w-16 opacity-88' : 'h-4 w-12 opacity-82'}`}
      />
      <div
        className={`relative grid place-items-center ${figureBox}`}
        style={{ transform: `scaleX(${facingFlip}) scale(${spriteScale * visualScale})` }}
      >
        {useAthenaSideStripModel ? (
        <div
          className="relative [image-rendering:pixelated]"
          style={{
            width: athenaFrameSize,
            height: athenaFrameSize,
            transform: `scaleX(${walking ? athenaMoveFlip : 1}) scale(${spriteScale})`,
            animation: !walking && !working ? 'hephaestus-idle-breathe 2600ms ease-in-out infinite' : undefined,
          }}
        >
          <span className="absolute left-1/2 top-[90%] h-3.5 w-[74px] -translate-x-1/2 rounded-full bg-black/70 blur-md" />
          <div
            className="relative h-full w-full bg-no-repeat drop-shadow-[0_14px_14px_rgba(0,0,0,.88)] will-change-[background-position,transform]"
            style={{
              ['--god-strip-travel' as string]: `${athenaFrameSize * athenaFrameCount}px`,
              backgroundImage: `url(${walking ? activeWalkStrip : working ? activeWorkStrip : idleStrip}?v=${ATHENA_AGORA_ASSET_VERSION})`,
              backgroundSize: `${athenaFrameSize * athenaFrameCount}px ${athenaFrameSize}px`,
              backgroundPosition: '0 0',
              animation: walking
                ? `god-walk-strip-cycle 780ms steps(${athenaFrameCount}, end) infinite`
                : working
                  ? `god-work-strip-cycle 920ms steps(${athenaFrameCount}, end) infinite`
                  : `god-idle-strip-cycle 1500ms steps(${athenaFrameCount}, end) infinite`,
            }}
          />
        </div>
      ) : useHerculesStyleModel ? (
        <div
          className="relative [image-rendering:pixelated]"
          style={{
            width: herculesFrameSize,
            height: herculesFrameSize,
            transform: `scaleX(${walking ? herculesMoveFlip : working ? herculesWorkFlip : 1}) scale(${spriteScale})`,
            animation: !walking && !working ? 'hephaestus-idle-breathe 2600ms ease-in-out infinite' : undefined,
          }}
        >
          <span className="absolute left-1/2 top-[90%] h-4 w-[86px] -translate-x-1/2 rounded-full bg-black/72 blur-md" />
          {walking || working ? (
            <div
              className="relative h-full w-full bg-no-repeat drop-shadow-[0_14px_14px_rgba(0,0,0,.88)] will-change-[background-position,transform]"
              style={{
                ['--god-strip-travel' as string]: `${herculesFrameSize * herculesFrameCount}px`,
                backgroundImage: `url(${working ? HERCULES_STYLE_WORK_STRIP : HERCULES_STYLE_WALK_STRIP}?v=${HERCULES_ASSET_VERSION})`,
                backgroundSize: `${herculesFrameSize * herculesFrameCount}px ${herculesFrameSize}px`,
                backgroundPosition: '0 0',
                animation: `god-${working ? 'work' : 'walk'}-strip-cycle ${working ? '900ms' : '720ms'} steps(${herculesFrameCount}, end) infinite`,
              }}
            />
          ) : (
            <img
              src={`${HERCULES_STYLE_MODEL}?v=${HERCULES_ASSET_VERSION}`}
              alt=""
              className="relative h-full w-full object-contain drop-shadow-[0_14px_14px_rgba(0,0,0,.88)] [image-rendering:pixelated]"
              draggable={false}
            />
          )}
        </div>
      ) : usePortraitOperator ? (
          <div
            className="relative"
            style={{ width: overheadGodSize, height: overheadGodSize, animation: !walking && !working ? 'hephaestus-idle-breathe 2600ms ease-in-out infinite' : undefined }}
          >
            <span className="absolute left-1/2 top-[88%] h-3.5 w-[72px] -translate-x-1/2 rounded-full bg-black/70 blur-md" />
            {(walking ? activeWalkStrip : working ? activeWorkStrip : idleStrip) ? (
              <div
                className="relative h-full w-full bg-no-repeat drop-shadow-[0_12px_11px_rgba(0,0,0,.84)] [image-rendering:pixelated] will-change-[background-position,transform]"
                data-war-room-agent-sprite={agent.id}
                data-war-room-agent-sprite-state={activeAnimationState}
                data-war-room-agent-sprite-frames={walking ? overheadWalkFrameCount : working ? overheadWorkFrameCount : overheadIdleFrameCount}
                data-war-room-agent-runtime-proof-frames={runtimeProofFrames}
                style={{
                  ['--god-strip-travel' as string]: `${walking ? overheadWalkStripTravel : working ? overheadWorkStripTravel : overheadIdleStripTravel}px`,
                  backgroundImage: `url(${walking ? activeWalkStrip : working ? activeWorkStrip : idleStrip}?v=${activeGodAssetVersion})`,
                  backgroundSize: `${walking ? overheadWalkStripWidth : working ? overheadWorkStripWidth : overheadIdleStripWidth}px ${overheadGodSize}px`,
                  backgroundPosition: '0 0',
                  transformOrigin: `50% ${overheadGroundAnchorY}%`,
                  transform: agent.id === 'hephaestus'
                    ? `scaleX(${walking ? hephaestusWalkFlip : hephaestusWorkFlip}) scale(${spriteScale})`
                    : useHermes90FramePackage
                    ? `scaleX(${walking && hermesWalk?.mirror ? -1 : 1}) scale(${spriteScale})`
                    : usePoseidonFramePackage
                    ? `scaleX(${walking ? poseidonMoveFlip : 1}) scale(${spriteScale})`
                    : useOracle90FramePackage || useTreasury360FramePackage || useNjordFramePackage || useAtlantisArchivistFramePackage
                    ? `scale(${spriteScale})`
                    : walking && agent.id !== 'hephaestus' ? `rotate(${overheadRotation}deg) scale(${spriteScale})` : `scale(${spriteScale})`,
                  animation: walking
                    ? `god-walk-strip-cycle ${agent.id === 'hephaestus' ? '720ms steps(6, end)' : '780ms steps(6, end)'} infinite`
                    : working
                      ? agent.id === 'treasury-watcher'
                        ? 'god-idle-strip-cycle 1200ms steps(6, end) infinite'
                        : `god-work-strip-cycle ${agent.id === 'hephaestus' ? '960ms steps(6, end)' : '920ms steps(6, end)'} infinite`
                      : agent.id === 'hermes'
                        ? 'none'
                        : agent.id === 'hephaestus'
                          ? 'god-idle-strip-cycle 2600ms steps(30, end) infinite'
                          : agent.id === 'treasury-watcher' || agent.id === 'njord' || agent.id === 'poseidon'
                            ? 'god-idle-strip-cycle 1200ms steps(6, end) infinite'
                          : 'god-idle-strip-cycle 1500ms steps(4, end) infinite',
                }}
              />
            ) : (
              <img src={`${portraitAsset}?v=20260514-directional-overhead-1`} alt="" className="relative h-full w-full object-contain drop-shadow-[0_12px_12px_rgba(0,0,0,.84)] [image-rendering:pixelated]" draggable={false} />
            )}
          </div>
        ) : (
          <img
            src={`${agent.idleFrame ?? agent.spriteSheet}?v=20260513-premium-god-presence-2`}
            alt=""
            className="relative h-[66px] w-[58px] object-contain opacity-100 drop-shadow-[0_18px_18px_rgba(0,0,0,.94)]"
            style={agent.idleFrame || agent.spriteSheet ? { animation: 'hephaestus-idle-breathe 2600ms ease-in-out infinite' } : undefined}
            draggable={false}
          />
        )}
      </div>
    </div>
  )
}

type StationBadge = { id: string; label: string; state: string; tone: 'emerald' | 'amber' | 'red' | 'sky' | 'violet' }

type StationPropProps = {
  station: OlympusStation
  active: boolean
  ambientActive?: boolean
  badges?: Array<StationBadge>
  onSelect: (station: OlympusStation) => void
}

function badgeClasses(tone: StationBadge['tone']) {
  if (tone === 'emerald') return 'border-emerald-100/45 bg-emerald-300/20 text-emerald-50 shadow-[0_0_18px_rgba(52,211,153,.24)]'
  if (tone === 'red') return 'border-red-100/40 bg-red-400/18 text-red-50 shadow-[0_0_18px_rgba(248,113,113,.22)]'
  if (tone === 'sky') return 'border-sky-100/44 bg-sky-300/18 text-sky-50 shadow-[0_0_18px_rgba(125,211,252,.22)]'
  if (tone === 'violet') return 'border-violet-100/40 bg-violet-300/18 text-violet-50 shadow-[0_0_18px_rgba(196,181,253,.22)]'
  return 'border-amber-100/48 bg-amber-300/20 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,.25)]'
}

export function StationProp({ station, active, ambientActive = false, badges = [], onSelect }: StationPropProps) {
  void ambientActive
  const primaryBadge = badges.at(0)
  const labelX = station.labelSpot?.x ?? station.position.x
  const labelY = Math.max(8, Math.min(88, station.position.y - station.size.h / 2 - 5))
  const avoidCenterOperator = station.position.y < 36 && station.position.x > 35 && station.position.x < 65
  const badgeX = avoidCenterOperator ? Math.min(86, station.position.x + 17) : labelX
  const badgeY = avoidCenterOperator ? Math.min(54, station.position.y + 16) : (station.labelSpot?.y ?? Math.min(89, station.position.y + station.size.h / 2 + 4))
  const commandToolStrip = HERMES_COMMAND_TOOL_STRIPS[station.id]
  const forgeToolStrip = HEPHAESTUS_FORGE_TOOL_STRIPS[station.id]
  const pantheonToolStrip = HERCULES_PANTHEON_TOOL_STRIPS[station.id]
  const agoraToolStrip = ATHENA_AGORA_TOOL_STRIPS[station.id]
  const oracleToolStrip = ORACLE_TOOL_STRIPS[station.id]
  const treasuryToolStrip = TREASURY_TOOL_STRIPS[station.id]
  const animatedToolStrip = commandToolStrip ?? forgeToolStrip ?? pantheonToolStrip
  const animatedToolAssetVersion = treasuryToolStrip ? TREASURY_DWARF_ASSET_VERSION : oracleToolStrip ? ORACLE_ASSET_VERSION : agoraToolStrip ? ATHENA_AGORA_ASSET_VERSION : forgeToolStrip ? HEPHAESTUS_ASSET_VERSION : pantheonToolStrip ? HERCULES_ASSET_VERSION : HERMES_COMMAND_ASSET_VERSION
  const animatedToolFrameCount = oracleToolStrip || treasuryToolStrip ? 6 : 10
  const toolHighlighted = Boolean(animatedToolStrip && active)
  // DLV reported Oracle tool flicker. Keep every Oracle tool on a stable base frame;
  // Oracle's own walk/work strip carries the interaction animation.
  // Olympus Command has live council commanders walking at z=120. The station
  // hotspots still need to win clicks, otherwise a tool click opens a commander
  // chat and the room feels buggy.
  const depth = animatedToolStrip ? 136 : 20 + Math.round(station.position.y)
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: depth }}>
      <style>{`
        @keyframes olympus-command-tool-strip-cycle { from { background-position-x: 0%; } to { background-position-x: -500%; } }
        @keyframes olympus-command-tool-levitate { 0%,100% { transform: translate(-50%, -50%) translateY(0) scale(1); filter: saturate(1.08) contrast(1.04); } 50% { transform: translate(-50%, -50%) translateY(-3px) scale(1.015); filter: saturate(1.2) contrast(1.08); } }
        @keyframes olympus-command-tool-light-cycle { 0%,100% { filter: saturate(1.08) contrast(1.04) drop-shadow(0 16px 20px rgba(0,0,0,.78)); } 45% { filter: saturate(1.28) contrast(1.12) drop-shadow(0 0 30px rgba(103,232,249,.68)); } }
      `}</style>
      <button
        type="button"
        onClick={() => onSelect(station)}
        aria-pressed={active}
        aria-label={`Open ${station.name}`}
        className="peer pointer-events-auto absolute z-30 border-0 bg-transparent p-0 opacity-0 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-amber-100/80"
        style={{ left: `${station.hotspot.x}%`, top: `${station.hotspot.y}%`, width: `${station.hotspot.w}%`, height: `${station.hotspot.h}%`, clipPath: 'polygon(50% 0%, 88% 17%, 100% 52%, 76% 90%, 24% 90%, 0% 52%, 12% 17%)' }}
      />
      {animatedToolStrip ? (
        <div
          className={`pointer-events-none absolute z-20 bg-no-repeat transition duration-500 ${toolHighlighted ? 'drop-shadow-[0_0_22px_rgba(103,232,249,.42)]' : 'drop-shadow-[0_16px_20px_rgba(0,0,0,.78)]'} [image-rendering:pixelated]`}
          style={{
            left: `${station.position.x}%`,
            top: `${station.position.y}%`,
            width: `${station.size.w}%`,
            height: `${station.size.h}%`,
            transform: 'translate(-50%, -50%)',
            backgroundImage: `url(${animatedToolStrip}?v=${animatedToolAssetVersion})`,
            backgroundSize: `${animatedToolFrameCount * 100}% 100%`,
            backgroundPosition: '0% 0%',
            // Oracle tools are 6-frame real strips and should visibly work when selected.
            // Other rooms stay frozen here because their prior tool-strip motion was rejected as flicker.
            animation: 'none',
            filter: toolHighlighted ? 'saturate(1.18) contrast(1.08) brightness(1.08)' : undefined,
          }}
        />
      ) : (
        <img
          src={`${station.asset}?v=20260513-direct-overhead-v2`}
          alt=""
          className={`pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 object-contain transition duration-500 ${active ? 'drop-shadow-[0_0_28px_rgba(255,216,120,.92)]' : 'drop-shadow-[0_16px_20px_rgba(0,0,0,.78)]'} [image-rendering:pixelated]`}
          style={{
            left: `${station.position.x}%`,
            top: `${station.position.y}%`,
            width: `${station.size.w}%`,
            height: `${station.size.h}%`,
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 50%, rgba(0,0,0,.88) 70%, transparent 96%)',
            maskImage: 'radial-gradient(ellipse at center, black 50%, rgba(0,0,0,.88) 70%, transparent 96%)',
          }}
          draggable={false}
        />
      )}

      {primaryBadge && active ? (
        <div
          className={`pointer-events-none absolute z-[36] flex max-w-[150px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.09em] backdrop-blur-sm transition duration-300 ${badgeClasses(primaryBadge.tone)} scale-105 opacity-100`}
          style={{ left: `${badgeX}%`, top: `${badgeY}%`, transform: 'translate(-50%, -50%)' }}
        >
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-black/46 px-1 font-serif text-[10px]">◆</span>
          <span className="inline truncate">{primaryBadge.label}</span>
        </div>
      ) : null}
      <div
        className={`pointer-events-none absolute z-[37] grid h-[28px] min-w-[124px] place-items-center px-3 text-center font-serif text-[8px] font-black uppercase tracking-[0.11em] text-[#ffeeb0] opacity-0 drop-shadow-[0_10px_16px_rgba(0,0,0,.66)] transition duration-300 peer-hover:-translate-y-1 peer-hover:opacity-90 peer-focus:opacity-100 ${active ? 'opacity-100' : ''}`}
        style={{ left: `${labelX}%`, top: `${labelY}%`, transform: 'translate(-50%, -50%)' }}
      >
        <img src={STATION_LABEL_PLAQUE} alt="" className="absolute inset-0 h-full w-full object-fill opacity-78" draggable={false} />
        <span className="relative z-10 max-w-[104px] truncate">{station.name}</span>
      </div>
    </div>
  )
}
