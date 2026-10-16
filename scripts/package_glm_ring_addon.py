"""Package a case-blind 8/12/15-mile GLM map-layer add-on for portable SimOps."""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
from zipfile import ZipFile, ZIP_DEFLATED
from zoneinfo import ZoneInfo

SCENARIO = "mardi-gras-dss-001"
PRODUCT = "glm_flash_density_rings"
TOKEN = re.compile(r"_(\d{8}T\d{6}Z)\.png$")
SOURCE_DATE = date(2021, 5, 12)
SIM_DATE = date(2027, 2, 6)
ZONE = ZoneInfo("America/Chicago")


def shifted_timestamp(source_utc: datetime) -> datetime:
    local = source_utc.astimezone(ZONE) + timedelta(minutes=825)
    day_offset = (local.date() - SOURCE_DATE).days
    target_local = datetime.combine(
        SIM_DATE + timedelta(days=day_offset),
        local.timetz().replace(tzinfo=None), tzinfo=ZONE,
    )
    return target_local.astimezone(timezone.utc)


def package(ring_dir: Path, installer: Path, output: Path) -> dict:
    frames, files, assets = [], [], []
    for path in sorted(ring_dir.glob("glm_flash_density_rings_*.png")):
        match = TOKEN.search(path.name)
        if match is None:
            raise ValueError(f"No source timestamp in {path.name}")
        source = datetime.strptime(match.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        if source.date() != SOURCE_DATE:
            raise ValueError("GLM source date mismatch")
        shifted = shifted_timestamp(source)
        if shifted.date() != SIM_DATE:
            raise ValueError(f"Outside exercise day: {shifted}")
        name = f"{PRODUCT}_{shifted:%Y%m%dT%H%M%SZ}.png"
        asset = f"meso/frames/{PRODUCT}/{name}"
        raw = path.read_bytes()
        if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("GLM rendered asset is not PNG")
        frames.append({"timestamp": shifted.isoformat(), "product": PRODUCT, "asset": asset})
        files.append({"asset": asset, "bytes": len(raw), "sha256": sha256(raw).hexdigest()})
        assets.append((f"data/cache/{SCENARIO}/{asset}", raw))

    if len(frames) < 20:
        raise ValueError(f"Expected at least 20 observed GLM scenes, found {len(frames)}")
    if len({f["timestamp"] for f in frames}) != len(frames):
        raise ValueError("Duplicate GLM ring scene timestamp")
    manifest = {
        "schema_version": 1,
        "scenario_id": SCENARIO,
        "exercise_date": SIM_DATE.isoformat(),
        "product": {
            "id": PRODUCT,
            "label": "GLM Flash Density + Event Range Rings",
            "category": "Satellite / Lightning",
            "description": "Five-minute GLM flash-centroid density with Endymion-start reference rings at the exercise's 8/12/15-mile thresholds. Evaluate the whole active route independently.",
            "units": "",
            "kind": "image",
        },
        "frames": frames,
        "files": files,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=6) as dest:
        dest.writestr("GLM_RINGS_ADDON_MANIFEST.json", json.dumps(manifest, indent=2))
        dest.write(installer, "INSTALL_GLM_RINGS.py")
        dest.writestr(
            "INSTALL_GLM_RINGS.bat",
            '@echo off\r\nsetlocal\r\npushd "%~dp0"\r\n'
            'python INSTALL_GLM_RINGS.py\r\n'
            'if errorlevel 1 echo ERROR: GLM add-on installation failed.\r\n'
            'pause\r\npopd\r\n',
        )
        dest.writestr(
            "README-GLM-RINGS.txt",
            "GLM Event Range Rings Add-on for LIX SimOps\r\n"
            "Weather imagery only; source data are not redistributed.\r\n\r\n"
            "1. Close the SimOps server.\r\n"
            "2. Extract all ZIP contents into the existing LIX-SimOps root folder\r\n"
            "   (same folder as START_SIMOPS_LAN.bat). Merge folders if prompted.\r\n"
            "3. Double-click INSTALL_GLM_RINGS.bat to merge manifest data.\r\n"
            "4. Restart SimOps. Choose Meso > GLM Flash Density and use the\r\n"
            "   8 / 12 / 15 mi Range rings checkbox.\r\n"
            "The range rings refer only to the Endymion start marker.\r\n"
            "The entire active route/staging area must be assessed separately.\r\n",
        )
        for name, data in assets:
            dest.writestr(name, data)
    print(f"Saved {output}: {len(frames)} observed GLM ring maps")
    return manifest


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--rings", type=Path, required=True)
    p.add_argument("--installer", type=Path,
                   default=Path("scripts/install_glm_ring_addon.py"))
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    package(args.rings, args.installer, args.output)


if __name__ == "__main__":
    main()
