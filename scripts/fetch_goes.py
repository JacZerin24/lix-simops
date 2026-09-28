from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import re

import boto3
from botocore import UNSIGNED
from botocore.config import Config


START_RE = re.compile(r"_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(\d)")


def parse_clock(value: str) -> datetime.time:
    return datetime.strptime(value, "%H:%M").time()


def object_start_time(key: str) -> datetime | None:
    match = START_RE.search(Path(key).name)
    if not match:
        return None
    year = int(match.group(1))
    julian = int(match.group(2))
    hour = int(match.group(3))
    minute = int(match.group(4))
    second = int(match.group(5))
    tenth = int(match.group(6))
    base = datetime.strptime(f"{year}{julian:03d}", "%Y%j")
    return base.replace(
        hour=hour,
        minute=minute,
        second=second,
        microsecond=tenth * 100_000,
        tzinfo=timezone.utc,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download historical GOES files from NOAA Open Data on AWS."
    )
    parser.add_argument("--satellite", type=int, default=16, choices=[16, 18, 19])
    parser.add_argument("--date", required=True, help="UTC date YYYY-MM-DD")
    parser.add_argument("--start", default="00:00", help="UTC start HH:MM")
    parser.add_argument("--end", default="23:59", help="UTC end HH:MM")
    parser.add_argument("--product", required=True, help="GOES bucket product prefix")
    parser.add_argument(
        "--channels",
        nargs="*",
        type=int,
        help="Optional ABI channels to keep, e.g. 2 5 13 15",
    )
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--list-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    day = datetime.strptime(args.date, "%Y-%m-%d").date()
    start_dt = datetime.combine(day, parse_clock(args.start), tzinfo=timezone.utc)
    end_dt = datetime.combine(day, parse_clock(args.end), tzinfo=timezone.utc)
    if end_dt < start_dt:
        raise SystemExit("--end must not be earlier than --start")

    bucket = f"noaa-goes{args.satellite}"
    s3 = boto3.client(
        "s3",
        config=Config(signature_version=UNSIGNED),
        region_name="us-east-1",
    )

    selected: list[tuple[str, int]] = []
    current_hour = start_dt.replace(minute=0, second=0, microsecond=0)
    while current_hour <= end_dt:
        prefix = (
            f"{args.product}/{current_hour:%Y}/"
            f"{current_hour.timetuple().tm_yday:03d}/{current_hour:%H}/"
        )
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                key = item["Key"]
                timestamp = object_start_time(key)
                if timestamp is None or not (start_dt <= timestamp <= end_dt):
                    continue
                if args.channels:
                    name = Path(key).name
                    if not any(f"C{channel:02d}" in name for channel in args.channels):
                        continue
                selected.append((key, int(item.get("Size", 0))))
        current_hour += __import__("datetime").timedelta(hours=1)

    selected = sorted(set(selected))
    if not selected:
        raise SystemExit(
            f"No files found in s3://{bucket}/{args.product} "
            f"for {start_dt:%Y-%m-%d %H:%MZ}–{end_dt:%H:%MZ}"
        )

    print(f"Found {len(selected)} {args.product} files in s3://{bucket}")
    if args.list_only:
        for key, size in selected:
            print(f"{size:>10}  s3://{bucket}/{key}")
        return

    args.output.mkdir(parents=True, exist_ok=True)
    for index, (key, expected_size) in enumerate(selected, start=1):
        destination = args.output / Path(key).name
        if destination.exists() and expected_size and destination.stat().st_size == expected_size:
            print(f"[{index}/{len(selected)}] exists: {destination.name}")
            continue
        print(f"[{index}/{len(selected)}] downloading {destination.name}")
        s3.download_file(bucket, key, str(destination))

    print(f"Complete: {args.output}")


if __name__ == "__main__":
    main()
