export const WORKSPACE_PIPELINE_OS_SCHEMA_VERSION = 'workspace-pipeline-os-v1' as const

export const WORKSPACE_PIPELINE_OS_REQUIRED_SECTIONS = [
  'activeArtifact',
  'steps',
  'inputMedia',
  'outputMedia',
  'filters',
  'actions',
  'locks',
  'readback',
] as const

export type WorkspacePipelineOsRequiredSection = typeof WORKSPACE_PIPELINE_OS_REQUIRED_SECTIONS[number]

export type WorkspacePipelineOsSurfaceId =
  | 'etsy-product-prep'
  | 'terra-model-to-print'
  | 'oracle-product-signal'
  | 'atlantis-vault-pipeline'
  | 'gateway-external-action-gate'
  | 'council-decision-room'

export type WorkspacePipelineOsSurfaceContract = {
  id: WorkspacePipelineOsSurfaceId
  roomLabel: string
  primaryStation: string
  teaches: string
  inputMedia: Array<string>
  outputMedia: Array<string>
  filters: Array<string>
  operatorActions: Array<string>
  approvalLocks: Array<string>
  liveSideEffectsAllowed: false
  presetCountButtonsAllowed: false
}

export const WORKSPACE_PIPELINE_OS_ACTIVE_SURFACES: ReadonlyArray<WorkspacePipelineOsSurfaceContract> = [
  {
    id: 'etsy-product-prep',
    roomLabel: 'Etsy / Ceramic / Product Prep',
    primaryStation: 'Product research, ShotLab, SEO, draft prep',
    teaches: 'How a product idea becomes a sourced candidate, filtered media set, ShotLab output, SEO packet, and draft approval card.',
    inputMedia: ['product candidates', 'source images', 'market signals', 'supplier/readback notes'],
    outputMedia: ['shortlist cards', 'ShotLab output slots', 'SEO packet', 'draft approval packet'],
    filters: ['stage', 'image accepted/rejected', 'market evidence', 'draft readiness'],
    operatorActions: ['run/stage local research', 'select/reject candidate', 'send local packet to ShotLab/SEO/Draft'],
    approvalLocks: ['no Etsy publish/edit', 'no paid generation', 'no supplier/customer send'],
    liveSideEffectsAllowed: false,
    presetCountButtonsAllowed: false,
  },
  {
    id: 'terra-model-to-print',
    roomLabel: 'Terra / 3D Print',
    primaryStation: 'Model hunt, modeling studio, printer control',
    teaches: 'How a model/reference moves through search/import, preview, slicing, QA, and printer approval.',
    inputMedia: ['model previews', 'local files', 'internet candidates', 'printer profile'],
    outputMedia: ['selected model', 'slice plan', 'QA readback', 'printer gate packet'],
    filters: ['source', 'license/risk', 'profile readiness', 'printer state'],
    operatorActions: ['stage model brief', 'stage search', 'stage slice/readback'],
    approvalLocks: ['no printer start', 'no printer upload', 'no live machine movement'],
    liveSideEffectsAllowed: false,
    presetCountButtonsAllowed: false,
  },
  {
    id: 'oracle-product-signal',
    roomLabel: 'Oracle / Research Signal',
    primaryStation: 'Local Alura/Etsy signal scout',
    teaches: 'How a niche/keyword is searched, scored, selected, and handed off as a local Etsy signal packet.',
    inputMedia: ['keyword query', 'local evidence files', 'metric rows'],
    outputMedia: ['selected signal packet', 'Etsy product card handoff'],
    filters: ['source mode', 'signal count', 'missing metrics'],
    operatorActions: ['search evidence', 'send selected signal to Etsy workbench'],
    approvalLocks: ['no live Alura call', 'no Etsy write', 'no supplier action'],
    liveSideEffectsAllowed: false,
    presetCountButtonsAllowed: false,
  },
  {
    id: 'atlantis-vault-pipeline',
    roomLabel: 'Atlantis / Vault',
    primaryStation: 'Source index and context readback',
    teaches: 'How sources, stores, context notes, packets, and approvals become visible before any handoff.',
    inputMedia: ['store nodes', 'workspace packets', 'allowlisted context'],
    outputMedia: ['recent artifacts', 'readback cards', 'approval queue entries'],
    filters: ['truth store', 'warnings', 'blocked stores'],
    operatorActions: ['refresh read-only vault status'],
    approvalLocks: ['no DB mutation', 'no Obsidian edit', 'no cleanup/delete', 'no live executor'],
    liveSideEffectsAllowed: false,
    presetCountButtonsAllowed: false,
  },
  {
    id: 'gateway-external-action-gate',
    roomLabel: 'Gateway / External Actions',
    primaryStation: 'Approval/readback gate',
    teaches: 'How any external route is staged with target, payload, risk, approval, and delivery receipt.',
    inputMedia: ['operator request', 'payload packet', 'target route'],
    outputMedia: ['readback packet', 'approval card', 'delivery receipt after approval'],
    filters: ['route type', 'approval state', 'risk/cost'],
    operatorActions: ['stage readback', 'route to correct approval gate'],
    approvalLocks: ['no Discord send', 'no Etsy publish/edit', 'no supplier message/payment', 'no printer command'],
    liveSideEffectsAllowed: false,
    presetCountButtonsAllowed: false,
  },
  {
    id: 'council-decision-room',
    roomLabel: 'Council / Decisions',
    primaryStation: 'Planning and advisor decision room',
    teaches: 'How a question becomes advisor responses, visible votes, a decision packet, and a gated Hermes handoff.',
    inputMedia: ['operator question', 'advisor profiles', 'follow-up prompt'],
    outputMedia: ['consensus card', 'step plan', 'Hermes handoff packet'],
    filters: ['vote lanes', 'advisor count', 'consultations'],
    operatorActions: ['open council', 'ask follow-up', 'handoff approved packet'],
    approvalLocks: ['no external action', 'no fake local answer fallback', 'no handoff until DLV approval'],
    liveSideEffectsAllowed: false,
    presetCountButtonsAllowed: false,
  },
]

export function workspacePipelineSurfaceIds() {
  return WORKSPACE_PIPELINE_OS_ACTIVE_SURFACES.map((surface) => surface.id)
}

export function workspacePipelineOsSectionsComplete(surface: WorkspacePipelineOsSurfaceContract) {
  return Boolean(
    surface.inputMedia.length &&
    surface.outputMedia.length &&
    surface.filters.length &&
    surface.operatorActions.length &&
    surface.approvalLocks.length,
  )
}
