import type { OlympusGameManifest, OlympusRoom, OlympusStation } from './types'

export { realmMapHotspots } from './realm-graph'

const roomBounds = { w: 1600, h: 900 }
const defaultDialogLayout = 'forgeStationDialog'

function stationCopy(kind: string, name: string) {
  if (kind === 'command') {
    return {
      description: `${name} shows the current mission handoff, gateway health, and review state without triggering live actions.`,
      statusLines: ['Mission context visible.', 'Gateway status checked.', 'Human review preserved.'],
    }
  }
  if (kind === 'approval') {
    return {
      description: `${name} protects anything that could affect a shop, account, customer, supplier, or spend.`,
      statusLines: ['Human approval lock active.', 'Preview only.', 'No live shop action.'],
    }
  }
  if (kind === 'model') {
    return {
      description: `${name} summarizes the available workers and routing choices before draft work begins.`,
      statusLines: ['Routing state checked.', 'Fallbacks visible.', 'No provider changes here.'],
    }
  }
  if (kind === 'archive') {
    return {
      description: `${name} opens saved reports, screenshots, decisions, and reusable lessons for review.`,
      statusLines: ['Archive index ready.', 'Evidence preserved.', 'Reusable notes available.'],
    }
  }
  if (kind === 'supplier') {
    return {
      description: `${name} reviews sourcing candidates, supplier signals, and risk notes in read-only mode.`,
      statusLines: ['Supplier context visible.', 'Risk notes checked.', 'No supplier messages.'],
    }
  }
  if (kind === 'finance') {
    return {
      description: `${name} keeps margins, costs, spend, and paid operations behind a review gate.`,
      statusLines: ['Cost signal visible.', 'Spend remains locked.', 'Approval required.'],
    }
  }
  if (kind === 'signals' || kind === 'research') {
    return {
      description: `${name} turns market signals into reviewable observations before any downstream work is queued.`,
      statusLines: ['Signal snapshot ready.', 'Opportunity notes staged.', 'Review before action.'],
    }
  }
  return {
    description: `${name} is ready for draft-only inspection inside this room.`,
    statusLines: ['Context prepared.', 'Ready for review.', 'Safety lock active.'],
  }
}

function station(id: string, name: string, kind: string, asset: string, x: number, y: number, dialogLayout = defaultDialogLayout): OlympusStation {
  const copy = stationCopy(kind, name)
  return {
    id,
    name,
    kind,
    asset,
    position: { x, y },
    size: { w: 11.2, h: 14.8 },
    hotspot: { x: x - 7.0, y: y - 10.2, w: 14.0, h: 16.2 },
    operatorSpot: { x: Math.max(12, Math.min(88, x + (x < 50 ? 11 : -11))), y: Math.min(86, y + 11) },
    labelSpot: { x, y: Math.min(89, y + 15) },
    dialogLayout,
    description: copy.description,
    statusLines: copy.statusLines,
    allowedActions: ['Inspect status', 'Stage draft-only work', 'Open read-only context'],
    forbiddenActions: ['Publish', 'Purchase', 'Change live shop/account state'],
  }
}

const rooms: Array<OlympusRoom> = [
  {
    id: 'olympus-command',
    name: 'Olympus Command',
    backgroundAsset: '/war-room/direct-overhead-v4-4k-empty/rooms/olympus-command/floor-base.png',
    bounds: roomBounds,
    tileGrid: { cols: 40, rows: 23 },
    entryPoints: { worldMap: { x: 50, y: 92 } },
    stations: [
      {
        ...station('war-table', 'Council War Table', 'command', '/war-room/council/council-war-table-seven-chairs-premium-maps-wine-sigils.png', 50, 56, 'olympusCommandDialog'),
        size: { w: 42, h: 40 },
        hotspot: { x: 29, y: 36, w: 42, h: 40 },
        operatorSpot: { x: 50, y: 33 },
        labelSpot: { x: 50, y: 33 },
        description: 'The main Olympus council table. Press it to open mission routing, approval, vote history, Omens, and gateway health.',
        statusLines: ['Council seats ready.', 'Seven legends can gather here.', 'Click the table to open the command dossier.'],
      },
      station('dispatch-beacon', 'Hermes Dispatch Beacon', 'command', '/war-room/olympus-command/hermes-agent-v2/tools/dispatch-beacon.png', 50, 20, 'olympusCommandDialog'),
      station('gateway-console', 'Gateway Console', 'command', '/war-room/olympus-command/hermes-agent-v2/tools/gateway-console.png', 83, 38, 'olympusCommandDialog'),
      station('aegis-approval-seal', 'Aegis Approval Seal', 'approval', '/war-room/olympus-command/hermes-agent-v2/tools/aegis-approval-seal.png', 78, 81, 'olympusCommandDialog'),
      station('mission-archive-pedestal', 'Mission Archive Pedestal', 'archive', '/war-room/olympus-command/hermes-agent-v2/tools/mission-archive-pedestal.png', 22, 80, 'olympusCommandDialog'),
    ],
    agents: [{ id: 'hermes', name: 'Hermes', role: 'Messenger/router', roomId: 'olympus-command', spriteSheet: '/war-room/olympus-command/hermes-90frame-v1/processed/hermes-model.png', idleFrame: '/war-room/olympus-command/hermes-90frame-v1/processed/hermes-model.png', position: { x: 50, y: 66 }, patrolPoints: [{ x: 42, y: 64 }, { x: 54, y: 58 }, { x: 62, y: 70 }, { x: 36, y: 72 }], state: 'idle', speech: 'Command floor is open. Select a wall tool and I will route the work.' }],
  },
  {
    id: 'pantheon-quarters',
    name: 'Pantheon Quarters',
    backgroundAsset: '/war-room/direct-overhead-v4-4k-empty/rooms/pantheon-quarters/floor-base.png',
    bounds: roomBounds,
    tileGrid: { cols: 40, rows: 23 },
    entryPoints: { worldMap: { x: 50, y: 92 } },
    stations: [
      station('agent-chambers', 'Agent Chambers', 'agents', '/war-room/hercules-style/pantheon-tools-v1/agent-chambers.png', 17, 36, 'pantheonDialog'),
      station('roster-board', 'Roster Board', 'model', '/war-room/hercules-style/pantheon-tools-v1/roster-board.png', 83, 35, 'pantheonDialog'),
      station('review-table', 'Review Table', 'approval', '/war-room/hercules-style/pantheon-tools-v1/review-table.png', 50, 17, 'pantheonDialog'),
      station('training-yard', 'Training Yard', 'skills', '/war-room/hercules-style/pantheon-tools-v1/training-yard.png', 18, 82, 'pantheonDialog'),
      station('model-statues', 'Model Statues', 'model', '/war-room/hercules-style/pantheon-tools-v1/model-statues.png', 83, 82, 'pantheonDialog'),
    ],
    agents: [{ id: 'hercules', name: 'Hercules', role: 'Heavy worker / agent trainer', roomId: 'pantheon-quarters', spriteSheet: '/war-room/pantheon-hercules-fresh-v1/processed/hercules-model.png', idleFrame: '/war-room/pantheon-hercules-fresh-v1/processed/hercules-model.png', position: { x: 52, y: 64 }, state: 'idle', speech: 'The roster room is clear. Pick a chamber, board, or review station.' }],
  },
  {
    id: 'agora',
    name: 'Agora of Opportunity',
    backgroundAsset: '/war-room/direct-overhead-v4-4k-empty/rooms/agora-opportunity/floor-base.png',
    bounds: roomBounds,
    tileGrid: { cols: 40, rows: 23 },
    entryPoints: { worldMap: { x: 50, y: 92 } },
    stations: [
      station('idea-stalls', 'Idea Stalls', 'research', '/war-room/agora-athena-v1/processed/idea-stalls.png', 16, 42, 'agoraDialog'),
      station('competitor-board', 'Competitor Board', 'signals', '/war-room/agora-athena-v1/processed/competitor-board.png', 84, 39, 'agoraDialog'),
      station('alura-etsy-counter', 'Alura / Etsy Counter', 'signals', '/war-room/agora-athena-v1/processed/alura-etsy-counter.png', 50, 17, 'agoraDialog'),
      station('niche-scroll-rack', 'Niche Scroll Rack', 'archive', '/war-room/agora-athena-v1/processed/niche-scroll-rack.png', 19, 82, 'agoraDialog'),
      station('shop-expansion-stalls', 'Shop Expansion Stalls', 'finance', '/war-room/agora-athena-v1/processed/shop-expansion-stalls.png', 82, 82, 'agoraDialog'),
    ],
    agents: [{ id: 'athena', name: 'Athena', role: 'Opportunity strategist and marketplace analyst', roomId: 'agora', spriteSheet: '/war-room/agora-athena-v1/processed/athena-model.png', idleFrame: '/war-room/agora-athena-v1/processed/athena-model.png', position: { x: 50, y: 66 }, state: 'idle', speech: 'The Agora is under strategy review. Choose a market stall, board, or scroll rack.' }],
  },
  {
    id: 'oracle',
    name: 'Oracle of Signals',
    backgroundAsset: '/war-room/direct-overhead-v4-4k-empty/rooms/oracle-signals/floor-base.png',
    bounds: roomBounds,
    tileGrid: { cols: 40, rows: 23 },
    entryPoints: { worldMap: { x: 50, y: 92 } },
    stations: [
      station('signal-pool', 'Signal Pool', 'signals', '/war-room/oracle-signals-90frame-v1/tools-animated/signal-pool.png', 16, 48, 'oracleDialog'),
      station('keyword-crystal', 'Keyword Crystal', 'signals', '/war-room/oracle-signals-90frame-v1/tools-animated/keyword-crystal.png', 50, 17, 'oracleDialog'),
      station('trend-stars', 'Trend Stars', 'signals', '/war-room/oracle-signals-90frame-v1/tools-animated/trend-stars.png', 84, 39, 'oracleDialog'),
      station('stats-observatory', 'Stats Observatory', 'finance', '/war-room/oracle-signals-90frame-v1/tools-animated/stats-observatory.png', 19, 82, 'oracleDialog'),
      station('alert-bell', 'Alert Bell', 'approval', '/war-room/oracle-signals-90frame-v1/tools-animated/alert-bell.png', 82, 82, 'oracleDialog'),
    ],
    agents: [{ id: 'oracle', name: 'Oracle', role: 'Trend/signal analyst', roomId: 'oracle', spriteSheet: '/war-room/oracle-signals-90frame-v1/processed/oracle-model.png', idleFrame: '/war-room/oracle-signals-90frame-v1/processed/oracle-model.png', position: { x: 50, y: 64 }, state: 'idle', speech: 'The signal floor is open. The instruments stay near the walls.' }],
  },
  {
    id: 'forge',
    name: 'Forge of Hephaestus',
    backgroundAsset: '/war-room/direct-overhead-v4-4k-empty/rooms/forge-hephaestus/floor-base.png',
    bounds: roomBounds,
    tileGrid: { cols: 40, rows: 23 },
    entryPoints: { worldMap: { x: 50, y: 92 }, mainDoor: { x: 50, y: 88 } },
    stations: [
      {
        id: 'approval-shrine',
        name: 'Approval Shrine',
        kind: 'approval',
        asset: '/war-room/forge-hephaestus-caesar-source-v1/tools/approval-shrine.png',
        position: { x: 50, y: 20 },
        size: { w: 13.2, h: 15.8 },
        hotspot: { x: 44.5, y: 13, w: 11, h: 15 },
        operatorSpot: { x: 50, y: 39 },
        labelSpot: { x: 50, y: 32 },
        dialogLayout: defaultDialogLayout,
        description: 'DLV approval gate. Live shop actions remain locked unless DLV explicitly opens the seal.',
        statusLines: ['Approval seal locked.', 'Draft-only review allowed.', 'No account changes.'],
        allowedActions: ['Review approval reason', 'Queue draft-only work'],
        forbiddenActions: ['Publish', 'Purchase', 'Refund/message/account change'],
      },
      {
        id: 'prompt-anvil',
        name: 'Prompt Anvil',
        kind: 'prompt',
        asset: '/war-room/forge-hephaestus-caesar-source-v1/tools/prompt-anvil.png',
        position: { x: 17, y: 73 },
        size: { w: 13.2, h: 15.8 },
        hotspot: { x: 11.5, y: 64, w: 11, h: 15 },
        operatorSpot: { x: 31, y: 73 },
        labelSpot: { x: 18, y: 87 },
        dialogLayout: defaultDialogLayout,
        description: 'Turns a product idea into draft-only creative briefs, variant rules, and review notes before any customer-facing work begins.',
        statusLines: ['Draft brief prepared.', 'Variant rules checked.', 'Ready for review.'],
        allowedActions: ['Draft prompts', 'Stage variants'],
        forbiddenActions: ['Publish listing', 'Paid generation'],
      },
      {
        id: 'model-bellows',
        name: 'Model Bellows',
        kind: 'model',
        asset: '/war-room/forge-hephaestus-caesar-source-v1/tools/model-bellows.png',
        position: { x: 85, y: 39 },
        size: { w: 12.8, h: 16.5 },
        hotspot: { x: 79.5, y: 30, w: 11, h: 15 },
        operatorSpot: { x: 69, y: 51 },
        labelSpot: { x: 83, y: 55 },
        dialogLayout: defaultDialogLayout,
        description: 'Routes work to the right model/profile while keeping business side effects sealed.',
        statusLines: ['Routing profile checked.', 'Fallbacks visible.', 'No provider changes here.'],
        allowedActions: ['Inspect routing', 'Preview model status'],
        forbiddenActions: ['Change billing', 'Change provider keys'],
      },
      {
        id: 'sorting-rack',
        name: 'Sorting Rack',
        kind: 'sorting',
        asset: '/war-room/forge-hephaestus-caesar-source-v1/tools/sorting-rack.png',
        position: { x: 15, y: 47 },
        size: { w: 12.8, h: 15.8 },
        hotspot: { x: 10, y: 38, w: 10, h: 14 },
        operatorSpot: { x: 30, y: 57 },
        labelSpot: { x: 17, y: 62 },
        dialogLayout: defaultDialogLayout,
        description: 'Visual outputs are compared and sorted here before any listing draft is prepared.',
        statusLines: ['Comparing variants.', 'Rejecting weak assets.', 'Winner stays draft-only.'],
        allowedActions: ['Rank images', 'Keep review notes'],
        forbiddenActions: ['Upload to Etsy', 'Message buyers'],
      },
      {
        id: 'listing-easel',
        name: 'Listing Easel',
        kind: 'listing',
        asset: '/war-room/forge-hephaestus-caesar-source-v1/tools/listing-easel.png',
        position: { x: 84, y: 75 },
        size: { w: 12.8, h: 15.8 },
        hotspot: { x: 79, y: 66.5, w: 10, h: 14 },
        operatorSpot: { x: 68, y: 75 },
        labelSpot: { x: 82, y: 88 },
        dialogLayout: defaultDialogLayout,
        description: 'Draft listing previews are staged here without publishing, renewing, messaging, or charging anything.',
        statusLines: ['Preview only.', 'Price/qty require DLV.', 'No Etsy push.'],
        allowedActions: ['Preview draft', 'Collect missing inputs'],
        forbiddenActions: ['Publish', 'Renew', 'Edit live listing'],
      },
      {
        id: 'skills-forge',
        name: 'Skills Forge',
        kind: 'skills',
        asset: '/war-room/forge-hephaestus-caesar-source-v1/tools/skills-forge.png',
        position: { x: 23, y: 27 },
        size: { w: 12.8, h: 15.8 },
        hotspot: { x: 18, y: 18.5, w: 10, h: 14 },
        operatorSpot: { x: 36, y: 43 },
        labelSpot: { x: 25, y: 42 },
        dialogLayout: defaultDialogLayout,
        description: 'Reusable Hermes procedures are forged into skills here after a workflow proves itself. Existing real skills can be opened, edited, backed up, or moved to trash.',
        statusLines: ['Real skills loaded.', 'Backups before save.', 'Delete moves to trash.'],
        allowedActions: ['List real skills', 'Edit SKILL.md', 'Save with backup', 'Move skill to trash'],
        forbiddenActions: ['Invent fake skills', 'Delete without typed confirmation', 'Overwrite without backup'],
      },
    ],
    agents: [{ id: 'hephaestus', name: 'Hephaestus', role: 'Forge master and creative-work operator', roomId: 'forge', spriteSheet: '/war-room/hephaestus-90frame-v2/processed/hephaestus-model.png', idleFrame: '/war-room/hephaestus-90frame-v2/processed/hephaestus-model.png', position: { x: 50, y: 68 }, patrolPoints: [], state: 'idle', speech: 'The forge floor is open. Pick a wall tool and I will walk to it.' }],
    navigation: {
      lanes: {
        'approval-shrine': [{ x: 50, y: 68 }, { x: 50, y: 54 }, { x: 50, y: 39 }],
        'prompt-anvil': [{ x: 50, y: 68 }, { x: 39, y: 73 }, { x: 31, y: 73 }],
        'model-bellows': [{ x: 50, y: 68 }, { x: 61, y: 60 }, { x: 69, y: 51 }],
        'sorting-rack': [{ x: 50, y: 68 }, { x: 39, y: 62 }, { x: 30, y: 57 }],
        'listing-easel': [{ x: 50, y: 68 }, { x: 61, y: 72 }, { x: 68, y: 75 }],
        'skills-forge': [{ x: 50, y: 68 }, { x: 43, y: 55 }, { x: 36, y: 43 }],
      },
    },
  },
  {
    id: 'merchant-harbor',
    name: 'Merchant Harbor',
    backgroundAsset: '/war-room/direct-overhead-v4-4k-empty/rooms/merchant-harbor/floor-base.png',
    bounds: roomBounds,
    tileGrid: { cols: 40, rows: 23 },
    entryPoints: { worldMap: { x: 50, y: 92 } },
    stations: [
      station('aliexpress-pier', 'AliExpress Pier', 'supplier', '/war-room/merchant-harbor-njord-v1/processed/aliexpress-pier.png', 16, 46, 'merchantHarborDialog'),
      station('alibaba-dock', 'Alibaba Dock', 'supplier', '/war-room/merchant-harbor-njord-v1/processed/alibaba-dock.png', 84, 42, 'merchantHarborDialog'),
      station('supplier-ledger', 'Supplier Ledger', 'supplier', '/war-room/merchant-harbor-njord-v1/processed/supplier-ledger.png', 50, 14, 'merchantHarborDialog'),
      station('customs-risk-gate', 'Customs Risk Gate', 'approval', '/war-room/merchant-harbor-njord-v1/processed/customs-risk-gate.png', 18, 82, 'merchantHarborDialog'),
      station('trade-winds-route-board', 'Trade Winds Route Board', 'supplier', '/war-room/merchant-harbor-njord-v1/processed/trade-winds-route-board.png', 82, 72, 'merchantHarborDialog'),
      station('quality-inspection-table', 'Quality Inspection Table', 'supplier', '/war-room/merchant-harbor-njord-v1/processed/quality-inspection-table.png', 50, 84, 'merchantHarborDialog'),
    ],
    agents: [{ id: 'njord', name: 'Njord', role: 'Master of Trade Winds and supplier routes', roomId: 'merchant-harbor', spriteSheet: '/war-room/merchant-harbor-njord-v1/processed/njord-model.png', idleFrame: '/war-room/merchant-harbor-njord-v1/processed/njord-model.png', position: { x: 50, y: 64 }, state: 'idle', speech: 'Trade winds are charted. Harbor sourcing remains read-only until DLV approves action.' }],
  },
  {
    id: 'atlantis-vault',
    name: 'Atlantis Vault',
    backgroundAsset: '/war-room/direct-overhead-v4-4k-empty/rooms/atlantis-vault/floor-base.png',
    bounds: roomBounds,
    tileGrid: { cols: 40, rows: 23 },
    entryPoints: { worldMap: { x: 50, y: 92 }, agentHome: { x: 42, y: 65 }, workAisle: { x: 50, y: 55 }, restThreshold: { x: 64, y: 78 } },
    stations: [
      { ...station('crystal-archive', 'Source Index Shelves', 'archive', '/war-room/atlantis-vault-archivist-v1/processed/crystal-archive.png', 16, 46, 'atlantisVaultDialog'), operatorSpot: { x: 32, y: 56 }, description: 'Archive shelves for source links, screenshots, run summaries, and rejection reasons. This is read-only evidence storage, not a live marketplace control.', statusLines: ['Source index visible.', 'Evidence packets only.', 'No account writes.'] },
      { ...station('screenshot-vault', 'Evidence Screenshot Vault', 'archive', '/war-room/atlantis-vault-archivist-v1/processed/screenshot-vault.png', 84, 40, 'atlantisVaultDialog'), operatorSpot: { x: 68, y: 54 }, description: 'Stores screenshots and visual QA proof so future agents can inspect what was actually seen.', statusLines: ['Screenshots preserved.', 'Visual QA labels required.', 'No overclaiming.'] },
      { ...station('dataset-pool', 'Packet Replay Pool', 'archive', '/war-room/atlantis-vault-archivist-v1/processed/dataset-pool.png', 82, 74, 'atlantisVaultDialog'), operatorSpot: { x: 66, y: 72 }, description: 'Shows room-to-room workflow packets flowing from Command, Forge, Treasury, and back into the archive.', statusLines: ['Packet lane active.', 'Replay is local-only.', 'No live dispatch.'] },
      { ...station('report-tablets', 'Manual Lock Ledger', 'approval', '/war-room/atlantis-vault-archivist-v1/processed/report-tablets.png', 50, 17, 'atlantisVaultDialog'), operatorSpot: { x: 50, y: 36 }, description: 'Manual-only safety ledger: live shop, supplier, customer, paid generation, and account changes remain sealed.', statusLines: ['Manual lock active.', 'External actions disabled.', 'DLV approval required.'], allowedActions: ['Inspect lock reason', 'Stage local archive packet'], forbiddenActions: ['Publish', 'Purchase', 'Message customers/suppliers', 'Trigger paid generation'] },
      station('skill-relic-shelves', 'Skill Relic Shelves', 'skills', '/war-room/atlantis-vault-archivist-v1/processed/skill-relic-shelves.png', 18, 82, 'atlantisVaultDialog'),
      station('memory-loom', 'Feedback Memory Loom', 'archive', '/war-room/atlantis-vault-archivist-v1/processed/memory-loom.png', 50, 84, 'atlantisVaultDialog'),
    ],
    agents: [{ id: 'poseidon', name: 'Poseidon', role: 'Atlantis Vault sea-king archive guardian', roomId: 'atlantis-vault', spriteSheet: '/war-room/atlantis-vault-poseidon-v4/processed/poseidon-model.png', idleFrame: '/war-room/atlantis-vault-poseidon-v4/processed/poseidon-model.png', position: { x: 42, y: 65 }, patrolPoints: [{ x: 42, y: 65 }, { x: 50, y: 55 }, { x: 66, y: 72 }, { x: 64, y: 78 }], state: 'idle', speech: 'The trident guards the Atlantis Vault. Select a real archive station and I will walk the evidence lane; live external actions stay locked.' }],
    navigation: {
      lanes: {
        'crystal-archive': [{ x: 42, y: 65 }, { x: 36, y: 60 }, { x: 32, y: 56 }],
        'screenshot-vault': [{ x: 42, y: 65 }, { x: 55, y: 60 }, { x: 68, y: 54 }],
        'dataset-pool': [{ x: 42, y: 65 }, { x: 56, y: 69 }, { x: 66, y: 72 }],
        'report-tablets': [{ x: 42, y: 65 }, { x: 48, y: 50 }, { x: 50, y: 36 }],
        'skill-relic-shelves': [{ x: 42, y: 65 }, { x: 34, y: 72 }, { x: 29, y: 82 }],
        'memory-loom': [{ x: 42, y: 65 }, { x: 50, y: 73 }, { x: 50, y: 86 }],
      },
    },
  },
  {
    id: 'treasury',
    name: 'Treasury of Commerce',
    backgroundAsset: '/war-room/direct-overhead-v4-4k-empty/rooms/treasury-commerce/floor-base.png',
    bounds: roomBounds,
    tileGrid: { cols: 40, rows: 23 },
    entryPoints: { worldMap: { x: 50, y: 92 } },
    stations: [
      station('margin-chest', 'Margin Chest', 'finance', '/war-room/treasury-dwarf-360-v1/processed/margin-chest.png', 12, 42, 'treasuryDialog'),
      station('cost-scales', 'Cost Scales', 'finance', '/war-room/treasury-dwarf-360-v1/processed/cost-scales.png', 50, 14, 'treasuryDialog'),
      station('ad-spend-gate', 'Ad-Spend Gate', 'approval', '/war-room/treasury-dwarf-360-v1/processed/ad-spend-gate.png', 88, 41, 'treasuryDialog'),
      station('api-usage-meter', 'API Usage Meter', 'finance', '/war-room/treasury-dwarf-360-v1/processed/api-usage-meter.png', 13, 82, 'treasuryDialog'),
      station('revenue-ledger', 'Revenue Ledger', 'finance', '/war-room/treasury-dwarf-360-v1/processed/revenue-ledger.png', 50, 84, 'treasuryDialog'),
      station('approval-vault', 'Approval Vault', 'approval', '/war-room/treasury-dwarf-360-v1/processed/approval-vault.png', 87, 82, 'treasuryDialog'),
    ],
    agents: [{ id: 'treasury-watcher', name: 'Treasury Watcher', role: 'Money/margin/cost guard', roomId: 'treasury', spriteSheet: '/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-model.png', idleFrame: '/war-room/treasury-dwarf-360-v2/processed/treasury-dwarf-model.png', position: { x: 50, y: 64 }, patrolPoints: [{ x: 50, y: 64 }, { x: 23, y: 53 }, { x: 39, y: 25 }, { x: 77, y: 52 }, { x: 76, y: 82 }, { x: 50, y: 84 }, { x: 24, y: 82 }], state: 'idle', speech: 'Treasury gates are locked unless DLV approves the spend.' }],
  },
]

export const olympusGameManifest: OlympusGameManifest = {
  version: 'direct-overhead-v4-4k-empty-rooms-atlantis-poseidon-v4',
  dialogLayouts: {
    olympusCommandDialog: {
      id: 'olympusCommandDialog',
      frameAsset: '/war-room/vNext/dialog-frames/olympus-command-station-window-frame-v1.png',
      closeSpot: { x: 86.2, y: 10.0, w: 7.2, h: 5.4, radius: 2.2 },
      titleBox: { x: 37.2, y: 15.0, w: 38.8, h: 8.6 },
      subtitleBox: { x: 37.2, y: 11.0, w: 34.8, h: 3.8 },
      propBox: { x: 10.0, y: 19.5, w: 24.0, h: 55.0 },
      bodyBox: { x: 35.5, y: 27.4, w: 46.8, h: 32.0 },
      rowsBox: { x: 35.5, y: 61.0, w: 46.8, h: 8.4 },
      safetyBox: { x: 35.5, y: 71.4, w: 46.8, h: 13.5 },
    },
    pantheonDialog: {
      id: 'pantheonDialog',
      frameAsset: '/war-room/vNext/dialog-frames/pantheon-quarters-station-window-frame-v1.png',
      closeSpot: { x: 86.2, y: 10.0, w: 7.2, h: 5.4, radius: 2.2 },
      titleBox: { x: 37.2, y: 15.0, w: 38.8, h: 8.6 },
      subtitleBox: { x: 37.2, y: 11.0, w: 34.8, h: 3.8 },
      propBox: { x: 10.0, y: 19.5, w: 24.0, h: 55.0 },
      bodyBox: { x: 35.5, y: 27.4, w: 46.8, h: 32.0 },
      rowsBox: { x: 35.5, y: 61.0, w: 46.8, h: 8.4 },
      safetyBox: { x: 35.5, y: 71.4, w: 46.8, h: 13.5 },
    },
    agoraDialog: {
      id: 'agoraDialog',
      frameAsset: '/war-room/vNext/dialog-frames/agora-station-window-frame-v1.png',
      closeSpot: { x: 86.2, y: 10.0, w: 7.2, h: 5.4, radius: 2.2 },
      titleBox: { x: 37.2, y: 15.0, w: 38.8, h: 8.6 },
      subtitleBox: { x: 37.2, y: 11.0, w: 34.8, h: 3.8 },
      propBox: { x: 10.0, y: 19.5, w: 24.0, h: 55.0 },
      bodyBox: { x: 35.5, y: 27.4, w: 46.8, h: 32.0 },
      rowsBox: { x: 35.5, y: 61.0, w: 46.8, h: 8.4 },
      safetyBox: { x: 35.5, y: 71.4, w: 46.8, h: 13.5 },
    },
    oracleDialog: {
      id: 'oracleDialog',
      frameAsset: '/war-room/vNext/dialog-frames/oracle-station-window-frame-v1.png',
      closeSpot: { x: 86.2, y: 10.0, w: 7.2, h: 5.4, radius: 2.2 },
      titleBox: { x: 37.2, y: 15.0, w: 38.8, h: 8.6 },
      subtitleBox: { x: 37.2, y: 11.0, w: 34.8, h: 3.8 },
      propBox: { x: 10.0, y: 19.5, w: 24.0, h: 55.0 },
      bodyBox: { x: 35.5, y: 27.4, w: 46.8, h: 32.0 },
      rowsBox: { x: 35.5, y: 61.0, w: 46.8, h: 8.4 },
      safetyBox: { x: 35.5, y: 71.4, w: 46.8, h: 13.5 },
    },
    forgeStationDialog: {
      id: 'forgeStationDialog',
      frameAsset: '/war-room/vNext/dialog-frames/forge-station-window-frame-v1.png',
      closeSpot: { x: 86.2, y: 10.0, w: 7.2, h: 5.4, radius: 2.2 },
      titleBox: { x: 37.2, y: 15.0, w: 38.8, h: 8.6 },
      subtitleBox: { x: 37.2, y: 11.0, w: 34.8, h: 3.8 },
      propBox: { x: 10.0, y: 19.5, w: 24.0, h: 55.0 },
      bodyBox: { x: 35.5, y: 27.4, w: 46.8, h: 32.0 },
      rowsBox: { x: 35.5, y: 61.0, w: 46.8, h: 8.4 },
      safetyBox: { x: 35.5, y: 71.4, w: 46.8, h: 13.5 },
    },
    merchantHarborDialog: {
      id: 'merchantHarborDialog',
      frameAsset: '/war-room/vNext/dialog-frames/merchant-harbor-station-window-frame-v1.png',
      closeSpot: { x: 86.2, y: 10.0, w: 7.2, h: 5.4, radius: 2.2 },
      titleBox: { x: 37.2, y: 15.0, w: 38.8, h: 8.6 },
      subtitleBox: { x: 37.2, y: 11.0, w: 34.8, h: 3.8 },
      propBox: { x: 10.0, y: 19.5, w: 24.0, h: 55.0 },
      bodyBox: { x: 35.5, y: 27.4, w: 46.8, h: 32.0 },
      rowsBox: { x: 35.5, y: 61.0, w: 46.8, h: 8.4 },
      safetyBox: { x: 35.5, y: 71.4, w: 46.8, h: 13.5 },
    },
    atlantisVaultDialog: {
      id: 'atlantisVaultDialog',
      frameAsset: '/war-room/vNext/dialog-frames/atlantis-vault-station-window-frame-v1.png',
      closeSpot: { x: 86.2, y: 10.0, w: 7.2, h: 5.4, radius: 2.2 },
      titleBox: { x: 37.2, y: 15.0, w: 38.8, h: 8.6 },
      subtitleBox: { x: 37.2, y: 11.0, w: 34.8, h: 3.8 },
      propBox: { x: 10.0, y: 19.5, w: 24.0, h: 55.0 },
      bodyBox: { x: 35.5, y: 27.4, w: 46.8, h: 32.0 },
      rowsBox: { x: 35.5, y: 61.0, w: 46.8, h: 8.4 },
      safetyBox: { x: 35.5, y: 71.4, w: 46.8, h: 13.5 },
    },
    treasuryDialog: {
      id: 'treasuryDialog',
      frameAsset: '/war-room/vNext/dialog-frames/treasury-station-window-frame-v1.png',
      closeSpot: { x: 86.2, y: 10.0, w: 7.2, h: 5.4, radius: 2.2 },
      titleBox: { x: 37.2, y: 15.0, w: 38.8, h: 8.6 },
      subtitleBox: { x: 37.2, y: 11.0, w: 34.8, h: 3.8 },
      propBox: { x: 10.0, y: 19.5, w: 24.0, h: 55.0 },
      bodyBox: { x: 35.5, y: 27.4, w: 46.8, h: 32.0 },
      rowsBox: { x: 35.5, y: 61.0, w: 46.8, h: 8.4 },
      safetyBox: { x: 35.5, y: 71.4, w: 46.8, h: 13.5 },
    },
  },
  rooms,
}

export const forgeVerticalSliceRoom = rooms.find((room) => room.id === 'forge') ?? rooms[0]
