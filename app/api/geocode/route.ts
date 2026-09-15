import { NextRequest, NextResponse } from "next/server";
import { fallbackPlaces, LONDON_BOUNDS, type PlaceSuggestion } from "@/lib/london";

type MapTilerFeature = {
  id: string;
  text?: string;
  place_name?: string;
  center: [number, number];
};

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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
