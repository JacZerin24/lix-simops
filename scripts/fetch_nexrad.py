from __future__ import annotations

import argparse
import re
from datetime import datetime, time, timezone
from pathlib import Path

import boto3
from botocore import UNSIGNED
from botocore.config import Config


DEFAULT_BUCKET = "unidata-nexrad-level2"
TIME_RE = re.compile(r"([A-Z0-9]{4})(\d{8})_(\d{6})")


def parse_clock(value: str) -> time:
    return datetime.strptime(value, "%H:%M").time()


def object_timestamp(key: str) -> datetime | None:
    match = TIME_RE.search(Path(key).name)
    if not match:
        return None
    parsed = datetime.strptime(
        f"{match.group(2)}{match.group(3)}",
        "%Y%m%d%H%M%S",
    )
    return parsed.replace(tzinfo=timezone.utc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download an archived NEXRAD Level II time window from public S3."
    )
    parser.add_argument("--site", required=True, help="Four-character radar ID, e.g. KLIX")
    parser.add_argument("--date", required=True, help="UTC date in YYYY-MM-DD")
    parser.add_argument("--start", default="00:00", help="UTC start time HH:MM")
    parser.add_argument("--end", default="23:59", help="UTC end time HH:MM")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--list-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    site = args.site.upper()
    day = datetime.strptime(args.date, "%Y-%m-%d").date()
    start_dt = datetime.combine(day, parse_clock(args.start), tzinfo=timezone.utc)
    end_dt = datetime.combine(day, parse_clock(args.end), tzinfo=timezone.utc)
    if end_dt < start_dt:
        raise SystemExit("--end must not be earlier than --start")

    prefix = f"{day:%Y/%m/%d}/{site}/{site}{day:%Y%m%d}_"
    args.output.mkdir(parents=True, exist_ok=True)

    s3 = boto3.client(
        "s3",
        config=Config(signature_version=UNSIGNED),
        region_name="us-east-1",
    )

    selected: list[tuple[str, int]] = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=args.bucket, Prefix=prefix):
        for item in page.get("Contents", []):
            key = item["Key"]
            if "MDM" in Path(key).name:
                continue
            timestamp = object_timestamp(key)
            if timestamp is None or timestamp < start_dt or timestamp > end_dt:
                continue
            selected.append((key, int(item.get("Size", 0))))

    selected.sort()
    if not selected:
        raise SystemExit(
            f"No Level II objects found for {site} between "
            f"{start_dt:%Y-%m-%d %H:%MZ} and {end_dt:%H:%MZ}"
        )

    print(f"Found {len(selected)} Level II files in s3://{args.bucket}/{prefix}")
    if args.list_only:
        for key, size in selected:
            print(f"{size:>10}  s3://{args.bucket}/{key}")
        return

    for index, (key, expected_size) in enumerate(selected, start=1):
        destination = args.output / Path(key).name
        if destination.exists() and expected_size and destination.stat().st_size == expected_size:
            print(f"[{index}/{len(selected)}] exists: {destination.name}")
            continue

        print(f"[{index}/{len(selected)}] downloading {destination.name}")
        s3.download_file(args.bucket, key, str(destination))

    print(f"Complete: {args.output}")


if __name__ == "__main__":
    main()
