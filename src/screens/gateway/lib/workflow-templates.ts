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
    description: 'Проверить код на ошибки, проблемы производительности и качество',
    icon: '🔍',
    goal: 'Review the codebase for bugs, performance issues, and code quality improvements',
    tags: ['review', 'quality', 'audit'],
    tasks: [
      { title: 'Изучить все исходные файлы и понять архитектуру' },
      { title: 'Найти ошибки и логические дефекты' },
      { title: 'Проверить на уязвимости' },
      { title: 'Предложить улучшения качества кода' },
      { title: 'Составить итоговый отчёт с приоритизированными выводами' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-bug-fix',
    name: 'Bug Fix',
    description: 'Найти и исправить конкретную ошибку с тестами',
    icon: '🐛',
    goal: 'Investigate the reported bug, identify the root cause, implement a fix, and verify it works. Write tests if appropriate.',
    tasks: [
      { title: 'Воспроизвести ошибку и понять симптомы' },
      { title: 'Проследить путь выполнения и найти первопричину' },
      { title: 'Реализовать исправление' },
      { title: 'Запустить проверку типов (npx tsc --noEmit)' },
      { title: 'Коммит с понятным описанием' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-feature-build',
    name: 'Feature Build',
    description: 'Спланировать и реализовать новую функцию целиком',
    icon: '🏗️',
    goal: 'Plan, implement, test, and document the new feature',
    tags: ['build', 'feature', 'implementation'],
    tasks: [
      { title: 'Проанализировать существующие паттерны кода и архитектуру' },
      { title: 'Создать новые файлы и компоненты' },
      { title: 'Подключить маршруты, управление состоянием и вызовы API' },
      { title: 'Добавить обработку ошибок и граничных случаев' },
      { title: 'Запустить проверку типов и исправить ошибки' },
      { title: 'Закоммитить и отправить' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-research',
    name: 'Research & Analysis',
    description: 'Изучить тему и подготовить структурированный отчёт',
    icon: '📊',
    goal: 'Research the given topic thoroughly. Analyze findings and produce a structured report with key insights, comparisons, and recommendations.',
    tasks: [
      { title: 'Найти релевантные источники и документацию' },
      { title: 'Проанализировать и сравнить подходы' },
      { title: 'Составить структурированный отчёт по результатам' },
      { title: 'Добавить раздел рекомендаций' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-refactor',
    name: 'Refactor',
    description: 'Рефакторинг для лучшей структуры, производительности или читаемости',
    icon: '♻️',
    goal: 'Refactor the specified code area to improve organization, reduce complexity, and maintain existing functionality. No behavioral changes.',
    tasks: [
      { title: 'Изучить текущую реализацию' },
      { title: 'Найти возможности для рефакторинга' },
      { title: 'Вносить изменения постепенно' },
      { title: 'Убедиться, что поведение не изменилось (проверка типов и ручное ревью)' },
      { title: 'Коммит с понятным описанием рефакторинга' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-audit',
    name: 'Security Audit',
    description: 'Аудит кода: уязвимости и лучшие практики',
    icon: '🛡️',
    goal: 'Perform a security audit of the codebase. Check for common vulnerabilities (XSS, injection, auth bypass, secrets exposure, dependency issues). Produce a severity-ranked report.',
    tasks: [
      { title: 'Найти зашитые в код секреты и API-ключи' },
      { title: 'Проверить валидацию и очистку входных данных' },
      { title: 'Проверить сценарии аутентификации и авторизации' },
      { title: 'Проверить уязвимости зависимостей' },
      { title: 'Составить отчёт аудита безопасности с оценкой критичности' },
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
