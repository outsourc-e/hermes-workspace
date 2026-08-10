import { describe, expect, it } from 'vitest'

import {
  buildSwarmTmuxLaunchCommand,
  buildTmuxBufferLoad,
  buildTmuxNewSessionArgs,
  buildTmuxSendKeysArgs,
  resolveSwarmHermesBin,
  resolveSwarmTmuxBin,
} from './swarm-tmux-launch'

describe('Windows Swarm tmux launch planning', () => {
  it('uses the managed Windows Scripts launcher instead of venv/bin/hermes', () => {
    expect(
      resolveSwarmHermesBin({
        platform: 'win32',
        env: {
          HERMES_HOME: 'C:\\Users\\test\\AppData\\Local\\hermes',
        },
        pathExists: (candidate) => candidate.endsWith('Scripts\\hermes.exe'),
        home: 'C:\\Users\\test',
      }),
    ).toBe(
      'C:\\Users\\test\\AppData\\Local\\hermes\\hermes-agent\\venv\\Scripts\\hermes.exe',
    )
  })

  it('selects PATH tmux on Windows instead of a Homebrew path', () => {
    expect(
      resolveSwarmTmuxBin({
        platform: 'win32',
        env: {},
        pathExists: () => false,
        home: 'C:\\Users\\test',
      }),
    ).toBe('tmux')
  })

  it('omits unsupported new-session -c on native Windows tmux', () => {
    expect(
      buildTmuxNewSessionArgs({
        sessionName: 'swarm-builder',
        cwd: 'C:\\dev\\project',
        platform: 'win32',
      }),
    ).toEqual(['new-session', '-d', '-s', 'swarm-builder'])
  })

  it('keeps new-session -c on POSIX tmux', () => {
    expect(
      buildTmuxNewSessionArgs({
        sessionName: 'swarm-builder',
        cwd: '/srv/project',
        platform: 'linux',
      }),
    ).toEqual([
      'new-session',
      '-d',
      '-s',
      'swarm-builder',
      '-c',
      '/srv/project',
    ])
  })

  it('changes directory inside the Git Bash pane before launching Hermes on Windows', () => {
    const command = buildSwarmTmuxLaunchCommand({
      profilePath: 'C:\\Users\\test\\.hermes\\profiles\\builder',
      cwd: 'C:\\dev\\project',
      hermesBin: 'hermes',
      platform: 'win32',
      keepShellAlive: true,
    })

    expect(command).toContain("cd 'C:/dev/project' &&")
    expect(command).toContain(
      "HERMES_HOME='C:/Users/test/.hermes/profiles/builder'",
    )
    expect(command).toContain("'hermes' chat --tui")
    expect(command).toContain('[Hermes worker exited with status %s]')
  })

  it('delivers the launch command through the interactive pane', () => {
    expect(buildTmuxSendKeysArgs('swarm-builder', 'hermes chat --tui')).toEqual(
      ['send-keys', '-t', 'swarm-builder', 'hermes chat --tui', 'C-m'],
    )
  })

  it('uses set-buffer arguments on Windows instead of unsupported stdin loading', () => {
    expect(
      buildTmuxBufferLoad({
        bufferName: 'swarm-dispatch-builder',
        content: 'line one\nline two',
        platform: 'win32',
      }),
    ).toEqual({
      args: [
        'set-buffer',
        '-b',
        'swarm-dispatch-builder',
        '--',
        'line one\nline two',
      ],
    })
  })
})
