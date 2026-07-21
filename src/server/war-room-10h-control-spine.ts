// War Room 10h Event-Driven Run — backend/control-spine implementation.
// Source of truth: docs/status/architecture/war-room-10h-connected-rooms-control-spine-contract-20260616.md
// This module is local/read-only/dry-run scaffolding only. All external action remains locked.

import type {
  WarRoomActionBlueprint,
  WarRoomActionDraftQueue,
  WarRoomAgentMovement,
  WarRoomAgentMovementState,
  WarRoomApprovalQueue,
  WarRoomApprovalQueueEntry,
  WarRoomArtifactFinalQualityClaim,
  WarRoomConnectorActionDraft,
  WarRoomConnectorCapability,
  WarRoomConnectorCategory,
  WarRoomConnectorLockState,
  WarRoomConnectorMode,
  WarRoomConnectorRegistryEntry,
  WarRoomConnectorStatusEvidence,
  WarRoomControlSpineState,
  WarRoomCorridor,
  WarRoomId,
  WarRoomLockContract,
  WarRoomOpenRoomState,
  WarRoomReviewLock,
  WarRoomRoomGraph,
  WarRoomSafetyEvidence,
  WarRoomSafetySpine,
  WarRoomStateContracts,
  WarRoomStation,
  WarRoomStationActivity,
  WarRoomWorker,
  WarRoomWorkflowPacket,
  WarRoomWorkflowPacketKind,
} from './war-room-10h-types'

export const WAR_ROOM_10H_ROOM_IDS: Array<WarRoomId> = [
  'olympus-command',
  'agora-opportunity',
  'oracle-signals',
  'forge-hephaestus',
  'merchant-harbor',
  'atlantis-vault',
  'treasury-commerce',
  'roman-dev-studio',
  'gateway-discord-cockpit',
  'rest-agent-lounge',
]

const ROOM_LABELS: Record<WarRoomId, string> = {
  'olympus-command': 'Olympus Command / Hermes Conductor',
  'agora-opportunity': 'Agora Opportunity',
  'oracle-signals': 'Oracle Signals',
  'forge-hephaestus': 'Forge of Hephaestus',
  'merchant-harbor': 'Merchant Harbor',
  'atlantis-vault': 'Atlantis Vault / Archive',
  'treasury-commerce': 'Treasury / Approval',
  'roman-dev-studio': 'Roman Dev Studio',
  'gateway-discord-cockpit': 'Gateway / Discord Cockpit',
  'rest-agent-lounge': 'Rest Room / Agent Lounge',
}

const ROOM_ROLES: Record<WarRoomId, string> = {
  'olympus-command': 'Hermes conductor, routing, approval locks, review decisions',
  'agora-opportunity': 'product/opportunity intake and prioritization',
  'oracle-signals': 'research, trend, metrics, evidence gathering',
  'forge-hephaestus': 'implementation, local code/assets, integration',
  'merchant-harbor': 'supplier/store connector readiness, read-only/dry-run drafts',
  'atlantis-vault': 'artifacts, knowledge records, screenshots, manifests',
  'treasury-commerce': 'manual approval shrine, audit ledger, read-only business status',
  'roman-dev-studio': 'code/build/QA engineering camp and local workspace verification',
  'gateway-discord-cockpit': 'remote command previews and Discord draft scrolls, no live sends',
  'rest-agent-lounge': 'agent rest/recharge/talk states with no fake work',
}

const ROOM_DOOR_SIDES: Record<WarRoomId, Array<'N' | 'S' | 'E' | 'W'>> = {
  'olympus-command': ['N', 'S', 'E', 'W'],
  'agora-opportunity': ['E', 'W'],
  'oracle-signals': ['S', 'W'],
  'forge-hephaestus': ['N', 'E', 'W'],
  'merchant-harbor': ['N', 'W'],
  'atlantis-vault': ['N', 'E'],
  'treasury-commerce': ['S', 'W'],
  'roman-dev-studio': ['E', 'W'],
  'gateway-discord-cockpit': ['S', 'W'],
  'rest-agent-lounge': ['N', 'E'],
}

function station(
  id: string,
  roomId: WarRoomId,
  label: string,
  kind: WarRoomStation['kind'],
  accepts: Array<WarRoomWorkflowPacketKind>,
): WarRoomStation {
  return {
    id,
    roomId,
    label,
    kind,
    acceptsPacketKinds: accepts,
    externalActionCapable: false,
    defaultLocked: true,
    stateContract: {
      visualStates: [
        'idle',
        'active-work',
        'output-ready',
        'blocked',
        'manual-approval-needed',
      ],
      allowedActivities: [
        'queued',
        'in-progress',
        'waiting-review',
        'blocked',
        'complete',
        'archived',
      ],
      externalActionCapable: false,
      manualApprovalRequiredForLiveAction: true,
    },
  }
}

function buildStationsForRoom(roomId: WarRoomId): Array<WarRoomStation> {
  switch (roomId) {
    case 'olympus-command':
      return [
        station('olympus-intake', roomId, 'Intake Shrine', 'intake', [
          'task',
          'research-request',
          'connector-readiness',
        ]),
        station('olympus-planning', roomId, 'Strategy Table', 'planning', [
          'task',
          'implementation',
          'asset-request',
        ]),
        station('olympus-approval', roomId, 'DLV Approval Seal', 'approval', [
          'approval-lock',
          'action-draft',
        ]),
        station('olympus-command-table', roomId, 'Command Table', 'review', [
          'qa-review',
          'safety-review',
          'artifact-handoff',
        ]),
      ]
    case 'roman-dev-studio':
      return [
        station('roman-build-bench', roomId, 'Roman Build Bench', 'implementation', [
          'implementation',
          'qa-review',
        ]),
        station('roman-qa-shield-rack', roomId, 'QA Shield Rack', 'qa', [
          'qa-review',
          'safety-review',
        ]),
      ]
    case 'gateway-discord-cockpit':
      return [
        station('gateway-command-preview', roomId, 'Command Preview Console', 'connector', [
          'task',
          'action-draft',
        ]),
        station('gateway-discord-draft-scroll', roomId, 'Discord Draft Scroll', 'archive', [
          'action-draft',
          'approval-lock',
        ]),
      ]
    case 'rest-agent-lounge':
      return [
        station('rest-recharge-couch', roomId, 'Recharge Couch', 'rest', ['task']),
        station('rest-talk-table', roomId, 'Talk / Handoff Table', 'review', [
          'artifact-handoff',
          'qa-review',
        ]),
      ]
    case 'agora-opportunity':
      return [
        station('agora-intake', roomId, 'Opportunity Intake', 'intake', [
          'task',
          'research-request',
        ]),
        station('agora-planning', roomId, 'Market Sorting Table', 'planning', [
          'task',
          'asset-request',
        ]),
      ]
    case 'oracle-signals':
      return [
        station('oracle-research', roomId, 'Signal Telescope', 'connector', [
          'research-request',
          'artifact-handoff',
        ]),
        station('oracle-metrics', roomId, 'Metrics Atelier', 'archive', [
          'artifact-handoff',
        ]),
      ]
    case 'forge-hephaestus':
      return [
        station('forge-workbench', roomId, 'Code Workbench', 'implementation', [
          'implementation',
          'asset-request',
        ]),
        station(
          'forge-asset-bench',
          roomId,
          'Asset Workbench',
          'asset-workbench',
          ['asset-request', 'artifact-handoff'],
        ),
        station('forge-qa', roomId, 'Forge QA Lens', 'qa', ['qa-review']),
      ]
    case 'merchant-harbor':
      return [
        station(
          'merchant-connector-dock',
          roomId,
          'Connector Dock',
          'connector',
          ['connector-readiness', 'action-draft'],
        ),
        station('merchant-draft-hold', roomId, 'Draft Hold', 'archive', [
          'action-draft',
        ]),
      ]
    case 'atlantis-vault':
      return [
        station('atlantis-archive', roomId, 'Evidence Archive', 'archive', [
          'artifact-handoff',
        ]),
        station('atlantis-manifest', roomId, 'Manifest Ledger', 'archive', [
          'artifact-handoff',
        ]),
      ]
    case 'treasury-commerce':
      return [
        station('treasury-metrics', roomId, 'Business Metrics', 'connector', [
          'connector-readiness',
        ]),
        station(
          'treasury-approval',
          roomId,
          'Commerce Approval Lock',
          'approval',
          ['approval-lock'],
        ),
      ]
    default:
      return []
  }
}

function roomGraph(): WarRoomRoomGraph {
  const rooms = WAR_ROOM_10H_ROOM_IDS.map(
    (id): WarRoomRoomGraph['rooms'][number] => {
      const stations = buildStationsForRoom(id)
      return {
        id,
        label: ROOM_LABELS[id],
        role: ROOM_ROLES[id],
        moduleContract: {
          moduleShape: 'horizontal-rectangle',
          allRoomsViewScale: 'miniature-self-contained-room',
          corridorConnection: 'physical-paved-corridor-or-bridge',
          theme: 'Hermes/Olympus modular pixel room',
          doorSides: ROOM_DOOR_SIDES[id],
          visualStates: [
            'idle',
            'active',
            'selected',
            'blocked',
            'manual-approval-needed',
          ],
        },
        stations,
        popupDefaultStationId: stations[0]?.id ?? `${id}-default`,
      }
    },
  )

  const corridors: Array<WarRoomCorridor> = [
    corridor(
      'command-to-agora',
      'olympus-command',
      'agora-opportunity',
      'new opportunity packet routing',
      ['task', 'research-request', 'asset-request'],
      'local-only',
    ),
    corridor(
      'agora-to-oracle',
      'agora-opportunity',
      'oracle-signals',
      'research/evidence request',
      ['research-request'],
      'local-only',
    ),
    corridor(
      'oracle-to-command',
      'oracle-signals',
      'olympus-command',
      'evidence return and prioritization',
      ['artifact-handoff', 'research-request'],
      'local-only',
    ),
    corridor(
      'command-to-forge',
      'olympus-command',
      'forge-hephaestus',
      'implementation assignment',
      ['implementation', 'asset-request'],
      'local-only',
    ),
    corridor(
      'forge-to-atlantis',
      'forge-hephaestus',
      'atlantis-vault',
      'artifact/handoff storage',
      ['artifact-handoff', 'qa-review'],
      'local-only',
    ),
    corridor(
      'forge-to-command',
      'forge-hephaestus',
      'olympus-command',
      'implementation complete / review-required',
      ['implementation', 'qa-review', 'safety-review'],
      'local-only',
    ),
    corridor(
      'command-to-merchant',
      'olympus-command',
      'merchant-harbor',
      'connector readiness/draft-only work',
      ['connector-readiness', 'action-draft'],
      'approval-gated-external-boundary',
    ),
    corridor(
      'merchant-to-command',
      'merchant-harbor',
      'olympus-command',
      'connector lock/draft evidence return',
      ['connector-readiness', 'action-draft'],
      'approval-gated-external-boundary',
    ),
    corridor(
      'command-to-treasury',
      'olympus-command',
      'treasury-commerce',
      'read-only business/status summary',
      ['connector-readiness', 'approval-lock'],
      'local-only',
    ),
    corridor(
      'command-to-roman',
      'olympus-command',
      'roman-dev-studio',
      'local implementation/build assignment',
      ['implementation', 'qa-review', 'safety-review'],
      'local-only',
    ),
    corridor(
      'roman-to-command',
      'roman-dev-studio',
      'olympus-command',
      'verified code/QA return',
      ['implementation', 'qa-review', 'artifact-handoff'],
      'local-only',
    ),
    corridor(
      'command-to-gateway',
      'olympus-command',
      'gateway-discord-cockpit',
      'manual-only command preview routing',
      ['task', 'action-draft', 'approval-lock'],
      'approval-gated-external-boundary',
    ),
    corridor(
      'gateway-to-command',
      'gateway-discord-cockpit',
      'olympus-command',
      'draft scroll return with no side effects',
      ['action-draft', 'approval-lock'],
      'approval-gated-external-boundary',
    ),
    corridor(
      'command-to-rest',
      'olympus-command',
      'rest-agent-lounge',
      'agent rest/recharge route',
      ['task'],
      'local-only',
    ),
    corridor(
      'rest-to-command',
      'rest-agent-lounge',
      'olympus-command',
      'rested agent availability return',
      ['task', 'artifact-handoff'],
      'local-only',
    ),
    corridor(
      'agora-to-forge',
      'agora-opportunity',
      'forge-hephaestus',
      'approved candidate handoff',
      ['implementation', 'asset-request'],
      'local-only',
    ),
    corridor(
      'forge-to-merchant',
      'forge-hephaestus',
      'merchant-harbor',
      'listing/supplier draft handoff',
      ['action-draft'],
      'approval-gated-external-boundary',
    ),
    corridor(
      'oracle-to-atlantis',
      'oracle-signals',
      'atlantis-vault',
      'signal archive snapshot',
      ['artifact-handoff'],
      'local-only',
    ),
  ]

  return { rooms, corridors }
}

function corridor(
  id: string,
  sourceRoomId: WarRoomId,
  targetRoomId: WarRoomId,
  label: string,
  allowedPacketKinds: Array<WarRoomWorkflowPacketKind>,
  safetyBoundary: WarRoomCorridor['safetyBoundary'],
): WarRoomCorridor {
  return {
    id,
    sourceRoomId,
    targetRoomId,
    label,
    allowedPacketKinds,
    safetyBoundary,
    direction: 'one-way',
    visualPriority: 'primary',
  }
}

export function createWarRoom10hSafetySpine(): WarRoomSafetySpine {
  return {
    externalActionsEnabled: false,
    liveEtsyEnabled: false,
    liveSupplierEnabled: false,
    paidGenerationEnabled: false,
    discordSideEffectsEnabled: false,
    credentialsLoadedByDefault: false,
    connectorLiveModeEnabled: false,
    workspaceWritesAllowed: true,
    kanbanUiMutationsAllowed: false,
    approvalRequiredForExternalActions: true,
    noAutoApproval: true,
    noOverclaimFinalQuality: true,
  }
}

export function createWarRoom10hSafetyEvidence(): WarRoomSafetyEvidence {
  return {
    externalActionsEnabled: false,
    liveEtsyEnabled: false,
    liveSupplierEnabled: false,
    paidGenerationEnabled: false,
    connectorLiveModeEnabled: false,
    credentialsLoadedByDefault: false,
    kanbanUiMutationsAllowed: false,
    noEnabledLiveActionControls: true,
    defaultConnectorLockState: 'NOT_CONNECTED',
    allowedConnectorModes: ['disabled', 'read-only', 'dry-run', 'draft-only'],
    forbiddenWithoutDlvApproval: [
      'publish',
      'purchase',
      'buy',
      'refund',
      'renew',
      'message customer/supplier',
      'edit listing',
      'order',
      'upload to store',
      'paid generation',
      'live connector enable',
      'account setting change',
      'ad spend',
      'Discord side-effect',
      'git push/merge/reset/clean/stash/checkout',
    ],
  }
}

const AGENT_ROLE_STATES: WarRoomStateContracts['agents'][number]['roleStates'] = [
  'idle',
  'walk',
  'work-use-station',
  'talk',
  'carry-packet',
  'rest-recharge',
  'blocked-thinking',
]

const PACKET_STATES: WarRoomStateContracts['packets'][number]['allowedStates'] = [
  'moving-along-road',
  'waiting-at-entrance',
  'carried-by-agent',
  'opened-at-station',
  'approved-sealed',
  'blocked',
]

const LOCK_CONTRACT: WarRoomLockContract = {
  readOnlyAllowed: true,
  dryRunAllowed: true,
  localDraftAllowed: true,
  autonomousLiveActionAllowed: false,
  externalNetworkWritesAllowed: false,
  credentialLoadingAllowedByDefault: false,
  manualLiveActionSkeletonStates: [
    'draft-preview',
    'risk-evidence-summary',
    'queued-for-dlv-manual-review',
    'approved-by-human-only',
    'blocked-by-safety-spine',
    'audit-log-local-only',
  ],
}

const PACKET_KINDS: Array<WarRoomWorkflowPacketKind> = [
  'task',
  'research-request',
  'implementation',
  'qa-review',
  'safety-review',
  'asset-request',
  'connector-readiness',
  'action-draft',
  'artifact-handoff',
  'approval-lock',
]

function createWarRoom10hStateContracts(
  graph: WarRoomRoomGraph,
): WarRoomStateContracts {
  return {
    rooms: graph.rooms.map((room) => ({
      roomId: room.id,
      ...room.moduleContract,
    })),
    agents: graph.rooms.map((room) => ({
      id: `agent-contract-${room.id}`,
      roomId: room.id,
      label: `${room.label} agent`,
      minimumFrameCount: 50,
      targetFrameCount: 96,
      movementTempo: 'slow-real-directional',
      directions: ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'],
      roleStates: AGENT_ROLE_STATES,
      reducedMotionFallback: 'station-marker-only',
    })),
    packets: PACKET_KINDS.map((kind) => ({
      kind,
      allowedStates: PACKET_STATES,
      externalMutation: false,
      routeConstraint: 'physical-corridor-only',
    })),
    stations: graph.rooms.flatMap((room) =>
      room.stations.map((stationState) => ({
        stationId: stationState.id,
        roomId: room.id,
        ...stationState.stateContract,
      })),
    ),
    locks: LOCK_CONTRACT,
  }
}

function actionBlueprint(
  input: Omit<
    WarRoomActionBlueprint,
    | 'payloadPreviewRequired'
    | 'riskEvidenceSummaryRequired'
    | 'localAuditLogRequired'
    | 'liveExecutionEnabled'
    | 'externalMutation'
  >,
): WarRoomActionBlueprint {
  return {
    ...input,
    payloadPreviewRequired: true,
    riskEvidenceSummaryRequired: true,
    localAuditLogRequired: true,
    liveExecutionEnabled: false,
    externalMutation: false,
  }
}

export function createWarRoom10hActionBlueprintRegistry(): Array<WarRoomActionBlueprint> {
  return [
    actionBlueprint({
      id: 'etsy-listing-draft-prep',
      label: 'Etsy listing draft preparation',
      actionClass: 'allowedLocalDraft',
      trigger: 'opportunity-approved',
      router: 'olympus-command',
      packetKind: 'action-draft',
      roomId: 'merchant-harbor',
      stationId: 'merchant-draft-hold',
      connectorId: 'etsy-shop-connector',
      outputArtifactKind: 'draft',
      approvalGate: 'DLV-manual-confirm-required',
      archiveRoomId: 'atlantis-vault',
      feedbackLoop: 'oracle-signals',
      notes: [
        'Creates local title/tags/description/photos checklist only.',
        'No Etsy listing create/edit/publish/renew call is available to automation.',
      ],
    }),
    actionBlueprint({
      id: 'product-research-readonly',
      label: 'Product research evidence packet',
      actionClass: 'allowedReadOnly',
      trigger: 'research-needed',
      router: 'olympus-command',
      packetKind: 'research-request',
      roomId: 'oracle-signals',
      stationId: 'oracle-research',
      connectorId: 'product-intelligence-connector',
      outputArtifactKind: 'api-evidence',
      approvalGate: 'DLV-review-before-business-decision',
      archiveRoomId: 'atlantis-vault',
      feedbackLoop: 'agora-opportunity',
      notes: [
        'Reads local/read-only evidence and produces a source-linked packet.',
      ],
    }),
    actionBlueprint({
      id: 'supplier-proof-readonly',
      label: 'Supplier proof/evidence review',
      actionClass: 'allowedReadOnly',
      trigger: 'supplier-validation-needed',
      router: 'olympus-command',
      packetKind: 'connector-readiness',
      roomId: 'merchant-harbor',
      stationId: 'merchant-connector-dock',
      connectorId: 'supplier-marketplace-connector',
      outputArtifactKind: 'doc',
      approvalGate: 'DLV-manual-supplier-decision-required',
      archiveRoomId: 'atlantis-vault',
      feedbackLoop: 'agora-opportunity',
      notes: [
        'May summarize read-only/local evidence.',
        'Supplier messages, orders, account changes, and purchases remain locked live actions.',
      ],
    }),
    actionBlueprint({
      id: 'shotlab-forge-local-draft',
      label: 'ShotLab/Forge creative production draft',
      actionClass: 'allowedLocalDraft',
      trigger: 'asset-production-needed',
      router: 'olympus-command',
      packetKind: 'asset-request',
      roomId: 'forge-hephaestus',
      stationId: 'forge-asset-bench',
      connectorId: 'shotlab-asset-tool-connector',
      outputArtifactKind: 'manifest',
      approvalGate: 'DLV-manual-confirm-required',
      archiveRoomId: 'atlantis-vault',
      feedbackLoop: 'oracle-signals',
      notes: [
        'Prepares local creative brief/manifests only; paid generation is disabled.',
      ],
    }),
    actionBlueprint({
      id: 'seo-local-draft',
      label: 'SEO title/tags draft',
      actionClass: 'allowedLocalDraft',
      trigger: 'seo-optimization-needed',
      router: 'olympus-command',
      packetKind: 'action-draft',
      roomId: 'oracle-signals',
      stationId: 'oracle-metrics',
      connectorId: 'product-intelligence-connector',
      outputArtifactKind: 'draft',
      approvalGate: 'DLV-review-before-shop-use',
      archiveRoomId: 'atlantis-vault',
      feedbackLoop: 'agora-opportunity',
      notes: ['Generates local SEO suggestions; never edits store listings.'],
    }),
    actionBlueprint({
      id: 'discord-cockpit-dry-run',
      label: 'Discord cockpit command preview',
      actionClass: 'allowedLocalDraft',
      trigger: 'remote-command-preview-requested',
      router: 'olympus-command',
      packetKind: 'task',
      roomId: 'gateway-discord-cockpit',
      stationId: 'gateway-command-preview',
      outputArtifactKind: 'draft',
      approvalGate: 'DLV-manual-confirm-required',
      archiveRoomId: 'atlantis-vault',
      feedbackLoop: 'olympus-command',
      notes: [
        'Builds dry-run command previews only; no Discord message side effects.',
      ],
    }),
    actionBlueprint({
      id: 'discord-cockpit-live-send',
      label: 'Discord cockpit live send (locked)',
      actionClass: 'lockedLive',
      trigger: 'manual-live-send-requested',
      router: 'olympus-command',
      packetKind: 'approval-lock',
      roomId: 'olympus-command',
      stationId: 'olympus-approval',
      outputArtifactKind: 'draft',
      approvalGate: 'blocked-until-future-DLV-live-enable-phase',
      archiveRoomId: 'atlantis-vault',
      feedbackLoop: 'olympus-command',
      notes: [
        'Live Discord sends are modeled for future manual confirmation but disabled now.',
      ],
    }),
    actionBlueprint({
      id: 'approval-gate-audit-log',
      label: 'Approval gate audit record',
      actionClass: 'allowedLocalDraft',
      trigger: 'approval-decision-needed',
      router: 'olympus-command',
      packetKind: 'approval-lock',
      roomId: 'olympus-command',
      stationId: 'olympus-approval',
      outputArtifactKind: 'doc',
      approvalGate: 'DLV-manual-confirm-required',
      archiveRoomId: 'atlantis-vault',
      feedbackLoop: 'treasury-commerce',
      notes: [
        'Captures payload preview, risk/evidence summary, and local audit record.',
      ],
    }),
  ]
}

function capability(
  id: string,
  label: string,
  actionKind: WarRoomConnectorCapability['actionKind'],
  allowedModes: Array<WarRoomConnectorMode>,
): WarRoomConnectorCapability {
  return {
    id,
    label,
    actionKind,
    externalMutation: false,
    requiresDlvApproval: true,
    allowedModes,
  }
}

function evidence(
  label: string,
  value: string,
  provenance: WarRoomConnectorStatusEvidence['provenance'] = 'local-fixture',
): WarRoomConnectorStatusEvidence {
  return { label, value, provenance }
}

export function createWarRoom10hConnectorRegistry(): Array<WarRoomConnectorRegistryEntry> {
  return [
    {
      id: 'etsy-shop-connector',
      label: 'Etsy shop connector',
      roomId: 'merchant-harbor',
      category: 'store',
      lockState: 'NOT_CONNECTED',
      mode: 'draft-only',
      credentialsRequired: true,
      credentialsLoaded: false,
      liveApiCallsEnabled: false,
      networkWritesEnabled: false,
      capabilities: [
        capability(
          'etsy-read-status',
          'Read shop status (read-only local cache)',
          'read-status',
          ['read-only', 'dry-run'],
        ),
        capability(
          'etsy-prepare-listing-draft',
          'Prepare local listing draft',
          'prepare-draft',
          ['draft-only', 'dry-run'],
        ),
      ],
      statusEvidence: [
        evidence(
          'live status',
          'NOT_CONNECTED: no credentials loaded; no live API calls.',
          'local-fixture',
        ),
      ],
    },
    {
      id: 'supplier-marketplace-connector',
      label: 'Supplier marketplace connector',
      roomId: 'merchant-harbor',
      category: 'supplier',
      lockState: 'NOT_CONNECTED',
      mode: 'draft-only',
      credentialsRequired: false,
      credentialsLoaded: false,
      liveApiCallsEnabled: false,
      networkWritesEnabled: false,
      capabilities: [
        capability(
          'supplier-read-metrics',
          'Read supplier metrics (read-only local cache)',
          'read-metrics',
          ['read-only', 'dry-run'],
        ),
        capability(
          'supplier-validate-local-draft',
          'Validate local supplier evidence draft',
          'validate-local-draft',
          ['draft-only', 'dry-run'],
        ),
      ],
      statusEvidence: [
        evidence(
          'live status',
          'NOT_CONNECTED: supplier messages/purchases/account actions are disabled.',
          'local-fixture',
        ),
      ],
    },
    {
      id: 'shotlab-asset-tool-connector',
      label: 'ShotLab asset tool connector',
      roomId: 'forge-hephaestus',
      category: 'asset-tool',
      lockState: 'NOT_CONNECTED',
      mode: 'draft-only',
      credentialsRequired: true,
      credentialsLoaded: false,
      liveApiCallsEnabled: false,
      networkWritesEnabled: false,
      capabilities: [
        capability(
          'shotlab-prepare-creative-draft',
          'Prepare local creative draft',
          'prepare-draft',
          ['draft-only', 'dry-run'],
        ),
      ],
      statusEvidence: [
        evidence(
          'live status',
          'NOT_CONNECTED: paid generation and publish actions are disabled.',
          'local-fixture',
        ),
      ],
    },
    {
      id: 'product-intelligence-connector',
      label: 'Product Intelligence read-only connector',
      roomId: 'oracle-signals',
      category: 'analytics',
      lockState: 'READ_ONLY_READY',
      mode: 'read-only',
      credentialsRequired: false,
      credentialsLoaded: false,
      liveApiCallsEnabled: false,
      networkWritesEnabled: false,
      capabilities: [
        capability(
          'pi-read-metrics',
          'Read local Product Intelligence metrics',
          'read-metrics',
          ['read-only'],
        ),
      ],
      statusEvidence: [
        evidence(
          'live status',
          'READ_ONLY_READY: local DB copy only; no external writes.',
          'read-only-local-cache',
        ),
      ],
    },
    {
      id: 'workspace-local-connector',
      label: 'Workspace local dry-run connector',
      roomId: 'forge-hephaestus',
      category: 'workspace-tool',
      lockState: 'DRY_RUN_ONLY',
      mode: 'dry-run',
      credentialsRequired: false,
      credentialsLoaded: false,
      liveApiCallsEnabled: false,
      networkWritesEnabled: false,
      capabilities: [
        capability(
          'workspace-validate-local-draft',
          'Validate local code draft',
          'validate-local-draft',
          ['dry-run', 'draft-only'],
        ),
        capability(
          'workspace-prepare-draft',
          'Prepare local workspace draft',
          'prepare-draft',
          ['dry-run', 'draft-only'],
        ),
      ],
      statusEvidence: [
        evidence(
          'live status',
          'DRY_RUN_ONLY: local workspace code/assets only; no external mutations.',
          'local-dry-run',
        ),
      ],
    },
    {
      id: 'archive-local-connector',
      label: 'Atlantis archive local connector',
      roomId: 'atlantis-vault',
      category: 'workspace-tool',
      lockState: 'DRY_RUN_ONLY',
      mode: 'dry-run',
      credentialsRequired: false,
      credentialsLoaded: false,
      liveApiCallsEnabled: false,
      networkWritesEnabled: false,
      capabilities: [
        capability(
          'archive-read-local',
          'Read local archive evidence',
          'read-status',
          ['dry-run', 'read-only'],
        ),
      ],
      statusEvidence: [
        evidence(
          'live status',
          'DRY_RUN_ONLY: local evidence manifests only.',
          'local-dry-run',
        ),
      ],
    },
    {
      id: 'commerce-metrics-connector',
      label: 'Commerce metrics read-only connector',
      roomId: 'treasury-commerce',
      category: 'analytics',
      lockState: 'READ_ONLY_READY',
      mode: 'read-only',
      credentialsRequired: false,
      credentialsLoaded: false,
      liveApiCallsEnabled: false,
      networkWritesEnabled: false,
      capabilities: [
        capability(
          'commerce-read-status',
          'Read local business/status summary',
          'read-status',
          ['read-only'],
        ),
      ],
      statusEvidence: [
        evidence(
          'live status',
          'READ_ONLY_READY: business metrics are read-only summaries only.',
          'read-only-local-cache',
        ),
      ],
    },
  ]
}

function buildReviewLock(
  required: boolean,
  reason: string,
  lockedActionIds: Array<string>,
): WarRoomReviewLock {
  return {
    required,
    reason,
    lockedActionIds,
    requiredReviewerLane: required ? 'DLV' : 'none',
    approvalState: required ? 'required' : 'not-required',
    externalMutationAllowed: false,
  }
}

function defaultWorker(
  profile: string,
  role: WarRoomWorker['role'],
  displayName: string,
): WarRoomWorker {
  return {
    id: `worker-${profile}`,
    profile,
    role,
    displayName,
  }
}

function nowIso() {
  return new Date().toISOString()
}

export function createWarRoom10hWorkflowPacket(input: {
  id: string
  kind: WarRoomWorkflowPacketKind
  sourceRoomId: WarRoomId
  targetRoomId: WarRoomId
  sourceStationId: string
  targetStationId: string
  corridorId: string
  worker: WarRoomWorker
  activity: WarRoomStationActivity
  sourceTaskId?: string
  childTaskIds?: Array<string>
  connectorId?: string
  artifactLabel?: string
  artifactKind?: WarRoomWorkflowPacket['artifact'] extends infer A | null
    ? A extends { kind: infer K }
      ? K
      : never
    : never
  artifactPath?: string
}): WarRoomWorkflowPacket {
  const createdAt = nowIso()
  const artifact = input.artifactLabel
    ? {
        id: `artifact-${input.id}`,
        kind: input.artifactKind ?? ('draft' as const),
        label: input.artifactLabel,
        pathOrUrl: input.artifactPath ?? '#',
        provenance: 'local-workspace' as const,
        finalQualityClaim: 'prototype' as WarRoomArtifactFinalQualityClaim,
      }
    : null
  const safety = createWarRoom10hSafetySpine()

  return {
    id: input.id,
    kind: input.kind,
    sourceRoomId: input.sourceRoomId,
    targetRoomId: input.targetRoomId,
    sourceStationId: input.sourceStationId,
    targetStationId: input.targetStationId,
    corridorId: input.corridorId,
    worker: input.worker,
    station: {
      currentStationId: input.sourceStationId,
      targetStationId: input.targetStationId,
      activity: input.activity,
    },
    artifact,
    reviewLock: buildReviewLock(
      input.kind === 'action-draft' || input.kind === 'approval-lock',
      input.kind === 'action-draft'
        ? 'Action drafts remain local/dry-run and require explicit DLV approval before any external execution.'
        : input.kind === 'approval-lock'
          ? 'Approval lock prevents external mutation until DLV explicitly approves.'
          : 'No external mutation is enabled.',
      input.kind === 'action-draft' || input.kind === 'approval-lock'
        ? [`locked-${input.id}`]
        : [],
    ),
    sourceTaskId: input.sourceTaskId,
    childTaskIds: input.childTaskIds ?? [],
    connectorId: input.connectorId,
    createdAt,
    updatedAt: createdAt,
    safety,
  }
}

export function deriveWarRoom10hAgentMovement(
  packet: WarRoomWorkflowPacket,
): WarRoomAgentMovement {
  function stateFor(
    activity: WarRoomStationActivity,
  ): WarRoomAgentMovementState {
    switch (activity) {
      case 'queued':
        return 'queued-at-source'
      case 'in-progress':
        return 'walking-corridor'
      case 'waiting-review':
        return 'waiting-review-lock'
      case 'blocked':
        return 'blocked-at-gate'
      case 'complete':
        return packet.artifact ? 'returning-with-artifact' : 'idle-at-room'
      case 'archived':
        return 'archived-static'
      default:
        return 'degraded-static'
    }
  }

  return {
    packetId: packet.id,
    workerId: packet.worker.id,
    state: stateFor(packet.station.activity),
    sourceRoomId: packet.sourceRoomId,
    targetRoomId: packet.targetRoomId,
    corridorId: packet.corridorId,
    currentStationId: packet.station.currentStationId,
    targetStationId: packet.station.targetStationId,
    progress: deterministicProgress(packet),
    motionReason: `packet ${packet.id} moving from ${packet.sourceRoomId} to ${packet.targetRoomId} via ${packet.corridorId}`,
    reducedMotionFallback: 'station-marker-only',
  }
}

function deterministicProgress(packet: WarRoomWorkflowPacket): number {
  const seed = `${packet.id}:${packet.kind}:${packet.corridorId}:${packet.station.activity}`
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 997
  }
  return 10 + (hash % 81)
}

export function createWarRoom10hConnectorActionDraft(input: {
  connectorId: string
  roomId: WarRoomId
  packetId: string
  actionKind: string
  registry: Array<WarRoomConnectorRegistryEntry>
}): WarRoomConnectorActionDraft {
  const connector = input.registry.find(
    (entry) => entry.id === input.connectorId,
  )
  const mode: WarRoomConnectorActionDraft['mode'] =
    connector?.mode === 'dry-run' ? 'dry-run' : 'draft-only'
  const status: WarRoomConnectorActionDraft['status'] =
    connector?.lockState === 'NOT_CONNECTED'
      ? 'rejected-by-safety-spine'
      : 'queued-for-human-review'
  return {
    id: `draft-${input.connectorId}-${input.actionKind}-${input.packetId}`
      .replace(/[^a-z0-9-_]+/gi, '-')
      .toLowerCase(),
    connectorId: input.connectorId,
    roomId: input.roomId,
    packetId: input.packetId,
    actionKind: input.actionKind,
    mode,
    status,
    externalMutation: false,
    requiresDlvApproval: true,
    evidence: [
      connector?.statusEvidence[0]?.value ??
        'Connector status unknown; defaulting to locked.',
      `mode=${mode}; externalMutation=false; requiresDlvApproval=true; no credentials/live API calls.`,
    ],
  }
}

export function createWarRoom10hActionDraftQueue(
  roomId: WarRoomId,
  drafts: Array<WarRoomConnectorActionDraft>,
): WarRoomActionDraftQueue {
  return {
    queueId: `queue-${roomId}`,
    roomId,
    mode: drafts.some((draft) => draft.mode === 'dry-run')
      ? 'dry-run'
      : 'draft-only',
    externalMutation: false,
    liveEnabled: false,
    drafts,
  }
}

export function createWarRoom10hApprovalQueue(
  entries: Array<WarRoomApprovalQueueEntry>,
): WarRoomApprovalQueue {
  return {
    queueId: 'war-room-10h-approval-queue',
    externalMutation: false,
    autoApprovalEnabled: false,
    entries,
  }
}

export function createWarRoom10hApprovalQueueEntry(input: {
  roomId: WarRoomId
  packetId: string
  actionDraftId: string
  connectorId: string
  requestedAction: string
  reviewerLane: WarRoomApprovalQueueEntry['reviewerLane']
  reason: string
}): WarRoomApprovalQueueEntry {
  return {
    id: `approval-${input.actionDraftId}`,
    roomId: input.roomId,
    packetId: input.packetId,
    actionDraftId: input.actionDraftId,
    connectorId: input.connectorId,
    requestedAction: input.requestedAction,
    status: 'pending',
    externalMutation: false,
    requiresDlvApproval: true,
    reviewerLane: input.reviewerLane,
    reason: input.reason,
  }
}

function buildSeedPackets(
  graph: WarRoomRoomGraph,
): Array<WarRoomWorkflowPacket> {
  const safety = createWarRoom10hSafetySpine()
  const packets: Array<WarRoomWorkflowPacket> = []

  const opportunityPacket = createWarRoom10hWorkflowPacket({
    id: 'pkt-opportunity-001',
    kind: 'task',
    sourceRoomId: 'olympus-command',
    targetRoomId: 'agora-opportunity',
    sourceStationId: 'olympus-planning',
    targetStationId: 'agora-intake',
    corridorId: 'command-to-agora',
    worker: defaultWorker('default', 'conductor', 'Olympus Conductor'),
    activity: 'in-progress',
    sourceTaskId: 't_10h_opportunity',
    artifactLabel: 'Opportunity routing draft',
  })

  const researchPacket = createWarRoom10hWorkflowPacket({
    id: 'pkt-research-001',
    kind: 'research-request',
    sourceRoomId: 'agora-opportunity',
    targetRoomId: 'oracle-signals',
    sourceStationId: 'agora-planning',
    targetStationId: 'oracle-research',
    corridorId: 'agora-to-oracle',
    worker: defaultWorker('codexresearch', 'implementer', 'Research Worker'),
    activity: 'queued',
    sourceTaskId: 't_10h_research',
    artifactLabel: 'Research request draft',
  })

  const implementationPacket = createWarRoom10hWorkflowPacket({
    id: 'pkt-implementation-001',
    kind: 'implementation',
    sourceRoomId: 'olympus-command',
    targetRoomId: 'forge-hephaestus',
    sourceStationId: 'olympus-command-table',
    targetStationId: 'forge-workbench',
    corridorId: 'command-to-forge',
    worker: defaultWorker(
      'codexintegrator',
      'implementer',
      'Implementation Worker',
    ),
    activity: 'in-progress',
    sourceTaskId: 't_10h_implementation',
    artifactLabel: 'Implementation handoff draft',
  })

  const connectorPacket = createWarRoom10hWorkflowPacket({
    id: 'pkt-connector-001',
    kind: 'connector-readiness',
    sourceRoomId: 'olympus-command',
    targetRoomId: 'merchant-harbor',
    sourceStationId: 'olympus-approval',
    targetStationId: 'merchant-connector-dock',
    corridorId: 'command-to-merchant',
    worker: defaultWorker('codexconnector', 'connector-worker', 'Connector Worker'),
    activity: 'waiting-review',
    sourceTaskId: 't_10h_connector',
    connectorId: 'etsy-shop-connector',
    artifactLabel: 'Connector readiness evidence',
  })

  const artifactPacket = createWarRoom10hWorkflowPacket({
    id: 'pkt-artifact-001',
    kind: 'artifact-handoff',
    sourceRoomId: 'forge-hephaestus',
    targetRoomId: 'atlantis-vault',
    sourceStationId: 'forge-asset-bench',
    targetStationId: 'atlantis-archive',
    corridorId: 'forge-to-atlantis',
    worker: defaultWorker('codexasset', 'asset-worker', 'Asset Worker'),
    activity: 'complete',
    sourceTaskId: 't_10h_asset',
    artifactLabel: 'Asset manifest draft',
  })

  packets.push(
    opportunityPacket,
    researchPacket,
    implementationPacket,
    connectorPacket,
    artifactPacket,
  )

  for (const packet of packets) {
    packet.safety = { ...safety }
  }

  return packets
}

function buildSeedActionDrafts(
  registry: Array<WarRoomConnectorRegistryEntry>,
  packets: Array<WarRoomWorkflowPacket>,
): Array<WarRoomConnectorActionDraft> {
  const drafts: Array<WarRoomConnectorActionDraft> = []
  const connectorPacket = packets.find(
    (packet) => packet.connectorId === 'etsy-shop-connector',
  )
  if (connectorPacket) {
    drafts.push(
      createWarRoom10hConnectorActionDraft({
        connectorId: 'etsy-shop-connector',
        roomId: 'merchant-harbor',
        packetId: connectorPacket.id,
        actionKind: 'prepare-listing-draft',
        registry,
      }),
    )
  }

  const workspaceConnector = registry.find(
    (entry) => entry.id === 'workspace-local-connector',
  )
  const implementationPacket = packets.find(
    (packet) => packet.kind === 'implementation',
  )
  if (workspaceConnector && implementationPacket) {
    drafts.push(
      createWarRoom10hConnectorActionDraft({
        connectorId: 'workspace-local-connector',
        roomId: 'forge-hephaestus',
        packetId: implementationPacket.id,
        actionKind: 'validate-local-draft',
        registry,
      }),
    )
  }

  return drafts
}

function buildApprovalQueueFromDrafts(
  drafts: Array<WarRoomConnectorActionDraft>,
): WarRoomApprovalQueue {
  const entries = drafts.map((draft): WarRoomApprovalQueueEntry => {
    const isExternal =
      draft.connectorId === 'etsy-shop-connector' ||
      draft.connectorId === 'supplier-marketplace-connector'
    return createWarRoom10hApprovalQueueEntry({
      roomId: draft.roomId,
      packetId: draft.packetId,
      actionDraftId: draft.id,
      connectorId: draft.connectorId,
      requestedAction: draft.actionKind,
      reviewerLane: isExternal ? 'DLV' : 'chatgptheavy',
      reason: isExternal
        ? `External connector ${draft.connectorId} requires DLV approval before any execution.`
        : `Local dry-run draft ${draft.id} queued for human review.`,
    })
  })

  return createWarRoom10hApprovalQueue(entries)
}

export function buildWarRoom10hControlSpineState(): WarRoomControlSpineState {
  const graph = roomGraph()
  const stateContracts = createWarRoom10hStateContracts(graph)
  const registry = createWarRoom10hConnectorRegistry()
  const actionBlueprintRegistry = createWarRoom10hActionBlueprintRegistry()
  const packets = buildSeedPackets(graph)
  const agentMovements = packets.map((packet) =>
    deriveWarRoom10hAgentMovement(packet),
  )
  const drafts = buildSeedActionDrafts(registry, packets)
  const actionDraftQueues = [
    createWarRoom10hActionDraftQueue(
      'merchant-harbor',
      drafts.filter((draft) => draft.roomId === 'merchant-harbor'),
    ),
    createWarRoom10hActionDraftQueue(
      'forge-hephaestus',
      drafts.filter((draft) => draft.roomId === 'forge-hephaestus'),
    ),
  ]
  const approvalQueue = buildApprovalQueueFromDrafts(drafts)
  const openRoom: WarRoomOpenRoomState = {
    mode: 'atlas',
    activeRoomId: null,
    openedFrom: 'restored-state',
  }

  return {
    ok: true,
    version: 'war-room-10h-control-spine-v1',
    generatedAt: nowIso(),
    roomGraph: graph,
    safety: createWarRoom10hSafetySpine(),
    safetyEvidence: createWarRoom10hSafetyEvidence(),
    stateContracts,
    actionBlueprintRegistry,
    connectorRegistry: registry,
    actionDraftQueues,
    approvalQueue,
    packets,
    agentMovements,
    openRoom,
  }
}
