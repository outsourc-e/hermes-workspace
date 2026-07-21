// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

import { TerraModelPrintStudio } from './TerraModelPrintStudio'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('TerraModelPrintStudio', () => {
  it('keeps the camera workbench scoped to Terra without changing map navigation', () => {
    const living = readFileSync(resolve(process.cwd(), 'src/screens/war-room/living-v3/LivingWarRoomV3.tsx'), 'utf8')
    const studio = readFileSync(resolve(process.cwd(), 'src/screens/war-room/living-v3/TerraModelPrintStudio.tsx'), 'utf8')
    const css = readFileSync(resolve(process.cwd(), 'src/screens/war-room/living-v3/terra-model-print-studio.css'), 'utf8')

    expect(living).toContain('data-terra-primary-ui="camera-workbench-v9"')
    expect(living).toContain('data-terra-ui-rework="terra-camera-workbench-v9"')
    expect(living).not.toContain('<nav className="living-v3__terra-workspace-tabs"')
    expect(living).not.toContain('<TerraFeatureDock')
    expect(living).not.toContain('className="living-v3__terra-station-switcher"')
    expect(living).not.toContain('className="living-v3__terra-workspace-rail"')
    expect(living).toContain('<details className="living-v3__terra-advanced-drawer"')
    expect(studio).toContain('data-terra-map-scope="unchanged"')
    expect(studio).toContain('data-terra-no-auto-polling="true"')
    expect(css).toContain('[data-terra-ui-rework="terra-camera-workbench-v9"]')
    expect(css).not.toContain('asset-pack first')
  })

  it('renders an honest camera-first cockpit with four bounded actions and collapsed proof', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const choose = vi.fn()
    const step = vi.fn()
    const refreshCamera = vi.fn()
    const inspectCamera = vi.fn()
    const stageApproval = vi.fn()
    const changeColor = vi.fn()

    React.act(() => {
      root.render(
        <TerraModelPrintStudio
          model={{ title: 'Lighthouse body', meta: 'local 3MF' }}
          specs={[
            { label: 'Machine', value: 'Centauri Carbon', tone: 'ready' },
            { label: 'Material', value: 'PLA', tone: 'ready' },
            { label: 'Print envelope', value: '256 × 256 × 256 mm', tone: 'ready' },
            { label: 'Output', value: 'not staged', tone: 'locked' },
          ]}
          steps={Array.from({ length: 6 }, (_, index) => ({
            id: `step-${index}`,
            label: `Step ${index + 1}`,
            state: index < 2 ? 'ready' as const : 'locked' as const,
            value: index < 2 ? 'ready' : 'locked',
            onClick: step,
          }))}
          actions={[
            { id: 'choose', label: 'Choose model', hint: 'local only', disabled: false, run: choose },
            { id: 'send', label: 'Printer start locked', hint: 'approval required', disabled: true, run: vi.fn() },
          ]}
          readback={[{ label: 'Model', value: 'Lighthouse body', meta: 'local 3MF' }]}
          production={{
            camera: {
              title: 'Printer camera readback',
              status: 'real camera route requested',
              liveLabel: 'FRAME REQUESTED',
              imageSrc: '/api/war-room/terra-printer-frame?studio=test',
              actionLabel: 'Reload camera',
              inspectLabel: 'QA inspect',
              onRefresh: refreshCamera,
              onInspect: inspectCamera,
            },
            printer: {
              name: 'Centauri Carbon',
              connection: 'Live',
              progress: '42%',
              temps: '60° / 210°',
              lifecycle: 'printing',
              jobName: 'lighthouse.3mf',
              controls: [
                { id: 'refresh-readback', label: 'Refresh', hint: 'read-only', disabled: false, run: refreshCamera },
                { id: 'stage-approval', label: 'Approval gate', hint: 'stage only', disabled: false, tone: 'warn', run: stageApproval },
                { id: 'cancel', label: 'Cancel', hint: 'danger locked', disabled: true, tone: 'danger', run: vi.fn() },
              ],
            },
            material: {
              selectedLabel: 'PLA Green',
              selectedMaterial: 'PLA',
              color: '#4f8b3a',
              supportNote: 'Local color/profile only',
              options: [
                { id: 'pla-green', label: 'PLA Green', material: 'PLA', color: '#4f8b3a', note: 'active', active: true, onSelect: changeColor },
                { id: 'petg-black', label: 'PETG Black', material: 'PETG', color: '#111', note: 'available', active: false, onSelect: changeColor },
              ],
            },
          }}
        />,
      )
    })

    const studio = container.querySelector('[data-terra-primary-ui="camera-workbench-v9"]') as HTMLElement
    expect(studio).toBeTruthy()
    expect(studio.dataset.terraProductionCockpit).toBe('true')
    expect(studio.dataset.terraCameraFirst).toBe('true')
    expect(studio.dataset.terraPrimaryActionCount).toBe('4')
    expect(studio.dataset.terraAdvancedDefault).toBe('closed')
    expect(studio.dataset.terraNoAutoPolling).toBe('true')
    expect(studio.dataset.terraMapScope).toBe('unchanged')
    expect(studio.dataset.terraLiveWrites).toBe('locked')

    const camera = container.querySelector('.terra-camera') as HTMLElement
    const cameraImage = camera.querySelector('img[src="/api/war-room/terra-printer-frame?studio=test"]') as HTMLImageElement
    expect(camera.dataset.terraCameraState).toBe('loading')
    expect(cameraImage).toBeTruthy()
    expect(container.querySelector('[data-terra-camera-action="inspect-frame"]')).toBeFalsy()

    React.act(() => {
      cameraImage.dispatchEvent(new Event('error', { bubbles: true }))
    })
    expect(camera.dataset.terraCameraState).toBe('error')
    expect(camera.textContent).toContain('Camera request failed')
    expect(camera.textContent).toContain('will not substitute a simulated feed')

    expect(container.querySelector('[data-terra-asset-system]')).toBeFalsy()
    expect(container.querySelector('[data-terra-asset-layer]')).toBeFalsy()
    expect(container.querySelector('img[src^="/war-room/terra/asset-pack-v7"]')).toBeFalsy()
    expect(container.querySelectorAll('[data-terra-color-option]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-terra-studio-step]')).toHaveLength(6)
    expect(container.querySelectorAll('[data-terra-studio-action]')).toHaveLength(3)
    expect(container.querySelector('[data-terra-studio-action="send"]')).toBeFalsy()
    expect(container.querySelector('[data-terra-studio-action="cancel"]')).toBeFalsy()
    expect(container.querySelector('.terra-advanced')).toBeFalsy()

    React.act(() => {
      ;(container.querySelector('[data-terra-studio-action="choose"]') as HTMLButtonElement).click()
      ;(container.querySelector('[data-terra-camera-action="request-frame"]') as HTMLButtonElement).click()
      ;(container.querySelector('[data-terra-studio-action="stage-approval"]') as HTMLButtonElement).click()
    })
    expect(choose).toHaveBeenCalledOnce()
    expect(refreshCamera).toHaveBeenCalledOnce()
    expect(stageApproval).toHaveBeenCalledOnce()
    expect(inspectCamera).not.toHaveBeenCalled()
    expect(step).not.toHaveBeenCalled()
    expect(changeColor).not.toHaveBeenCalled()

    React.act(() => root.unmount())
    document.body.removeChild(container)
  })
})
