"""Run the official CSPP Geo LightningCast binary for the Endymion ABI pilot.

Requires CSPP Geo LightningCast v1.0beta2 installed separately on an approved
compatible Linux host. No model weights or estimated probabilities are bundled.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("data/raw/goes/lightningcast-inputs"))
    parser.add_argument("--output", type=Path, default=Path("data/raw/lightningcast-native"))
    parser.add_argument("--executable", default="lightningcast")
    args = parser.parse_args()

    binary = shutil.which(args.executable)
    if not binary:
        parser.error(
            "Official CSPP Geo LightningCast executable not found. Install v1.0beta2 "
            "on a compatible approved Linux host, then pass --executable if needed."
        )

    subprocess.run([
        sys.executable, str(Path(__file__).with_name("verify_lightningcast_inputs.py")),
        "--input", str(args.input), "--date", "2021-05-12",
        "--start", "06:30", "--end", "06:45", "--min-complete", "2",
    ], check=True)

    anchors = sorted(args.input.glob(
        "OR_ABI-L1b-RadC-M*C02_G16_s202113206*.nc"
    ))
    if len(anchors) < 2:
        parser.error("At least two C02 anchor scenes are needed.")
    args.output.mkdir(parents=True, exist_ok=True)
    for anchor in anchors:
        command = [
            binary,
            "-o", str(args.output),
            "--netcdf",
            "--ll-bbox", "-93.0", "-87.0", "27.5", "32.5",
            str(anchor),
        ]
        print("Running official CSPP Geo LightningCast on", anchor.name, flush=True)
        subprocess.run(command, check=True)

    print("Finished. Inspect true LightningCast GeoJSON/NetCDF output at", args.output)
    print("Do not ingest into SimOps without probability, geolocation and time QA.")


if __name__ == "__main__":
    main()
