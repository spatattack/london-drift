# Architecture

## System

```text
Browser / MapLibre
        |
        v
Next.js route API on managed hosting
  |        |          |
  |        |          +--> geocoding + pedestrian routing provider
  |        +-------------> PostGIS feature and history queries
  +----------------------> privacy-conscious product analytics
```

GitHub is the canonical source for application code, migrations, fixtures, scripts and documentation. The managed host deploys the default branch and previews pull requests. Supabase owns all durable application data. Large derived geographic artifacts belong in managed object storage; only provenance and processing scripts belong in Git.

## Data flow

The browser sends origin, duration and mode. The server geocodes, queries nearby features, creates candidate waypoint sets, requests walkable geometry, map-matches the candidates, scores them and persists the winner. The client receives GeoJSON plus route metadata. Provider keys never reach the browser.

## Geospatial model

- `street_segments`: versioned OSM-derived canonical walkable edges with geometry and tags.
- `drifts`: route LineString, endpoints, duration, distance and score breakdown.
- `drift_segments`: ordered map-matched membership for novelty calculations.
- `user_segment_history`: first/last traversal and count per user/segment.
- `drift_feedback`: quick rating and optional tags.

Neighbourhood and borough polygons should be added from documented, authoritative London sources when exploration summaries ship. Use PostGIS GiST indexes for point, line and polygon queries.

## Deployment and secrets

The deployment is a Git push. Runtime secrets live in the managed host; database secrets live in Supabase. `.env.example` is the complete variable inventory. Never commit keys. Apply schema changes only through migrations.

## Backups and recovery

Use managed database backups on the production plan. Keep geographic import scripts deterministic and record source URLs, timestamps and licences. A fresh environment must be able to clone Git, set environment variables, install dependencies, apply migrations and run without access to the original laptop.

## Risks

- Route quality depends on uneven OSM tagging and needs manual evaluation.
- Public Overpass and OSM tile services are not production backends.
- Provider quotas and prices can change; the adapter boundary prevents lock-in.
- Night routing cannot guarantee safety. It can only avoid known unsuitable paths and communicate uncertainty.
