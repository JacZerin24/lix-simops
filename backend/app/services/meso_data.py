from __future__ import annotations

import json
from pathlib import Path

from simulator.meso.manifest import MesoManifest, visible_frames

from ..state import SessionState
from .radar_data import CACHE_ROOT


def manifest_path(scenario_id: str) -> Path:
    return CACHE_ROOT / scenario_id / "meso" / "manifest.json"


def load_meso_manifest(scenario_id: str) -> MesoManifest | None:
    path = manifest_path(scenario_id)
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return MesoManifest.model_validate(json.load(handle))


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
