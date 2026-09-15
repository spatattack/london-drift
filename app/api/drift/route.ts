import { NextRequest, NextResponse } from "next/server";
import { closeEnoughToLondon, generateDrift, validDuration, validMode } from "@/lib/route-generator";
import type { PlaceSuggestion } from "@/lib/london";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { duration?: unknown; mode?: unknown; start?: PlaceSuggestion };
    const duration = Number(body.duration);
    const mode = String(body.mode ?? "");
    const start = body.start as PlaceSuggestion | undefined;

    if (!validDuration(duration) || !validMode(mode)) {
      return NextResponse.json({ error: "Choose a valid duration and Drift mode." }, { status: 400 });
    }
    if (!start?.name || !Array.isArray(start.coordinates) || start.coordinates.length !== 2) {
      return NextResponse.json({ error: "Choose a starting point from the suggestions." }, { status: 400 });
    }
    if (!closeEnoughToLondon(start.coordinates)) {
      return NextResponse.json({ error: "London Drift currently starts within Greater London." }, { status: 400 });
    }

    const drift = await generateDrift(start, duration, mode);
    return NextResponse.json({ drift });
  } catch (error) {
    console.error("Drift generation failed", error);
    return NextResponse.json({ error: "The route could not be generated. Please try another starting point." }, { status: 500 });
  }
}
