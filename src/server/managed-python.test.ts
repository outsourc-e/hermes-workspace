import { describe, expect, it } from 'vitest'

import { resolveManagedPythonBin } from './managed-python'

describe('resolveManagedPythonBin', () => {
  it('prefers the managed Hermes Windows interpreter over python3', () => {
    expect(
      resolveManagedPythonBin({
        platform: 'win32',
        env: {
          HERMES_HOME: 'C:\\Users\\test\\AppData\\Local\\hermes',
        },
        home: 'C:\\Users\\test',
        pathExists: (candidate) =>
          candidate.endsWith('venv\\Scripts\\python.exe'),
      }),
    ).toBe(
      'C:\\Users\\test\\AppData\\Local\\hermes\\hermes-agent\\venv\\Scripts\\python.exe',
    )
  })

  it('uses python3 on POSIX when no managed interpreter exists', () => {
    expect(
      resolveManagedPythonBin({
        platform: 'linux',
        env: {},
        home: '/home/test',
        pathExists: () => false,
      }),
    ).toBe('python3')
  })
})
