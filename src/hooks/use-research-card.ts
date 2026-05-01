// Stub — research card is a legacy feature, not used in Claude Workspace

export interface ResearchStep {
  id: string
  name: string
  label: string
  args: string
  delay: number
  duration: number
  durationMs: number
  status: 'pending' | 'running' | 'done'
}

export interface UseResearchCardResult {
  isVisible: boolean
  isActive: boolean
  currentStep: number
  steps: Array<ResearchStep>
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  totalDurationMs: number
  dismiss: () => void
}

export function useResearchCard(_opts?: unknown): UseResearchCardResult {
  return {
    isVisible: false,
    isActive: false,
    currentStep: 0,
    steps: [],
    collapsed: true,
    setCollapsed: () => {},
    totalDurationMs: 0,
    dismiss: () => {},
  }
}
