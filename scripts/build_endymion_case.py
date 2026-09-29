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
        description="Build and validate the full participant-facing Endymion case cache."
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--require-lightningcast", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    run(
        [
            PYTHON,
            "scripts/build_radar_cache.py",
            "--scenario-id", "mardi-gras-dss-001",
            "--input", "data/raw/nexrad/20210512",
            "--site", "KLIX",
            "--products", "REF", "VEL", "CC", "ZDR",
            "--elevations", "0.5", "0.9", "1.3",
            "--range-km", "230",
            "--simulation-date", "2027-02-06",
            "--timezone", "America/Chicago",
            "--local-time-offset-minutes", "825",
        ],
        args.dry_run,
    )

    run(
        [PYTHON, "scripts/build_endymion_meso_inputs.py"],
        args.dry_run,
    )

    validation = [
        PYTHON,
        "scripts/validate_exercise_cache.py",
        "--scenario-id", "mardi-gras-dss-001",
    ]
    if args.require_lightningcast:
        validation.append("--require-lightningcast")
    run(validation, args.dry_run)


if __name__ == "__main__":
    main()
