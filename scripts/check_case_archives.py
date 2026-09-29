from __future__ import annotations

import sys

import boto3
from botocore import UNSIGNED
from botocore.config import Config


def client():
    return boto3.client(
        "s3",
        config=Config(signature_version=UNSIGNED, retries={"max_attempts": 3}),
        region_name="us-east-1",
    )


def prefix_exists(s3, bucket: str, prefix: str) -> bool:
    response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1)
    return bool(response.get("Contents"))


def object_exists(s3, bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except Exception:
        return False


def main() -> None:
    s3 = client()
    checks = [
        (
            "KLIX Level II",
            prefix_exists(
                s3,
                "unidata-nexrad-level2",
                "2021/05/12/KLIX/KLIX20210512_06",
            ),
        ),
        (
            "GOES ABI CMIPC",
            prefix_exists(
                s3,
                "noaa-goes16",
                "ABI-L2-CMIPC/2021/132/06/",
            ),
        ),
        (
            "GOES ABI L1b RadC",
            prefix_exists(
                s3,
                "noaa-goes16",
                "ABI-L1b-RadC/2021/132/06/",
            ),
        ),
        (
            "GOES GLM LCFA",
            prefix_exists(
                s3,
                "noaa-goes16",
                "GLM-L2-LCFA/2021/132/06/",
            ),
        ),
        (
            "MRMS MESH",
            prefix_exists(
                s3,
                "noaa-mrms-pds",
                "CONUS/MESH_00.50/20210512/",
            ),
        ),
        (
            "MRMS AzShear",
            prefix_exists(
                s3,
                "noaa-mrms-pds",
                "CONUS/MergedAzShear_0-2kmAGL_00.50/20210512/",
            ),
        ),
        (
            "MRMS PrecipRate",
            prefix_exists(
                s3,
                "noaa-mrms-pds",
                "CONUS/PrecipRate_00.00/20210512/",
            ),
        ),
        (
            "MRMS Lowest Reflectivity",
            prefix_exists(
                s3,
                "noaa-mrms-pds",
                "CONUS/MergedReflectivityAtLowestAltitude_00.50/20210512/",
            ),
        ),
        (
            "RAP 05Z analysis",
            object_exists(
                s3,
                "noaa-rap-pds",
                "rap.20210512/rap.t05z.awp130pgrbf00.grib2",
            ),
        ),
        (
            "RAP 06Z analysis",
            object_exists(
                s3,
                "noaa-rap-pds",
                "rap.20210512/rap.t06z.awp130pgrbf00.grib2",
            ),
        ),
        (
            "RAP 07Z analysis",
            object_exists(
                s3,
                "noaa-rap-pds",
                "rap.20210512/rap.t07z.awp130pgrbf00.grib2",
            ),
        ),
    ]

    failed = []
    for label, ok in checks:
        print(f"{'OK' if ok else 'MISSING':<8} {label}")
        if not ok:
            failed.append(label)

    if failed:
        raise SystemExit("Archive checks failed: " + ", ".join(failed))


if __name__ == "__main__":
    main()
