from __future__ import annotations

import argparse
from pathlib import Path


KEYWORDS = ("cape", "helic", "shear", "hlcy", "ucsh", "vcsh")


def parse_args():
    parser = argparse.ArgumentParser(description="Print candidate RAP GRIB fields used by SimOps.")
    parser.add_argument("file", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    import pygrib

    grbs = pygrib.open(str(args.file))
    found = 0
    try:
        for index in range(1, grbs.messages + 1):
            message = grbs.message(index)
            text = str(message).lower()
            short = str(getattr(message, "shortName", "")).lower()
            name = str(getattr(message, "name", "")).lower()
            if not any(keyword in text or keyword in short or keyword in name for keyword in KEYWORDS):
                continue
            found += 1
            attrs = {}
            for key in (
                "shortName",
                "name",
                "typeOfLevel",
                "level",
                "topLevel",
                "bottomLevel",
                "scaledValueOfFirstFixedSurface",
                "scaledValueOfSecondFixedSurface",
                "units",
            ):
                try:
                    attrs[key] = getattr(message, key)
                except Exception:
                    pass
            print(f"{index}: {attrs}")
            print(f"    {message}")
    finally:
        grbs.close()

    print(f"candidate messages: {found}")


if __name__ == "__main__":
    main()
