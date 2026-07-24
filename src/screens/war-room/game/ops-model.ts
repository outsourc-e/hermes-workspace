export type WarRoomShopState = 'live-readonly' | 'drafting' | 'paused' | 'setup'
export type WarRoomAgentState = 'idle' | 'working' | 'thinking' | 'needs-approval' | 'blocked' | 'done'
export type WarRoomQueueKind = 'research' | 'supplier' | 'shotlab' | 'listing' | 'approval' | 'finance' | 'memory' | 'discord'
export type WarRoomMissionStage = 'research' | 'supplier-shortlist' | 'asset-draft' | 'approval' | 'ready' | 'blocked'
export type WarRoomWorkflowStepState = 'done' | 'active' | 'waiting' | 'locked'
export type WarRoomArtifactState = 'ready' | 'draft' | 'waiting' | 'locked'
export type WarRoomGodSuggestionTone = 'next' | 'review' | 'safe' | 'learn'
export type WarRoomArchiveRecordKind = 'seo-db' | 'product-candidate' | 'supplier-proof' | 'listing-draft' | 'approval-history' | 'agent-run' | 'rejection-log' | 'skill-learning' | 'source-evidence' | 'asset-manifest' | 'feedback-memory' | 'workflow-packet'
export type WarRoomArchiveRecordState = 'indexed' | 'draft' | 'needs-proof' | 'approval-waiting' | 'locked' | 'archived'

export type WarRoomArchiveRecord = {
  id: string
  kind: WarRoomArchiveRecordKind
  title: string
  roomId: string
  stationId: string
  state: WarRoomArchiveRecordState
  summary: string
  source: string
  owner: string
  nextUse: string
  lockedActions: Array<string>
  linkedRecords: Array<string>
}

export type WarRoomArchiveCollection = {
  id: string
  label: string
  description: string
  recordKinds: Array<WarRoomArchiveRecordKind>
  count: number
  roomIds: Array<string>
}

export type WarRoomDatabaseVaultState = {
  mode: 'read-only-archive'
  databaseName: string
  pathLabel: string
  collections: Array<WarRoomArchiveCollection>
  records: Array<WarRoomArchiveRecord>
  safetyLocks: Array<string>
}

export type WarRoomShop = {
  id: string
  name: string
  state: WarRoomShopState
  roomId: string
  summary: string
}

export type WarRoomAgentStatus = {
  id: string
  name: string
  roomId: string
  state: WarRoomAgentState
  line: string
}

export type WarRoomQueue = {
  id: string
  roomId: string
  kind: WarRoomQueueKind
  label: string
  count: number
  tone: 'green' | 'amber' | 'red' | 'blue' | 'violet'
}

export type WarRoomMission = {
  id: string
  title: string
  shopId: string
  stage: WarRoomMissionStage
  currentRoomId: string
  nextRoomId: string
  summary: string
}

export type WarRoomApproval = {
  id: string
  roomId: string
  title: string
  risk: 'low' | 'medium' | 'high'
  summary: string
}

export type WarRoomEvent = {
  id: string
  roomId: string
  label: string
  detail: string
  age: string
}

export type WarRoomWorkflowStep = {
  id: string
  order: number
  roomId: string
  stationId?: string
  title: string
  shortLabel: string
  state: WarRoomWorkflowStepState
  owner: string
  summary: string
  inputs: Array<string>
  outputs: Array<string>
  lockedActions: Array<string>
}

export type WarRoomArtifact = {
  id: string
  roomId: string
  stepId: string
  label: string
  state: WarRoomArtifactState
  summary: string
}

export type WarRoomGodIntelligence = {
  agentId: string
  rolePrompt: string
  stationSuggestions: Record<string, Array<{ tone: WarRoomGodSuggestionTone; text: string }>>
  defaultSuggestions: Array<{ tone: WarRoomGodSuggestionTone; text: string }>
}

export type WarRoomOpsState = {
  shops: Array<WarRoomShop>
  agents: Array<WarRoomAgentStatus>
  queues: Array<WarRoomQueue>
  missions: Array<WarRoomMission>
  approvals: Array<WarRoomApproval>
  events: Array<WarRoomEvent>
  workflowSteps: Array<WarRoomWorkflowStep>
  artifacts: Array<WarRoomArtifact>
  databaseVault: WarRoomDatabaseVaultState
  godIntelligence: Array<WarRoomGodIntelligence>
}

export const warRoomOpsState: WarRoomOpsState = {
  shops: [
    {
      id: 'dolaroboutique',
      name: 'DolaroBoutique',
      state: 'live-readonly',
      roomId: 'olympus-command',
      summary: 'Active shop is visible in read-only command mode.',
    },
    {
      id: 'shop-expansion-01',
      name: 'Future Shop Slot 01',
      state: 'setup',
      roomId: 'agora',
      summary: 'Reserved for the 5–10 shop expansion system.',
    },
  ],
  agents: [
    { id: 'hermes', name: 'Hermes', roomId: 'olympus-command', state: 'thinking', line: 'Routing the next automation slice through safe approval gates.' },
    { id: 'oracle', name: 'Oracle', roomId: 'oracle', state: 'working', line: 'Watching keyword, trend, and shop-signal rooms.' },
    { id: 'merchant-scout', name: 'Merchant Scout', roomId: 'merchant-harbor', state: 'working', line: 'Ready to inspect supplier candidates after research handoff.' },
    { id: 'hephaestus', name: 'Hephaestus', roomId: 'forge', state: 'needs-approval', line: 'ShotLab draft package waits behind the DLV approval seal.' },
    { id: 'treasury-watcher', name: 'Treasury Watcher', roomId: 'treasury', state: 'idle', line: 'Paid actions remain locked.' },
  ],
  queues: [
    { id: 'research-ideas', roomId: 'agora', kind: 'research', label: 'research candidates', count: 3, tone: 'blue' },
    { id: 'supplier-shortlist', roomId: 'merchant-harbor', kind: 'supplier', label: 'supplier gates', count: 2, tone: 'green' },
    { id: 'shotlab-drafts', roomId: 'forge', kind: 'shotlab', label: 'ShotLab draft tasks', count: 1, tone: 'amber' },
    { id: 'approval-waiting', roomId: 'forge', kind: 'approval', label: 'approval gates', count: 1, tone: 'amber' },
    { id: 'cost-locks', roomId: 'treasury', kind: 'finance', label: 'paid locks', count: 3, tone: 'red' },
    { id: 'memory-events', roomId: 'atlantis-vault', kind: 'memory', label: 'saved learnings', count: 1, tone: 'violet' },
  ],
  missions: [
    {
      id: 'mission-phase-b-slice',
      title: 'Phase B: first real workflow slice',
      shopId: 'dolaroboutique',
      stage: 'supplier-shortlist',
      currentRoomId: 'merchant-harbor',
      nextRoomId: 'forge',
      summary: 'Live-mode model for one DolaroBoutique product: research → supplier gate → Forge/ShotLab draft package → DLV approval.',
    },
  ],
  approvals: [
    {
      id: 'approval-live-actions-locked',
      roomId: 'forge',
      title: 'DLV approval required before live action',
      risk: 'medium',
      summary: 'Publishing, purchases, refunds, renewals, messages, and paid generation remain locked until DLV explicitly approves the exact step.',
    },
  ],
  events: [
    { id: 'event-phase-b-started', roomId: 'olympus-command', label: 'Phase B started', detail: 'Vertical slice added from research to supplier to Forge/ShotLab approval.', age: 'now' },
    { id: 'event-supplier-gate', roomId: 'merchant-harbor', label: 'Supplier gate modeled', detail: 'Jewelry-only, clean images, <=5 variants, buyer proof required.', age: 'now' },
    { id: 'event-shotlab-lock', roomId: 'forge', label: 'ShotLab lock active', detail: 'Draft/package preparation is allowed; paid generation and Etsy publish are locked.', age: 'now' },
    { id: 'event-treasury-check', roomId: 'treasury', label: 'Margin guard ready', detail: 'Costs and paid actions are modeled before approval.', age: 'now' },
    { id: 'event-atlantis-skill', roomId: 'atlantis-vault', label: 'Learning loop ready', detail: 'Approved/rejected product runs become archive relics and skill candidates.', age: 'now' },
  ],
  workflowSteps: [
    {
      id: 'research-scan',
      order: 1,
      roomId: 'agora',
      stationId: 'idea-stalls',
      title: 'Research scan',
      shortLabel: 'Research',
      state: 'done',
      owner: 'Oracle Researcher',
      summary: 'Find jewelry ideas that do not copy current inventory and can become clean ShotLab candidates.',
      inputs: ['DolaroBoutique jewelry direction', 'Etsy/Alura opportunity signals', 'avoid current-inventory lookalikes'],
      outputs: ['3 candidate ideas', 'niche notes', 'initial demand hints'],
      lockedActions: ['No Etsy edits', 'No supplier contact', 'No paid tools without approval'],
    },
    {
      id: 'supplier-gate',
      order: 2,
      roomId: 'merchant-harbor',
      stationId: 'supplier-ledger',
      title: 'Supplier gate',
      shortLabel: 'Supplier',
      state: 'active',
      owner: 'Merchant Scout',
      summary: 'Shortlist AliExpress/Alibaba pages only if they are specific jewelry products with clean images and manageable variants.',
      inputs: ['candidate idea', 'source product URL', 'orders/rating/reviews', 'price/shipping proof'],
      outputs: ['2 supplier candidates', 'variant count verdict', 'ShotLab suitability pass/fail'],
      lockedActions: ['No purchases', 'No messages to supplier', 'No supplier sheet F/G edits'],
    },
    {
      id: 'shotlab-draft',
      order: 3,
      roomId: 'forge',
      stationId: 'listing-easel',
      title: 'Forge / ShotLab draft',
      shortLabel: 'Forge',
      state: 'waiting',
      owner: 'Hephaestus',
      summary: 'Prepare a draft-only package: base/variant classification, creative set plan, output mix, SEO handoff, and screenshots.',
      inputs: ['approved supplier candidate', 'clean product images', 'variant mapping', 'DLV shop name/watermark'],
      outputs: ['ShotLab project shell', 'image classification plan', 'draft prompt/set plan', 'SEO/export checklist'],
      lockedActions: ['No paid image generation', 'No Etsy upload/publish', 'No price/quantity guess'],
    },
    {
      id: 'treasury-margin-check',
      order: 4,
      roomId: 'treasury',
      stationId: 'margin-chest',
      title: 'Treasury margin check',
      shortLabel: 'Margin',
      state: 'locked',
      owner: 'Treasury Watcher',
      summary: 'Confirm cost, shipping, target price, fees, and paid generation budget before a product can advance.',
      inputs: ['supplier price', 'shipping estimate', 'target Etsy price', 'image/listing cost estimate'],
      outputs: ['margin verdict', 'spend warning', 'approval packet'],
      lockedActions: ['No ad spend', 'No paid generation', 'No purchase'],
    },
    {
      id: 'dlv-approval',
      order: 5,
      roomId: 'forge',
      stationId: 'approval-shrine',
      title: 'DLV approval seal',
      shortLabel: 'Approval',
      state: 'locked',
      owner: 'DLV',
      summary: 'Human approval decides whether to create paid images, archive the product, or prepare an Etsy draft later.',
      inputs: ['supplier proof', 'ShotLab draft package', 'risk notes', 'cost/paid-action warning'],
      outputs: ['approve', 'reject', 'revise', 'hold'],
      lockedActions: ['No live Etsy action', 'No customer messages', 'No billing/account changes'],
    },
    {
      id: 'archive-learning',
      order: 6,
      roomId: 'atlantis-vault',
      stationId: 'skill-relic-shelves',
      title: 'Archive and skill forge',
      shortLabel: 'Archive',
      state: 'waiting',
      owner: 'Atlantis Archivist',
      summary: 'Save the decision trail, screenshots, supplier verdict, and reusable workflow notes after DLV decides.',
      inputs: ['approval outcome', 'winning/rejected assets', 'supplier notes', 'listing draft package'],
      outputs: ['archive relic', 'skill candidate', 'next-run checklist'],
      lockedActions: ['No deletion of protected skills', 'No memory overwrite without review'],
    },
  ],
  artifacts: [
    { id: 'artifact-research-candidates', roomId: 'agora', stepId: 'research-scan', label: '3 research candidates', state: 'ready', summary: 'Ideas are modeled as candidates, not final products.' },
    { id: 'artifact-supplier-shortlist', roomId: 'merchant-harbor', stepId: 'supplier-gate', label: '2 supplier gates', state: 'draft', summary: 'Supplier pages must pass jewelry fit, image consistency, and <=5 variant gates.' },
    { id: 'artifact-shotlab-package', roomId: 'forge', stepId: 'shotlab-draft', label: '1 ShotLab package', state: 'waiting', summary: 'Draft-only package waits for a supplier-approved candidate.' },
    { id: 'artifact-margin-packet', roomId: 'treasury', stepId: 'treasury-margin-check', label: 'Margin packet', state: 'locked', summary: 'Cost and paid-generation verdict waits for DLV.' },
    { id: 'artifact-approval-seal', roomId: 'forge', stepId: 'dlv-approval', label: 'Approval seal', state: 'locked', summary: 'Paid generation and Etsy actions remain locked.' },
    { id: 'artifact-learning-relic', roomId: 'atlantis-vault', stepId: 'archive-learning', label: 'Workflow relic', state: 'waiting', summary: 'Final decisions become archive evidence and skill candidates.' },
  ],
  databaseVault: {
    mode: 'read-only-archive',
    databaseName: 'Olympus Data Vault',
    pathLabel: 'Atlantis Vault → canonical database backbone for every room',
    safetyLocks: ['No Etsy publish/edit/renew', 'No supplier message/purchase', 'No paid generation/spend', 'No customer/account action', 'No memory/skill overwrite without review'],
    collections: [
      { id: 'seo-db', label: 'SEO DB', description: 'Keywords, volume/competition notes, tag gaps, exact attributes, and usable SEO signals.', recordKinds: ['seo-db'], count: 2, roomIds: ['oracle', 'forge', 'atlantis-vault'] },
      { id: 'product-intelligence', label: 'Product Intelligence', description: 'Jewelry-only opportunities, market evidence, rejection reasons, and next room handoff.', recordKinds: ['product-candidate', 'source-evidence', 'rejection-log'], count: 4, roomIds: ['agora', 'oracle', 'merchant-harbor', 'atlantis-vault'] },
      { id: 'supplier-proof', label: 'Supplier Proof', description: 'Supplier/source facts, proof gaps, image consistency, variant sanity, price/shipping, and risk notes.', recordKinds: ['supplier-proof', 'source-evidence'], count: 2, roomIds: ['merchant-harbor', 'forge', 'atlantis-vault'] },
      { id: 'draft-listings', label: 'Draft Listings', description: 'Title, 13 tags, photo plan, description, blocked claims, and approval packet.', recordKinds: ['listing-draft', 'approval-history', 'workflow-packet'], count: 3, roomIds: ['forge', 'treasury', 'atlantis-vault'] },
      { id: 'asset-manifests', label: 'Asset Manifests', description: 'ShotLab/Base/Variant files, generated asset sets, screenshot evidence, and export manifests.', recordKinds: ['asset-manifest', 'source-evidence'], count: 2, roomIds: ['forge', 'atlantis-vault'] },
      { id: 'feedback-memory', label: 'Feedback Memory', description: 'DLV approvals/rejections, taste corrections, workflow lessons, and skill candidates.', recordKinds: ['feedback-memory', 'approval-history', 'rejection-log', 'skill-learning'], count: 4, roomIds: ['olympus-command', 'forge', 'pantheon-quarters', 'atlantis-vault'] },
      { id: 'agent-runs', label: 'Agent Runs', description: 'Who worked on what, run outputs, stuck states, reusable lessons, and next dispatch context.', recordKinds: ['agent-run', 'workflow-packet', 'skill-learning'], count: 3, roomIds: ['olympus-command', 'pantheon-quarters', 'atlantis-vault'] },
    ],
    records: [
      { id: 'seo-necklace-core', kind: 'seo-db', title: 'Necklace SEO core cluster', roomId: 'oracle', stationId: 'keyword-crystal', state: 'indexed', summary: 'Keyword cluster is usable only after Bulk + single + related checks are attached, with verified competition/volume and no false material claims.', source: 'SEO DB / keyword queue', owner: 'Oracle', nextUse: 'Attach to Listing Easel draft only after product fit and supplier proof are proven.', lockedActions: ['No keyword stuffing', 'No false material/stone tags'], linkedRecords: ['listing-draft-necklace', 'workflow-research-to-listing'] },
      { id: 'candidate-jewelry-clean-images', kind: 'product-candidate', title: 'Clean-image jewelry candidate', roomId: 'agora', stationId: 'idea-stalls', state: 'needs-proof', summary: 'Candidate looks promising but still needs supplier/source proof, non-lookalike check, and variant sanity before Forge work.', source: 'Product Intelligence read-only import', owner: 'Athena', nextUse: 'Send to Merchant Harbor supplier gate.', lockedActions: ['No purchase', 'No supplier message', 'No Etsy draft publish'], linkedRecords: ['supplier-proof-gap-01', 'source-alura-etsy-proof-01'] },
      { id: 'source-alura-etsy-proof-01', kind: 'source-evidence', title: 'Alura/Etsy evidence packet', roomId: 'agora', stationId: 'competitor-board', state: 'indexed', summary: 'Stores screenshots, search terms, demand/competition notes, and why the opportunity is not a lookalike of current DolaroBoutique inventory.', source: 'Alura/Etsy read-only browser run', owner: 'Athena', nextUse: 'Evidence source for candidate scoring and rejection review.', lockedActions: ['No scraping beyond allowed/read-only view', 'No competitor copy/paste'], linkedRecords: ['candidate-jewelry-clean-images'] },
      { id: 'supplier-proof-gap-01', kind: 'supplier-proof', title: 'Supplier proof gap', roomId: 'merchant-harbor', stationId: 'supplier-ledger', state: 'needs-proof', summary: 'Variant count, jewelry family consistency, finished-good status, image quality, shipping, reviews, and price proof need confirmation before Forge work.', source: 'Supplier gate placeholder', owner: 'Njord', nextUse: 'Only passing suppliers move into ShotLab draft planning.', lockedActions: ['No order', 'No message supplier', 'No supplier sheet F/G edits'], linkedRecords: ['candidate-jewelry-clean-images', 'source-alura-etsy-proof-01'] },
      { id: 'asset-manifest-shotlab-draft', kind: 'asset-manifest', title: 'ShotLab draft asset manifest', roomId: 'forge', stationId: 'sorting-rack', state: 'draft', summary: 'Tracks Base/Variant classification, accepted/rejected images, screenshot proof, export filenames, and which assets are safe to use.', source: 'Forge / ShotLab draft line', owner: 'Hephaestus', nextUse: 'Feed Listing Easel and Approval Shrine after supplier proof passes.', lockedActions: ['No paid generation', 'No Etsy upload', 'No mixed-design product pages'], linkedRecords: ['listing-draft-necklace', 'approval-dlv-live-actions'] },
      { id: 'listing-draft-necklace', kind: 'listing-draft', title: 'Necklace draft listing shell', roomId: 'forge', stationId: 'listing-easel', state: 'draft', summary: 'Title, 13 tags, alt text, photo plan, and description are draft-only; publish remains locked.', source: 'Listing Easel', owner: 'Hephaestus', nextUse: 'Open Approval Shrine after proof, SEO, pricing, and asset manifest are complete.', lockedActions: ['No Etsy publish', 'No live price/quantity edit', 'No unknown recycled/material/stone claims'], linkedRecords: ['seo-necklace-core', 'asset-manifest-shotlab-draft', 'approval-dlv-live-actions'] },
      { id: 'workflow-research-to-listing', kind: 'workflow-packet', title: 'Research → Supplier → Forge → Approval packet', roomId: 'atlantis-vault', stationId: 'dataset-pool', state: 'indexed', summary: 'Canonical handoff packet copied from the AndrooAGI pattern but translated into DLV theme: every room produces a concrete artifact for the next room.', source: 'AndrooAGI reverse engineering + DLV War Room model', owner: 'Hermes', nextUse: 'Use as Phase 2 contract for real DB tables/API writes.', lockedActions: ['No external writes', 'No live marketplace action'], linkedRecords: ['candidate-jewelry-clean-images', 'supplier-proof-gap-01', 'asset-manifest-shotlab-draft', 'approval-dlv-live-actions'] },
      { id: 'approval-dlv-live-actions', kind: 'approval-history', title: 'DLV live-action approval gate', roomId: 'forge', stationId: 'approval-shrine', state: 'locked', summary: 'All irreversible or external actions wait for explicit DLV approval with exact title/id/scope/action.', source: 'Approval Shrine', owner: 'DLV', nextUse: 'Human decision: approve / hold / reject / revise.', lockedActions: ['No publish', 'No refund', 'No renewal', 'No customer message', 'No supplier purchase', 'No account change'], linkedRecords: ['listing-draft-necklace', 'workflow-research-to-listing'] },
      { id: 'feedback-dlv-theme-not-copy', kind: 'feedback-memory', title: 'DLV theme rule: clone the system, not the sci-fi dungeon', roomId: 'atlantis-vault', stationId: 'memory-loom', state: 'indexed', summary: 'Use AndrooAGI as a living-agent OS reference, but translate it into Olympus/DLV rooms, gods, data vaults, commerce gates, and useful station tools.', source: 'DLV feedback + reverse-engineering document', owner: 'Poseidon', nextUse: 'Audit every future room against the theme rule before visual polish.', lockedActions: ['No literal hive/ant-farm copy', 'No dark slave-agent framing'], linkedRecords: ['workflow-research-to-listing'] },
      { id: 'run-forge-visual-tools', kind: 'agent-run', title: 'Forge visual tools pass', roomId: 'forge', stationId: 'skills-forge', state: 'archived', summary: 'Six station apps became distinct visual/useful tools; next step is real archive data backbone and room-to-room packets.', source: 'Workspace QA', owner: 'Hermes', nextUse: 'Use as pattern for future station-specific apps.', lockedActions: ['No destructive file edits without approval'], linkedRecords: ['skill-learning-station-apps'] },
      { id: 'skill-learning-station-apps', kind: 'skill-learning', title: 'Station-specific app lesson', roomId: 'atlantis-vault', stationId: 'skill-relic-shelves', state: 'approval-waiting', summary: 'Successful pattern may become a skill after another real data-backed pass is proven.', source: 'Atlantis Vault', owner: 'Poseidon', nextUse: 'Propose skill only after DLV accepts the data-backed workflow.', lockedActions: ['No skill overwrite without review'], linkedRecords: ['run-forge-visual-tools', 'feedback-dlv-theme-not-copy'] },
      { id: 'reject-generic-cockpit', kind: 'rejection-log', title: 'Rejected: generic cockpit panels', roomId: 'atlantis-vault', stationId: 'report-tablets', state: 'archived', summary: 'DLV rejected panels that only change text; future tools need distinct structure, data, control, and artifact output.', source: 'DLV feedback', owner: 'Atlantis Archivist', nextUse: 'Audit future screens against this rejection before polish.', lockedActions: ['Do not regress to generic cockpit'], linkedRecords: ['run-forge-visual-tools', 'feedback-dlv-theme-not-copy'] },
    ],
  },
  godIntelligence: [
    { agentId: 'hermes', rolePrompt: 'Route missions across Olympus, summarize blockers, and keep every live action behind explicit approval.', defaultSuggestions: [{ tone: 'next', text: 'Start from the room with the active workflow badge, then move the packet forward one station only.' }, { tone: 'safe', text: 'I can create review tasks, but I will not touch Etsy, suppliers, purchases, or account state.' }], stationSuggestions: { 'war-table': [{ tone: 'next', text: 'Open Mission Feed, then dispatch a draft-only task if the queue is stale.' }] } },
    { agentId: 'oracle-researcher', rolePrompt: 'Turn product signals into jewelry-only candidate ideas without copying existing inventory.', defaultSuggestions: [{ tone: 'next', text: 'Use Idea Stalls to stage candidates, then send only clean jewelry ideas to Merchant Harbor.' }], stationSuggestions: { 'idea-stalls': [{ tone: 'review', text: 'Reject lookalikes, messy variants, non-jewelry, and custom-only products before sourcing.' }] } },
    { agentId: 'oracle', rolePrompt: 'Watch keywords, trend changes, and shop signals; warn only when a review action is useful.', defaultSuggestions: [{ tone: 'next', text: 'Run Pulse Scan for current signals, then inspect Keyword Crystal if the queue is quiet.' }], stationSuggestions: { 'keyword-crystal': [{ tone: 'learn', text: 'Save promising keyword clusters to Atlantis after a product decision.' }] } },
    { agentId: 'merchant-scout', rolePrompt: 'Inspect supplier pages read-only and shortlist only clean ready-made jewelry with manageable variants.', defaultSuggestions: [{ tone: 'review', text: 'Supplier candidates need image consistency, rating/order proof, price/shipping, and variant sanity.' }], stationSuggestions: { 'supplier-ledger': [{ tone: 'next', text: 'Pass only two best candidates forward to Forge; leave weak suppliers archived with reasons.' }] } },
    { agentId: 'hephaestus', rolePrompt: 'Create draft-only creative/listing packages and ShotLab handoffs; never run paid generation without DLV approval.', defaultSuggestions: [{ tone: 'next', text: 'Prompt Anvil creates the draft brief; Sorting Rack ranks outputs; Listing Easel prepares review copy.' }, { tone: 'safe', text: 'Paid generation and Etsy upload remain sealed.' }], stationSuggestions: { 'prompt-anvil': [{ tone: 'next', text: 'Build Base/Variant prompt rules before image work.' }], 'listing-easel': [{ tone: 'review', text: 'Title, tags, price, and quantity remain draft-only until DLV approves.' }] } },
    { agentId: 'treasury-watcher', rolePrompt: 'Guard margins, API cost, ad spend, and paid actions before approval.', defaultSuggestions: [{ tone: 'safe', text: 'No spend or purchase can pass until the margin packet is reviewed.' }], stationSuggestions: { 'margin-chest': [{ tone: 'next', text: 'Check supplier cost, shipping, fees, and target price before the approval seal opens.' }] } },
    { agentId: 'atlantis-archivist', rolePrompt: 'Archive evidence, screenshots, decisions, and successful procedures as reusable skills.', defaultSuggestions: [{ tone: 'learn', text: 'After DLV approves/rejects, save the reason trail and propose a reusable skill only if the workflow is proven.' }], stationSuggestions: { 'skill-relic-shelves': [{ tone: 'learn', text: 'Convert repeatable successful product runs into a skill with pitfalls and verification steps.' }] } },
  ],
}

export function queuesForRoom(roomId: string) {
  return warRoomOpsState.queues.filter((queue) => queue.roomId === roomId)
}

export function agentsForRoom(roomId: string) {
  return warRoomOpsState.agents.filter((agent) => agent.roomId === roomId)
}

export function workflowStepsForRoom(roomId: string) {
  return warRoomOpsState.workflowSteps.filter((step) => step.roomId === roomId)
}

export function artifactsForRoom(roomId: string) {
  return warRoomOpsState.artifacts.filter((artifact) => artifact.roomId === roomId)
}

export function roomOpsSummary(roomId: string) {
  const queues = queuesForRoom(roomId)
  const agents = agentsForRoom(roomId)
  const mission = warRoomOpsState.missions.find((item) => item.currentRoomId === roomId || item.nextRoomId === roomId)
  const approvals = warRoomOpsState.approvals.filter((item) => item.roomId === roomId)
  const workflowSteps = workflowStepsForRoom(roomId)
  const artifacts = artifactsForRoom(roomId)
  return {
    queues,
    agents,
    mission,
    approvals,
    workflowSteps,
    artifacts,
    queueTotal: queues.reduce((total, queue) => total + queue.count, 0),
    needsApproval: approvals.length > 0 || agents.some((agent) => agent.state === 'needs-approval') || workflowSteps.some((step) => step.state === 'locked'),
    activeAgent: agents.find((agent) => agent.state === 'working' || agent.state === 'thinking' || agent.state === 'needs-approval') ?? agents.at(0),
  }
}


export function godIntelligenceForAgent(agentId: string) {
  return warRoomOpsState.godIntelligence.find((profile) => profile.agentId === agentId) ?? null
}

export function suggestionsForStation(agentId: string, stationId?: string) {
  const profile = godIntelligenceForAgent(agentId)
  if (!profile) return []
  return stationId ? (profile.stationSuggestions[stationId] ?? profile.defaultSuggestions) : profile.defaultSuggestions
}

export function workflowStepsForStation(roomId: string, stationId: string) {
  return warRoomOpsState.workflowSteps.filter((step) => step.roomId === roomId && step.stationId === stationId)
}

export function archiveRecordsForRoom(roomId: string) {
  return warRoomOpsState.databaseVault.records.filter((record) => record.roomId === roomId || record.linkedRecords.some((linkedId) => warRoomOpsState.databaseVault.records.find((candidate) => candidate.id === linkedId)?.roomId === roomId))
}

export function archiveRecordsForStation(stationId: string) {
  return warRoomOpsState.databaseVault.records.filter((record) => record.stationId === stationId || record.linkedRecords.includes(stationId))
}

export function archiveCollectionsForRoom(roomId: string) {
  return warRoomOpsState.databaseVault.collections.filter((collection) => collection.roomIds.includes(roomId))
}
