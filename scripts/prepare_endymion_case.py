from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable


def run(command: list[str], dry_run: bool) -> None:
    print("$", " ".join(command))
    if not dry_run:
        subprocess.run(command, cwd=ROOT, check=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Acquire the raw May 12, 2021 data inputs for the Endymion exercise."
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--list-only",
        action="store_true",
        help="List matching AWS objects for GOES/MRMS without downloading them.",
    )
    parser.add_argument(
        "--skip-lightningcast-inputs",
        action="store_true",
        help="Skip the ~2 GiB ABI L1b C02/C05/C13/C15 package when only building the non-LightningCast exercise cache.",
    )
    parser.add_argument(
        "--scope",
        choices=["all", "radar", "meso"],
        default="all",
        help="Acquire all inputs, radar-only inputs, or meso-only inputs.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    date = "2021-05-12"
    start = "06:00"
    # Include the preceding full KLIX volumes so Radar has a real
    # pre-simulation image available at the paused 2:45 PM start.
    radar_start = "05:40"
    end = "07:45"

    if args.scope in {"all", "radar"}:
        run(
            [
                PYTHON,
                "scripts/fetch_nexrad.py",
                "--site", "KLIX",
                "--date", date,
                "--start", radar_start,
                "--end", end,
                "--output", "data/raw/nexrad/20210512",
                *(["--list-only"] if args.list_only else []),
            ],
            args.dry_run,
        )

    if args.scope == "radar":
        return

    goes_requests = [
        ("ABI-L2-CMIPC", ["13"], "data/raw/goes/abi-cmi"),
    ]
    if not args.skip_lightningcast_inputs:
        goes_requests.append(
            ("ABI-L1b-RadC", ["2", "5", "13", "15"], "data/raw/goes/lightningcast-inputs")
        )

    for product, channels, output in goes_requests:
        command = [
            PYTHON,
            "scripts/fetch_goes.py",
            "--satellite", "16",
            "--date", date,
            "--start", start,
            "--end", end,
            "--product", product,
            "--channels", *channels,
            "--output", output,
        ]
        if args.list_only:
            command.append("--list-only")
        run(command, args.dry_run)

    command = [
        PYTHON,
        "scripts/fetch_goes.py",
        "--satellite", "16",
        "--date", date,
        "--start", start,
        "--end", end,
        "--product", "GLM-L2-LCFA",
        "--output", "data/raw/goes/glm-lcfa",
    ]
    if args.list_only:
        command.append("--list-only")
    run(command, args.dry_run)

    command = [
        PYTHON,
        "scripts/fetch_mrms.py",
        "--date", date,
        "--start", start,
        "--end", end,
        "--products",
        "MESH_00.50",
        "MergedAzShear_0-2kmAGL_00.50",
        "PrecipRate_00.00",
        "MergedReflectivityAtLowestAltitude_00.50",
        "--output", "data/raw/mrms",
    ]
    if args.list_only:
        command.append("--list-only")
    run(command, args.dry_run)

    run(
        [
            PYTHON,
            "scripts/fetch_rap.py",
            "--date", date,
            "--cycles", "5", "6", "7",
            "--output", "data/raw/rap/20210512",
            *(["--list-only"] if args.list_only else []),
        ],
        args.dry_run,
    )

    if not args.list_only:
        run(
            [
                PYTHON,
                "scripts/fetch_surface_obs.py",
                "--network", "LA_ASOS",
                "--stations", "MSY", "NEW", "BTR", "ASD", "HDC",
                "--date", date,
                "--start", "05:15",
                "--end", end,
                "--output", "data/raw/observations/asos_20210512.csv",
            ],
            args.dry_run,
        )


if __name__ == "__main__":
    main()
