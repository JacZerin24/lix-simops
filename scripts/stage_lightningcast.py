from __future__ import annotations

import argparse
from pathlib import Path
import re
import shutil


TIME_RE = re.compile(r"(\d{8})[T_\-]?(\d{6})Z?")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Stage CSPP Geo LightningCast imagery for the Endymion meso cache."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/raw/meso/lightningcast"),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    copied = 0

    for source in sorted(args.input.rglob("*")):
        if not source.is_file() or source.suffix.lower() not in {".png", ".gif", ".jpg", ".jpeg"}:
            continue
        match = TIME_RE.search(source.stem)
        if not match:
            print(f"skip {source.name}: filename lacks UTC YYYYMMDDHHMMSS timestamp")
            continue
        timestamp = f"{match.group(1)}T{match.group(2)}Z"
        destination = args.output / f"lightningcast_{timestamp}{source.suffix.lower()}"
        shutil.copy2(source, destination)
        copied += 1
        print(destination)

    if copied == 0:
        raise SystemExit("No timestamped LightningCast imagery was staged.")


if __name__ == "__main__":
    main()
