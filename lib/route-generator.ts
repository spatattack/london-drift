import { walkingRadiusMetres, type DriftMode } from "@/lib/drift-engine";
import {
  haversineMetres,
  isInLondon,
  lineDistance,
  modeDetails,
  pointAlongLine,
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

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type OverpassBody = { elements?: OverpassElement[] };

type NearbyPlace = { name: string; tags: Record<string, string> };
type NominatimReverseBody = { name?: string; display_name?: string; address?: { road?: string; neighbourhood?: string; suburb?: string } };

const modePlaceSignals: Record<DriftMode, { keys: string[]; keywords: string[]; label: string }> = {
  surprise: { keys: ["amenity", "tourism", "historic", "leisure", "shop"], keywords: ["market", "gallery", "yard"], label: "curiosity" },
  quiet: { keys: ["leisure", "natural", "landuse"], keywords: ["garden", "park", "green", "cemetery"], label: "quiet wandering" },
  architecture: { keys: ["building", "building:architecture", "historic", "heritage", "man_made"], keywords: ["hall", "warehouse", "station", "church", "court"], label: "architecture" },
  water: { keys: ["waterway", "natural", "leisure"], keywords: ["canal", "lock", "river", "pond", "reservoir", "marina"], label: "water" },
  old: { keys: ["historic", "heritage", "building", "place_of_worship"], keywords: ["old", "church", "chapel", "hall", "market", "court"], label: "old London" },
  industrial: { keys: ["industrial", "man_made", "craft", "railway"], keywords: ["works", "yard", "arches", "depot", "factory", "rail"], label: "post-industrial texture" },
  green: { keys: ["leisure", "natural", "landuse"], keywords: ["park", "garden", "common", "wood", "meadow", "green"], label: "green space" },
  weird: { keys: ["artwork_type", "man_made", "historic", "railway", "amenity"], keywords: ["mural", "sculpture", "tower", "tunnel", "arches", "station", "market"], label: "weirdness" },
  photography: { keys: ["tourism", "artwork_type", "man_made", "building", "natural"], keywords: ["viewpoint", "mural", "gallery", "bridge", "tower", "station"], label: "photography" },
  pubs: { keys: ["amenity", "shop", "tourism"], keywords: ["pub", "tavern", "inn", "brewery", "bar", "market"], label: "a useful wander" },
  night: { keys: ["amenity", "shop", "public_transport", "railway"], keywords: ["station", "market", "cinema", "theatre", "bar"], label: "night-time usefulness" },
};

const stopNotes = [
  "Take the less obvious side street here.",
  "A useful pause for texture and a change of scale.",
  "Look back before continuing; the view works in reverse.",
  "The route changes character at this point.",
  "A small landmark rather than a headline sight.",
  "A good place to decide whether to linger.",
];

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

function candidateWaypoints(origin: Coordinate, duration: number, mode: DriftMode, variant: number) {
  const seed = hash(`${origin.join(",")}-${duration}-${mode}-${variant}`);
  const bearing = ((seed % 360) * Math.PI) / 180;
  const radius = walkingRadiusMetres(duration) * (0.54 + variant * 0.035);
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

function placeScore(element: OverpassElement, point: Coordinate) {
  const tags = element.tags ?? {};
  const coordinate = elementCoordinate(element);
  if (!coordinate || !tags.name) return -Infinity;

  const distance = haversineMetres(point, coordinate);
  if (distance > 180) return -Infinity;

  // Prefer named things people can actually notice over generic road geometry.
  const categoryBonus = ["tourism", "historic", "amenity", "shop", "leisure", "natural", "man_made", "craft", "railway"]
    .some((key) => Boolean(tags[key])) ? 240 : 0;
  const roadPenalty = tags.highway ? 140 : 0;
  const transitBonus = tags.public_transport || tags.railway ? 40 : 0;
  return categoryBonus + transitBonus - roadPenalty - distance;
}

async function nearbyPlace(point: Coordinate): Promise<NearbyPlace | null> {
  const query = `[out:json][timeout:8];nwr(around:180,${point[1]},${point[0]})[name];out center tags 80;`;
  for (const endpoint of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain", "User-Agent": "LondonDrift/0.1 (non-commercial alpha)" },
        body: query,
        signal: AbortSignal.timeout(7_000),
      });
      if (!response.ok) continue;
      const body = await response.json() as OverpassBody;
      const best = (body.elements ?? []).sort((a, b) => placeScore(b, point) - placeScore(a, point))[0];
      const name = best?.tags?.name?.trim();
      if (name) return { name, tags: best?.tags ?? {} };
    } catch {
      // Try the next public Overpass instance.
    }
  }
  return null;
}

function scorePlace(place: NearbyPlace | null, fallbackName: string, mode: DriftMode) {
  const signal = modePlaceSignals[mode];
  const tags = place?.tags ?? {};
  const name = (place?.name ?? fallbackName).toLowerCase();
  const keyMatch = signal.keys.some((key) => Boolean(tags[key]));
  const keywordMatch = signal.keywords.some((keyword) => name.includes(keyword) || Object.values(tags).some((value) => value.toLowerCase().includes(keyword)));
  const score = 48 + (keyMatch ? 24 : 0) + (keywordMatch ? 18 : 0) + (place ? 8 : 0);
  return {
    fitScore: Math.min(98, score),
    fitReason: keyMatch || keywordMatch ? `A named place with a strong ${signal.label} signal.` : `A named place that adds texture to the ${signal.label} route.`,
  };
}

async function buildStops(coordinates: Coordinate[], duration: number, mode: DriftMode) {
  const count = duration <= 30 ? 2 : duration <= 60 ? 3 : duration <= 90 ? 4 : 5;
  const raw = Array.from({ length: count }, (_, index) => {
    const progress = (index + 1) / (count + 1);
    return { progress, coordinates: pointAlongLine(coordinates, progress) };
  });

  return Promise.all(raw.map(async ({ progress, coordinates }, index): Promise<DriftStop> => {
    const place = await nearbyPlace(coordinates);
    const fallbackName = await reverseName(coordinates, `Drift marker ${index + 1}`);
    const name = place?.name ?? fallbackName;
    const fit = scorePlace(place, name, mode);
    return {
      name,
      note: stopNotes[index % stopNotes.length],
      minute: Math.max(1, Math.round(duration * progress)),
      coordinates,
      ...fit,
    };
  }));
}

export async function generateDrift(start: PlaceSuggestion, duration: number, mode: DriftMode): Promise<DriftRoute> {
  const desiredDistance = duration * WALKING_METRES_PER_MINUTE;
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  let best: { coordinates: Coordinate[]; distance: number; duration: number } | null = null;

  if (apiKey) {
    const candidates = await Promise.all(
      [0, 1, 2].map((variant) => requestOrs(candidateWaypoints(start.coordinates, duration, mode, variant), apiKey).catch(() => null)),
    );
    best = candidates
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((a, b) => Math.abs(a.duration / 60 - duration) - Math.abs(b.duration / 60 - duration))[0] ?? null;
  }

  const coordinates = best?.coordinates ?? previewLine(candidateWaypoints(start.coordinates, duration, mode, 1), desiredDistance);
  const distance = Math.round(best?.distance ?? lineDistance(coordinates));
  const actualMinutes = Math.round(best ? best.duration / 60 : distance / WALKING_METRES_PER_MINUTE);
  const stops = await buildStops(coordinates, actualMinutes, mode);
  const endCoordinates = coordinates.at(-1)!;
  const end = await reverseName(endCoordinates, "Somewhere worth continuing from");
  const detail = modeDetails[mode];

  return {
    id: `${Date.now().toString(36)}-${hash(`${start.id}-${duration}-${mode}`).toString(36)}`,
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
