import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dir, '../../../..')

const generalSlugs = [
  'julius-caesar-general-v1',
  'alexander-general-v1',
  'hannibal-barca-general-v1',
  'napoleon-bonaparte-general-v1',
  'saladin-general-v1',
  'genghis-khan-general-v1',
]

const profileIds = ['julius', 'alexander', 'napoleon', 'saladin', 'genghis', 'hannibal']

describe('Council of Strategists group-chat workbench', () => {
  it('uses real Council profiles with Julius as chair and keeps local fake answers out of the active flow', () => {
    const surface = readFileSync(path.join(dir, 'CouncilChamberSurface.tsx'), 'utf8')
    const runner = readFileSync(path.join(repoRoot, 'src/lib/war-room/body/controlled-athena-runner.ts'), 'utf8')
    const councilRunner = readFileSync(path.join(repoRoot, 'src/lib/war-room/body/controlled-council-runner.ts'), 'utf8')

    for (const id of profileIds) {
      expect(runner).toContain(`'council-${id}': '${id}'`)
      expect(surface).toContain(`id: '${id}'`)
    }

    expect(runner).toContain("...hermesProfileArgs(profileId)")
    expect(runner).toContain("'--profile'")
    expect(councilRunner).toContain('runControlledAgentOneShot')
    expect(councilRunner).toContain('previousOpinions')
    expect(councilRunner).toContain("const COUNCIL_CHAIR_AGENT_ID: ControlledCouncilAgentId = 'council-julius'")
    expect(councilRunner).toContain('nonChairCouncilAgentIds')
    expect(councilRunner).toContain('independentBlindCouncilInstruction')
    expect(councilRunner).toContain('councilDiscussionPassInstruction')
    expect(councilRunner).toContain('juliusChairSynthesisInstruction')
    expect(councilRunner).toContain("const phase = 'synthesis' as const")
    expect(surface).toContain('data-council-runtime-agent-scope="five-independent-advisors-plus-julius-chair"')
    expect(surface).toContain("const COUNCIL_CHAIR_GENERAL_ID = 'julius'")
    expect(surface).toContain('data-council-no-fake-responses')
    expect(surface).toContain('blockedCouncilSession')
    expect(surface).not.toContain('<CouncilDecisionSummary')
  })

  it('makes the group conversation primary and reveals real turns with accessible light motion', () => {
    const surface = readFileSync(path.join(dir, 'CouncilChamberSurface.tsx'), 'utf8')
    const groupChat = readFileSync(path.join(dir, 'CouncilGroupChatWorkbench.tsx'), 'utf8')
    const groupCss = readFileSync(path.join(dir, 'council-group-chat-workbench.css'), 'utf8')

    expect(existsSync(path.join(dir, 'CouncilGroupChatWorkbench.tsx'))).toBe(true)
    expect(existsSync(path.join(dir, 'council-group-chat-workbench.css'))).toBe(true)
    expect(surface).toContain('<CouncilGroupChatWorkbench')
    expect(surface).toContain('data-council-design-pass="group-chat-v1"')
    expect(surface).toContain('data-council-chat-native="live-group-thread-v2"')
    expect(groupChat).toContain('data-council-group-chat="primary-v1"')
    expect(groupChat).toContain('data-council-group-start="canonical"')
    expect(groupChat).toContain("data-council-group-session={sessionActive ? 'active' : 'start'}")
    expect(surface).toContain('data-council-primary-ui="canonical-group-chat-only-v1"')
    expect(surface).toContain('data-council-canonical-surface="desktop-group-chat-v1"')
    expect(surface).toContain('sessionActive={Boolean(session)}')
    expect(surface.match(/<CouncilGroupChatWorkbench/g)).toHaveLength(1)
    expect(surface).not.toContain('<div className="council-chamber__room"')
    expect(surface).not.toContain('data-council-question-card="true"')
    expect(surface).not.toContain('data-council-full-transcript="collapsed"')
    expect(surface).not.toContain('<details className="council-chamber__selected"')
    expect(groupChat).toContain('aria-live="polite"')
    expect(groupChat).toContain('data-council-word-reveal="true"')
    expect(groupChat).toContain('data-council-group-message="typing"')
    expect(groupChat).toContain('data-council-group-message="pinned-summary"')
    expect(groupChat).toContain('אפשר להמשיך לדבר, לשאול גנרל אחד')
    expect(groupChat).toContain('data-council-private-advisor-entry="visible"')
    expect(groupChat).toContain('data-council-team-selection-visible="true"')
    expect(groupChat).toContain('פתח פרטי')
    expect(groupChat).toContain('בחר צוות פירוק')
    expect(groupCss).toContain('animation: council-word-reveal')
    expect(groupCss).toContain('transform: translateY(6px)')
    expect(groupCss).toContain('.council-group-chat__private-pill')
    expect(groupCss).toContain('button.is-team-cta')
    expect(groupCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(groupCss).toContain('animation-duration: 0.01ms !important')
  })

  it('requires an operator-selected planning team before Hermes handoff', () => {
    const surface = readFileSync(path.join(dir, 'CouncilChamberSurface.tsx'), 'utf8')
    const groupChat = readFileSync(path.join(dir, 'CouncilGroupChatWorkbench.tsx'), 'utf8')

    expect(surface).toContain("type CouncilFlowStage = 'discussion' | 'team-selection' | 'plan-drafting' | 'ready-for-hermes'")
    expect(surface).toContain('selectedPlanningGeneralIds')
    expect(surface).toContain("targetGeneralId: 'planning-team'")
    expect(surface).toContain('runCouncilAgentQueue(pendingSession, planningTopic, selectedPlanningGeneralIds)')
    expect(surface).toContain('planningGeneralIds: selectedPlanningGeneralIds')
    expect(surface).toContain('planningGeneralNames: selectedPlanningGeneralNames')
    expect(surface).toContain("setFlowStage('ready-for-hermes')")
    expect(surface).toContain("setHandoffState('unlocked')")
    expect(groupChat).toContain('data-council-planning-team-picker="true"')
    expect(groupChat).toContain('data-council-planning-agent={member.id}')
    expect(groupChat).toContain('data-council-request-plan="true"')
    expect(groupChat).toContain('data-council-handoff-to-hermes="true"')
    expect(groupChat).toContain('disabled={selectedMembers.length === 0}')
  })

  it('canonicalizes every Council room entry to the chat station and closes back to the map', () => {
    const routeSource = readFileSync(path.join(dir, 'LivingWarRoomV3.tsx'), 'utf8')

    expect(routeSource).toContain("const canonicalSelection = roomId === 'council-strategists' && nextSelection === null")
    expect(routeSource).toContain("? { kind: 'station' as const, id: 'council-table' as const }")
    expect(routeSource).toContain('setSelection(canonicalSelection)')
    expect(routeSource).toContain('className="living-v3__workspace-close-x"')
    expect(routeSource).toContain('onClick={focusMap}')
    expect(routeSource).not.toContain('onClick={() => focusRoom(selectedStation.roomId)}')
  })

  it('preserves the room, archive, advisor drilldown, routes, and general assets', () => {
    const surface = readFileSync(path.join(dir, 'CouncilChamberSurface.tsx'), 'utf8')
    const routeSource = readFileSync(path.join(dir, 'LivingWarRoomV3.tsx'), 'utf8')

    expect(surface).toContain('data-council-room="strategists-v1"')
    expect(surface).toContain('data-room-ownership="council-decision-only"')
    expect(surface).toContain('COUNCIL_PERSISTENCE_STORAGE_KEY')
    expect(surface).toContain('COUNCIL_ARCHIVE_STORAGE_KEY')
    expect(surface).toContain('data-council-resume-until-new-discussion="true"')
    expect(surface).toContain('data-council-advisor-chat="portrait-bubbles-v1"')
    expect(surface).toContain('sessionFromDrawingBoardDiscussion')
    expect(surface).toContain("method: 'DELETE'")
    expect(surface).toContain('/api/war-room/council/run')
    expect(surface).toContain('/api/war-room/council/follow-up')
    expect(routeSource).toContain('transferCouncilDecisionToHermes')

    for (const slug of generalSlugs) {
      expect(surface).toContain(slug)
      expect(existsSync(path.join(repoRoot, 'public/war-room/living-v3/generals-council', slug, 'spritesheet.png'))).toBe(true)
      expect(existsSync(path.join(repoRoot, 'public/war-room/living-v3/generals-council', slug, 'runtime', 'portrait.png'))).toBe(true)
    }
  })
})
