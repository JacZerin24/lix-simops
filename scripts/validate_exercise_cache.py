from __future__ import annotations

import argparse
from datetime import datetime
import json
from pathlib import Path


REQUIRED_MESO = {
    "mlcape",
    "bulk_shear_0_6km",
    "srh_0_1km",
    "goes_ir",
    "goes_vis",
    "glm_flash_density",
    "mrms_mesh",
    "mrms_azshear",
    "mrms_precip_rate",
    "mrms_lowest_refl",
    "surface_obs",
}

MIN_MESO_FRAMES = {
    "mlcape": 3,
    "bulk_shear_0_6km": 3,
    "srh_0_1km": 3,
    "goes_ir": 27,
    "goes_vis": 27,
    "glm_flash_density": 27,
    "mrms_mesh": 68,
    "mrms_azshear": 68,
    "mrms_precip_rate": 68,
    "mrms_lowest_refl": 68,
    "surface_obs": 14,
}

REQUIRED_RADAR_PRODUCTS = {"REF", "VEL", "CC", "ZDR"}
MIN_RADAR_SCANS_PER_PRODUCT = 18


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate the participant-facing Endymion radar/meso caches."
    )
    parser.add_argument("--scenario-id", default="mardi-gras-dss-001")
    parser.add_argument("--cache-root", type=Path, default=Path("data/cache"))
    parser.add_argument("--require-lightningcast", action="store_true")
    return parser.parse_args()


def exercise_date_ok(value: str) -> bool:
    timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return timestamp.year == 2027 and timestamp.month == 2 and timestamp.day in {6, 7}


def main() -> None:
    args = parse_args()
    root = args.cache_root / args.scenario_id
    failures = []

    radar_path = root / "radar" / "manifest.json"
    if not radar_path.exists():
        failures.append("radar manifest missing")
    else:
        radar = json.loads(radar_path.read_text(encoding="utf-8"))
        radar_frames = radar.get("frames", [])
        if not radar_frames:
            failures.append("radar manifest has no frames")
        radar_times: dict[str, set[str]] = {}
        for frame in radar_frames:
            if not exercise_date_ok(frame["timestamp"]):
                failures.append(f"radar source-date leak in timestamp: {frame['timestamp']}")
                break
            if "20221214" in frame.get("asset", ""):
                failures.append("radar source date appears in participant asset path")
                break
            if frame.get("source_key"):
                failures.append("radar participant manifest exposes historical source_key")
                break
            radar_times.setdefault(frame["product"], set()).add(frame["timestamp"])
            if not (root / frame["asset"]).is_file():
                failures.append(f"radar asset missing: {frame['asset']}")
                break

        missing_radar = sorted(REQUIRED_RADAR_PRODUCTS - set(radar_times))
        if missing_radar:
            failures.append("radar products with no frames: " + ", ".join(missing_radar))
        for product in sorted(REQUIRED_RADAR_PRODUCTS & set(radar_times)):
            scan_count = len(radar_times[product])
            if scan_count < MIN_RADAR_SCANS_PER_PRODUCT:
                failures.append(
                    f"radar {product} has only {scan_count} scan times; "
                    f"expected at least {MIN_RADAR_SCANS_PER_PRODUCT}"
                )

    meso_path = root / "meso" / "manifest.json"
    if not meso_path.exists():
        failures.append("meso manifest missing")
    else:
        meso = json.loads(meso_path.read_text(encoding="utf-8"))
        counts = {}
        for frame in meso.get("frames", []):
            counts[frame["product"]] = counts.get(frame["product"], 0) + 1
            if not exercise_date_ok(frame["timestamp"]):
                failures.append(f"meso source-date leak in timestamp: {frame['timestamp']}")
                break
            if "20221214" in frame.get("asset", ""):
                failures.append("meso source date appears in participant asset path")
                break
            if frame.get("source_key"):
                failures.append("meso participant manifest exposes historical source_key")
                break
            if not (root / frame["asset"]).is_file():
                failures.append(f"meso asset missing: {frame['asset']}")
                break

        required = set(REQUIRED_MESO)
        if args.require_lightningcast:
            required.add("lightningcast")

        missing = sorted(product for product in required if counts.get(product, 0) == 0)
        if missing:
            failures.append("meso products with no frames: " + ", ".join(missing))

        for product, minimum in sorted(MIN_MESO_FRAMES.items()):
            count = counts.get(product, 0)
            if count and count < minimum:
                failures.append(
                    f"meso {product} has only {count} frames; expected at least {minimum}"
                )

        print("Meso frame counts:")
        for product, count in sorted(counts.items()):
            print(f"  {product:<32} {count:>5}")

    if failures:
        print("\nValidation failures:")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)

    print("\nExercise cache validation passed.")


if __name__ == "__main__":
    main()
