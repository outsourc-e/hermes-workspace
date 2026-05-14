import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

let tempRoot: string

// child_process.execFileSync is used by the orchestrator-routing tmux call. The test mocks it
// to (a) accept has-session checks and (b) record send-keys arguments.
const execFileSyncCalls: Array<{ cmd: string; args: ReadonlyArray<string> }> = []
let hasSessionShouldFail = false

async function loadModule() {
  vi.resetModules()
  execFileSyncCalls.length = 0
  hasSessionShouldFail = false
  tempRoot = mkdtempSync(join(tmpdir(), 'swarm-notifications-test-'))
  const publishChatEvent = vi.fn()
  vi.doMock('node:child_process', () => ({
    execFileSync: (cmd: string, args: ReadonlyArray<string>) => {
      execFileSyncCalls.push({ cmd, args: [...args] })
      if (args[0] === 'has-session' && hasSessionShouldFail) {
        throw new Error('no session')
      }
      return Buffer.alloc(0)
    },
  }))
  vi.doMock('./swarm-foundation', () => ({
    getSwarmProfilePath: (workerId: string) => join(tempRoot, workerId),
  }))
  vi.doMock('./chat-event-bus', () => ({
    publishChatEvent,
  }))
  const mod = await import('./swarm-notifications')
  return { mod, publishChatEvent }
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('./swarm-foundation')
  vi.doUnmock('./chat-event-bus')
  vi.doUnmock('node:child_process')
  try { rmSync(tempRoot, { recursive: true, force: true }) } catch { /* ignore */ }
})

describe('swarm-notifications', () => {
  it('publishes checkpoint notifications once per unique raw and persists dedupe state', async () => {
    const { mod, publishChatEvent } = await loadModule()
    const checkpoint = {
      stateLabel: 'DONE' as const,
      runtimeState: 'idle' as const,
      checkpointStatus: 'done' as const,
      filesChanged: 'src/routes/api/swarm-dispatch.ts',
      commandsRun: 'pnpm vitest run src/server/swarm-notifications.test.ts',
      result: 'Runtime summary is truthful',
      blocker: null,
      nextAction: 'Route to reviewer inbox',
      raw: 'STATE: DONE\nFILES_CHANGED: src/routes/api/swarm-dispatch.ts\nCOMMANDS_RUN: pnpm vitest run src/server/swarm-notifications.test.ts\nRESULT: Runtime summary is truthful\nBLOCKER: none\nNEXT_ACTION: Route to reviewer inbox',
    }

    mkdirSync(join(tempRoot, 'swarm11'), { recursive: true })

    const first = mod.publishSwarmCheckpointNotification({
      workerId: 'swarm11',
      missionId: 'mission-night-shift',
      assignmentId: 'assign-1',
      checkpoint,
      notifySessionKey: 'qa-main',
    })
    const second = mod.publishSwarmCheckpointNotification({
      workerId: 'swarm11',
      missionId: 'mission-night-shift',
      assignmentId: 'assign-1',
      checkpoint,
      notifySessionKey: 'qa-main',
    })

    // DONE checkpoints route to the orchestrator tmux session, not main.
    expect(first).toMatchObject({ published: true, sessionKey: 'qa-main', route: 'orchestrator' })
    expect(first.orchestrator).toMatchObject({ sent: true, session: 'swarm-orchestrator' })
    // Same raw is deduped on the second call.
    expect(second).toMatchObject({ published: false, sessionKey: 'qa-main', route: 'noop' })
    // No chat event was published — DONE goes to orchestrator only.
    expect(publishChatEvent).not.toHaveBeenCalled()
    // tmux send-keys ran for orchestrator routing on the first call.
    const sendKeyCalls = execFileSyncCalls.filter((c) => c.args[0] === 'send-keys')
    expect(sendKeyCalls.length).toBeGreaterThanOrEqual(2) // -l <text>, then Enter

    const runtimePath = join(tempRoot, 'swarm11', 'runtime.json')
    expect(existsSync(runtimePath)).toBe(true)
    expect(JSON.parse(readFileSync(runtimePath, 'utf8'))).toMatchObject({
      notifySessionKey: 'qa-main',
      lastNotifiedCheckpointRaw: checkpoint.raw,
      lastCheckpointRoute: 'orchestrator',
      lastOrchestratorSendOk: true,
    })
  })

  it('does NOT silently noop when state/status changes even if raw is recycled', async () => {
    const { mod } = await loadModule()
    mkdirSync(join(tempRoot, 'swarm12'), { recursive: true })
    const baseRaw = 'STATE: IN_PROGRESS\nRESULT: working'
    const first = mod.publishSwarmCheckpointNotification({
      workerId: 'swarm12',
      checkpoint: {
        stateLabel: 'IN_PROGRESS',
        runtimeState: 'executing',
        checkpointStatus: 'in_progress',
        filesChanged: 'none',
        commandsRun: 'none',
        result: 'working',
        blocker: null,
        nextAction: 'continue',
        raw: baseRaw,
      },
      notifySessionKey: 'qa-main',
    })
    expect(first.route).toBe('orchestrator')

    // Same raw but checkpoint genuinely transitioned to DONE.
    const second = mod.publishSwarmCheckpointNotification({
      workerId: 'swarm12',
      checkpoint: {
        stateLabel: 'DONE',
        runtimeState: 'idle',
        checkpointStatus: 'done',
        filesChanged: 'src/x.ts',
        commandsRun: 'pnpm test',
        result: 'done',
        blocker: null,
        nextAction: 'next thing',
        raw: baseRaw,
      },
      notifySessionKey: 'qa-main',
    })
    // Must NOT be noop — semantic state changed.
    expect(second.route).not.toBe('noop')
  })

  it('escalates NEEDS_INPUT checkpoints to main session and to the orchestrator', async () => {
    const { mod, publishChatEvent } = await loadModule()
    const checkpoint = {
      stateLabel: 'NEEDS_INPUT' as const,
      runtimeState: 'waiting' as const,
      checkpointStatus: 'needs_input' as const,
      filesChanged: 'none',
      commandsRun: 'curl -fs http://localhost:3002/api/swarm-runtime',
      result: 'Need Aurora ack on which P0 issue to pick',
      blocker: 'Three valid issues, all P0, need judgment',
      nextAction: 'Aurora pick one',
      raw: 'STATE: NEEDS_INPUT\nRESULT: Need Aurora ack on which P0 issue to pick\nBLOCKER: Three valid issues, all P0, need judgment\nNEXT_ACTION: Aurora pick one',
    }
    mkdirSync(join(tempRoot, 'swarm12'), { recursive: true })

    const result = mod.publishSwarmCheckpointNotification({
      workerId: 'swarm12',
      checkpoint,
      notifySessionKey: 'qa-main',
    })

    expect(result).toMatchObject({ published: true, sessionKey: 'qa-main', route: 'main' })
    expect(result.orchestrator).toMatchObject({ sent: true, session: 'swarm-orchestrator' })
    // Both the orchestrator AND main were notified.
    expect(publishChatEvent).toHaveBeenCalledTimes(2)
    expect(publishChatEvent).toHaveBeenNthCalledWith(
      1,
      'message',
      expect.objectContaining({
        sessionKey: 'qa-main',
        message: expect.objectContaining({
          details: expect.objectContaining({
            source: 'swarm-checkpoint',
            checkpointState: 'NEEDS_INPUT',
            escalationReason: expect.stringContaining('NEEDS_INPUT'),
          }),
        }),
      }),
    )
  })

  it('falls back to escalating to main when the orchestrator tmux session is missing', async () => {
    const { mod, publishChatEvent } = await loadModule()
    hasSessionShouldFail = true
    const checkpoint = {
      stateLabel: 'BLOCKED' as const,
      runtimeState: 'blocked' as const,
      checkpointStatus: 'blocked' as const,
      filesChanged: 'none',
      commandsRun: 'none',
      result: 'PR scan returned empty',
      blocker: 'gh auth missing on host',
      nextAction: 'Aurora repair gh auth',
      raw: 'STATE: BLOCKED\nBLOCKER: gh auth missing on host',
    }
    mkdirSync(join(tempRoot, 'swarm12'), { recursive: true })

    const result = mod.publishSwarmCheckpointNotification({
      workerId: 'swarm12',
      checkpoint,
      notifySessionKey: 'qa-main',
    })

    expect(result).toMatchObject({ published: true, sessionKey: 'qa-main', route: 'main' })
    expect(result.orchestrator).toMatchObject({ sent: false, session: 'swarm-orchestrator' })
    expect(publishChatEvent).toHaveBeenCalled()
  })

  it('does not echo a checkpoint into the orchestrator pane when the worker IS the orchestrator', async () => {
    const { mod } = await loadModule()
    const checkpoint = {
      stateLabel: 'DONE' as const,
      runtimeState: 'idle' as const,
      checkpointStatus: 'done' as const,
      filesChanged: 'none',
      commandsRun: 'none',
      result: 'Orchestrator self-report',
      blocker: null,
      nextAction: 'Continue loop',
      raw: 'STATE: DONE\nRESULT: Orchestrator self-report\nNEXT_ACTION: Continue loop',
    }
    mkdirSync(join(tempRoot, 'orchestrator'), { recursive: true })

    const result = mod.publishSwarmCheckpointNotification({
      workerId: 'orchestrator',
      checkpoint,
      notifySessionKey: 'qa-main',
    })

    // skippedSelf -> orchestrator route is treated as 'orchestrator' (self-report doesn't escalate either).
    expect(result.orchestrator).toMatchObject({ sent: false, session: 'swarm-orchestrator', skippedSelf: true })
  })
})
