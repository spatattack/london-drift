-- London Drift: initial PostGIS schema.
-- Safe to run in a new Supabase project through Database > Migrations or the SQL editor.

create extension if not exists postgis with schema extensions;

create table if not exists public.street_segments (
  id bigint generated always as identity primary key,
  osm_way_id bigint not null,
  source_version text not null,
  geom extensions.geometry(LineString, 4326) not null,
  length_m double precision not null check (length_m > 0),
  tags jsonb not null default '{}'::jsonb,
  walkable boolean not null default true,
  unique (osm_way_id, source_version)
);
create index if not exists street_segments_geom_gix on public.street_segments using gist (geom);

create table if not exists public.drifts (
  id uuid primary key default gen_random_uuid(),
  share_code text not null unique check (char_length(share_code) between 8 and 32),
  user_id uuid references auth.users(id) on delete set null,
  mode text not null check (mode in ('surprise','quiet','architecture','water','old','industrial','green','weird','photography','pubs','night')),
  requested_duration_minutes integer not null check (requested_duration_minutes in (30, 60, 90, 120)),
  actual_duration_seconds integer not null check (actual_duration_seconds > 0),
  distance_m integer not null check (distance_m > 0),
  start_name text not null,
  start_point extensions.geometry(Point, 4326) not null,
  end_name text not null,
  end_point extensions.geometry(Point, 4326) not null,
  route_geom extensions.geometry(LineString, 4326) not null,
  score_breakdown jsonb not null default '{}'::jsonb,
  title text not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index if not exists drifts_user_created_idx on public.drifts (user_id, created_at desc);
create index if not exists drifts_route_geom_gix on public.drifts using gist (route_geom);

create table if not exists public.drift_segments (
  drift_id uuid not null references public.drifts(id) on delete cascade,
  segment_id bigint not null references public.street_segments(id) on delete restrict,
  sequence integer not null check (sequence >= 0),
  traversed_length_m double precision not null check (traversed_length_m > 0),
  primary key (drift_id, sequence)
);
create index if not exists drift_segments_segment_idx on public.drift_segments (segment_id);

create table if not exists public.user_segment_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  segment_id bigint not null references public.street_segments(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  traversal_count integer not null default 1 check (traversal_count > 0),
  primary key (user_id, segment_id),
  check (last_seen_at >= first_seen_at)
);

create table if not exists public.drift_feedback (
  id bigint generated always as identity primary key,
  drift_id uuid not null references public.drifts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating text not null check (rating in ('loved', 'good', 'meh')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (drift_id, user_id)
);

alter table public.street_segments enable row level security;
alter table public.drifts enable row level security;
alter table public.drift_segments enable row level security;
alter table public.user_segment_history enable row level security;
alter table public.drift_feedback enable row level security;

-- Street data is readable to signed-in users. Only server-side ingestion can mutate it.
create policy "authenticated users can read street segments"
on public.street_segments for select to authenticated using (true);

create policy "users can read their own drifts"
on public.drifts for select to authenticated using ((select auth.uid()) = user_id);
create policy "users can create their own drifts"
on public.drifts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users can update their own drifts"
on public.drifts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users can delete their own drifts"
on public.drifts for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users can read segments from their own drifts"
on public.drift_segments for select to authenticated using (
  exists (select 1 from public.drifts where drifts.id = drift_segments.drift_id and drifts.user_id = (select auth.uid()))
);

create policy "users can read their own route history"
on public.user_segment_history for select to authenticated using ((select auth.uid()) = user_id);
create policy "users can add their own route history"
on public.user_segment_history for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users can update their own route history"
on public.user_segment_history for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "users can read their own feedback"
on public.drift_feedback for select to authenticated using ((select auth.uid()) = user_id);
create policy "users can add their own feedback"
on public.drift_feedback for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users can update their own feedback"
on public.drift_feedback for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Guests and shared-route reads go through the app's server route. The service role
-- bypasses RLS, so no anonymous table policy is needed and raw route data stays private.
revoke all on table public.street_segments, public.drifts, public.drift_segments,
  public.user_segment_history, public.drift_feedback from anon;
grant select on table public.street_segments to authenticated;
grant select, insert, update, delete on table public.drifts to authenticated;
grant select on table public.drift_segments to authenticated;
grant select, insert, update on table public.user_segment_history to authenticated;
grant select, insert, update on table public.drift_feedback to authenticated;
