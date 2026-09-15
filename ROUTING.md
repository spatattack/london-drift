# Routing

## Recommendation

Use MapLibre for rendering, a paid OSM-derived tile plan for map delivery, OpenRouteService for V1 pedestrian route geometry, and PostGIS for feature lookup and history. Do not put an LLM in the route-selection loop.

OpenRouteService is a practical first router because it returns route geometry, supports foot profiles, waypoint-rich routes and alternatives. Treat it as replaceable behind a `RoutingProvider` interface; GraphHopper or a self-hosted Valhalla/ORS deployment can take over if request volume, customization or reliability demands it. Public Overpass is suitable for research and small cached enrichment jobs, not as the live backend of a consumer app: the official documentation explicitly warns against relying on public instances as an app backend and gives a broad safety margin of about [10,000 requests and 1 GB/day](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).

## V1 pipeline

1. Geocode and validate the origin inside Greater London.
2. Estimate a search radius from duration using 79 m/min and a 0.68 exploration factor.
3. Query cached PostGIS features within that radius: walkable street segments, green space, water, rail edges, land use, architectural/historic features and sparse endpoint candidates.
4. Score feature clusters with the selected mode configuration.
5. Choose 8–16 directional anchors spread across bearings, then create 20–40 waypoint sets of 2–5 points. Include point-to-point and occasional loop candidates.
6. Ask the routing provider for pedestrian geometry through each set.
7. Map-match each returned route to canonical street-segment IDs.
8. Calculate the signals in `lib/drift-engine.ts`, reject hard failures, rank the remainder and return the best candidate with a short explanation.

## Candidate score

Positive signals: street interest, novelty, vibe match, environmental variety, pedestrian quality and endpoint quality.

Penalties: backtracking, duration error, major-road exposure, repeated environments and unnecessary geometric complexity.

All signals are normalized to 0–1 before weighting. Hard rejection happens before weighted scoring for routes with poor pedestrian quality, more than 25% duration error, excessive backtracking, private/inaccessible segments, motorway-like roads, or known time restrictions that conflict with the request.

`modeWeights` is the extension point. Adding a mode means adding its tag-to-feature mapping, one weight row, copy labels and evaluation fixtures; it does not require a new routing algorithm.

## Street interest features

- `highway`, `foot`, `sidewalk`, `access`, `lit`, `surface` and road hierarchy.
- Waterways, towpaths, bridges and docks.
- Parks, commons, gardens, squares and pedestrian areas.
- Historic designations, conservation areas and characteristic building/land-use tags.
- Railways, arches, warehouses, industrial land and adaptive reuse.
- Sparse nearby POIs, capped so they influence rather than dictate the route.
- Transitions between feature classes and neighbourhoods.

## Novelty

Store the London walkable network as stable, versioned street segments. Each completed drift records ordered segment IDs and partial lengths. Novelty is defensible when calculated as route distance on unseen segments divided by total route distance. The London-wide percentage is unique traversed walkable segment length divided by the length of the versioned Greater London walkable network; display the source version and calculation date.

## Safety

Route only on segments allowed by the walking profile. Penalize trunk/primary roads, missing foot infrastructure, complex crossings and isolated unlit paths. At night, exclude paths with closing hours that cannot be satisfied and strongly favor `lit=yes`, active frontage and well-used streets. Always present routes as suggestions and tell walkers to follow local signs.

## Known limitations of this prototype

- The map and routes in the UI are representative fixtures, not live navigation data.
- Route markers are illustrative and are not safe to follow on the street.
- No provider keys, live geocoder, candidate generator or map-matching job is connected yet.
- A 30-route manual evaluation set across the requested London origins must be completed after live geometry is connected.
