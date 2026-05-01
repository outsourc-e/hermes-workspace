import {
  CheckmarkCircle02Icon,
  Home01Icon,
  Plug01Icon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import {
  ConnectionCheckStep,
  ModelConfigurationStep,
} from './setup-step-content'
import type { HugeiconsIcon } from '@hugeicons/react'
import type * as React from 'react'

type IconType = React.ComponentProps<typeof HugeiconsIcon>['icon']

export type OnboardingStepComponentProps = {
  setCanProceed: (canProceed: boolean) => void
}

export type OnboardingStep = {
  id: string
  title: string
  description: string
  icon: IconType
  iconBg: string
  component?: React.ComponentType<OnboardingStepComponentProps>
  nextLabel?: string
  completeLabel?: string
  canProceedByDefault?: boolean
}

export const ONBOARDING_STEPS: Array<OnboardingStep> = [
  {
    id: 'welcome',
    title: 'Welcome to Claude Workspace',
    description: 'Your AI workspace powered by Claude Agent',
    icon: Home01Icon,
    iconBg: 'bg-orange-500',
    nextLabel: 'Get Started',
  },
  {
    id: 'connection-check',
    title: 'Connection Check',
    description: 'Verify that Claude Agent is running before you begin.',
    icon: Plug01Icon,
    iconBg: 'bg-emerald-500',
    component: ConnectionCheckStep,
    canProceedByDefault: false,
  },
  {
    id: 'model-configuration',
    title: 'Model Configuration',
    description: 'Review your current provider and model setup.',
    icon: Settings01Icon,
    iconBg: 'bg-cyan-500',
    component: ModelConfigurationStep,
  },
  {
    id: 'ready',
    title: 'You are all set!',
    description:
      'Start chatting with Claude. Try asking it to help with code, research, or anything else.',
    icon: CheckmarkCircle02Icon,
    iconBg: 'bg-emerald-500',
    completeLabel: 'Start Chatting',
  },
]

export const STORAGE_KEY = 'claude-onboarding-complete'
