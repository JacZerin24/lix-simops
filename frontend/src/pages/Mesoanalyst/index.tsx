import { useEffect, useMemo, useState } from "react";

import { getMesoFrames } from "../../services/api";
import type { MesoFrameResponse } from "../../types/simulation";
import { formatSimTime } from "../../utils/simTime";

type Props = {
  sessionCode: string;
  timezone: string;
};

export function Mesoanalyst({ sessionCode, timezone }: Props) {
  const [product, setProduct] = useState("");
  const [category, setCategory] = useState("");
  const [data, setData] = useState<MesoFrameResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [followLatest, setFollowLatest] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");

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

        const selected = response.products.find(
          (item) => item.id === response.selected_product,
        );
        if (selected && !category) setCategory(selected.category);

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
  }, [sessionCode, product, followLatest, category]);

  useEffect(() => {
    if (!playing || !data || data.frames.length < 2) return;
    const timer = window.setInterval(() => {
      setSelectedIndex((current) => (current + 1) % data.frames.length);
    }, 800);
    return () => window.clearInterval(timer);
  }, [playing, data]);

  const productsInCategory = useMemo(() => {
    if (!data) return [];
    return data.products.filter((item) => !category || item.category === category);
  }, [data, category]);

  const frames = data?.frames ?? [];
  const frame = frames[selectedIndex];
  const selectedProduct = data?.products.find((item) => item.id === product);

  const chooseCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    const first = data?.products.find((item) => item.category === nextCategory);
    if (first) setProduct(first.id);
    setFollowLatest(true);
    setPlaying(false);
  };

  const chooseProduct = (nextProduct: string) => {
    setProduct(nextProduct);
    const item = data?.products.find((entry) => entry.id === nextProduct);
    if (item) setCategory(item.category);
    setFollowLatest(true);
    setPlaying(false);
  };

  return (
    <section className="panel primary meso-workspace">
      <div className="meso-heading">
        <div>
          <h2>Mesoanalyst</h2>
          <p className="muted">
            Maintain environmental context and proactively update the radar and DSS positions.
          </p>
        </div>
        <div className="meso-frame-status">
          <span>{formatSimTime(frame?.timestamp, timezone, true)}</span>
          <strong>
            {frames.length ? `${selectedIndex + 1} / ${frames.length} available frames` : "No frame available"}
          </strong>
        </div>
      </div>

      <div className="meso-tabs" role="tablist" aria-label="Mesoanalysis categories">
        {(data?.categories.length
          ? data.categories
          : ["Environment", "Satellite", "Lightning", "MRMS", "Observations", "Guidance"]
        ).map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={category === item}
            className={category === item ? "meso-tab active" : "meso-tab"}
            key={item}
            onClick={() => chooseCategory(item)}
            disabled={!data?.available}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="meso-toolbar">
        <label>
          Product
          <select
            value={product}
            onChange={(event) => chooseProduct(event.target.value)}
            disabled={!data?.available}
          >
            {productsInCategory.map((item) => (
              <option value={item.id} key={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="radar-button-group">
          <button
            onClick={() => {
              setPlaying(false);
              setFollowLatest(false);
              setSelectedIndex((current) => Math.max(0, current - 1));
            }}
            disabled={frames.length === 0 || selectedIndex === 0}
          >
            ◀ Frame
          </button>
          <button
            onClick={() => {
              setFollowLatest(false);
              setPlaying((value) => !value);
            }}
            disabled={frames.length < 2}
          >
            {playing ? "Pause Loop" : "Loop"}
          </button>
          <button
            onClick={() => {
              setPlaying(false);
              setSelectedIndex((current) => {
                const next = Math.min(frames.length - 1, current + 1);
                if (next === frames.length - 1) setFollowLatest(true);
                return Math.max(0, next);
              });
            }}
            disabled={frames.length === 0 || selectedIndex >= frames.length - 1}
          >
            Frame ▶
          </button>
          <button
            onClick={() => {
              setPlaying(false);
              setFollowLatest(true);
              setSelectedIndex(Math.max(0, frames.length - 1));
            }}
            disabled={frames.length === 0}
          >
            Latest
          </button>
        </div>
      </div>

      {selectedProduct?.description && (
        <div className="product-context">
          <strong>{selectedProduct.label}</strong>
          <span>{selectedProduct.description}</span>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {!data?.available ? (
        <div className="meso-empty">
          <h3>Mesoanalysis cache not loaded</h3>
          <p>
            The workspace is ready, but this scenario does not yet have archived environmental
            products. Build the meso cache before the exercise.
          </p>
        </div>
      ) : !frame ? (
        <div className="meso-empty">
          <h3>Waiting for this product</h3>
          <p>
            No {selectedProduct?.label ?? product} frame has reached the current simulation time.
            Future data are intentionally hidden.
          </p>
        </div>
      ) : (
        <>
          <div className="meso-canvas">
            <img
              src={frame.asset_url}
              alt={`${selectedProduct?.label ?? product} at ${formatSimTime(frame.timestamp, timezone, true)}`}
              draggable={false}
            />
          </div>
          <div className="radar-footer">
            <span>
              <strong>{selectedProduct?.label ?? product}</strong>
              {selectedProduct?.units ? ` · ${selectedProduct.units}` : ""}
            </span>
            <span>{followLatest ? "Following latest available frame" : "Reviewing earlier frame"}</span>
            <span>{category}</span>
          </div>
        </>
      )}
    </section>
  );
}
