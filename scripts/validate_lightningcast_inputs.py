from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path
import re


CHANNEL_RE = re.compile(r"C(02|05|13|15)")
START_RE = re.compile(r"_s(\d{4}\d{3}\d{2}\d{2})")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check that each historical LightningCast ABI scan has channels 2, 5, 13 and 15."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/raw/goes/lightningcast-inputs"),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    groups = defaultdict(set)
    files = sorted(args.input.glob("*.nc"))
    if not files:
        raise SystemExit(f"No ABI L1b files found in {args.input}")

    for path in files:
        channel = CHANNEL_RE.search(path.name)
        start = START_RE.search(path.name)
        if not channel or not start:
            continue
        groups[start.group(1)].add(channel.group(1))

    required = {"02", "05", "13", "15"}
    incomplete = []
    for scan, channels in sorted(groups.items()):
        missing = sorted(required - channels)
        if missing:
            incomplete.append((scan, missing))

    print(f"Scans found: {len(groups)}")
    print(f"Complete 4-channel scans: {len(groups) - len(incomplete)}")
    if incomplete:
        for scan, missing in incomplete[:20]:
            print(f"{scan}: missing {', '.join(missing)}")
        raise SystemExit(f"{len(incomplete)} LightningCast input scans are incomplete.")


if __name__ == "__main__":
    main()
