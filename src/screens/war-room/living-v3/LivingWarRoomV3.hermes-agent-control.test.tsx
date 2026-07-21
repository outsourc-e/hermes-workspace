import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = path.dirname(fileURLToPath(import.meta.url))

function read(name: string) {
  return readFileSync(path.join(dir, name), 'utf8')
}

describe('Hermes Command action cockpit and agent controls', () => {
  it('keeps agent-control contracts while making the purpose-built cockpit primary', () => {
    const source = read('LivingWarRoomV3.tsx')
    const cockpit = read('HermesCommandCockpit.tsx')
    const cockpitCss = read('hermes-command-cockpit.css')

    expect(source).toContain("import { HermesCommandCockpit } from './HermesCommandCockpit'")
    expect(source).toContain('data-command-desk-layout="action-v2"')
    expect(source).toContain('<HermesCommandCockpit')
    expect(source).toContain('sourceDetails={(')

    expect(cockpit).toContain('data-hermes-command-cockpit="action-cockpit-v1"')
    expect(cockpit).toContain('data-command-focus-canvas="text-driven-v2"')
    expect(cockpit).toContain('data-command-cockpit-run="true"')
    expect(cockpit).toContain('/war-room/olympus-command/hermes-90frame-v1/processed/hermes-model.png')
    expect(cockpit).toContain("['01', 'בקשה']")
    expect(cockpit).toContain("['04', 'אישור']")
    expect(cockpit).toContain('פעולות חיצוניות נעולות')

    expect(cockpitCss).toContain("data-command-desk-layout='action-v2'")
    expect(cockpitCss).toContain("grid-template-columns: minmax(0, 1fr) !important;")
    expect(cockpitCss).toContain('Canonical desktop command hierarchy')
    expect(cockpitCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(source).not.toContain('data-command-quiet-status="user-first-v1"')
    expect(source).not.toContain('className="living-v3__manager-proof"')

    expect(source).toContain('type CommandAgentControlRow')
    expect(source).toContain('function commandAgentStatusTone')
    expect(source).toContain('const commandAgentControlRoster = useMemo<Array<CommandAgentControlRow>>')
    expect(source).toContain('data-hermes-agent-control-tool="status-control-v1"')
    expect(source).toContain('data-agent-control-count={agentRoster.length}')
    expect(source).toContain('className="living-v3__agent-control-row-main"')
    expect(source).toContain('className="living-v3__agent-control-active-actions"')
    expect(source).toContain('data-agent-control-card={agent.agentId}')
    expect(source).toContain('data-agent-control-talk={activeRosterRow.agentId}')
    expect(source).toContain('data-agent-control-focus={activeRosterRow.agentId}')
    expect(source).toContain('data-agent-control-work={activeRosterRow.agentId}')
    expect(source).toContain('data-agent-control-rest={activeRosterRow.agentId}')
    expect(source).toContain('data-agent-control-run={profile.agentId}')
    expect(source).toContain('const commandActionAgentLabel = agentRoster.find((agent) => agent.agentId === actionRun.assignedAgentId)?.label ?? actionRun.assignedAgentId')
    expect(source).toContain('commandActionAgentLabel,')
    expect(source).not.toContain('activeRosterRow ? activeRosterRow.label : undefined')
    expect(source).toContain('onTalkAgent={openAgentControlChat}')
    expect(source).toContain('onFocusAgent={focusAgentFromCommandControl}')
    expect(source).toContain('onAssignAgentPrimaryStation={assignAgentPrimaryStationFromCommand}')
    expect(source).toContain('onRestAgent={restAgentFromCommandControl}')
    expect(source).toContain('onRunControlledAgent={activateControlledAgentRun}')
  })
})
