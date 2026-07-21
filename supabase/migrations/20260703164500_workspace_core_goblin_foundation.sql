-- Workspace Core + Goblin Analytics foundation
-- Project: hermes-workspace-core / gqghhwyeqazsrgbimmtb
-- Purpose: shared Workspace database foundation plus first Goblin Analytics module.
-- Safety: server-owned schemas; RLS enabled; no public/anon policies created here.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists workspace_core;
create schema if not exists goblin_analytics;

create or replace function workspace_core.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists workspace_core.schema_versions (
  id text primary key,
  version text not null,
  applied_at timestamptz not null default now(),
  notes text
);

create table if not exists workspace_core.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  description text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_workspaces_updated_at on workspace_core.workspaces;
create trigger trg_workspaces_updated_at
before update on workspace_core.workspaces
for each row execute function workspace_core.set_updated_at();

create table if not exists workspace_core.rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace_core.workspaces(id) on delete cascade,
  slug text not null,
  display_name text not null,
  module_key text not null,
  status text not null default 'active',
  read_model_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index if not exists idx_workspace_rooms_module_key on workspace_core.rooms(module_key);

drop trigger if exists trg_rooms_updated_at on workspace_core.rooms;
create trigger trg_rooms_updated_at
before update on workspace_core.rooms
for each row execute function workspace_core.set_updated_at();

create table if not exists workspace_core.evidence_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspace_core.workspaces(id) on delete set null,
  room_id uuid references workspace_core.rooms(id) on delete set null,
  entity_schema text,
  entity_table text,
  entity_id uuid,
  asset_type text not null,
  storage_provider text not null default 'supabase_storage',
  bucket text,
  path_or_url text not null,
  sha256 text,
  mime_type text,
  bytes bigint,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_evidence_assets_entity on workspace_core.evidence_assets(entity_schema, entity_table, entity_id);
create index if not exists idx_evidence_assets_room_created on workspace_core.evidence_assets(room_id, created_at desc);

create table if not exists workspace_core.action_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspace_core.workspaces(id) on delete set null,
  room_id uuid references workspace_core.rooms(id) on delete set null,
  run_type text not null,
  source text not null default 'workspace',
  status text not null default 'queued',
  requested_by text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_action_runs_room_status on workspace_core.action_runs(room_id, status, created_at desc);

drop trigger if exists trg_action_runs_updated_at on workspace_core.action_runs;
create trigger trg_action_runs_updated_at
before update on workspace_core.action_runs
for each row execute function workspace_core.set_updated_at();

create table if not exists workspace_core.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspace_core.workspaces(id) on delete set null,
  room_id uuid references workspace_core.rooms(id) on delete set null,
  entity_schema text,
  entity_table text,
  entity_id uuid,
  approval_type text not null,
  status text not null default 'pending',
  title text not null,
  summary text,
  requested_by text,
  decided_by text,
  decision_reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_approvals_status_room on workspace_core.approvals(status, room_id, created_at desc);
create index if not exists idx_approvals_entity on workspace_core.approvals(entity_schema, entity_table, entity_id);

drop trigger if exists trg_approvals_updated_at on workspace_core.approvals;
create trigger trg_approvals_updated_at
before update on workspace_core.approvals
for each row execute function workspace_core.set_updated_at();

create table if not exists goblin_analytics.search_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspace_core.workspaces(id) on delete set null,
  room_id uuid references workspace_core.rooms(id) on delete set null,
  query text not null,
  marketplace text not null default 'etsy',
  mode text not null default 'etsy_first_triage',
  status text not null default 'draft',
  cards_scanned integer not null default 0,
  cards_opened integer not null default 0,
  clusters_found integer not null default 0,
  notes text,
  raw_context jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_goblin_search_runs_query on goblin_analytics.search_runs using gin (to_tsvector('simple', query));
create index if not exists idx_goblin_search_runs_status_created on goblin_analytics.search_runs(status, created_at desc);

drop trigger if exists trg_goblin_search_runs_updated_at on goblin_analytics.search_runs;
create trigger trg_goblin_search_runs_updated_at
before update on goblin_analytics.search_runs
for each row execute function workspace_core.set_updated_at();

create table if not exists goblin_analytics.product_clusters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspace_core.workspaces(id) on delete set null,
  room_id uuid references workspace_core.rooms(id) on delete set null,
  canonical_name text not null,
  product_family text,
  style_tags text[] not null default '{}'::text[],
  visual_fingerprint text,
  image_hash text,
  product_function text,
  material_claim text,
  variant_structure jsonb not null default '{}'::jsonb,
  canonical_image_url text,
  status text not null default 'new',
  price_gate_status text not null default 'unknown',
  min_price_usd numeric(10,2),
  max_price_usd numeric(10,2),
  avg_price_usd numeric(10,2),
  monthly_sales_estimate integer,
  source_status text not null default 'unknown',
  goblin_signal_status text not null default 'none',
  saturation_risk text not null default 'unknown',
  copyability_score integer,
  margin_status text not null default 'unknown',
  decision_notes text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_goblin_clusters_status on goblin_analytics.product_clusters(status, last_seen_at desc);
create index if not exists idx_goblin_clusters_price_gate on goblin_analytics.product_clusters(price_gate_status, last_seen_at desc);
create index if not exists idx_goblin_clusters_visual_fingerprint on goblin_analytics.product_clusters(visual_fingerprint);
create index if not exists idx_goblin_clusters_image_hash on goblin_analytics.product_clusters(image_hash);
create index if not exists idx_goblin_clusters_family on goblin_analytics.product_clusters(product_family);

drop trigger if exists trg_goblin_product_clusters_updated_at on goblin_analytics.product_clusters;
create trigger trg_goblin_product_clusters_updated_at
before update on goblin_analytics.product_clusters
for each row execute function workspace_core.set_updated_at();

create table if not exists goblin_analytics.shops (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspace_core.workspaces(id) on delete set null,
  shop_name text not null,
  shop_url text,
  etsy_shop_id text,
  country text,
  active_listing_count integer,
  sales_count integer,
  review_count integer,
  shop_age_days integer,
  goblin_level text not null default 'none',
  confirmed_dropship_product_count integer not null default 0,
  candidate_dropship_product_count integer not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (etsy_shop_id)
);

create index if not exists idx_goblin_shops_level on goblin_analytics.shops(goblin_level, last_seen_at desc);
create index if not exists idx_goblin_shops_name on goblin_analytics.shops using gin (to_tsvector('simple', shop_name));

drop trigger if exists trg_goblin_shops_updated_at on goblin_analytics.shops;
create trigger trg_goblin_shops_updated_at
before update on goblin_analytics.shops
for each row execute function workspace_core.set_updated_at();

create table if not exists goblin_analytics.search_result_cards (
  id uuid primary key default gen_random_uuid(),
  search_run_id uuid not null references goblin_analytics.search_runs(id) on delete cascade,
  cluster_id uuid references goblin_analytics.product_clusters(id) on delete set null,
  listing_url text,
  listing_id text,
  shop_url text,
  shop_id text,
  title text,
  visible_price_usd numeric(10,2),
  currency text default 'USD',
  image_url text,
  position integer,
  page_number integer,
  badges text[] not null default '{}'::text[],
  quick_status text not null default 'seen',
  price_gate_status text not null default 'unknown',
  triage_status text not null default 'unreviewed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (search_run_id, listing_url)
);

create index if not exists idx_goblin_cards_listing_id on goblin_analytics.search_result_cards(listing_id);
create index if not exists idx_goblin_cards_shop_id on goblin_analytics.search_result_cards(shop_id);
create index if not exists idx_goblin_cards_cluster on goblin_analytics.search_result_cards(cluster_id);
create index if not exists idx_goblin_cards_price_gate on goblin_analytics.search_result_cards(price_gate_status, triage_status);

create table if not exists goblin_analytics.cluster_listings (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references goblin_analytics.product_clusters(id) on delete cascade,
  shop_record_id uuid references goblin_analytics.shops(id) on delete set null,
  listing_id text,
  listing_url text not null,
  shop_id text,
  title text,
  price_usd numeric(10,2),
  image_url text,
  match_status text not null default 'uncertain',
  match_reason text,
  alura_views integer,
  alura_favorites integer,
  alura_sales_estimate integer,
  review_count integer,
  is_best_seller boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cluster_id, listing_url)
);

create index if not exists idx_goblin_cluster_listings_listing_id on goblin_analytics.cluster_listings(listing_id);
create index if not exists idx_goblin_cluster_listings_shop on goblin_analytics.cluster_listings(shop_record_id, last_seen_at desc);
create index if not exists idx_goblin_cluster_listings_match on goblin_analytics.cluster_listings(match_status);

drop trigger if exists trg_goblin_cluster_listings_updated_at on goblin_analytics.cluster_listings;
create trigger trg_goblin_cluster_listings_updated_at
before update on goblin_analytics.cluster_listings
for each row execute function workspace_core.set_updated_at();

create table if not exists goblin_analytics.shop_snapshots (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references goblin_analytics.shops(id) on delete cascade,
  captured_at timestamptz not null default now(),
  sales_count integer,
  review_count integer,
  active_listing_count integer,
  new_listing_count integer,
  removed_listing_count integer,
  price_changes_count integer,
  velocity_score numeric(8,2),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  unique (shop_id, captured_at)
);

create index if not exists idx_goblin_shop_snapshots_shop_time on goblin_analytics.shop_snapshots(shop_id, captured_at desc);

create table if not exists goblin_analytics.supplier_matches (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references goblin_analytics.product_clusters(id) on delete cascade,
  listing_id uuid references goblin_analytics.cluster_listings(id) on delete set null,
  source_platform text not null,
  source_url text not null,
  source_item_id text,
  match_status text not null default 'uncertain',
  coverage_status text not null default 'unknown',
  supplier_price_estimate_usd numeric(10,2),
  moq integer,
  shipping_estimate text,
  rating numeric(4,2),
  orders integer,
  variant_coverage jsonb not null default '{}'::jsonb,
  image_match_notes text,
  qa_status text not null default 'needs_review',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cluster_id, source_url)
);

create index if not exists idx_goblin_supplier_matches_source_item on goblin_analytics.supplier_matches(source_item_id);
create index if not exists idx_goblin_supplier_matches_status on goblin_analytics.supplier_matches(match_status, qa_status);

drop trigger if exists trg_goblin_supplier_matches_updated_at on goblin_analytics.supplier_matches;
create trigger trg_goblin_supplier_matches_updated_at
before update on goblin_analytics.supplier_matches
for each row execute function workspace_core.set_updated_at();

create table if not exists goblin_analytics.price_margin_snapshots (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references goblin_analytics.product_clusters(id) on delete cascade,
  captured_at timestamptz not null default now(),
  competitor_price_usd numeric(10,2),
  supplier_estimate_usd numeric(10,2),
  shipping_estimate_usd numeric(10,2),
  etsy_fee_estimate_usd numeric(10,2),
  target_price_usd numeric(10,2),
  margin_estimate_usd numeric(10,2),
  margin_percent_estimate numeric(6,2),
  price_gate_status text not null default 'unknown',
  margin_gate_status text not null default 'unknown',
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_goblin_price_margin_cluster_time on goblin_analytics.price_margin_snapshots(cluster_id, captured_at desc);
create index if not exists idx_goblin_price_margin_gates on goblin_analytics.price_margin_snapshots(price_gate_status, margin_gate_status);

create table if not exists goblin_analytics.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspace_core.workspaces(id) on delete set null,
  room_id uuid references workspace_core.rooms(id) on delete set null,
  entity_schema text,
  entity_table text,
  entity_id uuid,
  event_type text not null,
  severity text not null default 'info',
  message text not null,
  source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_goblin_events_room_time on goblin_analytics.events(room_id, created_at desc);
create index if not exists idx_goblin_events_entity on goblin_analytics.events(entity_schema, entity_table, entity_id);
create index if not exists idx_goblin_events_type on goblin_analytics.events(event_type, severity, created_at desc);

create table if not exists goblin_analytics.caveats (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid references goblin_analytics.product_clusters(id) on delete cascade,
  shop_id uuid references goblin_analytics.shops(id) on delete cascade,
  type text not null,
  severity text not null default 'medium',
  is_kill_switch boolean not null default false,
  message text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_goblin_caveats_cluster on goblin_analytics.caveats(cluster_id, resolved_at, created_at desc);
create index if not exists idx_goblin_caveats_shop on goblin_analytics.caveats(shop_id, resolved_at, created_at desc);

create table if not exists goblin_analytics.hard_blocks (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid references goblin_analytics.product_clusters(id) on delete cascade,
  shop_id uuid references goblin_analytics.shops(id) on delete cascade,
  type text not null,
  message text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_goblin_hard_blocks_cluster on goblin_analytics.hard_blocks(cluster_id, resolved_at, created_at desc);
create index if not exists idx_goblin_hard_blocks_shop on goblin_analytics.hard_blocks(shop_id, resolved_at, created_at desc);

create table if not exists goblin_analytics.workspace_handoffs (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid references goblin_analytics.product_clusters(id) on delete cascade,
  from_room_id uuid references workspace_core.rooms(id) on delete set null,
  to_room_slug text not null,
  handoff_type text not null,
  status text not null default 'staged',
  approval_required boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_goblin_workspace_handoffs_status on goblin_analytics.workspace_handoffs(status, created_at desc);
create index if not exists idx_goblin_workspace_handoffs_cluster on goblin_analytics.workspace_handoffs(cluster_id, created_at desc);

drop trigger if exists trg_goblin_workspace_handoffs_updated_at on goblin_analytics.workspace_handoffs;
create trigger trg_goblin_workspace_handoffs_updated_at
before update on goblin_analytics.workspace_handoffs
for each row execute function workspace_core.set_updated_at();

-- Private evidence bucket for screenshots/contact sheets/zips.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'goblin-evidence',
  'goblin-evidence',
  false,
  52428800,
  array['image/png', 'image/jpeg', 'image/webp', 'application/json', 'application/zip', 'text/plain', 'text/markdown']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- RLS on, with no anon/auth policies at this foundation stage.
alter table workspace_core.schema_versions enable row level security;
alter table workspace_core.workspaces enable row level security;
alter table workspace_core.rooms enable row level security;
alter table workspace_core.evidence_assets enable row level security;
alter table workspace_core.action_runs enable row level security;
alter table workspace_core.approvals enable row level security;
alter table goblin_analytics.search_runs enable row level security;
alter table goblin_analytics.search_result_cards enable row level security;
alter table goblin_analytics.product_clusters enable row level security;
alter table goblin_analytics.cluster_listings enable row level security;
alter table goblin_analytics.shops enable row level security;
alter table goblin_analytics.shop_snapshots enable row level security;
alter table goblin_analytics.supplier_matches enable row level security;
alter table goblin_analytics.price_margin_snapshots enable row level security;
alter table goblin_analytics.events enable row level security;
alter table goblin_analytics.caveats enable row level security;
alter table goblin_analytics.hard_blocks enable row level security;
alter table goblin_analytics.workspace_handoffs enable row level security;

-- Initial truthful workspace/room records only. No fake products or fake shops.
insert into workspace_core.workspaces (slug, display_name, description, status, metadata)
values (
  'hermes-workspace',
  'Hermes Workspace',
  'Shared durable database foundation for Hermes Workspace rooms, evidence, approvals, and agents.',
  'active',
  '{"owner":"DLV","foundation":"workspace_core_v1"}'::jsonb
)
on conflict (slug) do update
set display_name = excluded.display_name,
    description = excluded.description,
    metadata = workspace_core.workspaces.metadata || excluded.metadata,
    updated_at = now();

insert into workspace_core.rooms (workspace_id, slug, display_name, module_key, status, read_model_version, metadata)
select w.id,
       'goblin-analytics',
       'Goblin Analytics',
       'goblin_analytics',
       'active',
       'goblin-analytics-v1',
       '{"purpose":"Etsy-first product/shop intelligence","sideEffects":"read-only until approval"}'::jsonb
from workspace_core.workspaces w
where w.slug = 'hermes-workspace'
on conflict (workspace_id, slug) do update
set display_name = excluded.display_name,
    module_key = excluded.module_key,
    status = excluded.status,
    read_model_version = excluded.read_model_version,
    metadata = workspace_core.rooms.metadata || excluded.metadata,
    updated_at = now();

insert into workspace_core.schema_versions (id, version, notes)
values (
  'workspace_core_goblin_foundation',
  '20260703164500',
  'Workspace core schemas, Goblin Analytics tables, private evidence bucket, RLS enabled, no public policies.'
)
on conflict (id) do update
set version = excluded.version,
    applied_at = now(),
    notes = excluded.notes;

-- Readback helper view for quick health checks from SQL editor/server adapters.
create or replace view workspace_core.workspace_foundation_health as
select
  (select count(*) from workspace_core.workspaces) as workspace_count,
  (select count(*) from workspace_core.rooms) as room_count,
  (select count(*) from goblin_analytics.product_clusters) as goblin_cluster_count,
  (select count(*) from goblin_analytics.shops) as goblin_shop_count,
  (select count(*) from goblin_analytics.search_runs) as goblin_search_run_count,
  (select exists(select 1 from storage.buckets where id = 'goblin-evidence')) as has_goblin_evidence_bucket,
  now() as checked_at;
