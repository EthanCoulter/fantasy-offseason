-- ============================================================
-- Fantasy Offseason — Supabase schema
-- Run this ONCE in Supabase Dashboard → SQL Editor → "New query"
-- ============================================================

-- Drop existing (safe to re-run)
drop table if exists public.rankings     cascade;
drop table if exists public.keepers      cascade;
drop table if exists public.slots_burned cascade;
drop table if exists public.team_assets  cascade;
drop table if exists public.trades       cascade;
drop table if exists public.mock_drafts  cascade;

-- Commissioner rankings (roster_id -> finish rank 1..12)
create table public.rankings (
  roster_id  int primary key,
  rank       int not null,
  updated_at timestamptz default now()
);

-- Per-roster keeper selections
create table public.keepers (
  roster_id  int primary key,
  player_ids text[] default '{}',
  updated_at timestamptz default now()
);

-- Keeper slots burned via trades
create table public.slots_burned (
  roster_id  int primary key,
  offense    int default 0,
  defense    int default 0,
  updated_at timestamptz default now()
);

-- In-app trades (picks ownership tracked here + from Sleeper)
create table public.trades (
  id                text primary key,
  from_roster_id    int not null,
  to_roster_id      int not null,
  from_assets       jsonb not null,
  to_assets         jsonb not null,
  status            text default 'pending',
  from_slot_impact  jsonb,
  to_slot_impact    jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Mock draft boards (PIN-protected per manager)
create table public.mock_drafts (
  roster_id  int primary key,
  pin_hash   text not null,
  picks      jsonb default '[]',
  updated_at timestamptz default now()
);

-- ============================================================
-- Realtime: let all clients receive live updates
-- ============================================================
alter publication supabase_realtime add table public.rankings;
alter publication supabase_realtime add table public.keepers;
alter publication supabase_realtime add table public.slots_burned;
alter publication supabase_realtime add table public.trades;
alter publication supabase_realtime add table public.mock_drafts;

-- ============================================================
-- Row-Level Security: league is small & trusted → allow anon
-- (Tighten later if you add real auth)
-- ============================================================
alter table public.rankings     enable row level security;
alter table public.keepers      enable row level security;
alter table public.slots_burned enable row level security;
alter table public.trades       enable row level security;
alter table public.mock_drafts  enable row level security;

create policy "league_all" on public.rankings     for all using (true) with check (true);
create policy "league_all" on public.keepers      for all using (true) with check (true);
create policy "league_all" on public.slots_burned for all using (true) with check (true);
create policy "league_all" on public.trades       for all using (true) with check (true);
create policy "league_all" on public.mock_drafts  for all using (true) with check (true);
