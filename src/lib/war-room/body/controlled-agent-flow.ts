import {  livingV3AgentById, livingV3StationById } from '../living-v3/living-v3-contract'
import {  searchTerraInternetModels } from '../terra/terra-model-search'
import {
  dispatchWarRoomIntent,
  getWarRoomBodyState,
  requestWarRoomApproval,
} from './runtime'
import {
  freezeWarRoomAgents,
  getAgentConnectionState,
  setWarRoomAgentsLocalOnly,
} from './agent-connection-control'
import {




  controlledAgentProfile,
  isControlledAgentId,
  runControlledAgentOneShot,
  runControlledLiveAgentChat
} from './controlled-athena-runner'
import {  runEtsyRoomLocalIntentBridge } from './etsy-room-event-bridge'
import type {ControlledAgentId, ControlledAgentUsage, ControlledLiveAgentChatResult, ControlledSmartIntakeContext} from './controlled-athena-runner';
import type {TerraInternetModelSearchResult} from '../terra/terra-model-search';
import type {LivingV3AgentId} from '../living-v3/living-v3-contract';
import type {EtsyRoomLocalBridgeResult} from './etsy-room-event-bridge';

export type ControlledAgentFlowResult = {
  ok: boolean
  runId: string
  agentId: ControlledAgentId
  result: Awaited<ReturnType<typeof runControlledAgentOneShot>>
  control: ReturnType<typeof getAgentConnectionState>
  state: ReturnType<typeof getWarRoomBodyState>
  etsyRoomState?: EtsyRoomLocalBridgeResult['etsyRoomState']
}

export function createControlledAgentRunId(agentId: ControlledAgentId) {
  return `${agentId}-ui-${Date.now().toString(36)}`
}

export function parseControlledAgentId(value: unknown): ControlledAgentId {
  if (isControlledAgentId(value)) return value
  throw new Error('Unsupported controlled agent. Allowed: athena, hermes, hermes-command, hephaestus, scout, smart-intake.')
}

function truncateForSpeech(value: string) {
  return value.length > 220 ? `${value.slice(0, 217)}...` : value
}

function controlledUsageReadback(result: Awaited<ReturnType<typeof runControlledAgentOneShot>>) {
  return result.usage.reportedCost
    ?? result.usage.reportedUsageLine
    ?? `actual cost not reported by Hermes CLI; budget: ${result.usage.budget}`
}

const controlledAgentRunsInFlight = new Set<ControlledAgentId>()

export async function runControlledAgentFlow(input: {
  agentId: ControlledAgentId
  operatorNote?: string
  cwd?: string
  smartIntakeContext?: ControlledSmartIntakeContext
}) {
  const profile = controlledAgentProfile(input.agentId)
  if (controlledAgentRunsInFlight.has(input.agentId)) {
    throw new Error(`${profile.label} is already running a controlled one-shot.`)
  }
  controlledAgentRunsInFlight.add(input.agentId)
  const runId = createControlledAgentRunId(input.agentId)
  const taskId = `${runId}-task`
  const correlationId = `${runId}-operator`

  try {
    let etsyRoomResult: EtsyRoomLocalBridgeResult | undefined
    setWarRoomAgentsLocalOnly({
      reason: `Controlled ${profile.label} run started from UI; one model call only, external actions locked.`,
      updatedBy: 'ui',
      runId,
    })
    dispatchWarRoomIntent({
      type: 'move_to_station',
      agentId: profile.agentId,
      roomId: profile.roomId,
      stationId: profile.stationId,
      source: 'hermes',
      runId,
      correlationId: `${correlationId}-move`,
    })
    dispatchWarRoomIntent({
      type: 'say',
      agentId: profile.agentId,
      roomId: profile.roomId,
      stationId: profile.stationId,
      text: `${profile.label} is starting one controlled local-only run. External actions remain locked.`,
      source: 'hermes',
      runId,
      correlationId: `${correlationId}-start`,
    })

    const result = await runControlledAgentOneShot({
      agentId: input.agentId,
      runId,
      cwd: input.cwd,
      smartIntakeContext: input.smartIntakeContext,
      operatorNote: input.operatorNote,
    })
    if (result.ok) {
      const usageReadback = controlledUsageReadback(result)
      if (input.agentId === 'scout' && result.output.productScout) {
        const scout = result.output.productScout
        etsyRoomResult = await runEtsyRoomLocalIntentBridge({
          type: 'apply_product_scout_worker_packet_local',
          prompt: scout.query,
          workerRunId: runId,
          workerSummary: result.output.summary,
          candidates: scout.candidates,
          evidenceIds: scout.evidenceIds,
          sourceRecordIds: scout.sourceRecordIds,
          missingFields: scout.missingFields,
          runId,
          correlationId: `${correlationId}-scout-packet`,
        })
      }
      dispatchWarRoomIntent({
        type: 'work_at_station',
        agentId: profile.agentId,
        roomId: profile.roomId,
        stationId: profile.stationId,
        taskId,
        source: 'hermes',
        runId,
        correlationId: `${correlationId}-work`,
      })
      dispatchWarRoomIntent({
        type: 'say',
        agentId: profile.agentId,
        roomId: profile.roomId,
        stationId: profile.stationId,
        text: truncateForSpeech(`${profile.label} finished: ${result.output.summary}`),
        source: 'hermes',
        runId,
        correlationId: `${correlationId}-result`,
      })
      if (input.agentId !== 'hermes-command') {
        requestWarRoomApproval({
          agentId: profile.agentId,
          roomId: profile.roomId,
          stationId: profile.stationId,
          taskId,
          reason: `${profile.label} one-shot completed (${result.output.confidence}/100): ${result.output.nextSafeStep}. Usage: ${usageReadback}.`,
          evidence: [
            { evidenceId: `${runId}-summary`, label: result.output.summary, kind: 'note' },
            { evidenceId: `${runId}-session`, label: result.sessionId ? `Hermes session ${result.sessionId}` : 'Hermes one-shot session recorded', kind: 'metric' },
            { evidenceId: `${runId}-usage`, label: usageReadback, kind: 'metric' },
          ],
          riskLevel: 'low',
          requestedAction: input.operatorNote ?? `Review ${profile.label} local-only recommendation`,
          allowedAction: 'Record local decision / run another one-agent controlled step only',
          lockedAction: 'Etsy, supplier, Discord, paid generation, purchase, publish, account actions, worker fan-out',
          source: 'hermes',
          runId,
          correlationId: `${correlationId}-approval`,
        })
      }
    } else {
      dispatchWarRoomIntent({
        type: 'raise_alert',
        agentId: profile.agentId,
        severity: 'warning',
        text: truncateForSpeech(`Controlled ${profile.label} run failed: ${result.error}`),
        source: 'hermes',
        runId,
        correlationId: `${correlationId}-failed`,
      })
    }

    freezeWarRoomAgents({
      reason: `Controlled ${profile.label} one-shot completed; agents frozen again.`,
      updatedBy: 'system',
      runId,
    })

    return {
      ok: result.ok,
      runId,
      agentId: input.agentId,
      result,
      control: getAgentConnectionState(),
      state: getWarRoomBodyState(),
      etsyRoomState: etsyRoomResult?.etsyRoomState,
    } satisfies ControlledAgentFlowResult
  } catch (error) {
    freezeWarRoomAgents({
      reason: `Controlled ${profile.label} run failed; agents frozen fail-closed.`,
      updatedBy: 'system',
      runId,
    })
    throw error
  } finally {
    controlledAgentRunsInFlight.delete(input.agentId)
  }
}

export type LiveAgentActionSystemRun = {
  actionRunId: string
  requestedByAgentId: LivingV3AgentId
  assignedAgentId: LivingV3AgentId
  status: 'chat_only' | 'waiting_operator' | 'running_host_tool' | 'completed_host_tool' | 'blocked_missing_capability' | 'blocked_tool_error'
  intent: 'chat' | 'council_consultation_offer' | 'terra_model_search' | 'unsupported_action'
  capability: 'available' | 'missing' | 'not_needed'
  targetRoomId?: string
  targetStationId?: string
  toolId?: string
  operatorRequest: string
  readback: string
  visualNextStep: string
  missingCapability?: {
    title: string
    whyMissing: string
    buildPlan: Array<string>
    suggestedOwner: 'hermes' | 'codex' | 'terra' | 'loki' | 'thor' | 'odin'
  }
}

export type ControlledLiveAgentChatFlowResult = {
  ok: boolean
  runId: string
  agentId: LivingV3AgentId
  result: ControlledLiveAgentChatResult
  control: ReturnType<typeof getAgentConnectionState>
  state: ReturnType<typeof getWarRoomBodyState>
  terraModelSearch?: TerraInternetModelSearchResult
  actionSystemRun?: LiveAgentActionSystemRun
}

export function createLiveAgentChatRunId(agentId: LivingV3AgentId) {
  return `live-chat-${agentId}-${Date.now().toString(36)}`
}

export function parseLiveAgentChatId(value: unknown): LivingV3AgentId {
  if (typeof value === 'string' && livingV3AgentById(value as LivingV3AgentId)) {
    return value as LivingV3AgentId
  }
  throw new Error('Unsupported live agent chat id.')
}

function liveAgentUsageReadback(result: ControlledLiveAgentChatResult) {
  return result.usage.reportedCost
    ?? result.usage.reportedUsageLine
    ?? `actual cost not reported by Hermes CLI; budget: ${result.usage.budget}`
}

function isExplicitWorkspaceAction(operatorNote?: string) {
  const text = operatorNote ?? ''
  return /(search|find|prepare|make|create|build|print|send|upload|publish|buy|delete|edit|show|display|חפש|חיפוש|מצא|תמצא|תמצאי|הכן|תכין|תכיני|צור|תיצור|בנה|תבנה|הדפס|שלח|תשלח|עלה|פרסם|קנה|מחק|ערוך|תציג|הצג)/i.test(text)
}

function textMentionsTerra(operatorNote?: string) {
  return /(terra|טרה)/i.test(operatorNote ?? '')
}

function textIsTerraModelSearch(operatorNote?: string) {
  const text = operatorNote ?? ''
  if (!text.trim()) return false
  if (/\b(no|without|don't)\b.*\b(search|internet|live)\b/i.test(text) || /בלי\s+(חיפוש|אינטרנט|לייב)|אל\s+תחפש/.test(text)) return false
  return /(model|models|stl|3mf|printables|thingiverse|makerworld|fidget|toy|מודל|מודלים|הדפס|הדפסה|פידג|פיג'ט|פידג׳ט|פידגט|חפש|חיפוש|לייב|אינטרנט)/i.test(text)
}

function shouldRunTerraReadOnlyModelSearch(agentId: LivingV3AgentId, operatorNote?: string) {
  if (agentId === 'terra') return textIsTerraModelSearch(operatorNote)
  // Hermes is allowed to route a clear Terra/model request into Terra's room/tool.
  if (agentId === 'hermes' && textMentionsTerra(operatorNote)) return textIsTerraModelSearch(operatorNote)
  return false
}

function shouldOfferCouncilConsultation(agentId: LivingV3AgentId, operatorNote?: string) {
  if (agentId !== 'hermes') return false
  const text = operatorNote?.trim() ?? ''
  if (!text) return false
  const explicitCouncilRequest = /(?:שאל|תשאל|התייעץ|תתייעץ|כנס|תכנס|העבר|תעביר).{0,28}(?:מועצ|יועצ|גנרל)|(?:council|advisors?|generals?).{0,28}(?:ask|consult|convene|debate)/i.test(text)
  const strategicDecision = /(?:אסטרטג|החלטה|כיוון|חלופה|עדיפות|סיכון|trade[ -]?off|strateg|decision|direction|priority|risk)/i.test(text)
    && /(?:מה|האם|כדאי|נכון|עדיף|צריך|לבחור|להחליט|which|what|should|choose|decide|worth)/i.test(text)
  return explicitCouncilRequest || strategicDecision
}

export function liveAgentActionIntentFor(agentId: LivingV3AgentId, operatorNote?: string): LiveAgentActionSystemRun['intent'] {
  if (shouldRunTerraReadOnlyModelSearch(agentId, operatorNote)) return 'terra_model_search'
  if (shouldOfferCouncilConsultation(agentId, operatorNote)) return 'council_consultation_offer'
  return isExplicitWorkspaceAction(operatorNote) ? 'unsupported_action' : 'chat'
}

export function requestedTerraSearchLimit(operatorNote?: string) {
  const text = operatorNote ?? ''
  const explicit = Array.from(text.matchAll(/(?:^|\D)(\d{1,2})(?:\D|$)/g))
    .map((match) => Number(match[1]))
    .find((value) => Number.isFinite(value) && value > 0)
  if (!explicit) return 12
  return Math.max(1, Math.min(24, Math.floor(explicit)))
}

function localActionSystemUsage(actionRun: LiveAgentActionSystemRun): ControlledAgentUsage {
  const localOnly = actionRun.status === 'waiting_operator' || actionRun.status === 'blocked_missing_capability'
  return {
    mode: 'dry_run',
    budget: localOnly ? 'local routing only; 0 model calls' : 'one Hermes CLI model call, max-turns=1',
    timeoutMs: 0,
    toolsets: 'none',
    commandPreview: `workspace-action-system ${actionRun.intent} --capability ${actionRun.capability}`,
    reportedCost: '0 model calls; capability/approval check stopped before agent execution',
    reportedUsageLine: null,
    note: 'Workspace Action System V1 local routing result. No Hermes CLI process spawned.',
  }
}

function createMissingCapabilityLiveResult(runId: string, agentId: LivingV3AgentId, actionRun: LiveAgentActionSystemRun): ControlledLiveAgentChatResult {
  return {
    ok: false,
    runId,
    agentId,
    durationMs: 0,
    error: actionRun.readback,
    usage: localActionSystemUsage(actionRun),
    output: {
      agentId,
      status: 'blocked',
      answer: [
        actionRun.readback,
        `צריך לבנות: ${actionRun.missingCapability?.buildPlan.slice(0, 3).join(' → ')}`,
      ].join('\n'),
      summary: actionRun.readback,
      nextSafeStep: actionRun.visualNextStep,
      blockedActions: ['missing_host_tool', 'missing_visual_artifact', 'unsafe_live_action_until_capability_exists'],
      confidence: 100,
    },
    rawStdout: '',
    rawStderr: '',
  }
}

function createChatOnlyActionSystemRun(runId: string, agentId: LivingV3AgentId, operatorNote?: string): LiveAgentActionSystemRun {
  return {
    actionRunId: `${runId}-action-system`,
    requestedByAgentId: agentId,
    assignedAgentId: agentId,
    status: 'chat_only',
    intent: 'chat',
    capability: 'not_needed',
    operatorRequest: operatorNote ?? '',
    readback: 'שיחה רגילה: אין כלי להריץ ואין שינוי במסך מעבר לתשובה.',
    visualNextStep: 'אם זו פעולה אמיתית, כתוב חפש / הכן / בנה / תציג / שלח וכו׳.',
  }
}

function createCouncilConsultationOfferActionSystemRun(runId: string, operatorNote?: string): LiveAgentActionSystemRun {
  return {
    actionRunId: `${runId}-action-system`,
    requestedByAgentId: 'hermes',
    assignedAgentId: 'hermes',
    status: 'waiting_operator',
    intent: 'council_consultation_offer',
    capability: 'available',
    targetRoomId: 'council-strategists',
    targetStationId: 'council-table',
    toolId: 'controlled-council-one-shot',
    operatorRequest: operatorNote ?? '',
    readback: 'זה נראה כמו נושא שכדאי לבחון מכמה זוויות.',
    visualNextStep: 'להתייעץ עם המועצה? אתה מחליט.',
  }
}

function createCouncilConsultationOfferResult(runId: string, actionRun: LiveAgentActionSystemRun): ControlledLiveAgentChatResult {
  return {
    ok: true,
    runId,
    agentId: 'hermes',
    durationMs: 0,
    usage: localActionSystemUsage(actionRun),
    output: {
      agentId: 'hermes',
      status: 'completed_local_only',
      answer: `${actionRun.readback}\n${actionRun.visualNextStep}`,
      summary: actionRun.readback,
      nextSafeStep: actionRun.visualNextStep,
      blockedActions: ['council_run_until_operator_approval'],
      confidence: 100,
    },
    rawStdout: '',
    rawStderr: '',
  }
}

function createMissingCapabilityActionSystemRun(runId: string, agentId: LivingV3AgentId, operatorNote?: string): LiveAgentActionSystemRun {
  return {
    actionRunId: `${runId}-action-system`,
    requestedByAgentId: agentId,
    assignedAgentId: agentId,
    status: 'blocked_missing_capability',
    intent: 'unsupported_action',
    capability: 'missing',
    operatorRequest: operatorNote ?? '',
    readback: 'זו פעולה מפורשת, אבל אין עדיין כלי/חדר/runner מחובר שמחזיר תוצאה ויזואלית אמיתית.',
    visualNextStep: 'Workspace צריך להציע Build Plan במקום לענות בסיסמה.',
    missingCapability: {
      title: 'Missing Workspace action capability',
      whyMissing: 'לא נמצא host tool מאושר שמבצע את הבקשה ומחזיר artifact/receipt למסך.',
      suggestedOwner: 'hermes',
      buildPlan: [
        'להגדיר intent/capability מדויק לבקשה.',
        'לקבוע agent owner וחדר/תחנה ויזואליים.',
        'לחבר כלי host בטוח שמחזיר artifact, לא רק תשובת צ׳אט.',
        'להציג את התוצאה בכרטיסים/טבלה/לוח ולשמור היסטוריה.',
        'להוסיף approval gate לפעולות מסוכנות ובדיקות build/browser.',
      ],
    },
  }
}

function createTerraModelSearchActionSystemRun(runId: string, requestedByAgentId: LivingV3AgentId, operatorNote?: string): LiveAgentActionSystemRun {
  return {
    actionRunId: `${runId}-action-system`,
    requestedByAgentId,
    assignedAgentId: 'terra',
    status: 'running_host_tool',
    intent: 'terra_model_search',
    capability: 'available',
    targetRoomId: 'terra-forge',
    targetStationId: 'terra-model-hunt',
    toolId: 'terra-printables-readonly-search',
    operatorRequest: operatorNote ?? '',
    readback: 'Hermes זיהה פעולת Terra ושלח אותה ל-Model Hunt.',
    visualNextStep: 'פתח את Terra / Model Hunt ותציג את התוצאות ככרטיסים; אין download/slice/print בלי אישור.',
  }
}

function completeTerraModelSearchActionSystemRun(run: LiveAgentActionSystemRun, search: TerraInternetModelSearchResult): LiveAgentActionSystemRun {
  if (!search.ok || search.status === 'blocked') {
    return {
      ...run,
      status: 'blocked_tool_error',
      readback: search.ok
        ? `Terra Model Hunt ניסה חיפוש אבל נחסם: ${search.error ?? 'source unavailable'}`
        : `Terra Model Hunt נכשל: ${search.error}`,
      visualNextStep: 'הצג את החסם במסך והצע חיפוש אחר/connector אחר במקום להמציא תוצאות.',
    }
  }
  return {
    ...run,
    status: 'completed_host_tool',
    readback: `Terra Model Hunt החזיר ${search.candidates.length}/${search.totalCount} תוצאות עבור "${search.query}".`,
    visualNextStep: 'הציגו כרטיסים ב-Terra Model Hunt; השלב הבא הוא לבחור מועמד לפני כל download/slice/print.',
  }
}

function terraSearchQueryFromOperatorNote(operatorNote?: string) {
  const raw = operatorNote ?? ''
  const englishTerms = Array.from(raw.matchAll(/[a-z][a-z0-9-]{2,}/gi))
    .map((match) => match[0].toLowerCase())
    .filter((term) => !new Set(['terra', 'search', 'find', 'model', 'models', 'live', 'print', 'printing', 'printable', 'printables', 'thingiverse', 'makerworld', 'please', 'stl', '3mf']).has(term))
  if (englishTerms.length) return englishTerms.slice(0, 8).join(' ').slice(0, 80)
  const lowered = raw.toLowerCase()
  if (/פידג|פיג'ט|פידג׳ט|פידגט/.test(lowered)) return 'fidget toy'
  if (/כבל/.test(lowered) && /קליפ|מחזיק|תופסן/.test(lowered)) return 'cable clip'
  const text = raw
    .replace(/טרה|terra/gi, ' ')
    .replace(/חפש(?:י)?|חיפוש|לייב|אינטרנט|מודל|מודלים|להדפסה|הדפסה|להדפיס|תמצאי|תמצא|please|find|search|models?|stl|3mf|לי|את|של|עם/gi, ' ')
    .replace(/[?.!,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (text || raw || 'fidget toy').slice(0, 80)
}

function summarizeTerraReadOnlyModelSearch(search: TerraInternetModelSearchResult) {
  if (!search.ok) return `חיפוש לייב נכשל: ${search.error}`
  if (search.status === 'blocked') return `ניסיתי חיפוש לייב ב-Printables אבל הוא נחסם: ${search.error ?? 'לא התקבלה תשובה'}. לא הורדתי ולא הדפסתי.`
  const titles = search.candidates.slice(0, 3).map((candidate) => candidate.title).join(' · ')
  return [
    `חיפשתי לייב ב-Printables: ${search.query}.`,
    `מצאתי ${search.totalCount}; מובילים: ${titles || 'אין מועמדים טובים'}.`,
    'לא הורדתי, לא פרסתי ולא שלחתי למדפסת.',
    'הבא: פתח Model Hunt ובחר מועמד.',
  ].join('\n')
}

const liveAgentChatRunsInFlight = new Set<LivingV3AgentId>()

export async function runControlledLiveAgentChatFlow(input: {
  agentId: LivingV3AgentId
  operatorNote?: string
  cwd?: string
}) {
  const agent = livingV3AgentById(input.agentId)
  if (!agent) throw new Error(`Unknown Living V3 agent: ${input.agentId}`)
  if (liveAgentChatRunsInFlight.has(input.agentId)) {
    throw new Error(`${agent.label} is already answering.`)
  }
  liveAgentChatRunsInFlight.add(input.agentId)
  const runId = createLiveAgentChatRunId(input.agentId)
  const correlationId = `${runId}-operator`
  const primaryStationId = agent.primaryStationIds[0]
  const actionIntent = liveAgentActionIntentFor(input.agentId, input.operatorNote)
  let actionSystemRun: LiveAgentActionSystemRun = actionIntent === 'terra_model_search'
    ? createTerraModelSearchActionSystemRun(runId, input.agentId, input.operatorNote)
    : actionIntent === 'council_consultation_offer'
      ? createCouncilConsultationOfferActionSystemRun(runId, input.operatorNote)
      : actionIntent === 'unsupported_action'
        ? createMissingCapabilityActionSystemRun(runId, input.agentId, input.operatorNote)
        : createChatOnlyActionSystemRun(runId, input.agentId, input.operatorNote)
  let terraModelSearch: TerraInternetModelSearchResult | undefined

  try {
    setWarRoomAgentsLocalOnly({
      reason: actionSystemRun.status === 'waiting_operator'
        ? 'Hermes detected a possible Council consultation and stopped locally for DLV approval. 0 model calls.'
        : `${agent.label} live chat started: one model call only because DLV sent a message. Idle roaming stays local/free.`,
      updatedBy: 'ui',
      runId,
    })
    const primaryStation = livingV3StationById(primaryStationId)
    if (primaryStation) {
      dispatchWarRoomIntent({
        type: 'move_to_station',
        agentId: input.agentId,
        roomId: primaryStation.roomId,
        stationId: primaryStation.id,
        source: 'hermes',
        runId,
        correlationId: `${correlationId}-move`,
      })
      dispatchWarRoomIntent({
        type: 'work_at_station',
        agentId: input.agentId,
        roomId: primaryStation.roomId,
        stationId: primaryStation.id,
        taskId: `${runId}-chat-task`,
        source: 'hermes',
        runId,
        correlationId: `${correlationId}-work`,
      })
    }
    dispatchWarRoomIntent({
      type: 'say',
      agentId: input.agentId,
      roomId: primaryStation?.roomId ?? agent.home.roomId,
      stationId: primaryStationId,
      text: actionSystemRun.status === 'waiting_operator'
        ? 'Hermes is waiting for DLV to approve or skip Council consultation. No Council run started.'
        : `${agent.label} is answering one live-on-message AI call. Idle background usage remains off.`,
      source: 'hermes',
      runId,
      correlationId: `${correlationId}-start`,
    })

    if (actionSystemRun.status === 'blocked_missing_capability') {
      const result = createMissingCapabilityLiveResult(runId, input.agentId, actionSystemRun)
      dispatchWarRoomIntent({
        type: 'say',
        agentId: input.agentId,
        roomId: primaryStation?.roomId ?? agent.home.roomId,
        stationId: primaryStationId,
        text: truncateForSpeech(result.output?.answer ?? actionSystemRun.readback),
        source: 'hermes',
        runId,
        correlationId: `${correlationId}-missing-capability`,
      })
      freezeWarRoomAgents({
        reason: `${agent.label} action stopped before model/tool execution because Workspace capability is missing.`,
        updatedBy: 'system',
        runId,
      })
      return {
        ok: false,
        runId,
        agentId: input.agentId,
        result,
        control: getAgentConnectionState(),
        state: getWarRoomBodyState(),
        actionSystemRun,
      } satisfies ControlledLiveAgentChatFlowResult
    }

    if (actionSystemRun.status === 'waiting_operator') {
      const result = createCouncilConsultationOfferResult(runId, actionSystemRun)
      dispatchWarRoomIntent({
        type: 'say',
        agentId: 'hermes',
        roomId: 'olympus-command',
        stationId: 'command-table',
        text: truncateForSpeech(result.output?.answer ?? actionSystemRun.readback),
        source: 'hermes',
        runId,
        correlationId: `${correlationId}-council-offer`,
      })
      freezeWarRoomAgents({
        reason: 'Hermes proposed Council consultation and stopped for DLV approval. No Council or model run started.',
        updatedBy: 'system',
        runId,
      })
      return {
        ok: true,
        runId,
        agentId: input.agentId,
        result,
        control: getAgentConnectionState(),
        state: getWarRoomBodyState(),
        actionSystemRun,
      } satisfies ControlledLiveAgentChatFlowResult
    }

    const result = await runControlledLiveAgentChat({
      agentId: input.agentId,
      runId,
      operatorNote: input.operatorNote,
      cwd: input.cwd,
    })
    if (result.ok) {
      if (shouldRunTerraReadOnlyModelSearch(input.agentId, input.operatorNote)) {
        const terraSearchStation = livingV3StationById('terra-model-hunt')
        if (terraSearchStation) {
          dispatchWarRoomIntent({
            type: 'work_at_station',
            agentId: 'terra',
            roomId: terraSearchStation.roomId,
            stationId: terraSearchStation.id,
            taskId: `${runId}-model-hunt`,
            source: 'hermes',
            runId,
            correlationId: `${correlationId}-terra-model-hunt`,
          })
        }
        terraModelSearch = await searchTerraInternetModels({
          query: terraSearchQueryFromOperatorNote(input.operatorNote),
          limit: requestedTerraSearchLimit(input.operatorNote),
        })
        actionSystemRun = completeTerraModelSearchActionSystemRun(actionSystemRun, terraModelSearch)
        const searchAnswer = summarizeTerraReadOnlyModelSearch(terraModelSearch)
        result.output = {
          ...result.output,
          status: terraModelSearch.ok && terraModelSearch.status === 'completed' ? 'completed_read_only_web' : result.output.status,
          answer: searchAnswer,
          summary: terraModelSearch.ok && terraModelSearch.status === 'completed'
            ? `Terra ran read-only Printables search for ${terraModelSearch.query}.`
            : 'Terra attempted a read-only internet model search safely.',
          nextSafeStep: 'Open Model Hunt, review license/risk, then choose a candidate before any download/slice/print.',
          blockedActions: terraModelSearch.ok
            ? terraModelSearch.lockedActions
            : ['download_model_file', 'slice_model', 'printer_upload', 'printer_start'],
        }
      }
      dispatchWarRoomIntent({
        type: 'say',
        agentId: input.agentId,
        roomId: primaryStation?.roomId ?? agent.home.roomId,
        stationId: primaryStationId,
        text: truncateForSpeech(result.output.answer),
        source: 'hermes',
        runId,
        correlationId: `${correlationId}-result`,
      })
    } else {
      dispatchWarRoomIntent({
        type: 'raise_alert',
        agentId: input.agentId,
        severity: 'warning',
        text: truncateForSpeech(`${agent.label} live chat failed: ${result.error}`),
        source: 'hermes',
        runId,
        correlationId: `${correlationId}-failed`,
      })
    }

    freezeWarRoomAgents({
      reason: `${agent.label} live chat finished. Agents frozen again; idle animation remains local/free. Usage: ${liveAgentUsageReadback(result)}.`,
      updatedBy: 'system',
      runId,
    })

    return {
      ok: result.ok,
      runId,
      agentId: input.agentId,
      result,
      control: getAgentConnectionState(),
      state: getWarRoomBodyState(),
      terraModelSearch,
      actionSystemRun,
    } satisfies ControlledLiveAgentChatFlowResult
  } catch (error) {
    freezeWarRoomAgents({
      reason: `${agent.label} live chat failed; agents frozen fail-closed.`,
      updatedBy: 'system',
      runId,
    })
    throw error
  } finally {
    liveAgentChatRunsInFlight.delete(input.agentId)
  }
}
