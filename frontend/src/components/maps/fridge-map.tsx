"use client";

/**
 * Interactive MapLibre map of community fridges. Tiles come from OpenFreeMap (no API key).
 * If tiles fail to load, the parent should show a list view; this component reports `onTileError`.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  FullscreenControl,
  setWorkerUrl,
  type GeoJSONSource,
  type ErrorEvent,
} from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { Fridge, GeoPoint } from "@/types";
import { cn } from "@/lib/utils";

// The worker is served from /public (copied by scripts/copy-maplibre-worker.mjs) because bundlers
// cannot resolve MapLibre's worker relative to the bundled module.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
  "https://tiles.openfreemap.org/styles/positron";

export interface FridgeMapProps {
  fridges: Fridge[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  center?: GeoPoint;
  radiusKm?: number;
  className?: string;
  onTileError?: () => void;
  territories?: GeoJSON.FeatureCollection;
  fitAllTrigger?: number;
  /** Fridges whose precise location is hidden get a wider, softer marker. */
  approximateIds?: string[];
}

function markerElement(
  fridge: Fridge,
  selected: boolean,
  approximate: boolean,
) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = cn(
    "fridge-marker group relative flex items-center justify-center rounded-full border-2 bg-card shadow-raised transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-evergreen",
    selected
      ? "size-9 scale-110 border-evergreen"
      : "size-7 border-card hover:scale-110",
  );
  el.setAttribute("aria-label", `${fridge.name}, ${fridge.status}`);
  const dot = document.createElement("span");
  dot.className = cn(
    "block rounded-[2px]",
    selected ? "size-3" : "size-2.5",
    fridge.status === "online"
      ? "bg-evergreen"
      : fridge.status === "degraded"
        ? "bg-amber"
        : "bg-critical",
  );
  el.appendChild(dot);
  if (approximate) {
    const ring = document.createElement("span");
    ring.className =
      "pointer-events-none absolute -inset-4 rounded-full border border-dashed border-sensor/60 bg-sensor/5";
    el.appendChild(ring);
  }
  return el;
}

export function FridgeMap({
  fridges,
  selectedId,
  onSelect,
  center,
  radiusKm,
  className,
  onTileError,
  territories,
  fitAllTrigger,
  approximateIds = [],
}: FridgeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const onSelectRef = useRef(onSelect);
  const lastSelection = useRef<string | null>(null);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Initialize map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initial = center ??
      fridges[0]?.location ?? { lat: 29.7426, lng: -95.3906 };
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [initial.lng, initial.lat],
      zoom: 11.4,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new FullscreenControl(), "top-right");
    map.on("error", (e: ErrorEvent) => {
      const status = (e as { error?: { status?: number } }).error?.status;
      if (status && status >= 400) onTileError?.();
    });
    if (territories && fridges.length) {
      const lngs = fridges.map((f) => f.location.lng),
        lats = fridges.map((f) => f.location.lat);
      map.fitBounds(
        [
          [Math.min(...lngs) - 0.008, Math.min(...lats) - 0.008],
          [Math.max(...lngs) + 0.008, Math.max(...lats) + 0.008],
        ],
        { padding: 30, duration: 0 },
      );
      lastSelection.current = selectedId ?? null;
    }
    mapRef.current = map;
    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !territories) return;
    const draw = () => {
      const source = map.getSource("territories") as GeoJSONSource | undefined;
      if (source) source.setData(territories);
      else {
        map.addSource("territories", { type: "geojson", data: territories });
        map.addLayer({
          id: "territories-fill",
          type: "fill",
          source: "territories",
          filter: ["==", ["get", "kind"], "cell"],
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": 0.35,
            "fill-opacity-transition": { duration: 650 },
          },
        });
        map.addLayer({
          id: "territories-grid",
          type: "line",
          source: "territories",
          filter: ["==", ["get", "kind"], "cell"],
          paint: {
            "line-color": "#ffffff",
            "line-width": 0.5,
            "line-opacity": 0.35,
          },
        });
        map.addLayer({
          id: "territories-border",
          type: "line",
          source: "territories",
          filter: ["==", ["get", "kind"], "edge"],
          paint: { "line-color": ["get", "color"], "line-width": 3 },
        });
        map.addLayer({
          id: "territories-label",
          type: "symbol",
          source: "territories",
          filter: ["==", ["get", "kind"], "label"],
          layout: {
            "text-field": ["get", "name"],
            "text-size": 13,
            "text-font": ["Noto Sans Regular"],
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": ["get", "color"],
            "text-halo-color": "#ffffff",
            "text-halo-width": 2,
          },
        });
      }
    };
    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
    return () => {
      map.off("load", draw);
    };
  }, [territories]);

  // Sync markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const existing = markersRef.current;
    const ids = new Set(fridges.map((f) => f.id));
    for (const [id, marker] of existing) {
      if (!ids.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    }
    for (const fridge of fridges) {
      existing.get(fridge.id)?.remove();
      const el = markerElement(
        fridge,
        fridge.id === selectedId,
        approximateIds.includes(fridge.id),
      );
      el.addEventListener("click", () => onSelectRef.current?.(fridge.id));
      const marker = new Marker({ element: el, anchor: "center" })
        .setLngLat([fridge.location.lng, fridge.location.lat])
        .addTo(map);
      existing.set(fridge.id, marker);
    }
  }, [fridges, selectedId, approximateIds]);

  // Fly to selection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId || lastSelection.current === selectedId) return;
    lastSelection.current = selectedId;
    const f = fridges.find((x) => x.id === selectedId);
    if (f)
      map.easeTo({
        center: [f.location.lng, f.location.lat],
        zoom: Math.max(map.getZoom(), 12.5),
        duration: 600,
      });
  }, [selectedId, fridges]);

  useEffect(() => {
    if (!mapRef.current || !fitAllTrigger || !fridges.length) return;
    const lngs = fridges.map((f) => f.location.lng),
      lats = fridges.map((f) => f.location.lat);
    mapRef.current.fitBounds(
      [
        [Math.min(...lngs) - 0.008, Math.min(...lats) - 0.008],
        [Math.max(...lngs) + 0.008, Math.max(...lats) + 0.008],
      ],
      { padding: 30, duration: 500 },
    );
    // A reset is user-triggered, never tied to the five-second data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitAllTrigger]);

  // Search radius circle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const draw = () => {
      const src = map.getSource("radius") as GeoJSONSource | undefined;
      const data = radiusKm
        ? circlePolygon(center, radiusKm)
        : { type: "FeatureCollection" as const, features: [] };
      if (src) src.setData(data);
      else {
        map.addSource("radius", { type: "geojson", data });
        map.addLayer({
          id: "radius-fill",
          type: "fill",
          source: "radius",
          paint: { "fill-color": "#427da8", "fill-opacity": 0.06 },
        });
        map.addLayer({
          id: "radius-line",
          type: "line",
          source: "radius",
          paint: {
            "line-color": "#427da8",
            "line-width": 1,
            "line-dasharray": [2, 2],
          },
        });
      }
    };
    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [center, radiusKm]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full rounded-lg", className)}
      role="region"
      aria-label="Map of community fridges"
    />
  );
}

function circlePolygon(
  center: GeoPoint,
  km: number,
  points = 64,
): GeoJSON.FeatureCollection {
  const coords: [number, number][] = [];
  const latR = km / 110.574;
  const lngR = km / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    coords.push([
      center.lng + lngR * Math.cos(a),
      center.lat + latR * Math.sin(a),
    ]);
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [coords] },
      },
    ],
  };
}
