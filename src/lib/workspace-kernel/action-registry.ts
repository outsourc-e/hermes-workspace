import type { WorkspaceBlueprintId, WorkspaceDomain, WorkspaceRiskClass, WorkspaceRun } from './contracts'

export type WorkspaceExecutorId =
  | 'etsy-draft-or-publish'
  | 'google-workspace-write'
  | 'discord-send'
  | 'shotlab-paid-generation'
  | 'supplier-message-or-purchase'
  | 'printer-control'
  | 'browser-logged-in-automation'
  | 'db-or-obsidian-write'
  | 'controlled-worker-spawn'
  | 'local-readback-only'

export type WorkspaceExecutorMode = 'draft_only' | 'approval_required' | 'locked_until_sender_connected'

export type WorkspaceExecutorRegistryEntry = {
  executorId: WorkspaceExecutorId
  label: string
  domains: Array<WorkspaceDomain>
  riskClass: WorkspaceRiskClass
  mode: WorkspaceExecutorMode
  approvalStep: 'not_required' | 'required_before_external_effect'
  readback: string
  lockedActions: Array<string>
}

export type WorkspaceExecutorPlan = {
  runId: string
  blueprintId: WorkspaceBlueprintId
  mode: WorkspaceExecutorMode
  approvalsRequired: boolean
  liveExecutorConnected: false
  route: Array<{
    executorId: WorkspaceExecutorId
    label: string
    approvalStep: WorkspaceExecutorRegistryEntry['approvalStep']
    readback: string
    lockedActions: Array<string>
  }>
}

export const WORKSPACE_EXECUTOR_REGISTRY: Array<WorkspaceExecutorRegistryEntry> = [
  {
    executorId: 'etsy-draft-or-publish',
    label: 'Etsy draft / publish / listing write',
    domains: ['etsy'],
    riskClass: 'R3_EXTERNAL_WRITE',
    mode: 'locked_until_sender_connected',
    approvalStep: 'required_before_external_effect',
    readback: 'Can stage an Etsy packet and approval request; live draft/publish/edit stays locked until a dedicated sender performs readback and DLV approves.',
    lockedActions: ['create Etsy draft', 'publish Etsy listing', 'edit live listing', 'renew listing', 'send Etsy customer message'],
  },
  {
    executorId: 'google-workspace-write',
    label: 'Google Drive / Docs / Sheets write',
    domains: ['etsy', 'data-vault', 'command'],
    riskClass: 'R3_EXTERNAL_WRITE',
    mode: 'locked_until_sender_connected',
    approvalStep: 'required_before_external_effect',
    readback: 'Can prepare a Google write patch and approval card; applying it to Drive/Docs/Sheets stays locked until explicit approval and readback.',
    lockedActions: ['append Google Sheet row', 'patch Google Sheet cell', 'create Drive file', 'edit Google Doc'],
  },
  {
    executorId: 'discord-send',
    label: 'Discord send / delivery',
    domains: ['gateway-discord', 'content-news', 'command'],
    riskClass: 'R3_EXTERNAL_WRITE',
    mode: 'locked_until_sender_connected',
    approvalStep: 'required_before_external_effect',
    readback: 'Can draft a Discord delivery and approval card; sending to a channel stays locked until the approved delivery path is connected.',
    lockedActions: ['send Discord message', 'post media to Discord', 'pin or moderate Discord content'],
  },
  {
    executorId: 'shotlab-paid-generation',
    label: 'ShotLab paid media generation',
    domains: ['shotlab', 'etsy'],
    riskClass: 'R4_COST_OR_ACCOUNT',
    mode: 'locked_until_sender_connected',
    approvalStep: 'required_before_external_effect',
    readback: 'Can stage ShotLab prompt/media truth and approval; paid generation/spend stays locked until explicit cost/account approval.',
    lockedActions: ['paid image generation', 'paid video generation', 'overwrite ShotLab project assets'],
  },
  {
    executorId: 'supplier-message-or-purchase',
    label: 'Supplier message / purchase / payment',
    domains: ['supplier', 'etsy'],
    riskClass: 'R4_COST_OR_ACCOUNT',
    mode: 'locked_until_sender_connected',
    approvalStep: 'required_before_external_effect',
    readback: 'Can stage supplier proof and message draft; supplier contact, purchase, or payment stays locked until explicit approval.',
    lockedActions: ['send supplier message', 'place order', 'pay invoice', 'commit supplier price'],
  },
  {
    executorId: 'printer-control',
    label: '3D printer control / physical production',
    domains: ['cad-3d-print'],
    riskClass: 'R4_COST_OR_ACCOUNT',
    mode: 'locked_until_sender_connected',
    approvalStep: 'required_before_external_effect',
    readback: 'Can create CAD/print-prep packets; printer start/control stays locked until physical-production approval.',
    lockedActions: ['start print job', 'heat printer', 'move axes', 'delete printer job'],
  },
  {
    executorId: 'browser-logged-in-automation',
    label: 'Logged-in browser automation',
    domains: ['etsy', 'supplier', 'gateway-discord', 'command'],
    riskClass: 'R3_EXTERNAL_WRITE',
    mode: 'locked_until_sender_connected',
    approvalStep: 'required_before_external_effect',
    readback: 'Can open/read logged-in surfaces in safe mode; clicks that change accounts/orders/listings/messages stay locked until an approved action card.',
    lockedActions: ['click destructive button', 'submit account form', 'checkout', 'refund/order/customer action'],
  },
  {
    executorId: 'db-or-obsidian-write',
    label: 'Database / Obsidian write',
    domains: ['data-vault', 'command', 'agent-ops'],
    riskClass: 'R1_LOCAL_WRITE',
    mode: 'approval_required',
    approvalStep: 'required_before_external_effect',
    readback: 'Can prepare DB/Obsidian patches with evidence; write/cleanup/delete requires an explicit approval/readback path.',
    lockedActions: ['write workspace DB row', 'edit Obsidian note', 'bulk cleanup/delete', 'memory/profile mutation'],
  },
  {
    executorId: 'controlled-worker-spawn',
    label: 'Controlled worker / profile spawn',
    domains: ['agent-ops', 'command'],
    riskClass: 'R3_EXTERNAL_WRITE',
    mode: 'locked_until_sender_connected',
    approvalStep: 'required_before_external_effect',
    readback: 'Can prepare worker handoff/context packets; spawning uncontrolled workers remains locked until worker scope and profile are approved.',
    lockedActions: ['spawn background worker', 'use another Hermes profile', 'fan-out uncontrolled agents'],
  },
  {
    executorId: 'local-readback-only',
    label: 'Local packet / readback only',
    domains: ['command', 'data-vault', 'seo-alura', 'content-news'],
    riskClass: 'R0_LOCAL_VIEW',
    mode: 'draft_only',
    approvalStep: 'not_required',
    readback: 'Local-only packet/readback can be prepared immediately; any external effect is routed to a separate approval executor.',
    lockedActions: [],
  },
]

function textForRun(run: WorkspaceRun) {
  return [
    run.actionSummary,
    run.actionInput.text,
    ...(run.actionInput.urls ?? []),
    ...(run.actionInput.localPaths ?? []),
    ...(run.actionInput.files ?? []),
    run.blueprintId,
    run.ownerRoomId,
    run.ownerStationId,
  ].join(' ').toLowerCase()
}

function includesAny(text: string, values: Array<string>) {
  return values.some((value) => text.includes(value))
}

function registryEntry(id: WorkspaceExecutorId) {
  return WORKSPACE_EXECUTOR_REGISTRY.find((entry) => entry.executorId === id)!
}

export function workspaceExecutorEntriesForRun(run: WorkspaceRun): Array<WorkspaceExecutorRegistryEntry> {
  const text = textForRun(run)
  const entries: Array<WorkspaceExecutorRegistryEntry> = []

  if (run.blueprintId === 'approval-gate-v1' || includesAny(text, ['etsy', 'listing', 'publish', 'upload', 'draft'])) entries.push(registryEntry('etsy-draft-or-publish'))
  if (includesAny(text, ['google', 'sheet', 'drive', 'docs'])) entries.push(registryEntry('google-workspace-write'))
  if (includesAny(text, ['discord', 'send channel', 'daily news', 'newspaper'])) entries.push(registryEntry('discord-send'))
  if (includesAny(text, ['shotlab', 'paid generation', 'image generation', 'video generation'])) entries.push(registryEntry('shotlab-paid-generation'))
  if (includesAny(text, ['supplier', 'alibaba', 'aliexpress', 'purchase', 'pay ', 'invoice', 'message'])) entries.push(registryEntry('supplier-message-or-purchase'))
  if (includesAny(text, ['printer', 'print job', '3d print', 'g-code', 'gcode', 'slicer'])) entries.push(registryEntry('printer-control'))
  if (includesAny(text, ['browser', 'logged-in', 'logged in', 'click', 'submit'])) entries.push(registryEntry('browser-logged-in-automation'))
  if (includesAny(text, ['database', 'supabase', 'obsidian', 'vault', 'db ', 'cleanup', 'delete'])) entries.push(registryEntry('db-or-obsidian-write'))
  if (includesAny(text, ['worker', 'profile', 'agent spawn', 'fan-out', 'council'])) entries.push(registryEntry('controlled-worker-spawn'))

  if (entries.length === 0) entries.push(registryEntry('local-readback-only'))
  return [...new Map(entries.map((entry) => [entry.executorId, entry])).values()]
}

export function workspaceExecutorPlanForRun(run: WorkspaceRun): WorkspaceExecutorPlan {
  const entries = workspaceExecutorEntriesForRun(run)
  const approvalsRequired = entries.some((entry) => entry.approvalStep === 'required_before_external_effect')
  const mode: WorkspaceExecutorMode = entries.some((entry) => entry.mode === 'locked_until_sender_connected')
    ? 'locked_until_sender_connected'
    : approvalsRequired ? 'approval_required' : 'draft_only'
  return {
    runId: run.runId,
    blueprintId: run.blueprintId,
    mode,
    approvalsRequired,
    liveExecutorConnected: false,
    route: entries.map((entry) => ({
      executorId: entry.executorId,
      label: entry.label,
      approvalStep: entry.approvalStep,
      readback: entry.readback,
      lockedActions: entry.lockedActions,
    })),
  }
}

export function workspaceExecutorReadbackForRun(run: WorkspaceRun) {
  const plan = workspaceExecutorPlanForRun(run)
  const labels = plan.route.map((entry) => entry.label).join(' → ')
  return plan.mode === 'draft_only'
    ? `Executor plan: ${labels}. Local readback only; no external action will be taken.`
    : `Executor plan: ${labels}. Approval is recorded in Workspace Core, but live executor remains locked until a specific sender/adapter is connected and re-read back.`
}
