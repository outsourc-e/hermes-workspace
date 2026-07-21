import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSmartIntakeMission } from '../living-v3/smart-intake-v2'
import {
  CONTROLLED_AGENT_PROFILES,
  CONTROLLED_SMART_INTAKE_INPUT_MAX_CHARS,
  CONTROLLED_SMART_INTAKE_REQUIRED_BLOCKED_ACTIONS,
  buildControlledAgentPrompt,
  buildControlledAthenaPrompt,
  buildLiveAgentChatPrompt,
  controlledAgentHermesProfileId,
  extractJsonObjectFromHermesOutput,
  isControlledAgentId,
  liveAgentCapabilityPolicy,
  liveAgentHermesProfileId,
  normalizeControlledAgentOutput,
  normalizeControlledAthenaOutput,
  normalizeControlledSmartIntakeContext,
  runControlledAgentOneShot,
  sanitizeControlledRunnerError,
} from './controlled-athena-runner'
import { liveAgentContextPacket } from './live-agent-context-packets'

describe('controlled agent runner helpers', () => {
  it('builds prompts that forbid live actions for every approved controlled agent', () => {
    for (const agentId of Object.keys(CONTROLLED_AGENT_PROFILES)) {
      const prompt = buildControlledAgentPrompt(agentId as keyof typeof CONTROLLED_AGENT_PROFILES, 'run-safe-1')
      expect(prompt).toContain('run-safe-1')
      expect(prompt).toContain('max-turns=1')
      expect(prompt).toContain('Etsy')
      expect(prompt).toContain(`"agentId": "${agentId}"`)
      expect(prompt).toContain('JSON')
      if (agentId === 'scout') {
        expect(prompt).toContain('Use only read-only web/search tools')
        expect(prompt).toContain('productScout')
        expect(prompt).toContain('worker fan-out')
      } else if (agentId === 'smart-intake') {
        expect(prompt).toContain('Toolsets are none')
        expect(prompt).toContain('smartIntake')
        expect(prompt).toContain('Google OAuth/private read/write')
        expect(prompt).toContain('worker fan-out')
      } else if (String(agentId).startsWith('council-')) {
        if (agentId === 'council-julius') {
          expect(prompt).toContain('Council Chair')
        } else {
          expect(prompt).toContain('independent AI advisor')
        }
        expect(prompt).toContain('OBSIDIAN / SECOND BRAIN CONTEXT PACKET')
        expect(prompt).toContain('OTHER GENERAL OPINIONS')
        expect(prompt).toContain('Do not edit files')
        expect(prompt).toContain('worker fan-out')
        expect(prompt).toContain('council')
      } else {
        expect(prompt).toContain('Do not use tools')
        expect(prompt).toContain('Do not edit files')
        expect(prompt).toContain('external mutation')
      }
    }
  })

  it('builds live agent prompts with domain-scoped action policy and Hermes as master router', () => {
    const hermesPrompt = buildLiveAgentChatPrompt('hermes', 'live-policy-hermes', 'תמצא לי מוצר ותשלח אותו')
    expect(hermesPrompt).toContain('Hermes is the only master router')
    expect(hermesPrompt).toContain('master of all rooms/domains')
    expect(hermesPrompt).toContain('dangerous or external step')

    const terraPrompt = buildLiveAgentChatPrompt('terra', 'live-policy-terra', 'חפשי מודל להדפסה')
    expect(terraPrompt).toContain('Terra owns 3D/model/printer work')
    expect(terraPrompt).toContain('Model Hunt')
    expect(terraPrompt).toContain('SCOPED OBSIDIAN / SECOND BRAIN CONTEXT PACKET')
    expect(terraPrompt).toContain('06 Hermes/Terra Forge Workspace Memory.md')
    expect(terraPrompt).toContain('obsidian-terra-forge-v1')
    expect(terraPrompt).toContain('Do not use the words "local-only" or "read-only" in the Hebrew answer')

    const goblinPrompt = buildLiveAgentChatPrompt('goblin', 'live-policy-goblin', 'מצא הזדמנויות חדשות')
    expect(goblinPrompt).toContain('Goblin owns opportunity discovery')
    expect(goblinPrompt).toContain('Opportunity Packet')
    expect(goblinPrompt).toContain('obsidian-goblin-analytics-v1')
    expect(goblinPrompt).toContain('Etsy Market Lab - Product Tracker Index.md')

    const odinPrompt = buildLiveAgentChatPrompt('odin', 'live-policy-odin', 'האם הדראפט מוכן?')
    expect(odinPrompt).toContain('01 Projects/War Room/Etsy Market Lab - מקור אמת נוכחי.md')
    expect(odinPrompt).toContain('obsidian-odin-draft-approval-v1')

    const hannibalPrompt = buildLiveAgentChatPrompt('hannibal', 'live-policy-hannibal', 'מה יכול להישבר?')
    expect(hannibalPrompt).toContain('Council of Strategists - מקור אמת 2026-06-27')
    expect(hannibalPrompt).toContain('hidden risks')

    expect(liveAgentContextPacket('ares')).toBeNull()

    const lokiPolicy = liveAgentCapabilityPolicy('loki')
    expect(lokiPolicy).toContain('Loki owns Etsy product hunt')
    expect(lokiPolicy).toContain('Hermes')
  })

  it('maps approved animated Workspace agents to real Hermes profile ids and leaves deferred companions alone', () => {
    expect(liveAgentHermesProfileId('terra')).toBe('terra')
    expect(liveAgentHermesProfileId('goblin')).toBe('goblin')
    expect(liveAgentHermesProfileId('hermes')).toBe('default')
    expect(liveAgentHermesProfileId('loki')).toBe('loki')
    expect(liveAgentHermesProfileId('thor')).toBe('thor')
    expect(liveAgentHermesProfileId('odin')).toBe('odin')
    expect(liveAgentHermesProfileId('julius')).toBe('julius')
    expect(liveAgentHermesProfileId('hannibal')).toBe('hannibal')
    expect(liveAgentHermesProfileId('ares')).toBeNull()
    expect(liveAgentHermesProfileId('aphrodite')).toBeNull()
    expect(liveAgentHermesProfileId('heimdall')).toBeNull()
  })

  it('routes controlled one-shot workers through the approved real profile where one exists', () => {
    expect(controlledAgentHermesProfileId('hermes-command')).toBe('default')
    expect(controlledAgentHermesProfileId('scout')).toBe('loki')
    expect(controlledAgentHermesProfileId('smart-intake')).toBe('loki')
    expect(controlledAgentHermesProfileId('council-julius')).toBe('julius')
    expect(controlledAgentHermesProfileId('council-alexander')).toBe('alexander')
    expect(controlledAgentHermesProfileId('council-napoleon')).toBe('napoleon')
    expect(controlledAgentHermesProfileId('council-saladin')).toBe('saladin')
    expect(controlledAgentHermesProfileId('council-genghis')).toBe('genghis')
    expect(controlledAgentHermesProfileId('council-hannibal')).toBe('hannibal')
    expect(controlledAgentHermesProfileId('athena')).toBeNull()
    expect(controlledAgentHermesProfileId('hephaestus')).toBeNull()
  })

  it('keeps the Athena compatibility prompt', () => {
    expect(buildControlledAthenaPrompt('athena-safe-1')).toContain('"agentId": "athena"')
  })

  it('accepts only the first controlled agents', () => {
    expect(isControlledAgentId('athena')).toBe(true)
    expect(isControlledAgentId('hermes')).toBe(true)
    expect(isControlledAgentId('hephaestus')).toBe(true)
    expect(isControlledAgentId('scout')).toBe(true)
    expect(isControlledAgentId('smart-intake')).toBe(true)
    expect(isControlledAgentId('council-julius')).toBe(true)
    expect(isControlledAgentId('council-hannibal')).toBe(true)
    expect(isControlledAgentId('julius')).toBe(false)
  })

  it('bounds Smart Intake context and builds a no-tools JSON schema prompt', () => {
    const mission = createSmartIntakeMission([
      'Find a gold bow necklace and prepare local handoff.',
      'https://www.aliexpress.com/item/1005000000000000.html',
      'https://docs.google.com/spreadsheets/d/private/edit',
      'data/etsy-market-lab/imports/bow-necklace.png',
    ].join('\n'), 1_234)
    const context = normalizeControlledSmartIntakeContext({
      smartIntakeInput: `x`.repeat(CONTROLLED_SMART_INTAKE_INPUT_MAX_CHARS + 50),
      smartIntakeMission: mission,
    })
    expect(context?.input).toHaveLength(CONTROLLED_SMART_INTAKE_INPUT_MAX_CHARS)

    const prompt = buildControlledAgentPrompt('smart-intake', 'smart-run-1', context)
    expect(prompt).toContain('smart-run-1')
    expect(prompt).toContain('max-turns=1')
    expect(prompt).toContain('Toolsets are none')
    expect(prompt).toContain('Do not browse, fetch URLs')
    expect(prompt).toContain('source-1-aliexpress_link')
    expect(prompt).toContain('sourceReadback')
    expect(prompt).toContain('refinedProductMatches')
    expect(prompt).toContain('"agentId": "smart-intake"')
    for (const lockedAction of CONTROLLED_SMART_INTAKE_REQUIRED_BLOCKED_ACTIONS) {
      expect(prompt).toContain(lockedAction)
    }
  })

  it('extracts JSON after Hermes quiet-mode warnings', () => {
    const parsed = extractJsonObjectFromHermesOutput('Warning: Unknown toolsets: none\n\nsession_id: demo\n{"agentId":"athena","status":"completed_local_only","summary":"ok","nextSafeStep":"next","blockedActions":["Etsy"],"confidence":96}')
    expect(parsed).toMatchObject({ agentId: 'athena', confidence: 96 })
  })

  it('extracts JSON even when quiet-mode metadata follows the object', () => {
    const parsed = extractJsonObjectFromHermesOutput('before\n{"agentId":"hermes","status":"completed_local_only","summary":"ok","nextSafeStep":"next","blockedActions":["Etsy"],"confidence":96}\nsession_id: after-json')
    expect(parsed).toMatchObject({ agentId: 'hermes', confidence: 96 })
  })

  it('extracts the top-level agent JSON when nested productScout candidate objects exist', () => {
    const parsed = extractJsonObjectFromHermesOutput('noise\n' + JSON.stringify({
      agentId: 'scout',
      status: 'completed_local_only',
      summary: 'ok',
      nextSafeStep: 'next',
      blockedActions: ['Etsy'],
      confidence: 77,
      productScout: {
        query: 'gold initial necklace gifts',
        candidates: [{ title: 'Nested candidate', niche: 'gift jewelry', score: 70 }],
      },
    }) + '\nsession_id: nested')
    expect(parsed).toMatchObject({ agentId: 'scout', confidence: 77 })
    expect((parsed.productScout as { candidates?: Array<unknown> }).candidates).toHaveLength(1)
  })

  it('normalizes generic output defensively', () => {
    const output = normalizeControlledAgentOutput('hephaestus', {
      agentId: 'somebody-else',
      status: 'completed_local_only',
      summary: 'Safe summary',
      nextSafeStep: 'Safe next step',
      blockedActions: ['Etsy', 'supplier', 'purchase'],
      confidence: 140,
    })
    expect(output).toEqual({
      agentId: 'hephaestus',
      status: 'completed_local_only',
      summary: 'Safe summary',
      nextSafeStep: 'Safe next step',
      blockedActions: ['Etsy', 'supplier', 'purchase'],
      confidence: 100,
    })
  })

  it('normalizes Smart Intake worker JSON and keeps live actions locked', () => {
    const output = normalizeControlledAgentOutput('smart-intake', {
      agentId: 'smart-intake',
      status: 'completed_local_only',
      summary: 'Worker refined the local dossier.',
      nextSafeStep: 'Review local image evidence before Odin handoff.',
      blockedActions: ['Etsy live actions'],
      confidence: 140,
      smartIntake: {
        missionId: 'mission-1',
        sourceReadback: [
          { sourceId: 'source-1', kind: 'aliexpress_link', status: 'blocked_live', note: 'Reference text only.' },
          { sourceId: 'source-1', kind: 'aliexpress_link', status: 'blocked_live', note: 'Reference text only.' },
        ],
        refinedProductMatches: [
          {
            title: 'Gold Bow Necklace',
            niche: 'bow necklace jewelry',
            score: 150,
            evidenceIds: ['evidence-1', 'evidence-1'],
            sourceRecordIds: ['source-1'],
            imageNotes: ['Use local image ref only.'],
            missingEvidence: ['materials proof'],
            riskNotes: ['No live supplier proof.'],
            recommendedNextStep: 'Review dossier locally.',
          },
        ],
        dossierMarkdownAdditions: ['## Worker note\nVerify source image rights.'],
        shotLabPrepNotes: ['Do not generate paid media yet.'],
        missingEvidence: ['materials proof', 'materials proof'],
        warnings: ['no live reads were performed'],
      },
    })

    expect(output.status).toBe('completed_local_only')
    expect(output.confidence).toBe(100)
    expect(output.blockedActions).toEqual(expect.arrayContaining([...CONTROLLED_SMART_INTAKE_REQUIRED_BLOCKED_ACTIONS]))
    expect(output.smartIntake).toMatchObject({
      missionId: 'mission-1',
      dataOrigin: 'controlled-smart-intake-local',
      refinedProductMatches: [{ title: 'Gold Bow Necklace', score: 100 }],
    })
    expect(output.smartIntake?.refinedProductMatches[0]?.evidenceIds).toEqual(['evidence-1'])
  })

  it('fails Smart Intake output closed when typed payload is missing or live permissions are claimed', () => {
    const output = normalizeControlledAgentOutput('smart-intake', {
      agentId: 'smart-intake',
      status: 'completed_local_only',
      summary: 'Unsafe claim',
      nextSafeStep: 'Proceed live',
      blockedActions: [],
      confidence: 88,
      liveActionsAllowed: true,
    })

    expect(output.status).toBe('blocked')
    expect(output.blockedActions).toEqual(expect.arrayContaining([...CONTROLLED_SMART_INTAKE_REQUIRED_BLOCKED_ACTIONS]))
    expect(output.smartIntake?.warnings.join(' ')).toMatch(/failed closed/i)
    expect(output.smartIntake?.missingEvidence).toEqual(expect.arrayContaining(['valid Smart Intake worker JSON payload']))
  })

  it('normalizes Council output into a real no-fake advisor payload', () => {
    const output = normalizeControlledAgentOutput('council-hannibal', {
      agentId: 'council-hannibal',
      status: 'completed_local_only',
      summary: 'Hannibal found the flank.',
      nextSafeStep: 'Ask DLV to review the risk.',
      blockedActions: ['external actions'],
      confidence: 88,
      council: {
        generalId: 'hannibal',
        phase: 'peer-vote',
        opinion: 'הפלנק הוא שהממשק ירגיש עמוס אם כל הדעות מוצגות בבת אחת.',
        vote: 'neutral',
        voteReason: 'Proceed only if the summary stays simple.',
        recommendedOption: 'Command Room / Mission Control',
        confidence: 91,
        personalitySignal: 'flank and hidden risk',
        contextUsed: ['Council source of truth'],
        peerReadback: ['Napoleon wants metrics'],
        riskFlags: ['UI overload'],
        suggestedDecisionPatch: 'Keep top-level simple and hide depth behind drill-down.',
        suggestedFollowUp: 'Ask Hannibal what could break first.',
      },
    })

    expect(output.agentId).toBe('council-hannibal')
    expect(output.status).toBe('completed_local_only')
    expect(output.council).toMatchObject({
      generalId: 'hannibal',
      phase: 'peer-vote',
      vote: 'neutral',
      recommendedOption: 'Command Room / Mission Control',
      confidence: 91,
    })
    expect(output.council?.riskFlags).toEqual(['UI overload'])
  })

  it('keeps Athena normalization compatibility', () => {
    expect(normalizeControlledAthenaOutput({ summary: 'ok' }).agentId).toBe('athena')
  })

  it('supports dry-run mode without process spawning', async () => {
    const result = await runControlledAgentOneShot({ agentId: 'athena', runId: 'dry-run-test', dryRun: true })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected dry-run to return blocked result')
    expect('error' in result ? result.error : '').toContain('dry-run')
    expect(result.usage.mode).toBe('dry_run')
    expect(result.usage.budget).toBe('one Hermes CLI model call, max-turns=1')
    expect(result.output?.blockedActions).toEqual(expect.arrayContaining(['child_process', 'Hermes CLI']))
  })

  it('runs a bounded fake Hermes CLI one-shot and parses output, usage, and session id', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'war-room-fake-hermes-'))
    const fakeHermes = path.join(dir, 'hermes-fake.js')
    const argsFile = path.join(dir, 'args.json')
    writeFileSync(fakeHermes, `#!/usr/bin/env node\nconst fs = require('fs')\nfs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)))\nconsole.log('Warning: Unknown toolsets: none')\nconsole.log(JSON.stringify({ agentId: 'hermes', status: 'completed_local_only', summary: 'Hermes checked the local Etsy packet flow.', nextSafeStep: 'Return to FROZEN after one local handoff.', blockedActions: ['Etsy', 'suppliers', 'paid generation'], confidence: 98 }))\nconsole.log('session_id: fake-session-1')\nconsole.error('cost: $0.0001 fake')\n`, 'utf8')
    chmodSync(fakeHermes, 0o755)

    const result = await runControlledAgentOneShot({
      agentId: 'hermes',
      runId: 'fake-run-1',
      hermesCliPath: fakeHermes,
      timeoutMs: 5_000,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.sessionId).toBe('fake-session-1')
    expect(result.output).toMatchObject({ agentId: 'hermes', confidence: 98 })
    expect(result.usage.mode).toBe('real_hermes_one_shot')
    expect(result.usage.reportedCost).toContain('$0.0001')
    expect(result.usage.commandPreview).toContain('--profile default')
    expect(result.usage.commandPreview).toContain('--max-turns 1')
    expect(result.usage.commandPreview).not.toContain('-t none')
    const args = JSON.parse(readFileSync(argsFile, 'utf8')) as Array<string>
    expect(args.slice(0, 3)).toEqual(['--profile', 'default', 'chat'])
    expect(args).toEqual(expect.arrayContaining(['chat', '-Q', '--ignore-rules', '--max-turns', '1']))
    expect(args).not.toContain('-t')
    expect(args).not.toContain('none')
  })

  it('runs a bounded fake Smart Intake Hermes CLI one-shot without invalid toolset override', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'war-room-fake-smart-intake-'))
    const fakeHermes = path.join(dir, 'hermes-fake.js')
    const argsFile = path.join(dir, 'args.json')
    writeFileSync(fakeHermes, `#!/usr/bin/env node\nconst fs = require('fs')\nfs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)))\nconsole.log(JSON.stringify({ agentId: 'smart-intake', status: 'completed_local_only', summary: 'Smart Intake guidance returned.', nextSafeStep: 'Review the local dossier.', blockedActions: ['Etsy live actions'], confidence: 91, smartIntake: { missionId: 'mission-fake', dataOrigin: 'controlled-smart-intake-local', sourceReadback: [{ sourceId: 'source-1', kind: 'freeform_prompt', status: 'local_only', note: 'Prompt used as reference.' }], refinedProductMatches: [{ title: 'Gold Bow Necklace', niche: 'bow necklace jewelry', score: 82, evidenceIds: ['evidence-1'], sourceRecordIds: ['source-1'], imageNotes: ['Use local image ref.'], missingEvidence: ['materials proof'], riskNotes: ['No live proof.'], recommendedNextStep: 'Choose for Odin locally.' }], dossierMarkdownAdditions: ['## Worker note'], shotLabPrepNotes: ['Do not generate paid media yet.'], missingEvidence: ['materials proof'], warnings: ['no live reads were performed'] } }))\nconsole.log('session_id: fake-smart-intake')\nconsole.error('usage: 99 tokens fake')\n`, 'utf8')
    chmodSync(fakeHermes, 0o755)

    const result = await runControlledAgentOneShot({
      agentId: 'smart-intake',
      runId: 'smart-fake-run-1',
      hermesCliPath: fakeHermes,
      timeoutMs: 5_000,
      smartIntakeContext: normalizeControlledSmartIntakeContext({
        smartIntakeInput: 'Find bow necklace',
        smartIntakeMission: createSmartIntakeMission('Find bow necklace', 2_000),
      }),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.sessionId).toBe('fake-smart-intake')
    expect(result.output.smartIntake?.missionId).toBe('mission-fake')
    expect(result.output.blockedActions).toEqual(expect.arrayContaining([...CONTROLLED_SMART_INTAKE_REQUIRED_BLOCKED_ACTIONS]))
    expect(result.usage.commandPreview).toContain('--source war-room-controlled-smart-intake')
    expect(result.usage.commandPreview).toContain('--profile loki')
    expect(result.usage.commandPreview).not.toContain('-t none')
    const args = JSON.parse(readFileSync(argsFile, 'utf8')) as Array<string>
    expect(args.slice(0, 3)).toEqual(['--profile', 'loki', 'chat'])
    expect(args).toEqual(expect.arrayContaining(['chat', '-Q', '--ignore-rules', '--max-turns', '1']))
    expect(args).not.toContain('-t')
    expect(args).not.toContain('none')
  })

  it('hides raw Hermes command and prompt text from runner errors', async () => {
    const raw = 'Hannibal. Command failed: /Users/mac/.hermes/hermes-agent/venv/bin/hermes --profile hannibal chat -Q --ignore-rules --max-turns 1 -t none -q You are Hannibal. IMPORTANT IDENTITY RULES: Return JSON only'
    expect(sanitizeControlledRunnerError(raw)).toContain('Technical command/prompt details are hidden')
    expect(sanitizeControlledRunnerError(raw)).not.toContain('--profile')
    expect(sanitizeControlledRunnerError(raw)).not.toContain('IMPORTANT IDENTITY RULES')

    const dir = mkdtempSync(path.join(tmpdir(), 'war-room-fake-raw-error-'))
    const fakeHermes = path.join(dir, 'hermes-fake.js')
    writeFileSync(fakeHermes, `#!/usr/bin/env node\nconsole.error(${JSON.stringify(raw)})\nprocess.exit(1)\n`, 'utf8')
    chmodSync(fakeHermes, 0o755)

    const result = await runControlledAgentOneShot({
      agentId: 'council-hannibal',
      runId: 'raw-error-run-1',
      hermesCliPath: fakeHermes,
      timeoutMs: 5_000,
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected raw runner error to fail')
    expect(result.error).toContain('Technical command/prompt details are hidden')
    expect(result.error).not.toContain('--profile')
    expect(result.error).not.toContain('IMPORTANT IDENTITY RULES')
  })
})
