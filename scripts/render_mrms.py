from __future__ import annotations

import argparse
import gzip
from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
import tempfile

from render_common import add_base_map, local_time_label, parse_domain, timestamp_token


TIME_RE = re.compile(r"_(\d{8})-(\d{6})")


PRODUCTS = {
    "MESH_00.50": {
        "label": "MRMS MESH",
        "units": "in",
        "cmap": "magma",
        "vmin": 0.0,
        "vmax": 3.0,
        "scale": 1.0 / 25.4,
    },
    "MergedAzShear_0-2kmAGL_00.50": {
        "label": "MRMS 0–2 km Azimuthal Shear",
        "units": "s⁻¹",
        "cmap": "coolwarm",
        "vmin": -0.02,
        "vmax": 0.02,
        "scale": 1.0,
    },
    "PrecipRate_00.00": {
        "label": "MRMS Precipitation Rate",
        "units": "in/hr",
        "cmap": "viridis",
        "vmin": 0.0,
        "vmax": 4.0,
        "scale": 1.0 / 25.4,
    },
    "MergedReflectivityAtLowestAltitude_00.50": {
        "label": "MRMS Reflectivity at Lowest Altitude",
        "units": "dBZ",
        "cmap": "turbo",
        "vmin": 0.0,
        "vmax": 75.0,
        "scale": 1.0,
    },
}


def file_time(path: Path) -> datetime:
    match = TIME_RE.search(path.name)
    if not match:
        raise ValueError(path.name)
    return datetime.strptime(
        f"{match.group(1)}{match.group(2)}",
        "%Y%m%d%H%M%S",
    ).replace(tzinfo=timezone.utc)


def open_grib(path: Path):
    import pygrib

    if path.suffix != ".gz":
        return pygrib.open(str(path)), None

    temp = tempfile.NamedTemporaryFile(suffix=".grib2", delete=False)
    temp.close()
    with gzip.open(path, "rb") as source, open(temp.name, "wb") as target:
        shutil.copyfileobj(source, target)
    return pygrib.open(temp.name), Path(temp.name)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render MRMS GRIB2 products for SimOps.")
    parser.add_argument("--input-root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--products", nargs="+", default=list(PRODUCTS))
    parser.add_argument("--domain", nargs=4, type=float)
    parser.add_argument("--timezone", default="America/Chicago")
    parser.add_argument("--simulation-date")
    parser.add_argument("--local-time-offset-minutes", type=int, default=0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    import cartopy.crs as ccrs
    import matplotlib.pyplot as plt
    import numpy as np

    domain = parse_domain(args.domain)

    for product in args.products:
        if product not in PRODUCTS:
            raise SystemExit(f"Unknown MRMS product configuration: {product}")
        config = PRODUCTS[product]
        input_dir = args.input_root / product
        output_dir = args.output_root / product
        output_dir.mkdir(parents=True, exist_ok=True)
        files = sorted(
            path for path in input_dir.glob("*")
            if path.is_file() and (".grib2" in path.name)
        )
        if not files:
            print(f"{product}: no files in {input_dir}")
            continue

        for source in files:
            temp_path = None
            grbs = None
            try:
                timestamp = file_time(source)
                grbs, temp_path = open_grib(source)
                message = grbs.message(1)
                values = np.asarray(message.values, dtype=float) * float(config["scale"])
                lats, lons = message.latlons()
                lons = np.where(lons > 180, lons - 360, lons)

                west, east, south, north = domain
                in_domain = (
                    (lons >= west) & (lons <= east)
                    & (lats >= south) & (lats <= north)
                )
                rows, cols = np.where(in_domain)
                if rows.size == 0:
                    raise ValueError(f"{product}: requested domain does not intersect grid")
                r0, r1 = rows.min(), rows.max() + 1
                c0, c1 = cols.min(), cols.max() + 1
                values = values[r0:r1, c0:c1]
                lats = lats[r0:r1, c0:c1]
                lons = lons[r0:r1, c0:c1]

                fig = plt.figure(figsize=(10, 8), constrained_layout=True)
                ax = plt.axes(projection=ccrs.PlateCarree())
                add_base_map(ax, domain=domain)
                mesh = ax.pcolormesh(
                    lons,
                    lats,
                    np.ma.masked_invalid(values),
                    transform=ccrs.PlateCarree(),
                    shading="auto",
                    cmap=config["cmap"],
                    vmin=config["vmin"],
                    vmax=config["vmax"],
                )
                cb = fig.colorbar(
                    mesh,
                    ax=ax,
                    orientation="horizontal",
                    pad=0.035,
                    shrink=0.82,
                )
                cb.set_label(config["units"])
                ax.set_title(config["label"], loc="left", fontweight="bold")
                ax.set_title(local_time_label(timestamp, args.timezone, args.simulation_date, args.local_time_offset_minutes), loc="right")
                destination = output_dir / f"{product}_{timestamp_token(timestamp)}.png"
                fig.savefig(destination, dpi=130, bbox_inches="tight")
                plt.close(fig)
                print(destination)
            finally:
                if grbs is not None:
                    grbs.close()
                if temp_path is not None:
                    temp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
