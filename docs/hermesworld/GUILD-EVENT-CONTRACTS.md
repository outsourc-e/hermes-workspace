# HermesWorld Guild/Event/Economy Contracts

Last updated: 2026-05-06

## Goal

Define safe client/server data contracts for HermesWorld guild creation, weekend wars, raids, leaderboards, Founders Vault, and chat trade. The client can render social/game/economy state, but all valuable state is server-authoritative. No prize/oracle secrets, payout rules, hidden reward tables, private grant reasons, anti-abuse thresholds, or signer credentials are client-visible.

## Non-negotiable security rules

1. Client input is an intent, never proof.
2. Inventory, currency balances, guild permissions, war scores, raid rewards, event grants, and trade settlement are server-authoritative.
3. Client-visible contracts may include public lore, public item metadata, cosmetic names, event schedules, visible scores, and generic claim states.
4. Private services own eligibility, hidden reward tables, valuable grants, prize/oracle validation, anti-abuse scoring, payout queues, and audit trails.
5. Any endpoint that mutates valuable state must be authenticated, idempotent, rate-limited, and backed by a private audit log.
6. Valuable operations should use explicit request IDs/idempotency keys so retries do not duplicate grants or transfers.
7. Do not trust client timestamps, positions, item IDs, quantities, wallet ownership, raid completion, war contribution, or leaderboard score.
8. Do not leak the reason a valuable claim failed if that reason helps attackers enumerate valid states.

## Shared primitives

```ts
type UUID = string
type ISODateTime = string
type Chain = 'eth' | 'sol'
type CurrencyCode = 'coins' | 'aether' | 'eth' | 'sol'
type PlayerId = string
type AgentId = string
type GuildId = string
type ItemInstanceId = string
type ItemDefinitionId = string
type WalletAddress = string

type PublicActorRef =
  | { kind: 'player'; playerId: PlayerId; displayName: string }
  | { kind: 'agent'; agentId: AgentId; displayName: string; ownerPlayerId: PlayerId }

type MoneyAmount = {
  currency: CurrencyCode
  amountMinorUnits: string
}

type PublicItemStack = {
  itemInstanceId?: ItemInstanceId
  itemDefinitionId: ItemDefinitionId
  displayName: string
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'founder' | 'event'
  quantity: number
  iconUrl: string
  binding: 'none' | 'bind_on_pickup' | 'bind_on_equip' | 'account_bound' | 'guild_bound'
  tradeable: boolean
  cosmeticOnly: boolean
}

type Idempotency = {
  requestId: UUID
  clientCreatedAt: ISODateTime
}

type SafeMutationResponse<T> = {
  ok: boolean
  requestId: UUID
  result?: T
  publicError?: {
    code: 'invalid_input' | 'auth_required' | 'permission_denied' | 'rate_limited' | 'conflict' | 'not_found' | 'temporarily_unavailable'
    message: string
  }
}
```

Client-safe IDs are opaque. They must not encode reward tiers, grant reasons, inventory database row order, hidden seed data, or prize eligibility.

## Auth/session model

Client requests carry one of:

```ts
type GameSessionAuth = {
  sessionToken: string // HttpOnly cookie preferred; never localStorage for privileged operations.
}

type WalletSignedSession = {
  chain: Chain
  address: WalletAddress
  message: string
  signature: string
  nonceId: UUID
}
```

Server responsibilities:
- Resolve session to playerId.
- Verify wallet signatures server-side.
- Bind wallet sessions to player accounts server-side.
- Enforce CSRF protection for cookie-based mutating routes.
- Never accept playerId/guildId ownership claims from client without server lookup.

## 1. Guild creation contract

### Public guild shape

```ts
type GuildRole = 'founder' | 'leader' | 'officer' | 'raider' | 'trader' | 'member' | 'guest'

type GuildPermission =
  | 'invite_member'
  | 'kick_member'
  | 'edit_profile'
  | 'manage_roles'
  | 'queue_war'
  | 'start_raid'
  | 'manage_vault'
  | 'post_announcement'

type GuildPublicProfile = {
  guildId: GuildId
  slug: string
  displayName: string
  motto?: string
  banner: {
    emblemId: string
    primaryColor: string
    secondaryColor: string
    frameId?: string
  }
  publicDescription?: string
  level: number
  xp: number
  memberCount: number
  agentCount: number
  hallThemeId?: string
  recruitment: 'open' | 'application' | 'invite_only' | 'closed'
  tags: Array<'casual' | 'raiding' | 'pvp' | 'builders' | 'trading' | 'founders' | 'lore'>
  createdAt: ISODateTime
}

type GuildMemberPublic = {
  guildId: GuildId
  actor: PublicActorRef
  role: GuildRole
  joinedAt: ISODateTime
  publicContributionScore: number
}
```

### Create guild

Client -> server:

```ts
type CreateGuildRequest = Idempotency & {
  displayName: string
  slug: string
  motto?: string
  publicDescription?: string
  banner: {
    emblemId: string
    primaryColor: string
    secondaryColor: string
    frameId?: string
  }
  recruitment: 'open' | 'application' | 'invite_only'
  tags: GuildPublicProfile['tags']
  founderActor: { kind: 'player'; playerId?: never }
}
```

Server -> client:

```ts
type CreateGuildResponse = SafeMutationResponse<{
  guild: GuildPublicProfile
  viewerRole: GuildRole
  viewerPermissions: GuildPermission[]
}>
```

Server validation:
- Authenticate current player.
- Enforce one active founder guild per player unless admin-granted.
- Validate name/slug length, profanity, impersonation, reserved names.
- Validate banner IDs against public cosmetic catalog.
- Charge creation fee server-side if enabled; never trust client balance.
- Grant founder role and audit the creation.

Private-only guild fields:
- normalizedName collision index
- moderation flags
- creation IP hash / device risk
- payment/fee transaction IDs
- abuse score
- internal notes
- guild vault ledger
- invite/application fraud signals

## 2. Guild membership and agent companion contract

```ts
type GuildInviteRequest = Idempotency & {
  guildId: GuildId
  targetPlayerHandle: string
  requestedRole?: Exclude<GuildRole, 'founder' | 'leader'>
}

type GuildInviteResponse = SafeMutationResponse<{
  inviteId: UUID
  expiresAt: ISODateTime
  publicStatus: 'sent' | 'already_member' | 'blocked'
}>

type AddAgentToGuildRequest = Idempotency & {
  guildId: GuildId
  agentId: AgentId
  intendedRole: 'scout' | 'scribe' | 'builder' | 'trader' | 'combat' | 'healer'
}

type AddAgentToGuildResponse = SafeMutationResponse<{
  guildId: GuildId
  agent: PublicActorRef
  publicCapabilities: string[]
  contributionMultiplier: number
}>
```

Server rules:
- Player must own/control the agent.
- Guild must have available agent seats.
- Agent capabilities are public summaries only; model credentials/provider configs remain private.
- Offline agent action limits are server-side, not client-configurable.

## 3. Guild vault contract

The guild vault is distinct from Founders Vault. It is shared, permissioned, and ledger-backed.

```ts
type GuildVaultSlotPublic = {
  guildId: GuildId
  slotId: UUID
  item?: PublicItemStack
  lockedBy?: PublicActorRef
  publicNote?: string
}

type GuildVaultDepositRequest = Idempotency & {
  guildId: GuildId
  itemInstanceId: ItemInstanceId
  quantity: number
  publicNote?: string
}

type GuildVaultWithdrawRequest = Idempotency & {
  guildId: GuildId
  itemInstanceId: ItemInstanceId
  quantity: number
  destination: 'player_inventory' | 'raid_loadout' | 'guild_war_loadout'
}
```

Server rules:
- Atomic transfer from player inventory to guild vault or back.
- Permission check for withdraw/manage.
- Ledger every mutation with actor, before/after, reason, requestId.
- No client-writeable item stats.

Private-only:
- Full vault ledger
- moderation/admin holds
- dupe-detection tags
- item provenance graph
- risk scoring

## 4. Weekend guild wars contract

Weekend wars are scheduled, server-scored, and spectator-friendly. The client renders schedule, visible objectives, live scoreboard, and public feed. The server decides scoring.

### Public event schedule

```ts
type WeekendWarPublicEvent = {
  eventId: UUID
  seasonId: string
  mapId: string
  displayName: string
  startsAt: ISODateTime
  endsAt: ISODateTime
  registrationClosesAt: ISODateTime
  status: 'scheduled' | 'registration_open' | 'live' | 'scoring_finalizing' | 'final' | 'cancelled'
  participantCap: number
  publicRulesVersion: string
  visibleObjectives: Array<{
    objectiveId: string
    displayName: string
    kind: 'obelisk' | 'sigil' | 'guild_hall_relic' | 'escort' | 'boss'
    mapRegionId: string
    publicScoreHint: string
  }>
  publicRewards: Array<{
    rankBand: 'winner' | 'top_3' | 'top_10' | 'participation'
    rewardPreview: string
    cosmeticOnly: boolean
  }>
}
```

### Register for war

```ts
type RegisterGuildWarRequest = Idempotency & {
  guildId: GuildId
  eventId: UUID
  declaredRoster: Array<{ actorKind: 'player' | 'agent'; actorId: string }>
}

type RegisterGuildWarResponse = SafeMutationResponse<{
  registrationId: UUID
  eventId: UUID
  guildId: GuildId
  publicStatus: 'registered' | 'waitlisted' | 'rejected'
  rosterPublic: GuildMemberPublic[]
}>
```

Server scoring input:

```ts
type WarActionIntent = Idempotency & {
  eventId: UUID
  guildId: GuildId
  actorId: string
  actionType: 'capture_objective' | 'defend_objective' | 'damage_relic' | 'repair_relic' | 'support_ally' | 'scout_ping'
  targetObjectiveId?: string
  clientObservedAt: ISODateTime
  clientContext: {
    mapRegionId: string
    positionBucket?: string
    animationState?: string
  }
}
```

Server public state:

```ts
type WarScoreboardPublic = {
  eventId: UUID
  status: WeekendWarPublicEvent['status']
  updatedAt: ISODateTime
  guildScores: Array<{
    guildId: GuildId
    guildName: string
    banner: GuildPublicProfile['banner']
    publicScore: number
    rank: number
    heldObjectives: string[]
    publicMomentum: 'falling' | 'stable' | 'rising'
  }>
  publicFeed: Array<{
    feedId: UUID
    occurredAt: ISODateTime
    message: string
    guildId?: GuildId
    objectiveId?: string
  }>
}
```

Server rules:
- Ignore direct score values from client.
- Score from validated server events, objective state machine, anti-cheat, and rate limits.
- Publish delayed/smoothed public scores if needed to prevent automation/sniping.
- Rewards are granted only after finalization job.

Private-only war data:
- scoring weights
- anti-cheat thresholds
- hidden tie breakers
- raw action stream
- risk flags
- delayed finalization internals
- valuable reward eligibility
- oracle/prize flags

## 5. Raids/dungeons contract

Raids are party instances with server-authoritative completion, loot, and contribution.

```ts
type RaidPublicDefinition = {
  raidId: string
  displayName: string
  minPartySize: number
  maxPartySize: number
  allowedAgentSlots: number
  recommendedRoles: Array<'tank' | 'healer' | 'damage' | 'support' | 'scout'>
  publicBosses: Array<{
    bossId: string
    displayName: string
    publicMechanics: string[]
  }>
  publicLootPreview: Array<{
    itemDefinitionId: ItemDefinitionId
    displayName: string
    rarity: PublicItemStack['rarity']
    dropHint: string
  }>
  lockout: {
    kind: 'none' | 'daily' | 'weekly' | 'seasonal'
    resetsAt?: ISODateTime
  }
}

type CreateRaidInstanceRequest = Idempotency & {
  raidId: string
  guildId?: GuildId
  partyActorIds: string[]
  difficulty: 'story' | 'normal' | 'heroic'
}

type CreateRaidInstanceResponse = SafeMutationResponse<{
  raidInstanceId: UUID
  raid: RaidPublicDefinition
  party: PublicActorRef[]
  status: 'forming' | 'ready' | 'in_progress'
}>

type RaidActionIntent = Idempotency & {
  raidInstanceId: UUID
  actorId: string
  actionType: 'attack' | 'heal' | 'shield' | 'interrupt' | 'scout' | 'use_item' | 'agent_assist'
  targetId?: string
  clientObservedAt: ISODateTime
  clientContext?: Record<string, string | number | boolean>
}

type RaidCompletionPublic = {
  raidInstanceId: UUID
  raidId: string
  status: 'failed' | 'completed'
  completedAt?: ISODateTime
  publicGrade: 'bronze' | 'silver' | 'gold' | 'mythic'
  publicStats: {
    durationSeconds: number
    deaths: number
    bossKills: number
  }
  lootRolls?: Array<{
    lootRollId: UUID
    item: PublicItemStack
    eligibleActors: PublicActorRef[]
    publicState: 'rolling' | 'awarded' | 'expired'
    winner?: PublicActorRef
  }>
}
```

Server rules:
- Server controls HP, boss state, lockouts, completion, loot rolls, XP, currency grants.
- Client may render boss mechanics and send action intents only.
- Agent companions can fill roles but cannot bypass lockouts or loot eligibility.
- Rare drops get item provenance tags server-side.

Private-only raid data:
- exact loot tables/drop rates
- rare item seed
- anti-cheat contribution thresholds
- valuable prize eligibility
- hidden boss state mutations
- private model/agent execution traces

## 6. Leaderboards contract

Leaderboards are public ranking surfaces with private score provenance.

```ts
type LeaderboardKind =
  | 'guild_war_season'
  | 'raid_clear_time'
  | 'guild_xp'
  | 'market_reputation'
  | 'crafting_competition'
  | 'lore_trial'

type LeaderboardPublicEntry = {
  leaderboardId: UUID
  kind: LeaderboardKind
  seasonId: string
  rank: number
  actor: PublicActorRef | { kind: 'guild'; guildId: GuildId; displayName: string; banner: GuildPublicProfile['banner'] }
  publicScore: number
  publicScoreLabel: string
  badgeIds: string[]
  updatedAt: ISODateTime
}

type GetLeaderboardResponse = {
  leaderboardId: UUID
  kind: LeaderboardKind
  seasonId: string
  generatedAt: ISODateTime
  entries: LeaderboardPublicEntry[]
  viewerRank?: LeaderboardPublicEntry
}
```

Server rules:
- Scores are generated from private event logs, not client submission.
- Use delayed publication for prize-sensitive competitions.
- Manual moderation can hide entries; public response should say generic “entry under review”.

Private-only:
- score calculation formulas if exploitable
- hidden disqualification reasons
- raw event logs
- moderation notes
- prize/oracle mappings
- reward inventory

## 7. Founders Vault / event inventory contract

Founders Vault is an event inventory tab for founder gifts, purchases, compensations, season transitions, and website-store deliveries. It is not client-writeable.

```ts
type EventInventoryGrantPublic = {
  grantId: UUID
  grantType: 'founder_gift' | 'purchase_delivery' | 'compensation' | 'season_reward' | 'event_reward'
  displayTitle: string
  displayMessage: string
  grantedAt: ISODateTime
  expiresAt?: ISODateTime
  claimState: 'unclaimed' | 'claimed' | 'expired' | 'revoked' | 'pending'
  previewItems: PublicItemStack[]
  previewCurrencies: MoneyAmount[]
  badgeCount: number
}

type FoundersVaultPublic = {
  playerId: PlayerId
  tabName: 'Founders Vault' | 'Event Mail'
  unclaimedCount: number
  grants: EventInventoryGrantPublic[]
}

type ClaimEventInventoryGrantRequest = Idempotency & {
  grantId: UUID
}

type ClaimEventInventoryGrantResponse = SafeMutationResponse<{
  grantId: UUID
  claimState: 'claimed' | 'pending'
  deliveredItems: PublicItemStack[]
  deliveredCurrencies: MoneyAmount[]
  publicMessage: string
}>
```

Private grant API; never browser-callable:

```ts
type PrivateCreateEventGrantRequest = {
  serviceRequestId: UUID
  targetPlayerId: PlayerId
  grantType: EventInventoryGrantPublic['grantType']
  reasonCode: 'name_reservation' | 'manual_founder_approve' | 'store_purchase' | 'compensation' | 'season_transition' | 'admin_test'
  sourceRef?: string
  items: Array<{ itemDefinitionId: ItemDefinitionId; quantity: number; privateRollSeed?: string }>
  currencies: MoneyAmount[]
  expiresAt?: ISODateTime
  operatorId?: string
}
```

Server rules:
- Gift granting via private API only.
- Claims are idempotent and atomic: grant state changes and inventory/currency delivery happen in one transaction.
- Purchase delivery requires verified payment/webhook server-side.
- Founder status/badges are public only after private grant approval.

Private-only Founders Vault data:
- grant reason code when sensitive
- manual approver/operator ID
- payment provider transaction IDs
- fraud/risk status
- private roll seed
- inventory ledger before/after
- revocation notes
- store webhook secrets

## 8. Chat trade window contract

Chat trade is a secure two-party offer window opened from chat, e.g. `/trade @user`. Both sides add items/currency, lock, then confirm. Settlement is atomic server-side.

```ts
type TradeWindowPublicState = {
  tradeId: UUID
  status: 'invited' | 'open' | 'locked' | 'confirming' | 'settled' | 'cancelled' | 'expired' | 'disputed'
  createdAt: ISODateTime
  expiresAt: ISODateTime
  participants: [PublicActorRef, PublicActorRef]
  offers: Record<PlayerId, {
    items: PublicItemStack[]
    currencies: MoneyAmount[]
    locked: boolean
    confirmed: boolean
    publicWarnings: Array<'balance_changed' | 'item_unavailable' | 'high_value_trade' | 'new_counterparty' | 'recent_offer_change'>
  }>
  lastChangedBy?: PublicActorRef
  lastChangedAt: ISODateTime
}

type OpenTradeRequest = Idempotency & {
  targetPlayerHandle: string
  source: 'chat_command' | 'profile_button' | 'market_listing'
}

type UpdateTradeOfferRequest = Idempotency & {
  tradeId: UUID
  items: Array<{ itemInstanceId: ItemInstanceId; quantity: number }>
  currencies: MoneyAmount[]
}

type LockTradeOfferRequest = Idempotency & {
  tradeId: UUID
  lock: boolean
}

type ConfirmTradeRequest = Idempotency & {
  tradeId: UUID
  confirm: true
  visibleOfferDigest: string
}

type TradeMutationResponse = SafeMutationResponse<{
  trade: TradeWindowPublicState
}>
```

Settlement model:
- Any offer update unlocks both participants and clears confirmations.
- Client displays previews, warnings, and digest.
- Server recomputes digest from canonical offer state.
- Server checks item ownership, locks item instances, checks balances, validates binding/tradeability, enforces limits, and transfers atomically.
- Hard currency trades use escrow/settlement service; client never submits raw transfer truth.
- Agent-mediated trading can propose offers but cannot confirm above player-defined caps.

Private-only trade data:
- risk score
- anti-RMT rules
- high-value thresholds
- escrow private state
- compliance/KYC flags
- raw wallet/rpc settlement internals
- dispute/moderation notes
- participant IP/device hashes

## 9. Public event feed contract

```ts
type PublicWorldFeedEvent = {
  feedId: UUID
  kind: 'guild_created' | 'war_objective_captured' | 'raid_completed' | 'leaderboard_finalized' | 'founder_gift_arrived' | 'market_milestone'
  occurredAt: ISODateTime
  headline: string
  body?: string
  actor?: PublicActorRef | { kind: 'guild'; guildId: GuildId; displayName: string }
  guildId?: GuildId
  eventId?: UUID
  iconUrl?: string
}
```

Feed redaction rules:
- No exact reward amounts for prize-bearing events until publicly announced.
- No private grant reasons.
- No trade counterparty details unless both parties opted into public sharing.
- No oracle status.
- No anti-cheat/moderation hints.

## 10. Private audit/event ledger

Every valuable mutation writes a private audit event.

```ts
type PrivateAuditEvent = {
  auditId: UUID
  requestId: UUID
  actorPlayerId?: PlayerId
  actorAgentId?: AgentId
  action:
    | 'guild.create'
    | 'guild.invite'
    | 'guild.vault.deposit'
    | 'guild.vault.withdraw'
    | 'war.register'
    | 'war.score_event'
    | 'war.reward_finalize'
    | 'raid.instance_create'
    | 'raid.completion'
    | 'raid.loot_award'
    | 'leaderboard.finalize'
    | 'event_grant.create'
    | 'event_grant.claim'
    | 'trade.open'
    | 'trade.offer_update'
    | 'trade.settle'
  entityType: 'guild' | 'war' | 'raid' | 'leaderboard' | 'grant' | 'trade' | 'inventory' | 'wallet'
  entityId: UUID | string
  beforeHash?: string
  afterHash?: string
  privateMetadata: Record<string, unknown>
  createdAt: ISODateTime
}
```

This ledger is never exposed directly to the browser. Public histories are separately projected/redacted.

## 11. API surface summary

Public/browser-callable:
- GET /api/hermesworld/guilds/:guildId
- POST /api/hermesworld/guilds/create
- POST /api/hermesworld/guilds/:guildId/invites
- POST /api/hermesworld/guilds/:guildId/agents
- GET /api/hermesworld/guilds/:guildId/vault
- POST /api/hermesworld/guilds/:guildId/vault/deposit
- POST /api/hermesworld/guilds/:guildId/vault/withdraw
- GET /api/hermesworld/events/weekend-wars
- POST /api/hermesworld/events/weekend-wars/:eventId/register
- POST /api/hermesworld/events/weekend-wars/:eventId/actions
- GET /api/hermesworld/events/weekend-wars/:eventId/scoreboard
- GET /api/hermesworld/raids
- POST /api/hermesworld/raids/instances
- POST /api/hermesworld/raids/:raidInstanceId/actions
- GET /api/hermesworld/leaderboards/:leaderboardId
- GET /api/hermesworld/founders-vault
- POST /api/hermesworld/founders-vault/:grantId/claim
- POST /api/hermesworld/trades/open
- POST /api/hermesworld/trades/:tradeId/offer
- POST /api/hermesworld/trades/:tradeId/lock
- POST /api/hermesworld/trades/:tradeId/confirm
- GET /api/hermesworld/feed

Private service-only:
- POST /private/hermesworld/event-grants/create
- POST /private/hermesworld/event-grants/revoke
- POST /private/hermesworld/war/finalize-score
- POST /private/hermesworld/war/grant-rewards
- POST /private/hermesworld/raid/finalize-loot
- POST /private/hermesworld/leaderboards/finalize
- POST /private/hermesworld/trades/settle-hard-currency
- POST /private/hermesworld/oracle/validate-prize-eligibility
- POST /private/hermesworld/audit/events

## 12. What must never be public

Never ship any of this in client code, static JSON, sourcemaps, public KV, public API responses, public logs, screenshots, fixtures, or docs intended for players:

- prize/oracle secrets
- private oracle URLs or service tokens
- treasury wallet private keys
- payout signer keys
- RPC credentials
- wallet seed phrases
- JWT/HMAC/session signing secrets
- payment webhook secrets
- store webhook raw payload secrets
- private reward inventory and prize counts
- ETH/SOL payout amounts before approval/public announcement
- exact prize-bearing event mappings
- exact hidden reward tables/drop rates for valuable items
- weekend war scoring weights if exploitable
- hidden tie-breakers
- anti-cheat thresholds
- RMT/fraud scoring rules
- KYC/compliance provider tokens
- moderation/admin notes
- private grant reason codes when sensitive
- payment transaction details
- item provenance graph if exploitable
- raw audit ledger
- raw IP/device identifiers
- non-redacted wallet risk data
- private model/provider credentials for agents
- offline agent spending caps beyond public user-configured values
- internal admin endpoints
- debug bypasses
- private seeds/salts/commitments before reveal
- database connection strings
- any environment variable named or prefixed: PRIVATE_, ORACLE_, TREASURY_, WALLET_, SIGNER_, HMAC_, JWT_, SESSION_, RPC_, PAYMENT_, STRIPE_, KYC_, ADMIN_

## 13. Minimal implementation order

1. Add shared TypeScript schemas for public contract types.
2. Stub public GET endpoints with static/mock data only.
3. Add private audit helper before mutating endpoints.
4. Implement guild creation with server-side permission and idempotency.
5. Implement Founders Vault read + private grant + idempotent claim.
6. Implement chat trade state machine with soft-currency/items only.
7. Add weekend war schedule and public scoreboard projection.
8. Add raid definition and instance skeleton.
9. Add leaderboard projection from private finalized scores.
10. Add hard-currency escrow/prize-oracle integrations only behind private services.

## 14. Acceptance checks

A patch touching these systems should pass these checks before review:

- No client file contains oracle/prize/treasury/private env names except as denylist tests/docs.
- No client response includes private reason codes.
- Every valuable mutation has requestId/idempotency.
- Every valuable mutation writes private audit event.
- Inventory/currency/trade settlement are atomic server operations.
- Public leaderboard/war/raid data is a projection, not the raw scoring/event log.
- Founders Vault grants cannot be created from browser-callable endpoints.
- Trade confirmation uses server recomputed digest, not client offer truth.
