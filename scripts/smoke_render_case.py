from __future__ import annotations

import subprocess
import sys
from pathlib import Path
import shutil

import boto3
from botocore import UNSIGNED
from botocore.config import Config


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / ".render-smoke"
PYTHON = sys.executable


def s3_client():
    return boto3.client(
        "s3",
        config=Config(signature_version=UNSIGNED, retries={"max_attempts": 3}),
        region_name="us-east-1",
    )


def list_keys(s3, bucket: str, prefix: str, limit: int) -> list[str]:
    response = s3.list_objects_v2(
        Bucket=bucket,
        Prefix=prefix,
        MaxKeys=limit,
    )
    return [item["Key"] for item in response.get("Contents", [])]


def download(s3, bucket: str, key: str, directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / Path(key).name
    s3.download_file(bucket, key, str(destination))
    return destination


def run(command: list[str]) -> None:
    print("$", " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)


def assert_velocity_render_has_data() -> None:
    from PIL import Image

    frames = sorted(
        (ROOT / "data/cache/render-smoke-radar/radar/frames/VEL/0.5").glob("*.png")
    )
    if not frames:
        raise SystemExit("Velocity smoke render produced no frame.")

    image = Image.open(frames[0]).convert("RGB")
    # Exclude the right-side color bar. Real velocity gates are strongly colored;
    # coastlines/grid lines in an otherwise blank plot are grayscale.
    plot = image.crop((0, 0, int(image.width * 0.84), image.height))
    colored = sum(
        1
        for r, g, b in plot.getdata()
        if max(r, g, b) - min(r, g, b) > 20
    )
    ratio = colored / (plot.width * plot.height)
    print(f"Velocity colored-pixel fraction: {ratio:.4f}")
    if ratio < 0.01:
        raise SystemExit("Velocity smoke render appears blank.")


def main() -> None:
    if WORK.exists():
        shutil.rmtree(WORK)
    WORK.mkdir(parents=True)
    s3 = s3_client()

    goes_dir = WORK / "goes"
    goes_keys = list_keys(
        s3,
        "noaa-goes16",
        "ABI-L2-CMIPC/2021/132/07/OR_ABI-L2-CMIPC-M6C13_G16_",
        1,
    )
    if not goes_keys:
        raise SystemExit("No representative GOES C13 file.")
    download(s3, "noaa-goes16", goes_keys[0], goes_dir)

    glm_keys = list_keys(
        s3,
        "noaa-goes16",
        "GLM-L2-LCFA/2021/132/07/",
        20,
    )
    if not glm_keys:
        raise SystemExit("No representative GLM files.")
    glm_dir = WORK / "glm"
    for key in glm_keys:
        download(s3, "noaa-goes16", key, glm_dir)

    mesh_keys = list_keys(
        s3,
        "noaa-mrms-pds",
        "CONUS/MESH_00.50/20210512/",
        1,
    )
    if not mesh_keys:
        raise SystemExit("No representative MRMS MESH file.")
    mrms_dir = WORK / "mrms" / "MESH_00.50"
    download(s3, "noaa-mrms-pds", mesh_keys[0], mrms_dir)

    rap_key = "rap.20210512/rap.t07z.awp130pgrbf00.grib2"
    rap_dir = WORK / "rap"
    download(s3, "noaa-rap-pds", rap_key, rap_dir)

    radar_keys = [
        key
        for key in list_keys(
            s3,
            "unidata-nexrad-level2",
            "2021/05/12/KLIX/KLIX20210512_070",
            100,
        )
        if "MDM" not in Path(key).name
    ]
    if not radar_keys:
        raise SystemExit("No representative KLIX Level II file.")
    radar_dir = WORK / "radar"
    download(s3, "unidata-nexrad-level2", radar_keys[0], radar_dir)

    domain = ["-93", "-87", "27.5", "32.5"]
    run([
        PYTHON, "scripts/build_radar_cache.py",
        "--scenario-id", "render-smoke-radar",
        "--input", str(radar_dir),
        "--site", "KLIX",
        "--products", "REF", "VEL", "CC", "ZDR",
        "--elevations", "0.5",
        "--range-km", "230",
        "--simulation-date", "2027-02-06",
        "--timezone", "America/Chicago",
        "--local-time-offset-minutes", "825",
    ])
    assert_velocity_render_has_data()
    run([
        PYTHON, "scripts/render_goes.py",
        "--input", str(goes_dir),
        "--output", str(WORK / "out" / "goes_ir"),
        "--channel", "13",
        "--domain", *domain,
            "--simulation-date", "2027-02-06",
            "--local-time-offset-minutes", "825",
    ])
    run([
        PYTHON, "scripts/render_glm_flash_density.py",
        "--input", str(glm_dir),
        "--output", str(WORK / "out" / "glm"),
        "--domain", *domain,
            "--simulation-date", "2027-02-06",
            "--local-time-offset-minutes", "825",
    ])
    run([
        PYTHON, "scripts/render_mrms.py",
        "--input-root", str(WORK / "mrms"),
        "--output-root", str(WORK / "out" / "mrms"),
        "--products", "MESH_00.50",
        "--domain", *domain,
            "--simulation-date", "2027-02-06",
            "--local-time-offset-minutes", "825",
    ])
    run([
        PYTHON, "scripts/render_rap_environment.py",
        "--input", str(rap_dir),
        "--output-root", str(WORK / "out" / "rap"),
        "--domain", *domain,
            "--simulation-date", "2027-02-06",
            "--local-time-offset-minutes", "825",
    ])

    pngs = list((WORK / "out").rglob("*.png"))
    radar_pngs = list((ROOT / "data/cache/render-smoke-radar/radar/frames").rglob("*.png"))
    print(f"Rendered {len(radar_pngs)} radar and {len(pngs)} meso smoke-test images.")
    if len(radar_pngs) < 1:
        raise SystemExit("Expected at least one rendered KLIX radar image.")
    if len(pngs) < 8:
        raise SystemExit("Expected IR GOES, GLM, MRMS, and five RAP environment images.")


if __name__ == "__main__":
    main()
