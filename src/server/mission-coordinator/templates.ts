import type { Mission, MissionNode } from './types'

export type MissionTemplateKind =
  | 'coding'
  | 'research'
  | 'qa'
  | 'release'
  | 'maintenance'

export type MissionTemplate = {
  kind: MissionTemplateKind
  title: string
  buildNodes: (input: {
    missionId: string
    objective: string
  }) => Array<MissionNode>
}

function node(
  input: Omit<MissionNode, 'state' | 'hermesTaskId' | 'claimedAt' | 'dispatchedAt' | 'retries' | 'evidence'>,
): MissionNode {
  return {
    ...input,
    state: 'blocked_by_dependency',
    hermesTaskId: null,
    claimedAt: null,
    dispatchedAt: null,
    retries: 0,
    evidence: {
      runId: null,
      runStatus: null,
      outcome: null,
      summary: null,
      checkpoint: null,
      verifiedAt: null,
    },
  }
}

export const MISSION_TEMPLATES: Record<MissionTemplateKind, MissionTemplate> = {
  coding: {
    kind: 'coding',
    title: 'Coding pipeline',
    buildNodes: ({ objective }) => [
      node({
        id: 'inspect',
        title: 'Inspect',
        role: 'researcher',
        objective: `Inspect the repository for: ${objective}`,
        dependsOn: [],
        locks: [],
        readOnly: true,
      }),
      node({
        id: 'design',
        title: 'Design',
        role: 'orchestrator',
        objective: `Create an implementation plan for: ${objective}`,
        dependsOn: ['inspect'],
        locks: [],
        readOnly: true,
      }),
      node({
        id: 'build',
        title: 'Build',
        role: 'builder',
        objective,
        dependsOn: ['design'],
        locks: ['repository:write'],
        readOnly: false,
      }),
      node({
        id: 'review',
        title: 'Review',
        role: 'reviewer',
        objective: `Review the implementation for: ${objective}`,
        dependsOn: ['build'],
        locks: [],
        readOnly: true,
      }),
      node({
        id: 'qa',
        title: 'QA',
        role: 'qa',
        objective: `Verify the implementation for: ${objective}`,
        dependsOn: ['review'],
        locks: [],
        readOnly: true,
      }),
      node({
        id: 'integrate',
        title: 'Integrate',
        role: 'builder',
        objective: `Integrate verified work for: ${objective}`,
        dependsOn: ['qa'],
        locks: ['repository:write'],
        readOnly: false,
      }),
    ],
  },
  research: {
    kind: 'research',
    title: 'Research pipeline',
    buildNodes: ({ objective }) => [
      node({
        id: 'gather',
        title: 'Gather evidence',
        role: 'researcher',
        objective,
        dependsOn: [],
        locks: [],
        readOnly: true,
      }),
      node({
        id: 'synthesize',
        title: 'Synthesize',
        role: 'strategist',
        objective,
        dependsOn: ['gather'],
        locks: [],
        readOnly: true,
      }),
      node({
        id: 'verify',
        title: 'Verify sources',
        role: 'reviewer',
        objective,
        dependsOn: ['synthesize'],
        locks: [],
        readOnly: true,
      }),
    ],
  },
  qa: {
    kind: 'qa',
    title: 'QA pipeline',
    buildNodes: ({ objective }) => [
      node({
        id: 'reproduce',
        title: 'Reproduce',
        role: 'qa',
        objective,
        dependsOn: [],
        locks: [],
        readOnly: true,
      }),
      node({
        id: 'verify',
        title: 'Verify fix',
        role: 'qa',
        objective,
        dependsOn: ['reproduce'],
        locks: [],
        readOnly: true,
      }),
      node({
        id: 'report',
        title: 'Report',
        role: 'reviewer',
        objective,
        dependsOn: ['verify'],
        locks: [],
        readOnly: true,
      }),
    ],
  },
  release: {
    kind: 'release',
    title: 'Release pipeline',
    buildNodes: ({ objective }) => [
      node({
        id: 'build',
        title: 'Build',
        role: 'builder',
        objective,
        dependsOn: [],
        locks: ['repository:write'],
        readOnly: false,
      }),
      node({
        id: 'test',
        title: 'Test',
        role: 'qa',
        objective,
        dependsOn: ['build'],
        locks: [],
        readOnly: true,
      }),
      node({
        id: 'review',
        title: 'Release review',
        role: 'reviewer',
        objective,
        dependsOn: ['test'],
        locks: [],
        readOnly: true,
      }),
      node({
        id: 'approve',
        title: 'Human approval',
        role: 'orchestrator',
        objective,
        dependsOn: ['review'],
        locks: [],
        readOnly: true,
      }),
      node({
        id: 'prepare',
        title: 'Prepare release',
        role: 'builder',
        objective,
        dependsOn: ['approve'],
        locks: ['repository:write'],
        readOnly: false,
      }),
    ],
  },
  maintenance: {
    kind: 'maintenance',
    title: 'Maintenance pipeline',
    buildNodes: ({ objective }) => [
      node({
        id: 'inspect',
        title: 'Inspect',
        role: 'ops-watch',
        objective,
        dependsOn: [],
        locks: [],
        readOnly: true,
      }),
      node({
        id: 'repair',
        title: 'Repair',
        role: 'maintainer',
        objective,
        dependsOn: ['inspect'],
        locks: ['repository:write'],
        readOnly: false,
      }),
      node({
        id: 'verify',
        title: 'Verify',
        role: 'qa',
        objective,
        dependsOn: ['repair'],
        locks: [],
        readOnly: true,
      }),
    ],
  },
}

function clipText(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trim()}…`
}

export function buildMissionFromTemplate(input: {
  id: string
  objective: string
  template?: MissionTemplateKind
  maxParallelism?: number
}): Mission {
  const selected = MISSION_TEMPLATES[input.template ?? 'coding']
  const defaultMax = selected.kind === 'research' ? 3 : 1
  const maxParallelism = Math.max(
    1,
    Math.min(20, input.maxParallelism ?? defaultMax),
  )
  return {
    id: input.id,
    title: `${selected.title}: ${clipText(input.objective, 80)}`,
    version: 1,
    maxParallelism,
    nodes: selected.buildNodes({
      missionId: input.id,
      objective: input.objective,
    }),
  }
}
