/** @vitest-environment jsdom */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

import { HermesCommandCockpit } from './HermesCommandCockpit'
import type {
  HermesCommandActionRunCard,
  HermesCommandAgentSummary,
  HermesCommandTaskSummary,
} from './HermesCommandCockpit'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function actionRun(overrides: Partial<HermesCommandActionRunCard> = {}): HermesCommandActionRunCard {
  return {
    runId: 'command-idle',
    status: 'idle',
    prompt: '',
    intent: 'idle',
    capability: 'not_needed',
    assignedAgentId: 'hermes',
    readback: '',
    visualNextStep: '',
    createdAtMs: 1,
    updatedAtMs: 1,
    ...overrides,
  }
}

const agents: Array<HermesCommandAgentSummary> = [
  {
    id: 'hermes',
    label: 'Hermes',
    shortLabel: 'Hermes',
    portraitPath: '/hermes.png',
    roomLabel: 'Olympus Command',
    activityLabel: 'עובד',
    statusTone: 'active',
    lastMessage: 'מנתב את המשימה.',
  },
  {
    id: 'loki',
    label: 'Loki Scout',
    shortLabel: 'Loki',
    portraitPath: '/loki.png',
    roomLabel: 'Etsy Market Lab',
    activityLabel: 'ממתין',
    statusTone: 'idle',
  },
]

const tasks: Array<HermesCommandTaskSummary> = [
  {
    id: 'run-1',
    title: 'בדיקת מוצר חדש',
    status: 'running',
    roomLabel: 'Etsy Market Lab',
    agentLabel: 'Loki',
    readback: 'נבדקות ראיות מקומיות.',
    updatedAtMs: 10,
  },
]

const baseProps = {
  prompt: '',
  onPromptChange: vi.fn(),
  onRun: vi.fn(),
  runDisabled: false,
  actionRun: actionRun(),
  focusTitle: 'מוכן',
  focusBody: '',
  sourceDetails: <div data-proof-content>Proof</div>,
  agents,
  tasks,
}

describe('Hermes Command two-tool contract', () => {
  it('renders Hermes Command as the conversation tool with one composer and no operations duplicate', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await React.act(() => {
      root.render(
        <HermesCommandCockpit
          {...baseProps}
          surfaceMode="command"
          sideStack={<div data-system-content>System</div>}
        />,
      )
    })

    expect(container.querySelector('[data-hermes-tool="hermes-command"]')).toBeTruthy()
    expect(container.querySelector('[data-command-bridge-region="threads"]')).toBeTruthy()
    expect(container.querySelector('[data-command-bridge-region="chat"]')).toBeTruthy()
    expect(container.querySelector('[data-command-bridge-region="workbench"]')).toBeTruthy()
    expect(container.querySelector('[data-command-bridge-region="operations"]')).toBeNull()
    expect(container.textContent).toContain('מה תרצה להשיג?')
    expect(container.textContent).not.toContain('נעול')
    expect(container.querySelectorAll('textarea')).toHaveLength(1)
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(1)
    expect(container.querySelector('details.hermes-command-cockpit__advanced')?.hasAttribute('open')).toBe(false)

    await React.act(() => root.unmount())
  })

  it('renders Mission Control as a distinct task, workbench, agent, and approval surface without a composer', async () => {
    const onOpenHermesCommand = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await React.act(() => {
      root.render(
        <HermesCommandCockpit
          {...baseProps}
          surfaceMode="mission-control"
          onOpenHermesCommand={onOpenHermesCommand}
        />,
      )
    })

    expect(container.querySelector('[data-hermes-tool="mission-control"]')).toBeTruthy()
    expect(container.querySelector('[data-command-bridge-region="mission-tasks"]')).toBeTruthy()
    expect(container.querySelector('[data-command-bridge-region="mission-workbench"]')).toBeTruthy()
    expect(container.querySelector('[data-command-bridge-region="mission-agents"]')).toBeTruthy()
    expect(container.querySelector('[data-mission-control-approval-queue]')).toBeTruthy()
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.textContent).toContain('בדיקת מוצר חדש')

    const talkButton = container.querySelector('button[data-talk-about-task="run-1"]')
    await React.act(() => talkButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onOpenHermesCommand).toHaveBeenCalledWith('run-1')

    await React.act(() => root.unmount())
  })

  it('shows truthful task and agent status and routes an agent selection through Mission Control', async () => {
    const onSelectAgent = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await React.act(() => {
      root.render(
        <HermesCommandCockpit
          {...baseProps}
          surfaceMode="mission-control"
          activeAgentId="hermes"
          onSelectAgent={onSelectAgent}
        />,
      )
    })

    expect(container.textContent).toContain('בדיקת מוצר חדש')
    expect(container.textContent).toContain('Etsy Market Lab')
    expect(container.textContent).toContain('Loki Scout')
    const lokiButton = container.querySelector('button[data-command-agent="loki"]')
    await React.act(() => lokiButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onSelectAgent).toHaveBeenCalledWith('loki')

    await React.act(() => root.unmount())
  })

  it('asks DLV before Council and starts nothing until the approval button is clicked', async () => {
    const approve = vi.fn()
    const skip = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await React.act(() => {
      root.render(
        <HermesCommandCockpit
          {...baseProps}
          surfaceMode="command"
          prompt="מה כדאי לעשות באסטרטגיית ההשקה?"
          actionRun={actionRun({
            runId: 'council-offer-1',
            status: 'waiting_operator',
            prompt: 'מה כדאי לעשות באסטרטגיית ההשקה?',
            intent: 'council_consultation_offer',
            capability: 'available',
            targetRoomId: 'council-strategists',
            targetStationId: 'council-table',
            toolId: 'controlled-council-one-shot',
            readback: 'זה נראה כמו נושא שכדאי לבחון מכמה זוויות.',
            visualNextStep: 'להתייעץ עם המועצה? אתה מחליט.',
          })}
          focusTitle="החלטה שלך"
          focusBody="זה נראה כמו נושא שכדאי לבחון מכמה זוויות."
          onApproveCouncil={approve}
          onSkipCouncil={skip}
        />,
      )
    })

    expect(container.textContent).toContain('להתייעץ עם המועצה?')
    expect(container.textContent).toContain('החלטה שלך')
    expect(approve).not.toHaveBeenCalled()
    expect(skip).not.toHaveBeenCalled()

    const approveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'התייעץ')
    await React.act(() => approveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(approve).toHaveBeenCalledTimes(1)
    expect(skip).not.toHaveBeenCalled()

    await React.act(() => root.unmount())
  })
})
