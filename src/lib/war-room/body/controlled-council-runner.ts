import { buildObsidianContextPacket } from '../../workspace-kernel/obsidian-context'
import {
  CONTROLLED_COUNCIL_AGENT_IDS,
  controlledAgentProfile,
  controlledCouncilGeneralId,
  runControlledAgentOneShot,
  sanitizeControlledRunnerError,
} from './controlled-athena-runner'
import type { ControlledAgentRunResult, ControlledCouncilAgentId, ControlledCouncilGeneralId, ControlledCouncilPeerOpinion, ControlledCouncilRunContext, ControlledCouncilVote } from './controlled-athena-runner'
import type { WorkspaceContextPacket } from '../../workspace-kernel/context-packet'

export type ControlledCouncilTurnStatus = 'completed_local_only' | 'blocked' | 'failed'

export type ControlledCouncilTurn = {
  agentId: ControlledCouncilAgentId
  generalId: ControlledCouncilGeneralId
  label: string
  phase: ControlledCouncilRunContext['phase']
  status: ControlledCouncilTurnStatus
  chatSummary: string
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
  replyTo?: string
  replySnippet?: string
  durationMs: number
  usageReadback: string
  independentRunId: string
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
  previousOpinions?: Array<ControlledCouncilPeerOpinion>
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
  liveTranscript?: Array<string>
  replyToLabel?: string
  replyToSnippet?: string
  turnInstruction?: string
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
    liveTranscript: input.liveTranscript,
    replyToLabel: input.replyToLabel,
    replyToSnippet: input.replyToSnippet,
    turnInstruction: input.turnInstruction,
  }
}

function usageReadback(result: ControlledAgentRunResult) {
  return result.usage.reportedCost
    ?? result.usage.reportedUsageLine
    ?? 'שיחת מודל אחת הושלמה במסלול מוגבל ונקי.'
}

function peerOpinionFromTurn(turn: ControlledCouncilTurn): ControlledCouncilPeerOpinion {
  return {
    generalId: turn.generalId,
    label: turn.label,
    chatSummary: turn.chatSummary,
    opinion: turn.opinion || turn.chatSummary,
    vote: turn.vote,
    voteReason: turn.voteReason,
  }
}

function completedPeerOpinions(turns: Array<ControlledCouncilTurn>) {
  return turns
    .filter((turn) => turn.status === 'completed_local_only')
    .map(peerOpinionFromTurn)
}

function transcriptLineForTurn(turn: ControlledCouncilTurn) {
  const text = compactText(turn.chatSummary || turn.opinion || turn.voteReason, 'תשובה לא זמינה', 280)
  const reply = turn.replyTo ? ` ↪ ${turn.replyTo}` : ''
  return `${turn.label}${reply}: ${text}`
}

function transcriptFromTurns(turns: Array<ControlledCouncilTurn>) {
  return turns
    .filter((turn) => turn.status === 'completed_local_only')
    .map(transcriptLineForTurn)
}

function transcriptFromPeerOpinions(peers: Array<ControlledCouncilPeerOpinion>) {
  return peers.map((peer) => `${peer.label}: ${compactText(peer.chatSummary ?? peer.opinion, peer.voteReason ?? 'דעה קודמת', 280)}`)
}

function replyTargetFromTurns(turns: Array<ControlledCouncilTurn>) {
  const completed = turns.filter((turn) => turn.status === 'completed_local_only')
  const last = completed.at(-1)
  if (!last) return {}
  return {
    replyToLabel: last.label,
    replyToSnippet: compactText(last.chatSummary || last.opinion, last.voteReason, 150),
  }
}

function replyTargetFromPeerOpinions(peers: Array<ControlledCouncilPeerOpinion>) {
  const last = peers.at(-1)
  if (!last) return {}
  return {
    replyToLabel: last.label,
    replyToSnippet: compactText(last.chatSummary ?? last.opinion, last.voteReason ?? '', 150),
  }
}

const COUNCIL_CHAIR_AGENT_ID: ControlledCouncilAgentId = 'council-julius'

function nonChairCouncilAgentIds(agentIds: Array<ControlledCouncilAgentId>) {
  return agentIds.filter((agentId) => agentId !== COUNCIL_CHAIR_AGENT_ID)
}

function hasCouncilChair(agentIds: Array<ControlledCouncilAgentId>) {
  return agentIds.includes(COUNCIL_CHAIR_AGENT_ID)
}

function independentBlindCouncilInstruction(agentId: ControlledCouncilAgentId, index: number, total: number) {
  const profile = controlledAgentProfile(agentId)
  return `Independent blind first pass ${index + 1}/${total}. Answer from the ${profile.label} lens without seeing the other new answers. Use one natural Hebrew chat bubble, then private detail. Do not summarize the whole council.`
}

function juliusChairSynthesisInstruction(advisorCount: number) {
  return `Julius chairs the Council after ${advisorCount} independent blind answers plus the discussion pass. Compare the advisors, preserve the strongest disagreement, then give DLV one final readable Council synthesis: bottom line, reason, risk, next safe step.`
}

function councilDiscussionPassInstruction(agentId: ControlledCouncilAgentId, index: number, total: number) {
  const profile = controlledAgentProfile(agentId)
  return `Discussion pass ${index + 1}/${total}. You are still ${profile.label}. Read the independent blind answers and previous discussion context, then add one useful reaction: support, correction, risk, or sharper next step. Do not repeat your first answer.`
}

async function runCouncilAgentTurn(input: {
  agentId: ControlledCouncilAgentId
  phase: ControlledCouncilRunContext['phase']
  runId: string
  cwd?: string
  timeoutMs?: number
  councilContext: ControlledCouncilRunContext
}) {
  try {
    const result = await runControlledAgentOneShot({
      agentId: input.agentId,
      runId: input.runId,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      councilContext: input.councilContext,
    })
    return turnFromRunResult(input.agentId, input.phase, result, input.councilContext)
  } catch (error) {
    return blockedTurnFromError(input.agentId, input.phase, error)
  }
}

function turnFromRunResult(agentId: ControlledCouncilAgentId, phase: ControlledCouncilRunContext['phase'], result: ControlledAgentRunResult, context?: ControlledCouncilRunContext): ControlledCouncilTurn {
  const profile = controlledAgentProfile(agentId)
  const council = result.output?.council
  const peerFallback = context?.peerOpinions[context.peerOpinions.length - 1]
  const replyTo = compactText(council?.replyTo ?? context?.replyToLabel ?? peerFallback?.label ?? '', '', 120)
  const replySnippet = compactText(council?.replySnippet ?? context?.replyToSnippet ?? peerFallback?.chatSummary ?? peerFallback?.opinion ?? '', '', 180)
  const hasUsableCouncilAnswer = Boolean(
    council
      && result.output?.status === 'completed_local_only'
      && council.opinion.trim(),
  )
  const failedStatus: ControlledCouncilTurnStatus = result.ok ? 'blocked' : result.output?.status === 'failed' ? 'failed' : 'blocked'
  const resultError = result.ok ? undefined : sanitizeControlledRunnerError(result.error)
  const runnerWarnings = resultError
    ? [`controlled runner warning: ${resultError}`]
    : []
  return {
    agentId,
    generalId: controlledCouncilGeneralId(agentId),
    label: profile.label,
    phase,
    status: hasUsableCouncilAnswer ? 'completed_local_only' : failedStatus,
    chatSummary: hasUsableCouncilAnswer ? council!.chatSummary : `לא התקבלה תשובה נקייה מ-${profile.label}.`,
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
    replyTo: hasUsableCouncilAnswer && replyTo ? replyTo : undefined,
    replySnippet: hasUsableCouncilAnswer && replySnippet ? replySnippet : undefined,
    durationMs: result.durationMs,
    usageReadback: usageReadback(result),
    independentRunId: result.runId,
    error: hasUsableCouncilAnswer ? undefined : resultError,
  }
}

function blockedTurnFromError(agentId: ControlledCouncilAgentId, phase: ControlledCouncilRunContext['phase'], error: unknown): ControlledCouncilTurn {
  const profile = controlledAgentProfile(agentId)
  const message = sanitizeControlledRunnerError(error instanceof Error ? error.message : String(error))
  return {
    agentId,
    generalId: controlledCouncilGeneralId(agentId),
    label: profile.label,
    phase,
    status: 'failed',
    chatSummary: `לא התקבלה תשובה נקייה מ-${profile.label}.`,
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
    independentRunId: `failed-before-run-${agentId}`,
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
  const top = options.at(0)
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
    const previousTurns = (input.previousOpinions ?? []).map((peer) => `${peer.label}: ${compactText(peer.chatSummary ?? peer.opinion, peer.voteReason ?? 'דעה קודמת', 260)}`)
    const lastPeer = input.previousOpinions?.[input.previousOpinions.length - 1]
    const councilContext = {
      ...councilContextFromPacket({
        topic,
        phase,
        packet: contextPacket,
        peerOpinions: input.previousOpinions ?? [],
        liveTranscript: previousTurns,
        replyToLabel: lastPeer?.label,
        replyToSnippet: lastPeer ? compactText(lastPeer.chatSummary ?? lastPeer.opinion, lastPeer.voteReason ?? '', 150) : undefined,
        turnInstruction: 'Answer DLV directly, but if previous council context exists, react to the last relevant point instead of restarting the whole discussion.',
      }),
      followUpQuestion: question,
    }
    const result = await runControlledAgentOneShot({
      agentId: input.agentId,
      runId,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      councilContext,
    })
    turn = turnFromRunResult(input.agentId, phase, result, councilContext)
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

  const previousOpinions = input.previousOpinions ?? []
  const chairEnabled = hasCouncilChair(agentIds)
  const advisorAgentIds = nonChairCouncilAgentIds(agentIds)
  const independentAgentIds = advisorAgentIds.length ? advisorAgentIds : agentIds
  const openingTurns = await Promise.all(independentAgentIds.map((agentId, index) => {
    const phase = 'opinion' as const
    const councilContext = councilContextFromPacket({
      topic,
      phase,
      packet: contextPacket,
      peerOpinions: previousOpinions,
      liveTranscript: transcriptFromPeerOpinions(previousOpinions),
      turnInstruction: independentBlindCouncilInstruction(agentId, index, independentAgentIds.length),
    })
    return runCouncilAgentTurn({
      agentId,
      phase,
      runId: `${runId}-${agentId}-turn-${index + 1}`,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      councilContext,
    })
  }))

  const openingPeerOpinions = completedPeerOpinions(openingTurns)
  const discussionTurns: Array<ControlledCouncilTurn> = input.includePeerVote === false
    ? []
    : await Promise.all(independentAgentIds.map((agentId, index) => {
      const phase = 'council-turn' as const
      const replyTarget = replyTargetFromTurns(openingTurns)
      const councilContext = councilContextFromPacket({
        topic,
        phase,
        packet: contextPacket,
        peerOpinions: [...previousOpinions, ...openingPeerOpinions],
        liveTranscript: [...transcriptFromPeerOpinions(previousOpinions), ...transcriptFromTurns(openingTurns)],
        replyToLabel: replyTarget.replyToLabel,
        replyToSnippet: replyTarget.replyToSnippet,
        turnInstruction: councilDiscussionPassInstruction(agentId, index, independentAgentIds.length),
      })
      return runCouncilAgentTurn({
        agentId,
        phase,
        runId: `${runId}-${agentId}-discussion-${index + 1}`,
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
        councilContext,
      })
    }))
  const discussionPeerOpinions = completedPeerOpinions(discussionTurns)
  const chairTurns: Array<ControlledCouncilTurn> = []
  if (chairEnabled && advisorAgentIds.length) {
    const phase = 'synthesis' as const
    const preChairTurns = discussionTurns.length ? discussionTurns : openingTurns
    const replyTarget = replyTargetFromTurns(preChairTurns)
    const councilContext = councilContextFromPacket({
      topic,
      phase,
      packet: contextPacket,
      peerOpinions: [...previousOpinions, ...openingPeerOpinions, ...discussionPeerOpinions],
      liveTranscript: [
        ...transcriptFromPeerOpinions(previousOpinions),
        ...transcriptFromTurns(openingTurns),
        ...transcriptFromTurns(discussionTurns),
      ],
      replyToLabel: replyTarget.replyToLabel,
      replyToSnippet: replyTarget.replyToSnippet,
      turnInstruction: juliusChairSynthesisInstruction(openingTurns.length),
    })
    chairTurns.push(await runCouncilAgentTurn({
      agentId: COUNCIL_CHAIR_AGENT_ID,
      phase,
      runId: `${runId}-${COUNCIL_CHAIR_AGENT_ID}-chair-synthesis`,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      councilContext,
    }))
  }

  const voteTurns: Array<ControlledCouncilTurn> = [...discussionTurns, ...chairTurns]
  const allDecisionTurns = [...openingTurns, ...voteTurns]

  const finalTurns = voteTurns.length ? voteTurns : allDecisionTurns
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
