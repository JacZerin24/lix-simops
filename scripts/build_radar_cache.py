from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from simulator.radar.preprocessing import build_radar_cache


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render archived NEXRAD volumes into a LIX SimOps radar cache."
    )
    parser.add_argument("--scenario-id", required=True)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--site", required=True)
    parser.add_argument(
        "--products",
        nargs="+",
        default=["REF", "VEL", "CC", "ZDR"],
    )
    parser.add_argument(
        "--elevations",
        nargs="+",
        type=float,
        default=[0.5, 0.9, 1.3],
    )
    parser.add_argument("--range-km", type=float, default=230.0)
    parser.add_argument("--event-lat", type=float)
    parser.add_argument("--event-lon", type=float)
    parser.add_argument("--event-label", default="Event")
    parser.add_argument(
        "--simulation-date",
        help="Optional exercise date YYYY-MM-DD. Preserves historical local clock time.",
    )
    parser.add_argument("--timezone", default="America/Chicago")
    parser.add_argument(
        "--local-time-offset-minutes",
        type=int,
        default=0,
        help="Shift the displaced case clock after remapping to the simulation date.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_root = Path("data/cache") / args.scenario_id
    simulation_date = (
        datetime.strptime(args.simulation_date, "%Y-%m-%d").date()
        if args.simulation_date
        else None
    )
    manifest = build_radar_cache(
        input_dir=args.input,
        output_root=output_root,
        radar_site=args.site.upper(),
        products=[value.upper() for value in args.products],
        elevations=args.elevations,
        range_km=args.range_km,
        event_lat=args.event_lat,
        event_lon=args.event_lon,
        event_label=args.event_label,
        simulation_date=simulation_date,
        timezone_name=args.timezone,
        local_time_offset_minutes=args.local_time_offset_minutes,
    )
    data_frames = sum(frame.data is not None for frame in manifest.frames)
    print(
        f"Built {len(manifest.frames)} radar frames ({data_frames} data-aware) for "
        f"{manifest.radar_site} at {output_root / 'radar'}"
    )


if __name__ == "__main__":
    main()
