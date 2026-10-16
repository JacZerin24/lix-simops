import { useMemo, useState } from "react";
import { feature } from "topojson-client";
import countiesTopology from "us-atlas/counties-10m.json";

import type { RadarOverlayPoint, WarningRecord } from "../../types/simulation";
import { formatExerciseTime } from "../../utils/time";
import {
  cleanRoute, DEFAULT_BOUNDS, MAP_HEIGHT, MAP_WIDTH,
  mapBounds, projectPoint, routePath, scaleMiles, warningGeometry,
} from "./warningMapGeometry";

type Props = {
  warnings: WarningRecord[];
  route?: RadarOverlayPoint[];
  routeNote?: string;
  selectedWarningId: string | null;
  onSelectWarning: (id: string | null) => void;
  onClose: () => void;
};

// Bundled, offline US Census county outlines already used in the Radar view.
// Avoid remote map tiles, authentication, or new network dependencies.
type County = {
  id: string;
  rings: Array<Array<[number, number]>>;
};
const PARISH_IDS = new Set([
  "22051", "22071", "22087", "22089", "22095", "22103",
  "22057", "22075", "22099", "22093", "22063", "22047",
  "22007", "22109", "22005",
]);
function polygonRings(geometry: any): Array<Array<[number, number]>> {
  if (geometry?.type === "Polygon") return geometry.coordinates;
  if (geometry?.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}
const PARISHES: County[] = (() => {
  const topology = countiesTopology as any;
  const geo = feature(topology, topology.objects.counties) as any;
  return geo.features
    .filter((county: any) => PARISH_IDS.has(String(county.id).padStart(5, "0")))
    .map((county: any) => ({
      id: String(county.id),
      rings: polygonRings(county.geometry),
    }));
})();

const LANDMARKS = [
  { name: "New Orleans", lat: 29.9511, lon: -90.0715 },
  { name: "Metairie", lat: 29.9841, lon: -90.1529 },
  { name: "Kenner", lat: 29.9941, lon: -90.2417 },
  { name: "Chalmette", lat: 29.9427, lon: -89.9639 },
  { name: "Slidell", lat: 30.2752, lon: -89.7812 },
  { name: "LaPlace", lat: 30.0666, lon: -90.4801 },
];

function warningColor(hazard: string, active: boolean) {
  if (!active) return "#9babb8";
  return hazard === "TOR" ? "#fb6669" : "#ffbe55";
}

export function DSSWarningMap({
  warnings, route, routeNote, selectedWarningId, onSelectWarning, onClose,
}: Props) {
  const [showPast, setShowPast] = useState(false);
  const selected = warnings.find((warning) => warning.id === selectedWarningId);
  const bounds = useMemo(
    () => selected ? mapBounds(cleanRoute(route), selected) : { ...DEFAULT_BOUNDS },
    [route, selected],
  );
  const visibleWarnings = warnings.filter(
    (warning) => warning.status === "active" || showPast || warning.id === selectedWarningId,
  );
  const sortedWarnings = [...warnings].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    return Date.parse(b.issued_at) - Date.parse(a.issued_at);
  });
  const routePoints = cleanRoute(route);
  const parishPaths = useMemo(() =>
    PARISHES.flatMap((parish) => parish.rings.map((ring, i) => ({
      key: `${parish.id}-${i}`,
      d: routePath(ring.map(([lon, lat]) => ({ lat, lon })), bounds, true),
    }))).filter((item) => item.d),
  [bounds]);
  const pin = (point: RadarOverlayPoint) => projectPoint(point, bounds);
  const routeD = routePath(routePoints, bounds);
  const scaleLength = 120;
  const miles = scaleMiles(bounds, scaleLength);

  return (
    <section className="dss-warning-map-panel" aria-label="Read-only DSS warning footprint map">
      <header className="dss-map-heading">
        <div>
          <span className="dss-map-eyebrow">DSS Situation Awareness</span>
          <h3>Warning Footprints &amp; Parade Route</h3>
          <p className="muted">
            Read-only exercise map · Your team's issued warnings update automatically.
            Select a warning to focus its polygon.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close warning map">Close map ×</button>
      </header>
      <div className="dss-map-layout">
        <div className="dss-map-stage">
          <svg className="dss-warning-svg" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            role="img" aria-label="Geographic overview of Endymion route and team warning polygons"
            preserveAspectRatio="xMidYMid meet">
            <defs>
              <clipPath id="dss-map-clip"><rect width={MAP_WIDTH} height={MAP_HEIGHT} /></clipPath>
              <pattern id="dss-map-grid" width="70" height="70" patternUnits="userSpaceOnUse">
                <path d="M 70 0 L 0 0 0 70" fill="none" stroke="#4f687a" strokeWidth="0.5" opacity="0.18" />
              </pattern>
            </defs>
            <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="#0c283b" />
            <g clipPath="url(#dss-map-clip)">
              {parishPaths.map((parish) => (
                <path key={parish.key} d={parish.d}
                  fill="#183c4e" stroke="#608297" strokeOpacity="0.60" strokeWidth="1.4" />
              ))}
              <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#dss-map-grid)" />
              {LANDMARKS.map((landmark) => {
                const p = pin(landmark);
                if (p.x < 15 || p.x > MAP_WIDTH - 90 || p.y < 20 || p.y > MAP_HEIGHT - 20) return null;
                return <g key={landmark.name}>
                  <circle cx={p.x} cy={p.y} r="3.4" fill="#d1e3ec" />
                  <text x={p.x + 9} y={p.y - 8} fill="#c2d7e6" fontSize="17" fontWeight="500">
                    {landmark.name}
                  </text>
                </g>;
              })}
              {visibleWarnings.map((warning) => {
                const path = routePath(warningGeometry(warning), bounds, true);
                if (!path) return null;
                const active = warning.status === "active";
                const isSelected = selectedWarningId === warning.id;
                const color = warningColor(warning.hazard, active);
                return <path key={warning.id} d={path} fill={color}
                  fillOpacity={active ? (isSelected ? 0.25 : 0.12) : 0.035}
                  stroke={color} strokeWidth={isSelected ? 5 : 3}
                  strokeDasharray={active ? undefined : "10 7"}
                  opacity={isSelected || !selectedWarningId ? 1 : 0.6}
                  strokeLinejoin="round" />;
              })}
              {routeD && (
                <>
                  <path d={routeD} fill="none" stroke="#05131f" strokeWidth="11"
                    strokeLinecap="round" strokeLinejoin="round" />
                  <path d={routeD} fill="none" stroke="#49e0f2" strokeWidth="5"
                    strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx={pin(routePoints[0]).x} cy={pin(routePoints[0]).y}
                    r="8" fill="#49e0f2" stroke="#061f2c" strokeWidth="3" />
                  <circle cx={pin(routePoints[routePoints.length-1]).x}
                    cy={pin(routePoints[routePoints.length-1]).y}
                    r="7" fill="#f5faff" stroke="#061f2c" strokeWidth="3" />
                </>
              )}
              <rect x="20" y={MAP_HEIGHT-80} width="166" height="55" rx="6" fill="#081d2b" fillOpacity="0.9" />
              <line x1="35" y1={MAP_HEIGHT-45} x2={35+scaleLength}
                y2={MAP_HEIGHT-45} stroke="#e9f5fb" strokeWidth="3" />
              <line x1="35" y1={MAP_HEIGHT-51} x2="35" y2={MAP_HEIGHT-39} stroke="#e9f5fb" strokeWidth="2" />
              <line x1={35+scaleLength} y1={MAP_HEIGHT-51} x2={35+scaleLength}
                y2={MAP_HEIGHT-39} stroke="#e9f5fb" strokeWidth="2" />
              <text x="36" y={MAP_HEIGHT-57} fontSize="16" fill="#e9f5fb">{miles.toFixed(1)} mi (approx.)</text>
              <text x={MAP_WIDTH-37} y="38" fill="#d9e8f2" fontWeight="700" fontSize="19">N ↑</text>
            </g>
          </svg>
          <div className="dss-map-legend">
            <span><i className="dss-legend-line route" />Approximate Endymion route</span>
            <span><i className="dss-legend-line tor" />Tornado Warning</span>
            <span><i className="dss-legend-line svr" />Severe Thunderstorm Warning</span>
            <span><i className="dss-legend-line past" />Expired / cancelled</span>
          </div>
          <p className="dss-map-disclaimer">
            {routeNote ?? "Training-only route approximation."} Polygon overlap is a visual reference,
            not a surveyed GIS determination. Check the full parade/staging footprint and warning text.
          </p>
        </div>
        <aside className="dss-map-warning-list" aria-label="Team warning selection">
          <div className="dss-map-list-header">
            <strong>Team Warnings</strong>
            <button type="button" onClick={() => onSelectWarning(null)}>Full route</button>
          </div>
          <label className="dss-map-past-toggle">
            <input type="checkbox" checked={showPast}
              onChange={(e) => setShowPast(e.target.checked)} />
            Show expired / cancelled
          </label>
          {sortedWarnings.filter((warning) => warning.status === "active" || showPast ||
            warning.id === selectedWarningId).length === 0 && (
            <p className="muted">No issued warnings for this team yet. The parade route remains available.</p>
          )}
          {sortedWarnings.filter((warning) => warning.status === "active" || showPast ||
            warning.id === selectedWarningId).map((warning) => (
            <button type="button" key={warning.id}
              className={`dss-map-warning-button${selectedWarningId === warning.id ? " selected" : ""}`}
              onClick={() => onSelectWarning(warning.id)}
              aria-pressed={selectedWarningId === warning.id}>
              <span className="dss-map-warning-top">
                <b className={`dss-map-hazard ${warning.hazard === "TOR" ? "tor" : "svr"}`}>
                  {warning.hazard}
                </b>
                <span className={warning.status === "active" ? "dss-map-status-active" : "dss-map-status-past"}>
                  {warning.status}
                </span>
              </span>
              <strong>{warning.label}</strong>
              <small>Issued {formatExerciseTime(warning.issued_at, "—")}</small>
              <small>Expires {formatExerciseTime(warning.expires_at, "—")}</small>
            </button>
          ))}
          {selected && (
            <div className="dss-map-selected-detail">
              <strong>Selected: {selected.label}</strong>
              <p>{selected.status === "active"
                ? "Active warning polygon shown in color."
                : "Historical warning shown dashed; not currently active."}</p>
              {selected.text && (
                <details>
                  <summary>Issued warning text</summary>
                  <pre>{selected.text}</pre>
                </details>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
