"""Safely merge case-blind GLM ring frames into an existing portable SimOps cache.

The user extracts the GLM add-on ZIP into the portable root, then runs
INSTALL_GLM_RINGS.bat after stopping SimOps. No network, admin, or model
software required.
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import shutil
import sys


PRODUCT = "glm_flash_density_rings"


def parse_utc_time(raw: str) -> datetime:
    """Normalize valid ISO-8601 variants (Z, +00:00, and local offsets)."""
    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"Meso cache contains a timestamp without a UTC offset: {raw}")
    return parsed.astimezone(timezone.utc)


def install(root: Path) -> int:
    if not (root / "START_SIMOPS.bat").is_file():
        raise ValueError("Extract the GLM ZIP to the existing LIX-SimOps root first")
    patch_file = root / "GLM_RINGS_ADDON_MANIFEST.json"
    patch = json.loads(patch_file.read_text(encoding="utf-8"))
    if (
        patch.get("schema_version") != 1
        or patch.get("scenario_id") != "mardi-gras-dss-001"
        or patch.get("exercise_date") != "2027-02-06"
        or patch.get("product", {}).get("id") != PRODUCT
    ):
        raise ValueError("GLM ring add-on does not match this Endymion exercise")

    case_root = root / "data" / "cache" / "mardi-gras-dss-001"
    meso_manifest = case_root / "meso" / "manifest.json"
    if not meso_manifest.exists():
        raise ValueError("Existing Meso cache missing. This is an add-on, not a full case.")
    current = json.loads(meso_manifest.read_text(encoding="utf-8"))
    products = current.get("products")
    frames = current.get("frames")
    if not isinstance(products, list) or not isinstance(frames, list):
        raise ValueError("Existing Meso manifest malformed")
    base_times = {parse_utc_time(f["timestamp"]) for f in frames if f["product"] == "glm_flash_density"}
    if len(base_times) < 20:
        raise ValueError("Existing GLM flash-density time series is incomplete")
    if len(patch.get("frames", [])) < 20:
        raise ValueError("GLM ring add-on contains too few map frames")
    verified_assets = set()
    for row in patch.get("files", []):
        asset = row["asset"]
        rel = Path(asset)
        if (
            rel.is_absolute() or ".." in rel.parts
            or rel.parts[:3] != ("meso", "frames", PRODUCT)
        ):
            raise ValueError(f"Invalid path in GLM add-on: {asset}")
        filename = rel.name
        if not filename.startswith(f"{PRODUCT}_20270206T") or not filename.endswith(".png"):
            raise ValueError("GLM ring file is not case-blind")
        data = (case_root / rel).read_bytes()
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError(f"Invalid PNG: {filename}")
        if row["bytes"] != len(data) or row["sha256"] != sha256(data).hexdigest():
            raise ValueError(f"GLM image checksum mismatch: {filename}")
        verified_assets.add(asset)
    for frame in patch["frames"]:
        if frame["product"] != PRODUCT or frame["asset"] not in verified_assets:
            raise ValueError("GLM ring manifest has unverified frame")
        timestamp = parse_utc_time(frame["timestamp"])
        if timestamp.date().isoformat() != "2027-02-06":
            raise ValueError("GLM ring frame has wrong exercise date")
        if timestamp not in base_times:
            closest = min(base_times, key=lambda value: abs(value - timestamp))
            raise ValueError(
                "GLM ring frame does not match an observed GLM scene at the same "
                "UTC instant in this cache. Ring time: " + frame["timestamp"] +
                "; nearest existing GLM time: " + closest.isoformat() +
                ". No manifest changes made."
            )

    merged = dict(current)
    merged["products"] = [p for p in products if p["id"] != PRODUCT] + [patch["product"]]
    merged["frames"] = sorted(
        [f for f in frames if f["product"] != PRODUCT] + patch["frames"],
        key=lambda f: (parse_utc_time(f["timestamp"]), f["product"]),
    )
    backup = meso_manifest.with_name("manifest.pre-glm-rings.json")
    shutil.copy2(meso_manifest, backup)
    pending = meso_manifest.with_name("manifest.pending-glm-rings.json")
    pending.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")
    os.replace(pending, meso_manifest)
    print(f"Installed {len(patch['frames'])} GLM ring frames. Existing products preserved.")
    print(f"Manifest backup: {backup}")
    return len(patch["frames"])


if __name__ == "__main__":
    try:
        install(Path(__file__).resolve().parent)
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
