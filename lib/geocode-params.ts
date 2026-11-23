function finiteParam(params: URLSearchParams, name: string) {
  const raw = params.get(name)?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function parseLatLonParams(params: URLSearchParams): { latitude: number; longitude: number } | null {
  const latitude = finiteParam(params, "lat");
  const longitude = finiteParam(params, "lon");
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}
