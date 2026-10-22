"""Regression coverage for cached manifests and source-time gating."""

import json
from datetime import datetime, timezone

from backend.app.services import radar_data, meso_data


def _write_manifest(root, kind: str, label: str):
    folder = root / "case" / kind
    folder.mkdir(parents=True, exist_ok=True)
    if kind == "radar":
        payload = {
            "radar_site": "KLIX",
            "generated_at": "2026-10-15T00:00:00Z",
            "products": [{"id": "REF", "label": label, "field": "reflectivity"}],
            "frames": [
                {
                    "timestamp": "2027-02-06T20:45:00Z",
                    "product": "REF",
                    "elevation": 0.5,
                    "asset": "radar/frames/early.png",
                    "data": {
                        "asset": "radar/gates/early.bin",
                        "azimuth_bins": 2,
                        "range_bins": 2,
                        "range_start_m": 0,
                        "range_step_m": 250,
                        "value_min": 0,
                        "value_max": 70,
                    },
                },
                {
                    "timestamp": "2027-02-06T20:55:00Z",
                    "product": "REF",
                    "elevation": 0.5,
                    "asset": "radar/frames/late.png",
                },
            ],
        }
    else:
        payload = {
            "generated_at": "2026-10-15T00:00:00Z",
            "products": [{"id": "ir", "label": label, "category": "Satellite"}],
            "frames": [
                {
                    "timestamp": "2027-02-06T20:45:00Z",
                    "product": "ir",
                    "asset": "meso/frames/early.png",
                },
                {
                    "timestamp": "2027-02-06T20:55:00Z",
                    "product": "ir",
                    "asset": "meso/frames/late.png",
                },
            ],
        }
    (folder / "manifest.json").write_text(json.dumps(payload), encoding="utf-8")


def test_radar_manifest_is_cached_but_detects_updated_weather_package(tmp_path, monkeypatch):
    monkeypatch.setattr(radar_data, "CACHE_ROOT", tmp_path)
    _write_manifest(tmp_path, "radar", "Base reflectivity")
    first = radar_data.load_radar_manifest("case")
    second = radar_data.load_radar_manifest("case")
    assert first is second
    start = datetime(2027, 2, 6, 20, 45, tzinfo=timezone.utc)
    assert radar_data.radar_asset_first_time("case", "radar/frames/early.png") == start
    assert radar_data.radar_asset_first_time("case", "radar/gates/early.bin") == start
    assert radar_data.radar_asset_first_time("case", "radar/frames/late.png") > start
    assert radar_data.radar_asset_first_time("case", "unlisted.png") is None

    _write_manifest(tmp_path, "radar", "Updated radar reflectivity")
    newer = radar_data.load_radar_manifest("case")
    assert newer is not first
    assert newer.products[0].label == "Updated radar reflectivity"


def test_meso_manifest_is_cached_but_detects_updated_weather_package(tmp_path, monkeypatch):
    monkeypatch.setattr(meso_data, "CACHE_ROOT", tmp_path)
    _write_manifest(tmp_path, "meso", "Infrared")
    first = meso_data.load_meso_manifest("case")
    second = meso_data.load_meso_manifest("case")
    assert first is second
    start = datetime(2027, 2, 6, 20, 45, tzinfo=timezone.utc)
    assert meso_data.meso_asset_first_time("case", "meso/frames/early.png") == start
    assert meso_data.meso_asset_first_time("case", "meso/frames/late.png") > start
    assert meso_data.meso_asset_first_time("case", "unlisted.png") is None

    _write_manifest(tmp_path, "meso", "Updated infrared")
    newer = meso_data.load_meso_manifest("case")
    assert newer is not first
    assert newer.products[0].label == "Updated infrared"
