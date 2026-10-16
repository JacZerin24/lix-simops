import type { RadarOverlayPoint, WarningRecord } from "../../types/simulation";

// Geographic window and projection are strictly for the Endymion exercise.
// The route polyline is approximate; no operational GIS precision is claimed.
export type MapBounds = {
  west: number;
  east: number;
  south: number;
  north: number;
};
export type MapPosition = { x: number; y: number };
export const MAP_WIDTH = 1040;
export const MAP_HEIGHT = 540;
export const DEFAULT_BOUNDS: MapBounds = {
  west: -90.22, east: -89.94, south: 29.86, north: 30.065,
};
const LATITUDE_KM = 111.195;
const LONGITUDE_KM = LATITUDE_KM * Math.cos(29.97 * Math.PI / 180);

const validPoint = (point: RadarOverlayPoint) =>
  Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
  point.lat >= -90 && point.lat <= 90 &&
  point.lon >= -180 && point.lon <= 180;

export function cleanRoute(points?: RadarOverlayPoint[]): RadarOverlayPoint[] {
  return (points ?? []).filter(validPoint);
}

export function warningGeometry(warning: WarningRecord): RadarOverlayPoint[] {
  if (warning.followups?.length) {
    for (let i = warning.followups.length - 1; i >= 0; i -= 1) {
      const points = warning.followups[i].points;
      if (points?.length && points.every(validPoint)) return points;
    }
  }
  return (warning.points ?? []).every(validPoint) ? warning.points : [];
}

export function mapBounds(
  route: RadarOverlayPoint[],
  selectedWarning?: WarningRecord,
): MapBounds {
  const selected = selectedWarning ? warningGeometry(selectedWarning) : [];
  if (selected.length < 3) return { ...DEFAULT_BOUNDS };
  const together = [...cleanRoute(route), ...selected];
  const lons = together.map((point) => point.lon);
  const lats = together.map((point) => point.lat);
  const left = Math.min(...lons);
  const right = Math.max(...lons);
  const bottom = Math.min(...lats);
  const top = Math.max(...lats);
  // Center selected footprint with the route, but avoid extreme zoom on
  // tiny WarnGen polygons. Always include enough geography for orientation.
  const widthKm = Math.max((right - left) * LONGITUDE_KM, 28);
  const heightKm = Math.max((top - bottom) * LATITUDE_KM, 22);
  const centerLon = (right + left) / 2;
  const centerLat = (top + bottom) / 2;
  const spanKm = Math.max(widthKm / 0.82, heightKm / 0.82, 30);
  const lonSpan = spanKm * (MAP_WIDTH / MAP_HEIGHT) / LONGITUDE_KM;
  const latSpan = spanKm / LATITUDE_KM;
  return {
    west: centerLon - lonSpan / 2,
    east: centerLon + lonSpan / 2,
    south: centerLat - latSpan / 2,
    north: centerLat + latSpan / 2,
  };
}

export function projectPoint(point: RadarOverlayPoint, bounds: MapBounds): MapPosition {
  return {
    x: ((point.lon - bounds.west) / (bounds.east - bounds.west)) * MAP_WIDTH,
    y: ((bounds.north - point.lat) / (bounds.north - bounds.south)) * MAP_HEIGHT,
  };
}

export function routePath(points: RadarOverlayPoint[], bounds: MapBounds, close = false): string {
  const clean = cleanRoute(points);
  if (!clean.length) return "";
  const path = clean.map((point, index) => {
    const { x, y } = projectPoint(point, bounds);
    return `${index ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  return close ? `${path} Z` : path;
}

export function warningStatus(warning: WarningRecord): "active" | "inactive" {
  return warning.status === "active" ? "active" : "inactive";
}

export function scaleMiles(bounds: MapBounds, pixelWidth: number): number {
  const totalMiles = (bounds.east - bounds.west) * LONGITUDE_KM / 1.609344;
  return totalMiles * pixelWidth / MAP_WIDTH;
}
