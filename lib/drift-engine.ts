export type DriftMode =
  | "surprise"
  | "quiet"
  | "architecture"
  | "water"
  | "old"
  | "industrial"
  | "green"
  | "weird"
  | "photography"
  | "pubs"
  | "night";

export type RouteSignals = {
  interest: number;
  novelty: number;
  vibeMatch: number;
  environmentalVariety: number;
  pedestrianQuality: number;
  endpointQuality: number;
  backtracking: number;
  durationError: number;
  majorRoadExposure: number;
  repetition: number;
  complexity: number;
};

export type CandidateRoute = {
  id: string;
  durationMinutes: number;
  distanceMetres: number;
  signals: RouteSignals;
  geometry: GeoJSON.LineString;
  waypointIds: string[];
};

type Weights = Record<keyof RouteSignals, number>;

const balanced: Weights = {
  interest: 1.2,
  novelty: 1.1,
  vibeMatch: 1.4,
  environmentalVariety: 1.0,
  pedestrianQuality: 1.35,
  endpointQuality: 0.75,
  backtracking: -1.5,
  durationError: -1.7,
  majorRoadExposure: -1.35,
  repetition: -0.8,
  complexity: -0.45,
};

export const modeWeights: Record<DriftMode, Weights> = {
  surprise: balanced,
  quiet: { ...balanced, vibeMatch: 1.7, pedestrianQuality: 1.6, majorRoadExposure: -2.0 },
  architecture: { ...balanced, interest: 1.55, vibeMatch: 1.85, environmentalVariety: 0.8 },
  water: { ...balanced, vibeMatch: 2.1, pedestrianQuality: 1.45, endpointQuality: 0.6 },
  old: { ...balanced, interest: 1.65, vibeMatch: 1.8 },
  industrial: { ...balanced, interest: 1.5, vibeMatch: 1.9, environmentalVariety: 1.2 },
  green: { ...balanced, vibeMatch: 2.0, pedestrianQuality: 1.7, majorRoadExposure: -1.8 },
  weird: { ...balanced, interest: 1.75, novelty: 1.45, vibeMatch: 1.65, complexity: -0.25 },
  photography: { ...balanced, interest: 1.65, vibeMatch: 1.8, environmentalVariety: 1.5 },
  pubs: { ...balanced, endpointQuality: 1.25, vibeMatch: 1.3 },
  night: { ...balanced, pedestrianQuality: 2.1, majorRoadExposure: -1.1, complexity: -0.8 },
};

export function scoreCandidate(candidate: CandidateRoute, mode: DriftMode): number {
  const weights = modeWeights[mode];
  const weighted = (Object.keys(candidate.signals) as (keyof RouteSignals)[])
    .reduce((score, key) => score + candidate.signals[key] * weights[key], 0);
  return Math.round(weighted * 100) / 100;
}

export function rankCandidates(candidates: CandidateRoute[], mode: DriftMode): CandidateRoute[] {
  return [...candidates]
    .filter((candidate) => candidate.signals.pedestrianQuality >= 0.45)
    .filter((candidate) => candidate.signals.durationError <= 0.25)
    .filter((candidate) => candidate.signals.backtracking <= 0.35)
    .sort((a, b) => scoreCandidate(b, mode) - scoreCandidate(a, mode));
}

export function walkingRadiusMetres(durationMinutes: number): number {
  const walkingSpeedMetresPerMinute = 79;
  const exploratoryPathFactor = 0.68;
  return Math.round(durationMinutes * walkingSpeedMetresPerMinute * exploratoryPathFactor);
}
