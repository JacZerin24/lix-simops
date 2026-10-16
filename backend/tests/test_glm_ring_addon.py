"""GLM add-on must accept equivalent UTC stamps and reject real time mismatches."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from pathlib import Path

import pytest

from scripts.install_glm_ring_addon import install, parse_utc_time


def fixture_root(tmp_path: Path, *, mismatch: bool = False) -> tuple[Path, Path]:
    root = tmp_path / "LIX-SimOps"
    root.mkdir()
    (root / "START_SIMOPS.bat").write_text("@echo off\n")
    manifest = root / "data/cache/mardi-gras-dss-001/meso/manifest.json"
    manifest.parent.mkdir(parents=True)
    source_times = [
        datetime(2027, 2, 6, 20, 50, tzinfo=timezone.utc) + timedelta(minutes=5 * i)
        for i in range(20)
    ]
    existing_frames = [
        {
            "timestamp": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "product": "glm_flash_density",
            "asset": f"meso/frames/glm_flash_density/base_{i}.png",
        }
        for i, t in enumerate(source_times)
    ]
    existing_frames.append({
        "timestamp": source_times[0].isoformat(),
        "product": "lightningcast",
        "asset": "meso/frames/lightningcast/lightningcast.png",
    })
    manifest.write_text(json.dumps({
        "products": [
            {"id": "glm_flash_density", "label": "Observed GLM"},
            {"id": "lightningcast", "label": "LightningCast"},
        ],
        "frames": existing_frames,
    }), encoding="utf-8")
    frames, files = [], []
    for i, t in enumerate(source_times):
        if i == 0 and mismatch:
            t += timedelta(minutes=1)
        asset = f"meso/frames/glm_flash_density_rings/glm_flash_density_rings_{t:%Y%m%dT%H%M%SZ}.png"
        png = b"\x89PNG\r\n\x1a\n" + bytes([i])
        out = root / "data/cache/mardi-gras-dss-001" / asset
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(png)
        frames.append({"timestamp": t.isoformat(), "product": "glm_flash_density_rings", "asset": asset})
        files.append({"asset": asset, "bytes": len(png), "sha256": sha256(png).hexdigest()})
    (root / "GLM_RINGS_ADDON_MANIFEST.json").write_text(json.dumps({
        "schema_version": 1, "scenario_id": "mardi-gras-dss-001",
        "exercise_date": "2027-02-06",
        "product": {"id": "glm_flash_density_rings", "label": "GLM rings"},
        "frames": frames, "files": files,
    }), encoding="utf-8")
    return root, manifest


def test_mixed_utc_notation_is_same_instant() -> None:
    a = parse_utc_time("2027-02-06T20:50:00Z")
    b = parse_utc_time("2027-02-06T20:50:00+00:00")
    c = parse_utc_time("2027-02-06T14:50:00-06:00")
    assert a == b == c


def test_installs_mixed_utc_frames_without_disturbing_lightningcast(tmp_path: Path) -> None:
    root, manifest = fixture_root(tmp_path)
    assert install(root) == 20
    first = json.loads(manifest.read_text())
    assert {p["id"] for p in first["products"]} == {
        "glm_flash_density", "glm_flash_density_rings", "lightningcast"
    }
    assert len(first["frames"]) == 41
    assert install(root) == 20
    second = json.loads(manifest.read_text())
    assert second["frames"] == first["frames"]


def test_does_not_change_manifest_if_scene_is_actually_mismatched(tmp_path: Path) -> None:
    root, manifest = fixture_root(tmp_path, mismatch=True)
    before = manifest.read_bytes()
    with pytest.raises(ValueError, match="nearest existing GLM time"):
        install(root)
    assert manifest.read_bytes() == before
    assert not (manifest.parent / "manifest.pre-glm-rings.json").exists()


def test_naive_timestamps_refused() -> None:
    with pytest.raises(ValueError, match="without a UTC offset"):
        parse_utc_time("2027-02-06T20:50:00")
