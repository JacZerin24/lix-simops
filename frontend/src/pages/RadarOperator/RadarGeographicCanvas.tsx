import {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { feature } from "topojson-client";
import countiesTopology from "us-atlas/counties-10m.json";

import type { RadarEventMarker, RadarFrame, RadarGridMetadata, RadarPointOverlay, RadarProductSummary, RadarWarningOverlay } from "../../types/simulation";

export type RadarView = {
  centerXKm: number;
  centerYKm: number;
  kmPerPixel: number;
};

export type RadarLayerState = {
  counties: boolean;
  states: boolean;
  cities: boolean;
  highways: boolean;
  rangeRings: boolean;
  radarSite: boolean;
  event: boolean;
  warnings: boolean;
  reports: boolean;
};

export type RadarMapPoint = {
  xKm: number;
  yKm: number;
  lat: number;
  lon: number;
  timestamp?: string;
};

export type CursorSample = RadarMapPoint & {
  azimuth: number;
  rangeNm: number;
  beamHeightKft: number;
  value: number | null;
};

export type RadarAnnotation = {
  id: string;
  points: RadarMapPoint[];
  label?: string;
  dashed?: boolean;
  closed?: boolean;
};

export type RadarDraggableHandle = {
  id: string;
  point: RadarMapPoint;
  label?: string;
  kind?: "storm" | "line" | "vertex";
};

export type WarnGenAffectedCounty = {
  fips: string;
  name: string;
  labelPoint: RadarMapPoint;
};

export type WarnGenHatchedPreview = {
  polygon: RadarMapPoint[];
  counties: WarnGenAffectedCounty[];
};

type Props = {
  frame: RadarFrame;
  product: RadarProductSummary;
  radarLatitude: number;
  radarLongitude: number;
  radarAltitudeM?: number | null;
  rangeKm: number;
  view: RadarView;
  layers: RadarLayerState;
  eventMarker?: RadarEventMarker | null;
  warningPolygons?: RadarWarningOverlay[];
  pointOverlays?: RadarPointOverlay[];
  annotations?: RadarAnnotation[];
  draggableHandles?: RadarDraggableHandle[];
  warnedAreaPreview?: WarnGenHatchedPreview | null;
  onDraggableHandleChange?: (id: string, point: RadarMapPoint) => void;
  onDraggableHandleRemove?: (id: string) => void;
  onMapMiddleClick?: (point: RadarMapPoint) => void;
  onViewChange: (view: RadarView) => void;
  onCursorSample: (sample: CursorSample | null) => void;
  onMapClick?: (point: RadarMapPoint) => void;
  onResetView: () => void;
};

type Size = {
  width: number;
  height: number;
};

type WebGlState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  dataTexture: WebGLTexture;
  paletteTexture: WebGLTexture;
};

const EARTH_RADIUS_KM = 6371.0088;
const EFFECTIVE_EARTH_RADIUS_KM = EARTH_RADIUS_KM * (4 / 3);

const CITIES = [
  { name: "New Orleans", lat: 29.9511, lon: -90.0715 },
  { name: "Baton Rouge", lat: 30.4515, lon: -91.1871 },
  { name: "Slidell", lat: 30.2752, lon: -89.7812 },
  { name: "Hammond", lat: 30.5044, lon: -90.4612 },
  { name: "Covington", lat: 30.4755, lon: -90.1009 },
  { name: "LaPlace", lat: 30.0666, lon: -90.4801 },
  { name: "Houma", lat: 29.5958, lon: -90.7195 },
  { name: "Thibodaux", lat: 29.7958, lon: -90.8229 },
  { name: "Bogalusa", lat: 30.791, lon: -89.8487 },
  { name: "McComb", lat: 31.2438, lon: -90.4532 },
  { name: "Gulfport", lat: 30.3674, lon: -89.0928 },
  { name: "Biloxi", lat: 30.396, lon: -88.8853 },
  { name: "Grand Isle", lat: 29.2366, lon: -89.9873 },
];

const LIX_CWA_COUNTY_NAMES = new Map<string, string>([
  ["22005", "Ascension"],
  ["22007", "Assumption"],
  ["22033", "East Baton Rouge"],
  ["22037", "East Feliciana"],
  ["22047", "Iberville"],
  ["22051", "Jefferson"],
  ["22057", "Lafourche"],
  ["22063", "Livingston"],
  ["22071", "Orleans"],
  ["22075", "Plaquemines"],
  ["22077", "Pointe Coupee"],
  ["22087", "St. Bernard"],
  ["22089", "St. Charles"],
  ["22091", "St. Helena"],
  ["22093", "St. James"],
  ["22095", "St. John the Baptist"],
  ["22103", "St. Tammany"],
  ["22105", "Tangipahoa"],
  ["22109", "Terrebonne"],
  ["22117", "Washington"],
  ["22121", "West Baton Rouge"],
  ["22125", "West Feliciana"],
  ["28005", "Amite"],
  ["28045", "Hancock"],
  ["28047", "Harrison"],
  ["28059", "Jackson"],
  ["28109", "Pearl River"],
  ["28113", "Pike"],
  ["28147", "Walthall"],
  ["28157", "Wilkinson"],
]);

const MAJOR_HIGHWAYS = [
  {
    name: "I-10",
    points: [
      [30.4515, -91.1871],
      [30.315, -91.02],
      [30.218, -90.922],
      [30.105, -90.671],
      [30.062, -90.482],
      [29.994, -90.286],
      [29.963, -90.119],
      [29.974, -90.067],
      [30.031, -89.97],
      [30.142, -89.88],
      [30.274, -89.781],
      [30.36, -89.39],
      [30.396, -88.91],
    ],
  },
  {
    name: "I-12",
    points: [
      [30.46, -91.14],
      [30.47, -90.96],
      [30.50, -90.75],
      [30.505, -90.46],
      [30.47, -90.23],
      [30.45, -90.10],
      [30.30, -89.79],
    ],
  },
  {
    name: "I-55",
    points: [
      [30.06, -90.48],
      [30.25, -90.45],
      [30.44, -90.44],
      [30.51, -90.46],
      [30.73, -90.51],
      [31.24, -90.45],
    ],
  },
  {
    name: "I-59",
    points: [
      [30.29, -89.78],
      [30.53, -89.68],
      [30.84, -89.54],
      [31.31, -89.31],
    ],
  },
  {
    name: "I-310",
    points: [
      [30.00, -90.31],
      [29.96, -90.36],
      [29.90, -90.39],
    ],
  },
  {
    name: "I-610",
    points: [
      [29.986, -90.118],
      [29.994, -90.083],
      [30.006, -90.045],
      [30.015, -90.014],
    ],
  },
  {
    name: "I-510",
    points: [
      [30.015, -89.964],
      [29.972, -89.973],
      [29.922, -89.982],
    ],
  },
  {
    name: "I-110",
    points: [
      [30.36, -91.19],
      [30.43, -91.18],
      [30.52, -91.17],
    ],
  },
  {
    name: "US 90",
    points: [
      [29.95, -90.07],
      [29.91, -90.20],
      [29.90, -90.39],
      [29.80, -90.53],
      [29.73, -90.60],
      [29.70, -91.20],
    ],
  },
] as const;

const REGION_STATE_FIPS = new Set(["01", "22", "28"]);

function degrees(value: number) {
  return (value * 180) / Math.PI;
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function latLonToLocal(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number,
): { xKm: number; yKm: number } {
  const lat1 = radians(centerLat);
  const lat2 = radians(lat);
  const deltaLon = radians(lon - centerLon);
  const deltaLat = radians(lat - centerLat);

  const sinHalfLat = Math.sin(deltaLat / 2);
  const sinHalfLon = Math.sin(deltaLon / 2);
  const a =
    sinHalfLat * sinHalfLat +
    Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;
  const angularDistance = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  const distance = EARTH_RADIUS_KM * angularDistance;

  if (distance < 1e-9) return { xKm: 0, yKm: 0 };

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  const bearing = Math.atan2(y, x);

  return {
    xKm: distance * Math.sin(bearing),
    yKm: distance * Math.cos(bearing),
  };
}

export function localToLatLon(
  xKm: number,
  yKm: number,
  centerLat: number,
  centerLon: number,
): { lat: number; lon: number } {
  const distance = Math.hypot(xKm, yKm);
  if (distance < 1e-9) return { lat: centerLat, lon: centerLon };

  const bearing = Math.atan2(xKm, yKm);
  const angularDistance = distance / EARTH_RADIUS_KM;
  const lat1 = radians(centerLat);
  const lon1 = radians(centerLon);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: degrees(lat2),
    lon: ((((degrees(lon2) + 180) % 360) + 360) % 360) - 180,
  };
}

export function distanceBearing(
  first: RadarMapPoint,
  second: RadarMapPoint,
): { distanceNm: number; bearing: number } {
  const dx = second.xKm - first.xKm;
  const dy = second.yKm - first.yKm;
  const bearing = (degrees(Math.atan2(dx, dy)) + 360) % 360;
  return {
    distanceNm: Math.hypot(dx, dy) / 1.852,
    bearing,
  };
}

function beamHeightKft(rangeNm: number, elevation: number) {
  const rangeKm = rangeNm * 1.852;
  const theta = radians(elevation);
  const heightKm =
    Math.sqrt(
      rangeKm * rangeKm +
        EFFECTIVE_EARTH_RADIUS_KM * EFFECTIVE_EARTH_RADIUS_KM +
        2 * rangeKm * EFFECTIVE_EARTH_RADIUS_KM * Math.sin(theta),
    ) - EFFECTIVE_EARTH_RADIUS_KM;
  return heightKm * 3.28084;
}

function hexToRgba(hex: string): [number, number, number, number] {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return [255, 255, 255, 255];
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    255,
  ];
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createWebGlState(canvas: HTMLCanvasElement): WebGlState {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error("WebGL2 is unavailable");

  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    `#version 300 es
    precision highp float;
    void main() {
      vec2 positions[3] = vec2[](
        vec2(-1.0, -1.0),
        vec2(3.0, -1.0),
        vec2(-1.0, 3.0)
      );
      gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
    }`,
  );

  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `#version 300 es
    precision highp float;

    uniform vec2 uResolution;
    uniform vec2 uCenterKm;
    uniform float uKmPerPixel;
    uniform float uRangeStartM;
    uniform float uRangeStepM;
    uniform float uRangeBins;
    uniform float uAzimuthBins;
    uniform sampler2D uData;
    uniform sampler2D uPalette;

    out vec4 outColor;

    void main() {
      vec2 offset = gl_FragCoord.xy - (uResolution * 0.5);
      float xKm = uCenterKm.x + offset.x * uKmPerPixel;
      float yKm = uCenterKm.y + offset.y * uKmPerPixel;
      float rangeM = length(vec2(xKm, yKm)) * 1000.0;
      float gate = (rangeM - uRangeStartM) / uRangeStepM;

      if (gate < 0.0 || gate >= uRangeBins) {
        discard;
      }

      float azimuth = degrees(atan(xKm, yKm));
      if (azimuth < 0.0) {
        azimuth += 360.0;
      }

      float u = (gate + 0.5) / uRangeBins;
      float v = azimuth / 360.0;
      float encoded = texture(uData, vec2(u, v)).r * 255.0;

      if (encoded > 254.5) {
        discard;
      }

      outColor = texture(uPalette, vec2((encoded + 0.5) / 256.0, 0.5));
    }`,
  );

  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create WebGL program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link WebGL program");
  }

  const dataTexture = gl.createTexture();
  const paletteTexture = gl.createTexture();
  if (!dataTexture || !paletteTexture) {
    throw new Error("Unable to create radar textures");
  }

  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, "uData"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "uPalette"), 1);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  return { gl, program, dataTexture, paletteTexture };
}

function uploadRadarData(state: WebGlState, grid: RadarGridMetadata, values: Uint8Array) {
  const { gl, dataTexture } = state;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, dataTexture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R8,
    grid.range_bins,
    grid.azimuth_bins,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    values,
  );
}

function uploadPalette(state: WebGlState, palette: string[]) {
  const colors = palette.length >= 255
    ? palette.slice(0, 256)
    : Array.from({ length: 256 }, (_, index) => {
        const value = Math.round((index / 255) * 255).toString(16).padStart(2, "0");
        return `#${value}${value}${value}`;
      });

  while (colors.length < 256) colors.push(colors[colors.length - 1] ?? "#ffffff");

  const rgba = new Uint8Array(256 * 4);
  colors.forEach((color, index) => {
    const [red, green, blue, alpha] = hexToRgba(color);
    const offset = index * 4;
    rgba[offset] = red;
    rgba[offset + 1] = green;
    rgba[offset + 2] = blue;
    rgba[offset + 3] = alpha;
  });

  const { gl, paletteTexture } = state;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    256,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    rgba,
  );
}

function drawRadar(
  state: WebGlState,
  canvas: HTMLCanvasElement,
  grid: RadarGridMetadata,
  view: RadarView,
) {
  const { gl, program } = state;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  gl.uniform2f(
    gl.getUniformLocation(program, "uResolution"),
    canvas.width,
    canvas.height,
  );
  gl.uniform2f(
    gl.getUniformLocation(program, "uCenterKm"),
    view.centerXKm,
    view.centerYKm,
  );
  gl.uniform1f(gl.getUniformLocation(program, "uKmPerPixel"), view.kmPerPixel);
  gl.uniform1f(gl.getUniformLocation(program, "uRangeStartM"), grid.range_start_m);
  gl.uniform1f(gl.getUniformLocation(program, "uRangeStepM"), grid.range_step_m);
  gl.uniform1f(gl.getUniformLocation(program, "uRangeBins"), grid.range_bins);
  gl.uniform1f(gl.getUniformLocation(program, "uAzimuthBins"), grid.azimuth_bins);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function getGeometryRings(geometry: any): Array<Array<[number, number]>> {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

const REGIONAL_BOUNDARIES = (() => {
  const topology = countiesTopology as any;
  const countyCollection = feature(topology, topology.objects.counties) as any;
  const stateCollection = feature(topology, topology.objects.states) as any;

  const counties = countyCollection.features
    .filter((item: any) => REGION_STATE_FIPS.has(String(item.id).padStart(5, "0").slice(0, 2)))
    .flatMap((item: any) => getGeometryRings(item.geometry));

  const states = stateCollection.features
    .filter((item: any) => REGION_STATE_FIPS.has(String(item.id).padStart(2, "0")))
    .flatMap((item: any) => getGeometryRings(item.geometry));

  const lixCounties = countyCollection.features
    .map((item: any) => {
      const fips = String(item.id).padStart(5, "0");
      return {
        fips,
        name: LIX_CWA_COUNTY_NAMES.get(fips),
        rings: getGeometryRings(item.geometry),
      };
    })
    .filter((item: any) => Boolean(item.name));

  return { counties, states, lixCounties };
})();

function screenPoint(
  point: { xKm: number; yKm: number },
  view: RadarView,
  size: Size,
) {
  return {
    x: size.width / 2 + (point.xKm - view.centerXKm) / view.kmPerPixel,
    y: size.height / 2 - (point.yKm - view.centerYKm) / view.kmPerPixel,
  };
}

function pathForRings(
  rings: Array<Array<[number, number]>>,
  radarLatitude: number,
  radarLongitude: number,
  view: RadarView,
  size: Size,
) {
  return rings
    .map((ring) => {
      const points = ring
        .map(([lon, lat]) => {
          const local = latLonToLocal(lat, lon, radarLatitude, radarLongitude);
          return screenPoint(local, view, size);
        })
        .filter(
          (point) =>
            point.x > -300 &&
            point.x < size.width + 300 &&
            point.y > -300 &&
            point.y < size.height + 300,
        );
      if (points.length < 2) return "";
      return `M ${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" L ")}`;
    })
    .filter(Boolean)
    .join(" ");
}

function pointInPolygon(
  point: { xKm: number; yKm: number },
  polygon: Array<{ xKm: number; yKm: number }>,
) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].xKm;
    const yi = polygon[i].yKm;
    const xj = polygon[j].xKm;
    const yj = polygon[j].yKm;
    const intersects =
      yi > point.yKm !== yj > point.yKm &&
      point.xKm < ((xj - xi) * (point.yKm - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function segmentIntersection(
  a: { xKm: number; yKm: number },
  b: { xKm: number; yKm: number },
  c: { xKm: number; yKm: number },
  d: { xKm: number; yKm: number },
): { xKm: number; yKm: number } | null {
  const rX = b.xKm - a.xKm;
  const rY = b.yKm - a.yKm;
  const sX = d.xKm - c.xKm;
  const sY = d.yKm - c.yKm;
  const denominator = rX * sY - rY * sX;
  if (Math.abs(denominator) < 1e-9) return null;

  const qX = c.xKm - a.xKm;
  const qY = c.yKm - a.yKm;
  const t = (qX * sY - qY * sX) / denominator;
  const u = (qX * rY - qY * rX) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { xKm: a.xKm + t * rX, yKm: a.yKm + t * rY };
}

function ringIntersectionPoint(
  warning: RadarMapPoint[],
  ring: Array<{ xKm: number; yKm: number }>,
) {
  const warningCenter = {
    xKm: warning.reduce((sum, point) => sum + point.xKm, 0) / warning.length,
    yKm: warning.reduce((sum, point) => sum + point.yKm, 0) / warning.length,
  };
  if (pointInPolygon(warningCenter, ring)) return warningCenter;

  const ringCenter = {
    xKm: ring.reduce((sum, point) => sum + point.xKm, 0) / ring.length,
    yKm: ring.reduce((sum, point) => sum + point.yKm, 0) / ring.length,
  };
  if (pointInPolygon(ringCenter, warning)) return ringCenter;

  const warningInside = warning.find((point) => pointInPolygon(point, ring));
  if (warningInside) return warningInside;

  const ringInside = ring.find((point) => pointInPolygon(point, warning));
  if (ringInside) return ringInside;

  for (let i = 0; i < warning.length; i += 1) {
    const a = warning[i];
    const b = warning[(i + 1) % warning.length];
    for (let j = 0; j < ring.length; j += 1) {
      const hit = segmentIntersection(a, b, ring[j], ring[(j + 1) % ring.length]);
      if (hit) return hit;
    }
  }
  return null;
}

export function getWarnGenAffectedCounties(
  warning: RadarMapPoint[],
  radarLatitude: number,
  radarLongitude: number,
): WarnGenAffectedCounty[] {
  if (warning.length < 3) return [];

  return REGIONAL_BOUNDARIES.lixCounties.flatMap((county: any) => {
    for (const rawRing of county.rings as Array<Array<[number, number]>>) {
      const ring = rawRing.map(([lon, lat]) =>
        latLonToLocal(lat, lon, radarLatitude, radarLongitude),
      );
      const hit = ringIntersectionPoint(warning, ring);
      if (!hit) continue;
      return [
        {
          fips: county.fips,
          name: county.name,
          labelPoint: {
            ...hit,
            ...localToLatLon(
              hit.xKm,
              hit.yKm,
              radarLatitude,
              radarLongitude,
            ),
          },
        },
      ];
    }
    return [];
  });
}

export function getNearestWarnGenCity(
  point: RadarMapPoint,
  radarLatitude: number,
  radarLongitude: number,
) {
  let nearest: { name: string; distanceKm: number } | null = null;
  for (const city of CITIES) {
    const local = latLonToLocal(
      city.lat,
      city.lon,
      radarLatitude,
      radarLongitude,
    );
    const distanceKm = Math.hypot(
      local.xKm - point.xKm,
      local.yKm - point.yKm,
    );
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { name: city.name, distanceKm };
    }
  }
  return nearest;
}

export function getWarnGenImpactedCities(
  warning: RadarMapPoint[],
  radarLatitude: number,
  radarLongitude: number,
) {
  if (warning.length < 3) return [];
  return CITIES.filter((city) => {
    const local = latLonToLocal(
      city.lat,
      city.lon,
      radarLatitude,
      radarLongitude,
    );
    return pointInPolygon(local, warning);
  }).map((city) => city.name);
}

function mapPointFromClient(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  view: RadarView,
  radarLatitude: number,
  radarLongitude: number,
): RadarMapPoint {
  const xKm =
    view.centerXKm + (clientX - rect.left - rect.width / 2) * view.kmPerPixel;
  const yKm =
    view.centerYKm - (clientY - rect.top - rect.height / 2) * view.kmPerPixel;
  const geographic = localToLatLon(xKm, yKm, radarLatitude, radarLongitude);
  return { xKm, yKm, ...geographic };
}

export function RadarGeographicCanvas({
  frame,
  product,
  radarLatitude,
  radarLongitude,
  radarAltitudeM: _radarAltitudeM,
  rangeKm,
  view,
  layers,
  eventMarker = null,
  warningPolygons = [],
  pointOverlays = [],
  annotations = [],
  draggableHandles = [],
  warnedAreaPreview = null,
  onDraggableHandleChange,
  onDraggableHandleRemove,
  onMapMiddleClick,
  onViewChange,
  onCursorSample,
  onMapClick,
  onResetView,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGlState | null>(null);
  const dragRef = useRef<
    | {
        mode: "pan";
        pointerId: number;
        x: number;
        y: number;
        centerXKm: number;
        centerYKm: number;
        moved: boolean;
      }
    | {
        mode: "handle";
        pointerId: number;
        handleId: string;
        moved: boolean;
      }
    | null
  >(null);

  const [size, setSize] = useState<Size>({ width: 1, height: 1 });
  const [values, setValues] = useState<Uint8Array | null>(null);
  const [renderError, setRenderError] = useState("");
  const [dataRevision, setDataRevision] = useState(0);
  const [paletteRevision, setPaletteRevision] = useState(0);
  const [handleContextMenu, setHandleContextMenu] = useState<{
    x: number;
    y: number;
    handleId: string;
  } | null>(null);

  const grid = frame.grid ?? null;
  const gridKey = grid
    ? [
        grid.azimuth_bins,
        grid.range_bins,
        grid.range_start_m,
        grid.range_step_m,
        grid.value_min,
        grid.value_max,
        grid.nodata,
        grid.actual_elevation ?? "",
      ].join(":")
    : "";
  const paletteKey = (product.palette ?? []).join(",");

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      rendererRef.current = createWebGlState(canvas);
      setRenderError("");
    } catch (reason) {
      setRenderError(reason instanceof Error ? reason.message : "WebGL2 renderer failed");
    }

    return () => {
      const state = rendererRef.current;
      if (state) {
        state.gl.deleteTexture(state.dataTexture);
        state.gl.deleteTexture(state.paletteTexture);
        state.gl.deleteProgram(state.program);
      }
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!frame.data_url || !grid) {
      setValues(null);
      return;
    }

    let cancelled = false;
    fetch(frame.data_url)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load radar gate data");
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (cancelled) return;
        const next = new Uint8Array(buffer);
        const expected = grid.azimuth_bins * grid.range_bins;
        if (next.length !== expected) {
          throw new Error(
            `Radar gate data size mismatch: received ${next.length}, expected ${expected}`,
          );
        }
        setValues(next);
        setRenderError("");
      })
      .catch((reason) => {
        if (!cancelled) {
          setValues(null);
          setRenderError(reason instanceof Error ? reason.message : "Unable to load radar gate data");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [frame.data_url, gridKey]);

  useEffect(() => {
    const state = rendererRef.current;
    if (!state || !values || !grid) return;
    uploadRadarData(state, grid, values);
    setDataRevision((value) => value + 1);
  }, [values, gridKey]);

  useEffect(() => {
    const state = rendererRef.current;
    if (!state) return;
    uploadPalette(state, product.palette ?? []);
    setPaletteRevision((value) => value + 1);
  }, [product.id, paletteKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const state = rendererRef.current;
    if (!canvas || !state || !grid || !values) return;

    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    drawRadar(state, canvas, grid, view);
  }, [view, size, gridKey, values, dataRevision, paletteRevision]);

  const countyPath = useMemo(
    () =>
      layers.counties
        ? pathForRings(
            REGIONAL_BOUNDARIES.counties,
            radarLatitude,
            radarLongitude,
            view,
            size,
          )
        : "",
    [layers.counties, radarLatitude, radarLongitude, view, size],
  );

  const statePath = useMemo(
    () =>
      layers.states
        ? pathForRings(
            REGIONAL_BOUNDARIES.states,
            radarLatitude,
            radarLongitude,
            view,
            size,
          )
        : "",
    [layers.states, radarLatitude, radarLongitude, view, size],
  );

  const updateCursor = useCallback(
    (clientX: number, clientY: number) => {
      const element = containerRef.current;
      if (!element) return;
      const point = mapPointFromClient(
        clientX,
        clientY,
        element.getBoundingClientRect(),
        view,
        radarLatitude,
        radarLongitude,
      );
      const rangeKmValue = Math.hypot(point.xKm, point.yKm);
      const rangeNm = rangeKmValue / 1.852;
      const azimuth = (degrees(Math.atan2(point.xKm, point.yKm)) + 360) % 360;

      let value: number | null = null;
      if (grid && values) {
        const gate = Math.round(
          (rangeKmValue * 1000 - grid.range_start_m) / grid.range_step_m,
        );
        const azimuthIndex =
          Math.round(azimuth / (360 / grid.azimuth_bins)) % grid.azimuth_bins;
        if (gate >= 0 && gate < grid.range_bins) {
          const encoded = values[azimuthIndex * grid.range_bins + gate];
          if (encoded !== grid.nodata) {
            value =
              grid.value_min +
              (encoded / 254) * (grid.value_max - grid.value_min);
          }
        }
      }

      onCursorSample({
        ...point,
        azimuth,
        rangeNm,
        beamHeightKft: beamHeightKft(
          rangeNm,
          grid?.actual_elevation ?? frame.elevation,
        ),
        value,
      });
    },
    [
      frame.elevation,
      grid,
      onCursorSample,
      radarLatitude,
      radarLongitude,
      values,
      view,
    ],
  );

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    setHandleContextMenu(null);
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = event.currentTarget.getBoundingClientRect();
    const hit = draggableHandles.find((handle) => {
      const handleScreen = screenPoint(handle.point, view, size);
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      return Math.hypot(x - handleScreen.x, y - handleScreen.y) <= 24;
    });

    if (hit && onDraggableHandleChange) {
      dragRef.current = {
        mode: "handle",
        pointerId: event.pointerId,
        handleId: hit.id,
        moved: false,
      };
      return;
    }

    dragRef.current = {
      mode: "pan",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      centerXKm: view.centerXKm,
      centerYKm: view.centerYKm,
      moved: false,
    };
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateCursor(event.clientX, event.clientY);
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.mode === "handle") {
      if (!containerRef.current || !onDraggableHandleChange) return;
      drag.moved = true;
      const point = mapPointFromClient(
        event.clientX,
        event.clientY,
        containerRef.current.getBoundingClientRect(),
        view,
        radarLatitude,
        radarLongitude,
      );
      onDraggableHandleChange(drag.handleId, {
        ...point,
        timestamp: frame.timestamp,
      });
      return;
    }

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 3) drag.moved = true;

    onViewChange({
      ...view,
      centerXKm: drag.centerXKm - dx * view.kmPerPixel,
      centerYKm: drag.centerYKm + dy * view.kmPerPixel,
    });
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (
      drag?.mode === "handle" &&
      containerRef.current &&
      onDraggableHandleChange
    ) {
      const point = mapPointFromClient(
        event.clientX,
        event.clientY,
        containerRef.current.getBoundingClientRect(),
        view,
        radarLatitude,
        radarLongitude,
      );
      onDraggableHandleChange(drag.handleId, {
        ...point,
        timestamp: frame.timestamp,
      });
      dragRef.current = null;
      return;
    }

    dragRef.current = null;

    if (
      drag?.mode === "pan" &&
      !drag.moved &&
      event.button === 0 &&
      onMapClick &&
      containerRef.current
    ) {
      const point = mapPointFromClient(
        event.clientX,
        event.clientY,
        containerRef.current.getBoundingClientRect(),
        view,
        radarLatitude,
        radarLongitude,
      );
      onMapClick({ ...point, timestamp: frame.timestamp });
    }
  };

  const auxClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 1 || !onMapMiddleClick || !containerRef.current) return;
    event.preventDefault();
    const point = mapPointFromClient(
      event.clientX,
      event.clientY,
      containerRef.current.getBoundingClientRect(),
      view,
      radarLatitude,
      radarLongitude,
    );
    onMapMiddleClick({ ...point, timestamp: frame.timestamp });
  };

  const contextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onDraggableHandleRemove || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = draggableHandles.find((handle) => {
      if (handle.kind !== "vertex") return false;
      const handleScreen = screenPoint(handle.point, view, size);
      return Math.hypot(x - handleScreen.x, y - handleScreen.y) <= 24;
    });
    if (!hit) {
      setHandleContextMenu(null);
      return;
    }
    event.preventDefault();
    setHandleContextMenu({ x, y, handleId: hit.id });
  };

  const wheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const element = containerRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const xOffset = event.clientX - rect.left - rect.width / 2;
    const yOffset = event.clientY - rect.top - rect.height / 2;
    const anchorX = view.centerXKm + xOffset * view.kmPerPixel;
    const anchorY = view.centerYKm - yOffset * view.kmPerPixel;

    const factor = Math.exp(event.deltaY * 0.0012);
    const nextKmPerPixel = Math.max(
      0.025,
      Math.min((rangeKm * 2.2) / 250, view.kmPerPixel * factor),
    );

    onViewChange({
      centerXKm: anchorX - xOffset * nextKmPerPixel,
      centerYKm: anchorY + yOffset * nextKmPerPixel,
      kmPerPixel: nextKmPerPixel,
    });
  };

  const radarScreen = screenPoint({ xKm: 0, yKm: 0 }, view, size);
  const showHighwayLabels = view.kmPerPixel <= 0.38;

  const pointOverlayLayout = (() => {
    const entries = pointOverlays.map((overlay) => ({
      overlay,
      point: screenPoint(
        latLonToLocal(
          overlay.lat,
          overlay.lon,
          radarLatitude,
          radarLongitude,
        ),
        view,
        size,
      ),
      label: null as
        | { x: number; y: number; textAnchor: "start" | "end" }
        | null,
    }));

    const occupied: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const padding = view.kmPerPixel <= 0.15 ? 3 : 7;

    if (eventMarker) {
      const eventPoint = screenPoint(
        latLonToLocal(
          eventMarker.lat,
          eventMarker.lon,
          radarLatitude,
          radarLongitude,
        ),
        view,
        size,
      );
      occupied.push({
        left: eventPoint.x + 8,
        top: eventPoint.y - 22,
        right: eventPoint.x + 190,
        bottom: eventPoint.y + 4,
      });
    }

    const overlaps = (
      box: { left: number; top: number; right: number; bottom: number },
      other: { left: number; top: number; right: number; bottom: number },
    ) =>
      !(
        box.right + padding < other.left ||
        box.left - padding > other.right ||
        box.bottom + padding < other.top ||
        box.top - padding > other.bottom
      );

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      const width = Math.min(210, Math.max(42, entry.overlay.label.length * 6.6));
      const height = 15;
      const candidates = [
        { x: 9, y: -8, textAnchor: "start" as const },
        { x: 9, y: 17, textAnchor: "start" as const },
        { x: -9, y: -8, textAnchor: "end" as const },
        { x: -9, y: 17, textAnchor: "end" as const },
      ];

      for (const candidate of candidates) {
        const left =
          entry.point.x + candidate.x - (candidate.textAnchor === "end" ? width : 0);
        const top = entry.point.y + candidate.y - height + 3;
        const box = {
          left,
          top,
          right: left + width,
          bottom: top + height,
        };

        const onScreen =
          box.left >= 4 &&
          box.right <= size.width - 4 &&
          box.top >= 4 &&
          box.bottom <= size.height - 4;
        if (!onScreen || occupied.some((other) => overlaps(box, other))) continue;

        entry.label = candidate;
        occupied.push(box);
        break;
      }
    }

    return entries;
  })();
  const lixCountyScreenRings = useMemo(
    () =>
      REGIONAL_BOUNDARIES.lixCounties.flatMap((county: any) =>
        (county.rings as Array<Array<[number, number]>>).map((ring) =>
          ring.map(([lon, lat]) =>
            screenPoint(
              latLonToLocal(lat, lon, radarLatitude, radarLongitude),
              view,
              size,
            ),
          ),
        ),
      ),
    [radarLatitude, radarLongitude, view, size],
  );

  return (
    <div
      ref={containerRef}
      className="radar-geo-canvas"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      onPointerLeave={() => onCursorSample(null)}
      onAuxClick={auxClick}
      onContextMenu={contextMenu}
      onWheel={wheel}
      onDoubleClick={onResetView}
      aria-label="Geographic radar display; mouse wheel zooms around cursor and drag pans"
    >
      <canvas ref={canvasRef} className="radar-webgl-layer" />

      <svg className="radar-map-overlay" width={size.width} height={size.height}>
        <defs>
          <pattern
            id="warngen-hatch-pattern"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="8" className="warngen-hatch-line" />
          </pattern>
          <clipPath id="warngen-lix-cwa-clip">
            {lixCountyScreenRings.map(
              (ring: Array<{ x: number; y: number }>, index: number) => (
                <polygon
                  key={index}
                  points={ring
                    .map((point: { x: number; y: number }) => `${point.x},${point.y}`)
                    .join(" ")}
                />
              ),
            )}
          </clipPath>
        </defs>
        {layers.counties && countyPath && (
          <path d={countyPath} className="radar-county-boundary" />
        )}
        {layers.states && statePath && (
          <path d={statePath} className="radar-state-boundary" />
        )}

        {layers.highways &&
          MAJOR_HIGHWAYS.map((highway) => {
            const points = highway.points.map(([lat, lon]) =>
              screenPoint(
                latLonToLocal(lat, lon, radarLatitude, radarLongitude),
                view,
                size,
              ),
            );
            const labelPoint = points[Math.floor(points.length / 2)];
            const isInterstate = highway.name.startsWith("I-");
            return (
              <g
                key={highway.name}
                className={`radar-highway ${isInterstate ? "interstate" : "us-highway"}`}
              >
                <polyline
                  className="casing"
                  points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                />
                <polyline
                  className="centerline"
                  points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                />
                {showHighwayLabels && labelPoint && (
                  <g
                    className="radar-highway-shield"
                    transform={`translate(${labelPoint.x} ${labelPoint.y})`}
                  >
                    <rect x="-18" y="-9" width="36" height="18" rx="6" />
                    <text x="0" y="4" textAnchor="middle">
                      {highway.name}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

        {layers.rangeRings &&
          [25, 50, 75, 100, 150, 200]
            .filter((value) => value < rangeKm)
            .map((radius) => {
              const radiusPx = radius / view.kmPerPixel;
              return (
                <g key={radius}>
                  <circle
                    cx={radarScreen.x}
                    cy={radarScreen.y}
                    r={radiusPx}
                    className="radar-range-ring"
                  />
                  <text
                    x={radarScreen.x + radiusPx + 4}
                    y={radarScreen.y - 4}
                    className="radar-range-label"
                  >
                    {Math.round(radius / 1.852)} nm
                  </text>
                </g>
              );
            })}

        {layers.radarSite && (
          <g transform={`translate(${radarScreen.x} ${radarScreen.y})`} className="radar-site-marker">
            <circle r="4" />
            <path d="M -8 0 L 8 0 M 0 -8 L 0 8" />
            <text x="10" y="-8">KLIX</text>
          </g>
        )}

        {layers.cities &&
          CITIES.map((city) => {
            const local = latLonToLocal(
              city.lat,
              city.lon,
              radarLatitude,
              radarLongitude,
            );
            const point = screenPoint(local, view, size);
            if (
              point.x < -60 ||
              point.x > size.width + 60 ||
              point.y < -30 ||
              point.y > size.height + 30
            ) {
              return null;
            }
            return (
              <g key={city.name} className="radar-city">
                <circle cx={point.x} cy={point.y} r="2.5" />
                <text x={point.x + 5} y={point.y - 5}>
                  {city.name}
                </text>
              </g>
            );
          })}

        {layers.event && eventMarker && (() => {
          const local = latLonToLocal(
            eventMarker.lat,
            eventMarker.lon,
            radarLatitude,
            radarLongitude,
          );
          const point = screenPoint(local, view, size);
          return (
            <g className="radar-event-marker" transform={`translate(${point.x} ${point.y})`}>
              <path d="M 0 -8 L 8 0 L 0 8 L -8 0 Z" />
              <circle r="2.5" />
              <text x="12" y="-10">{eventMarker.label}</text>
            </g>
          );
        })()}

        {layers.warnings &&
          warningPolygons.map((warning) => {
            if (warning.points.length < 3) return null;
            const points = warning.points.map((point) =>
              screenPoint(
                latLonToLocal(
                  point.lat,
                  point.lon,
                  radarLatitude,
                  radarLongitude,
                ),
                view,
                size,
              ),
            );
            const labelPoint = points[0];
            return (
              <g
                key={warning.id}
                className={`radar-warning radar-warning-${(warning.hazard ?? "warning").toLowerCase()}`}
              >
                <polygon
                  points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                  clipPath="url(#warngen-lix-cwa-clip)"
                />
                <text x={labelPoint.x + 6} y={labelPoint.y - 6}>
                  {warning.label}
                </text>
              </g>
            );
          })}

        {layers.reports &&
          pointOverlayLayout.map(({ overlay, point, label }) => (
            <g
              key={overlay.id}
              className={`radar-point-overlay radar-point-${(overlay.kind ?? "report").toLowerCase()}`}
              transform={`translate(${point.x} ${point.y})`}
            >
              <circle r="5" />
              <path d="M -7 0 L 7 0 M 0 -7 L 0 7" />
              {label && (
                <text x={label.x} y={label.y} textAnchor={label.textAnchor}>
                  {overlay.label}
                </text>
              )}
            </g>
          ))}

        {warnedAreaPreview && warnedAreaPreview.polygon.length >= 3 && (
          <g className="warngen-hatched-preview">
            <polygon
              points={warnedAreaPreview.polygon
                .map((point) => screenPoint(point, view, size))
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              clipPath="url(#warngen-lix-cwa-clip)"
            />
            {warnedAreaPreview.counties.map((county) => {
              const point = screenPoint(county.labelPoint, view, size);
              return (
                <g key={county.fips} transform={`translate(${point.x} ${point.y})`}>
                  <text className="warngen-w-marker" textAnchor="middle">W</text>
                </g>
              );
            })}
          </g>
        )}

        {draggableHandles.map((handle) => {
          const point = screenPoint(handle.point, view, size);
          return (
            <g
              key={handle.id}
              className={`radar-drag-handle radar-drag-handle-${handle.kind ?? "vertex"}`}
              transform={`translate(${point.x} ${point.y})`}
            >
              <circle className="handle-ring" r={handle.kind === "storm" ? 10 : 7} />
              <circle className="handle-center" r={3} />
              {handle.kind === "storm" && (
                <path d="M -15 0 L 15 0 M 0 -15 L 0 15" />
              )}
              {handle.label && <text x="15" y="-13">{handle.label}</text>}
            </g>
          );
        })}

        {annotations.map((annotation) => {
          if (annotation.points.length < 1) return null;
          const screenPoints = annotation.points.map((point) =>
            screenPoint(point, view, size),
          );
          const last = screenPoints[screenPoints.length - 1];
          return (
            <g key={annotation.id} className="radar-annotation">
              {screenPoints.length > 1 && (
                annotation.closed && screenPoints.length >= 3 ? (
                  <polygon
                    points={screenPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                    className={annotation.dashed ? "dashed" : ""}
                  />
                ) : (
                  <polyline
                    points={screenPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                    className={annotation.dashed ? "dashed" : ""}
                  />
                )
              )}
              {screenPoints.map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r="4" />
              ))}
              {annotation.label && (
                <text x={last.x + 8} y={last.y - 8}>
                  {annotation.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {handleContextMenu && (
        <div
          className="radar-handle-context-menu"
          style={{ left: handleContextMenu.x, top: handleContextMenu.y }}
        >
          <button
            onClick={() => {
              onDraggableHandleRemove?.(handleContextMenu.handleId);
              setHandleContextMenu(null);
            }}
          >
            Remove Vertex
          </button>
        </div>
      )}

      {!values && !renderError && (
        <div className="radar-render-status">Loading gate data…</div>
      )}
      {renderError && (
        <div className="radar-render-fallback">
          <strong>Data-aware renderer unavailable</strong>
          <span>{renderError}</span>
          <img src={frame.asset_url} alt="Radar PNG fallback" draggable={false} />
        </div>
      )}
    </div>
  );
}
