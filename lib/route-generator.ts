import { walkingRadiusMetres, type DriftMode } from "@/lib/drift-engine";
import {
  haversineMetres,
  isInLondon,
  lineDistance,
  modeDetails,
  type Coordinate,
  type DriftRoute,
  type DriftStop,
  type PlaceSuggestion,
} from "@/lib/london";

const ORS_URL = "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson";
const WALKING_METRES_PER_MINUTE = 78;

type OrsBody = {
  features?: Array<{
    geometry?: { coordinates?: Coordinate[] };
    properties?: { summary?: { distance: number; duration: number } };
  }>;
};

type ReverseGeocodeBody = {
  features?: Array<{ text?: string; place_name?: string }>;
};

type MapTilerSearchBody = {
  features?: Array<{
    id?: string;
    text?: string;
    place_name?: string;
    center?: Coordinate;
    geometry?: { coordinates?: Coordinate };
    properties?: { category?: string };
  }>;
};

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type OverpassBody = { elements?: OverpassElement[] };

type NearbyPlace = { name: string; tags: Record<string, string>; coordinates: Coordinate; fitScore: number };
type CandidatePlan = { points: Coordinate[]; places: Array<NearbyPlace | null> };
type NominatimReverseBody = { name?: string; display_name?: string; address?: { road?: string; neighbourhood?: string; suburb?: string } };

const modePlaceSignals: Record<DriftMode, { keys: string[]; keywords: string[]; label: string }> = {
  surprise: { keys: ["amenity", "tourism", "historic", "leisure", "shop"], keywords: ["market", "gallery", "yard"], label: "curiosity" },
  quiet: { keys: ["leisure", "natural", "landuse"], keywords: ["garden", "park", "green", "cemetery"], label: "quiet wandering" },
  architecture: { keys: ["building", "building:architecture", "historic", "heritage", "man_made"], keywords: ["hall", "warehouse", "station", "church", "court"], label: "architecture" },
  water: { keys: ["waterway", "natural", "leisure"], keywords: ["canal", "lock", "river", "pond", "reservoir", "marina"], label: "water" },
  old: { keys: ["historic", "heritage", "building", "place_of_worship"], keywords: ["old", "church", "chapel", "hall", "market", "court"], label: "old London" },
  industrial: { keys: ["industrial", "man_made", "craft", "railway"], keywords: ["works", "yard", "arches", "depot", "factory", "rail"], label: "post-industrial texture" },
  green: { keys: ["leisure", "natural", "landuse"], keywords: ["park", "garden", "common", "wood", "meadow", "green"], label: "green space" },
  weird: { keys: ["artwork_type", "man_made", "historic", "railway", "amenity"], keywords: ["mural", "sculpture", "public art", "tunnel", "arches", "station", "market"], label: "weirdness" },
  photography: { keys: ["tourism", "artwork_type", "man_made", "building", "natural"], keywords: ["viewpoint", "mural", "gallery", "bridge", "tower", "station"], label: "photography" },
  pubs: { keys: ["amenity", "shop", "tourism"], keywords: ["pub", "tavern", "inn", "brewery", "bar", "market"], label: "a useful wander" },
  night: { keys: ["amenity", "shop", "public_transport", "railway"], keywords: ["station", "market", "cinema", "theatre", "bar"], label: "night-time usefulness" },
};

const modePlaceSearches: Record<DriftMode, string[]> = {
  surprise: ["art gallery", "market", "museum"],
  quiet: ["garden", "cemetery", "nature reserve"],
  architecture: ["listed building", "architecture", "church"],
  water: ["canal lock", "marina", "river"],
  old: ["historic site", "church", "market"],
  industrial: ["railway arches", "brewery", "depot"],
  green: ["park", "garden", "nature reserve"],
  weird: ["mural", "sculpture", "public art"],
  photography: ["viewpoint", "bridge", "art gallery"],
  pubs: ["pub", "brewery", "market"],
  night: ["cinema", "theatre", "bar"],
};

const stopNotes = [
  "Take the less obvious side street here.",
  "A useful pause for texture and a change of scale.",
  "Look back before continuing; the view works in reverse.",
  "The route changes character at this point.",
  "A small landmark rather than a headline sight.",
  "A good place to decide whether to linger.",
];

const modeStopNotes: Record<DriftMode, string[]> = {
  surprise: ["Take the less obvious approach and notice what changes.", "A useful interruption in the rhythm of the walk.", "Look back before moving on; the view works differently in reverse."],
  quiet: ["Let the quieter street set the pace here.", "Pause where the city noise falls away.", "Use the softer edge of this place before continuing."],
  architecture: ["Look up: the useful detail is above eye level.", "Compare the old fabric with the intervention beside it.", "Walk around the edge before deciding on the best view."],
  water: ["Follow the waterline rather than the quickest pavement.", "Pause for the change in light and reflection.", "Notice how the route reconnects water and street."],
  old: ["Read the older street line before moving on.", "Look for the surviving detail rather than the headline sight.", "This is a good point to notice what the modern city grew around."],
  industrial: ["Follow the working edge rather than the polished frontage.", "Notice the seams: arches, yards, servicing and rail.", "The route changes texture around this piece of infrastructure."],
  green: ["Take the green edge instead of cutting straight through.", "Slow down where the canopy or open ground changes.", "Use this patch of breathing room before returning to the street."],
  weird: ["Do not resolve the oddness too quickly.", "Walk around it once; the explanation may get less obvious.", "A small London glitch worth keeping in the route."],
  photography: ["Check the light from both directions before continuing.", "Use the lines and layers here rather than searching for a postcard view.", "Step back: the wider frame is stronger than the detail."],
  pubs: ["A useful door to remember, whether or not you stop now.", "Let the street decide whether this is a pause or a waypoint.", "Good territory for an unhurried detour."],
  night: ["Stay with the active, well-connected edge here.", "Use the lit frontage as the next anchor.", "A practical point to reassess the route after dark."],
};

function hash(input: string) {
  let value = 2166136261;
  for (const character of input) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function offset(origin: Coordinate, eastMetres: number, northMetres: number): Coordinate {
  const lat = origin[1] + northMetres / 111_320;
  const lng = origin[0] + eastMetres / (111_320 * Math.cos((origin[1] * Math.PI) / 180));
  return [lng, lat];
}

function candidateWaypoints(origin: Coordinate, duration: number, mode: DriftMode, variant: number, runSeed: number) {
  const seed = hash(`${origin.join(",")}-${duration}-${mode}-${variant}-${runSeed}`);
  const bearing = ((seed % 360) * Math.PI) / 180;
  const radius = walkingRadiusMetres(duration) * (0.68 + variant * 0.04);
  const bend = modeDetails[mode].turn;
  const count = duration <= 30 ? 2 : duration <= 60 ? 3 : duration <= 90 ? 4 : 5;
  const points: Coordinate[] = [origin];

  for (let index = 1; index <= count; index += 1) {
    const progress = index / count;
    const wave = Math.sin(progress * Math.PI) * radius * bend * (variant % 2 === 0 ? 1 : -1);
    const forward = progress * radius * (1.15 + duration / 420);
    const east = Math.cos(bearing) * forward + Math.cos(bearing + Math.PI / 2) * wave;
    const north = Math.sin(bearing) * forward + Math.sin(bearing + Math.PI / 2) * wave;
    const point = offset(origin, east, north);
    points.push(isInLondon(point) ? point : offset(origin, -east * 0.65, -north * 0.65));
  }

  return points;
}

async function requestOrs(points: Coordinate[], apiKey: string): Promise<{ coordinates: Coordinate[]; distance: number; duration: number } | null> {
  const response = await fetch(ORS_URL, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: points, instructions: false, preference: "recommended" }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) return null;
  const body = await response.json() as OrsBody;
  const feature = body.features?.[0];
  if (!feature?.geometry?.coordinates || !feature?.properties?.summary) return null;
  return {
    coordinates: feature.geometry.coordinates,
    distance: feature.properties.summary.distance,
    duration: feature.properties.summary.duration,
  };
}

function previewLine(points: Coordinate[], desiredDistance: number) {
  const coordinates: Coordinate[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    for (let step = 0; step < 8; step += 1) {
      const progress = step / 8;
      coordinates.push([
        from[0] + (to[0] - from[0]) * progress,
        from[1] + (to[1] - from[1]) * progress,
      ]);
    }
  }
  coordinates.push(points.at(-1)!);

  const current = lineDistance(coordinates);
  if (current === 0) return coordinates;
  const scale = desiredDistance / current;
  return coordinates.map(([lng, lat]) => [
    points[0][0] + (lng - points[0][0]) * scale,
    points[0][1] + (lat - points[0][1]) * scale,
  ] as Coordinate);
}

async function reverseName(point: Coordinate, fallback: string) {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (key) {
    try {
      const response = await fetch(`https://api.maptiler.com/geocoding/${point[0]},${point[1]}.json?key=${encodeURIComponent(key)}&limit=1&language=en`, {
        signal: AbortSignal.timeout(4_000),
        next: { revalidate: 86_400 },
      });
      if (response.ok) {
        const body = await response.json() as ReverseGeocodeBody;
        const name = body.features?.[0]?.text || body.features?.[0]?.place_name?.split(",")[0];
        if (name) return name;
      }
    } catch {
      // Use the open fallback below when MapTiler is unavailable.
    }
  }

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point[1]}&lon=${point[0]}&zoom=18`, {
      headers: { "User-Agent": "LondonDrift/0.1 (non-commercial alpha)", "Accept-Language": "en" },
      signal: AbortSignal.timeout(5_000),
      next: { revalidate: 86_400 },
    });
    if (response.ok) {
      const body = await response.json() as NominatimReverseBody;
      const name = body.name || body.address?.road || body.address?.neighbourhood || body.address?.suburb;
      if (name) return name;
    }
  } catch {
    // Keep the stable fallback label when both geocoders are unavailable.
  }
  return fallback;
}

function elementCoordinate(element: OverpassElement): Coordinate | null {
  const lng = element.lon ?? element.center?.lon;
  const lat = element.lat ?? element.center?.lat;
  return typeof lng === "number" && typeof lat === "number" ? [lng, lat] : null;
}

function modeFitScore(name: string, tags: Record<string, string>, mode: DriftMode) {
  if (tags.highway || tags.route === "road" || /(^|\s)[AM]\d+\b|road \(great britain\)/i.test(name)) return 0;
  const signal = modePlaceSignals[mode];
  const searchable = `${name} ${Object.values(tags).join(" ")}`.toLowerCase();
  const keyMatches = signal.keys.filter((key) => Boolean(tags[key])).length;
  const keywordMatches = signal.keywords.filter((keyword) => searchable.includes(keyword)).length;
  const notable = ["tourism", "historic", "amenity", "leisure", "natural", "man_made", "craft", "waterway", "railway"]
    .filter((key) => Boolean(tags[key])).length;
  return Math.min(98, 38 + Math.min(2, keyMatches) * 20 + Math.min(2, keywordMatches) * 14 + Math.min(3, notable) * 5);
}

async function themedPlaces(origin: Coordinate, radius: number, mode: DriftMode): Promise<NearbyPlace[]> {
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (mapTilerKey) {
    const latRadius = radius / 111_320;
    const lngRadius = radius / (111_320 * Math.cos((origin[1] * Math.PI) / 180));
    const bbox = [origin[0] - lngRadius, origin[1] - latRadius, origin[0] + lngRadius, origin[1] + latRadius].join(",");
    const searches = modePlaceSearches[mode];
    const results = await Promise.all(searches.map(async (keyword) => {
      try {
        const params = new URLSearchParams({
          key: mapTilerKey,
          bbox,
          proximity: origin.join(","),
          types: "poi",
          limit: "10",
          language: "en",
        });
        const response = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(keyword)}.json?${params}`, {
          signal: AbortSignal.timeout(4_000),
          next: { revalidate: 3_600 },
        });
        if (!response.ok) return [];
        const body = await response.json() as MapTilerSearchBody;
        return (body.features ?? []).flatMap((feature): NearbyPlace[] => {
          const coordinates = feature.center ?? feature.geometry?.coordinates;
          const name = feature.text?.trim() || feature.place_name?.split(",")[0]?.trim();
          if (!coordinates || !name || !isInLondon(coordinates) || haversineMetres(origin, coordinates) > radius) return [];
          const irrelevantBusiness = /pizza|restaurant|café|cafe|coffee|takeaway|pharmacy|supermarket|convenience/i.test(name);
          if (irrelevantBusiness && !["surprise", "pubs", "night"].includes(mode)) return [];
          const tags = { tourism: "poi", search: keyword, category: feature.properties?.category ?? "" };
          return [{ name, coordinates, tags, fitScore: modeFitScore(name, tags, mode) }];
        });
      } catch {
        return [];
      }
    }));
    const unique = new Map<string, NearbyPlace>();
    for (const place of results.flat()) unique.set(place.name.toLowerCase(), place);
    if (unique.size > 0) return [...unique.values()].sort((a, b) => b.fitScore - a.fitScore);
  }

  const keys = [...new Set(modePlaceSignals[mode].keys)];
  const clauses = keys.map((key) => `nwr(around:${Math.round(radius)},${origin[1]},${origin[0]})[name][${key}];`).join("");
  const query = `[out:json][timeout:8];(${clauses});out center tags 220;`;

  for (const endpoint of ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "LondonDrift/0.1 (non-commercial alpha)" },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(9_000),
      });
      if (!response.ok) continue;
      const body = await response.json() as OverpassBody;
      const unique = new Map<string, NearbyPlace>();

      for (const element of body.elements ?? []) {
        const name = element.tags?.name?.trim();
        const coordinates = elementCoordinate(element);
        if (!name || !coordinates || !isInLondon(coordinates)) continue;
        const distance = haversineMetres(origin, coordinates);
        if (distance < 180 || distance > radius) continue;
        const tags = element.tags ?? {};
        const fitScore = modeFitScore(name, tags, mode);
        if (fitScore < 38) continue;
        const key = name.toLowerCase();
        const existing = unique.get(key);
        if (!existing || fitScore > existing.fitScore) unique.set(key, { name, tags, coordinates, fitScore });
      }

      return [...unique.values()].sort((a, b) => b.fitScore - a.fitScore).slice(0, 180);
    } catch {
      // Try the next public Overpass instance.
    }
  }
  return [];
}

function selectPlacesForTargets(candidates: NearbyPlace[], targets: Coordinate[], seed: number) {
  const used = new Set<string>();
  const selected: Array<NearbyPlace | null> = [];

  for (const [index, target] of targets.entries()) {
    const previous = selected.at(-1)?.coordinates;
    const ranked = candidates
      .filter((candidate) => !used.has(candidate.name.toLowerCase()))
      .map((candidate) => {
        const targetDistance = haversineMetres(candidate.coordinates, target);
        const spacing = previous ? haversineMetres(candidate.coordinates, previous) : Infinity;
        const jitter = hash(`${seed}-${index}-${candidate.name}`) % 55;
        const spacingPenalty = spacing < 240 ? 180 : 0;
        return { candidate, targetDistance, score: candidate.fitScore * 6 + jitter - targetDistance / 5 - spacingPenalty };
      })
      .filter(({ targetDistance }) => targetDistance <= 750)
      .sort((a, b) => b.score - a.score);
    const choice = ranked[0]?.candidate ?? null;
    selected.push(choice);
    if (choice) used.add(choice.name.toLowerCase());
  }
  return selected;
}

function buildPlan(origin: Coordinate, duration: number, mode: DriftMode, variant: number, runSeed: number, candidates: NearbyPlace[]): CandidatePlan {
  const targets = candidateWaypoints(origin, duration, mode, variant, runSeed).slice(1);
  const places = selectPlacesForTargets(candidates, targets, runSeed + variant);
  return {
    places,
    points: [origin, ...targets.map((target, index) => places[index]?.coordinates ?? target)],
  };
}

function scorePlace(place: NearbyPlace | null, fallbackName: string, mode: DriftMode) {
  const signal = modePlaceSignals[mode];
  const tags = place?.tags ?? {};
  const name = (place?.name ?? fallbackName).toLowerCase();
  const keyMatch = signal.keys.some((key) => Boolean(tags[key]));
  const keywordMatch = signal.keywords.some((keyword) => name.includes(keyword) || Object.values(tags).some((value) => value.toLowerCase().includes(keyword)));
  const score = place?.fitScore ?? (48 + (keyMatch ? 24 : 0) + (keywordMatch ? 18 : 0));
  return {
    fitScore: Math.min(98, score),
    fitReason: keyMatch || keywordMatch ? `A named place with a strong ${signal.label} signal.` : `A named place that adds texture to the ${signal.label} route.`,
  };
}

function progressNearPoint(coordinates: Coordinate[], point: Coordinate) {
  const total = lineDistance(coordinates);
  let travelled = 0;
  let closest = { distance: Infinity, progress: 0 };
  for (let index = 0; index < coordinates.length; index += 1) {
    if (index > 0) travelled += haversineMetres(coordinates[index - 1], coordinates[index]);
    const distance = haversineMetres(coordinates[index], point);
    if (distance < closest.distance) closest = { distance, progress: total > 0 ? travelled / total : 0 };
  }
  return closest.progress;
}

async function buildStops(coordinates: Coordinate[], duration: number, mode: DriftMode, plan: CandidatePlan) {
  const names = await Promise.all(plan.places.map((place, index) => (
    place ? Promise.resolve(place.name) : reverseName(plan.points[index + 1], `Drift marker ${index + 1}`)
  )));
  const usedNames = new Set<string>();
  const stops: DriftStop[] = [];

  for (const [index, plannedPoint] of plan.points.slice(1).entries()) {
    const place = plan.places[index];
    const stopCoordinates = place?.coordinates ?? plannedPoint;
    let name = names[index];
    if (usedNames.has(name.toLowerCase())) name = `Drift marker ${index + 1}`;
    usedNames.add(name.toLowerCase());
    const progress = progressNearPoint(coordinates, stopCoordinates);
    const fit = scorePlace(place, name, mode);
    stops.push({
      name,
      note: modeStopNotes[mode][index % modeStopNotes[mode].length] ?? stopNotes[index % stopNotes.length],
      minute: Math.max(1, Math.round(duration * progress)),
      coordinates: stopCoordinates,
      ...fit,
    });
  }

  return stops.sort((a, b) => a.minute - b.minute);
}

export async function generateDrift(start: PlaceSuggestion, duration: number, mode: DriftMode): Promise<DriftRoute> {
  const desiredDistance = duration * WALKING_METRES_PER_MINUTE;
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  const runSeed = hash(`${Date.now()}-${Math.random()}-${start.id}-${mode}`);
  const searchRadius = Math.min(7_000, Math.max(1_400, walkingRadiusMetres(duration) * 1.08));
  const places = await themedPlaces(start.coordinates, searchRadius, mode);
  const plans = [0, 1, 2].map((variant) => buildPlan(start.coordinates, duration, mode, variant, runSeed, places));
  let best: { coordinates: Coordinate[]; distance: number; duration: number; plan: CandidatePlan } | null = null;

  if (apiKey) {
    const candidates = await Promise.all(
      plans.map(async (plan) => {
        const route = await requestOrs(plan.points, apiKey).catch(() => null);
        return route ? { ...route, plan } : null;
      }),
    );
    best = candidates
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((a, b) => Math.abs(a.duration / 60 - duration) - Math.abs(b.duration / 60 - duration))[0] ?? null;
  }

  const fallback = plans
    .map((plan) => ({ plan, distance: lineDistance(plan.points) }))
    .sort((a, b) => Math.abs(a.distance - desiredDistance) - Math.abs(b.distance - desiredDistance))[0];
  const selectedPlan = best?.plan ?? fallback.plan;
  const coordinates = best?.coordinates ?? previewLine(selectedPlan.points, fallback.distance);
  const distance = Math.round(best?.distance ?? lineDistance(coordinates));
  const actualMinutes = Math.round(best ? best.duration / 60 : distance / WALKING_METRES_PER_MINUTE);
  const stops = await buildStops(coordinates, actualMinutes, mode, selectedPlan);
  const endCoordinates = coordinates.at(-1)!;
  const end = await reverseName(endCoordinates, "Somewhere worth continuing from");
  const detail = modeDetails[mode];

  return {
    id: `${Date.now().toString(36)}-${runSeed.toString(36)}`,
    title: detail.title,
    summary: detail.summary,
    mode,
    requestedMinutes: duration,
    durationMinutes: actualMinutes,
    distanceMetres: distance,
    start,
    end,
    geometry: { type: "LineString", coordinates },
    stops,
    provider: best ? "openrouteservice" : "preview",
  };
}

export function validDuration(value: number) {
  return [30, 60, 90, 120].includes(value);
}

export function validMode(value: string): value is DriftMode {
  return value in modeDetails;
}

export function closeEnoughToLondon(point: Coordinate) {
  return isInLondon(point) && haversineMetres([-0.1276, 51.5072], point) < 40_000;
}
