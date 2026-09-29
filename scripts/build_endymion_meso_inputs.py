from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable
DOMAIN = ["-93.0", "-87.0", "27.5", "32.5"]


def run(command: list[str], dry_run: bool) -> None:
    print("$", " ".join(command))
    if not dry_run:
        subprocess.run(command, cwd=ROOT, check=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render all locally reproducible Endymion meso products and build the SimOps cache."
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--skip-cache",
        action="store_true",
        help="Render source images but do not build the final time-remapped meso manifest.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    run(
        [
            PYTHON, "scripts/render_goes.py",
            "--input", "data/raw/goes/abi-cmi",
            "--output", "data/raw/meso/goes_ir",
            "--channel", "13",
            "--domain", *DOMAIN,
            "--simulation-date", "2027-02-06",
            "--local-time-offset-minutes", "825",
        ],
        args.dry_run,
    )
    run(
        [
            PYTHON, "scripts/render_glm_flash_density.py",
            "--input", "data/raw/goes/glm-lcfa",
            "--output", "data/raw/meso/glm_flash_density",
            "--domain", *DOMAIN,
            "--simulation-date", "2027-02-06",
            "--local-time-offset-minutes", "825",
        ],
        args.dry_run,
    )
    run(
        [
            PYTHON, "scripts/render_mrms.py",
            "--input-root", "data/raw/mrms",
            "--output-root", "data/raw/meso/mrms",
            "--domain", *DOMAIN,
            "--simulation-date", "2027-02-06",
            "--local-time-offset-minutes", "825",
        ],
        args.dry_run,
    )
    run(
        [
            PYTHON, "scripts/render_rap_environment.py",
            "--input", "data/raw/rap/20210512",
            "--output-root", "data/raw/meso",
            "--domain", *DOMAIN,
            "--simulation-date", "2027-02-06",
            "--local-time-offset-minutes", "825",
        ],
        args.dry_run,
    )
    run(
        [
            PYTHON, "scripts/render_surface_obs.py",
            "--input", "data/raw/observations/asos_20210512.csv",
            "--output", "data/raw/meso/surface_obs",
            "--start", "2021-05-12T06:00Z",
            "--end", "2021-05-12T07:45Z",
            "--domain", *DOMAIN,
            "--simulation-date", "2027-02-06",
            "--local-time-offset-minutes", "825",
        ],
        args.dry_run,
    )

    if not args.skip_cache:
        run(
            [
                PYTHON, "scripts/build_meso_cache.py",
                "--scenario-id", "mardi-gras-dss-001",
                "--config", "scenarios/mardi-gras/meso-products.yaml",
                "--simulation-date", "2027-02-06",
                "--timezone", "America/Chicago",
                "--local-time-offset-minutes", "825",
            ],
            args.dry_run,
        )


if __name__ == "__main__":
    main()
