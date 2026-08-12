import { describe, expect, it } from 'vitest'
import { buildTmuxAttachCommand, isTmuxAttachCommand } from './tmux-attach'

describe('buildTmuxAttachCommand', () => {
  it('unsets TMUX so nested attach works from a tmux-hosted dev server', () => {
    expect(buildTmuxAttachCommand('swarm-researcher')).toEqual([
      'env',
      '-u',
      'TMUX',
      '-u',
      'TMUX_PANE',
      'tmux',
      'attach',
      '-t',
      'swarm-researcher',
    ])
  })
})

describe('isTmuxAttachCommand', () => {
  it('detects tmux attach argv', () => {
    expect(isTmuxAttachCommand(buildTmuxAttachCommand('swarm-researcher'))).toBe(true)
    expect(isTmuxAttachCommand(['zsh', '-l'])).toBe(false)
  })
})
