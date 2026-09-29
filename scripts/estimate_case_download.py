from __future__ import annotations

from datetime import datetime, time, timezone
from pathlib import Path
import re

import boto3
from botocore import UNSIGNED
from botocore.config import Config


NEXRAD_RE = re.compile(r"([A-Z0-9]{4})(\d{8})_(\d{6})")
GOES_RE = re.compile(r"_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(\d)")
MRMS_RE = re.compile(r"_(\d{8})-(\d{6})")

DATE = datetime.strptime("2021-05-12", "%Y-%m-%d").date()
START = datetime.combine(DATE, time(6, 0), tzinfo=timezone.utc)
END = datetime.combine(DATE, time(7, 45), tzinfo=timezone.utc)


def client():
    return boto3.client(
        "s3",
        config=Config(signature_version=UNSIGNED),
        region_name="us-east-1",
    )


def nexrad_time(key: str):
    match = NEXRAD_RE.search(Path(key).name)
    if not match:
        return None
    return datetime.strptime(
        f"{match.group(2)}{match.group(3)}",
        "%Y%m%d%H%M%S",
    ).replace(tzinfo=timezone.utc)


def goes_time(key: str):
    match = GOES_RE.search(Path(key).name)
    if not match:
        return None
    base = datetime.strptime(f"{match.group(1)}{match.group(2)}", "%Y%j")
    return base.replace(
        hour=int(match.group(3)),
        minute=int(match.group(4)),
        second=int(match.group(5)),
        microsecond=int(match.group(6)) * 100_000,
        tzinfo=timezone.utc,
    )


def mrms_time(key: str):
    match = MRMS_RE.search(Path(key).name)
    if not match:
        return None
    return datetime.strptime(
        f"{match.group(1)}{match.group(2)}",
        "%Y%m%d%H%M%S",
    ).replace(tzinfo=timezone.utc)


def list_filtered(s3, bucket: str, prefixes: list[str], time_parser, predicate=None):
    count = 0
    size = 0
    for prefix in prefixes:
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                key = item["Key"]
                timestamp = time_parser(key)
                if timestamp is None or not (START <= timestamp <= END):
                    continue
                if predicate and not predicate(key):
                    continue
                count += 1
                size += int(item.get("Size", 0))
    return count, size


def human(value: int) -> str:
    units = ["B", "KiB", "MiB", "GiB", "TiB"]
    amount = float(value)
    for unit in units:
        if amount < 1024 or unit == units[-1]:
            return f"{amount:.2f} {unit}"
        amount /= 1024
    return f"{amount:.2f} TiB"


def main() -> None:
    s3 = client()
    results = []

    count, size = list_filtered(
        s3,
        "unidata-nexrad-level2",
        ["2021/05/12/KLIX/KLIX20210512_06", "2021/05/12/KLIX/KLIX20210512_07"],
        nexrad_time,
        lambda key: "MDM" not in Path(key).name,
    )
    results.append(("KLIX Level II", count, size))

    hours = ["06", "07"]
    count, size = list_filtered(
        s3,
        "noaa-goes16",
        [f"ABI-L2-CMIPC/2021/132/{hour}/" for hour in hours],
        goes_time,
        lambda key: "C13" in key,
    )
    results.append(("GOES ABI CMIP C13", count, size))

    count, size = list_filtered(
        s3,
        "noaa-goes16",
        [f"ABI-L1b-RadC/2021/132/{hour}/" for hour in hours],
        goes_time,
        lambda key: any(channel in key for channel in ("C02", "C05", "C13", "C15")),
    )
    results.append(("GOES ABI L1b LightningCast inputs", count, size))

    count, size = list_filtered(
        s3,
        "noaa-goes16",
        [f"GLM-L2-LCFA/2021/132/{hour}/" for hour in hours],
        goes_time,
    )
    results.append(("GOES GLM LCFA", count, size))

    for product in (
        "MESH_00.50",
        "MergedAzShear_0-2kmAGL_00.50",
        "PrecipRate_00.00",
        "MergedReflectivityAtLowestAltitude_00.50",
    ):
        count, size = list_filtered(
            s3,
            "noaa-mrms-pds",
            [f"CONUS/{product}/20210512/"],
            mrms_time,
        )
        results.append((f"MRMS {product}", count, size))

    rap_size = 0
    rap_count = 0
    for cycle in (5, 6, 7):
        key = f"rap.20210512/rap.t{cycle:02d}z.awp130pgrbf00.grib2"
        info = s3.head_object(Bucket="noaa-rap-pds", Key=key)
        rap_count += 1
        rap_size += int(info.get("ContentLength", 0))
    results.append(("RAP analyses 05/06/07Z", rap_count, rap_size))

    total_count = sum(item[1] for item in results)
    total_size = sum(item[2] for item in results)

    print(f"Source window: {START:%Y-%m-%d %H:%MZ} to {END:%H:%MZ}\n")
    for name, count, size in results:
        print(f"{name:<45} {count:>6} files  {human(size):>12}")
    print("-" * 72)
    print(f"{'TOTAL':<45} {total_count:>6} files  {human(total_size):>12}")


if __name__ == "__main__":
    main()
