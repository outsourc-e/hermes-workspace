import { describe, expect, it } from 'vitest'
import {
  SwarmRosterSchema,
  SwarmRosterUpsertSchema,
  applySwarmWorkerModel,
  isSwarmWorkerId,
} from './swarm-roster'

describe('swarm roster semantic workers', () => {
  it('accepts both legacy swarm ids and semantic profile ids for upsert', () => {
    const baseWorker = {
      name: 'Builder',
      role: 'Builder',
      specialty: '',
      model: 'Worker',
      mission: 'Ship focused changes.',
      skills: [],
      capabilities: [],
      preferredTaskTypes: [],
      maxConcurrentTasks: 1,
    }

    expect(
      SwarmRosterUpsertSchema.parse({ ...baseWorker, id: ' builder ' }).id,
    ).toBe('builder')
    expect(
      SwarmRosterUpsertSchema.safeParse({ ...baseWorker, id: 'swarm13' })
        .success,
    ).toBe(true)
    expect(
      SwarmRosterUpsertSchema.safeParse({ ...baseWorker, id: 'builder' })
        .success,
    ).toBe(true)
    expect(
      SwarmRosterUpsertSchema.safeParse({ ...baseWorker, id: 'km-agent' })
        .success,
    ).toBe(true)
    expect(
      SwarmRosterUpsertSchema.safeParse({ ...baseWorker, id: 'ops-watch' })
        .success,
    ).toBe(true)
    expect(isSwarmWorkerId('builder')).toBe(true)
    expect(isSwarmWorkerId('km-agent')).toBe(true)
    expect(isSwarmWorkerId('../bad')).toBe(false)
  })

  it('preserves semantic roster metadata through parse', () => {
    const parsed = SwarmRosterSchema.parse({
      version: 1,
      workers: [
        {
          id: 'km-agent',
          name: 'KM Agent',
          role: 'Knowledge steward',
          specialty: 'RAZSOC and GBrain stewardship',
          model: 'GPT-5.5',
          mission: 'Keep the operating brain coherent.',
          profile: 'km-agent',
          modes: ['health', 'curate'],
          tools: ['gbrain', 'terminal', 'file'],
          skills: ['km-agent-core'],
          plugins: ['disk-cleanup'],
          pluginToolsets: ['spotify'],
          mcpServers: ['gbrain'],
          wrapper: 'km:health',
          capabilities: ['gbrain', 'obsidian', 'drift-audit'],
          preferredTaskTypes: ['knowledge', 'curation'],
          greenlightRequiredFor: ['delete', 'purge', 'publish'],
          maxConcurrentTasks: 1,
        },
      ],
    })

    expect(parsed.workers[0]).toMatchObject({
      id: 'km-agent',
      profile: 'km-agent',
      modes: ['health', 'curate'],
      tools: ['gbrain', 'terminal', 'file'],
      skills: ['km-agent-core'],
      plugins: ['disk-cleanup'],
      pluginToolsets: ['spotify'],
      mcpServers: ['gbrain'],
      wrapper: 'km:health',
      greenlightRequiredFor: ['delete', 'purge', 'publish'],
    })
  })

  it('rejects wrapper names that can escape the managed wrapper directory', () => {
    const worker = {
      id: 'builder',
      name: 'Builder',
      wrapper: 'km:health',
    }
    expect(SwarmRosterUpsertSchema.safeParse(worker).success).toBe(true)
    for (const wrapper of ['../escape', '..\\escape', '/absolute', 'a/b']) {
      expect(
        SwarmRosterUpsertSchema.safeParse({ ...worker, wrapper }).success,
      ).toBe(false)
    }
  })

  it('changes only the selected role model to a canonical OAuth route', () => {
    const roster = SwarmRosterSchema.parse({
      version: 1,
      workers: [
        {
          id: 'builder',
          name: 'Builder',
          model: 'GPT-5.5',
          skills: ['builder-core'],
        },
        {
          id: 'reviewer',
          name: 'Reviewer',
          model: 'GPT-5.5',
          skills: ['reviewer-core'],
        },
      ],
    })

    const next = applySwarmWorkerModel(
      roster,
      'builder',
      'claude-cwm4tx/sonnet',
    )

    expect(
      next.workers.find((worker) => worker.id === 'builder'),
    ).toMatchObject({ model: 'claude-cwm4tx/sonnet', skills: ['builder-core'] })
    expect(
      next.workers.find((worker) => worker.id === 'reviewer'),
    ).toMatchObject({ model: 'GPT-5.5', skills: ['reviewer-core'] })
  })
})
