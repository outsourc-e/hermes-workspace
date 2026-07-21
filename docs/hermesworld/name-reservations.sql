create extension if not exists pgcrypto;

create table if not exists public.name_reservations (
  id uuid primary key default gen_random_uuid(),
  desired_name text not null,
  normalized_name text not null unique,
  email text not null,
  wallet_address text,
  confirmation_token text not null unique,
  confirmed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_name_reservations_created_at
  on public.name_reservations (created_at desc);

alter table public.name_reservations enable row level security;

create policy if not exists "service role manages reservations"
  on public.name_reservations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
