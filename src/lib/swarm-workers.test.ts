import { describe, expect, it } from 'vitest'
import { isSwarmDispatchWorkerId } from './swarm-workers'

describe('isSwarmDispatchWorkerId', () => {
  it('rejects workspace UI shell', () => {
    expect(isSwarmDispatchWorkerId('workspace')).toBe(false)
  })

  it('accepts real swarm workers', () => {
    expect(isSwarmDispatchWorkerId('researcher')).toBe(true)
    expect(isSwarmDispatchWorkerId('builder')).toBe(true)
  })
})
