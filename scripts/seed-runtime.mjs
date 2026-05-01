import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PROFILES = path.join(os.homedir(), '.claude', 'profiles')
const NOW = Date.now()
const LANES = {
  swarm1:  ['PR / Issues', 'Triage open PRs and surface review-ready items for the orchestrator', 'Standing by on PR/issues lane; tmux session live and wrapper wired.', '/Users/aurora/hermes-workspace'],
  swarm6:  ['Reviewer', 'Review pending diffs and gate merges with checklist + tests', 'Reviewer lane initialized; awaiting first dispatch.', '/Users/aurora/hermes-workspace'],
  swarm7:  ['Docs', 'Maintain handoffs, README updates, and skill documentation', 'Docs lane initialized; runtime contract adopted.', '/Users/aurora/hermes-workspace'],
  swarm8:  ['Ops', 'Track infra, gateways, schedulers, and operational health', 'Ops lane initialized; ready to monitor swarm health.', '/Users/aurora/.ocplatform/workspace'],
  swarm9:  ['Hackathon', 'Prototype experimental flows and one-off agent missions', 'Hackathon lane initialized; sandbox ready.', '/Users/aurora/hermes-workspace'],
  swarm10: ['Builder', 'Implement feature work assigned by the orchestrator', 'Builder lane initialized; ready for next ticket.', '/Users/aurora/hermes-workspace'],
  swarm11: ['Reviewer', 'Secondary review lane for high-throughput periods', 'Reviewer lane initialized; ready for parallel review.', '/Users/aurora/hermes-workspace'],
  swarm12: ['PR / Issues', 'Backup PR/issues lane for parallel triage', 'PR/issues secondary lane initialized.', '/Users/aurora/hermes-workspace'],
  swarm1_existing: null,
}
for (const [wid, v] of Object.entries(LANES)) {
  if (!v) continue
  const [role, task, summary, cwd] = v
  const dir = path.join(PROFILES, wid)
  fs.mkdirSync(dir, { recursive: true })
  const data = {
    workerId: wid, role, state: 'idle', phase: 'standby',
    currentTask: task, activeTool: '', cwd,
    lastOutputAt: NOW, startedAt: NOW, lastCheckIn: '2026-04-28T02:25:00Z',
    lastSummary: summary, lastResult: '', nextAction: 'Awaiting orchestrator dispatch',
    needsHuman: false, blockedReason: '', checkpointStatus: 'none',
    assignedTaskCount: 0, cronJobCount: 0,
  }
  fs.writeFileSync(path.join(dir, 'runtime.json'), JSON.stringify(data, null, 2))
  console.log(`wrote ${wid}: ${role}`)
}
