from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

import boto3
from botocore import UNSIGNED
from botocore.config import Config


BUCKET = "noaa-rap-pds"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download historical RAP analysis GRIB2 files from NOAA Open Data on AWS."
    )
    parser.add_argument("--date", required=True, help="UTC date YYYY-MM-DD")
    parser.add_argument("--cycles", nargs="+", type=int, required=True, help="UTC cycle hours")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--list-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    day = datetime.strptime(args.date, "%Y-%m-%d").date()
    s3 = boto3.client(
        "s3",
        config=Config(signature_version=UNSIGNED),
        region_name="us-east-1",
    )
    args.output.mkdir(parents=True, exist_ok=True)

    found = 0
    for cycle in sorted(set(args.cycles)):
        if not 0 <= cycle <= 23:
            raise SystemExit(f"Invalid RAP cycle: {cycle}")
        key = f"rap.{day:%Y%m%d}/rap.t{cycle:02d}z.awp130pgrbf00.grib2"
        try:
            info = s3.head_object(Bucket=BUCKET, Key=key)
        except Exception as exc:
            print(f"Missing s3://{BUCKET}/{key}: {exc}")
            continue

        found += 1
        size = int(info.get("ContentLength", 0))
        print(f"{size:>12}  s3://{BUCKET}/{key}")
        if args.list_only:
            continue

        destination = args.output / Path(key).name
        if destination.exists() and size and destination.stat().st_size == size:
            print(f"exists: {destination}")
            continue
        s3.download_file(BUCKET, key, str(destination))
        print(f"downloaded: {destination}")

    if found == 0:
        raise SystemExit("No requested RAP analyses were found.")


if __name__ == "__main__":
    main()
