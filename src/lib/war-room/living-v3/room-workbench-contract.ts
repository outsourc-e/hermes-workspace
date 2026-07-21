import type { LivingV3RoomId } from './living-v3-contract'

export type RoomWorkbenchVisualMetaphor =
  | 'mission-control'
  | 'market-lab'
  | 'radar-bazaar'
  | 'signal-oracle'
  | 'media-forge'
  | 'terrain-forge'
  | 'harbor-logistics'
  | 'submerged-vault'
  | 'risk-treasury'
  | 'operator-roster'
  | 'modeling-workshop'
  | 'gateway-cockpit'
  | 'strategy-table'

export type RoomWorkbenchContract = {
  roomId: LivingV3RoomId
  visualMetaphor: RoomWorkbenchVisualMetaphor
  oneLineJob: string
  primaryArtifact: string
  mustShow: Array<string>
  mustControl: Array<string>
  visualRequirements: Array<'summary-cards' | 'tables' | 'charts' | 'media-or-visual-map' | 'status-color-hierarchy' | 'collapsed-proof'>
  forbiddenPrimaryUi: Array<string>
}

const DEFAULT_FORBIDDEN_PRIMARY_UI = [
  'raw JSON as the main surface',
  'permanent kernel/event/debug text',
  'generic equal cards with no visual hierarchy',
  'long explanatory paragraphs instead of controls/results',
  'fake/mock/demo metrics without proof',
]

export const ROOM_WORKBENCH_CONTRACTS: Record<LivingV3RoomId, RoomWorkbenchContract> = {
  'olympus-command': {
    roomId: 'olympus-command',
    visualMetaphor: 'mission-control',
    oneLineJob: 'Global mission control for routing, approvals, alerts, and current work.',
    primaryArtifact: 'Mission board with active runs, owners, approvals, and next action.',
    mustShow: ['active missions', 'approval queue', 'owner agents', 'blocked/live-risk actions', 'database/readback state'],
    mustControl: ['route request', 'open approval', 'assign/focus agent', 'pause/cancel run', 'open proof drawer'],
    visualRequirements: ['summary-cards', 'tables', 'charts', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
  'agora-opportunity': {
    roomId: 'agora-opportunity',
    visualMetaphor: 'radar-bazaar',
    oneLineJob: 'Opportunity radar for product/shop signals and candidate clusters.',
    primaryArtifact: 'Product radar board with image cards, demand/proof signals, and shortlist actions.',
    mustShow: ['candidate images', 'shop/product signals', 'score/risk', 'source proof links', 'watchlist changes'],
    mustControl: ['search/filter', 'open dossier', 'shortlist/reject', 'send to Etsy room', 'open proof drawer'],
    visualRequirements: ['summary-cards', 'tables', 'charts', 'media-or-visual-map', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
  'oracle-signals': {
    roomId: 'oracle-signals',
    visualMetaphor: 'signal-oracle',
    oneLineJob: 'SEO/Alura signal bench that turns metrics into action decisions.',
    primaryArtifact: 'Keyword/tag workbench with Vol/Comp/Score and paste-ready output.',
    mustShow: ['keyword metrics', 'Vol/Comp/Score', 'tag/title readiness', 'source mode', 'missing data'],
    mustControl: ['filter keywords', 'select tags', 'send SEO packet', 'mark missing proof', 'open proof drawer'],
    visualRequirements: ['summary-cards', 'tables', 'charts', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
  'etsy-market-lab': {
    roomId: 'etsy-market-lab',
    visualMetaphor: 'market-lab',
    oneLineJob: 'Product-prep lab from research to ShotLab, SEO, draft preview, and DLV approval.',
    primaryArtifact: 'Selected product dossier plus pipeline board: research → ShotLab → SEO → draft → approval.',
    mustShow: ['product images', 'competitor/supplier/source links', 'candidate score/risk', 'ShotLab state', 'draft approval state'],
    mustControl: ['search/select product', 'create ShotLab handoff', 'create SEO packet', 'preview draft', 'request approval'],
    visualRequirements: ['summary-cards', 'tables', 'charts', 'media-or-visual-map', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
  'forge-hephaestus': {
    roomId: 'forge-hephaestus',
    visualMetaphor: 'media-forge',
    oneLineJob: 'ShotLab/media production board for assets, variants, QA, and handoff.',
    primaryArtifact: 'Gallery board with source/reference, generated variants, rejected/approved states, and QA notes.',
    mustShow: ['image gallery', 'source references', 'variant status', 'QA/reject reasons', 'handoff target'],
    mustControl: ['prepare prompt', 'approve/reject asset', 'request regeneration', 'send to draft', 'open proof drawer'],
    visualRequirements: ['summary-cards', 'tables', 'media-or-visual-map', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
  'terra-forge': {
    roomId: 'terra-forge',
    visualMetaphor: 'terrain-forge',
    oneLineJob: '3D/model/print control surface with model library, slicer readiness, printer state, and QA.',
    primaryArtifact: 'Model/print workbench with previews, material/slice choices, print monitor, and locked machine actions.',
    mustShow: ['model previews', 'printer/camera status', 'slice/profile readiness', 'risk/QA state', 'locked live controls'],
    mustControl: ['select model', 'prepare slice plan', 'open printer monitor', 'request QA', 'approval-gate machine command'],
    visualRequirements: ['summary-cards', 'tables', 'charts', 'media-or-visual-map', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
  'merchant-harbor': {
    roomId: 'merchant-harbor',
    visualMetaphor: 'harbor-logistics',
    oneLineJob: 'Supplier/source harbor for options, prices, risk, contact approval, and purchase locks.',
    primaryArtifact: 'Supplier comparison board with images, price/variant evidence, MOQ/contact caveats, and approval gates.',
    mustShow: ['supplier cards/images', 'price/MOQ/variant facts', 'risk/caveat labels', 'contact status', 'source proof'],
    mustControl: ['compare suppliers', 'mark approved lead', 'request message approval', 'block purchase', 'open proof drawer'],
    visualRequirements: ['summary-cards', 'tables', 'charts', 'media-or-visual-map', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
  'atlantis-vault': {
    roomId: 'atlantis-vault',
    visualMetaphor: 'submerged-vault',
    oneLineJob: 'Data vault that shows which memories, DB rows, packets, notes, and assets are actually available.',
    primaryArtifact: 'Vault command map with store nodes, DB/readback state, evidence shelf, and recent handoffs.',
    mustShow: ['visual store map', 'database provider/readback', 'store health', 'Obsidian/context shelf', 'recent packets'],
    mustControl: ['refresh sources', 'select store', 'filter notes', 'inspect handoff', 'open proof drawer'],
    visualRequirements: ['summary-cards', 'tables', 'charts', 'media-or-visual-map', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
  'treasury-commerce': {
    roomId: 'treasury-commerce',
    visualMetaphor: 'risk-treasury',
    oneLineJob: 'Commerce/risk gate for money, account actions, publish/upload decisions, and approvals.',
    primaryArtifact: 'Risk ledger with pending approvals, money/account exposure, and locked executor state.',
    mustShow: ['approval queue', 'risk class', 'money/account impact', 'decision history', 'locked executor'],
    mustControl: ['approve/reject/needs edit', 'cancel run', 'require readback', 'open entity proof', 'freeze executor'],
    visualRequirements: ['summary-cards', 'tables', 'charts', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
  'pantheon-quarters': {
    roomId: 'pantheon-quarters',
    visualMetaphor: 'operator-roster',
    oneLineJob: 'Operator roster showing who owns what, who is resting, and which contexts/skills each agent uses.',
    primaryArtifact: 'Agent roster with workload, role, context source, and focus controls.',
    mustShow: ['agent cards/portraits', 'role/scope', 'active queues', 'context anchors', 'work/rest state'],
    mustControl: ['focus agent', 'open queue', 'rest/activate safe local state', 'inspect context', 'open proof drawer'],
    visualRequirements: ['summary-cards', 'tables', 'media-or-visual-map', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
  'daedalus-workshop': {
    roomId: 'daedalus-workshop',
    visualMetaphor: 'modeling-workshop',
    oneLineJob: 'CAD/modeling workshop for design files, checks, iterations, and manufacturing readiness.',
    primaryArtifact: 'Model board with previews, dimensions, file outputs, QA gates, and next build step.',
    mustShow: ['model previews', 'dimensions/file types', 'QA results', 'iteration history', 'manufacturing gates'],
    mustControl: ['open model', 'run QA check', 'create revision packet', 'send to Terra/print', 'open proof drawer'],
    visualRequirements: ['summary-cards', 'tables', 'charts', 'media-or-visual-map', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
  'gateway-cockpit': {
    roomId: 'gateway-cockpit',
    visualMetaphor: 'gateway-cockpit',
    oneLineJob: 'Discord/remote command cockpit with incoming requests, approval messages, delivery state, and readback.',
    primaryArtifact: 'Inbox/outbox board with request source, approval mapping, delivery target, and response state.',
    mustShow: ['incoming requests', 'approval bridge state', 'delivery targets', 'send locks', 'readback receipts'],
    mustControl: ['open request', 'reply/send through approved bridge', 'map approval to run', 'retry/cancel delivery', 'open proof drawer'],
    visualRequirements: ['summary-cards', 'tables', 'charts', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
  'council-strategists': {
    roomId: 'council-strategists',
    visualMetaphor: 'strategy-table',
    oneLineJob: 'Strategic decision room with recommendations, advisor votes, 1:1 consults, and final handoff.',
    primaryArtifact: 'Council table with one recommendation, vote support, advisor cards, and next-plan controls.',
    mustShow: ['single recommendation', 'support/vote count', 'advisor states', 'decision timeline', 'handoff packet'],
    mustControl: ['ask council', 'ask one advisor', 'request plan/risk/details', 'send to Hermes', 'open proof drawer'],
    visualRequirements: ['summary-cards', 'tables', 'charts', 'media-or-visual-map', 'status-color-hierarchy', 'collapsed-proof'],
    forbiddenPrimaryUi: DEFAULT_FORBIDDEN_PRIMARY_UI,
  },
}

export function roomWorkbenchContractFor(roomId: LivingV3RoomId) {
  return ROOM_WORKBENCH_CONTRACTS[roomId]
}
