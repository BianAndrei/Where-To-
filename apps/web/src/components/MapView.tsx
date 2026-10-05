import { useEffect, useRef, useState } from "react";
import { ArrowsOut, MapPin } from "@phosphor-icons/react";
import type { Place, TripItem } from "@whereto/shared";
import { mapItems } from "@whereto/shared";
import { useQuery } from "@tanstack/react-query";
import { api, type Features } from "../lib/api";
import { Doodle } from "./Doodle";
export default function MapView({
  items,
  destinations,
  demo = false,
  activeId,
  onSelect,
  onPick,
  publicToken,
}: {
  items: TripItem[];
  destinations: Place[];
  demo?: boolean;
  activeId?: string;
  onSelect?: (id: string) => void;
  onPick?: (p: { lat: number; lon: number }) => void;
  publicToken?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => api<Features>("/config"),
  });
  const points = mapItems(items);
  const enabled = !!config?.maps && !demo && !failed;
  useEffect(() => {
    if (!enabled || !container.current) return;
    let destroyed = false;
    let map: any;
    void Promise.all([
      import("maplibre-gl"),
      import("maplibre-gl/dist/maplibre-gl.css"),
    ])
      .then(([lib]) => {
        if (destroyed) return;
        const first = points[0]?.location ?? destinations[0];
        const style = {
          version: 8,
          sources: {
            basemap: {
              type: "raster",
              tiles: [
                `${window.location.origin}/api/v1/maps/tiles/{z}/{x}/{y}${publicToken ? `?share=${encodeURIComponent(publicToken)}` : ""}`,
              ],
              tileSize: 256,
              attribution:
                '© <a href="https://www.geoapify.com/">Geoapify</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
          },
          layers: [{ id: "basemap", type: "raster", source: "basemap" }],
        };
        map = new lib.Map({
          container: container.current!,
          style: style as any,
          center: first ? [first.lon, first.lat] : [0, 0],
          zoom: first ? 12 : 2,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.on("load", () => {
          const segments = items
            .filter(
              (i) => i.kind === "flight" && !i.deletedAt && i.state !== "idea",
            )
            .flatMap((i) => i.flight?.segments ?? [])
            .filter((s) => s.departure.airport && s.arrival.airport);
          if (segments.length) {
            map.addSource("flight-segments", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: segments.map((s) => ({
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: [
                      [s.departure.airport!.lon, s.departure.airport!.lat],
                      [s.arrival.airport!.lon, s.arrival.airport!.lat],
                    ],
                  },
                })),
              },
            });
            map.addLayer({
              id: "flight-segments",
              type: "line",
              source: "flight-segments",
              paint: {
                "line-color": "#729ab9",
                "line-width": 2,
                "line-dasharray": [3, 3],
              },
            });
          }
        });
        map.addControl(
          new lib.NavigationControl({ showCompass: false }),
          "top-right",
        );
        let failures = 0;
        map.on("error", () => {
          if (++failures >= 2) setFailed(true);
        });
        map.on("click", (e: any) =>
          onPick?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }),
        );
        const bounds = new lib.LngLatBounds();
        points.forEach((item, i) => {
          const p = item.location!;
          const el = document.createElement("button");
          el.className = `map-marker ${activeId === item.parentId ? "active" : ""}`;
          el.textContent = String(i + 1);
          el.setAttribute("aria-label", item.title);
          el.onclick = (e) => {
            e.stopPropagation();
            onSelect?.(item.parentId);
          };
          new lib.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
          bounds.extend([p.lon, p.lat]);
        });
        if (points.length > 1)
          map.fitBounds(bounds, { padding: 65, maxZoom: 14, duration: 0 });
      })
      .catch(() => setFailed(true));
    return () => {
      destroyed = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [
    enabled,
    JSON.stringify(points.map((i) => [i.id, i.location, activeId])),
    publicToken,
  ]);
  const positions = points.length
    ? points.map((i) => i.location!)
    : destinations;
  const minLon = Math.min(...positions.map((p) => p.lon)),
    maxLon = Math.max(...positions.map((p) => p.lon)),
    minLat = Math.min(...positions.map((p) => p.lat)),
    maxLat = Math.max(...positions.map((p) => p.lat));
  const project = (p: Place, i: number) => ({
    x: 80 + ((p.lon - minLon) / Math.max(0.012, maxLon - minLon)) * 330,
    y:
      65 +
      ((maxLat - p.lat) / Math.max(0.012, maxLat - minLat)) * 270 +
      (i % 2) * 12,
  });
  return (
    <div className="map-panel">
      <div className="map-panel-header">
        <span>
          <MapPin size={18} />{" "}
          {demo ? "Explore the area" : "Your places, together"}
        </span>
        <button
          className="icon-button"
          aria-label="Fit map to places"
          onClick={() => {
            if (mapRef.current && points.length)
              mapRef.current.fitBounds(
                [
                  [minLon, minLat],
                  [maxLon, maxLat],
                ],
                { padding: 60, maxZoom: 14 },
              );
          }}
        >
          <ArrowsOut size={19} />
        </button>
      </div>
      {enabled ? (
        <div ref={container} className="live-map" />
      ) : (
        <div className="sketch-map">
          <svg
            viewBox="0 0 500 430"
            aria-label={
              demo
                ? "Illustrative example map"
                : "Location sketch of your stops; street map unavailable"
            }
          >
            <defs>
              <pattern
                id="map-grid"
                width="55"
                height="55"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M55 0H0V55"
                  fill="none"
                  stroke="#dbded2"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="500" height="430" fill="#f1f2e8" />
            <rect width="500" height="430" fill="url(#map-grid)" />
            <path
              d="M-30 335c115-125 235 135 560-45"
              fill="none"
              stroke="#cbdfeb"
              strokeWidth="55"
            />
            <path d="M390 25c-70 10-90 65-40 90s90-10 86-46" fill="#dce8d2" />
            <path
              d="m0 125 500 70M115 0l35 430m120-430 10 430"
              stroke="#fffdf8"
              strokeWidth="18"
              fill="none"
            />
            {points.length > 1 && (
              <path
                d={points
                  .map((item, i) => {
                    const p = project(item.location!, i);
                    return `${i === 0 ? "M" : "L"}${p.x} ${p.y}`;
                  })
                  .join(" ")}
                stroke="#bd8279"
                fill="none"
                strokeDasharray="5 7"
                strokeWidth="2.5"
              />
            )}
            {points.map((item, i) => {
              const p = project(item.location!, i);
              return (
                <g
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-label={item.title}
                  onClick={() => onSelect?.(item.parentId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect?.(item.parentId);
                    }
                  }}
                  className="sketch-pin"
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={activeId === item.parentId ? 20 : 17}
                    fill={
                      activeId === item.parentId
                        ? "#292823"
                        : item.kind === "flight"
                          ? "#729ab9"
                          : "#d9938a"
                    }
                    stroke="#fffdf8"
                    strokeWidth="4"
                  />
                  <text
                    x={p.x}
                    y={p.y + 5}
                    textAnchor="middle"
                    fill="#fffdf8"
                    fontSize="14"
                    fontWeight="700"
                  >
                    {i + 1}
                  </text>
                </g>
              );
            })}
            {!points.length && (
              <text
                x="250"
                y="215"
                textAnchor="middle"
                fill="#6b7165"
                fontSize="15"
              >
                Your next stop goes here.
              </text>
            )}
            <text x="20" y="410" fill="#697166" fontSize="10">
              {demo
                ? "ILLUSTRATIVE DEMO MAP"
                : "LOCATION SKETCH · NOT A STREET MAP"}
            </text>
          </svg>
          <span className="map-doodle">
            <Doodle name="sun" colour="#FFD69A" />
          </span>
        </div>
      )}
      <div className="map-panel-footer">
        <span className="status-dot" />
        {points.length} {points.length === 1 ? "stop" : "stops"}{" "}
        {enabled
          ? "· © OpenStreetMap"
          : demo
            ? "· Example trip"
            : "· Connect map services for streets and routes"}
      </div>
      {points.some((p) => p.kind === "flight") && (
        <ol className="flight-map-legend" aria-label="Airports on this map">
          {points.map((p, i) =>
            p.kind === "flight" ? (
              <li key={p.id}>
                <button type="button" onClick={() => onSelect?.(p.parentId)}>
                  <b>{i + 1}</b> {p.location?.name}
                </button>
              </li>
            ) : null,
          )}
          <li>
            <small>
              Lines connect booked airports; they are not the aircraft's live
              path.
            </small>
          </li>
        </ol>
      )}
    </div>
  );
}
