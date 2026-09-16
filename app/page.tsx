"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock3, Compass, Crosshair, Footprints, LocateFixed, MapPin, Navigation, RefreshCw, Share2, Sparkles } from "lucide-react";
import { DriftMap } from "@/components/drift-map";
import { fallbackPlaces, modeDetails, type DriftRoute, type PlaceSuggestion } from "@/lib/london";
import type { DriftMode } from "@/lib/drift-engine";

const durations = [30, 60, 90, 120];
const modes = Object.entries(modeDetails) as [DriftMode, (typeof modeDetails)[DriftMode]][];

export default function Home() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>(fallbackPlaces.slice(0, 5));
  const [selectedStart, setSelectedStart] = useState<PlaceSuggestion | null>(null);
  const [duration, setDuration] = useState(60);
  const [mode, setMode] = useState<DriftMode>("surprise");
  const [route, setRoute] = useState<DriftRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || query.trim().length < 2 || selectedStart?.name === query) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const body = await response.json() as { results?: PlaceSuggestion[] };
        if (response.ok) setSuggestions(body.results ?? []);
      } catch (fetchError) {
        if ((fetchError as Error).name !== "AbortError") setSuggestions([]);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, open, selectedStart]);

  function chooseStart(place: PlaceSuggestion) {
    setSelectedStart(place);
    setQuery(place.name);
    setOpen(false);
    setError("");
  }

  async function locateMe() {
    setError("");
    if (!navigator.geolocation) {
      setError("This browser cannot share a location. Search for a station, address or neighbourhood instead.");
      return;
    }

    if (!window.isSecureContext) {
      setError("Location sharing needs a secure connection. Open the https://london-drift.vercel.app address and try again.");
      return;
    }

    try {
      const permission = await navigator.permissions?.query({ name: "geolocation" });
      if (permission?.state === "denied") {
        setError("Location permission is blocked for this site. Allow Location in your browser settings, then try again.");
        return;
      }
    } catch {
      // Some browsers do not expose the Permissions API; getCurrentPosition still works.
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const response = await fetch(`/api/geocode?lat=${coords.latitude}&lon=${coords.longitude}`);
          const body = await response.json() as { results?: PlaceSuggestion[] };
          const place = body.results?.[0] ?? { id: "current-location", name: "My current location", context: "London", coordinates: [coords.longitude, coords.latitude] as [number, number] };
          chooseStart(place);
        } catch {
          chooseStart({ id: "current-location", name: "My current location", context: "London", coordinates: [coords.longitude, coords.latitude] as [number, number] });
        } finally {
          setLocating(false);
        }
      },
      (positionError) => {
        setLocating(false);
        if (positionError.code === 1) setError("Location permission was denied. Allow Location for this site, then try again—or search for a place instead.");
        else if (positionError.code === 3) setError("Location took too long to find. Try again, or search for a station, address or neighbourhood.");
        else setError("Location was not available. Search for a station, address or neighbourhood instead.");
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 15_000 },
    );
  }

  async function generate() {
    if (!selectedStart) {
      setError("Choose a starting point from the dropdown first.");
      setOpen(true);
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch("/api/drift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: selectedStart, duration, mode }),
        signal: controller.signal,
      });
      const body = await response.json() as { drift?: DriftRoute; error?: string };
      if (!response.ok) throw new Error(body.error || "The route could not be generated.");
      if (!body.drift) throw new Error("The route response was incomplete.");
      setRoute(body.drift);
      window.setTimeout(() => document.getElementById("route")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
    } catch (generateError) {
      if ((generateError as Error).name !== "AbortError") setError((generateError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function share() {
    const text = route ? `${route.title} — ${route.durationMinutes} min London Drift from ${route.start.name}` : "London Drift";
    if (navigator.share) await navigator.share({ title: "London Drift", text, url: window.location.href });
    else { await navigator.clipboard.writeText(`${text}\n${window.location.href}`); setCopied(true); }
  }

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="London Drift home"><span>LD</span> London Drift</a>
        <p>Take the long way.</p>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><Compass size={16} /> Exploratory walks across London</div>
        <h1>Give me a London<br />walk I wouldn’t<br /><em>normally take.</em></h1>
        <p className="hero-copy">Routes tuned for curiosity, urban texture and your available time—not simply the shortest path.</p>
      </section>

      <section className="route-builder" aria-labelledby="builder-title">
        <div className="section-number">01</div>
        <div className="builder-content">
          <h2 id="builder-title">Build a drift</h2>
          <div className="field-group">
            <label htmlFor="start">Starting point</label>
            <div className="search-row">
              <div className="combobox-wrap">
                <MapPin size={19} aria-hidden="true" />
                <input id="start" role="combobox" aria-expanded={open} aria-controls="start-options" aria-autocomplete="list" value={query}
                  onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setSelectedStart(null); setOpen(true); }}
                  onKeyDown={(event) => { if (event.key === "Enter" && suggestions[0]) { event.preventDefault(); chooseStart(suggestions[0]); } if (event.key === "Escape") setOpen(false); }}
                  placeholder="Station, address or neighbourhood" autoComplete="off" />
                {open && (
                  <div className="suggestions" id="start-options" role="listbox">
                    {suggestions.length ? suggestions.map((place) => (
                      <button key={place.id} type="button" role="option" aria-selected={selectedStart?.id === place.id} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseStart(place)}>
                        <MapPin size={16} /><span><strong>{place.name}</strong><small>{place.context}</small></span>
                      </button>
                    )) : <p>No London matches yet.</p>}
                  </div>
                )}
              </div>
              <button className="locate-button" type="button" onClick={locateMe} disabled={locating} aria-busy={locating}><LocateFixed size={18} /> {locating ? "Finding you…" : "Use my location"}</button>
            </div>
          </div>

          <div className="field-group">
            <span className="field-label">How long?</span>
            <div className="duration-options" role="group" aria-label="Route duration">
              {durations.map((minutes) => <button className={duration === minutes ? "active" : ""} key={minutes} type="button" onClick={() => setDuration(minutes)}>{minutes}<small>min</small></button>)}
            </div>
            <p className="field-hint">Longer walks get more distance and more route moments—never the same four stops stretched out.</p>
          </div>

          <div className="field-group">
            <span className="field-label">What kind of drift?</span>
            <div className="mode-options" role="radiogroup" aria-label="Drift style">
              {modes.map(([value, detail]) => <button key={value} type="button" role="radio" aria-checked={mode === value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}>{mode === value && <Check size={14} />}{detail.label}</button>)}
            </div>
          </div>

          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="generate-button" type="button" onClick={generate} disabled={loading}>
            {loading ? <><RefreshCw className="spin" size={19} /> Finding the interesting way…</> : <><Sparkles size={19} /> Generate my drift <ArrowRight size={19} /></>}
          </button>
        </div>
      </section>

      <section className="route-output" id="route" aria-live="polite">
        <div className="map-panel"><DriftMap route={route} /></div>
        <article className="route-sheet">
          {route ? (
            <>
              <div className="route-kicker"><span style={{ background: modeDetails[route.mode].colour }} /> {modeDetails[route.mode].label} · {route.provider === "preview" ? "Preview streets" : "Live walkable route"}</div>
              <h2>{route.title}</h2>
              <p className="route-summary">{route.summary}</p>
              <div className="route-stats">
                <div><Clock3 size={18} /><strong>{route.durationMinutes}</strong><span>minutes</span></div>
                <div><Footprints size={18} /><strong>{(route.distanceMetres / 1000).toFixed(1)}</strong><span>kilometres</span></div>
                <div><MapPin size={18} /><strong>{route.stops.length}</strong><span>moments</span></div>
              </div>
              <div className="route-ends"><p><small>Start</small>{route.start.name}</p><ArrowRight size={18} /><p><small>Finish near</small>{route.end}</p></div>
              <ol className="stops">
                {route.stops.map((stop, index) => <li key={`${stop.name}-${index}`}><span style={{ borderColor: modeDetails[route.mode].colour }}>{index + 1}</span><div><strong>{stop.name}</strong><p>{stop.note}</p></div><small>{stop.minute} min</small></li>)}
              </ol>
              <div className="route-actions">
                <button type="button" onClick={generate}><RefreshCw size={17} /> Another route</button>
                <button type="button" onClick={share}><Share2 size={17} /> {copied ? "Copied" : "Share"}</button>
                <a href={`https://www.google.com/maps/dir/?api=1&origin=${route.start.coordinates[1]},${route.start.coordinates[0]}&destination=${route.geometry.coordinates.at(-1)?.[1]},${route.geometry.coordinates.at(-1)?.[0]}&travelmode=walking`} target="_blank" rel="noreferrer"><Navigation size={17} /> Open directions</a>
              </div>
            </>
          ) : <div className="route-placeholder"><Crosshair size={24} /><p>Choose a start, a time and a mood. Your generated route—not a canned example—will land here.</p></div>}
        </article>
      </section>

      <footer><span>LD</span><p>Built for wandering, not optimisation.</p><p>London · Alpha</p></footer>
    </main>
  );
}
