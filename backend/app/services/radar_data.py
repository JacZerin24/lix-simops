from __future__ import annotations

import json
from pathlib import Path

from simulator.radar.manifest import RadarManifest, visible_frames

from ..state import SessionState


REPO_ROOT = Path(__file__).resolve().parents[3]
CACHE_ROOT = REPO_ROOT / "data" / "cache"


def manifest_path(scenario_id: str) -> Path:
    return CACHE_ROOT / scenario_id / "radar" / "manifest.json"


def load_radar_manifest(scenario_id: str) -> RadarManifest | None:
    path = manifest_path(scenario_id)
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return RadarManifest.model_validate(json.load(handle))


def radar_payload(
    session: SessionState,
    requested_product: str | None = None,
    requested_elevation: float | None = None,
) -> dict:
    manifest = load_radar_manifest(session.scenario_id)
    if manifest is None or not manifest.products:
        return {
            "available": False,
            "scenario_id": session.scenario_id,
            "sim_time": session.sim_time.isoformat(),
            "radar_site": None,
            "radar_latitude": None,
            "radar_longitude": None,
            "radar_altitude_m": None,
            "products": [],
            "elevations": [],
            "selected_product": requested_product or "REF",
            "selected_elevation": requested_elevation if requested_elevation is not None else 0.5,
            "frames": [],
        }

    product_ids = [product.id for product in manifest.products]
    selected_product = (
        requested_product if requested_product in product_ids else manifest.products[0].id
    )

    elevations = sorted(
        {
            round(frame.elevation, 1)
            for frame in manifest.frames
            if frame.product == selected_product
        }
    )
    if not elevations:
        elevations = [0.5]

    if requested_elevation is None:
        selected_elevation = elevations[0]
    else:
        selected_elevation = min(elevations, key=lambda item: abs(item - requested_elevation))

    frames = visible_frames(
        manifest,
        session.sim_time,
        selected_product,
        selected_elevation,
    )

    scenario_root = f"/scenario-data/{session.scenario_id}"
    return {
        "available": True,
        "scenario_id": session.scenario_id,
        "sim_time": session.sim_time.isoformat(),
        "radar_site": manifest.radar_site,
        "radar_latitude": manifest.radar_latitude,
        "radar_longitude": manifest.radar_longitude,
        "radar_altitude_m": manifest.radar_altitude_m,
        "range_km": manifest.range_km,
        "products": [
            {
                "id": product.id,
                "label": product.label,
                "units": product.units,
                "vmin": product.vmin,
                "vmax": product.vmax,
                "cmap": product.cmap,
                "palette": product.palette,
            }
            for product in manifest.products
        ],
        "elevations": elevations,
        "selected_product": selected_product,
        "selected_elevation": selected_elevation,
        "frames": [
            {
                "timestamp": frame.timestamp.isoformat(),
                "product": frame.product,
                "elevation": frame.elevation,
                "asset_url": f"{scenario_root}/{frame.asset.lstrip('/')}",
                "data_url": (
                    f"{scenario_root}/{frame.data.asset.lstrip('/')}"
                    if frame.data is not None
                    else None
                ),
                "grid": (
                    {
                        "azimuth_bins": frame.data.azimuth_bins,
                        "range_bins": frame.data.range_bins,
                        "range_start_m": frame.data.range_start_m,
                        "range_step_m": frame.data.range_step_m,
                        "value_min": frame.data.value_min,
                        "value_max": frame.data.value_max,
                        "nodata": frame.data.nodata,
                        "actual_elevation": frame.data.actual_elevation,
                    }
                    if frame.data is not None
                    else None
                ),
            }
            for frame in frames
        ],
    }
