/** Build argv for attaching to an existing tmux session from a web PTY. */
export function buildTmuxAttachCommand(sessionName: string): Array<string> {
  // When pnpm dev runs inside tmux, inherited TMUX blocks nested attach and the
  // subprocess exits immediately — Runtime shows "session closed" while `tmux ls`
  // still lists the worker session.
  return ['env', '-u', 'TMUX', '-u', 'TMUX_PANE', 'tmux', 'attach', '-t', sessionName]
}

export function isTmuxAttachCommand(command: Array<string>): boolean {
  const tmuxIndex = command.indexOf('tmux')
  if (tmuxIndex < 0) return false
  return command[tmuxIndex + 1] === 'attach'
}
