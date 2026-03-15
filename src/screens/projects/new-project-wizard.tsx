import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  File01Icon,
  Folder01Icon,
  Upload01Icon,
} from '@hugeicons/core-free-icons'
import type React from 'react'
import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  extractAgents,
  extractDecomposeResponse,
  extractProject,
  normalizePhase,
  type WorkspaceAgent,
} from './lib/workspace-types'
import { ACCEPTED_SPEC_FILE_TYPES, readSpecFile } from './lib/spec-file'

type WizardStep = 1 | 2 | 3 | 4 | 5
type SquadPresetId = 'full-stack' | 'speed' | 'secure' | 'custom'
type WorkspaceMode = 'worktree' | 'directory'
type RequiredCheck = 'tsc' | 'tests' | 'lint' | 'e2e'

type PolicyState = {
  autoApprove: boolean
  requiredChecks: RequiredCheck[]
  maxConcurrent: number
  workspaceMode: WorkspaceMode
}

type AgentAssignment = {
  key: string
  badge: string
  emoji: string
  name: string
  detail: string
  id?: string
}

type SquadPreset = {
  id: SquadPresetId
  emoji: string
  name: string
  description: string
}

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 1, label: 'Source' },
  { id: 2, label: 'Spec' },
  { id: 3, label: 'Agents' },
  { id: 4, label: 'Policies' },
  { id: 5, label: 'Create' },
]

const PRESETS: SquadPreset[] = [
  {
    id: 'full-stack',
    emoji: '🏗️',
    name: 'Full Stack',
    description: 'Builder + Reviewer + QA',
  },
  {
    id: 'speed',
    emoji: '⚡',
    name: 'Speed',
    description: '2x Builders + QA',
  },
  {
    id: 'secure',
    emoji: '🔒',
    name: 'Secure',
    description: 'Builder + Security + QA',
  },
  {
    id: 'custom',
    emoji: '⚙️',
    name: 'Custom',
    description: 'Pick agents manually',
  },
]

const CHECK_OPTIONS: Array<{ id: RequiredCheck; label: string }> = [
  { id: 'tsc', label: 'tsc' },
  { id: 'tests', label: 'tests' },
  { id: 'lint', label: 'lint' },
  { id: 'e2e', label: 'e2e' },
]

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function apiRequest(input: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(input, init)
  const payload = await readPayload(response)

  if (!response.ok) {
    const record = readRecord(payload)
    throw new Error(
      (typeof record?.error === 'string' && record.error) ||
        (typeof record?.message === 'string' && record.message) ||
        `Request failed with status ${response.status}`,
    )
  }

  return payload
}

function getAgentEmoji(agent: WorkspaceAgent): string {
  const text = `${agent.name} ${agent.role ?? ''}`.toLowerCase()
  if (text.includes('qa') || text.includes('review')) return '🔍'
  if (text.includes('security')) return '🔒'
  if (text.includes('orchestrator')) return '⚡'
  if (text.includes('claude')) return '🧠'
  if (text.includes('forge')) return '🔧'
  return '🤖'
}

function isQaAgent(agent: WorkspaceAgent): boolean {
  const text = `${agent.name} ${agent.role ?? ''}`.toLowerCase()
  return text.includes('qa') || text.includes('review')
}

function isSecurityAgent(agent: WorkspaceAgent): boolean {
  const text = `${agent.name} ${agent.role ?? ''}`.toLowerCase()
  return text.includes('security')
}

function isBuilderAgent(agent: WorkspaceAgent): boolean {
  if (isQaAgent(agent) || isSecurityAgent(agent)) return false
  const text = `${agent.name} ${agent.role ?? ''}`.toLowerCase()
  return (
    text.includes('build') ||
    text.includes('backend') ||
    text.includes('full-stack') ||
    text.includes('full stack') ||
    text.includes('coder') ||
    text.includes('heavy')
  )
}

function toAssignment(
  agent: WorkspaceAgent | undefined,
  fallback: Omit<AgentAssignment, 'id'>,
): AgentAssignment {
  if (!agent) return fallback
  return {
    key: fallback.key,
    badge: fallback.badge,
    emoji: getAgentEmoji(agent),
    name: agent.name,
    detail:
      [agent.role, agent.adapter_type].filter(Boolean).join(' · ') ||
      'Assigned agent',
    id: agent.id,
  }
}

function getPresetAssignments(
  preset: SquadPresetId,
  agents: WorkspaceAgent[],
  customAgentIds: string[],
): AgentAssignment[] {
  if (preset === 'custom') {
    return customAgentIds
      .map((id) => agents.find((agent) => agent.id === id))
      .filter((agent): agent is WorkspaceAgent => Boolean(agent))
      .map((agent, index) => ({
        key: `custom-${agent.id}`,
        badge: index === 0 ? 'selected' : 'custom',
        emoji: getAgentEmoji(agent),
        name: agent.name,
        detail:
          [agent.role, agent.adapter_type].filter(Boolean).join(' · ') ||
          'Assigned agent',
        id: agent.id,
      }))
  }

  const builders = agents.filter(isBuilderAgent)
  const qa = agents.find(isQaAgent)
  const reviewer = agents.find(
    (agent) =>
      `${agent.name} ${agent.role ?? ''}`.toLowerCase().includes('claude') ||
      isQaAgent(agent),
  )
  const security = agents.find(isSecurityAgent)

  if (preset === 'speed') {
    return [
      toAssignment(builders[0], {
        key: 'speed-builder-1',
        badge: 'primary',
        emoji: '🤖',
        name: 'Builder',
        detail: 'Primary builder',
      }),
      toAssignment(builders[1] ?? builders[0], {
        key: 'speed-builder-2',
        badge: 'secondary',
        emoji: '🧠',
        name: 'Builder',
        detail: 'Secondary builder',
      }),
      toAssignment(qa, {
        key: 'speed-qa',
        badge: 'reviewer',
        emoji: '🔍',
        name: 'QA Agent',
        detail: 'Review and verification',
      }),
    ]
  }

  if (preset === 'secure') {
    return [
      toAssignment(builders[0], {
        key: 'secure-builder',
        badge: 'primary',
        emoji: '🤖',
        name: 'Builder',
        detail: 'Primary builder',
      }),
      toAssignment(security, {
        key: 'secure-security',
        badge: 'security',
        emoji: '🔒',
        name: 'Security Agent',
        detail: 'Security review slot',
      }),
      toAssignment(qa, {
        key: 'secure-qa',
        badge: 'reviewer',
        emoji: '🔍',
        name: 'QA Agent',
        detail: 'Review and verification',
      }),
    ]
  }

  return [
    toAssignment(builders[0], {
      key: 'full-builder',
      badge: 'primary',
      emoji: '🤖',
      name: 'Builder',
      detail: 'Primary builder',
    }),
    toAssignment(reviewer, {
      key: 'full-reviewer',
      badge: 'secondary',
      emoji: '🧠',
      name: 'Reviewer',
      detail: 'Full-stack reviewer',
    }),
    toAssignment(qa, {
      key: 'full-qa',
      badge: 'reviewer',
      emoji: '🔍',
      name: 'QA Agent',
      detail: 'Review and verification',
    }),
  ]
}

function getBadgeClass(badge: string): string {
  if (badge === 'primary')
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  if (badge === 'secondary')
    return 'border-violet-500/30 bg-violet-500/10 text-violet-300'
  if (badge === 'reviewer')
    return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
  if (badge === 'security')
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  return 'border-primary-200 bg-primary-50 text-primary-900'
}

function WizardField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-500">
          {label}
        </span>
        {hint ? <span className="text-xs text-primary-500">{hint}</span> : null}
      </div>
      {children}
    </label>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-primary-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-500">
        {label}
      </span>
      <span className="text-sm text-primary-900 sm:text-right">{value}</span>
    </div>
  )
}

export function NewProjectWizard() {
  const navigate = useNavigate()

  return (
    <NewProjectWizardContent
      routePath="/projects"
      onClose={() => void navigate({ to: '/projects' })}
    />
  )
}

type NewProjectWizardContentProps = {
  routePath?: '/projects' | '/workspace'
  onClose?: () => void
}

export function NewProjectWizardContent({
  routePath = '/projects',
  onClose,
}: NewProjectWizardContentProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [step, setStep] = useState<WizardStep>(1)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [spec, setSpec] = useState('')
  const [preset, setPreset] = useState<SquadPresetId>('full-stack')
  const [customAgentIds, setCustomAgentIds] = useState<string[]>([])
  const [policy, setPolicy] = useState<PolicyState>({
    autoApprove: false,
    requiredChecks: ['tsc'],
    maxConcurrent: 2,
    workspaceMode: 'worktree',
  })
  const [submissionStage, setSubmissionStage] = useState<
    'idle' | 'creating' | 'decomposing'
  >('idle')

  const agentsQuery = useQuery({
    queryKey: ['workspace', 'agents', 'wizard'],
    queryFn: async () =>
      extractAgents(await apiRequest('/api/workspace/agents')),
  })

  const assignedAgents = getPresetAssignments(
    preset,
    agentsQuery.data ?? [],
    customAgentIds,
  )
  const specLength = spec.length

  function goToStep(nextStep: WizardStep) {
    setStep(nextStep)
  }

  function validateStep(currentStep: WizardStep): boolean {
    if (currentStep === 1 && !name.trim()) {
      toast('Project name is required', { type: 'warning' })
      return false
    }
    if (
      currentStep === 3 &&
      preset === 'custom' &&
      customAgentIds.length === 0
    ) {
      toast('Select at least one agent for a custom squad', { type: 'warning' })
      return false
    }
    if (currentStep === 4 && policy.maxConcurrent < 1) {
      toast('Max concurrent agents must be at least 1', { type: 'warning' })
      return false
    }
    return true
  }

  function handleNext() {
    if (!validateStep(step)) return
    if (step < 5) goToStep((step + 1) as WizardStep)
  }

  function handleBack() {
    if (step > 1) goToStep((step - 1) as WizardStep)
  }

  async function handleSpecFileSelect(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const nextSpec = await readSpecFile(file)
      setSpec(nextSpec)
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Failed to read spec file',
        {
          type: 'error',
        },
      )
    }
  }

  function toggleCustomAgent(agentId: string) {
    setCustomAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId],
    )
  }

  function toggleCheck(check: RequiredCheck) {
    setPolicy((current) => {
      const nextChecks = current.requiredChecks.includes(check)
        ? current.requiredChecks.filter((item) => item !== check)
        : [...current.requiredChecks, check]

      return {
        ...current,
        requiredChecks:
          nextChecks.length > 0 ? nextChecks : current.requiredChecks,
      }
    })
  }

  async function handleCreateProject() {
    if (!validateStep(5)) return

    try {
      setSubmissionStage('creating')
      const project = extractProject(
        await apiRequest('/api/workspace/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            path: path.trim() || undefined,
            spec: spec.trim() || undefined,
            auto_approve: policy.autoApprove,
            max_concurrent: Math.max(1, Math.trunc(policy.maxConcurrent)),
            required_checks: policy.requiredChecks,
            allowed_tools: ['git', 'shell'],
          }),
        }),
      )

      if (!project) {
        throw new Error('Project creation returned an empty response')
      }

      if (!spec.trim()) {
        toast('Project created', { type: 'success' })
        await navigate({
          to: routePath,
          search: { projectId: project.id },
        })
        return
      }

      const phase = normalizePhase(
        await apiRequest('/api/workspace/phases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: project.id,
            name: 'Initial Build',
            sort_order: 0,
          }),
        }),
      )

      setSubmissionStage('decomposing')
      const decomposeResult = extractDecomposeResponse(
        await apiRequest('/api/workspace/decompose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goal: spec.trim(),
            project_id: project.id,
          }),
        }),
      )

      if (decomposeResult.tasks.length === 0) {
        throw new Error('Decompose returned no tasks')
      }

      toast('Project created and decomposed', { type: 'success' })
      await navigate({
        to: '/plan-review',
        search: {
          plan: JSON.stringify({
            goal: spec.trim(),
            projectId: project.id,
            projectName: project.name,
            phaseId: phase.id,
            phaseName: phase.name,
            tasks: decomposeResult.tasks,
          }),
          missionId: undefined,
          projectId: undefined,
        },
      })
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Failed to create project',
        {
          type: 'error',
        },
      )
    } finally {
      setSubmissionStage('idle')
    }
  }

  return (
    <main className="min-h-full bg-surface px-4 py-6 text-primary-900 md:px-6 md:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-primary-900">
              New Project
            </h1>
            <p className="mt-1 text-sm text-primary-500">
              Set up a new project in 5 steps.
            </p>
          </div>
          <Button
            variant="outline"
            className="border-primary-200 bg-white text-primary-900 hover:bg-primary-50"
            onClick={() => {
              if (onClose) {
                onClose()
                return
              }
              void navigate({ to: routePath })
            }}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.8} />
            Back to Projects
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          {STEPS.map((entry) => {
            const state =
              entry.id < step
                ? 'done'
                : entry.id === step
                  ? 'active'
                  : 'pending'

            const isClickable = state === 'done'

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  if (isClickable) goToStep(entry.id)
                }}
                disabled={!isClickable}
                aria-current={state === 'active' ? 'step' : undefined}
                className={cn(
                  'rounded-2xl border px-4 py-3 text-left transition-colors',
                  state === 'done' &&
                    'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/40 hover:bg-emerald-500/15',
                  state === 'active' &&
                    'border-accent-500/40 bg-accent-500/10 text-accent-300',
                  state === 'pending' &&
                    'border-primary-200 bg-white text-primary-500',
                  !isClickable && 'cursor-default',
                  isClickable && 'cursor-pointer',
                )}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span>{state === 'done' ? '✓' : `${entry.id}.`}</span>
                  <span>{entry.label}</span>
                  {state === 'done' ? (
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>

        {step > 1 ? (
          <div className="grid gap-3">
            <SummaryRow
              label="Step 1"
              value={
                name.trim()
                  ? `${name.trim()}${path.trim() ? ` · ${path.trim()}` : ''}`
                  : 'Source pending'
              }
            />
            <SummaryRow
              label="Step 2"
              value={
                spec.trim()
                  ? `${spec.trim().slice(0, 96)}${spec.trim().length > 96 ? '…' : ''}`
                  : 'Spec skipped'
              }
            />
          </div>
        ) : null}

        <section className="rounded-[28px] border border-primary-200 bg-primary-50/80 p-5 shadow-sm md:p-7">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              {step === 1 ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-500">
                      Step 1
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-primary-900">
                      Source
                    </h2>
                    <p className="mt-1 text-sm text-primary-500">
                      Start with the project identity and working directory.
                    </p>
                  </div>

                  <div className="grid gap-5">
                    <WizardField label="Project Name">
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Hermes Workspace Workspace Refresh"
                        autoFocus
                        className="w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
                      />
                    </WizardField>

                    <WizardField
                      label="Local Path"
                      hint="Paste an absolute path from Finder or Terminal"
                    >
                      <div className="space-y-2">
                        <div className="rounded-2xl border border-primary-200 bg-primary-50 p-1">
                          <div className="flex items-center gap-3 rounded-[18px] border border-primary-200 bg-white px-3 py-3">
                            <HugeiconsIcon
                              icon={Folder01Icon}
                              size={18}
                              strokeWidth={1.7}
                              className="text-primary-500"
                            />
                            <input
                              value={path}
                              onChange={(event) => setPath(event.target.value)}
                              placeholder="/Users/aurora/.openclaw/workspace/clawsuite"
                              className="w-full bg-transparent text-sm text-primary-900 outline-none placeholder:text-primary-500"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-primary-500">
                          This is the local path to your codebase. Leave blank to
                          create a new workspace.
                        </p>
                      </div>
                    </WizardField>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-500">
                      Step 2
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-primary-900">
                      Spec
                    </h2>
                    <p className="mt-1 text-sm text-primary-500">
                      Paste your PRD, spec, or a concise build brief.
                    </p>
                  </div>

                  <WizardField
                    label="Build Brief"
                    hint={`${specLength} characters`}
                  >
                    <div className="space-y-3">
                      <textarea
                        value={spec}
                        onChange={(event) => setSpec(event.target.value)}
                        rows={12}
                        placeholder="Paste your PRD, spec, or describe what you want to build"
                        className="w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
                      />
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED_SPEC_FILE_TYPES}
                        className="hidden"
                        onChange={(event) => void handleSpecFileSelect(event)}
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-primary-200 bg-white text-primary-900 hover:bg-primary-50"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <HugeiconsIcon
                            icon={Upload01Icon}
                            size={16}
                            strokeWidth={1.8}
                          />
                          Upload `.md` or `.txt`
                        </Button>
                        <button
                          type="button"
                          className="text-sm font-medium text-primary-500 transition-colors hover:text-primary-900"
                          onClick={() => setSpec('')}
                        >
                          Skip for now
                        </button>
                      </div>
                      <p className="text-xs text-primary-500">
                        Paste your PRD, feature spec, or just describe what you
                        want built. More detail = better task breakdown.
                      </p>
                    </div>
                  </WizardField>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-500">
                      Step 3
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-primary-900">
                      Agent Squad
                    </h2>
                    <p className="mt-1 text-sm text-primary-500">
                      Choose a squad template or customize the roster.
                    </p>
                    <p className="mt-2 text-xs text-primary-500">
                      Full Stack is recommended for most projects. You can
                      customize agents after creation.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {PRESETS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setPreset(option.id)}
                        className={cn(
                          'rounded-2xl border px-4 py-4 text-left transition-all',
                          preset === option.id
                            ? 'border-accent-500/50 bg-accent-500/10 shadow-lg shadow-accent-500/10'
                            : 'border-primary-200 bg-white hover:border-primary-300 hover:bg-primary-50',
                        )}
                      >
                        <div className="text-2xl">{option.emoji}</div>
                        <div className="mt-3 text-base font-semibold text-primary-900">
                          {option.name}
                        </div>
                        <div className="mt-1 text-sm text-primary-500">
                          {option.description}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-500">
                        Assigned Agents
                      </p>
                    </div>

                    <div className="flex flex-col gap-3">
                      {assignedAgents.length > 0 ? (
                        assignedAgents.map((agent) => (
                          <div
                            key={agent.key}
                            className="flex items-center gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3"
                          >
                            <span className="text-xl">{agent.emoji}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-primary-900">
                                {agent.name}
                              </p>
                              <p className="truncate text-xs text-primary-500">
                                {agent.detail}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]',
                                getBadgeClass(agent.badge),
                              )}
                            >
                              {agent.badge}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-primary-200 bg-white px-4 py-5 text-sm text-primary-500">
                          Pick one or more agents to build a custom squad.
                        </div>
                      )}
                    </div>
                  </div>

                  {preset === 'custom' ? (
                    <div className="space-y-3 rounded-2xl border border-primary-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-primary-900">
                            Custom Picker
                          </p>
                          <p className="text-xs text-primary-500">
                            Loaded from `/api/workspace/agents`
                          </p>
                        </div>
                        {agentsQuery.isLoading ? (
                          <span className="text-xs text-primary-500">
                            Loading agents…
                          </span>
                        ) : null}
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {(agentsQuery.data ?? []).map((agent) => {
                          const selected = customAgentIds.includes(agent.id)
                          return (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => toggleCustomAgent(agent.id)}
                              className={cn(
                                'flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                                selected
                                  ? 'border-accent-500/50 bg-accent-500/10'
                                  : 'border-primary-200 bg-primary-50 hover:border-primary-300 hover:bg-white',
                              )}
                            >
                              <div
                                className={cn(
                                  'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[11px]',
                                  selected
                                    ? 'border-accent-500 bg-accent-500 text-white'
                                    : 'border-primary-200 text-transparent',
                                )}
                              >
                                ✓
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-primary-900">
                                  {agent.name}
                                </p>
                                <p className="truncate text-xs text-primary-500">
                                  {[
                                    agent.role,
                                    agent.adapter_type,
                                    agent.status,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {step === 4 ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-500">
                      Step 4
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-primary-900">
                      Policies
                    </h2>
                    <p className="mt-1 text-sm text-primary-500">
                      Configure approval mode, checks, concurrency, and
                      workspace execution mode.
                    </p>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="space-y-5 rounded-2xl border border-primary-200 bg-white p-4">
                      <WizardField label="Approval Mode">
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: true, label: 'Auto-approve' },
                            { value: false, label: 'Manual review' },
                          ].map((option) => (
                            <button
                              key={option.label}
                              type="button"
                              onClick={() =>
                                setPolicy((current) => ({
                                  ...current,
                                  autoApprove: option.value,
                                }))
                              }
                              className={cn(
                                'rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors',
                                policy.autoApprove === option.value
                                  ? 'border-accent-500/50 bg-accent-500/10 text-accent-300'
                                  : 'border-primary-200 bg-primary-50 text-primary-900 hover:bg-white',
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </WizardField>

                      <WizardField label="Max Concurrent Agents">
                        <input
                          type="number"
                          min={1}
                          value={policy.maxConcurrent}
                          onChange={(event) =>
                            setPolicy((current) => ({
                              ...current,
                              maxConcurrent: Math.max(
                                1,
                                Number(event.target.value) || 1,
                              ),
                            }))
                          }
                          className="w-full rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
                        />
                      </WizardField>
                    </div>

                    <div className="space-y-5 rounded-2xl border border-primary-200 bg-white p-4">
                      <WizardField label="Required Checks">
                        <div className="grid grid-cols-2 gap-2">
                          {CHECK_OPTIONS.map((check) => {
                            const selected = policy.requiredChecks.includes(
                              check.id,
                            )
                            return (
                              <button
                                key={check.id}
                                type="button"
                                onClick={() => toggleCheck(check.id)}
                                className={cn(
                                  'flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-colors',
                                  selected
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                    : 'border-primary-200 bg-primary-50 text-primary-900 hover:bg-white',
                                )}
                              >
                                <span>{check.label}</span>
                                <span>{selected ? '✓' : ''}</span>
                              </button>
                            )
                          })}
                        </div>
                      </WizardField>

                      <WizardField label="Workspace Mode">
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'worktree' as const, label: 'Git worktree' },
                            { id: 'directory' as const, label: 'Directory' },
                          ].map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() =>
                                setPolicy((current) => ({
                                  ...current,
                                  workspaceMode: option.id,
                                }))
                              }
                              className={cn(
                                'rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors',
                                policy.workspaceMode === option.id
                                  ? 'border-accent-500/50 bg-accent-500/10 text-accent-300'
                                  : 'border-primary-200 bg-primary-50 text-primary-900 hover:bg-white',
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </WizardField>
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 5 ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-500">
                      Step 5
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-primary-900">
                      Create + Decompose
                    </h2>
                    <p className="mt-1 text-sm text-primary-500">
                      Review the setup, create the project, and generate a plan
                      if a spec is present.
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-3">
                      <SummaryRow
                        label="Project"
                        value={name.trim() || 'Untitled project'}
                      />
                      <SummaryRow
                        label="Path"
                        value={path.trim() || 'No local path yet'}
                      />
                      <SummaryRow
                        label="Spec"
                        value={
                          spec.trim()
                            ? `${specLength} characters provided`
                            : 'Skipped'
                        }
                      />
                      <SummaryRow
                        label="Squad"
                        value={
                          assignedAgents.length > 0
                            ? assignedAgents
                                .map((agent) => agent.name)
                                .join(', ')
                            : 'No agents selected'
                        }
                      />
                      <SummaryRow
                        label="Approval"
                        value={
                          policy.autoApprove ? 'Auto-approve' : 'Manual review'
                        }
                      />
                      <SummaryRow
                        label="Checks"
                        value={policy.requiredChecks.join(', ')}
                      />
                      <SummaryRow
                        label="Concurrency"
                        value={`${policy.maxConcurrent} agent${policy.maxConcurrent === 1 ? '' : 's'} max`}
                      />
                      <SummaryRow
                        label="Workspace"
                        value={
                          policy.workspaceMode === 'worktree'
                            ? 'Git worktree'
                            : 'Directory'
                        }
                      />
                    </div>

                    <div className="rounded-[24px] border border-primary-200 bg-white p-5">
                      <p className="text-sm font-semibold text-primary-900">
                        Launch behavior
                      </p>
                      <div className="mt-4 space-y-3 text-sm text-primary-500">
                        <div className="flex items-start gap-3">
                          <HugeiconsIcon
                            icon={Folder01Icon}
                            size={18}
                            strokeWidth={1.7}
                            className="mt-0.5 text-accent-300"
                          />
                          <p>
                            Creates the project record with the selected policy
                            controls.
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <HugeiconsIcon
                            icon={File01Icon}
                            size={18}
                            strokeWidth={1.7}
                            className="mt-0.5 text-accent-300"
                          />
                          <p>
                            {spec.trim()
                              ? 'Creates an initial phase, runs decompose, and opens plan review.'
                              : 'No spec provided, so project creation will finish without decomposition.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex flex-col gap-3 border-t border-primary-200 pt-5 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="border-primary-200 bg-white text-primary-900 hover:bg-primary-50 sm:flex-1"
              onClick={handleBack}
              disabled={step === 1 || submissionStage !== 'idle'}
            >
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                size={16}
                strokeWidth={1.8}
              />
              Back
            </Button>

            {step < 5 ? (
              <Button
                type="button"
                className="bg-accent-500 text-white hover:bg-accent-400 sm:flex-[1.4]"
                onClick={handleNext}
              >
                Next
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={16}
                  strokeWidth={1.8}
                />
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-accent-500 text-white hover:bg-accent-400 sm:flex-[1.4]"
                onClick={() => void handleCreateProject()}
                disabled={submissionStage !== 'idle'}
              >
                {submissionStage === 'creating'
                  ? 'Creating Project…'
                  : submissionStage === 'decomposing'
                    ? 'Decomposing…'
                    : 'Create Project'}
              </Button>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
