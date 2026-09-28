from __future__ import annotations

import argparse
from pathlib import Path

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
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_root = Path("data/cache") / args.scenario_id
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
    )
    print(
        f"Built {len(manifest.frames)} radar frames for "
        f"{manifest.radar_site} at {output_root / 'radar'}"
    )


if __name__ == "__main__":
    main()
