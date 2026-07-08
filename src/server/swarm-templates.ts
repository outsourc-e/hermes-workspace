/**
 * Workflow templates: saved pipeline recipes runnable in one click.
 *
 * A template is a named, parameterized pipeline: `{{input}}` in any task
 * text is replaced with the operator's input at run time. Stored in
 * .runtime/swarm-templates.json; seeded with a starter set on first read.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { SWARM_CANONICAL_REPO } from './swarm-environment'
import type { PipelineStage } from './swarm-pipeline'

export type SwarmTemplate = {
  id: string
  name: string
  description: string
  stages: Array<PipelineStage>
}

export function templatesPath(): string {
  return (
    process.env.HERMES_SWARM_TEMPLATES_PATH ||
    join(SWARM_CANONICAL_REPO, '.runtime', 'swarm-templates.json')
  )
}

const SEED: Array<SwarmTemplate> = [
  {
    id: 'ship-feature',
    name: 'Ship a feature',
    description: 'research → build → QA → review, end to end',
    stages: [
      {
        label: 'Research',
        assignments: [
          {
            workerId: 'researcher',
            task: 'Research how to implement: {{input}}. Survey the relevant code in ~/hermes-workspace, list the files to touch, risks, and a concrete implementation sketch.',
          },
        ],
      },
      {
        label: 'Build',
        assignments: [
          {
            workerId: 'builder',
            task: 'Implement: {{input}}. Use the research from the previous stage. Work in an isolated git worktree, never switch the live repo branch. Add tests.',
          },
        ],
      },
      {
        label: 'Verify',
        assignments: [
          {
            workerId: 'qa',
            task: 'Test the implementation of: {{input}} from the previous stage. Run the affected tests and exercise the feature. Report pass/fail with evidence.',
          },
          {
            workerId: 'reviewer',
            task: 'Review the implementation of: {{input}} from the previous stage for correctness and safety. Verdict + concrete issues.',
          },
        ],
      },
    ],
  },
  {
    id: 'security-audit',
    name: 'Security audit',
    description: 'audit a target, verify findings',
    stages: [
      {
        label: 'Audit',
        assignments: [
          {
            workerId: 'security-auditor',
            task: 'Security audit: {{input}}. Prioritized findings with file paths and remediations. Do not change files.',
          },
        ],
      },
      {
        label: 'Verify',
        assignments: [
          {
            workerId: 'reviewer',
            task: 'Adversarially verify the security findings from the previous stage about: {{input}}. Confirm or refute each with evidence.',
          },
        ],
      },
    ],
  },
  {
    id: 'deep-research',
    name: 'Deep research',
    description: 'two researchers in parallel, then synthesis',
    stages: [
      {
        label: 'Investigate',
        assignments: [
          {
            workerId: 'researcher',
            task: 'Research thoroughly: {{input}}. Cite sources.',
          },
          {
            workerId: 'scout',
            task: 'Research from a different angle (recent news, ecosystem, competition): {{input}}. Cite sources.',
          },
        ],
      },
      {
        label: 'Synthesize',
        assignments: [
          {
            workerId: 'km-agent',
            task: 'Synthesize the two research results from the previous stage about: {{input}} into one vault note under vault/reports/ with a clear recommendation.',
          },
        ],
      },
    ],
  },
]

export function listTemplates(): Array<SwarmTemplate> {
  try {
    if (existsSync(templatesPath())) {
      const parsed = JSON.parse(readFileSync(templatesPath(), 'utf8')) as {
        templates?: Array<SwarmTemplate>
      }
      if (Array.isArray(parsed.templates) && parsed.templates.length) {
        return parsed.templates
      }
    }
  } catch {
    /* reseed */
  }
  mkdirSync(dirname(templatesPath()), { recursive: true })
  writeFileSync(templatesPath(), JSON.stringify({ templates: SEED }, null, 2))
  return SEED
}

/** Materialize a template's stages with the operator input substituted. */
export function renderTemplate(
  id: string,
  input: string,
): { title: string; stages: Array<PipelineStage> } | null {
  const template = listTemplates().find((t) => t.id === id)
  if (!template) return null
  const sub = (text: string) => text.replaceAll('{{input}}', input.trim())
  return {
    title: `${template.name}: ${input.trim().slice(0, 80)}`,
    stages: template.stages.map((stage) => ({
      label: stage.label,
      assignments: stage.assignments.map((a) => ({
        ...a,
        task: sub(a.task),
      })),
    })),
  }
}
