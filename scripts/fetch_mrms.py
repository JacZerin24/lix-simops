from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import re

import boto3
from botocore import UNSIGNED
from botocore.config import Config


TIME_RE = re.compile(r"_(\d{8})-(\d{6})")


def parse_clock(value: str) -> datetime.time:
    return datetime.strptime(value, "%H:%M").time()


def object_timestamp(key: str) -> datetime | None:
    match = TIME_RE.search(Path(key).name)
    if not match:
        return None
    parsed = datetime.strptime(
        f"{match.group(1)}{match.group(2)}",
        "%Y%m%d%H%M%S",
    )
    return parsed.replace(tzinfo=timezone.utc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download historical CONUS MRMS products from NOAA Open Data on AWS."
    )
    parser.add_argument("--date", required=True, help="UTC date YYYY-MM-DD")
    parser.add_argument("--start", default="00:00", help="UTC start HH:MM")
    parser.add_argument("--end", default="23:59", help="UTC end HH:MM")
    parser.add_argument(
        "--products",
        nargs="+",
        required=True,
        help="MRMS product directories, e.g. MESH_00.50 PrecipRate_00.00",
    )
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--region", default="CONUS")
    parser.add_argument("--list-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    day = datetime.strptime(args.date, "%Y-%m-%d").date()
    start_dt = datetime.combine(day, parse_clock(args.start), tzinfo=timezone.utc)
    end_dt = datetime.combine(day, parse_clock(args.end), tzinfo=timezone.utc)
    if end_dt < start_dt:
        raise SystemExit("--end must not be earlier than --start")

    bucket = "noaa-mrms-pds"
    s3 = boto3.client(
        "s3",
        config=Config(signature_version=UNSIGNED),
        region_name="us-east-1",
    )

    total = 0
    for product in args.products:
        prefix = f"{args.region}/{product}/{day:%Y%m%d}/"
        selected: list[tuple[str, int]] = []
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                key = item["Key"]
                timestamp = object_timestamp(key)
                if timestamp is None or not (start_dt <= timestamp <= end_dt):
                    continue
                selected.append((key, int(item.get("Size", 0))))

        selected.sort()
        print(f"{product}: {len(selected)} files")
        if args.list_only:
            for key, size in selected:
                print(f"{size:>10}  s3://{bucket}/{key}")
            total += len(selected)
            continue

        destination_dir = args.output / product
        destination_dir.mkdir(parents=True, exist_ok=True)
        for index, (key, expected_size) in enumerate(selected, start=1):
            destination = destination_dir / Path(key).name
            if destination.exists() and expected_size and destination.stat().st_size == expected_size:
                print(f"[{product} {index}/{len(selected)}] exists: {destination.name}")
                continue
            print(f"[{product} {index}/{len(selected)}] downloading {destination.name}")
            s3.download_file(bucket, key, str(destination))
        total += len(selected)

    if total == 0:
        raise SystemExit("No MRMS files matched the requested products/window.")

    print(f"Complete: {total} files")


if __name__ == "__main__":
    main()
