"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { DriftRoute } from "@/lib/london";
import { modeDetails } from "@/lib/london";

type Props = { route: DriftRoute | null };

const osmStyle = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

function boundsFor(coordinates: number[][]) {
  return coordinates.reduce(
    (bounds, [lng, lat]) => ({
      west: Math.min(bounds.west, lng),
      south: Math.min(bounds.south, lat),
      east: Math.max(bounds.east, lng),
      north: Math.max(bounds.north, lat),
    }),
    { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity },
  );
}

function PreviewMap({ route }: { route: DriftRoute }) {
  const points = route.geometry.coordinates as number[][];
  const bounds = boundsFor(points);
  const width = Math.max(bounds.east - bounds.west, 0.001);
  const height = Math.max(bounds.north - bounds.south, 0.001);
  const project = ([lng, lat]: number[]) => [
    44 + ((lng - bounds.west) / width) * 712,
    456 - ((lat - bounds.south) / height) * 412,
  ];
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${project(point).join(" ")}`).join(" ");
  const colour = modeDetails[route.mode].colour;

  return (
    <svg className="preview-map" viewBox="0 0 800 500" role="img" aria-label="Preview of the generated walking route">
      <defs>
        <pattern id="paper-grid" width="42" height="42" patternUnits="userSpaceOnUse">
          <path d="M 42 0 L 0 0 0 42" fill="none" stroke="#d5d0c2" strokeWidth="1" />
        </pattern>
        <filter id="route-shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity=".18" /></filter>
      </defs>
      <rect width="800" height="500" fill="#ece9df" />
      <rect width="800" height="500" fill="url(#paper-grid)" />
      <g className="preview-roads">
        <path d="M-30 140 C180 80 280 190 490 120 S680 112 850 40" />
        <path d="M34 430 C190 390 266 300 420 350 S658 340 824 208" />
        <path d="M140 -20 C116 132 220 224 184 520" />
        <path d="M520 -20 C500 106 584 220 548 520" />
      </g>
      <path d={path} fill="none" stroke="#fffaf0" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" filter="url(#route-shadow)" />
      <path d={path} fill="none" stroke={colour} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      {route.stops.map((stop, index) => {
        const [x, y] = project(stop.coordinates);
        return <g key={`${stop.name}-${index}`}><circle cx={x} cy={y} r="12" fill="#fffaf0" stroke={colour} strokeWidth="3" /><text x={x} y={y + 4} textAnchor="middle">{index + 1}</text></g>;
      })}
      {([points[0], points.at(-1)!] as number[][]).map((point, index) => {
        const [x, y] = project(point);
        return <circle key={index} cx={x} cy={y} r="8" fill={index === 0 ? "#18221e" : colour} stroke="#fffaf0" strokeWidth="3" />;
      })}
      <text x="28" y="474" className="preview-label">PREVIEW MAP · ADD MAPTILER FOR LIVE STREETS</text>
    </svg>
  );
}

export function DriftMap({ route }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const geometryKey = useMemo(() => route?.geometry.coordinates.flat().join(",") ?? "", [route]);

  useEffect(() => {
    if (!mapKey || !route || !containerRef.current) return;
    let cancelled = false;

    import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !containerRef.current) return;
      const coordinates = route.geometry.coordinates as number[][];
      const bounds = boundsFor(coordinates);
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapKey}`,
        center: route.start.coordinates,
        zoom: 13,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      let routeAdded = false;
      let usingFallback = false;
      const addRoute = () => {
        if (routeAdded) return;
        routeAdded = true;
        map.addSource("drift-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: route.geometry } });
        map.addLayer({ id: "drift-outline", type: "line", source: "drift-route", paint: { "line-color": "#fffaf0", "line-width": 10, "line-opacity": 0.92 } });
        map.addLayer({ id: "drift-line", type: "line", source: "drift-route", paint: { "line-color": modeDetails[route.mode].colour, "line-width": 6 } });
        new maplibregl.Marker({ color: "#18221e" }).setLngLat(route.start.coordinates).addTo(map);
        route.stops.forEach((stop, index) => {
          const marker = document.createElement("div");
          marker.className = "map-number-marker";
          marker.textContent = String(index + 1);
          new maplibregl.Marker({ element: marker }).setLngLat(stop.coordinates).addTo(map);
        });
        map.fitBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { padding: 64, duration: 0 });
      };
      map.on("load", addRoute);
      map.on("error", (event) => {
        const message = event.error?.message?.toLowerCase() ?? "";
        if (mapKey && !usingFallback && /401|403|404|style|tile|source/.test(message)) {
          usingFallback = true;
          routeAdded = false;
          map.setStyle(osmStyle);
          map.once("style.load", addRoute);
        }
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapKey, route, geometryKey]);

  if (!route) {
    return <div className="map-empty"><span>LD</span><p>Your route will appear here.</p></div>;
  }
  if (!mapKey) return <PreviewMap route={route} />;
  return <div ref={containerRef} className="live-map" aria-label="Interactive route map" />;
}
