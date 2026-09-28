from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

import yaml

from simulator.meso.manifest import MesoFrame, MesoManifest, MesoProduct


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
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    with args.config.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}

    output_root = Path("data/cache") / args.scenario_id
    meso_root = output_root / "meso"
    frame_root = meso_root / "frames"
    frame_root.mkdir(parents=True, exist_ok=True)

    products: list[MesoProduct] = []
    frames: list[MesoFrame] = []

    for item in config.get("products", []):
        product = MesoProduct(
            id=item["id"],
            label=item["label"],
            category=item["category"],
            units=item.get("units", ""),
            description=item.get("description", ""),
            kind=item.get("kind", "image"),
        )
        products.append(product)

        source_dir = Path(item["source_dir"])
        pattern = item.get("pattern", "*")
        if not source_dir.exists():
            print(f"{product.id}: source directory missing ({source_dir}); keeping product with no frames")
            continue

        destination_dir = frame_root / product.id
        destination_dir.mkdir(parents=True, exist_ok=True)

        for source in sorted(source_dir.glob(pattern)):
            if not source.is_file():
                continue
            try:
                timestamp = timestamp_from_filename(source)
            except ValueError as exc:
                print(f"{product.id}: skipping {source.name}: {exc}")
                continue

            destination = destination_dir / source.name
            shutil.copy2(source, destination)
            frames.append(
                MesoFrame(
                    timestamp=timestamp,
                    product=product.id,
                    asset=destination.relative_to(output_root).as_posix(),
                    source_key=str(source),
                )
            )

    manifest = MesoManifest(
        generated_at=datetime.now(timezone.utc),
        products=products,
        frames=sorted(frames, key=lambda frame: (frame.timestamp, frame.product)),
    )
    with (meso_root / "manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest.model_dump(mode="json"), handle, indent=2)

    print(
        f"Built meso manifest with {len(products)} products and "
        f"{len(frames)} frames at {meso_root}"
    )


if __name__ == "__main__":
    main()
