create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.player_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  best_score integer not null default 0 check (best_score between 0 and 500),
  best_score_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_profiles_display_name_length
    check (display_name is null or char_length(display_name) between 2 and 20)
);

create table if not exists public.score_submissions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  display_name_snapshot text not null,
  score integer not null check (score between 0 and 500),
  rounds jsonb not null check (jsonb_typeof(rounds) = 'array'),
  catalog_updated_at text,
  submitted_at timestamptz not null default now()
);

create index if not exists player_profiles_leaderboard_idx
  on public.player_profiles (best_score desc, best_score_at asc nulls last);

create index if not exists score_submissions_player_id_idx
  on public.score_submissions (player_id, submitted_at desc);

drop trigger if exists set_player_profiles_updated_at on public.player_profiles;
create trigger set_player_profiles_updated_at
before update on public.player_profiles
for each row
execute function public.set_updated_at();

alter table public.player_profiles enable row level security;
alter table public.score_submissions enable row level security;

revoke all on public.player_profiles from anon, authenticated;
revoke all on public.score_submissions from anon, authenticated;
grant select, insert, update on public.player_profiles to authenticated;

drop policy if exists "profiles_select_own" on public.player_profiles;
create policy "profiles_select_own"
on public.player_profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.player_profiles;
create policy "profiles_insert_own"
on public.player_profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.player_profiles;
create policy "profiles_update_own"
on public.player_profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace view public.public_leaderboard as
select
  player_profiles.id as player_id,
  player_profiles.display_name,
  player_profiles.best_score,
  player_profiles.best_score_at
from public.player_profiles
where player_profiles.display_name is not null
  and player_profiles.best_score > 0
  and player_profiles.best_score_at is not null;

revoke all on public.public_leaderboard from anon, authenticated;
grant select on public.public_leaderboard to authenticated;
