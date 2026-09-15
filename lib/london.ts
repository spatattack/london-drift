import type { DriftMode } from "@/lib/drift-engine";
import type { LineString } from "geojson";

export type Coordinate = [number, number];

export type PlaceSuggestion = {
  id: string;
  name: string;
  context: string;
  coordinates: Coordinate;
};

export type DriftStop = {
  name: string;
  note: string;
  minute: number;
  coordinates: Coordinate;
};

export type DriftRoute = {
  id: string;
  title: string;
  summary: string;
  mode: DriftMode;
  requestedMinutes: number;
  durationMinutes: number;
  distanceMetres: number;
  start: PlaceSuggestion;
  end: string;
  geometry: LineString;
  stops: DriftStop[];
  provider: "openrouteservice" | "preview";
};

export const LONDON_BOUNDS = {
  west: -0.5103,
  south: 51.2868,
  east: 0.334,
  north: 51.6919,
};

export const fallbackPlaces: PlaceSuggestion[] = [
  { id: "hackney-central", name: "Hackney Central", context: "Hackney, London", coordinates: [-0.0554, 51.5471] },
  { id: "kings-cross", name: "King’s Cross", context: "Camden, London", coordinates: [-0.1238, 51.5308] },
  { id: "waterloo", name: "Waterloo", context: "South Bank, London", coordinates: [-0.1132, 51.5033] },
  { id: "brixton", name: "Brixton", context: "Lambeth, London", coordinates: [-0.1149, 51.4627] },
  { id: "paddington", name: "Paddington", context: "Westminster, London", coordinates: [-0.1754, 51.5154] },
  { id: "greenwich", name: "Greenwich", context: "Greenwich, London", coordinates: [-0.0098, 51.481] },
  { id: "camden-town", name: "Camden Town", context: "Camden, London", coordinates: [-0.1426, 51.5392] },
  { id: "victoria", name: "Victoria", context: "Westminster, London", coordinates: [-0.1439, 51.4965] },
  { id: "stratford", name: "Stratford", context: "Newham, London", coordinates: [-0.0032, 51.5413] },
  { id: "clapham-common", name: "Clapham Common", context: "Lambeth, London", coordinates: [-0.1384, 51.4618] },
];

export const modeDetails: Record<DriftMode, { label: string; title: string; summary: string; colour: string; turn: number }> = {
  surprise: { label: "Surprise me", title: "The useful detour", summary: "Contrasts, shortcuts and one turn you would not normally take.", colour: "#e64b35", turn: 0.72 },
  quiet: { label: "Quiet London", title: "Quiet corners", summary: "Residential streets, pocket parks and fewer busy-road minutes.", colour: "#2f715c", turn: 0.48 },
  architecture: { label: "Architecture", title: "Concrete & crescents", summary: "A mix of old façades, new interventions and overlooked civic detail.", colour: "#24324a", turn: 0.61 },
  water: { label: "Canals & water", title: "Towpaths & lock gates", summary: "A waterside-biased drift with textured streets between blue stretches.", colour: "#287c9b", turn: 0.4 },
  old: { label: "Old London", title: "Lanes before London", summary: "Parish edges, surviving alleys and streets that resist the modern grid.", colour: "#9a4e31", turn: 0.66 },
  industrial: { label: "Post-industrial", title: "Arches, yards, cuttings", summary: "Rail edges, workshops and the productive seams of the city.", colour: "#89602c", turn: 0.76 },
  green: { label: "Green", title: "A chain of small greens", summary: "Leafier links, park edges and open ground where the city loosens.", colour: "#4c7b48", turn: 0.44 },
  weird: { label: "Weird London", title: "London glitches", summary: "Odd corners, accidental squares and infrastructure with no obvious explanation.", colour: "#81458a", turn: 0.91 },
  photography: { label: "Good for photography", title: "Light, brick & long views", summary: "Strong geometry, changing light and enough pauses to look properly.", colour: "#d7472f", turn: 0.69 },
  pubs: { label: "Pubs & wandering", title: "A pint, eventually", summary: "A proper wander with a useful finish and optional doors along the way.", colour: "#a75b32", turn: 0.58 },
  night: { label: "Night walk", title: "After-dark London", summary: "Active streets and connected places, avoiding isolated green and towpath stretches.", colour: "#3f4f78", turn: 0.5 },
};

export function isInLondon([lng, lat]: Coordinate) {
  return lng >= LONDON_BOUNDS.west && lng <= LONDON_BOUNDS.east && lat >= LONDON_BOUNDS.south && lat <= LONDON_BOUNDS.north;
}

export function haversineMetres(a: Coordinate, b: Coordinate) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = lat2 - lat1;
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(h));
}

export function lineDistance(coordinates: Coordinate[]) {
  return coordinates.slice(1).reduce((sum, point, index) => sum + haversineMetres(coordinates[index], point), 0);
}

export function pointAlongLine(coordinates: Coordinate[], progress: number): Coordinate {
  const total = lineDistance(coordinates);
  const target = total * progress;
  let travelled = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const length = haversineMetres(coordinates[index - 1], coordinates[index]);
    if (travelled + length >= target) {
      const ratio = length === 0 ? 0 : (target - travelled) / length;
      return [
        coordinates[index - 1][0] + (coordinates[index][0] - coordinates[index - 1][0]) * ratio,
        coordinates[index - 1][1] + (coordinates[index][1] - coordinates[index - 1][1]) * ratio,
      ];
    }
    travelled += length;
  }

  return coordinates.at(-1) ?? coordinates[0];
}
