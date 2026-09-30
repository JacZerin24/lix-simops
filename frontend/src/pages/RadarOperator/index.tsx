import {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getEventOperations, getRadarFrames } from "../../services/api";
import type {
  EventOperationsConfig,
  RadarFrameResponse,
  RadarProductSummary,
  WarningRecord,
} from "../../types/simulation";
import {
  CursorSample,
  RadarAnnotation,
  RadarDraggableHandle,
  RadarGeographicCanvas,
  RadarLayerState,
  RadarMapPoint,
  RadarView,
  distanceBearing,
  latLonToLocal,
  localToLatLon,
} from "./RadarGeographicCanvas";

type Props = {
  sessionCode: string;
  warnings: WarningRecord[];
  onWarningAction: (payload: object) => void;
};

type RadarTool =
  | "cursor"
  | "distance-bearing"
  | "distance-speed"
  | "storm-track"
  | "warngen";

const PRODUCT_KEYS = ["REF", "VEL", "CC", "ZDR"];
const DEFAULT_RANGE_KM = 230;

function frameTime(value?: string) {
  if (!value) return "No scan";
  return new Date(value).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function initialView(rangeKm = DEFAULT_RANGE_KM): RadarView {
  return {
    centerXKm: 0,
    centerYKm: 0,
    kmPerPixel: (rangeKm * 2.15) / 900,
  };
}

function formatCursorValue(product: string, value: number | null) {
  if (value === null) return "—";
  if (product === "REF") return `${value.toFixed(1)} dBZ`;
  if (product === "VEL") return `${(value * 1.94384).toFixed(1)} kt`;
  if (product === "CC") return value.toFixed(3);
  if (product === "ZDR") return `${value.toFixed(2)} dB`;
  return value.toFixed(2);
}

function minutesBetween(first?: string, second?: string) {
  if (!first || !second) return 0;
  return (new Date(second).getTime() - new Date(first).getTime()) / 60000;
}

export function RadarOperator({ sessionCode, warnings, onWarningAction }: Props) {
  const [product, setProduct] = useState("REF");
  const [elevation, setElevation] = useState(0.5);
  const [data, setData] = useState<RadarFrameResponse | null>(null);
  const [eventConfig, setEventConfig] = useState<EventOperationsConfig | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [followLatest, setFollowLatest] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [loopSpeedMs, setLoopSpeedMs] = useState(500);
  const [endDwellMs, setEndDwellMs] = useState(1500);
  const [rocking, setRocking] = useState(false);
  const [view, setView] = useState<RadarView>(initialView());
  const [cursorSample, setCursorSample] = useState<CursorSample | null>(null);
  const [layers, setLayers] = useState<RadarLayerState>({
    counties: true,
    states: true,
    cities: true,
    highways: true,
    rangeRings: true,
    radarSite: true,
    event: true,
    warnings: true,
    reports: true,
  });
  const [layersOpen, setLayersOpen] = useState(false);
  const [tool, setTool] = useState<RadarTool>("cursor");
  const [toolPoints, setToolPoints] = useState<RadarMapPoint[]>([]);
  const [warningHazard, setWarningHazard] = useState<"TOR" | "SVR">("TOR");
  const [warningDuration, setWarningDuration] = useState(30);
  const [warnCurrentPoint, setWarnCurrentPoint] = useState<RadarMapPoint | null>(null);
  const [warnPreviousPoint, setWarnPreviousPoint] = useState<RadarMapPoint | null>(null);
  const [warnPolygon, setWarnPolygon] = useState<RadarMapPoint[]>([]);
  const [warnTracked, setWarnTracked] = useState(false);
  const [legacyZoom, setLegacyZoom] = useState(1);
  const [legacyPan, setLegacyPan] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");

  const loopDirection = useRef(1);
  const legacyDrag = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const fullscreenRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEventOperations(sessionCode)
      .then((config) => {
        if (!cancelled) setEventConfig(config);
      })
      .catch(() => {
        if (!cancelled) setEventConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionCode]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const response = await getRadarFrames(sessionCode, product, elevation);
        if (cancelled) return;

        setData(response);
        setError("");

        if (response.selected_product !== product) {
          setProduct(response.selected_product);
        }
        if (Math.abs(response.selected_elevation - elevation) > 0.01) {
          setElevation(response.selected_elevation);
        }

        setSelectedIndex((current) => {
          if (response.frames.length === 0) return 0;
          if (followLatest) return response.frames.length - 1;
          return Math.min(current, response.frames.length - 1);
        });
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Unable to load radar");
        }
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionCode, product, elevation, followLatest]);

  const frames = data?.frames ?? [];
  const safeIndex = frames.length ? Math.min(selectedIndex, frames.length - 1) : 0;
  const frame = frames[safeIndex];

  const eventMarker = eventConfig?.event?.radar_marker ?? null;
  const overlayTime = data?.sim_time ? new Date(data.sim_time).getTime() : Number.NaN;
  const warningPolygons = warnings
    .filter((warning) => warning.status === "active")
    .map((warning) => ({
      id: warning.id,
      label: warning.inherited
        ? `${warning.label} · inherited`
        : warning.label,
      hazard: warning.hazard,
      valid_from: warning.issued_at,
      valid_to: warning.expires_at,
      points: warning.points,
    }));
  const pointOverlays = (eventConfig?.radar_overlays?.reports ?? []).filter((report) => {
    const start = report.valid_at ? new Date(report.valid_at).getTime() : -Infinity;
    const end = report.expires_at ? new Date(report.expires_at).getTime() : Infinity;
    return Number.isNaN(overlayTime) || (overlayTime >= start && overlayTime <= end);
  });

  useEffect(() => {
    if (!playing || frames.length < 2) return;

    const delay = safeIndex === frames.length - 1 ? endDwellMs : loopSpeedMs;
    const timer = window.setTimeout(() => {
      setFollowLatest(false);
      setSelectedIndex((current) => {
        const last = frames.length - 1;
        if (!rocking) return current >= last ? 0 : current + 1;

        if (current >= last) loopDirection.current = -1;
        if (current <= 0) loopDirection.current = 1;
        return Math.max(0, Math.min(last, current + loopDirection.current));
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [playing, frames.length, safeIndex, loopSpeedMs, endDwellMs, rocking]);

  const selectPrevious = useCallback(() => {
    setPlaying(false);
    setFollowLatest(false);
    setSelectedIndex((current) => Math.max(0, current - 1));
  }, []);

  const selectNext = useCallback(() => {
    setPlaying(false);
    setSelectedIndex((current) => {
      const next = Math.min(frames.length - 1, current + 1);
      setFollowLatest(next === frames.length - 1);
      return Math.max(0, next);
    });
  }, [frames.length]);

  const goLatest = useCallback(() => {
    setPlaying(false);
    setFollowLatest(true);
    setSelectedIndex(Math.max(0, frames.length - 1));
  }, [frames.length]);

  const resetView = useCallback(() => {
    setView(initialView(data?.range_km ?? DEFAULT_RANGE_KM));
    setLegacyZoom(1);
    setLegacyPan({ x: 0, y: 0 });
  }, [data?.range_km]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await fullscreenRef.current?.requestFullscreen();
      }
    } catch {
      // Browser or managed-device fullscreen policy can reject the request.
    }
  }, []);

  const stepElevation = useCallback(
    (direction: number) => {
      const elevations = data?.elevations ?? [];
      if (!elevations.length) return;
      const current = elevations.reduce(
        (best, value, index) =>
          Math.abs(value - elevation) < Math.abs(elevations[best] - elevation)
            ? index
            : best,
        0,
      );
      const next = Math.max(0, Math.min(elevations.length - 1, current + direction));
      setElevation(elevations[next]);
      setFollowLatest(true);
    },
    [data?.elevations, elevation],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        selectNext();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        stepElevation(1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        stepElevation(-1);
      } else if (event.key === " ") {
        event.preventDefault();
        if (frames.length >= 2) {
          setFollowLatest(false);
          setPlaying((value) => !value);
        }
      } else if (event.key === "Home") {
        event.preventDefault();
        goLatest();
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void toggleFullscreen();
      } else if (/^[1-4]$/.test(event.key)) {
        const requested = PRODUCT_KEYS[Number(event.key) - 1];
        if (data?.products.some((item) => item.id === requested)) {
          setProduct(requested);
          setFollowLatest(true);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    data?.products,
    frames.length,
    goLatest,
    resetView,
    selectNext,
    selectPrevious,
    stepElevation,
    toggleFullscreen,
  ]);

  const currentProduct: RadarProductSummary =
    data?.products.find((item) => item.id === product) ?? {
      id: product,
      label: product,
      units: "",
      palette: [],
    };

  const measurement = useMemo(() => {
    if (toolPoints.length < 2) return null;
    const first = toolPoints[0];
    const second = toolPoints[1];
    const vector = distanceBearing(first, second);
    const minutes = minutesBetween(first.timestamp, second.timestamp);
    const speedKt = minutes > 0 ? vector.distanceNm / (minutes / 60) : null;
    return { first, second, ...vector, minutes, speedKt };
  }, [toolPoints]);

  const warnMeasurement = useMemo(() => {
    if (!warnPreviousPoint || !warnCurrentPoint) return null;
    const minutes = minutesBetween(warnPreviousPoint.timestamp, warnCurrentPoint.timestamp);
    if (minutes <= 0) return null;
    const vector = distanceBearing(warnPreviousPoint, warnCurrentPoint);
    const dx = warnCurrentPoint.xKm - warnPreviousPoint.xKm;
    const dy = warnCurrentPoint.yKm - warnPreviousPoint.yKm;
    const speedKt = vector.distanceNm / (minutes / 60);
    return { ...vector, minutes, speedKt, dx, dy };
  }, [warnCurrentPoint, warnPreviousPoint]);

  const warnProjection = useMemo(() => {
    if (
      !warnMeasurement ||
      !warnCurrentPoint ||
      data?.radar_latitude == null ||
      data.radar_longitude == null
    ) {
      return null;
    }

    const xPerMinute = warnMeasurement.dx / warnMeasurement.minutes;
    const yPerMinute = warnMeasurement.dy / warnMeasurement.minutes;
    const futureX = warnCurrentPoint.xKm + xPerMinute * warningDuration;
    const futureY = warnCurrentPoint.yKm + yPerMinute * warningDuration;
    const trackLength = Math.hypot(warnMeasurement.dx, warnMeasurement.dy);
    if (trackLength < 0.01) return null;

    const perpX = -warnMeasurement.dy / trackLength;
    const perpY = warnMeasurement.dx / trackLength;
    const rearHalfWidthKm = 10;
    const forwardHalfWidthKm = 15;

    const makePoint = (xKm: number, yKm: number): RadarMapPoint => ({
      xKm,
      yKm,
      ...localToLatLon(
        xKm,
        yKm,
        data.radar_latitude!,
        data.radar_longitude!,
      ),
      timestamp: warnCurrentPoint.timestamp,
    });

    const future = makePoint(futureX, futureY);
    const polygon = [
      makePoint(
        warnCurrentPoint.xKm + perpX * rearHalfWidthKm,
        warnCurrentPoint.yKm + perpY * rearHalfWidthKm,
      ),
      makePoint(
        warnCurrentPoint.xKm - perpX * rearHalfWidthKm,
        warnCurrentPoint.yKm - perpY * rearHalfWidthKm,
      ),
      makePoint(
        futureX - perpX * forwardHalfWidthKm,
        futureY - perpY * forwardHalfWidthKm,
      ),
      makePoint(
        futureX + perpX * forwardHalfWidthKm,
        futureY + perpY * forwardHalfWidthKm,
      ),
    ];

    return { future, polygon };
  }, [
    data?.radar_latitude,
    data?.radar_longitude,
    warnCurrentPoint,
    warnMeasurement,
    warningDuration,
  ]);

  const warnCurrentFrameIndex = warnCurrentPoint
    ? frames.findIndex((item) => item.timestamp === warnCurrentPoint.timestamp)
    : -1;
  const warnPreviousFrameIndex = warnPreviousPoint
    ? frames.findIndex((item) => item.timestamp === warnPreviousPoint.timestamp)
    : -1;
  const warnFrameSeparation =
    warnCurrentFrameIndex >= 0 && warnPreviousFrameIndex >= 0
      ? warnCurrentFrameIndex - warnPreviousFrameIndex
      : 0;

  const annotations = useMemo<RadarAnnotation[]>(() => {
    if (tool === "warngen") {
      const items: RadarAnnotation[] = [];

      if (warnPreviousPoint && warnCurrentPoint) {
        const trackPoints = warnProjection
          ? [warnPreviousPoint, warnCurrentPoint, warnProjection.future]
          : [warnPreviousPoint, warnCurrentPoint];
        items.push({
          id: "warngen-track",
          points: trackPoints,
          dashed: true,
          label: warnMeasurement
            ? `${warnMeasurement.bearing.toFixed(0).padStart(3, "0")}° @ ${warnMeasurement.speedKt.toFixed(0)} kt`
            : undefined,
        });
      }

      if (warnTracked && warnPolygon.length >= 3) {
        items.push({
          id: "warngen-polygon",
          points: warnPolygon,
          closed: true,
          label: `${warningHazard} track polygon`,
        });
      }

      return items;
    }

    if (!toolPoints.length) return [];

    if (tool === "distance-bearing") {
      return [
        {
          id: "distance-bearing",
          points: toolPoints,
          label:
            measurement
              ? `${measurement.distanceNm.toFixed(1)} nm · ${measurement.bearing.toFixed(0).padStart(3, "0")}°`
              : "Set endpoint",
        },
      ];
    }

    if (tool === "distance-speed") {
      return [
        {
          id: "distance-speed",
          points: toolPoints,
          label:
            measurement?.speedKt != null
              ? `${measurement.bearing.toFixed(0).padStart(3, "0")}° @ ${measurement.speedKt.toFixed(0)} kt`
              : toolPoints.length > 1
                ? "Use a later scan for endpoint"
                : "Step forward, then set endpoint",
        },
      ];
    }

    if (tool === "storm-track") {
      const items: RadarAnnotation[] = [
        {
          id: "storm-history",
          points: toolPoints,
          dashed: true,
          label: toolPoints.length === 1 ? "Step forward, then set current position" : undefined,
        },
      ];

      if (measurement?.speedKt != null && data?.radar_latitude != null && data.radar_longitude != null) {
        const dx = measurement.second.xKm - measurement.first.xKm;
        const dy = measurement.second.yKm - measurement.first.yKm;
        const xPerMinute = dx / measurement.minutes;
        const yPerMinute = dy / measurement.minutes;
        const projected = [measurement.second];

        for (let minute = 5; minute <= 30; minute += 5) {
          const xKm = measurement.second.xKm + xPerMinute * minute;
          const yKm = measurement.second.yKm + yPerMinute * minute;
          const geographic = localToLatLon(
            xKm,
            yKm,
            data.radar_latitude,
            data.radar_longitude,
          );
          projected.push({
            xKm,
            yKm,
            ...geographic,
            timestamp: measurement.second.timestamp,
          });
        }

        items.push({
          id: "storm-projection",
          points: projected,
          label: `${measurement.bearing.toFixed(0).padStart(3, "0")}° @ ${measurement.speedKt.toFixed(0)} kt · +30 min`,
        });
      }

      return items;
    }

    return [];
  }, [
    data?.radar_latitude,
    data?.radar_longitude,
    measurement,
    tool,
    toolPoints,
    warnCurrentPoint,
    warnMeasurement,
    warnPolygon,
    warnPreviousPoint,
    warnProjection,
    warnTracked,
    warningHazard,
  ]);

  const onMapClick = (point: RadarMapPoint) => {
    if (tool === "cursor" || tool === "warngen") return;
    setToolPoints((current) => (current.length >= 2 ? [point] : [...current, point]));
  };

  const startWarnGen = () => {
    setPlaying(false);
    setTool("warngen");
    setToolPoints([]);
    setWarnCurrentPoint(null);
    setWarnPreviousPoint(null);
    setWarnPolygon([]);
    setWarnTracked(false);
    goLatest();
  };

  const restartWarnGen = () => {
    setPlaying(false);
    setWarnCurrentPoint(null);
    setWarnPreviousPoint(null);
    setWarnPolygon([]);
    setWarnTracked(false);
    goLatest();
  };

  const trackWarnGenStorm = () => {
    if (!warnProjection || !warnMeasurement) return;
    setWarnPolygon(warnProjection.polygon);
    setWarnTracked(true);
  };

  const warnHandles = useMemo<RadarDraggableHandle[]>(() => {
    if (tool !== "warngen" || !frame) return [];

    if (warnTracked) {
      return warnPolygon.map((point, index) => ({
        id: `warn-vertex-${index}`,
        point,
        label: index === 0 ? "Drag vertices to edit" : undefined,
        kind: "vertex" as const,
      }));
    }

    let point: RadarMapPoint;
    if (!warnCurrentPoint) {
      const geographic =
        data?.radar_latitude != null && data.radar_longitude != null
          ? localToLatLon(
              view.centerXKm,
              view.centerYKm,
              data.radar_latitude,
              data.radar_longitude,
            )
          : { lat: 0, lon: 0 };
      point = {
        xKm: view.centerXKm,
        yKm: view.centerYKm,
        ...geographic,
        timestamp: frame.timestamp,
      };
    } else {
      const frameMs = new Date(frame.timestamp).getTime();
      const currentMs = new Date(warnCurrentPoint.timestamp ?? frame.timestamp).getTime();
      point =
        frameMs < currentMs
          ? warnPreviousPoint ?? { ...warnCurrentPoint, timestamp: frame.timestamp }
          : warnCurrentPoint;
    }

    return [
      {
        id: "warn-storm",
        point,
        label: "Drag Me to Storm",
        kind: "storm",
      },
    ];
  }, [
    data?.radar_latitude,
    data?.radar_longitude,
    frame,
    tool,
    view.centerXKm,
    view.centerYKm,
    warnCurrentPoint,
    warnPolygon,
    warnPreviousPoint,
    warnTracked,
  ]);

  const onWarnHandleChange = (id: string, point: RadarMapPoint) => {
    if (id.startsWith("warn-vertex-")) {
      const index = Number(id.replace("warn-vertex-", ""));
      if (!Number.isInteger(index)) return;
      setWarnPolygon((current) =>
        current.map((existing, itemIndex) =>
          itemIndex === index
            ? { ...point, timestamp: existing.timestamp ?? warnCurrentPoint?.timestamp }
            : existing,
        ),
      );
      return;
    }

    if (id !== "warn-storm" || !frame) return;

    if (!warnCurrentPoint) {
      setWarnCurrentPoint({ ...point, timestamp: frame.timestamp });
      setWarnPreviousPoint(null);
      return;
    }

    const frameMs = new Date(frame.timestamp).getTime();
    const currentMs = new Date(warnCurrentPoint.timestamp ?? frame.timestamp).getTime();

    if (frameMs < currentMs) {
      setWarnPreviousPoint({ ...point, timestamp: frame.timestamp });
    } else {
      setWarnCurrentPoint({ ...point, timestamp: frame.timestamp });
      if (frameMs > currentMs) setWarnPreviousPoint(null);
    }
    setWarnPolygon([]);
    setWarnTracked(false);
  };

  const activeWarnings = warnings.filter((warning) => warning.status === "active");

  const toolStatus = useMemo(() => {
    if (tool === "cursor") return "Cursor interrogation";
    if (tool === "distance-bearing") {
      return measurement
        ? `Distance/Bearing: ${measurement.distanceNm.toFixed(1)} nm at ${measurement.bearing.toFixed(1)}°`
        : toolPoints.length
          ? "Distance/Bearing: click the endpoint"
          : "Distance/Bearing: click the starting point";
    }
    if (tool === "distance-speed") {
      return measurement?.speedKt != null
        ? `Distance/Speed: ${measurement.bearing.toFixed(1)}° at ${measurement.speedKt.toFixed(1)} kt over ${measurement.minutes.toFixed(1)} min`
        : toolPoints.length
          ? "Distance/Speed: step to a later scan, then click the new storm position"
          : "Distance/Speed: click the earlier storm position";
    }
    if (tool === "warngen") {
      if (warnTracked) {
        return `WarnGen: track polygon generated · drag vertices to refine`;
      }
      if (!warnCurrentPoint) {
        return "WarnGen: drag the marker onto the threat on the current scan";
      }
      if (!warnPreviousPoint) {
        return "WarnGen: step back 3–4 scans, then drag the marker to the earlier threat position";
      }
      return warnMeasurement
        ? `WarnGen: ${warnMeasurement.bearing.toFixed(1)}° at ${warnMeasurement.speedKt.toFixed(1)} kt · ${warnFrameSeparation} scan${warnFrameSeparation === 1 ? "" : "s"} apart`
        : "WarnGen: choose an earlier scan for the second storm position";
    }
    return measurement?.speedKt != null
      ? `Storm Track: ${measurement.bearing.toFixed(1)}° at ${measurement.speedKt.toFixed(1)} kt; projected every 5 min to +30 min`
      : toolPoints.length
        ? "Storm Track: step to a later scan, then click the current storm position"
        : "Storm Track: click the earlier storm position";
  }, [
    measurement,
    tool,
    toolPoints.length,
    warnCurrentPoint,
    warnFrameSeparation,
    warnMeasurement,
    warnPreviousPoint,
    warnTracked,
  ]);

  const legacyPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    legacyDrag.current = {
      x: event.clientX,
      y: event.clientY,
      panX: legacyPan.x,
      panY: legacyPan.y,
    };
  };

  const legacyPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!legacyDrag.current) return;
    setLegacyPan({
      x: legacyDrag.current.panX + event.clientX - legacyDrag.current.x,
      y: legacyDrag.current.panY + event.clientY - legacyDrag.current.y,
    });
  };

  const legacyPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    legacyDrag.current = null;
  };

  const legacyWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.001);
    setLegacyZoom((value) => Math.max(1, Math.min(6, value * factor)));
  };

  const hasGeographicRadar =
    Boolean(
      frame?.data_url &&
        frame.grid &&
        data?.radar_latitude != null &&
        data?.radar_longitude != null,
    );

  return (
    <section className="panel primary radar-workspace">
      <div className="radar-heading">
        <div>
          <h2>Radar Operator</h2>
          <p className="muted">
            {data?.radar_site
              ? `${data.radar_site} archived Level II playback`
              : "Archived radar playback"}
          </p>
        </div>
        <div className="radar-scan-status">
          <span>{frameTime(frame?.timestamp)}</span>
          <strong>
            {frames.length
              ? `${safeIndex + 1} / ${frames.length} available scans`
              : "No scans available"}
          </strong>
        </div>
      </div>

      <div className="radar-toolbar">
        <label>
          Product
          <select
            value={product}
            onChange={(event) => {
              setProduct(event.target.value);
              setFollowLatest(true);
            }}
          >
            {(data?.products.length
              ? data.products
              : [{ id: "REF", label: "Base Reflectivity", units: "dBZ" }]
            ).map((item) => (
              <option value={item.id} key={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Elevation
          <select
            value={elevation}
            onChange={(event) => {
              setElevation(Number(event.target.value));
              setFollowLatest(true);
            }}
          >
            {(data?.elevations.length ? data.elevations : [0.5]).map((value) => (
              <option value={value} key={value}>
                {value.toFixed(1)}°
              </option>
            ))}
          </select>
        </label>

        <div className="radar-button-group">
          <button onClick={selectPrevious} disabled={frames.length === 0 || safeIndex === 0}>
            ◀ Scan
          </button>
          <button
            onClick={() => {
              setFollowLatest(false);
              setPlaying((value) => !value);
            }}
            disabled={frames.length < 2}
          >
            {playing ? "Pause" : "Loop"}
          </button>
          <button
            onClick={selectNext}
            disabled={frames.length === 0 || safeIndex >= frames.length - 1}
          >
            Scan ▶
          </button>
          <button onClick={goLatest} disabled={frames.length === 0}>
            Latest
          </button>
        </div>

        <label className="compact-control">
          Speed
          <select
            value={loopSpeedMs}
            onChange={(event) => setLoopSpeedMs(Number(event.target.value))}
          >
            <option value={250}>0.25 s</option>
            <option value={500}>0.5 s</option>
            <option value={750}>0.75 s</option>
            <option value={1000}>1.0 s</option>
          </select>
        </label>

        <label className="compact-control">
          End dwell
          <select
            value={endDwellMs}
            onChange={(event) => setEndDwellMs(Number(event.target.value))}
          >
            <option value={750}>0.75 s</option>
            <option value={1500}>1.5 s</option>
            <option value={2500}>2.5 s</option>
          </select>
        </label>

        <label className="radar-check">
          <input
            type="checkbox"
            checked={rocking}
            onChange={(event) => {
              setRocking(event.target.checked);
              loopDirection.current = 1;
            }}
          />
          Rock
        </label>

        <div className="radar-button-group radar-layer-control">
          <button onClick={() => setLayersOpen((value) => !value)}>
            Layers
          </button>
          {layersOpen && (
            <div className="radar-layer-menu">
              {(
                [
                  ["counties", "Parish / county boundaries"],
                  ["states", "State boundaries"],
                  ["cities", "Cities / towns"],
                  ["highways", "Major highways / interstates"],
                  ["rangeRings", "Range rings"],
                  ["radarSite", "KLIX radar site"],
                  ["event", "Endymion event location"],
                  ["warnings", "Warning polygons"],
                  ["reports", "Reports / radar injects"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={(event) =>
                      setLayers((current) => ({
                        ...current,
                        [key]: event.target.checked,
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="radar-button-group">
          <button onClick={resetView}>Home View</button>
          <button onClick={() => void toggleFullscreen()}>Fullscreen</button>
        </div>
      </div>

      <div className="radar-toolstrip">
        {(
          [
            ["cursor", "Cursor"],
            ["distance-bearing", "Distance / Bearing"],
            ["distance-speed", "Distance / Speed"],
            ["storm-track", "Storm Track"],
            ["warngen", "WarnGen"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={tool === id ? "active" : ""}
            onClick={() => {
              setTool(id);
              setToolPoints([]);
              setEditingWarningId(null);
            }}
          >
            {label}
          </button>
        ))}
        <span className="radar-tool-status">{toolStatus}</span>
        {tool !== "cursor" && toolPoints.length > 0 && (
          <button className="radar-clear-tool" onClick={() => setToolPoints([])}>
            Clear
          </button>
        )}
      </div>

      {tool === "warngen" && (
        <div className="radar-warngen-panel">
          <div>
            <strong>WarnGen</strong>
            <span className="muted">
              Click 3–12 vertices on the radar to define the warning polygon.
            </span>
          </div>
          <label>
            Warning
            <select
              value={warningHazard}
              disabled={Boolean(editingWarningId)}
              onChange={(event) => setWarningHazard(event.target.value as "TOR" | "SVR")}
            >
              <option value="TOR">Tornado Warning</option>
              <option value="SVR">Severe Thunderstorm Warning</option>
            </select>
          </label>
          <label>
            Duration
            <select
              value={warningDuration}
              disabled={Boolean(editingWarningId)}
              onChange={(event) => setWarningDuration(Number(event.target.value))}
            >
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
            </select>
          </label>
          <span className="radar-warngen-count">
            {toolPoints.length} {toolPoints.length === 1 ? "vertex" : "vertices"}
          </span>
          <button
            className="primary-action"
            disabled={toolPoints.length < 3}
            onClick={issueOrUpdateWarning}
          >
            {editingWarningId ? "Update Warning Polygon" : "Issue Warning"}
          </button>
          <button
            onClick={() => {
              setToolPoints([]);
              setEditingWarningId(null);
            }}
            disabled={toolPoints.length === 0 && !editingWarningId}
          >
            Clear / Cancel
          </button>
        </div>
      )}

      {activeWarnings.length > 0 && (
        <div className="radar-active-warnings">
          <strong>Active Warnings</strong>
          {activeWarnings.map((warning) => (
            <div className="radar-active-warning" key={warning.id}>
              <div>
                <span className={`warning-badge ${warning.hazard.toLowerCase()}`}>
                  {warning.hazard}
                </span>
                <strong>{warning.label}</strong>
                <span>
                  expires {new Date(warning.expires_at).toISOString().slice(11, 16)}Z
                </span>
                {warning.inherited && <span>Inherited at exercise start</span>}
              </div>
              {!warning.inherited && (
                <div className="radar-warning-actions">
                  <button onClick={() => beginWarningRedraw(warning)}>Redraw</button>
                  <button
                    onClick={() =>
                      onWarningAction({
                        type: "warning_update",
                        warning_id: warning.id,
                        extend_minutes: 15,
                      })
                    }
                  >
                    +15 min
                  </button>
                  <button
                    onClick={() =>
                      onWarningAction({
                        type: "warning_cancel",
                        warning_id: warning.id,
                      })
                    }
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {!data?.available ? (
        <div className="radar-empty">
          <h3>Radar cache not loaded</h3>
          <p>
            This session is ready for radar playback, but the selected scenario does not yet have a
            built radar cache. Use the NEXRAD fetch and radar-cache scripts before the exercise.
          </p>
        </div>
      ) : frames.length === 0 ? (
        <div className="radar-empty">
          <h3>Waiting for the first scan</h3>
          <p>
            No {product} {elevation.toFixed(1)}° frame has reached the current simulation time yet.
            Future frames are intentionally hidden.
          </p>
        </div>
      ) : (
        <div ref={fullscreenRef} className="radar-display-shell">
          {hasGeographicRadar && frame && data?.radar_latitude != null && data.radar_longitude != null ? (
            <RadarGeographicCanvas
              frame={frame}
              product={currentProduct}
              radarLatitude={data.radar_latitude}
              radarLongitude={data.radar_longitude}
              radarAltitudeM={data.radar_altitude_m}
              rangeKm={data.range_km ?? DEFAULT_RANGE_KM}
              view={view}
              layers={layers}
              eventMarker={eventMarker}
              warningPolygons={warningPolygons}
              pointOverlays={pointOverlays}
              annotations={annotations}
              onViewChange={setView}
              onCursorSample={setCursorSample}
              onMapClick={onMapClick}
              onResetView={resetView}
            />
          ) : (
            <div
              className="radar-canvas radar-legacy-canvas"
              onPointerDown={legacyPointerDown}
              onPointerMove={legacyPointerMove}
              onPointerUp={legacyPointerUp}
              onPointerCancel={legacyPointerUp}
              onWheel={legacyWheel}
              onDoubleClick={resetView}
              aria-label="Legacy radar image display; drag to pan and wheel to zoom"
            >
              <img
                src={frame.asset_url}
                alt={`${data.radar_site ?? "Radar"} ${product} ${elevation.toFixed(1)} degree at ${frameTime(frame.timestamp)}`}
                draggable={false}
                style={{
                  transform: `translate(${legacyPan.x}px, ${legacyPan.y}px) scale(${legacyZoom})`,
                }}
              />
              <div className="radar-legacy-badge">
                PNG compatibility mode — rebuild the radar cache for gate interrogation
              </div>
            </div>
          )}

          <div className="radar-interrogation-bar">
            <span>
              <strong>{data.radar_site ?? "RADAR"}</strong>{" "}
              {frame.grid?.actual_elevation?.toFixed(1) ?? elevation.toFixed(1)}°{" "}
              <strong>{product}</strong>{" "}
              {cursorSample ? formatCursorValue(product, cursorSample.value) : "—"}
            </span>
            <span>
              Az: {cursorSample ? `${cursorSample.azimuth.toFixed(1)}°` : "—"} · Range:{" "}
              {cursorSample ? `${cursorSample.rangeNm.toFixed(1)} nm` : "—"}
            </span>
            <span>
              Lat/Lon:{" "}
              {cursorSample
                ? `${cursorSample.lat.toFixed(3)}, ${cursorSample.lon.toFixed(3)}`
                : "—"}
            </span>
            <span>
              Beam Height:{" "}
              {cursorSample ? `~${cursorSample.beamHeightKft.toFixed(1)} kft AGL` : "—"}
            </span>
          </div>

          <div className="radar-footer">
            <span>
              <strong>{product}</strong> · {elevation.toFixed(1)}°
            </span>
            <span>
              {followLatest ? "Following latest available scan" : "Reviewing earlier scan"}
            </span>
            <span>
              {hasGeographicRadar
                ? "Data-aware geographic mode"
                : "PNG compatibility mode"}
            </span>
            <span>
              Wheel zoom · drag pan · ←/→ scan · ↑/↓ tilt · 1–4 product · Space loop · Home latest · F fullscreen · 0 reset
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
