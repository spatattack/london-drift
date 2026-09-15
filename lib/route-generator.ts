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
  if (!key) return fallback;

  try {
    const response = await fetch(`https://api.maptiler.com/geocoding/${point[0]},${point[1]}.json?key=${encodeURIComponent(key)}&limit=1&language=en`, {
      signal: AbortSignal.timeout(4_000),
      next: { revalidate: 86_400 },
    });
    if (!response.ok) return fallback;
    const body = await response.json() as ReverseGeocodeBody;
    return body.features?.[0]?.text || body.features?.[0]?.place_name?.split(",")[0] || fallback;
  } catch {
    return fallback;
  }
}

async function buildStops(coordinates: Coordinate[], duration: number) {
  const count = duration <= 30 ? 2 : duration <= 60 ? 3 : duration <= 90 ? 4 : 5;
  const raw = Array.from({ length: count }, (_, index) => {
    const progress = (index + 1) / (count + 1);
    return { progress, coordinates: pointAlongLine(coordinates, progress) };
  });

  return Promise.all(raw.map(async ({ progress, coordinates }, index): Promise<DriftStop> => ({
    name: await reverseName(coordinates, `Drift marker ${index + 1}`),
    note: stopNotes[index % stopNotes.length],
    minute: Math.max(1, Math.round(duration * progress)),
    coordinates,
  })));
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
  const stops = await buildStops(coordinates, actualMinutes);
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
