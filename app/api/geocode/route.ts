import { NextRequest, NextResponse } from "next/server";
import { fallbackPlaces, LONDON_BOUNDS, type PlaceSuggestion } from "@/lib/london";

type MapTilerFeature = {
  id: string;
  text?: string;
  place_name?: string;
  center: [number, number];
};

type NominatimBody = {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    if (latitude < LONDON_BOUNDS.south || latitude > LONDON_BOUNDS.north || longitude < LONDON_BOUNDS.west || longitude > LONDON_BOUNDS.east) {
      return NextResponse.json({ results: [], error: "That location is outside Greater London." }, { status: 400 });
    }

    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    try {
      if (key) {
        const params = new URLSearchParams({ key, limit: "1", language: "en" });
        const response = await fetch(`https://api.maptiler.com/geocoding/${longitude},${latitude}.json?${params}`, { signal: AbortSignal.timeout(5_000) });
        if (response.ok) {
          const body = await response.json() as { features?: MapTilerFeature[] };
          const feature = body.features?.[0];
          if (feature) {
            return NextResponse.json({ results: [{ id: feature.id, name: feature.text || "Current location", context: feature.place_name?.split(",").slice(1).join(",").trim() || "London", coordinates: [longitude, latitude] as [number, number] }] });
          }
        }
      }

      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18`, {
        headers: { "User-Agent": "LondonDrift/0.1 (non-commercial alpha)" },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) {
        const body = await response.json() as NominatimBody;
        return NextResponse.json({ results: [{ id: "current-location", name: body.name || "My current location", context: body.display_name?.split(",").slice(1, 3).join(",").trim() || "London", coordinates: [longitude, latitude] as [number, number] }] });
      }
    } catch {
      // Fall through to the stable current-location label.
    }
    return NextResponse.json({ results: [{ id: "current-location", name: "My current location", context: "London", coordinates: [longitude, latitude] as [number, number] }] });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });

  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (!key) {
    const normalized = query.toLowerCase();
    return NextResponse.json({
      results: fallbackPlaces
        .filter((place) => `${place.name} ${place.context}`.toLowerCase().includes(normalized))
        .slice(0, 6),
      preview: true,
    });
  }

  const params = new URLSearchParams({
    key,
    limit: "6",
    language: "en",
    country: "gb",
    bbox: `${LONDON_BOUNDS.west},${LONDON_BOUNDS.south},${LONDON_BOUNDS.east},${LONDON_BOUNDS.north}`,
    autocomplete: "true",
  });

  try {
    const response = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${params}`, {
      signal: AbortSignal.timeout(6_000),
      next: { revalidate: 3_600 },
    });
    if (!response.ok) throw new Error(`MapTiler returned ${response.status}`);
    const body = await response.json() as { features?: MapTilerFeature[] };
    const results: PlaceSuggestion[] = (body.features ?? []).map((feature: MapTilerFeature) => ({
      id: feature.id,
      name: feature.text || feature.place_name?.split(",")[0] || "London place",
      context: feature.place_name?.split(",").slice(1).join(",").trim() || "London",
      coordinates: feature.center,
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [], error: "Search is temporarily unavailable." }, { status: 502 });
  }
}
