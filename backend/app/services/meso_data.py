from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from simulator.meso.manifest import MesoFrame, MesoManifest, MesoProduct, visible_frames

from ..state import SessionState
from .radar_data import CACHE_ROOT

# Optional, case-blind, T=0 archival sounding overlay for the Endymion exercise.
# The binary image is distributed separately with workshop assets, not in git.
WORKSHOP_SCENARIO_ID = "mardi-gras-dss-001"
SOUNDING_ID = "rap_kmsy_sounding"
SOUNDING_ASSET = "meso/frames/rap_kmsy_sounding/KMSY_RAP_F00_20270206_1445CST.png"
SOUNDING_VALID = datetime(2027, 2, 6, 20, 45, tzinfo=timezone.utc)


def _workshop_sounding_installed(scenario_id: str) -> bool:
    return (
        scenario_id == WORKSHOP_SCENARIO_ID
        and (CACHE_ROOT / scenario_id / SOUNDING_ASSET).is_file()
    )



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
    # Only explicitly allow the optional image at/after its exercise-valid time.
    # Missing assets or any other scenario remain inaccessible.
    if asset_path == SOUNDING_ASSET and _workshop_sounding_installed(scenario_id):
        return SOUNDING_VALID
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

    products = list(manifest.products)
    if _workshop_sounding_installed(session.scenario_id):
        products.append(
            MesoProduct(
                id=SOUNDING_ID,
                label="RAP F00 Sounding - KMSY",
                category="Thermodynamics",
                units="",
                description=(
                    "Displaced RAP analysis/forecast profile for the simulated "
                    "2:45 PM CST exercise start. Static reference sounding with "
                    "Skew-T, hodograph and derived parameters; not a live update."
                ),
            )
        )

    product_ids = [product.id for product in products]
    selected_product = (
        requested_product if requested_product in product_ids else products[0].id
    )
    if selected_product == SOUNDING_ID:
        frames = (
            [MesoFrame(timestamp=SOUNDING_VALID, product=SOUNDING_ID, asset=SOUNDING_ASSET)]
            if session.sim_time >= SOUNDING_VALID else []
        )
    else:
        frames = visible_frames(manifest, session.sim_time, selected_product)

    categories: list[str] = []
    for product in products:
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
            for product in products
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
