from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

import yaml

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from simulator.meso.manifest import MesoFrame, MesoManifest, MesoProduct
from simulator.time_mapping import remap_timestamp_to_simulation_date


TIME_RE = re.compile(r"(\d{8})[T_\-]?(\d{6})Z?")


def timestamp_from_filename(path: Path) -> datetime:
    match = TIME_RE.search(path.stem)
    if not match:
        raise ValueError(f"No YYYYMMDDHHMMSS-style timestamp found in {path.name}")
    parsed = datetime.strptime(
        f"{match.group(1)}{match.group(2)}",
        "%Y%m%d%H%M%S",
    )
    return parsed.replace(tzinfo=timezone.utc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a time-gated mesoanalysis image cache for LIX SimOps."
    )
    parser.add_argument("--scenario-id", required=True)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument(
        "--simulation-date",
        help="Optional exercise date YYYY-MM-DD. Preserves historical local clock time.",
    )
    parser.add_argument("--timezone", default="America/Chicago")
    parser.add_argument(
        "--local-time-offset-minutes",
        type=int,
        default=0,
        help="Shift historical local clock time before mapping to the exercise date.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    with args.config.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}

    output_root = Path("data/cache") / args.scenario_id
    meso_root = output_root / "meso"
    frame_root = meso_root / "frames"
    frame_root.mkdir(parents=True, exist_ok=True)

    simulation_date = (
        datetime.strptime(args.simulation_date, "%Y-%m-%d").date()
        if args.simulation_date
        else None
    )
    zone = ZoneInfo(args.timezone)

    products: list[MesoProduct] = []
    source_items: list[tuple[MesoProduct, Path, datetime]] = []

    for item in config.get("products", []):
        product = MesoProduct(
            id=item["id"],
            label=item["label"],
            category=item["category"],
            units=item.get("units", ""),
            description=item.get("description", ""),
            kind=item.get("kind", "image"),
        )
        source_dir = Path(item["source_dir"])
        pattern = item.get("pattern", "*")
        if not source_dir.exists():
            print(f"{product.id}: source directory missing ({source_dir}); omitting unavailable product")
            continue

        product_sources: list[tuple[MesoProduct, Path, datetime]] = []
        for source in sorted(source_dir.glob(pattern)):
            if not source.is_file():
                continue
            try:
                product_sources.append((product, source, timestamp_from_filename(source)))
            except ValueError as exc:
                print(f"{product.id}: skipping {source.name}: {exc}")

        if not product_sources:
            print(f"{product.id}: no usable frames; omitting unavailable product")
            continue

        products.append(product)
        source_items.extend(product_sources)

    source_base_date = (
        min(timestamp.astimezone(zone).date() for _, _, timestamp in source_items)
        if source_items
        else None
    )

    frames: list[MesoFrame] = []
    for product, source, source_timestamp in source_items:
        timestamp = (
            remap_timestamp_to_simulation_date(
                source_timestamp,
                source_base_date=source_base_date,
                simulation_base_date=simulation_date,
                timezone_name=args.timezone,
                local_time_offset_minutes=args.local_time_offset_minutes,
            )
            if simulation_date and source_base_date
            else source_timestamp
        )

        destination_dir = frame_root / product.id
        destination_dir.mkdir(parents=True, exist_ok=True)
        destination = destination_dir / (
            f"{product.id}_{timestamp.strftime('%Y%m%dT%H%M%SZ')}{source.suffix.lower()}"
        )
        shutil.copy2(source, destination)
        frames.append(
            MesoFrame(
                timestamp=timestamp,
                product=product.id,
                asset=destination.relative_to(output_root).as_posix(),
            )
        )

    manifest = MesoManifest(
        generated_at=datetime.now(timezone.utc),
        products=products,
        frames=sorted(frames, key=lambda frame: (frame.timestamp, frame.product)),
    )
    with (meso_root / "manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest.model_dump(mode="json", exclude_none=True), handle, indent=2)

    print(
        f"Built meso manifest with {len(products)} products and "
        f"{len(frames)} frames at {meso_root}"
    )


if __name__ == "__main__":
    main()
