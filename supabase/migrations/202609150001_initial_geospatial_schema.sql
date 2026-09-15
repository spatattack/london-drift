create extension if not exists postgis with schema extensions;

create table if not exists public.street_segments (
  id bigint generated always as identity primary key,
  osm_way_id bigint not null,
  source_version text not null,
  geom extensions.geometry(LineString, 4326) not null,
  length_m double precision not null,
  tags jsonb not null default '{}'::jsonb,
  walkable boolean not null default true,
  unique (osm_way_id, source_version)
);
create index if not exists street_segments_geom_gix on public.street_segments using gist (geom);

create table if not exists public.drifts (
  id uuid primary key default gen_random_uuid(),
  share_code text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  mode text not null,
  requested_duration_minutes integer not null,
  actual_duration_seconds integer not null,
  distance_m integer not null,
  start_point extensions.geometry(Point, 4326) not null,
  end_point extensions.geometry(Point, 4326) not null,
  route_geom extensions.geometry(LineString, 4326) not null,
  score_breakdown jsonb not null,
  title text not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index if not exists drifts_route_geom_gix on public.drifts using gist (route_geom);

create table if not exists public.drift_segments (
  drift_id uuid not null references public.drifts(id) on delete cascade,
  segment_id bigint not null references public.street_segments(id) on delete restrict,
  sequence integer not null,
  traversed_length_m double precision not null,
  primary key (drift_id, sequence)
);

create table if not exists public.user_segment_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  segment_id bigint not null references public.street_segments(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  traversal_count integer not null default 1,
  primary key (user_id, segment_id)
);

create table if not exists public.drift_feedback (
  id bigint generated always as identity primary key,
  drift_id uuid not null references public.drifts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  rating text not null check (rating in ('loved', 'good', 'meh')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
