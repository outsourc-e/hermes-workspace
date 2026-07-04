import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createFileWarRoomEventStore, createMemoryWarRoomEventStore } from './index'

describe('War Room event stores', () => {
  it('keeps memory store append/list/filter behavior stable', () => {
    const store = createMemoryWarRoomEventStore()
    store.appendEvent({ type: 'task.created', taskId: 'task-1', agentId: 'hermes', createdAtMs: 1_000 })
    store.appendEvent({ type: 'agent.said', agentId: 'athena', payload: { text: 'Signal.' }, createdAtMs: 1_100 })

    expect(store.listEvents()).toHaveLength(2)
    expect(store.listEventsByAgent('athena')).toHaveLength(1)
    expect(store.listEventsByTask('task-1')[0].type).toBe('task.created')
  })

  it('can persist JSONL events to a local file-backed store', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'war-room-events-'))
    const filePath = path.join(dir, 'events.jsonl')
    const store = createFileWarRoomEventStore({ filePath })
    store.appendEvent({ type: 'agent.intent.received', agentId: 'hermes', source: 'test', runId: 'run-file', createdAtMs: 2_000 })

    expect(store.getInfo()).toMatchObject({ mode: 'file', path: filePath })
    expect(fs.readFileSync(filePath, 'utf8')).toContain('"runId":"run-file"')
  })

  it('falls back safely to memory semantics when file persistence fails', () => {
    const store = createFileWarRoomEventStore({ filePath: '/dev/null/events.jsonl' })
    store.appendEvent({ type: 'agent.said', agentId: 'hermes', payload: { text: 'Still local.' }, createdAtMs: 3_000 })

    expect(store.listEvents()).toHaveLength(1)
    expect(store.getInfo().mode).toBe('memory')
    expect(store.getInfo().warning).toBeTruthy()
  })
})
