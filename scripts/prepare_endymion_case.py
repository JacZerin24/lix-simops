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
        description="Acquire the raw December 14, 2022 data inputs for the Endymion exercise."
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
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    date = "2022-12-14"
    start = "20:30"
    end = "22:45"

    run(
        [
            PYTHON,
            "scripts/fetch_nexrad.py",
            "--site", "KLIX",
            "--date", date,
            "--start", start,
            "--end", end,
            "--output", "data/raw/nexrad/20221214",
            *(["--list-only"] if args.list_only else []),
        ],
        args.dry_run,
    )

    goes_requests = [
        ("ABI-L2-CMIPC", ["2", "13"], "data/raw/goes/abi-cmi"),
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
            "--cycles", "20", "21", "22",
            "--output", "data/raw/rap/20221214",
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
                "--start", start,
                "--end", end,
                "--output", "data/raw/observations/asos_20221214.csv",
            ],
            args.dry_run,
        )


if __name__ == "__main__":
    main()
