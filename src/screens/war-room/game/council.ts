export type CouncilVirtue = 'expansion' | 'discipline' | 'asymmetry' | 'deception' | 'speed' | 'restraint' | 'logistics'

export type CouncilAnimationState = 'walk' | 'ponder' | 'think' | 'sit' | 'gesture' | 'speak'

export type CouncilMember = {
  id: string
  name: string
  epithet: string
  era: string
  virtue: CouncilVirtue
  seat: { x: number; y: number }
  wander: Array<{ x: number; y: number }>
  palette: string
  symbol: string
  modelContract: string
  motionLanguage: Array<CouncilAnimationState>
  principle: string
  strength: string
  blindSpot: string
  bubble: string
}

export type CouncilVote = {
  memberId: string
  optionId: string
  confidence: number
  rationale: string
}

export type CouncilSession = {
  id: string
  title: string
  createdAt: string
  status: 'debating' | 'voted' | 'needs-dlv' | 'closed'
  topic: string
  options: Array<{ id: string; label: string; summary: string }>
  votes: Array<CouncilVote>
  winnerOptionId: string
  finalRecommendation: string
  safety: 'read-only' | 'draft-only' | 'approval-required'
}

export type CouncilOmen = {
  id: string
  tone: 'signal' | 'review' | 'gold' | 'risk'
  title: string
  body: string
  source: string
  createdAt: string
}

export const councilMembers: Array<CouncilMember> = [
  {
    id: 'alexander',
    name: 'Alexander',
    epithet: 'The Expansion Spear',
    era: 'Macedon',
    virtue: 'expansion',
    seat: { x: 50, y: 30 },
    wander: [{ x: 47, y: 36 }, { x: 54, y: 39 }, { x: 59, y: 50 }],
    palette: '#facc15',
    symbol: '◆',
    modelContract: 'Premium overhead pixel commander: gold cloak top, spear crest, minimal visible face, heroic readable silhouette, not a CSS blob.',
    motionLanguage: ['walk', 'gesture', 'speak', 'sit'],
    principle: 'Win the market before the market understands the threat.',
    strength: 'Bold expansion and decisive campaign framing.',
    blindSpot: 'Can over-prioritize conquest before logistics are proven.',
    bubble: 'Take the strongest beachhead first.',
  },
  {
    id: 'caesar',
    name: 'Julius Caesar',
    epithet: 'The System Eagle',
    era: 'Rome',
    virtue: 'discipline',
    seat: { x: 63, y: 35 },
    wander: [{ x: 58, y: 39 }, { x: 66, y: 48 }, { x: 61, y: 58 }],
    palette: '#fb7185',
    symbol: 'Ⅶ',
    modelContract: 'Premium overhead pixel consul: crimson laurel cloak, scroll-hand gesture, minimal face, crisp high-quality pixel clusters.',
    motionLanguage: ['walk', 'ponder', 'gesture', 'speak', 'sit'],
    principle: 'Turn wins into repeatable governance and durable systems.',
    strength: 'Organization, process, persuasion, and political order.',
    blindSpot: 'May make bold creative ideas too bureaucratic.',
    bubble: 'Make the victory governable.',
  },
  {
    id: 'hannibal',
    name: 'Hannibal',
    epithet: 'The Asymmetric Fang',
    era: 'Carthage',
    virtue: 'asymmetry',
    seat: { x: 69, y: 50 },
    wander: [{ x: 63, y: 50 }, { x: 58, y: 62 }, { x: 71, y: 60 }],
    palette: '#2dd4bf',
    symbol: '▲',
    modelContract: 'Style-locked chunky 2D Punic commander: compact 2.5–3-head sprite, dark curly hair/beard, bronze/leather armor, elephant/Punic motif, low-depth Caesar-sheet family, fixed east-seat sitting anchor.',
    motionLanguage: ['walk', 'think', 'gesture', 'speak', 'sit'],
    principle: 'Win where the stronger opponent forgot to look.',
    strength: 'Surprise angles, supplier leverage, and unfair advantages.',
    blindSpot: 'May favor clever routes that are harder to operationalize.',
    bubble: 'Attack through the mountain pass.',
  },
  {
    id: 'napoleon',
    name: 'Napoleon',
    epithet: 'The Tempo Marshal',
    era: 'France',
    virtue: 'speed',
    seat: { x: 60, y: 66 },
    wander: [{ x: 57, y: 58 }, { x: 50, y: 64 }, { x: 65, y: 69 }],
    palette: '#60a5fa',
    symbol: '✦',
    modelContract: 'Premium overhead pixel marshal: blue coat top, bicorne hat silhouette, tiny hand motion, minimal face, elegant not cartoonish.',
    motionLanguage: ['walk', 'ponder', 'gesture', 'speak', 'sit'],
    principle: 'Concentrate force at the decisive point and move now.',
    strength: 'Prioritization, timing, execution cadence, campaign discipline.',
    blindSpot: 'Can compress timelines too aggressively.',
    bubble: 'Mass force on the bottleneck.',
  },
  {
    id: 'sun-tzu',
    name: 'Sun Tzu',
    epithet: 'The Silent Stratagem',
    era: 'Wu',
    virtue: 'deception',
    seat: { x: 42, y: 75 },
    wander: [{ x: 42, y: 75 }, { x: 43, y: 70 }, { x: 32, y: 63 }, { x: 40, y: 53 }],
    palette: '#86efac',
    symbol: '◇',
    modelContract: 'Locked 192×192 chunky pixel Chinese strategist-general: black guan/topknot cap, jade Han-era robe/lamellar armor, scroll/bamboo-tablet cue, southwest chair with seated/vote states facing northeast toward the council table; no turban/scimitar/shield/Middle-Eastern silhouette.',
    motionLanguage: ['walk', 'ponder', 'think', 'speak', 'sit'],
    principle: 'The best move wins before visible conflict begins.',
    strength: 'Positioning, timing, hidden risk, and elegant avoidance.',
    blindSpot: 'May be too indirect when fast execution is required.',
    bubble: 'Win before spending force.',
  },
  {
    id: 'saladin',
    name: 'Saladin',
    epithet: 'The Honor Shield',
    era: 'Ayyubid',
    virtue: 'restraint',
    seat: { x: 31, y: 50 },
    wander: [{ x: 37, y: 50 }, { x: 34, y: 39 }, { x: 28, y: 60 }],
    palette: '#86efac',
    symbol: '✧',
    modelContract: 'Premium overhead pixel guardian: emerald cloak, curved shield mark, dignified minimal face, protective motion language.',
    motionLanguage: ['walk', 'ponder', 'gesture', 'speak', 'sit'],
    principle: 'Reputation compounds; do not win today by poisoning tomorrow.',
    strength: 'Ethics, trust, restraint, customer/supplier dignity.',
    blindSpot: 'May reject sharp opportunities that are still safe.',
    bubble: 'Protect the name while we win.',
  },
  {
    id: 'genghis',
    name: 'Genghis Khan',
    epithet: 'The Logistics Storm',
    era: 'Mongol Empire',
    virtue: 'logistics',
    seat: { x: 37, y: 35 },
    wander: [{ x: 42, y: 39 }, { x: 47, y: 52 }, { x: 33, y: 45 }],
    palette: '#fdba74',
    symbol: '●',
    modelContract: 'Premium overhead pixel khan: bronze fur mantle top, horse-route insignia, strong shoulders, minimal face, not low-quality pixel mush.',
    motionLanguage: ['walk', 'think', 'gesture', 'speak', 'sit'],
    principle: 'Speed is a supply chain, not a mood.',
    strength: 'Logistics, network effects, delegation, resilient routes.',
    blindSpot: 'Can be too force-scaling oriented for delicate brand work.',
    bubble: 'Build the route before the charge.',
  },
]

export const councilSessions: Array<CouncilSession> = [
  {
    id: 'session-product-candidate-001',
    title: 'Which jewelry candidate deserves the next deep sourcing pass?',
    createdAt: 'Today 09:20',
    status: 'voted',
    topic: 'DolaroBoutique sourcing: choose between a safe proven charm, a higher-margin statement necklace, and a supplier-heavy pendant cluster.',
    options: [
      { id: 'safe-charm', label: 'Safe charm test', summary: 'Fast validation, lower upside, simplest supplier path.' },
      { id: 'statement-necklace', label: 'Statement necklace', summary: 'Higher visual impact and margin, needs stronger asset QA.' },
      { id: 'pendant-cluster', label: 'Pendant cluster', summary: 'Interesting variety, but supplier variance is high.' },
    ],
    votes: [
      { memberId: 'alexander', optionId: 'statement-necklace', confidence: 87, rationale: 'Bigger beachhead and better customer memory.' },
      { memberId: 'caesar', optionId: 'safe-charm', confidence: 72, rationale: 'Simpler governance and repeatable listing pattern.' },
      { memberId: 'hannibal', optionId: 'statement-necklace', confidence: 79, rationale: 'Visual asymmetry gives a stronger angle against generic sellers.' },
      { memberId: 'napoleon', optionId: 'safe-charm', confidence: 74, rationale: 'Fastest decisive validation.' },
      { memberId: 'sun-tzu', optionId: 'statement-necklace', confidence: 81, rationale: 'Better positioning before the market compares price.' },
      { memberId: 'saladin', optionId: 'safe-charm', confidence: 70, rationale: 'Lowest promise/risk gap for customers.' },
      { memberId: 'genghis', optionId: 'statement-necklace', confidence: 76, rationale: 'If supplier route is stable, scale advantage is stronger.' },
    ],
    winnerOptionId: 'statement-necklace',
    finalRecommendation: 'Council leans to Statement Necklace, but requires supplier consistency and asset QA before any draft moves forward.',
    safety: 'draft-only',
  },
  {
    id: 'session-war-room-models-002',
    title: 'God model direction: what must be true before generation?',
    createdAt: 'Today 10:45',
    status: 'needs-dlv',
    topic: 'New council and god models must be distinct, premium pixelated, with minimal visible faces and real walk/think/sit/speak states.',
    options: [
      { id: 'single-anchor', label: 'One perfect anchor first', summary: 'Make one approved council member before any batch.' },
      { id: 'full-batch', label: 'Batch all seven', summary: 'Faster but risks another rejected model family.' },
      { id: 'ui-first', label: 'UI shell first', summary: 'No model swaps until the table/history/stats interaction works.' },
    ],
    votes: [
      { memberId: 'alexander', optionId: 'single-anchor', confidence: 84, rationale: 'A perfect spearhead sets the conquest style.' },
      { memberId: 'caesar', optionId: 'ui-first', confidence: 78, rationale: 'Build the institution before parading the legion.' },
      { memberId: 'hannibal', optionId: 'single-anchor', confidence: 82, rationale: 'One unusual strong silhouette beats seven weak clones.' },
      { memberId: 'napoleon', optionId: 'single-anchor', confidence: 88, rationale: 'Concentrate effort at the decisive point.' },
      { memberId: 'sun-tzu', optionId: 'ui-first', confidence: 76, rationale: 'Avoid revealing a weak army.' },
      { memberId: 'saladin', optionId: 'ui-first', confidence: 80, rationale: 'Respect the existing accepted gods; do not break trust.' },
      { memberId: 'genghis', optionId: 'single-anchor', confidence: 77, rationale: 'A reusable route begins with one proven rider.' },
    ],
    winnerOptionId: 'single-anchor',
    finalRecommendation: 'Do not batch new models. First ship the council table/history/stats UI, then create one perfect anchor member with idle/walk/ponder/sit/gesture/speak strips.',
    safety: 'read-only',
  },
]

export const councilOmens: Array<CouncilOmen> = [
  {
    id: 'omen-approval',
    tone: 'review',
    title: 'Athena Seal waiting',
    body: 'Anything that touches Etsy, suppliers, spend, or account state remains locked until DLV approves.',
    source: 'Safety law',
    createdAt: 'Live',
  },
  {
    id: 'omen-models',
    tone: 'risk',
    title: 'Model family warning',
    body: 'Rejected god families must not be patched live. Use a one-anchor perfection pipeline before any rollout.',
    source: 'Council memory',
    createdAt: 'Today',
  },
  {
    id: 'omen-council',
    tone: 'gold',
    title: 'Council table active',
    body: 'Press the table in Olympus Command to inspect meetings, votes, winners, and member performance.',
    source: 'Olympus Command',
    createdAt: 'Now',
  },
]

export function councilMemberById(id: string) {
  return councilMembers.find((member) => member.id === id)
}

export function councilVoteStats() {
  return councilMembers.map((member) => {
    const votes = councilSessions.flatMap((session) => session.votes.filter((vote) => vote.memberId === member.id))
    const winnerVotes = councilSessions.filter((session) => session.votes.some((vote) => vote.memberId === member.id && vote.optionId === session.winnerOptionId))
    const avgConfidence = votes.length ? Math.round(votes.reduce((sum, vote) => sum + vote.confidence, 0) / votes.length) : 0
    return {
      member,
      votes: votes.length,
      winningVotes: winnerVotes.length,
      winRate: votes.length ? Math.round((winnerVotes.length / votes.length) * 100) : 0,
      avgConfidence,
      bestSuggestionScore: Math.min(99, Math.round((winnerVotes.length * 28) + (avgConfidence * 0.62))),
    }
  }).sort((a, b) => b.bestSuggestionScore - a.bestSuggestionScore)
}
