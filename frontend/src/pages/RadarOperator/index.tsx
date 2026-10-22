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
  ExerciseEvent,
  RadarFrameResponse,
  RadarProductSummary,
  WarningRecord,
} from "../../types/simulation";
import { formatExerciseDateTime, formatExerciseTime } from "../../utils/time";
import { frameIndexAtOrBefore } from "../../utils/radarTimeSync";
import {
  CursorSample,
  RadarAnnotation,
  RadarDraggableHandle,
  RadarGeographicCanvas,
  RadarLayerState,
  RadarMapPoint,
  RadarView,
  distanceBearing,
  getNearestWarnGenCity,
  getWarnGenAffectedCounties,
  getWarnGenImpactedCities,
  latLonToLocal,
  localToLatLon,
} from "./RadarGeographicCanvas";

type Props = {
  sessionCode: string;
  warnings: WarningRecord[];
  events: ExerciseEvent[];
  onWarningAction: (payload: object) => void;
};

type WarnBasis =
  | "doppler"
  | "doppler_squall"
  | "radar_confirmed"
  | "spotter"
  | "law_enforcement"
  | "emergency_management"
  | "broadcast_media"
  | "public";

type TorHeadline = "base" | "considerable" | "emergency" | "landspout";
type WarnLocationMode = "pathcast" | "cities";
type WarnTrackType = "one_storm" | "line_of_storms";
type SvsAction = "COR" | "CON" | "CAN" | "EXP";
type SvsEndReason =
  | "weakened"
  | "moved_out"
  | "weakened_and_moved"
  | "tor_downgrade"
  | "tor_reissue";

type RadarTool =
  | "cursor"
  | "distance-bearing"
  | "distance-speed"
  | "storm-track"
  | "warngen";

const PRODUCT_KEYS = ["REF", "VEL", "CC", "ZDR"];
const DEFAULT_RANGE_KM = 230;

function frameTime(value?: string) {
  return formatExerciseDateTime(value, "No scan");
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

function compassDirection(bearing: number) {
  const labels = [
    "NORTH",
    "NORTH-NORTHEAST",
    "NORTHEAST",
    "EAST-NORTHEAST",
    "EAST",
    "EAST-SOUTHEAST",
    "SOUTHEAST",
    "SOUTH-SOUTHEAST",
    "SOUTH",
    "SOUTH-SOUTHWEST",
    "SOUTHWEST",
    "WEST-SOUTHWEST",
    "WEST",
    "WEST-NORTHWEST",
    "NORTHWEST",
    "NORTH-NORTHWEST",
  ];
  return labels[Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16];
}

function localWarnTime(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
    .format(new Date(value))
    .toUpperCase();
}

function warningHeaderTime(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
    .format(new Date(value))
    .toUpperCase();
}

function warningAreaLabel(fips: string, name: string) {
  return fips.startsWith("22") ? `${name} Parish` : `${name} County`;
}

function radarMidpoint(
  first: RadarMapPoint,
  second: RadarMapPoint,
  radarLatitude: number,
  radarLongitude: number,
): RadarMapPoint {
  const xKm = (first.xKm + second.xKm) / 2;
  const yKm = (first.yKm + second.yKm) / 2;
  return {
    xKm,
    yKm,
    ...localToLatLon(xKm, yKm, radarLatitude, radarLongitude),
    timestamp: first.timestamp ?? second.timestamp,
  };
}

function defaultWarnLine(
  centerXKm: number,
  centerYKm: number,
  timestamp: string,
  radarLatitude: number,
  radarLongitude: number,
): RadarMapPoint[] {
  const halfLengthKm = 30;
  return [-halfLengthKm, halfLengthKm].map((offset) => {
    const xKm = centerXKm;
    const yKm = centerYKm + offset;
    return {
      xKm,
      yKm,
      ...localToLatLon(xKm, yKm, radarLatitude, radarLongitude),
      timestamp,
    };
  });
}

function warningBasisDetails(hazard: "TOR" | "SVR", basis: WarnBasis) {
  const sourceLabels: Record<WarnBasis, string> = {
    doppler: "RADAR INDICATED",
    doppler_squall: "RADAR INDICATED",
    radar_confirmed: "RADAR CONFIRMED",
    spotter: "TRAINED WEATHER SPOTTERS",
    law_enforcement: "LAW ENFORCEMENT",
    emergency_management: "EMERGENCY MANAGEMENT",
    broadcast_media: "BROADCAST MEDIA",
    public: "PUBLIC",
  };
  const subject = hazard === "TOR"
    ? "a severe thunderstorm capable of producing a tornado"
    : "a severe thunderstorm";

  const phrases: Record<WarnBasis, string> = {
    doppler: `Doppler radar indicated ${subject}`,
    doppler_squall:
      "Doppler radar indicated a line of severe thunderstorms capable of producing embedded tornadoes",
    radar_confirmed: "Doppler radar confirmed a tornado",
    spotter: hazard === "TOR"
      ? "trained weather spotters reported a tornado"
      : "trained weather spotters reported severe weather",
    law_enforcement: hazard === "TOR"
      ? "law enforcement reported a tornado"
      : "law enforcement reported severe weather",
    emergency_management: hazard === "TOR"
      ? "emergency management reported a tornado"
      : "emergency management reported severe weather",
    broadcast_media: hazard === "TOR"
      ? "broadcast media reported a tornado"
      : "broadcast media reported severe weather",
    public: hazard === "TOR"
      ? "the public reported a tornado"
      : "the public reported severe weather",
  };
  return { source: sourceLabels[basis], phrase: phrases[basis] };
}

function formatLatLonPolygon(points: RadarMapPoint[]) {
  return points
    .map((point) => {
      const lat = Math.round(Math.abs(point.lat) * 100).toString().padStart(4, "0");
      const lon = Math.round(Math.abs(point.lon) * 100).toString().padStart(4, "0");
      return `${lat} ${lon}`;
    })
    .join(" ");
}

function projectToSegment(
  point: RadarMapPoint,
  start: RadarMapPoint,
  end: RadarMapPoint,
) {
  const dx = end.xKm - start.xKm;
  const dy = end.yKm - start.yKm;
  const lengthSquared = dx * dx + dy * dy;
  const rawT =
    lengthSquared > 0
      ? ((point.xKm - start.xKm) * dx + (point.yKm - start.yKm) * dy) /
        lengthSquared
      : 0;
  const t = Math.max(0, Math.min(1, rawT));
  const xKm = start.xKm + t * dx;
  const yKm = start.yKm + t * dy;
  return {
    xKm,
    yKm,
    distanceSquared:
      (point.xKm - xKm) * (point.xKm - xKm) +
      (point.yKm - yKm) * (point.yKm - yKm),
  };
}

export function RadarOperator({ sessionCode, warnings, events, onWarningAction }: Props) {
  const [product, setProduct] = useState("REF");
  const [elevation, setElevation] = useState(0.5);
  const [data, setData] = useState<RadarFrameResponse | null>(null);
  const [eventConfig, setEventConfig] = useState<EventOperationsConfig | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [followLatest, setFollowLatest] = useState(true);
  const pendingTimeAnchor = useRef<string | null>(null);
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
  const [warnTrackType, setWarnTrackType] = useState<WarnTrackType>("one_storm");
  const [warnCurrentPoint, setWarnCurrentPoint] = useState<RadarMapPoint | null>(null);
  const [warnPreviousPoint, setWarnPreviousPoint] = useState<RadarMapPoint | null>(null);
  const [warnCurrentLine, setWarnCurrentLine] = useState<RadarMapPoint[] | null>(null);
  const [warnPreviousLine, setWarnPreviousLine] = useState<RadarMapPoint[] | null>(null);
  const [warnPolygon, setWarnPolygon] = useState<RadarMapPoint[]>([]);
  const [warnTracked, setWarnTracked] = useState(false);
  const [warnHatched, setWarnHatched] = useState(false);
  const [warnTorHeadline, setWarnTorHeadline] = useState<TorHeadline>("base");
  const [warnBasis, setWarnBasis] = useState<WarnBasis>("doppler");
  const [warnTorHail, setWarnTorHail] = useState("small");
  const [warnSvrWind, setWarnSvrWind] = useState(60);
  const [warnSvrHail, setWarnSvrHail] = useState(1);
  const [warnObservedWind, setWarnObservedWind] = useState(false);
  const [warnObservedHail, setWarnObservedHail] = useState(false);
  const [warnTornadoPossible, setWarnTornadoPossible] = useState(false);
  const [warnLocationMode, setWarnLocationMode] = useState<WarnLocationMode>("pathcast");
  const [warnSpecialEvent, setWarnSpecialEvent] = useState(false);
  const [warnRainWrappedCta, setWarnRainWrappedCta] = useState(false);
  const [warnNighttimeCta, setWarnNighttimeCta] = useState(false);
  const [warnTorrentialRainfallCta, setWarnTorrentialRainfallCta] = useState(false);
  const [warnDraftText, setWarnDraftText] = useState("");
  const [svsWarningId, setSvsWarningId] = useState<string | null>(null);
  const [svsAction, setSvsAction] = useState<SvsAction>("CON");
  const [svsReason, setSvsReason] = useState<SvsEndReason>("weakened");
  const [svsStillHail, setSvsStillHail] = useState(false);
  const [svsStillWind, setSvsStillWind] = useState(false);
  const [svsStillRain, setSvsStillRain] = useState(false);
  const [svsPolygon, setSvsPolygon] = useState<RadarMapPoint[]>([]);
  const [svsDraftText, setSvsDraftText] = useState("");
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
          if (pendingTimeAnchor.current !== null) {
            const anchored = frameIndexAtOrBefore(response.frames, pendingTimeAnchor.current);
            pendingTimeAnchor.current = null;
            return anchored;
          }
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

  // Do not briefly render the prior product/tilt while a new API response loads.
  const responseMatchesSelection =
    data?.selected_product === product &&
    Math.abs((data?.selected_elevation ?? elevation) - elevation) < 0.01;
  const frames = responseMatchesSelection ? data?.frames ?? [] : [];
  const safeIndex = frames.length ? Math.min(selectedIndex, frames.length - 1) : 0;
  const frame = frames[safeIndex];

  const switchFrameSeries = useCallback(
    (nextProduct: string, nextElevation: number) => {
      if (nextProduct === product && Math.abs(nextElevation - elevation) < 0.01) return;
      // Lock to the currently displayed observation time; never reuse its
      // array index in a product with a different number of real scans.
      pendingTimeAnchor.current = frame?.timestamp ?? data?.sim_time ?? null;
      setPlaying(false);
      setFollowLatest(false);
      setProduct(nextProduct);
      setElevation(nextElevation);
    },
    [product, elevation, frame?.timestamp, data?.sim_time],
  );

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
  const staticPointOverlays = (eventConfig?.radar_overlays?.reports ?? []).filter((report) => {
    const start = report.valid_at ? new Date(report.valid_at).getTime() : -Infinity;
    const end = report.expires_at ? new Date(report.expires_at).getTime() : Infinity;
    return Number.isNaN(overlayTime) || (overlayTime >= start && overlayTime <= end);
  });

  const releasedReportOverlays = events
    .filter(
      (event) =>
        event.type === "storm_report" &&
        event.plot_on_radar !== false &&
        event.lat != null &&
        event.lon != null,
    )
    .filter((event) => {
      const start = event.sim_time ? new Date(event.sim_time).getTime() : -Infinity;
      const end = event.expires_at ? new Date(event.expires_at).getTime() : Infinity;
      return Number.isNaN(overlayTime) || (overlayTime >= start && overlayTime <= end);
    })
    .map((event) => {
      const titleLead = event.title?.split("—")[0]?.trim();
      const label =
        [event.magnitude, titleLead]
          .filter((value, index, items) => Boolean(value) && items.indexOf(value) === index)
          .join(" · ") || "Storm Report";

      return {
        id: event.event_id ?? event.scheduled_id ?? `report-${event.lat}-${event.lon}`,
        label,
        kind: event.report_kind ?? "report",
        lat: event.lat!,
        lon: event.lon!,
        valid_at: event.sim_time,
        expires_at: event.expires_at,
      };
    });

  const pointOverlays = [...staticPointOverlays, ...releasedReportOverlays];

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
      switchFrameSeries(product, elevations[next]);
    },
    [data?.elevations, elevation, product, switchFrameSeries],
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
          switchFrameSeries(requested, elevation);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    data?.products,
    elevation,
    frames.length,
    goLatest,
    resetView,
    selectNext,
    selectPrevious,
    stepElevation,
    switchFrameSeries,
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

  const warnCurrentReference = useMemo(() => {
    if (warnTrackType === "one_storm") return warnCurrentPoint;
    if (
      warnCurrentLine?.length === 2 &&
      data?.radar_latitude != null &&
      data.radar_longitude != null
    ) {
      return radarMidpoint(
        warnCurrentLine[0],
        warnCurrentLine[1],
        data.radar_latitude,
        data.radar_longitude,
      );
    }
    return null;
  }, [
    data?.radar_latitude,
    data?.radar_longitude,
    warnCurrentLine,
    warnCurrentPoint,
    warnTrackType,
  ]);

  const warnPreviousReference = useMemo(() => {
    if (warnTrackType === "one_storm") return warnPreviousPoint;
    if (
      warnPreviousLine?.length === 2 &&
      data?.radar_latitude != null &&
      data.radar_longitude != null
    ) {
      return radarMidpoint(
        warnPreviousLine[0],
        warnPreviousLine[1],
        data.radar_latitude,
        data.radar_longitude,
      );
    }
    return null;
  }, [
    data?.radar_latitude,
    data?.radar_longitude,
    warnPreviousLine,
    warnPreviousPoint,
    warnTrackType,
  ]);

  const warnMeasurement = useMemo(() => {
    if (!warnPreviousReference || !warnCurrentReference) return null;
    const minutes = minutesBetween(
      warnPreviousReference.timestamp,
      warnCurrentReference.timestamp,
    );
    if (minutes <= 0) return null;
    const vector = distanceBearing(warnPreviousReference, warnCurrentReference);
    const dx = warnCurrentReference.xKm - warnPreviousReference.xKm;
    const dy = warnCurrentReference.yKm - warnPreviousReference.yKm;
    const speedKt = vector.distanceNm / (minutes / 60);
    return { ...vector, minutes, speedKt, dx, dy };
  }, [warnCurrentReference, warnPreviousReference]);

  const warnProjection = useMemo(() => {
    if (
      !warnMeasurement ||
      !warnCurrentReference ||
      data?.radar_latitude == null ||
      data.radar_longitude == null
    ) {
      return null;
    }

    const trackLength = Math.hypot(warnMeasurement.dx, warnMeasurement.dy);
    if (trackLength < 0.01) return null;

    const motionX = warnMeasurement.dx / trackLength;
    const motionY = warnMeasurement.dy / trackLength;
    const futureDistanceKm =
      (trackLength / warnMeasurement.minutes) * warningDuration;

    const makePoint = (xKm: number, yKm: number): RadarMapPoint => ({
      xKm,
      yKm,
      ...localToLatLon(
        xKm,
        yKm,
        data.radar_latitude!,
        data.radar_longitude!,
      ),
      timestamp: warnCurrentReference.timestamp,
    });

    const future = makePoint(
      warnCurrentReference.xKm + motionX * futureDistanceKm,
      warnCurrentReference.yKm + motionY * futureDistanceKm,
    );

    if (warnTrackType === "line_of_storms") {
      if (!warnCurrentLine || warnCurrentLine.length !== 2) return null;

      const first = warnCurrentLine[0];
      const second = warnCurrentLine[1];
      const lineDx = second.xKm - first.xKm;
      const lineDy = second.yKm - first.yKm;
      const lineLength = Math.hypot(lineDx, lineDy);
      if (lineLength < 0.01) return null;

      const lineX = lineDx / lineLength;
      const lineY = lineDy / lineLength;

      // Mirrors the AWIPS WarnGen Line of Storms construction:
      // ~8 km behind the current line, project through the warning duration,
      // add ~14.4 km beyond the projected line, and extend the forward line
      // ends ~16 km (rear line ends ~8 km).
      const rearBufferKm = 8;
      const aheadExtraKm = 14.4;
      const forwardEndExtensionKm = 16;
      const rearEndExtensionKm = 8;
      const frontDistanceKm = futureDistanceKm + aheadExtraKm;

      const frontFirst = makePoint(
        first.xKm + motionX * frontDistanceKm - lineX * forwardEndExtensionKm,
        first.yKm + motionY * frontDistanceKm - lineY * forwardEndExtensionKm,
      );
      const frontSecond = makePoint(
        second.xKm + motionX * frontDistanceKm + lineX * forwardEndExtensionKm,
        second.yKm + motionY * frontDistanceKm + lineY * forwardEndExtensionKm,
      );
      const rearSecond = makePoint(
        second.xKm - motionX * rearBufferKm + lineX * rearEndExtensionKm,
        second.yKm - motionY * rearBufferKm + lineY * rearEndExtensionKm,
      );
      const rearFirst = makePoint(
        first.xKm - motionX * rearBufferKm - lineX * rearEndExtensionKm,
        first.yKm - motionY * rearBufferKm - lineY * rearEndExtensionKm,
      );

      return {
        future,
        polygon: [frontFirst, frontSecond, rearSecond, rearFirst],
      };
    }

    const perpX = -motionY;
    const perpY = motionX;
    const rearHalfWidthKm = 10;
    const forwardHalfWidthKm = 15;
    const polygon = [
      makePoint(
        warnCurrentReference.xKm + perpX * rearHalfWidthKm,
        warnCurrentReference.yKm + perpY * rearHalfWidthKm,
      ),
      makePoint(
        warnCurrentReference.xKm - perpX * rearHalfWidthKm,
        warnCurrentReference.yKm - perpY * rearHalfWidthKm,
      ),
      makePoint(
        future.xKm - perpX * forwardHalfWidthKm,
        future.yKm - perpY * forwardHalfWidthKm,
      ),
      makePoint(
        future.xKm + perpX * forwardHalfWidthKm,
        future.yKm + perpY * forwardHalfWidthKm,
      ),
    ];

    return { future, polygon };
  }, [
    data?.radar_latitude,
    data?.radar_longitude,
    warnCurrentLine,
    warnCurrentReference,
    warnMeasurement,
    warnTrackType,
    warningDuration,
  ]);

  const warnCurrentFrameIndex = warnCurrentReference
    ? frames.findIndex((item) => item.timestamp === warnCurrentReference.timestamp)
    : -1;
  const warnPreviousFrameIndex = warnPreviousReference
    ? frames.findIndex((item) => item.timestamp === warnPreviousReference.timestamp)
    : -1;
  const warnFrameSeparation =
    warnCurrentFrameIndex >= 0 && warnPreviousFrameIndex >= 0
      ? warnCurrentFrameIndex - warnPreviousFrameIndex
      : 0;

  const warnDisplayedLine = useMemo(() => {
    if (
      warnTrackType !== "line_of_storms" ||
      !frame ||
      data?.radar_latitude == null ||
      data.radar_longitude == null
    ) {
      return null;
    }

    if (!warnCurrentLine) {
      return defaultWarnLine(
        view.centerXKm,
        view.centerYKm,
        frame.timestamp,
        data.radar_latitude,
        data.radar_longitude,
      );
    }

    const currentMs = new Date(
      warnCurrentLine[0]?.timestamp ?? frame.timestamp,
    ).getTime();
    const frameMs = new Date(frame.timestamp).getTime();
    if (frameMs < currentMs) {
      return (
        warnPreviousLine ??
        warnCurrentLine.map((point) => ({
          ...point,
          timestamp: frame.timestamp,
        }))
      );
    }
    return warnCurrentLine;
  }, [
    data?.radar_latitude,
    data?.radar_longitude,
    frame,
    view.centerXKm,
    view.centerYKm,
    warnCurrentLine,
    warnPreviousLine,
    warnTrackType,
  ]);

  const annotations = useMemo<RadarAnnotation[]>(() => {
    if (tool === "warngen") {
      const items: RadarAnnotation[] = [];

      if (
        warnTrackType === "line_of_storms" &&
        !warnTracked &&
        warnDisplayedLine?.length === 2
      ) {
        items.push({
          id: "warngen-drag-line",
          points: warnDisplayedLine,
          label: "Drag Me to Storm",
        });
      }

      if (warnPreviousReference && warnCurrentReference) {
        const trackPoints = warnProjection
          ? [warnPreviousReference, warnCurrentReference, warnProjection.future]
          : [warnPreviousReference, warnCurrentReference];
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
    warnCurrentLine,
    warnCurrentPoint,
    warnCurrentReference,
    warnMeasurement,
    warnPolygon,
    warnPreviousLine,
    warnPreviousPoint,
    warnPreviousReference,
    warnProjection,
    warnTrackType,
    warnTracked,
    warningHazard,
  ]);

  const onMapClick = (point: RadarMapPoint) => {
    if (tool === "cursor" || tool === "warngen") return;
    setToolPoints((current) => (current.length >= 2 ? [point] : [...current, point]));
  };

  const resetWarnGenSelections = () => {
    setWarnTorHeadline("base");
    setWarnBasis(
      warningHazard === "TOR" && warnTrackType === "line_of_storms"
        ? "doppler_squall"
        : "doppler",
    );
    setWarnTorHail("small");
    setWarnSvrWind(60);
    setWarnSvrHail(1);
    setWarnObservedWind(false);
    setWarnObservedHail(false);
    setWarnTornadoPossible(false);
    setWarnLocationMode("pathcast");
    setWarnSpecialEvent(false);
    setWarnRainWrappedCta(false);
    setWarnNighttimeCta(false);
    setWarnTorrentialRainfallCta(false);
    setWarnDraftText("");
  };

  const startWarnGen = () => {
    setPlaying(false);
    setTool("warngen");
    setToolPoints([]);
    setWarnCurrentPoint(null);
    setWarnPreviousPoint(null);
    setWarnCurrentLine(null);
    setWarnPreviousLine(null);
    setWarnPolygon([]);
    setWarnTracked(false);
    setWarnHatched(false);
    resetWarnGenSelections();
    goLatest();
  };

  const restartWarnGen = () => {
    setPlaying(false);
    setWarnCurrentPoint(null);
    setWarnPreviousPoint(null);
    setWarnCurrentLine(null);
    setWarnPreviousLine(null);
    setWarnPolygon([]);
    setWarnTracked(false);
    setWarnHatched(false);
    resetWarnGenSelections();
    goLatest();
  };

  const changeWarnTrackType = (next: WarnTrackType) => {
    setWarnTrackType(next);
    if (warningHazard === "TOR") {
      if (next === "line_of_storms" && warnBasis === "doppler") {
        setWarnBasis("doppler_squall");
      } else if (next === "one_storm" && warnBasis === "doppler_squall") {
        setWarnBasis("doppler");
      }
    }
    setWarnCurrentPoint(null);
    setWarnPreviousPoint(null);
    setWarnCurrentLine(null);
    setWarnPreviousLine(null);
    setWarnPolygon([]);
    setWarnTracked(false);
    setWarnHatched(false);
    setWarnDraftText("");
    goLatest();
  };

  const trackWarnGenStorm = () => {
    if (!warnProjection || !warnMeasurement) return;
    setWarnPolygon(warnProjection.polygon);
    setWarnTracked(true);
    setWarnHatched(false);
    setWarnDraftText("");
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

    if (warnTrackType === "line_of_storms") {
      if (
        !warnDisplayedLine ||
        warnDisplayedLine.length !== 2 ||
        data?.radar_latitude == null ||
        data.radar_longitude == null
      ) {
        return [];
      }

      const center = radarMidpoint(
        warnDisplayedLine[0],
        warnDisplayedLine[1],
        data.radar_latitude,
        data.radar_longitude,
      );
      center.timestamp = frame.timestamp;

      return [
        {
          id: "warn-line-0",
          point: warnDisplayedLine[0],
          label: "Line end",
          kind: "line" as const,
        },
        {
          id: "warn-line-center",
          point: center,
          label: "Drag line",
          kind: "storm" as const,
        },
        {
          id: "warn-line-1",
          point: warnDisplayedLine[1],
          label: "Line end",
          kind: "line" as const,
        },
      ];
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
    warnDisplayedLine,
    warnPolygon,
    warnPreviousPoint,
    warnTrackType,
    warnTracked,
  ]);

  const onWarnHandleChange = (id: string, point: RadarMapPoint) => {
    if (id.startsWith("warn-vertex-")) {
      const index = Number(id.replace("warn-vertex-", ""));
      if (!Number.isInteger(index)) return;
      setWarnPolygon((current) =>
        current.map((existing, itemIndex) =>
          itemIndex === index
            ? {
                ...point,
                timestamp:
                  existing.timestamp ?? warnCurrentReference?.timestamp,
              }
            : existing,
        ),
      );
      setWarnHatched(false);
      setWarnDraftText("");
      return;
    }

    if (!frame) return;

    if (warnTrackType === "line_of_storms") {
      if (
        !warnDisplayedLine ||
        warnDisplayedLine.length !== 2 ||
        data?.radar_latitude == null ||
        data.radar_longitude == null
      ) {
        return;
      }

      let nextLine = warnDisplayedLine.map((existing) => ({
        ...existing,
        timestamp: frame.timestamp,
      }));

      if (id === "warn-line-center") {
        const center = radarMidpoint(
          nextLine[0],
          nextLine[1],
          data.radar_latitude,
          data.radar_longitude,
        );
        const dx = point.xKm - center.xKm;
        const dy = point.yKm - center.yKm;
        nextLine = nextLine.map((existing) => {
          const xKm = existing.xKm + dx;
          const yKm = existing.yKm + dy;
          return {
            xKm,
            yKm,
            ...localToLatLon(
              xKm,
              yKm,
              data.radar_latitude!,
              data.radar_longitude!,
            ),
            timestamp: frame.timestamp,
          };
        });
      } else if (id === "warn-line-0" || id === "warn-line-1") {
        const index = id === "warn-line-0" ? 0 : 1;
        nextLine[index] = { ...point, timestamp: frame.timestamp };
      } else {
        return;
      }

      const currentTimestamp =
        warnCurrentLine?.[0]?.timestamp ?? frame.timestamp;
      const frameMs = new Date(frame.timestamp).getTime();
      const currentMs = new Date(currentTimestamp).getTime();

      if (!warnCurrentLine || frameMs >= currentMs) {
        setWarnCurrentLine(nextLine);
        if (warnCurrentLine && frameMs > currentMs) {
          setWarnPreviousLine(null);
        }
      } else {
        setWarnPreviousLine(nextLine);
      }

      setWarnPolygon([]);
      setWarnTracked(false);
      setWarnHatched(false);
      setWarnDraftText("");
      return;
    }

    if (id !== "warn-storm") return;

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
    setWarnHatched(false);
    setWarnDraftText("");
  };

  const addWarnPolygonVertex = (point: RadarMapPoint) => {
    if (
      tool !== "warngen" ||
      !warnTracked ||
      warnPolygon.length < 3 ||
      warnPolygon.length >= 19 ||
      data?.radar_latitude == null ||
      data.radar_longitude == null
    ) {
      return;
    }

    let bestIndex = 0;
    let bestProjection = projectToSegment(
      point,
      warnPolygon[0],
      warnPolygon[1],
    );
    for (let index = 1; index < warnPolygon.length; index += 1) {
      const projection = projectToSegment(
        point,
        warnPolygon[index],
        warnPolygon[(index + 1) % warnPolygon.length],
      );
      if (projection.distanceSquared < bestProjection.distanceSquared) {
        bestIndex = index;
        bestProjection = projection;
      }
    }

    const geographic = localToLatLon(
      bestProjection.xKm,
      bestProjection.yKm,
      data.radar_latitude,
      data.radar_longitude,
    );
    const inserted: RadarMapPoint = {
      xKm: bestProjection.xKm,
      yKm: bestProjection.yKm,
      ...geographic,
      timestamp: warnCurrentReference?.timestamp,
    };

    setWarnPolygon((current) => [
      ...current.slice(0, bestIndex + 1),
      inserted,
      ...current.slice(bestIndex + 1),
    ]);
    setWarnHatched(false);
    setWarnDraftText("");
  };

  const removeWarnPolygonVertex = (id: string) => {
    if (!id.startsWith("warn-vertex-") || warnPolygon.length <= 3) return;
    const index = Number(id.replace("warn-vertex-", ""));
    if (!Number.isInteger(index) || index < 0 || index >= warnPolygon.length) return;
    setWarnPolygon((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
    setWarnHatched(false);
    setWarnDraftText("");
  };

  const warnAffectedCounties = useMemo(
    () =>
      warnPolygon.length >= 3 &&
      data?.radar_latitude != null &&
      data.radar_longitude != null
        ? getWarnGenAffectedCounties(
            warnPolygon,
            data.radar_latitude,
            data.radar_longitude,
          )
        : [],
    [
      data?.radar_latitude,
      data?.radar_longitude,
      warnPolygon,
    ],
  );

  const warnNearestCity = useMemo(
    () =>
      warnCurrentReference &&
      data?.radar_latitude != null &&
      data.radar_longitude != null
        ? getNearestWarnGenCity(
            warnCurrentReference,
            data.radar_latitude,
            data.radar_longitude,
          )
        : null,
    [
      data?.radar_latitude,
      data?.radar_longitude,
      warnCurrentReference,
    ],
  );

  const warnImpactedCities = useMemo(
    () =>
      warnPolygon.length >= 3 &&
      data?.radar_latitude != null &&
      data.radar_longitude != null
        ? getWarnGenImpactedCities(
            warnPolygon,
            data.radar_latitude,
            data.radar_longitude,
          )
        : [],
    [
      data?.radar_latitude,
      data?.radar_longitude,
      warnPolygon,
    ],
  );

  const createWarnGenText = () => {
    if (
      !data?.sim_time ||
      !warnMeasurement ||
      !warnCurrentReference ||
      warnPolygon.length < 3
    ) {
      return;
    }

    const timeZone = eventConfig?.event?.timezone ?? "America/Chicago";
    const issueTime = new Date(data.sim_time);
    const expireTime = new Date(issueTime.getTime() + warningDuration * 60000);
    const issueLabel = localWarnTime(issueTime, timeZone);
    const expireLabel = localWarnTime(expireTime, timeZone);
    const motionDirection = compassDirection(warnMeasurement.bearing);
    const motionMph = Math.max(1, Math.round(warnMeasurement.speedKt * 1.15078));
    const basis = warningBasisDetails(warningHazard, warnBasis);
    const basisPhrase =
      warnTrackType === "line_of_storms" && warnBasis === "doppler"
        ? warningHazard === "TOR"
          ? "Doppler radar indicated a line of severe thunderstorms capable of producing tornadoes"
          : "Doppler radar indicated a line of severe thunderstorms"
        : basis.phrase;
    const nearestCity = warnNearestCity?.name ?? "the warned area";
    const areaLabels = warnAffectedCounties.map((county) =>
      warningAreaLabel(county.fips, county.name),
    );
    const locations = warnImpactedCities.length > 0
      ? warnImpactedCities
      : areaLabels;
    const eventName =
      eventConfig?.event?.name ??
      eventConfig?.event?.pre_parade?.name ??
      "the special event";

    const lines: string[] = [
      "BULLETIN - EAS ACTIVATION REQUESTED",
      warningHazard === "TOR" ? "TORNADO WARNING" : "SEVERE THUNDERSTORM WARNING",
      "NATIONAL WEATHER SERVICE NEW ORLEANS/BATON ROUGE LA",
      warningHeaderTime(issueTime, timeZone),
      "",
      "...THIS IS AN EXERCISE...",
      "",
      "THE NATIONAL WEATHER SERVICE IN NEW ORLEANS HAS ISSUED A",
      `* ${warningHazard === "TOR" ? "TORNADO WARNING" : "SEVERE THUNDERSTORM WARNING"} FOR...`,
      ...(areaLabels.length > 0
        ? areaLabels.map((area) => `  ${area.toUpperCase()}`)
        : ["  PORTIONS OF THE LIX WARNING AREA"]),
      `* UNTIL ${expireLabel}.`,
      `* AT ${issueLabel}, ${basisPhrase} NEAR ${nearestCity.toUpperCase()}, MOVING ${motionDirection} AT ${motionMph} MPH.`,
      "",
    ];

    if (warningHazard === "TOR") {
      const hailText =
        warnTorHail === "none"
          ? ""
          : warnTorHail === "small"
            ? " Small hail is also possible."
            : ` Hail up to ${Number(warnTorHail).toFixed(2)} inches is also possible.`;

      if (warnTorHeadline === "emergency") {
        lines.push("...TORNADO EMERGENCY...");
        lines.push("TORNADO DAMAGE THREAT...CATASTROPHIC");
      } else if (warnTorHeadline === "considerable") {
        lines.push("TORNADO DAMAGE THREAT...CONSIDERABLE");
      }

      lines.push("HAZARD...Tornado." + hailText);
      lines.push(`SOURCE...${basis.source}.`);
      lines.push(
        warnTorHeadline === "landspout"
          ? "IMPACT...Damage to roofs, siding, trees, and mobile homes is possible."
          : "IMPACT...Flying debris will be dangerous. Mobile homes may be damaged or destroyed. Damage to roofs, windows, vehicles, and trees is possible.",
      );
    } else {
      lines.push(
        `HAZARD...${warnSvrWind} MPH wind gusts and ${warnSvrHail.toFixed(2)} inch hail.`,
      );
      lines.push(`SOURCE...${basis.source}.`);
      if (warnObservedWind) lines.push("WIND THREAT...OBSERVED.");
      if (warnObservedHail) lines.push("HAIL THREAT...OBSERVED.");
      if (warnTornadoPossible) lines.push("TORNADO...POSSIBLE.");
      lines.push(
        "IMPACT...Hail damage to vehicles is expected. Expect wind damage to roofs, siding, and trees.",
      );
    }

    lines.push("");
    lines.push(
      warnLocationMode === "pathcast"
        ? "* THIS STORM WILL BE NEAR..."
        : "* LOCATIONS IMPACTED INCLUDE...",
    );
    if (locations.length > 0) {
      locations.slice(0, 10).forEach((location) => {
        lines.push(`  ${location.toUpperCase()}`);
      });
    } else {
      lines.push("  PORTIONS OF THE WARNED AREA");
    }

    if (warnSpecialEvent) {
      lines.push("");
      lines.push(
        `THOSE ATTENDING ${eventName.toUpperCase()} SHOULD FOLLOW INSTRUCTIONS FROM EVENT OFFICIALS AND BE PREPARED TO MOVE TO SAFE SHELTER.`,
      );
    }

    lines.push("");
    lines.push("PRECAUTIONARY/PREPAREDNESS ACTIONS...");
    if (warningHazard === "TOR") {
      lines.push(
        "TAKE COVER NOW. MOVE TO AN INTERIOR ROOM ON THE LOWEST FLOOR OF A STURDY BUILDING. AVOID WINDOWS.",
      );
    } else {
      lines.push(
        "FOR YOUR PROTECTION MOVE TO AN INTERIOR ROOM ON THE LOWEST FLOOR OF A BUILDING.",
      );
    }
    if (warnRainWrappedCta) {
      lines.push("HEAVY RAINFALL MAY HIDE THE TORNADO. DO NOT WAIT TO SEE OR HEAR IT.");
    }
    if (warnNighttimeCta) {
      lines.push("TORNADOES AT NIGHT CAN BE DIFFICULT TO SEE. TAKE ACTION BASED ON THE WARNING.");
    }
    if (warnTorrentialRainfallCta) {
      lines.push("TORRENTIAL RAINFALL IS OCCURRING WITH THIS STORM.");
    }

    lines.push("");
    lines.push(`LAT...LON ${formatLatLonPolygon(warnPolygon)}`);
    lines.push("");
    lines.push("...END EXERCISE MESSAGE...");

    setWarnDraftText(lines.join("\n"));
  };

  const issueWarnGenWarning = () => {
    if (!warnDraftText.trim() || warnPolygon.length < 3 || !warnMeasurement) return;

    onWarningAction({
      type: "warning_issue",
      hazard: warningHazard,
      duration_minutes: warningDuration,
      points: warnPolygon.map((point) => ({ lat: point.lat, lon: point.lon })),
      text: warnDraftText,
      attributes: {
        track_type: warnTrackType,
        motion_bearing_deg: warnMeasurement.bearing,
        motion_speed_kt: warnMeasurement.speedKt,
        duration_minutes: warningDuration,
        basis: warnBasis,
        tornado_headline: warningHazard === "TOR" ? warnTorHeadline : null,
        tornado_hail: warningHazard === "TOR" ? warnTorHail : null,
        severe_wind_mph: warningHazard === "SVR" ? warnSvrWind : null,
        severe_hail_inches: warningHazard === "SVR" ? warnSvrHail : null,
        observed_wind: warningHazard === "SVR" ? warnObservedWind : false,
        observed_hail: warningHazard === "SVR" ? warnObservedHail : false,
        tornado_possible: warningHazard === "SVR" ? warnTornadoPossible : false,
        location_mode: warnLocationMode,
        special_event: warnSpecialEvent,
        rain_wrapped_cta: warnRainWrappedCta,
        nighttime_cta: warnNighttimeCta,
        torrential_rainfall_cta: warnTorrentialRainfallCta,
        affected_areas: warnAffectedCounties.map((county) => ({
          fips: county.fips,
          name: county.name,
        })),
        impacted_cities: warnImpactedCities,
        current_line:
          warnTrackType === "line_of_storms"
            ? warnCurrentLine?.map((point) => ({
                lat: point.lat,
                lon: point.lon,
              }))
            : null,
        previous_line:
          warnTrackType === "line_of_storms"
            ? warnPreviousLine?.map((point) => ({
                lat: point.lat,
                lon: point.lon,
              }))
            : null,
      },
    });

    restartWarnGen();
  };

    const svsWarning =
    warnings.find((warning) => warning.id === svsWarningId) ?? null;

  const closeSvsFollowup = () => {
    setSvsWarningId(null);
    setSvsAction("CON");
    setSvsReason("weakened");
    setSvsStillHail(false);
    setSvsStillWind(false);
    setSvsStillRain(false);
    setSvsPolygon([]);
    setSvsDraftText("");
  };

  const beginSvsFollowup = (warning: WarningRecord) => {
    if (
      data?.radar_latitude == null ||
      data.radar_longitude == null
    ) {
      return;
    }

    restartWarnGen();
    setTool("cursor");
    setSvsWarningId(warning.id);
    setSvsAction("CON");
    setSvsReason("weakened");
    setSvsStillHail(false);
    setSvsStillWind(false);
    setSvsStillRain(false);
    setSvsDraftText("");
    setSvsPolygon(
      warning.points.map((point) => {
        const local = latLonToLocal(
          point.lat,
          point.lon,
          data.radar_latitude!,
          data.radar_longitude!,
        );
        return {
          ...local,
          lat: point.lat,
          lon: point.lon,
          timestamp: data.sim_time,
        };
      }),
    );
  };

  const svsAffectedCounties = useMemo(
    () =>
      svsPolygon.length >= 3 &&
      data?.radar_latitude != null &&
      data.radar_longitude != null
        ? getWarnGenAffectedCounties(
            svsPolygon,
            data.radar_latitude,
            data.radar_longitude,
          )
        : [],
    [
      data?.radar_latitude,
      data?.radar_longitude,
      svsPolygon,
    ],
  );

  const svsHandles = useMemo<RadarDraggableHandle[]>(
    () =>
      svsWarningId && svsAction === "CON"
        ? svsPolygon.map((point, index) => ({
            id: `svs-vertex-${index}`,
            point,
            label: index === 0 ? "Trim warned area" : undefined,
            kind: "vertex" as const,
          }))
        : [],
    [svsAction, svsPolygon, svsWarningId],
  );

  const onSvsHandleChange = (id: string, point: RadarMapPoint) => {
    if (!id.startsWith("svs-vertex-")) return;
    const index = Number(id.replace("svs-vertex-", ""));
    if (!Number.isInteger(index)) return;
    setSvsPolygon((current) =>
      current.map((existing, itemIndex) =>
        itemIndex === index
          ? { ...point, timestamp: existing.timestamp ?? data?.sim_time }
          : existing,
      ),
    );
    setSvsDraftText("");
  };

  const addSvsPolygonVertex = (point: RadarMapPoint) => {
    if (
      !svsWarningId ||
      svsAction !== "CON" ||
      svsPolygon.length < 3 ||
      svsPolygon.length >= 19 ||
      data?.radar_latitude == null ||
      data.radar_longitude == null
    ) {
      return;
    }

    let bestIndex = 0;
    let bestProjection = projectToSegment(point, svsPolygon[0], svsPolygon[1]);
    for (let index = 1; index < svsPolygon.length; index += 1) {
      const projection = projectToSegment(
        point,
        svsPolygon[index],
        svsPolygon[(index + 1) % svsPolygon.length],
      );
      if (projection.distanceSquared < bestProjection.distanceSquared) {
        bestIndex = index;
        bestProjection = projection;
      }
    }

    const geographic = localToLatLon(
      bestProjection.xKm,
      bestProjection.yKm,
      data.radar_latitude,
      data.radar_longitude,
    );
    const inserted: RadarMapPoint = {
      xKm: bestProjection.xKm,
      yKm: bestProjection.yKm,
      ...geographic,
      timestamp: data.sim_time,
    };
    setSvsPolygon((current) => [
      ...current.slice(0, bestIndex + 1),
      inserted,
      ...current.slice(bestIndex + 1),
    ]);
    setSvsDraftText("");
  };

  const removeSvsPolygonVertex = (id: string) => {
    if (!id.startsWith("svs-vertex-") || svsPolygon.length <= 3) return;
    const index = Number(id.replace("svs-vertex-", ""));
    if (!Number.isInteger(index) || index < 0 || index >= svsPolygon.length) return;
    setSvsPolygon((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
    setSvsDraftText("");
  };

  const createSvsText = () => {
    if (!svsWarning || !data?.sim_time) return;

    const timeZone = eventConfig?.event?.timezone ?? "America/Chicago";
    const issueTime = new Date(data.sim_time);
    const issueLabel = localWarnTime(issueTime, timeZone);
    const expireLabel = localWarnTime(svsWarning.expires_at, timeZone);
    const areaLabels = svsAffectedCounties.map((county) =>
      warningAreaLabel(county.fips, county.name),
    );

    const warningName = svsWarning.label.toUpperCase();
    const lines: string[] = [
      "SEVERE WEATHER STATEMENT",
      "NATIONAL WEATHER SERVICE NEW ORLEANS/BATON ROUGE LA",
      warningHeaderTime(issueTime, timeZone),
      "",
      "...THIS IS AN EXERCISE...",
      "",
    ];

    if (svsAction === "CON") {
      lines.push(`...${warningName} REMAINS IN EFFECT UNTIL ${expireLabel}...`);
      lines.push("");
      lines.push(
        `AT ${issueLabel}, THE ${warningName} REMAINS IN EFFECT FOR...`,
      );
      if (areaLabels.length) {
        areaLabels.forEach((area) => lines.push(`  ${area.toUpperCase()}`));
      } else {
        lines.push("  PORTIONS OF THE PREVIOUSLY WARNED AREA");
      }

      const attributes = svsWarning.attributes ?? {};
      if (svsWarning.hazard === "TOR") {
        lines.push("");
        lines.push("HAZARD...Tornado.");
        lines.push("SOURCE...RADAR INDICATED.");
      } else {
        const wind = Number(attributes.severe_wind_mph ?? 60);
        const hail = Number(attributes.severe_hail_inches ?? 1);
        lines.push("");
        lines.push(
          `HAZARD...${wind} MPH wind gusts and ${hail.toFixed(2)} inch hail.`,
        );
        lines.push("SOURCE...RADAR INDICATED.");
        if (attributes.tornado_possible === true) {
          lines.push("TORNADO...POSSIBLE.");
        }
      }
      lines.push("");
      lines.push("THE WARNING CONTINUES FOR THE REMAINING WARNED AREA.");
      lines.push(`LAT...LON ${formatLatLonPolygon(svsPolygon)}`);
    } else if (svsAction === "COR") {
      lines.push("...CORRECTED WARNING FOLLOW-UP...");
      lines.push("");
      lines.push(
        `THE ${warningName} REMAINS IN EFFECT UNTIL ${expireLabel}. THIS STATEMENT CORRECTS INFORMATION IN THE PREVIOUS PRODUCT.`,
      );
    } else {
      const reasonText: Record<SvsEndReason, string> = {
        weakened:
          "THE STORM WHICH PROMPTED THE WARNING HAS WEAKENED BELOW WARNING CRITERIA.",
        moved_out:
          "THE STORM WHICH PROMPTED THE WARNING HAS MOVED OUT OF THE WARNED AREA.",
        weakened_and_moved:
          "THE STORM HAS WEAKENED AND MOVED OUT OF THE WARNED AREA.",
        tor_downgrade:
          "THE TORNADO THREAT HAS DIMINISHED, BUT A SEVERE THUNDERSTORM WARNING REMAINS IN EFFECT.",
        tor_reissue:
          "THIS WARNING IS ENDING AND A NEW WARNING WILL BE ISSUED FOR THE CONTINUING THREAT.",
      };

      if (svsAction === "CAN") {
        lines.push(`...THE ${warningName} HAS BEEN CANCELLED...`);
      } else {
        lines.push(`...THE ${warningName} WILL EXPIRE AT ${expireLabel}...`);
      }
      lines.push("");
      lines.push(reasonText[svsReason]);
    }

    if (svsStillHail || svsStillWind || svsStillRain) {
      lines.push("");
      lines.push("ADDITIONAL THREATS...");
      if (svsStillHail) lines.push("HAIL MAY STILL BE A THREAT.");
      if (svsStillWind) lines.push("GUSTY WINDS MAY STILL BE A THREAT.");
      if (svsStillRain) lines.push("HEAVY RAIN MAY STILL BE A THREAT.");
    }

    lines.push("");
    lines.push("...END EXERCISE MESSAGE...");
    setSvsDraftText(lines.join("\n"));
  };

  const issueSvsFollowup = () => {
    if (!svsWarning || !svsDraftText.trim()) return;

    onWarningAction({
      type: "warning_followup",
      warning_id: svsWarning.id,
      action: svsAction,
      text: svsDraftText,
      ...(svsAction === "CON"
        ? {
            points: svsPolygon.map((point) => ({
              lat: point.lat,
              lon: point.lon,
            })),
          }
        : {}),
      attributes: {
        reason:
          svsAction === "CAN" || svsAction === "EXP" ? svsReason : null,
        still_hail: svsStillHail,
        still_wind: svsStillWind,
        still_rain: svsStillRain,
        affected_areas:
          svsAction === "CON"
            ? svsAffectedCounties.map((county) => ({
                fips: county.fips,
                name: county.name,
              }))
            : [],
      },
    });

    closeSvsFollowup();
  };

  const displayAnnotations = useMemo<RadarAnnotation[]>(
    () =>
      svsWarningId && svsAction === "CON" && svsPolygon.length >= 3
        ? [
            ...annotations,
            {
              id: "svs-con-polygon",
              points: svsPolygon,
              closed: true,
              label: "SVS CON trim",
            },
          ]
        : annotations,
    [annotations, svsAction, svsPolygon, svsWarningId],
  );

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
      if (!warnCurrentReference) {
        return warnTrackType === "line_of_storms"
          ? "WarnGen: position the two-point line parallel to the threat on the current scan"
          : "WarnGen: drag the marker onto the threat on the current scan";
      }
      if (!warnPreviousReference) {
        return warnTrackType === "line_of_storms"
          ? "WarnGen: step back 3–4 scans, then reposition the line on the earlier storm line"
          : "WarnGen: step back 3–4 scans, then drag the marker to the earlier threat position";
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
    warnCurrentReference,
    warnFrameSeparation,
    warnMeasurement,
    warnPreviousReference,
    warnTrackType,
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
              switchFrameSeries(event.target.value, elevation);
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
              switchFrameSeries(product, Number(event.target.value));
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
              if (id === "warngen") {
                startWarnGen();
              } else {
                setTool(id);
                setToolPoints([]);
              }
            }}
          >
            {label}
          </button>
        ))}
        <span className="radar-tool-status">{toolStatus}</span>
        {tool !== "cursor" && tool !== "warngen" && toolPoints.length > 0 && (
          <button className="radar-clear-tool" onClick={() => setToolPoints([])}>
            Clear
          </button>
        )}
      </div>

      {tool === "warngen" && (
        <div className="radar-warngen-panel radar-warngen-track-panel">
          <div className="radar-warngen-intro">
            <strong>
              WarnGen — {warnTrackType === "line_of_storms" ? "Line of Storms" : "One Storm"}
            </strong>
            <span className="muted">
              Track the threat first. The warning polygon is generated from the storm motion.
            </span>
          </div>

          <label>
            Track Type
            <select
              value={warnTrackType}
              disabled={warnTracked}
              onChange={(event) =>
                changeWarnTrackType(event.target.value as WarnTrackType)
              }
            >
              <option value="one_storm">One Storm</option>
              <option value="line_of_storms">Line of Storms</option>
            </select>
          </label>

          <label>
            Product
            <select
              value={warningHazard}
              disabled={warnTracked}
              onChange={(event) => {
                const next = event.target.value as "TOR" | "SVR";
                setWarningHazard(next);
                if (
                  next === "SVR" &&
                  (warnBasis === "radar_confirmed" || warnBasis === "doppler_squall")
                ) {
                  setWarnBasis("doppler");
                } else if (
                  next === "TOR" &&
                  warnTrackType === "line_of_storms" &&
                  warnBasis === "doppler"
                ) {
                  setWarnBasis("doppler_squall");
                }
                setWarnDraftText("");
              }}
            >
              <option value="TOR">Tornado Warning</option>
              <option value="SVR">Severe Thunderstorm Warning</option>
            </select>
          </label>

          <label>
            Duration
            <select
              value={warningDuration}
              disabled={warnTracked}
              onChange={(event) => {
                setWarningDuration(Number(event.target.value));
                setWarnDraftText("");
              }}
            >
              {(warningHazard === "TOR"
                ? [15, 20, 25, 30, 40, 45, 50, 60]
                : [15, 20, 25, 30, 40, 45, 50, 60, 75, 90]
              ).map((minutes) => (
                <option value={minutes} key={minutes}>
                  {minutes} min
                </option>
              ))}
            </select>
          </label>

          <button onClick={restartWarnGen}>Restart</button>

          <div className="radar-warngen-workflow">
            {!warnCurrentReference ? (
              <div className="warngen-step active">
                <strong>
                  1. {warnTrackType === "line_of_storms" ? "Current storm line" : "Current position"}
                </strong>
                <span>
                  {warnTrackType === "line_of_storms"
                    ? "Position the line parallel to the threat. Drag the center to translate it; drag either endpoint to rotate or resize it."
                    : "Drag “Drag Me to Storm” onto the threat on the current scan."}
                </span>
              </div>
            ) : !warnPreviousReference ? (
              <>
                <div className="warngen-step complete">
                  <strong>
                    1. {warnTrackType === "line_of_storms" ? "Current line set" : "Current position set"}
                  </strong>
                  <span>{frameTime(warnCurrentReference.timestamp)}</span>
                </div>
                <div className="warngen-step active">
                  <strong>
                    2. {warnTrackType === "line_of_storms" ? "Earlier storm line" : "Previous position"}
                  </strong>
                  <span>
                    {warnTrackType === "line_of_storms"
                      ? "Step back about 3–4 scans, then reposition the same line on the earlier position of the threat."
                      : "Step back about 3–4 scans, then drag the marker onto the same feature."}
                  </span>
                </div>
              </>
            ) : !warnTracked ? (
              <>
                <div className="warngen-step complete">
                  <strong>Storm motion</strong>
                  <span>
                    {warnMeasurement
                      ? `${warnMeasurement.bearing.toFixed(0).padStart(3, "0")}° at ${warnMeasurement.speedKt.toFixed(0)} kt`
                      : "Waiting for a valid earlier position"}
                  </span>
                  <span>
                    {warnFrameSeparation > 0
                      ? `${warnFrameSeparation} scan${warnFrameSeparation === 1 ? "" : "s"} between positions`
                      : "Use an earlier radar frame"}
                  </span>
                </div>
                <button
                  className="primary-action"
                  disabled={!warnProjection || !warnMeasurement}
                  onClick={trackWarnGenStorm}
                >
                  Track
                </button>
              </>
            ) : (
              <>
                <div className="warngen-step complete">
                  <strong>Track polygon generated</strong>
                  <span>
                    {warnMeasurement
                      ? `${warnMeasurement.bearing.toFixed(0).padStart(3, "0")}° at ${warnMeasurement.speedKt.toFixed(0)} kt · ${warningDuration} min`
                      : ""}
                  </span>
                  <span>
                    Drag vertices to refine. Middle-click a polygon edge to add a vertex; right-click a vertex to remove it.
                  </span>
                </div>
                <button
                  className={warnHatched ? "primary-action" : ""}
                  onClick={() => setWarnHatched(true)}
                >
                  Warned / Hatched Area
                </button>
                {warnHatched ? (
                  <div className="warngen-step complete">
                    <strong>Warned area preview</strong>
                    <span>
                      {warnAffectedCounties.length} LIX parish/count{
                        warnAffectedCounties.length === 1 ? "y" : "ies"
                      } intersect the polygon.
                    </span>
                    <span>
                      {warnAffectedCounties.map((county) => county.name).join(", ") || "No LIX area"}
                    </span>
                  </div>
                ) : (
                  <div className="warngen-next-step">
                    Preview the CWA-clipped warned area before continuing.
                  </div>
                )}
                {warnHatched && (
                  <div className="warngen-attributes">
                    <div className="warngen-section-title">
                      <strong>Warning Attributes</strong>
                      <span>Selections used by Create Text</span>
                    </div>

                    {warningHazard === "TOR" ? (
                      <>
                        <label>
                          Type of Warning
                          <select
                            value={warnTorHeadline}
                            onChange={(event) => {
                              setWarnTorHeadline(event.target.value as TorHeadline);
                              setWarnDraftText("");
                            }}
                          >
                            <option value="base">Base Tornado Warning</option>
                            <option value="considerable">Considerable Tornado Tag</option>
                            <option value="emergency">Tornado Emergency</option>
                            <option value="landspout">Landspout / Very Weak Tornado</option>
                          </select>
                        </label>

                        <label>
                          Basis for Warning
                          <select
                            value={warnBasis}
                            onChange={(event) => {
                              setWarnBasis(event.target.value as WarnBasis);
                              setWarnDraftText("");
                            }}
                          >
                            <option value="doppler">Doppler radar indicated</option>
                            <option value="doppler_squall">Squall line with embedded tornadoes</option>
                            <option value="radar_confirmed">Radar confirmed tornado / TDS</option>
                            <option value="spotter">Trained weather spotters</option>
                            <option value="law_enforcement">Law enforcement</option>
                            <option value="emergency_management">Emergency management</option>
                            <option value="broadcast_media">Broadcast media</option>
                            <option value="public">Public report</option>
                          </select>
                        </label>

                        <label>
                          Accompanying Hail
                          <select
                            value={warnTorHail}
                            onChange={(event) => {
                              setWarnTorHail(event.target.value);
                              setWarnDraftText("");
                            }}
                          >
                            <option value="none">No hail</option>
                            <option value="small">Small hail</option>
                            {[1, 1.25, 1.5, 1.75, 2, 2.5, 2.75, 3, 4, 4.5, 5].map(
                              (size) => (
                                <option value={String(size)} key={size}>
                                  {size.toFixed(2)} in hail
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </>
                    ) : (
                      <>
                        <label>
                          Basis for Warning
                          <select
                            value={warnBasis}
                            onChange={(event) => {
                              setWarnBasis(event.target.value as WarnBasis);
                              setWarnDraftText("");
                            }}
                          >
                            <option value="doppler">Doppler radar indicated</option>
                            <option value="spotter">Trained weather spotters</option>
                            <option value="law_enforcement">Law enforcement</option>
                            <option value="emergency_management">Emergency management</option>
                            <option value="broadcast_media">Broadcast media</option>
                            <option value="public">Public report</option>
                          </select>
                        </label>

                        <label>
                          Wind Threat
                          <select
                            value={warnSvrWind}
                            onChange={(event) => {
                              setWarnSvrWind(Number(event.target.value));
                              setWarnDraftText("");
                            }}
                          >
                            {[60, 70, 80, 90, 100].map((speed) => (
                              <option value={speed} key={speed}>
                                {speed} mph
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Hail Threat
                          <select
                            value={warnSvrHail}
                            onChange={(event) => {
                              setWarnSvrHail(Number(event.target.value));
                              setWarnDraftText("");
                            }}
                          >
                            {[0.75, 0.88, 1, 1.25, 1.5, 1.75, 2, 2.5, 2.75, 3, 4, 4.5, 5].map(
                              (size) => (
                                <option value={size} key={size}>
                                  {size.toFixed(2)} in
                                </option>
                              ),
                            )}
                          </select>
                        </label>

                        <label className="radar-check warngen-check">
                          <input
                            type="checkbox"
                            checked={warnObservedWind}
                            onChange={(event) => {
                              setWarnObservedWind(event.target.checked);
                              setWarnDraftText("");
                            }}
                          />
                          Observed wind
                        </label>

                        <label className="radar-check warngen-check">
                          <input
                            type="checkbox"
                            checked={warnObservedHail}
                            onChange={(event) => {
                              setWarnObservedHail(event.target.checked);
                              setWarnDraftText("");
                            }}
                          />
                          Observed hail
                        </label>

                        <label className="radar-check warngen-check">
                          <input
                            type="checkbox"
                            checked={warnTornadoPossible}
                            onChange={(event) => {
                              setWarnTornadoPossible(event.target.checked);
                              setWarnDraftText("");
                            }}
                          />
                          TORNADO...POSSIBLE
                        </label>
                      </>
                    )}

                    <label>
                      Locations Impacted
                      <select
                        value={warnLocationMode}
                        onChange={(event) => {
                          setWarnLocationMode(event.target.value as WarnLocationMode);
                          setWarnDraftText("");
                        }}
                      >
                        <option value="pathcast">Pathcast</option>
                        <option value="cities">List of cities</option>
                      </select>
                    </label>

                    <label className="radar-check warngen-check">
                      <input
                        type="checkbox"
                        checked={warnSpecialEvent}
                        onChange={(event) => {
                          setWarnSpecialEvent(event.target.checked);
                          setWarnDraftText("");
                        }}
                      />
                      Special heads-up for event / venue
                    </label>

                    {warningHazard === "TOR" && (
                      <>
                        <label className="radar-check warngen-check">
                          <input
                            type="checkbox"
                            checked={warnRainWrappedCta}
                            onChange={(event) => {
                              setWarnRainWrappedCta(event.target.checked);
                              setWarnDraftText("");
                            }}
                          />
                          Rain-wrapped tornado CTA
                        </label>
                        <label className="radar-check warngen-check">
                          <input
                            type="checkbox"
                            checked={warnNighttimeCta}
                            onChange={(event) => {
                              setWarnNighttimeCta(event.target.checked);
                              setWarnDraftText("");
                            }}
                          />
                          Nighttime tornado CTA
                        </label>
                      </>
                    )}

                    <label className="radar-check warngen-check">
                      <input
                        type="checkbox"
                        checked={warnTorrentialRainfallCta}
                        onChange={(event) => {
                          setWarnTorrentialRainfallCta(event.target.checked);
                          setWarnDraftText("");
                        }}
                      />
                      Torrential rainfall CTA
                    </label>

                    <button
                      className="primary-action"
                      onClick={createWarnGenText}
                      disabled={!warnMeasurement || warnAffectedCounties.length === 0}
                    >
                      Create Text
                    </button>

                    {warningHazard === "TOR" && warnTorHeadline === "emergency" && (
                      <span className="warngen-caution">
                        Tornado Emergency selection requires appropriate exercise-supervisor approval.
                      </span>
                    )}
                  </div>
                )}

                {warnDraftText && (
                  <div className="warngen-text-editor">
                    <div className="warngen-section-title">
                      <strong>Warning Text Editor</strong>
                      <span>Review and edit before issuing.</span>
                    </div>
                    <textarea
                      value={warnDraftText}
                      onChange={(event) => setWarnDraftText(event.target.value)}
                      spellCheck={false}
                      aria-label="WarnGen warning text"
                    />
                    <div className="warngen-text-actions">
                      <button onClick={createWarnGenText}>Recreate Text</button>
                      <button
                        className="primary-action"
                        onClick={issueWarnGenWarning}
                        disabled={!warnDraftText.trim()}
                      >
                        Issue Warning
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
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
                  expires {formatExerciseTime(warning.expires_at)}
                </span>
                {warning.inherited && <span>Inherited at exercise start</span>}
                {(warning.followups?.length ?? 0) > 0 && (
                  <span>
                    Last SVS: {warning.followups?.at(-1)?.action}
                  </span>
                )}
              </div>
              <div className="radar-warning-actions">
                <button
                  onClick={() => beginSvsFollowup(warning)}
                  disabled={svsWarningId === warning.id}
                >
                  Follow Up / SVS
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {svsWarning && (
        <div className="radar-svs-panel">
          <div className="warngen-section-title">
            <strong>Severe Weather Statement — {svsWarning.label}</strong>
            <span>
              Original expiration {formatExerciseTime(svsWarning.expires_at)}
            </span>
          </div>

          <label>
            Follow-up Action
            <select
              value={svsAction}
              onChange={(event) => {
                setSvsAction(event.target.value as SvsAction);
                setSvsDraftText("");
              }}
            >
              <option value="CON">CON — Continue</option>
              <option value="CAN">CAN — Cancel</option>
              <option value="EXP">EXP — Expire</option>
              <option value="COR">COR — Correct</option>
            </select>
          </label>

          {(svsAction === "CAN" || svsAction === "EXP") && (
            <label>
              End-of-Warning Reason
              <select
                value={svsReason}
                onChange={(event) => {
                  setSvsReason(event.target.value as SvsEndReason);
                  setSvsDraftText("");
                }}
              >
                <option value="weakened">Storm weakened</option>
                <option value="moved_out">Storm moved out of warned area</option>
                <option value="weakened_and_moved">
                  Storm weakened and moved out
                </option>
                {svsWarning.hazard === "TOR" && (
                  <>
                    <option value="tor_downgrade">
                      Tornado warning cancellation — severe still in effect
                    </option>
                    <option value="tor_reissue">
                      Tornado warning ending — will reissue
                    </option>
                  </>
                )}
              </select>
            </label>
          )}

          <label className="radar-check warngen-check">
            <input
              type="checkbox"
              checked={svsStillHail}
              onChange={(event) => {
                setSvsStillHail(event.target.checked);
                setSvsDraftText("");
              }}
            />
            Hail still a threat
          </label>
          <label className="radar-check warngen-check">
            <input
              type="checkbox"
              checked={svsStillWind}
              onChange={(event) => {
                setSvsStillWind(event.target.checked);
                setSvsDraftText("");
              }}
            />
            Gusty winds still a threat
          </label>
          <label className="radar-check warngen-check">
            <input
              type="checkbox"
              checked={svsStillRain}
              onChange={(event) => {
                setSvsStillRain(event.target.checked);
                setSvsDraftText("");
              }}
            />
            Heavy rain still a threat
          </label>

          {svsAction === "CON" && (
            <div className="svs-trim-note">
              <strong>CON warned area</strong>
              <span>
                Drag the cyan vertices to trim the active polygon. A continuation
                can reduce the warned area but the backend will reject any expansion.
                Middle-click an edge to add a vertex; right-click a vertex to remove it.
              </span>
              <span>
                {svsAffectedCounties.length} LIX parish/count{
                  svsAffectedCounties.length === 1 ? "y" : "ies"
                } in the proposed continuation.
              </span>
            </div>
          )}

          <div className="radar-svs-actions">
            <button onClick={closeSvsFollowup}>Close</button>
            <button className="primary-action" onClick={createSvsText}>
              Create Text
            </button>
          </div>

          {svsDraftText && (
            <div className="warngen-text-editor svs-text-editor">
              <div className="warngen-section-title">
                <strong>SVS Text Editor</strong>
                <span>Review and edit before issuing.</span>
              </div>
              <textarea
                value={svsDraftText}
                onChange={(event) => setSvsDraftText(event.target.value)}
                spellCheck={false}
                aria-label="SVS follow-up text"
              />
              <div className="warngen-text-actions">
                <button onClick={createSvsText}>Recreate Text</button>
                <button
                  className="primary-action"
                  onClick={issueSvsFollowup}
                  disabled={!svsDraftText.trim()}
                >
                  Issue {svsAction} SVS
                </button>
              </div>
            </div>
          )}
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
              annotations={displayAnnotations}
              draggableHandles={
                svsWarningId
                  ? svsAction === "CON"
                    ? svsHandles
                    : []
                  : warnHandles
              }
              warnedAreaPreview={
                svsWarningId && svsAction === "CON"
                  ? { polygon: svsPolygon, counties: svsAffectedCounties }
                  : warnHatched
                    ? { polygon: warnPolygon, counties: warnAffectedCounties }
                    : null
              }
              onDraggableHandleChange={
                svsWarningId && svsAction === "CON"
                  ? onSvsHandleChange
                  : onWarnHandleChange
              }
              onDraggableHandleRemove={
                svsWarningId && svsAction === "CON"
                  ? removeSvsPolygonVertex
                  : removeWarnPolygonVertex
              }
              onMapMiddleClick={
                svsWarningId && svsAction === "CON"
                  ? addSvsPolygonVertex
                  : addWarnPolygonVertex
              }
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
