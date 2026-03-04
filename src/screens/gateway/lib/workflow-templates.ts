export type WorkflowTemplate = {
  id: string
  name: string
  description: string
  icon: string
  goal: string
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
    description: 'Review a PR or codebase for bugs, style, and improvements',
    icon: '🔍',
    goal: 'Review the codebase for bugs, code quality issues, security concerns, and potential improvements. Provide a structured report with findings categorized by severity.',
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
    description: 'Build a new feature from spec to implementation',
    icon: '🏗️',
    goal: 'Implement the described feature following the existing codebase patterns. Include proper types, error handling, and documentation.',
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
