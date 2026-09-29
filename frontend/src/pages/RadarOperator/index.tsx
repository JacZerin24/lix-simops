import { PointerEvent, useEffect, useRef, useState } from "react";

import { getRadarFrames } from "../../services/api";
import type { RadarFrameResponse } from "../../types/simulation";
import { formatSimTime } from "../../utils/simTime";

type Props = {
  sessionCode: string;
  timezone: string;
};

const PRODUCT_KEYS: Record<string, string> = {
  "1": "REF",
  "2": "VEL",
  "3": "CC",
  "4": "ZDR",
};

export function RadarOperator({ sessionCode, timezone }: Props) {
  const [product, setProduct] = useState("REF");
  const [elevation, setElevation] = useState(0.5);
  const [data, setData] = useState<RadarFrameResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [followLatest, setFollowLatest] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [loopMs, setLoopMs] = useState(650);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!playing || !data || data.frames.length < 2) return;
    const timer = window.setInterval(() => {
      setSelectedIndex((current) => (current + 1) % data.frames.length);
    }, loopMs);
    return () => window.clearInterval(timer);
  }, [playing, data, loopMs]);

  const frames = data?.frames ?? [];
  const frame = frames[selectedIndex];

  const selectPrevious = () => {
    setPlaying(false);
    setFollowLatest(false);
    setSelectedIndex((current) => Math.max(0, current - 1));
  };

  const selectNext = () => {
    setPlaying(false);
    setSelectedIndex((current) => {
      const next = Math.min(frames.length - 1, current + 1);
      if (next === frames.length - 1) setFollowLatest(true);
      return Math.max(0, next);
    });
  };

  const goLatest = () => {
    setPlaying(false);
    setFollowLatest(true);
    setSelectedIndex(Math.max(0, frames.length - 1));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const changeElevation = (direction: number) => {
    const levels = data?.elevations ?? [];
    if (!levels.length) return;
    const current = Math.max(0, levels.findIndex((value) => Math.abs(value - elevation) < 0.01));
    const next = Math.max(0, Math.min(levels.length - 1, current + direction));
    setElevation(levels[next]);
    setFollowLatest(true);
    resetView();
  };

  const chooseProduct = (nextProduct: string) => {
    setProduct(nextProduct);
    setFollowLatest(true);
    setPlaying(false);
    resetView();
  };

  const toggleFullscreen = () => {
    const element = canvasRef.current;
    if (!element) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void element.requestFullscreen();
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        selectNext();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        changeElevation(1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        changeElevation(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        goLatest();
      } else if (event.key === " " && frames.length >= 2) {
        event.preventDefault();
        setFollowLatest(false);
        setPlaying((value) => !value);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((value) => Math.min(6, value + 0.25));
      } else if (event.key === "-") {
        event.preventDefault();
        setZoom((value) => Math.max(0.75, value - 0.25));
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFullscreen();
      } else if (PRODUCT_KEYS[event.key] && data?.products.some((item) => item.id === PRODUCT_KEYS[event.key])) {
        event.preventDefault();
        chooseProduct(PRODUCT_KEYS[event.key]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPan({
      x: drag.current.panX + event.clientX - drag.current.x,
      y: drag.current.panY + event.clientY - drag.current.y,
    });
  };

  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
  };

  return (
    <section className="panel primary radar-workspace">
      <div className="radar-heading">
        <div>
          <h2>Radar Operator</h2>
          <p className="muted">
            {data?.radar_site ? `${data.radar_site} Level II playback` : "Archived radar playback"}
          </p>
        </div>
        <div className="radar-scan-status">
          <span>{formatSimTime(frame?.timestamp, timezone, true)}</span>
          <strong>
            {frames.length ? `${selectedIndex + 1} / ${frames.length} available scans` : "No scans available"}
          </strong>
        </div>
      </div>

      <div className="radar-quick-products" aria-label="Radar products">
        {(data?.products ?? []).map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={item.id === product ? "radar-product active" : "radar-product"}
            onClick={() => chooseProduct(item.id)}
          >
            <span>{index < 4 ? index + 1 : ""}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="radar-toolbar">
        <label>
          Product
          <select value={product} onChange={(event) => chooseProduct(event.target.value)}>
            {(data?.products.length ? data.products : [{ id: "REF", label: "Base Reflectivity", units: "dBZ" }]).map(
              (item) => (
                <option value={item.id} key={item.id}>
                  {item.label}
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          Elevation
          <select
            value={elevation}
            onChange={(event) => {
              setElevation(Number(event.target.value));
              setFollowLatest(true);
              resetView();
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
          <button onClick={selectPrevious} disabled={frames.length === 0 || selectedIndex === 0}>◀ Scan</button>
          <button
            onClick={() => {
              setFollowLatest(false);
              setPlaying((value) => !value);
            }}
            disabled={frames.length < 2}
          >
            {playing ? "Pause Loop" : "Loop"}
          </button>
          <button onClick={selectNext} disabled={frames.length === 0 || selectedIndex >= frames.length - 1}>Scan ▶</button>
          <button onClick={goLatest} disabled={frames.length === 0}>Latest</button>
        </div>

        <label className="compact-control">
          Loop
          <select value={loopMs} onChange={(event) => setLoopMs(Number(event.target.value))}>
            <option value={1000}>Slow</option>
            <option value={650}>Normal</option>
            <option value={350}>Fast</option>
          </select>
        </label>

        <div className="radar-button-group">
          <button onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}>−</button>
          <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((value) => Math.min(6, value + 0.25))}>+</button>
          <button onClick={resetView}>Reset</button>
          <button onClick={toggleFullscreen}>Fullscreen</button>
        </div>
      </div>

      <div className="keyboard-hint">
        <strong>Keyboard:</strong> ←/→ scans · ↑/↓ tilts · 1 REF · 2 VEL · 3 CC · 4 ZDR · Space loop · Home latest · +/- zoom · 0 reset · F fullscreen
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!data?.available ? (
        <div className="radar-empty">
          <h3>Radar cache not loaded</h3>
          <p>This session is ready for radar playback, but the selected scenario does not yet have a built radar cache.</p>
        </div>
      ) : frames.length === 0 ? (
        <div className="radar-empty">
          <h3>Waiting for the first scan</h3>
          <p>No {product} {elevation.toFixed(1)}° frame has reached the current simulation time yet. Future frames are intentionally hidden.</p>
        </div>
      ) : (
        <>
          <div
            ref={canvasRef}
            className="radar-canvas"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            onDoubleClick={resetView}
            onWheel={(event) => {
              event.preventDefault();
              setZoom((value) => Math.max(0.75, Math.min(6, value + (event.deltaY < 0 ? 0.25 : -0.25))));
            }}
            tabIndex={0}
            aria-label="Radar display; drag to pan, mouse wheel to zoom"
          >
            <img
              src={frame.asset_url}
              alt={`${data.radar_site ?? "Radar"} ${product} ${elevation.toFixed(1)} degree at ${formatSimTime(frame.timestamp, timezone, true)}`}
              draggable={false}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            />
          </div>
          <div className="radar-footer">
            <span><strong>{product}</strong> · {elevation.toFixed(1)}°</span>
            <span>{followLatest ? "Following latest available scan" : "Reviewing earlier scan"}</span>
            <span>{data.range_km ? `Display radius: ~${data.range_km} km` : ""}</span>
          </div>
        </>
      )}
    </section>
  );
}
