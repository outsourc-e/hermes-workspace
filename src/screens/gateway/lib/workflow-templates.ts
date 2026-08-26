export type WorkflowTemplate = {
  id: string
  name: string
  description: string
  icon: string
  goal: string
  tags?: string[]
  teamConfigId?: string
  tasks: Array<{
    title: string
    description?: string
  }>
  createdAt: number
  updatedAt: number
  isBuiltIn?: boolean
}

const STORAGE_KEY = 'clawsuite:workflow-templates'

// Built-in templates that ship with ClawSuite
export const BUILT_IN_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'tpl-code-review',
    name: 'Code Review',
    description: 'Review codebase for bugs, performance issues, and code quality',
    icon: '🔍',
    goal: 'Review the codebase for bugs, performance issues, and code quality improvements',
    tags: ['review', 'quality', 'audit'],
    tasks: [
      { title: 'Read all source files and understand architecture' },
      { title: 'Identify bugs and logic errors' },
      { title: 'Check for security vulnerabilities' },
      { title: 'Suggest code quality improvements' },
      { title: 'Write summary report with prioritized findings' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-bug-fix',
    name: 'Bug Fix',
    description: 'Diagnose and fix a specific bug with tests',
    icon: '🐛',
    goal: 'Investigate the reported bug, identify the root cause, implement a fix, and verify it works. Write tests if appropriate.',
    tasks: [
      { title: 'Reproduce the bug and understand the symptoms' },
      { title: 'Trace the code path to find root cause' },
      { title: 'Implement the fix' },
      { title: 'Run type check (npx tsc --noEmit)' },
      { title: 'Commit with descriptive message' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-feature-build',
    name: 'Feature Build',
    description: 'Plan and implement a new feature end-to-end',
    icon: '🏗️',
    goal: 'Plan, implement, test, and document the new feature',
    tags: ['build', 'feature', 'implementation'],
    tasks: [
      { title: 'Analyze existing code patterns and architecture' },
      { title: 'Create new files and components' },
      { title: 'Wire up routes, state management, and API calls' },
      { title: 'Add error handling and edge cases' },
      { title: 'Run type check and fix any issues' },
      { title: 'Commit and push' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-research',
    name: 'Research & Analysis',
    description: 'Research a topic and produce a structured report',
    icon: '📊',
    goal: 'Research the given topic thoroughly. Analyze findings and produce a structured report with key insights, comparisons, and recommendations.',
    tasks: [
      { title: 'Search for relevant sources and documentation' },
      { title: 'Analyze and compare approaches' },
      { title: 'Write structured findings report' },
      { title: 'Add recommendations section' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-refactor',
    name: 'Refactor',
    description: 'Refactor code for better organization, performance, or readability',
    icon: '♻️',
    goal: 'Refactor the specified code area to improve organization, reduce complexity, and maintain existing functionality. No behavioral changes.',
    tasks: [
      { title: 'Read and understand current implementation' },
      { title: 'Identify refactoring opportunities' },
      { title: 'Implement changes incrementally' },
      { title: 'Verify no behavioral changes (type check + manual review)' },
      { title: 'Commit with clear refactoring message' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-audit',
    name: 'Security Audit',
    description: 'Audit codebase for security vulnerabilities and best practices',
    icon: '🛡️',
    goal: 'Perform a security audit of the codebase. Check for common vulnerabilities (XSS, injection, auth bypass, secrets exposure, dependency issues). Produce a severity-ranked report.',
    tasks: [
      { title: 'Scan for hardcoded secrets and API keys' },
      { title: 'Check input validation and sanitization' },
      { title: 'Review authentication and authorization flows' },
      { title: 'Check dependency vulnerabilities' },
      { title: 'Write security audit report with severity ratings' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-swarm-topology-dashboard',
    name: 'Visual Swarm Topology Dashboard',
    description: 'Map workers, dependencies, and token flow in real time',
    icon: '🕸️',
    goal: 'Build a live, clickable swarm topology view with worker state, dependency edges, and token flow so humans can supervise complex missions.',
    tags: ['swarm', 'dashboard', 'oversight', 'copilotkit'],
    tasks: [
      { title: 'Model workers, edges, and token flow as a live graph' },
      { title: 'Build clickable nodes for worker drill-down' },
      { title: 'Surface worker state, dependencies, and health' },
      { title: 'Add human oversight affordances and alerts' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-self-evolution',
    name: 'Continuous Self-Evolution',
    description: 'Run post-project evolution automatically and score it',
    icon: '🧬',
    goal: 'Implement a continuous self-evolution loop that runs after every project, uses evaluation scores as fitness, and carries insights forward.',
    tags: ['evolution', 'evaluation', 'automation', 'fitness'],
    tasks: [
      { title: 'Trigger evolution after each project completion' },
      { title: 'Feed evaluation scores into fitness scoring' },
      { title: 'Persist reusable lessons and patterns' },
      { title: 'Apply cross-project insights to future missions' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-proactive-anomaly-cards',
    name: 'Proactive Anomaly Detection Cards',
    description: 'Alert humans early when token burn or patterns look off',
    icon: '🚨',
    goal: 'Show proactive anomaly cards when behavior, token burn, or alignment signals look suspicious so humans can intervene early.',
    tags: ['anomaly', 'alerts', 'governance', 'oversight'],
    tasks: [
      { title: 'Detect unusual token burn and behavioral spikes' },
      { title: 'Generate concise anomaly cards with context' },
      { title: 'Link cards to the underlying workers and traces' },
      { title: 'Offer escalation and approval actions' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-natural-language-governance',
    name: 'Natural Language Governance',
    description: 'Convert plain-English policy into machine rules',
    icon: '🧾',
    goal: 'Let operators write governance rules in plain English and translate them into enforceable .paperclip.yaml policy.',
    tags: ['governance', 'policy', 'nlp', 'approval'],
    tasks: [
      { title: 'Parse natural-language governance statements' },
      { title: 'Compile policy into structured rule files' },
      { title: 'Validate rules against unsafe or ambiguous cases' },
      { title: 'Expose approval workflows for sensitive changes' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-clipmart-valuation-listing',
    name: 'Automated Skill Valuation & Listing',
    description: 'Value internal skills and publish them to Clipmart',
    icon: '🏷️',
    goal: 'Evaluate internal skills, estimate fair pricing, and produce marketplace-ready listings with automated review gates.',
    tags: ['marketplace', 'valuation', 'skills', 'pricing'],
    tasks: [
      { title: 'Score skills based on utility, demand, and novelty' },
      { title: 'Estimate fair price bands and listing metadata' },
      { title: 'Draft marketplace descriptions and tags' },
      { title: 'Route sensitive listings through human approval' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-agent-economy-primitives',
    name: 'Agent Economy Primitives',
    description: 'Provision wallets, micropayments, and trust scoring',
    icon: '💸',
    goal: 'Add the primitives required for agent-to-agent commerce: wallets, micropayments, trust scoring, and transaction controls.',
    tags: ['economy', 'wallet', 'micropayments', 'trust'],
    tasks: [
      { title: 'Design wallet and micropayment flows' },
      { title: 'Add trust and reputation scoring surfaces' },
      { title: 'Define approval gates for financial changes' },
      { title: 'Create audit trails for every transfer' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-voice-multimodal',
    name: 'Voice + Multimodal Enablement',
    description: 'Add speech, vision, and hybrid interaction paths',
    icon: '🎙️',
    goal: 'Enable voice input/output, vision, and hybrid multimodal interaction paths for agents and operators.',
    tags: ['voice', 'vision', 'multimodal', 'audio'],
    tasks: [
      { title: 'Wire in speech input and output paths' },
      { title: 'Add vision-aware context capture' },
      { title: 'Allow hybrid keyboard/voice interaction' },
      { title: 'Add multimodal safety and fallback behavior' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-arvr-spatial',
    name: 'AR/VR Agent Interfaces',
    description: 'Prototype spatial and immersive agent interfaces',
    icon: '🕶️',
    goal: 'Prototype immersive agent interfaces for spatial computing targets such as Vision Pro and Quest-class devices.',
    tags: ['ar', 'vr', 'spatial', 'immersive'],
    tasks: [
      { title: 'Define spatial interaction and navigation patterns' },
      { title: 'Prototype immersive UI surfaces and layouts' },
      { title: 'Plan device capability fallbacks' },
      { title: 'Document ergonomics and privacy constraints' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-predictive-project-success',
    name: 'Predictive Project Success',
    description: 'Estimate success probability before a mission starts',
    icon: '📈',
    goal: 'Use evaluation history, swarm composition, and project metadata to predict success probability and recommend an optimal team.',
    tags: ['prediction', 'planning', 'evaluation', 'swarm'],
    tasks: [
      { title: 'Collect historical project and swarm features' },
      { title: 'Score likely success and risk factors' },
      { title: 'Recommend optimal team composition' },
      { title: 'Expose a pre-flight confidence report' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-self-healing-production',
    name: 'Self-Healing Production Systems',
    description: 'Diagnose and fix production issues with approval gates',
    icon: '🛠️',
    goal: 'Build proactive detection, diagnosis, and remediation flows for production issues with explicit human approval before impact.',
    tags: ['sre', 'incident', 'healing', 'automation'],
    tasks: [
      { title: 'Detect incidents and abnormal system states' },
      { title: 'Draft diagnosis and remediation proposals' },
      { title: 'Gate dangerous fixes behind approval' },
      { title: 'Record post-incident learning automatically' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-cross-company-federation',
    name: 'Cross-Company Swarm Federation',
    description: 'Temporarily federate trusted external agents',
    icon: '🧩',
    goal: 'Enable temporary federation of trusted agents from other companies or swarms with explicit permission boundaries and auditability.',
    tags: ['federation', 'trust', 'permissions', 'swarm'],
    tasks: [
      { title: 'Define permission and trust boundaries' },
      { title: 'Model temporary federation membership' },
      { title: 'Add audit logs and revocation paths' },
      { title: 'Support scoped cross-company collaboration' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-worker-reassignment',
    name: 'Intelligent Worker Reassignment',
    description: 'Rebalance work across agents with preservation of context',
    icon: '🔁',
    goal: 'Automatically rebalance work across agents based on skills, load, latency, and priority while preserving context and ownership history.',
    tags: ['swarm', 'routing', 'load-balancing', 'automation'],
    tasks: [
      { title: 'Model worker capability, load, and availability signals' },
      { title: 'Score reassignment candidates and preserve context' },
      { title: 'Add manual approval and rollback safeguards' },
      { title: 'Test reassignment under overload and failure scenarios' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-swarm-memory-sharing',
    name: 'Swarm Memory Sharing',
    description: 'Share summaries, artifacts, and learned context safely',
    icon: '🧠',
    goal: 'Create shared memory primitives so agents can reuse summaries, artifacts, decisions, and learned context safely across the swarm.',
    tags: ['memory', 'knowledge-sharing', 'swarm', 'context'],
    tasks: [
      { title: 'Define shared memory scopes and retention rules' },
      { title: 'Implement read/write paths for shared swarm memory' },
      { title: 'Add summarization, deduplication, and provenance tracking' },
      { title: 'Verify retrieval quality and access boundaries' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-cross-project-evolution',
    name: 'Cross-Project Evolution',
    description: 'Harvest patterns from one project and adapt them to others',
    icon: '🧬',
    goal: 'Harvest proven patterns from one project and adapt them into other projects, templates, or swarm configurations.',
    tags: ['multi-project', 'reuse', 'migration', 'pattern-extraction'],
    tasks: [
      { title: 'Scan multiple projects for reusable patterns and workflows' },
      { title: 'Score transferability and dependency risk' },
      { title: 'Adapt extracted patterns to the target project context' },
      { title: 'Validate imports with tests or dry-run simulations' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-autonomous-company-acquisition',
    name: 'Autonomous Company Acquisition',
    description: 'Run acquisition discovery, diligence, and integration planning',
    icon: '🏢',
    goal: 'Support an acquisition workflow from target discovery and due diligence through integration planning and post-merger execution.',
    tags: ['m&a', 'due-diligence', 'integration', 'strategy'],
    tasks: [
      { title: 'Identify acquisition targets and collect public diligence signals' },
      { title: 'Estimate strategic fit, valuation, and integration complexity' },
      { title: 'Draft diligence checklists, approvals, and risk registers' },
      { title: 'Build integration workstreams for systems, teams, and processes' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
]

export function loadCustomTemplates(): WorkflowTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as WorkflowTemplate[]
  } catch {
    return []
  }
}

export function saveCustomTemplates(templates: WorkflowTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch { /* ignore */ }
}

export function getAllTemplates(): WorkflowTemplate[] {
  return [...BUILT_IN_TEMPLATES, ...loadCustomTemplates()]
}

export function saveAsTemplate(template: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'updatedAt'>): WorkflowTemplate {
  const newTemplate: WorkflowTemplate = {
    ...template,
    id: `tpl-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const existing = loadCustomTemplates()
  saveCustomTemplates([newTemplate, ...existing])
  return newTemplate
}

export function deleteTemplate(id: string): void {
  const existing = loadCustomTemplates()
  saveCustomTemplates(existing.filter((t) => t.id !== id))
}
