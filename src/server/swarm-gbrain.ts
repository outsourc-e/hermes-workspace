import { spawn } from 'node:child_process'

export function captureMissionOutcome(input: {
  missionId: string
  title: string
  state: string
  result: string
  source: string
}): void {
  const slug = `operational-memory/workspace-mission-${input.missionId}`
  const content = [
    '---',
    `title: Workspace mission ${input.missionId}`,
    'type: operational-memory',
    'tags: [workspace, hermes, mission, outcome]',
    '---',
    '',
    `# ${input.title}`,
    '',
    `- [Source: ${input.source}] Mission ID: ${input.missionId}`,
    `- [Source: ${input.source}] Final state: ${input.state}`,
    `- [Source: ${input.source}] Outcome: ${input.result}`,
    '',
  ].join('\n')
  const gbrainBin =
    process.env.GBRAIN_BIN?.trim() || '/home/takon/.bun/bin/gbrain'
  const child = spawn(gbrainBin, ['put', slug], {
    stdio: ['pipe', 'ignore', 'ignore'],
  })
  child.on('error', () => {
    // Capture is best-effort; a missing CLI must not crash Workspace.
  })
  child.stdin.end(content)
}
