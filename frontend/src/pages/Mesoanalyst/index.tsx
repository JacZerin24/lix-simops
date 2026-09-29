import { PointerEvent, useEffect, useRef, useState } from "react";

import { getMesoFrames } from "../../services/api";
import type { MesoFrameResponse } from "../../types/simulation";
import { formatSimTime } from "../../utils/simTime";

type Props = {
  sessionCode: string;
  timezone: string;
};

export function Mesoanalyst({ sessionCode, timezone }: Props) {
  const [product, setProduct] = useState("");
  const [data, setData] = useState<MesoFrameResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [followLatest, setFollowLatest] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const response = await getMesoFrames(sessionCode, product);
        if (cancelled) return;
        setData(response);
        setError("");

        if (response.selected_product && response.selected_product !== product) {
          setProduct(response.selected_product);
        }

        setSelectedIndex((current) => {
          if (response.frames.length === 0) return 0;
          if (followLatest) return response.frames.length - 1;
          return Math.min(current, response.frames.length - 1);
        });
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Unable to load meso products");
        }
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionCode, product, followLatest]);

  useEffect(() => {
    if (!playing || !data || data.frames.length < 2) return;
    const timer = window.setInterval(() => {
      setSelectedIndex((current) => (current + 1) % data.frames.length);
    }, 800);
    return () => window.clearInterval(timer);
  }, [playing, data]);

  const frames = data?.frames ?? [];
  const frame = frames[selectedIndex];
  const selectedProduct = data?.products.find((item) => item.id === product);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const chooseProduct = (nextProduct: string) => {
    setProduct(nextProduct);
    setFollowLatest(true);
    setPlaying(false);
    resetView();
  };

  const previousFrame = () => {
    setPlaying(false);
    setFollowLatest(false);
    setSelectedIndex((current) => Math.max(0, current - 1));
  };

  const nextFrame = () => {
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previousFrame();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nextFrame();
      } else if (event.key === "Home") {
        event.preventDefault();
        goLatest();
      } else if (event.key === " " && frames.length >= 2) {
        event.preventDefault();
        setFollowLatest(false);
        setPlaying((value) => !value);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((value) => Math.min(5, value + 0.25));
      } else if (event.key === "-") {
        event.preventDefault();
        setZoom((value) => Math.max(0.75, value - 0.25));
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
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
    <section className="panel primary meso-workspace">
      <div className="meso-heading">
        <div>
          <h2>Mesoanalyst</h2>
          <p className="muted">SPC-style operational product workspace · LIX sector</p>
        </div>
        <div className="meso-frame-status">
          <span>VALID {formatSimTime(frame?.timestamp, timezone, true)}</span>
          <strong>{frames.length ? `${selectedIndex + 1} / ${frames.length} frames` : "No frame available"}</strong>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!data?.available ? (
        <div className="meso-empty">
          <h3>Mesoanalysis cache not loaded</h3>
          <p>The scenario does not yet have participant-facing mesoanalysis products.</p>
        </div>
      ) : (
        <div className="meso-spc-layout">
          <aside className="meso-product-rail">
            <div className="meso-sector-card">
              <span>Sector</span>
              <strong>LIX / Southeast Louisiana</strong>
              <small>Only products with actual frames are shown.</small>
            </div>

            {data.categories.map((category) => {
              const categoryProducts = data.products.filter((item) => item.category === category);
              if (!categoryProducts.length) return null;
              return (
                <div className="meso-product-group" key={category}>
                  <h3>{category}</h3>
                  {categoryProducts.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={item.id === product ? "meso-product active" : "meso-product"}
                      onClick={() => chooseProduct(item.id)}
                    >
                      <strong>{item.label}</strong>
                      {item.units && <span>{item.units}</span>}
                    </button>
                  ))}
                </div>
              );
            })}
          </aside>

          <div className="meso-map-column">
            <div className="meso-operational-toolbar">
              <div className="radar-button-group">
                <button onClick={previousFrame} disabled={frames.length === 0 || selectedIndex === 0}>◀ Prev</button>
                <button
                  onClick={() => {
                    setFollowLatest(false);
                    setPlaying((value) => !value);
                  }}
                  disabled={frames.length < 2}
                >
                  {playing ? "Pause" : "Loop"}
                </button>
                <button onClick={nextFrame} disabled={frames.length === 0 || selectedIndex >= frames.length - 1}>Next ▶</button>
                <button onClick={goLatest} disabled={frames.length === 0}>Latest</button>
              </div>
              <div className="radar-button-group">
                <button onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}>−</button>
                <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((value) => Math.min(5, value + 0.25))}>+</button>
                <button onClick={resetView}>Reset</button>
              </div>
            </div>

            {selectedProduct?.description && (
              <div className="product-context meso-context-compact">
                <strong>{selectedProduct.label}</strong>
                <span>{selectedProduct.description}</span>
              </div>
            )}

            {!frame ? (
              <div className="meso-empty">
                <h3>Waiting for this product</h3>
                <p>No {selectedProduct?.label ?? product} frame has reached the current simulation time. Future data are intentionally hidden.</p>
              </div>
            ) : (
              <>
                <div
                  className="meso-canvas"
                  onPointerDown={pointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={pointerUp}
                  onPointerCancel={pointerUp}
                  onDoubleClick={resetView}
                  onWheel={(event) => {
                    event.preventDefault();
                    setZoom((value) => Math.max(0.75, Math.min(5, value + (event.deltaY < 0 ? 0.25 : -0.25))));
                  }}
                  tabIndex={0}
                  aria-label="Mesoanalysis display; drag to pan, mouse wheel to zoom"
                >
                  <img
                    src={frame.asset_url}
                    alt={`${selectedProduct?.label ?? product} at ${formatSimTime(frame.timestamp, timezone, true)}`}
                    draggable={false}
                    style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                  />
                </div>
                <div className="radar-footer">
                  <span><strong>{selectedProduct?.label ?? product}</strong>{selectedProduct?.units ? ` · ${selectedProduct.units}` : ""}</span>
                  <span>{followLatest ? "Following latest available frame" : "Reviewing earlier frame"}</span>
                  <span>←/→ frames · Space loop · +/- zoom · 0 reset</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
