# London Drift

London Drift answers one question: **where should I wander today?** It generates point-to-point London walks optimized for discovery, urban texture and a chosen mood rather than the shortest path.

This repository currently contains the product-quality interactive MVP shell and the first deterministic scoring model. The interface includes all 11 proposed Drift modes, duration selection, route regeneration, sparse route moments, sharing, saving and a handoff to walking directions. The illustrated route data in the current UI is a prototype; it is deliberately labelled here so it cannot be mistaken for production-safe routing.

## Recommended stack

- Next.js and TypeScript for the application.
- MapLibre GL JS for client-side map rendering.
- An OSM-derived commercial tile service for production tiles. Do not depend on the community `tile.openstreetmap.org` service at scale; its [tile policy](https://operations.osmfoundation.org/policies/tiles/) is best-effort and prohibits bulk/offline use.
- OpenRouteService for the first managed walking-routing integration, behind a server endpoint. Its current [API restrictions](https://openrouteservice.org/restrictions/) allow up to 50 waypoints and three alternatives, which fits candidate route evaluation.
- Supabase Postgres with PostGIS for drifts, route geometry, street-segment history and later novelty scores. Supabase documents a [$0 free tier and a $25/month Pro tier](https://supabase.com/pricing); production should move to Pro before reliability matters because free projects can pause.
- GitHub as the canonical source, with a managed deployment connected to the repository.

## Run locally

1. Use Node 22.13 or newer.
2. Copy `.env.example` to `.env.local` and fill only the services being exercised.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the printed local URL.

The current prototype needs no API credentials because it uses representative route fixtures. Before calling the app production-ready, replace those fixtures with the server-side candidate-generation pipeline described in `ROUTING.md`.

## Deployment and recovery

1. Create a private GitHub repository and push this entire tree.
2. Import the repository into the managed host.
3. Create a Supabase project, enable PostGIS, and apply `supabase/migrations` in order.
4. Add the variables in `.env.example` to the host; keep service-role and routing keys server-side.
5. Deploy from the default branch and enable preview builds for pull requests.

A new machine only needs the Git repository, documented cloud credentials and a compatible Node runtime. No production state belongs on a developer laptop.

## Cost envelope

The MVP can start close to $0/month while it is private and lightly used: free map/routing allowances plus Supabase Free. A realistic small public launch should budget roughly $25–$75/month for non-pausing database service and map/routing headroom. The primary cost drivers are map sessions, geocoding/routing requests and database egress—not route-description text. Limits change, so recheck provider pricing before launch.

## Validation

- `npm run build` performs the production compile.
- The route scoring primitives live in `lib/drift-engine.ts`.
- Database history is reproducible from `supabase/migrations`.
- Route modes and their intended behaviour are documented in `ROUTING.md`.
