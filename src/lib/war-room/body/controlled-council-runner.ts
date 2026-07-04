import { buildObsidianContextPacket } from '../../workspace-kernel/obsidian-context'
import {
  CONTROLLED_COUNCIL_AGENT_IDS,






  controlledAgentProfile,
  controlledCouncilGeneralId,
  runControlledAgentOneShot
} from './controlled-athena-runner'
import type {ControlledAgentRunResult, ControlledCouncilAgentId, ControlledCouncilGeneralId, ControlledCouncilPeerOpinion, ControlledCouncilRunContext, ControlledCouncilVote} from './controlled-athena-runner';
import type { WorkspaceContextPacket } from '../../workspace-kernel/context-packet'

export type ControlledCouncilTurnStatus = 'completed_local_only' | 'blocked' | 'failed'

export type ControlledCouncilTurn = {
  agentId: ControlledCouncilAgentId
  generalId: ControlledCouncilGeneralId
  label: string
  phase: ControlledCouncilRunContext['phase']
  status: ControlledCouncilTurnStatus
  opinion: string
  vote: ControlledCouncilVote
  voteReason: string
  recommendedOption: string
  confidence: number
  personalitySignal: string
  contextUsed: Array<string>
  peerReadback: Array<string>
  riskFlags: Array<string>
  suggestedDecisionPatch: string
  suggestedFollowUp: string
  durationMs: number
  usageReadback: string
  error?: string
}

export type ControlledCouncilStats = {
  total: number
  completed: number
  blocked: number
  failed: number
  for: number
  neutral: number
  against: number
  abstain: number
  consensus: 'for' | 'neutral' | 'against' | 'split' | 'blocked'
}

export type ControlledCouncilRecommendationOption = {
  label: string
  support: number
  voters: Array<string>
  voteBreakdown: {
    for: number
    neutral: number
    against: number
    abstain: number
  }
}

export type ControlledCouncilRecommendation = {
  title: string
  summary: string
  supportLine: string
  nextStep: string
  reason: string
  supportedBy: Array<string>
  options: Array<ControlledCouncilRecommendationOption>
}

export type ControlledCouncilRoundResult = {
  ok: boolean
  runId: string
  topic: string
  dataOrigin: 'controlled-real-ai-one-shot'
  noFakeResponses: true
  localOnly: true
  usageAllowed: false
  workerSpawnAllowed: false
  contextPacket: WorkspaceContextPacket
  openingTurns: Array<ControlledCouncilTurn>
  voteTurns: Array<ControlledCouncilTurn>
  stats: ControlledCouncilStats
  recommendation: ControlledCouncilRecommendation
  summary: string
  decisionPacket: {
    packetId: string
    topic: string
    verdict: string
    voteLine: string
    summary: string
    recommendation: ControlledCouncilRecommendation
    sourceContextPacketId: string
    noFakeResponses: true
  }
  lockedActions: Array<string>
}

export type RunControlledCouncilRoundInput = {
  topic: string
  cwd?: string
  timeoutMs?: number
  includePeerVote?: boolean
  agentIds?: Array<ControlledCouncilAgentId>
  nowMs?: number
}

export type RunControlledCouncilFollowUpInput = {
  topic: string
  question: string
  agentId: ControlledCouncilAgentId
  previousOpinions?: Array<ControlledCouncilPeerOpinion>
  cwd?: string
  timeoutMs?: number
  nowMs?: number
}

export type ControlledCouncilFollowUpResult = {
  ok: boolean
  runId: string
  topic: string
  question: string
  dataOrigin: 'controlled-real-ai-one-shot'
  noFakeResponses: true
  localOnly: true
  usageAllowed: false
  workerSpawnAllowed: false
  contextPacket: WorkspaceContextPacket
  turn: ControlledCouncilTurn
  lockedActions: Array<string>
}

function compactText(value: string, fallback: string, max = 4_000) {
  const text = value.trim().replace(/\s+/g, ' ')
  return (text || fallback).slice(0, max)
}

function councilContextFromPacket(input: {
  topic: string
  phase: ControlledCouncilRunContext['phase']
  packet: WorkspaceContextPacket
  peerOpinions?: Array<ControlledCouncilPeerOpinion>
}): ControlledCouncilRunContext {
  return {
    topic: input.topic,
    phase: input.phase,
    contextPacketId: input.packet.packetId,
    sourceNotes: input.packet.sourceNotes.map((source) => ({
      noteId: source.noteId,
      title: source.title,
      relativePath: source.relativePath,
      excerpt: source.excerpt,
      status: source.status,
    })),
    decisions: input.packet.decisions,
    safetyRails: input.packet.safetyRails,
    peerOpinions: input.peerOpinions ?? [],
  }
}

function usageReadback(result: ControlledAgentRunResult) {
  return result.usage.reportedCost
    ?? result.usage.reportedUsageLine
    ?? `budget: ${result.usage.budget}; toolsets=${result.usage.toolsets}`
}

function turnFromRunResult(agentId: ControlledCouncilAgentId, phase: ControlledCouncilRunContext['phase'], result: ControlledAgentRunResult): ControlledCouncilTurn {
  const profile = controlledAgentProfile(agentId)
  const council = result.output?.council
  const hasUsableCouncilAnswer = Boolean(
    council
      && result.output?.status === 'completed_local_only'
      && council.opinion.trim(),
  )
  const failedStatus: ControlledCouncilTurnStatus = result.ok ? 'blocked' : result.output?.status === 'failed' ? 'failed' : 'blocked'
  const resultError = result.ok ? undefined : result.error
  const runnerWarnings = resultError
    ? [`controlled runner warning: ${resultError}`]
    : []
  return {
    agentId,
    generalId: controlledCouncilGeneralId(agentId),
    label: profile.label,
    phase,
    status: hasUsableCouncilAnswer ? 'completed_local_only' : failedStatus,
    opinion: hasUsableCouncilAnswer ? council!.opinion : '',
    vote: hasUsableCouncilAnswer ? council!.vote : 'abstain',
    voteReason: hasUsableCouncilAnswer ? council!.voteReason : 'No real AI answer returned; this general is not counted as a real opinion.',
    recommendedOption: hasUsableCouncilAnswer ? council!.recommendedOption : '',
    confidence: hasUsableCouncilAnswer ? council!.confidence : 0,
    personalitySignal: hasUsableCouncilAnswer ? council!.personalitySignal : profile.mission,
    contextUsed: hasUsableCouncilAnswer ? council!.contextUsed : [],
    peerReadback: hasUsableCouncilAnswer ? council!.peerReadback : [],
    riskFlags: hasUsableCouncilAnswer ? Array.from(new Set([...council!.riskFlags, ...runnerWarnings])).slice(0, 8) : ['real AI call did not complete'],
    suggestedDecisionPatch: hasUsableCouncilAnswer ? council!.suggestedDecisionPatch : '',
    suggestedFollowUp: hasUsableCouncilAnswer ? council!.suggestedFollowUp : 'Retry this general only after checking the controlled runner.',
    durationMs: result.durationMs,
    usageReadback: usageReadback(result),
    error: hasUsableCouncilAnswer ? undefined : resultError,
  }
}

function blockedTurnFromError(agentId: ControlledCouncilAgentId, phase: ControlledCouncilRunContext['phase'], error: unknown): ControlledCouncilTurn {
  const profile = controlledAgentProfile(agentId)
  const message = error instanceof Error ? error.message : String(error)
  return {
    agentId,
    generalId: controlledCouncilGeneralId(agentId),
    label: profile.label,
    phase,
    status: 'failed',
    opinion: '',
    vote: 'abstain',
    voteReason: 'No real AI answer returned; this general is not counted as a real opinion.',
    recommendedOption: '',
    confidence: 0,
    personalitySignal: profile.mission,
    contextUsed: [],
    peerReadback: [],
    riskFlags: ['controlled council runner threw before a real answer returned'],
    suggestedDecisionPatch: '',
    suggestedFollowUp: 'Retry this general only after checking the controlled runner.',
    durationMs: 0,
    usageReadback: 'no usage reported; call failed before completion',
    error: message,
  }
}

export function buildControlledCouncilStats(turns: Array<ControlledCouncilTurn>): ControlledCouncilStats {
  const completedTurns = turns.filter((turn) => turn.status === 'completed_local_only')
  const count = (vote: ControlledCouncilVote) => completedTurns.filter((turn) => turn.vote === vote).length
  const forCount = count('for')
  const neutral = count('neutral')
  const against = count('against')
  const abstain = count('abstain')
  const top = Math.max(forCount, neutral, against, abstain)
  const topVotes = [forCount, neutral, against, abstain].filter((value) => value === top).length
  const consensus: ControlledCouncilStats['consensus'] = completedTurns.length === 0
    ? 'blocked'
    : topVotes > 1
      ? 'split'
      : top === forCount
        ? 'for'
        : top === neutral
          ? 'neutral'
        : top === against
          ? 'against'
          : 'split'
  return {
    total: turns.length,
    completed: completedTurns.length,
    blocked: turns.filter((turn) => turn.status === 'blocked').length,
    failed: turns.filter((turn) => turn.status === 'failed').length,
    for: forCount,
    neutral,
    against,
    abstain,
    consensus,
  }
}

function summaryFor(stats: ControlledCouncilStats) {
  if (stats.consensus === 'blocked') return 'לא התקבלה החלטת מועצה: אף גנרל לא החזיר תשובת AI אמיתית.'
  const voteLine = `${stats.for} בעד · ${stats.neutral} ניטרלי · ${stats.against} נגד · ${stats.abstain} נמנע`
  if (stats.consensus === 'for') return `להמשיך. ${voteLine}.`
  if (stats.consensus === 'neutral') return `להמשיך רק אחרי בדיקה קצרה וברורה. ${voteLine}.`
  if (stats.consensus === 'against') return `לא להתקדם כרגע. ${voteLine}.`
  return `אין רוב ברור. ${voteLine}.`
}

const councilOptionAliases: Array<{ label: string; aliases: Array<string> }> = [
  {
    label: 'Command Room / Mission Control',
    aliases: ['command room', 'mission control', 'olympus command', 'mission router', 'חדר פיקוד', 'חדר משימות', 'חדר ביצוע', 'חדר פיקוד וביצוע', 'פיקוד', 'משימות ביצוע'],
  },
  {
    label: 'Etsy Product Prep / Market Lab',
    aliases: ['etsy market lab', 'product prep', 'product search', 'etsy product prep', 'אטסי', 'אצי', 'מוצר', 'מוצרים', 'מחקר מוצר', 'חדר מוצר'],
  },
  {
    label: 'Oracle Signals / Research',
    aliases: ['oracle', 'signals', 'research', 'oracle signals', 'מחקר', 'אותות', 'סיגנל', 'אורקל'],
  },
  {
    label: 'ShotLab / Media Production',
    aliases: ['shotlab', 'media production', 'media', 'תמונות', 'מדיה', 'וידאו', 'שוטלאב'],
  },
  {
    label: 'Gateway / Integrations',
    aliases: ['gateway', 'integrations', 'api', 'חיבורים', 'אינטגרציות', 'גייטווי'],
  },
  {
    label: 'Forge / Automation',
    aliases: ['forge', 'hephaestus', 'automation', 'אוטומציה', 'בנייה', 'פורג׳', 'הפייסטוס'],
  },
  {
    label: 'Council UX',
    aliases: ['council', 'strategists', 'מועצה'],
  },
]

function normalizeOptionLabel(value: string) {
  const text = compactText(value, '', 360)
  if (!text) return undefined
  const lower = text.toLowerCase()
  if (/^no concrete option named$/i.test(text)) return undefined
  for (const option of councilOptionAliases) {
    if (option.aliases.some((alias) => lower.includes(alias.toLowerCase()))) return option.label
  }
  const hebrewRoom = text.match(/חדר\s+[^\s.,;:!?]+(?:\s+[^\s.,;:!?]+){0,3}/)
  if (hebrewRoom?.[0]) return hebrewRoom[0].replace(/\s+/g, ' ')
  const englishRoom = text.match(/[A-Z][A-Za-z]+(?:\s+(?:Room|Control|Lab|Workshop|Signals|Prep)){1,3}/)
  if (englishRoom?.[0]) return englishRoom[0].replace(/\s+/g, ' ')
  const isGeneric = /(להמשיך|המשך|בדיקה|צעד|פעולה|continue|next step|slice|scope|approval|אישור)/i.test(text)
  return isGeneric ? undefined : text.slice(0, 90)
}

function optionLabelForTurn(turn: ControlledCouncilTurn) {
  return normalizeOptionLabel([
    turn.recommendedOption,
    turn.suggestedDecisionPatch,
    turn.opinion,
    turn.voteReason,
  ].filter(Boolean).join(' · '))
}

function buildControlledCouncilRecommendation(input: {
  topic: string
  turns: Array<ControlledCouncilTurn>
  stats: ControlledCouncilStats
}): ControlledCouncilRecommendation {
  const completed = input.turns.filter((turn) => turn.status === 'completed_local_only')
  const optionMap = new Map<string, ControlledCouncilRecommendationOption>()
  for (const turn of completed) {
    const label = optionLabelForTurn(turn)
    if (!label) continue
    const option = optionMap.get(label) ?? {
      label,
      support: 0,
      voters: [],
      voteBreakdown: { for: 0, neutral: 0, against: 0, abstain: 0 },
    }
    option.voteBreakdown[turn.vote] += 1
    if (turn.vote === 'for' || turn.vote === 'neutral') {
      option.support += 1
      option.voters.push(turn.label)
    }
    optionMap.set(label, option)
  }

  const options = [...optionMap.values()].sort((a, b) => {
    if (b.support !== a.support) return b.support - a.support
    if (b.voteBreakdown.for !== a.voteBreakdown.for) return b.voteBreakdown.for - a.voteBreakdown.for
    return a.label.localeCompare(b.label)
  })
  const top = options[0]
  if (!top || top.support === 0) {
    const voteLine = `${input.stats.for} בעד · ${input.stats.neutral} ניטרלי · ${input.stats.against} נגד · ${input.stats.abstain} נמנע`
    return {
      title: input.stats.consensus === 'blocked' ? 'לא התקבלה מסקנה' : 'לא יצאה בחירה אחת',
      summary: 'היועצים הצביעו, אבל לא נתנו שם חדר/אפשרות מספיק ברור. צריך להריץ שוב עם בחירת option ברורה.',
      supportLine: voteLine,
      nextStep: 'שאל שוב: “בחרו חדר אחד בלבד ותנו סיבה אחת קצרה”.',
      reason: 'אין option קונקרטי שאפשר לספור בלי להמציא תשובה.',
      supportedBy: [],
      options,
    }
  }

  const topTurns = completed.filter((turn) => optionLabelForTurn(turn) === top.label && (turn.vote === 'for' || turn.vote === 'neutral'))
  const reason = compactText(
    topTurns.find((turn) => turn.suggestedDecisionPatch)?.suggestedDecisionPatch
      ?? topTurns.find((turn) => turn.voteReason)?.voteReason
      ?? `רוב הדעות חזרו על ${top.label}.`,
    `רוב הדעות חזרו על ${top.label}.`,
    220,
  )
  const completedCount = Math.max(completed.length, 1)
  const supportLine = `${top.support}/${completedCount} תמכו ב־${top.label}`
  return {
    title: top.label,
    summary: top.support === completed.length
      ? `זו הבחירה הברורה: כל ${top.support} היועצים תמכו בה.`
      : `זו הבחירה שקיבלה הכי הרבה תמיכה: ${supportLine}.`,
    supportLine,
    nextStep: compactText(
      topTurns.find((turn) => turn.suggestedDecisionPatch && turn.suggestedDecisionPatch !== turn.opinion)?.suggestedDecisionPatch
        ?? `להגדיר slice ראשון ל־${top.label}: מטרה, כלי ראשון, ומה נחשב PASS.`,
      `להגדיר slice ראשון ל־${top.label}: מטרה, כלי ראשון, ומה נחשב PASS.`,
      220,
    ),
    reason,
    supportedBy: top.voters,
    options,
  }
}

export async function runControlledCouncilFollowUp(input: RunControlledCouncilFollowUpInput): Promise<ControlledCouncilFollowUpResult> {
  const nowMs = input.nowMs ?? Date.now()
  const topic = compactText(input.topic, 'DLV asked a Council follow-up.', 3_000)
  const question = compactText(input.question, 'DLV asked this general for a focused follow-up.', 1_500)
  const runId = `council-followup-${nowMs.toString(36)}-${input.agentId}`
  const contextPacket = await buildObsidianContextPacket({
    mission: `Council one-to-one follow-up: ${topic}`,
    targetRoomId: 'council-strategists',
    targetStationId: 'council-table',
    nowMs,
  })
  let turn: ControlledCouncilTurn
  const phase = 'single-follow-up' as const
  try {
    const result = await runControlledAgentOneShot({
      agentId: input.agentId,
      runId,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      councilContext: {
        ...councilContextFromPacket({ topic, phase, packet: contextPacket, peerOpinions: input.previousOpinions ?? [] }),
        followUpQuestion: question,
      },
    })
    turn = turnFromRunResult(input.agentId, phase, result)
  } catch (error) {
    turn = blockedTurnFromError(input.agentId, phase, error)
  }

  return {
    ok: turn.status === 'completed_local_only',
    runId,
    topic,
    question,
    dataOrigin: 'controlled-real-ai-one-shot',
    noFakeResponses: true,
    localOnly: true,
    usageAllowed: false,
    workerSpawnAllowed: false,
    contextPacket,
    turn,
    lockedActions: [...new Set([
      ...contextPacket.forbiddenActions,
      'fake council responses',
      'uncontrolled worker fan-out',
      'Hermes handoff without DLV approval',
    ])],
  }
}

export async function runControlledCouncilRound(input: RunControlledCouncilRoundInput): Promise<ControlledCouncilRoundResult> {
  const nowMs = input.nowMs ?? Date.now()
  const topic = compactText(input.topic, 'DLV asked the Council for decision support.', 3_000)
  const runId = `council-real-${nowMs.toString(36)}`
  const agentIds = input.agentIds?.length ? input.agentIds : CONTROLLED_COUNCIL_AGENT_IDS
  const contextPacket = await buildObsidianContextPacket({
    mission: `Council decision support: ${topic}`,
    targetRoomId: 'council-strategists',
    targetStationId: 'council-table',
    nowMs,
  })

  const openingTurns = await Promise.all(agentIds.map(async (agentId): Promise<ControlledCouncilTurn> => {
    const phase = 'opinion' as const
    try {
      const result = await runControlledAgentOneShot({
        agentId,
        runId: `${runId}-${agentId}-opinion`,
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
        councilContext: councilContextFromPacket({ topic, phase, packet: contextPacket }),
      })
      return turnFromRunResult(agentId, phase, result)
    } catch (error) {
      return blockedTurnFromError(agentId, phase, error)
    }
  }))

  const peerOpinions: Array<ControlledCouncilPeerOpinion> = openingTurns
    .filter((turn) => turn.status === 'completed_local_only')
    .map((turn) => ({
      generalId: turn.generalId,
      label: turn.label,
      opinion: turn.opinion,
      vote: turn.vote,
      voteReason: turn.voteReason,
    }))

  const voteTurns: Array<ControlledCouncilTurn> = input.includePeerVote !== false
    ? await Promise.all(agentIds.map(async (agentId): Promise<ControlledCouncilTurn> => {
      const phase = 'peer-vote' as const
      try {
        const result = await runControlledAgentOneShot({
          agentId,
          runId: `${runId}-${agentId}-vote`,
          cwd: input.cwd,
          timeoutMs: input.timeoutMs,
          councilContext: councilContextFromPacket({ topic, phase, packet: contextPacket, peerOpinions }),
        })
        return turnFromRunResult(agentId, phase, result)
      } catch (error) {
        return blockedTurnFromError(agentId, phase, error)
      }
    }))
    : []

  const finalTurns = voteTurns.length ? voteTurns : openingTurns
  const stats = buildControlledCouncilStats(finalTurns)
  const recommendation = buildControlledCouncilRecommendation({ topic, turns: finalTurns, stats })
  const summary = recommendation.summary
  const voteLine = `${stats.for} FOR · ${stats.neutral} NEUTRAL · ${stats.against} AGAINST · ${stats.abstain} ABSTAIN`
  return {
    ok: stats.completed > 0,
    runId,
    topic,
    dataOrigin: 'controlled-real-ai-one-shot',
    noFakeResponses: true,
    localOnly: true,
    usageAllowed: false,
    workerSpawnAllowed: false,
    contextPacket,
    openingTurns,
    voteTurns,
    stats,
    recommendation,
    summary,
    decisionPacket: {
      packetId: `${runId}-decision`,
      topic,
      verdict: recommendation.title,
      voteLine,
      summary,
      recommendation,
      sourceContextPacketId: contextPacket.packetId,
      noFakeResponses: true,
    },
    lockedActions: [...new Set([
      ...contextPacket.forbiddenActions,
      'fake council responses',
      'uncontrolled worker fan-out',
      'Hermes handoff without DLV approval',
    ])],
  }
}
