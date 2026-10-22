from __future__ import annotations

import argparse
from datetime import datetime, timedelta
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.services.scenario_loader import load_scenario_by_id


REQUIRED_MESO = {
    "mlcape",
    "bulk_shear_0_3km",
    "bulk_shear_0_6km",
    "srh_0_1km",
    "srh_0_3km",
    "goes_ir",
    "glm_flash_density",
    "mrms_mesh",
    "mrms_azshear",
    "mrms_precip_rate",
    "mrms_lowest_refl",
    "surface_obs",
}

MIN_MESO_FRAMES = {
    "mlcape": 3,
    "bulk_shear_0_3km": 3,
    "bulk_shear_0_6km": 3,
    "srh_0_1km": 3,
    "srh_0_3km": 3,
    "goes_ir": 20,
    "glm_flash_density": 20,
    "mrms_mesh": 50,
    "mrms_azshear": 50,
    "mrms_precip_rate": 50,
    "mrms_lowest_refl": 50,
    "surface_obs": 10,
}

REQUIRED_RADAR_PRODUCTS = {"REF", "VEL", "CC", "ZDR"}
MIN_RADAR_SCANS_PER_PRODUCT = 15

MESO_NEAR_REALTIME_PRODUCTS = {
    "goes_ir": (5, 10),
    "glm_flash_density": (10, 10),
    "mrms_mesh": (5, 5),
    "mrms_azshear": (5, 5),
    "mrms_precip_rate": (5, 5),
    "mrms_lowest_refl": (5, 5),
    "surface_obs": (5, 10),
}
RAP_ENVIRONMENT_PRODUCTS = {
    "mlcape",
    "bulk_shear_0_3km",
    "bulk_shear_0_6km",
    "srh_0_1km",
    "srh_0_3km",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate the participant-facing Endymion radar/meso caches."
    )
    parser.add_argument("--scenario-id", default="mardi-gras-dss-001")
    parser.add_argument("--cache-root", type=Path, default=Path("data/cache"))
    parser.add_argument("--require-lightningcast", action="store_true")
    parser.add_argument(
        "--require-startup-radar",
        action="store_true",
        help="Require initial REF and VEL 0.5-degree frames at/before the paused T=0 clock.",
    )
    parser.add_argument(
        "--scope",
        choices=["all", "radar", "meso"],
        default="all",
        help="Validate the complete cache, radar only, or meso only.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = args.cache_root / args.scenario_id
    failures = []

    scenario = load_scenario_by_id(args.scenario_id)
    scenario_start = datetime.fromisoformat(
        scenario.simulation.start.replace("Z", "+00:00")
    )
    scenario_end = datetime.fromisoformat(
        scenario.simulation.end.replace("Z", "+00:00")
    )
    exercise_date = scenario_start.date()
    exercise_date_token = scenario_start.strftime("%Y%m%d")

    if args.scope in {"all", "radar"}:
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
                frame_time = datetime.fromisoformat(frame["timestamp"].replace("Z", "+00:00"))
                if frame_time.date() != exercise_date:
                    failures.append(f"radar frame not mapped to exercise date: {frame['timestamp']}")
                    break
                if exercise_date_token not in Path(frame.get("asset", "")).name:
                    failures.append("radar participant asset filename does not use exercise date")
                    break
                if frame.get("source_key"):
                    failures.append("radar participant manifest exposes historical source_key")
                    break
                if frame_time > scenario_end:
                    failures.append(f"radar frame after scenario end: {frame['timestamp']}")
                    break
                radar_times.setdefault(frame["product"], set()).add(frame["timestamp"])
                if not (root / frame["asset"]).is_file():
                    failures.append(f"radar asset missing: {frame['asset']}")
                    break

            if args.require_startup_radar:
                # The user must see a historical scan when joining at T=0;
                # a first-frame grace period would leave a paused demo blank.
                for required_product in ("REF", "VEL"):
                    present_at_start = any(
                        item["product"] == required_product
                        and abs(float(item["elevation"]) - 0.5) < 0.051
                        and datetime.fromisoformat(
                            item["timestamp"].replace("Z", "+00:00")
                        ) <= scenario_start
                        for item in radar_frames
                    )
                    if not present_at_start:
                        failures.append(
                            f"radar {required_product} 0.5 degree has no real scan at T=0"
                        )

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
                else:
                    first_scan = min(
                        datetime.fromisoformat(value.replace("Z", "+00:00"))
                        for value in radar_times[product]
                    )
                    last_scan = max(
                        datetime.fromisoformat(value.replace("Z", "+00:00"))
                        for value in radar_times[product]
                    )
                    if first_scan > scenario_start + timedelta(minutes=10):
                        failures.append(
                            f"radar {product} first scan is too late: {first_scan.isoformat()}"
                        )
                    if last_scan < scenario_end - timedelta(minutes=5):
                        failures.append(
                            f"radar {product} ends too early: {last_scan.isoformat()}"
                        )

    if args.scope in {"all", "meso"}:
        meso_path = root / "meso" / "manifest.json"
        if not meso_path.exists():
            failures.append("meso manifest missing")
        else:
            meso = json.loads(meso_path.read_text(encoding="utf-8"))
            counts = {}
            meso_times: dict[str, list[datetime]] = {}
            for frame in meso.get("frames", []):
                counts[frame["product"]] = counts.get(frame["product"], 0) + 1
                frame_time = datetime.fromisoformat(frame["timestamp"].replace("Z", "+00:00"))
                if frame_time > scenario_end:
                    failures.append(f"meso frame after scenario end: {frame['timestamp']}")
                    break
                if frame_time.date() != exercise_date:
                    failures.append(f"meso frame not mapped to exercise date: {frame['timestamp']}")
                    break
                if exercise_date_token not in Path(frame.get("asset", "")).name:
                    failures.append("meso participant asset filename does not use exercise date")
                    break
                if frame.get("source_key"):
                    failures.append("meso participant manifest exposes historical source_key")
                    break
                meso_times.setdefault(frame["product"], []).append(frame_time)
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

            for product, (max_start_lag, max_end_lead) in MESO_NEAR_REALTIME_PRODUCTS.items():
                times = meso_times.get(product, [])
                if not times:
                    continue
                first = min(times)
                last = max(times)
                if first > scenario_start + timedelta(minutes=max_start_lag):
                    failures.append(
                        f"meso {product} first frame is too late: {first.isoformat()}"
                    )
                if last < scenario_end - timedelta(minutes=max_end_lead):
                    failures.append(
                        f"meso {product} ends too early: {last.isoformat()}"
                    )

            for product in sorted(RAP_ENVIRONMENT_PRODUCTS):
                times = meso_times.get(product, [])
                if not times:
                    continue
                if min(times) > scenario_start:
                    failures.append(
                        f"meso {product} lacks an analysis valid at/before exercise start"
                    )
                if max(times) < scenario_start + timedelta(minutes=60):
                    failures.append(
                        f"meso {product} lacks an updated analysis during the exercise"
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
