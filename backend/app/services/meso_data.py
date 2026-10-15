from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from simulator.meso.manifest import MesoManifest, visible_frames

from ..state import SessionState
from .radar_data import CACHE_ROOT


def manifest_path(scenario_id: str) -> Path:
    return CACHE_ROOT / scenario_id / "meso" / "manifest.json"


@lru_cache(maxsize=8)
def _read_manifest(path_string: str, mtime_ns: int, size: int) -> MesoManifest:
    # The stat fingerprint invalidates the cache when a new weather package
    # replaces the manifest. Parsing large manifests on each poll is expensive.
    with Path(path_string).open("r", encoding="utf-8") as handle:
        return MesoManifest.model_validate(json.load(handle))


def _fingerprint(scenario_id: str) -> tuple[str, int, int] | None:
    path = manifest_path(scenario_id)
    try:
        stat = path.stat()
    except FileNotFoundError:
        return None
    return str(path.resolve()), stat.st_mtime_ns, stat.st_size


def load_meso_manifest(scenario_id: str) -> MesoManifest | None:
    fingerprint = _fingerprint(scenario_id)
    return _read_manifest(*fingerprint) if fingerprint is not None else None


@lru_cache(maxsize=8)
def _asset_first_times(path_string: str, mtime_ns: int, size: int) -> dict[str, object]:
    manifest = _read_manifest(path_string, mtime_ns, size)
    earliest: dict[str, object] = {}
    for frame in manifest.frames:
        assets = [frame.asset]
        for asset in assets:
            if asset not in earliest or frame.timestamp < earliest[asset]:
                earliest[asset] = frame.timestamp
    return earliest


def meso_asset_first_time(scenario_id: str, asset_path: str):
    fingerprint = _fingerprint(scenario_id)
    if fingerprint is None:
        return None
    return _asset_first_times(*fingerprint).get(asset_path)


def meso_payload(
    session: SessionState,
    requested_product: str | None = None,
) -> dict:
    manifest = load_meso_manifest(session.scenario_id)
    if manifest is None or not manifest.products:
        return {
            "available": False,
            "scenario_id": session.scenario_id,
            "sim_time": session.sim_time.isoformat(),
            "categories": [],
            "products": [],
            "selected_product": requested_product or "",
            "frames": [],
        }

    product_ids = [product.id for product in manifest.products]
    selected_product = (
        requested_product if requested_product in product_ids else manifest.products[0].id
    )
    frames = visible_frames(manifest, session.sim_time, selected_product)

    categories: list[str] = []
    for product in manifest.products:
        if product.category not in categories:
            categories.append(product.category)

    session_root = f"/api/sessions/{session.code}/assets"
    return {
        "available": True,
        "scenario_id": session.scenario_id,
        "sim_time": session.sim_time.isoformat(),
        "categories": categories,
        "products": [
            {
                "id": product.id,
                "label": product.label,
                "category": product.category,
                "units": product.units,
                "description": product.description,
                "kind": product.kind,
            }
            for product in manifest.products
        ],
        "selected_product": selected_product,
        "frames": [
            {
                "timestamp": frame.timestamp.isoformat(),
                "product": frame.product,
                "asset_url": f"{session_root}/{frame.asset.lstrip('/')}",
            }
            for frame in frames
        ],
    }
