from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from simulator.radar.manifest import RadarManifest, visible_frames
from simulator.radar.velocity_palette import make_velocity_palette

from ..state import SessionState


REPO_ROOT = Path(__file__).resolve().parents[3]
CACHE_ROOT = REPO_ROOT / "data" / "cache"
VELOCITY_PALETTE_PATH = REPO_ROOT / "simulator" / "radar" / "palettes" / "dl_BV-GRA2.pal"
_VOLUME_SWEEP_RE = re.compile(r"_v(\d+)_s\d+\.png$")


def _volume_key(frame) -> str | None:
    """Simulation-only volume token, never the original historical date."""
    match = _VOLUME_SWEEP_RE.search(frame.asset)
    return match.group(1) if match else None


def matched_reflectivity_frames(manifest: RadarManifest, elevation: float):
    """One real REF cut per available VEL cut within the same archive volume.

    This is a comparison view, not an interpolation. Raw REF-only sweeps remain
    in the manifest and are still accessible through scan_mode='all'.
    A match prefers a REF sweep observed before its corresponding velocity
    sweep. No timestamps are rewritten and no future-data lookahead is added.
    """
    ref_by_volume: dict[str, list] = {}
    vel_by_volume: dict[str, list] = {}
    for frame in manifest.frames:
        if abs(frame.elevation - elevation) >= 0.051:
            continue
        volume = _volume_key(frame)
        if volume is None:
            continue
        if frame.product == "REF":
            ref_by_volume.setdefault(volume, []).append(frame)
        elif frame.product == "VEL":
            vel_by_volume.setdefault(volume, []).append(frame)

    # Older caches without a volume identifier keep their historical behavior.
    if not vel_by_volume or not ref_by_volume:
        return [f for f in manifest.frames if f.product == "REF" and abs(f.elevation - elevation) < 0.051]

    matched = []
    for volume, velocity_frames in vel_by_volume.items():
        candidates = list(ref_by_volume.get(volume, []))
        for velocity in sorted(velocity_frames, key=lambda f: f.timestamp):
            if not candidates:
                continue
            older = [f for f in candidates if f.timestamp <= velocity.timestamp]
            if older:
                pick = min(older, key=lambda f: velocity.timestamp - f.timestamp)
            else:
                pick = min(candidates, key=lambda f: f.timestamp - velocity.timestamp)
            matched.append(pick)
            candidates.remove(pick)
    return sorted(matched, key=lambda f: f.timestamp)




def _product_palette(product) -> list[str]:
    """Apply the user's velocity table at request time to an existing radar cache.

    Radar gate binaries are still quantized with their original display bounds,
    so generating the 256-color lookup table here requires no data rebuild.
    Existing PNG fallback frames retain their baked-in colors.
    """
    if (
        product.id == "VEL"
        and product.vmin is not None
        and product.vmax is not None
        and VELOCITY_PALETTE_PATH.is_file()
    ):
        return make_velocity_palette(
            VELOCITY_PALETTE_PATH,
            vmin=float(product.vmin),
            vmax=float(product.vmax),
        )
    return product.palette or []


def manifest_path(scenario_id: str) -> Path:
    return CACHE_ROOT / scenario_id / "radar" / "manifest.json"


@lru_cache(maxsize=8)
def _read_manifest(path_string: str, mtime_ns: int, size: int) -> RadarManifest:
    # The stat fingerprint invalidates the cache when a new weather package
    # replaces the manifest. Parsing large manifests on each poll is expensive.
    with Path(path_string).open("r", encoding="utf-8") as handle:
        return RadarManifest.model_validate(json.load(handle))


def _fingerprint(scenario_id: str) -> tuple[str, int, int] | None:
    path = manifest_path(scenario_id)
    try:
        stat = path.stat()
    except FileNotFoundError:
        return None
    return str(path.resolve()), stat.st_mtime_ns, stat.st_size


def load_radar_manifest(scenario_id: str) -> RadarManifest | None:
    fingerprint = _fingerprint(scenario_id)
    return _read_manifest(*fingerprint) if fingerprint is not None else None


@lru_cache(maxsize=8)
def _asset_first_times(path_string: str, mtime_ns: int, size: int) -> dict[str, object]:
    manifest = _read_manifest(path_string, mtime_ns, size)
    earliest: dict[str, object] = {}
    for frame in manifest.frames:
        assets = [frame.asset] + ([frame.data.asset] if frame.data else [])
        for asset in assets:
            if asset not in earliest or frame.timestamp < earliest[asset]:
                earliest[asset] = frame.timestamp
    return earliest


def radar_asset_first_time(scenario_id: str, asset_path: str):
    fingerprint = _fingerprint(scenario_id)
    if fingerprint is None:
        return None
    return _asset_first_times(*fingerprint).get(asset_path)


def radar_payload(
    session: SessionState,
    requested_product: str | None = None,
    requested_elevation: float | None = None,
    scan_mode: str = "matched",
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
    # Matched mode retains one authentic low-level reflectivity cut per
    # velocity update, without rewriting timestamps or altering the cache.
    if (
        scan_mode == "matched"
        and selected_product == "REF"
        and abs(selected_elevation - 0.5) < 0.051
    ):
        paired_assets = {
            frame.asset for frame in matched_reflectivity_frames(manifest, selected_elevation)
        }
        frames = [frame for frame in frames if frame.asset in paired_assets]


    session_root = f"/api/sessions/{session.code}/assets"
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
                "palette": _product_palette(product),
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
                "asset_url": f"{session_root}/{frame.asset.lstrip('/')}",
                "data_url": (
                    f"{session_root}/{frame.data.asset.lstrip('/')}"
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
