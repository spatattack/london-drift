"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  Compass,
  Crosshair,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type RouteMode =
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

type RouteTemplate = {
  title: string;
  end: string;
  areas: string[];
  why: string;
  stops: { name: string; note: string; minute: number }[];
  path: string;
  color: string;
};

const durations = [30, 60, 90, 120];

const modes: { value: RouteMode; label: string }[] = [
  { value: "surprise", label: "Surprise me" },
  { value: "quiet", label: "Quiet London" },
  { value: "architecture", label: "Architecture" },
  { value: "water", label: "Canals & water" },
  { value: "old", label: "Old London" },
  { value: "industrial", label: "Post-industrial" },
  { value: "green", label: "Green" },
  { value: "weird", label: "Weird London" },
  { value: "photography", label: "Good for photography" },
  { value: "pubs", label: "Pubs & wandering" },
  { value: "night", label: "Night walk" },
];

const routeTemplates: Record<RouteMode, RouteTemplate> = {
  surprise: {
    title: "The useful detour",
    end: "London Fields",
    areas: ["Hackney", "Homerton", "Victoria Park", "London Fields"],
    why: "Back streets, an old railway edge, a pocket of green and two sharp changes of scenery.",
    stops: [
      { name: "Morning Lane yards", note: "Workshops hiding behind the high street", minute: 16 },
      { name: "Chatsworth Road", note: "A lived-in east London parade", minute: 39 },
      { name: "Victoria Park edge", note: "Cut through the quieter western paths", minute: 61 },
      { name: "Broadway Market", note: "A useful finish for food, coffee or a pint", minute: 86 },
    ],
    path: "M112 390 C155 348 146 300 210 292 S286 334 320 286 S350 192 427 205 S490 252 544 190 S625 118 690 145",
    color: "#e0442e",
  },
  quiet: {
    title: "Quiet corners east",
    end: "De Beauvoir Town",
    areas: ["Hackney", "Clapton", "Stoke Newington", "De Beauvoir"],
    why: "Residential crescents, small parks and low-traffic streets with only brief crossings of busy roads.",
    stops: [
      { name: "St John’s churchyard", note: "Old trees and a calm diagonal path", minute: 19 },
      { name: "Clapton Square", note: "A Georgian pause off the main road", minute: 37 },
      { name: "Butterfield Green", note: "Tiny, local and easy to miss", minute: 64 },
      { name: "De Beauvoir Square", note: "Garden square at the end of the drift", minute: 88 },
    ],
    path: "M118 382 C150 350 126 304 184 278 S254 282 270 224 S286 128 360 142 S426 210 484 184 S584 208 650 126",
    color: "#246b53",
  },
  architecture: {
    title: "Concrete & crescents",
    end: "Barbican",
    areas: ["Hackney", "Haggerston", "Hoxton", "Barbican"],
    why: "Victorian terraces, post-war estates, railway viaducts and a final dose of heroic concrete.",
    stops: [
      { name: "Kingsland Estate", note: "Post-war housing in a changing streetscape", minute: 18 },
      { name: "Haggerston arches", note: "Brick viaduct, workshops and sharp shadows", minute: 40 },
      { name: "Golden Lane Estate", note: "Chamberlin, Powell and Bon before the Barbican", minute: 68 },
      { name: "Barbican Lakeside", note: "Finish among concrete, water and walkways", minute: 89 },
    ],
    path: "M102 382 C148 336 192 344 214 286 S218 210 290 218 S378 278 412 210 S452 110 520 132 S572 188 658 118",
    color: "#24324a",
  },
  water: {
    title: "Towpaths & lock gates",
    end: "Mile End",
    areas: ["Hackney", "Haggerston", "Regent’s Canal", "Mile End"],
    why: "A long waterside middle, three locks and short street sections chosen for texture rather than speed.",
    stops: [
      { name: "Kingsland Basin", note: "Boats, reflections and a hidden turn", minute: 22 },
      { name: "Acton’s Lock", note: "Stay with the canal beneath the trees", minute: 43 },
      { name: "Old Ford Lock", note: "A broad, open stretch by Victoria Park", minute: 67 },
      { name: "Ragged School Museum", note: "Leave the water beside an old canal school", minute: 88 },
    ],
    path: "M98 370 C174 358 174 314 242 318 S304 278 360 288 S426 330 466 270 S486 174 550 192 S600 220 682 146",
    color: "#1b6f8f",
  },
  old: {
    title: "Lanes before London",
    end: "Clerkenwell",
    areas: ["Hackney", "Shoreditch", "Spitalfields", "Clerkenwell"],
    why: "Old parish boundaries, surviving alleys, churchyards and streets that ignore the modern grid.",
    stops: [
      { name: "Boundary Estate", note: "London’s first council estate", minute: 24 },
      { name: "Fournier Street", note: "Huguenot houses behind the market", minute: 45 },
      { name: "Bunhill Fields", note: "A nonconformist burial ground in the city", minute: 67 },
      { name: "Clerkenwell Green", note: "Old square, radical history, good finish", minute: 89 },
    ],
    path: "M108 382 C178 360 156 294 226 276 S330 306 348 246 S320 166 412 154 S494 210 548 166 S600 94 678 132",
    color: "#934626",
  },
  industrial: {
    title: "Arches, yards, cuttings",
    end: "Hackney Wick",
    areas: ["Hackney", "Homerton", "Lea Navigation", "Hackney Wick"],
    why: "Working yards, railway edges, canal infrastructure and adaptive reuse with almost no polished high street.",
    stops: [
      { name: "Homerton rail cutting", note: "Back streets pressed against the railway", minute: 19 },
      { name: "Mabley Green", note: "A strange open break in the industrial grain", minute: 42 },
      { name: "Old Ford canal works", note: "Locks, sheds and leftover infrastructure", minute: 64 },
      { name: "White Post Lane", note: "Studios and yards under the Overground", minute: 88 },
    ],
    path: "M108 388 C142 334 202 360 222 300 S202 222 290 226 S384 266 406 206 S432 136 520 158 S602 198 680 126",
    color: "#875b2a",
  },
  green: {
    title: "A chain of small greens",
    end: "Walthamstow Marshes",
    areas: ["Hackney", "Clapton", "Springfield", "Lea Marshes"],
    why: "Five linked green spaces, tree-lined residential streets and a wide-open marshland finish.",
    stops: [
      { name: "Hackney Downs", note: "Cross the park on its quieter diagonal", minute: 18 },
      { name: "Springfield Park", note: "A sudden slope above the Lea valley", minute: 43 },
      { name: "Coppermill fields", note: "Untrimmed edges and big skies", minute: 68 },
      { name: "Walthamstow Marshes", note: "Finish where the city opens out", minute: 89 },
    ],
    path: "M108 386 C122 322 170 320 196 266 S244 160 314 182 S362 250 426 220 S462 124 544 130 S614 172 684 108",
    color: "#3f7342",
  },
  weird: {
    title: "London glitches",
    end: "Bow",
    areas: ["Hackney", "Homerton", "Fish Island", "Bow"],
    why: "An accidental square, a road to nowhere, back-of-railway footpaths and one gloriously unnecessary bridge.",
    stops: [
      { name: "The Narrow Way", note: "A high street that briefly forgets cars", minute: 14 },
      { name: "Brooksby’s Walk", note: "Houses, garages, then a sudden footbridge", minute: 34 },
      { name: "Greenway steps", note: "Climb onto a Victorian sewer embankment", minute: 61 },
      { name: "Three Mills", note: "Tidal mills marooned inside modern London", minute: 88 },
    ],
    path: "M106 384 C162 324 104 282 202 270 S310 330 326 252 S286 148 410 174 S476 260 518 198 S572 84 682 132",
    color: "#7d3e80",
  },
  photography: {
    title: "Light under the arches",
    end: "Bethnal Green",
    areas: ["Hackney", "Haggerston", "Regent’s Canal", "Bethnal Green"],
    why: "Brick, water, market colour and deep railway shadows, with a mix of long views and close street detail.",
    stops: [
      { name: "Stonebridge Gardens", note: "Estate geometry and mature plane trees", minute: 17 },
      { name: "Haggerston arches", note: "Hard light, brick texture and passing trains", minute: 38 },
      { name: "Broadway Market", note: "People, signs and shopfront detail", minute: 59 },
      { name: "Patriot Square", note: "A calm civic finish in Bethnal Green", minute: 88 },
    ],
    path: "M104 384 C146 344 166 304 224 312 S286 330 320 268 S350 182 426 202 S492 270 534 208 S596 112 680 144",
    color: "#d9472b",
  },
  pubs: {
    title: "A pint, eventually",
    end: "The Dove, Broadway Market",
    areas: ["Hackney", "Lower Clapton", "London Fields", "Broadway Market"],
    why: "Good wandering first: back streets, park edges and a canal finish with a few optional doors along the way.",
    stops: [
      { name: "The Chesham Arms", note: "Optional early stop on a residential corner", minute: 26 },
      { name: "St John of Jerusalem", note: "A Victorian pub tucked off the obvious route", minute: 49 },
      { name: "London Fields", note: "Cross the park, not the busy road", minute: 68 },
      { name: "The Dove", note: "End by the canal if it feels like pint time", minute: 88 },
    ],
    path: "M112 386 C168 370 178 312 230 296 S306 316 326 244 S352 144 432 170 S506 238 548 184 S610 122 682 146",
    color: "#9d552f",
  },
  night: {
    title: "After-dark east",
    end: "Old Street",
    areas: ["Hackney", "Dalston", "Hoxton", "Old Street"],
    why: "Active, well-used streets with architectural interest, avoiding isolated parks and unlit towpaths.",
    stops: [
      { name: "Dalston Square", note: "A bright, active first marker", minute: 19 },
      { name: "Kingsland Road", note: "Short lively section between side streets", minute: 39 },
      { name: "Hoxton Square", note: "Nightlife without a long detour", minute: 64 },
      { name: "Old Street", note: "A well-connected finish", minute: 88 },
    ],
    path: "M104 386 C156 336 182 354 214 292 S234 202 314 222 S388 284 424 214 S472 128 536 160 S606 194 678 130",
    color: "#30436d",
  },
};

const mapRoads = [
  "M-20 82 C96 114 126 78 242 92 S392 130 490 92 S640 58 790 94",
  "M-30 168 C80 152 156 182 248 158 S410 122 508 158 S644 206 790 174",
  "M-10 264 C88 214 176 250 248 270 S384 300 480 260 S650 232 790 278",
  "M-20 360 C94 328 168 384 274 352 S436 326 518 360 S654 404 790 356",
  "M82 -20 C102 70 82 118 118 204 S140 326 98 490",
  "M206 -10 C186 80 230 130 204 210 S166 322 214 490",
  "M346 -20 C324 84 382 126 344 214 S306 342 370 490",
  "M482 -20 C528 68 472 126 500 220 S548 350 512 490",
  "M626 -20 C594 84 652 144 618 230 S586 366 662 490",
];

export default function Home() {
  const [location, setLocation] = useState("Hackney Central");
  const [duration, setDuration] = useState(90);
  const [mode, setMode] = useState<RouteMode>("photography");
  const [routeMode, setRouteMode] = useState<RouteMode>("photography");
  const [routeDuration, setRouteDuration] = useState(90);
  const [generatedFrom, setGeneratedFrom] = useState("Hackney Central");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showRoute, setShowRoute] = useState(true);
  const [saved, setSaved] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"setup" | "route">("setup");
  const [notice, setNotice] = useState("");

  const route = routeTemplates[routeMode];
  const distance = useMemo(() => (routeDuration * 0.079).toFixed(1), [routeDuration]);

  useEffect(() => {
    const context = (document as Document & {
      modelContext?: {
        registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
      };
    }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const routeModes = modes.map((item) => item.value);
    void Promise.resolve(context.registerTool({
      name: "generate_london_drift",
      title: "Generate London drift",
      description: "Generate and show an exploratory London walking route from a start, duration and vibe.",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "string", description: "London station, neighbourhood, postcode or address" },
          duration: { type: "integer", enum: durations },
          vibe: { type: "string", enum: routeModes },
        },
        required: ["start", "duration", "vibe"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (raw: unknown) => {
        const input = raw as { start?: unknown; duration?: unknown; vibe?: unknown };
        if (typeof input.start !== "string" || !input.start.trim()) throw new Error("A London starting point is required.");
        if (!durations.includes(Number(input.duration))) throw new Error("Duration must be 30, 60, 90 or 120 minutes.");
        if (!routeModes.includes(input.vibe as RouteMode)) throw new Error("Choose a supported drift vibe.");
        const nextMode = input.vibe as RouteMode;
        setLocation(input.start.trim());
        setDuration(Number(input.duration));
        setMode(nextMode);
        setGeneratedFrom(input.start.trim());
        setRouteDuration(Number(input.duration));
        setRouteMode(nextMode);
        setShowRoute(true);
        setMobilePanel("route");
        const nextRoute = routeTemplates[nextMode];
        return { title: nextRoute.title, start: input.start.trim(), end: nextRoute.end, duration: Number(input.duration), vibe: nextMode };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  function generateDrift() {
    setIsGenerating(true);
    setShowRoute(false);
    window.setTimeout(() => {
      setRouteMode(mode);
      setRouteDuration(duration);
      setGeneratedFrom(location.trim() || "Current location");
      setShowRoute(true);
      setMobilePanel("route");
      setIsGenerating(false);
    }, 720);
  }

  function regenerate() {
    const index = modes.findIndex((item) => item.value === routeMode);
    const next = modes[(index + 1) % modes.length].value;
    setMode(next);
    setRouteMode(next);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setNotice("Location is not available in this browser.");
      return;
    }
    setNotice("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocation("Current location");
        setNotice("Starting from your current location.");
      },
      () => setNotice("Couldn’t use your location. Enter a nearby station or postcode instead."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function shareRoute() {
    const shareData = { title: `${route.title} — London Drift`, text: `${routeDuration}-minute ${routeMode} drift from ${generatedFrom} to ${route.end}.`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
        setNotice("Route copied to your clipboard.");
      }
    } catch {
      setNotice("Sharing cancelled.");
    }
  }

  function startDrift() {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(generatedFrom)}&destination=${encodeURIComponent(route.end + ", London")}&travelmode=walking`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup" aria-label="London Drift home">
          <span className="brand-mark"><Compass strokeWidth={2.2} /></span>
          <span className="brand-name">LONDON DRIFT</span>
        </div>
        <p className="tagline">Take the long way.</p>
        <button className="history-link" type="button">My drifts <ArrowRight /></button>
      </header>

      <section className="workspace">
        <aside className={`setup-panel ${mobilePanel === "setup" ? "mobile-active" : ""}`}>
          <div className="panel-scroll">
            <div className="intro-copy">
              <p className="eyebrow">Wander somewhere new</p>
              <h1>Where do you want to drift?</h1>
            </div>

            <div className="form-section">
              <div className="section-label-row">
                <label htmlFor="location">Starting point</label>
                <button type="button" className="text-action" onClick={useCurrentLocation}><LocateFixed /> Use my location</button>
              </div>
              <div className="location-input-wrap">
                <MapPin aria-hidden="true" />
                <Input
                  id="location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Station, neighbourhood or postcode"
                  className="location-input"
                />
                {location && <button aria-label="Clear location" className="clear-input" onClick={() => setLocation("")}><X /></button>}
              </div>
              <p className="input-hint"><Crosshair /> London only, for now</p>
            </div>

            <fieldset className="form-section">
              <legend>How long have you got?</legend>
              <RadioGroup
                value={String(duration)}
                onValueChange={(value) => setDuration(Number(value))}
                className="duration-grid"
                aria-label="Walk duration"
              >
                {durations.map((minutes) => (
                  <label key={minutes} className={`duration-option ${duration === minutes ? "selected" : ""}`}>
                    <RadioGroupItem value={String(minutes)} className="sr-only" />
                    <strong>{minutes}</strong><span>min</span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>

            <fieldset className="form-section vibe-section">
              <legend>What kind of wander?</legend>
              <RadioGroup
                value={mode}
                onValueChange={(value) => setMode(value as RouteMode)}
                className="vibe-grid"
                aria-label="Drift mode"
              >
                {modes.map((item) => (
                  <label key={item.value} className={`vibe-option ${mode === item.value ? "selected" : ""}`}>
                    <RadioGroupItem value={item.value} className="sr-only" />
                    {item.value === "surprise" && <Sparkles aria-hidden="true" />}
                    <span>{item.label}</span>
                    {mode === item.value && <Check className="selected-check" aria-hidden="true" />}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          </div>

          <div className="generate-bar">
            <Button onClick={generateDrift} disabled={isGenerating} className="generate-button">
              {isGenerating ? <><RefreshCw className="spin" /> Plotting a better wander…</> : <>Generate drift <ArrowRight /></>}
            </Button>
            <p>Routes are suggestions. Use judgment and follow local signs.</p>
          </div>
        </aside>

        <section className="map-stage" aria-label="Route map">
          <div className="map-paper">
            <svg className="map-svg" viewBox="0 0 760 470" role="img" aria-label={`${route.title} route from ${generatedFrom} to ${route.end}`}>
              <defs>
                <pattern id="minor-grid" width="22" height="22" patternUnits="userSpaceOnUse">
                  <path d="M 22 0 L 0 0 0 22" fill="none" stroke="#a7a69d" strokeOpacity=".16" strokeWidth="1" />
                </pattern>
                <filter id="route-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#ffffff" floodOpacity="1" />
                </filter>
              </defs>
              <rect width="760" height="470" fill="url(#minor-grid)" />
              <path className="waterway" d="M-30 306 C110 266 180 326 272 296 S402 226 510 242 S644 306 790 236" />
              <path className="park-shape" d="M510 36 L700 54 L676 164 L544 142 Z" />
              <path className="park-shape park-small" d="M62 188 L176 168 L196 232 L88 250 Z" />
              {mapRoads.map((road, index) => <path key={index} className={index % 3 === 0 ? "map-road major" : "map-road"} d={road} />)}
              <g className="rail-lines">
                <path d="M20 438 L710 -16" />
                <path d="M28 450 L718 -4" />
              </g>
              <g className="map-labels" aria-hidden="true">
                <text x="80" y="140">CLAPTON</text>
                <text x="272" y="112">HACKNEY DOWNS</text>
                <text x="516" y="90">SPRINGFIELD</text>
                <text x="92" y="328">HOMERTON</text>
                <text x="302" y="372">LONDON FIELDS</text>
                <text x="574" y="330">VICTORIA PARK</text>
                <text x="618" y="215" className="water-label">RIVER LEA</text>
              </g>
              {showRoute && (
                <g className="route-group" filter="url(#route-shadow)">
                  <path className="route-halo" d={route.path} />
                  <path className="route-line" style={{ stroke: route.color }} d={route.path} />
                  <circle className="start-dot" cx="108" cy="384" r="8" />
                  {route.stops.map((stop, index) => {
                    const positions = [[224, 307], [325, 268], [427, 203], [680, 143]][index];
                    return <g key={stop.name} className="stop-marker" transform={`translate(${positions[0]} ${positions[1]})`}>
                      <circle r="13" style={{ fill: route.color }} />
                      <text y="4">{index + 1}</text>
                    </g>;
                  })}
                  <g className="end-marker" transform="translate(682 142)">
                    <path style={{ fill: route.color }} d="M0-15c-8 0-14 6-14 14 0 11 14 24 14 24S14 10 14-1C14-9 8-15 0-15Z" />
                    <circle cy="-1" r="4" fill="#fff" />
                  </g>
                </g>
              )}
            </svg>

            <div className="map-corner-label">TQ 3485</div>
            <div className="map-controls" aria-label="Map controls">
              <button type="button" aria-label="Zoom in">+</button>
              <button type="button" aria-label="Zoom out">−</button>
              <button type="button" aria-label="Centre on location"><Navigation /></button>
            </div>
            <div className="map-key">
              <span><i className="key-route" style={{ background: route.color }} /> Your drift</span>
              <span><i className="key-water" /> Water</span>
              <span><i className="key-park" /> Green space</span>
            </div>
          </div>

          <article className={`route-sheet ${mobilePanel === "route" ? "mobile-active" : ""}`}>
            <button className="mobile-back" onClick={() => setMobilePanel("setup")}><ArrowLeft /> Change drift</button>
            <div className="route-heading-row">
              <div>
                <p className="route-kicker">Your {modes.find((item) => item.value === routeMode)?.label} drift</p>
                <h2>{route.title}</h2>
              </div>
              <div className="route-actions">
                <button type="button" aria-label={saved ? "Remove from saved" : "Save route"} onClick={() => setSaved(!saved)} className={saved ? "is-saved" : ""}><Bookmark fill={saved ? "currentColor" : "none"} /></button>
                <button type="button" aria-label="Share route" onClick={shareRoute}><Share2 /></button>
              </div>
            </div>

            <div className="route-stats">
              <div><strong>{routeDuration - 4}–{routeDuration + 3}</strong><span>minutes</span></div>
              <div><strong>{distance}</strong><span>kilometres</span></div>
              <div><strong>4</strong><span>moments</span></div>
            </div>

            <div className="route-journey">
              <MapPin />
              <p><strong>{generatedFrom}</strong><span>{route.areas.slice(1).join("  ·  ")}</span></p>
              <ArrowRight />
              <strong>{route.end}</strong>
            </div>

            <div className="why-block">
              <p className="eyebrow">Why this route</p>
              <p>{route.why}</p>
            </div>

            <ol className="stops-list">
              {route.stops.map((stop, index) => (
                <li key={stop.name}>
                  <span className="stop-number" style={{ background: route.color }}>{index + 1}</span>
                  <div><strong>{stop.name}</strong><p>{stop.note}</p></div>
                  <time>{Math.max(6, Math.round(stop.minute * routeDuration / 90))} min</time>
                </li>
              ))}
            </ol>

            <div className="route-cta-row">
              <Button className="start-button" onClick={startDrift}><Navigation fill="currentColor" /> Start drift</Button>
              <Button variant="outline" onClick={regenerate} className="regenerate-button"><RefreshCw /> Another route</Button>
            </div>
          </article>
          <output className={`notice ${notice ? "show" : ""}`} aria-live="polite">{notice}</output>
        </section>
      </section>
    </main>
  );
}
