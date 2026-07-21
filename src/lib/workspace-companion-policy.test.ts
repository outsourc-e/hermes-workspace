import { describe, expect, it } from 'vitest'
import {
  isWorkspaceTestRuntime,
  shouldAutoStartWorkspaceCompanions,
} from './workspace-companion-policy'

describe('workspace companion policy', () => {
  it.each([
    [{ mode: 'test', env: {} }, true],
    [{ mode: 'development', env: { NODE_ENV: 'test' } }, true],
    [{ mode: 'development', env: { VITEST: 'true' } }, true],
    [{ mode: 'development', env: { VITEST: '1' } }, true],
    [{ mode: 'development', env: {} }, false],
  ])('detects isolated test runtimes', (input, expected) => {
    expect(isWorkspaceTestRuntime(input)).toBe(expected)
  })

  it('requires an explicit opt-in during a real dev serve', () => {
    expect(
      shouldAutoStartWorkspaceCompanions({
        command: 'serve',
        mode: 'development',
        env: { WORKSPACE_AUTOSTART_LOCAL_SERVICES: '1' },
      }),
    ).toBe(true)
  })

  it.each([
    { command: 'build', mode: 'production', env: { WORKSPACE_AUTOSTART_LOCAL_SERVICES: '1' } },
    { command: 'serve', mode: 'development', env: {} },
    { command: 'serve', mode: 'test', env: { WORKSPACE_AUTOSTART_LOCAL_SERVICES: '1' } },
    { command: 'serve', mode: 'development', env: { VITEST: 'true', WORKSPACE_AUTOSTART_LOCAL_SERVICES: '1' } },
  ])('blocks side effects for $command/$mode', (input) => {
    expect(shouldAutoStartWorkspaceCompanions(input)).toBe(false)
  })
})
