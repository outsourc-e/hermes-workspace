// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { WorkspacePipelineWorkbench } from './WorkspacePipelineWorkbench'

const testGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

testGlobal.IS_REACT_ACT_ENVIRONMENT = true

describe('WorkspacePipelineWorkbench', () => {
  it('renders a teachable pipeline with input/output media lanes and live actions locked', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await React.act(() => {
      root.render(
        <WorkspacePipelineWorkbench
          id="test-shotlab"
          eyebrow="Pipeline OS"
          title="ShotLab prep"
          subtitle="See what goes in, what comes out, and what is locked."
          activeArtifact={{ label: 'Active artifact', title: 'Ceramic cup', meta: 'selected product', emptyLabel: 'CUP' }}
          steps={[
            { id: 'select', label: 'Select', status: 'done', detail: 'Product selected', value: 'ready' },
            { id: 'source', label: 'Inputs', status: 'active', detail: 'Filter source images', value: '2 images' },
            { id: 'outputs', label: 'Outputs', status: 'waiting', detail: 'Generated outputs appear here', value: 'waiting' },
          ]}
          inputMedia={[{ id: 'source-1', label: 'Source image', meta: 'accepted', tone: 'ready' }]}
          outputMedia={[{ id: 'out-1', label: 'Output slot', meta: 'not generated yet', tone: 'waiting' }]}
          filters={[{ id: 'accepted', label: 'Accepted', value: '1', active: true }]}
          actions={[{ id: 'next', label: 'Send next', detail: 'local packet only', locked: true }]}
          locks={['No paid generation', 'No live send']}
          readback={<span>Packet details stay collapsed.</span>}
        />,
      )
    })

    const os = container.querySelector('[data-workspace-pipeline-os="workspace-pipeline-os-v1"]') as HTMLElement
    expect(os).toBeTruthy()
    expect(os.dataset.pipelineTeachable).toBe('true')
    expect(os.dataset.pipelineLiveActionsAllowed).toBe('false')
    expect(os.dataset.toyCountButtons).toBe('removed')
    expect(os.dataset.pipelineInputMediaCount).toBe('1')
    expect(os.dataset.pipelineOutputMediaCount).toBe('1')
    expect(container.querySelector('[data-pipeline-media-lane="inputs"]')?.textContent).toContain('What goes in')
    expect(container.querySelector('[data-pipeline-media-lane="outputs"]')?.textContent).toContain('What comes out')
    expect([...container.querySelectorAll('[data-workspace-pipeline-section]')].map((element) => element.getAttribute('data-workspace-pipeline-section')).sort()).toEqual([
      'actions',
      'activeArtifact',
      'filters',
      'inputMedia',
      'locks',
      'outputMedia',
      'readback',
      'steps',
    ])
    expect(container.querySelectorAll('[data-workspace-pipeline-step]').length).toBe(3)
    expect(container.querySelectorAll('[data-workspace-pipeline-input]').length).toBe(1)
    expect(container.querySelectorAll('[data-workspace-pipeline-output]').length).toBe(1)
    expect((container.querySelector('[data-pipeline-readback-collapsed="true"]') as HTMLDetailsElement).open).toBe(false)

    await React.act(() => root.unmount())
    document.body.removeChild(container)
  })
})
