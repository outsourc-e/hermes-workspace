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
    title: 'Добро пожаловать в AWG GPT',
    description: 'Ваше ИИ-пространство на базе AWG GPT',
    icon: Home01Icon,
    iconBg: 'bg-orange-500',
    nextLabel: 'Get Started',
  },
  {
    id: 'connection-check',
    title: 'Проверка подключения',
    description: 'Прежде чем начать, убедитесь, что AWG GPT запущен.',
    icon: Plug01Icon,
    iconBg: 'bg-emerald-500',
    component: ConnectionCheckStep,
    canProceedByDefault: false,
  },
  {
    id: 'model-configuration',
    title: 'Настройка модели',
    description: 'Проверьте текущие настройки провайдера и модели.',
    icon: Settings01Icon,
    iconBg: 'bg-cyan-500',
    component: ModelConfigurationStep,
  },
  {
    id: 'ready',
    title: 'Всё готово!',
    description:
      'Начните общение с агентом. Попросите помочь с кодом, исследованием или чем-то другим.',
    icon: CheckmarkCircle02Icon,
    iconBg: 'bg-emerald-500',
    completeLabel: 'Start Chatting',
  },
]

export const STORAGE_KEY = 'claude-onboarding-complete'
