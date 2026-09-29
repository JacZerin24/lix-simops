from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import re

from render_common import add_base_map, local_time_label, parse_domain, timestamp_token


START_RE = re.compile(r"_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(\d)")


def file_time(path: Path) -> datetime:
    match = START_RE.search(path.name)
    if not match:
        raise ValueError(f"Cannot parse GOES start time from {path.name}")
    base = datetime.strptime(f"{match.group(1)}{match.group(2)}", "%Y%j")
    return base.replace(
        hour=int(match.group(3)),
        minute=int(match.group(4)),
        second=int(match.group(5)),
        microsecond=int(match.group(6)) * 100_000,
        tzinfo=timezone.utc,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render GOES ABI CMIP files for SimOps.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--channel", required=True, type=int)
    parser.add_argument("--domain", nargs=4, type=float)
    parser.add_argument("--timezone", default="America/Chicago")
    parser.add_argument("--label")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    import cartopy.crs as ccrs
    import matplotlib.pyplot as plt
    import numpy as np
    import xarray as xr

    domain = parse_domain(args.domain)
    args.output.mkdir(parents=True, exist_ok=True)
    pattern = f"*C{args.channel:02d}*"
    files = sorted(args.input.glob(pattern))
    if not files:
        raise SystemExit(f"No GOES CMIP files matching {pattern} in {args.input}")

    for source in files:
        timestamp = file_time(source)
        with xr.open_dataset(source, mask_and_scale=True) as ds:
            if "CMI" not in ds:
                print(f"Skipping {source.name}: no CMI variable")
                continue
            data = ds["CMI"].squeeze().values
            x = ds["x"].values
            y = ds["y"].values
            projection = ds["goes_imager_projection"].attrs
            height = float(projection["perspective_point_height"])
            lon0 = float(projection["longitude_of_projection_origin"])
            sweep = projection.get("sweep_angle_axis", "x")
            geos = ccrs.Geostationary(
                central_longitude=lon0,
                satellite_height=height,
                sweep_axis=sweep,
            )

            fig = plt.figure(figsize=(10, 8), constrained_layout=True)
            ax = plt.axes(projection=ccrs.PlateCarree())
            add_base_map(ax, domain=domain)

            if args.channel == 2:
                values = np.clip(data, 0.0, 1.2)
                cmap = "Greys_r"
                vmin, vmax = 0.0, 1.0
                default_label = "GOES-16 ABI Channel 2 Visible"
                units = "reflectance"
            elif args.channel == 13:
                values = data - 273.15
                cmap = "turbo_r"
                vmin, vmax = -80.0, 30.0
                default_label = "GOES-16 ABI Channel 13 Infrared"
                units = "°C"
            else:
                values = data
                cmap = "viridis"
                vmin = float(np.nanpercentile(values, 2))
                vmax = float(np.nanpercentile(values, 98))
                default_label = f"GOES-16 ABI Channel {args.channel}"
                units = str(ds["CMI"].attrs.get("units", ""))

            mesh = ax.pcolormesh(
                x * height,
                y * height,
                values,
                transform=geos,
                shading="auto",
                cmap=cmap,
                vmin=vmin,
                vmax=vmax,
            )
            cb = fig.colorbar(mesh, ax=ax, orientation="horizontal", pad=0.035, shrink=0.82)
            cb.set_label(units)
            ax.set_title(args.label or default_label, loc="left", fontweight="bold")
            ax.set_title(local_time_label(timestamp, args.timezone), loc="right")
            destination = args.output / f"goes_c{args.channel:02d}_{timestamp_token(timestamp)}.png"
            fig.savefig(destination, dpi=130, bbox_inches="tight")
            plt.close(fig)
            print(destination)


if __name__ == "__main__":
    main()
