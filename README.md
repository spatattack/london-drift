# London Drift

London Drift creates exploratory point-to-point walks through London, tuned for time and mood instead of the shortest possible route.

## What works

- Search for a station, address or neighbourhood, or use browser location.
- Generate 30, 60, 90 or 120 minute routes with distance and stop counts that scale with the requested time.
- Choose from 11 modes that change route shape and route character.
- Render a live MapLibre/MapTiler street map when configured, with an illustrated preview fallback when it is not.
- Route on real walkable streets with OpenRouteService when configured, with a deterministic preview route for key-free development.
- Open the result in walking directions and share it with the platform share sheet.
- Prepare private PostGIS route storage in Supabase with row-level security enabled from the first migration.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app works without keys in preview mode. Add these for live data:

```text
NEXT_PUBLIC_MAPTILER_KEY=...
OPENROUTESERVICE_API_KEY=...
```

Never prefix the OpenRouteService key with `NEXT_PUBLIC_`; it is called only from the server route.

## Supabase

Apply `supabase/migrations/202609150001_initial_geospatial_schema.sql` to the connected project. The tables are protected by row-level security. Anonymous clients receive no direct table access; guest/shared routes should go through server endpoints using the Supabase secret key supplied by the Vercel integration.

The app accepts current integration variables `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. No database key is required to generate routes.

## Vercel

Import this repository as a standard Next.js project. Use Node.js 22 and the default build command (`npm run build`). Add map and routing variables to Production, Preview and Development, then redeploy.

## Cost posture

The private, non-commercial alpha is designed to fit free tiers. Each live Drift evaluates up to three OpenRouteService candidates, so the routing allowance—not database storage—is likely to be the first limit reached. Recheck provider limits before making the app public at scale.

## Validation

```bash
npm run lint
npm run build
```
