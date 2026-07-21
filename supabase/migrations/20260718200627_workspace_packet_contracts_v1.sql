-- Workspace Packet Contracts V1 — additive foundation only
-- Safety: no backfill, no table deletion, no anon/authenticated policy, no live apply from the app.
-- Existing goblin_analytics.workspace_handoffs remains untouched.

create schema if not exists workspace_core;

-- Keep this additive migration independently safe when the shared Workspace
-- foundation has not yet created its schema-version registry.
create table if not exists workspace_core.schema_versions (
  id text primary key,
  version text not null,
  applied_at timestamptz not null default now(),
  notes text
);

create table if not exists workspace_core.packets (
  packet_id text primary key,
  packet_lineage_id text not null,
  revision integer not null check (revision > 0),
  supersedes_packet_id text references workspace_core.packets(packet_id),
  run_id text not null,
  schema_version text not null,
  packet_type text not null,
  from_room_id text not null,
  from_agent_id text,
  to_room_id text not null,
  to_agent_id text,
  created_at timestamptz not null,
  idempotency_key text not null unique,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  envelope jsonb not null,
  mirrored_at timestamptz not null default now(),
  unique (packet_lineage_id, revision)
);

create index if not exists idx_workspace_packets_run_created
  on workspace_core.packets(run_id, created_at);
create index if not exists idx_workspace_packets_type_created
  on workspace_core.packets(packet_type, created_at desc);
create index if not exists idx_workspace_packets_lineage_revision
  on workspace_core.packets(packet_lineage_id, revision);

create table if not exists workspace_core.packet_lifecycle_events (
  event_id text primary key,
  packet_id text not null references workspace_core.packets(packet_id),
  event_type text not null,
  actor_room_id text not null,
  actor_agent_id text,
  created_at timestamptz not null,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  event_record jsonb not null,
  mirrored_at timestamptz not null default now()
);

create index if not exists idx_workspace_packet_events_packet_created
  on workspace_core.packet_lifecycle_events(packet_id, created_at);

create table if not exists workspace_core.handoff_acks (
  ack_id text primary key,
  packet_id text not null references workspace_core.packets(packet_id),
  accepted_content_hash text not null check (accepted_content_hash ~ '^[a-f0-9]{64}$'),
  receiver_room_id text not null,
  receiver_agent_id text,
  outcome text not null check (outcome in ('accepted', 'blocked', 'rejected')),
  checked_criteria_ids jsonb not null default '[]'::jsonb,
  missing_fields jsonb not null default '[]'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  reason text,
  created_at timestamptz not null,
  ack_record jsonb not null,
  mirrored_at timestamptz not null default now()
);

create index if not exists idx_workspace_handoff_acks_packet_created
  on workspace_core.handoff_acks(packet_id, created_at);

create table if not exists workspace_core.approval_grants (
  grant_id text primary key,
  run_id text not null,
  cost_risk_lock_packet_id text not null references workspace_core.packets(packet_id),
  cost_risk_lock_content_hash text not null check (cost_risk_lock_content_hash ~ '^[a-f0-9]{64}$'),
  action_id text not null,
  action_type text not null,
  stage text not null,
  target jsonb not null,
  scope_id text not null,
  scope_hash text not null check (scope_hash ~ '^[a-f0-9]{64}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  maximum_minor_units bigint not null check (maximum_minor_units >= 0),
  status text not null check (status in ('issued', 'consumed', 'revoked')),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  grant_record jsonb not null,
  mirrored_at timestamptz not null default now(),
  check (expires_at > issued_at),
  check ((status = 'consumed' and consumed_at is not null) or (status <> 'consumed' and consumed_at is null)),
  constraint approval_grants_record_binding_check check (
    grant_record #>> '{payload,contractVersion}' = 'approval-grant-v1'
    and grant_record #>> '{payload,issuedBy}' = 'workspace-server'
    and grant_record #>> '{payload,grantId}' = grant_id
    and grant_record #>> '{payload,runId}' = run_id
    and grant_record #>> '{payload,costRiskLockPacketId}' = cost_risk_lock_packet_id
    and grant_record #>> '{payload,costRiskLockContentHash}' = cost_risk_lock_content_hash
    and grant_record #>> '{payload,actionId}' = action_id
    and grant_record #>> '{payload,actionType}' = action_type
    and grant_record #>> '{payload,stage}' = stage
    and grant_record #> '{payload,target}' = target
    and grant_record #>> '{payload,scopeId}' = scope_id
    and grant_record #>> '{payload,scopeHash}' = scope_hash
    and grant_record #>> '{payload,currency}' = currency
    and (grant_record #>> '{payload,maximumMinorUnits}')::bigint = maximum_minor_units
    and (grant_record #>> '{payload,issuedAt}')::timestamptz = issued_at
    and (grant_record #>> '{payload,expiresAt}')::timestamptz = expires_at
    and grant_record #>> '{status}' = status
    and (
      (grant_record #>> '{consumedAt}' is null and consumed_at is null)
      or (grant_record #>> '{consumedAt}')::timestamptz = consumed_at
    )
  )
);

create index if not exists idx_workspace_approval_grants_run_status
  on workspace_core.approval_grants(run_id, status, issued_at desc);

create or replace function workspace_core.prevent_packet_content_mutation()
returns trigger
language plpgsql
as $$
begin
  if row(
    old.packet_lineage_id, old.revision, old.supersedes_packet_id, old.run_id,
    old.schema_version, old.packet_type, old.from_room_id, old.from_agent_id,
    old.to_room_id, old.to_agent_id, old.created_at, old.idempotency_key,
    old.content_hash, old.envelope
  ) is distinct from row(
    new.packet_lineage_id, new.revision, new.supersedes_packet_id, new.run_id,
    new.schema_version, new.packet_type, new.from_room_id, new.from_agent_id,
    new.to_room_id, new.to_agent_id, new.created_at, new.idempotency_key,
    new.content_hash, new.envelope
  ) then
    raise exception 'workspace_core.packets content is immutable; create a new Packet revision';
  end if;
  return new;
end;
$$;

create or replace function workspace_core.prevent_append_only_record_mutation()
returns trigger
language plpgsql
as $$
begin
  if to_jsonb(old) - 'mirrored_at' is distinct from to_jsonb(new) - 'mirrored_at' then
    raise exception 'Workspace Packet lifecycle and ACK rows are append-only';
  end if;
  return new;
end;
$$;

create or replace function workspace_core.prevent_approval_grant_binding_mutation()
returns trigger
language plpgsql
as $$
begin
  if row(
    old.run_id, old.cost_risk_lock_packet_id, old.cost_risk_lock_content_hash,
    old.action_id, old.action_type, old.stage, old.target, old.scope_id,
    old.scope_hash, old.currency, old.maximum_minor_units, old.issued_at, old.expires_at,
    old.grant_record - 'status' - 'consumedAt'
  ) is distinct from row(
    new.run_id, new.cost_risk_lock_packet_id, new.cost_risk_lock_content_hash,
    new.action_id, new.action_type, new.stage, new.target, new.scope_id,
    new.scope_hash, new.currency, new.maximum_minor_units, new.issued_at, new.expires_at,
    new.grant_record - 'status' - 'consumedAt'
  ) then
    raise exception 'ApprovalGrant action, target, scope, cost and Packet binding are immutable';
  end if;
  if old.status in ('consumed', 'revoked') and row(
    old.status, old.consumed_at, old.grant_record
  ) is distinct from row(
    new.status, new.consumed_at, new.grant_record
  ) then
    raise exception 'Terminal ApprovalGrant status and record are immutable';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_workspace_packets_immutable') then
    create trigger trg_workspace_packets_immutable
    before update on workspace_core.packets
    for each row execute function workspace_core.prevent_packet_content_mutation();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_workspace_packet_events_append_only') then
    create trigger trg_workspace_packet_events_append_only
    before update on workspace_core.packet_lifecycle_events
    for each row execute function workspace_core.prevent_append_only_record_mutation();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_workspace_handoff_acks_append_only') then
    create trigger trg_workspace_handoff_acks_append_only
    before update on workspace_core.handoff_acks
    for each row execute function workspace_core.prevent_append_only_record_mutation();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_workspace_approval_grants_binding_immutable') then
    create trigger trg_workspace_approval_grants_binding_immutable
    before update on workspace_core.approval_grants
    for each row execute function workspace_core.prevent_approval_grant_binding_mutation();
  end if;
end;
$$;

alter table workspace_core.schema_versions enable row level security;
alter table workspace_core.packets enable row level security;
alter table workspace_core.packet_lifecycle_events enable row level security;
alter table workspace_core.handoff_acks enable row level security;
alter table workspace_core.approval_grants enable row level security;

revoke all on workspace_core.schema_versions from anon, authenticated;
revoke all on workspace_core.packets from anon, authenticated;
revoke all on workspace_core.packet_lifecycle_events from anon, authenticated;
revoke all on workspace_core.handoff_acks from anon, authenticated;
revoke all on workspace_core.approval_grants from anon, authenticated;

grant usage on schema workspace_core to service_role;
grant select, insert, update on workspace_core.schema_versions to service_role;
grant select, insert, update on workspace_core.packets to service_role;
grant select, insert, update on workspace_core.packet_lifecycle_events to service_role;
grant select, insert, update on workspace_core.handoff_acks to service_role;
grant select, insert, update on workspace_core.approval_grants to service_role;

insert into workspace_core.schema_versions (id, version, notes)
values (
  'workspace-packet-contracts',
  '1.0.0',
  'Additive Packet, lifecycle, ACK and ApprovalGrant tables; no backfill.'
)
on conflict (id) do update
set version = excluded.version,
    applied_at = now(),
    notes = excluded.notes;

notify pgrst, 'reload schema';
