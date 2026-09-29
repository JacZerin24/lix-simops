from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re

from render_common import add_base_map, local_time_label, parse_domain, timestamp_token


START_RE = re.compile(r"_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(\d)")


def file_time(path: Path) -> datetime:
    match = START_RE.search(path.name)
    if not match:
        raise ValueError(path.name)
    base = datetime.strptime(f"{match.group(1)}{match.group(2)}", "%Y%j")
    return base.replace(
        hour=int(match.group(3)),
        minute=int(match.group(4)),
        second=int(match.group(5)),
        microsecond=int(match.group(6)) * 100_000,
        tzinfo=timezone.utc,
    )


def floor_time(value: datetime, minutes: int) -> datetime:
    minute = value.minute - (value.minute % minutes)
    return value.replace(minute=minute, second=0, microsecond=0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render multi-minute GLM flash-centroid density from LCFA files."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--minutes", type=int, default=5)
    parser.add_argument("--resolution", type=float, default=0.05)
    parser.add_argument("--domain", nargs=4, type=float)
    parser.add_argument("--timezone", default="America/Chicago")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    import cartopy.crs as ccrs
    import matplotlib.pyplot as plt
    import numpy as np
    import xarray as xr

    domain = parse_domain(args.domain)
    west, east, south, north = domain
    files = sorted(args.input.glob("*.nc"))
    if not files:
        raise SystemExit(f"No GLM LCFA netCDF files found in {args.input}")

    bins = defaultdict(list)
    for path in files:
        bins[floor_time(file_time(path), args.minutes)].append(path)

    lon_edges = np.arange(west, east + args.resolution, args.resolution)
    lat_edges = np.arange(south, north + args.resolution, args.resolution)
    args.output.mkdir(parents=True, exist_ok=True)

    for bin_start, paths in sorted(bins.items()):
        all_lats = []
        all_lons = []
        for source in paths:
            with xr.open_dataset(source, mask_and_scale=True) as ds:
                if "flash_lat" not in ds or "flash_lon" not in ds:
                    continue
                all_lats.append(ds["flash_lat"].values.ravel())
                all_lons.append(ds["flash_lon"].values.ravel())

        if all_lats:
            lats = np.concatenate(all_lats)
            lons = np.concatenate(all_lons)
            good = np.isfinite(lats) & np.isfinite(lons)
            counts, _, _ = np.histogram2d(
                lats[good],
                lons[good],
                bins=[lat_edges, lon_edges],
            )
        else:
            counts = np.zeros((len(lat_edges) - 1, len(lon_edges) - 1))

        valid = bin_start + timedelta(minutes=args.minutes)
        fig = plt.figure(figsize=(10, 8), constrained_layout=True)
        ax = plt.axes(projection=ccrs.PlateCarree())
        add_base_map(ax, domain=domain)
        masked = np.ma.masked_where(counts <= 0, counts)
        mesh = ax.pcolormesh(
            lon_edges,
            lat_edges,
            masked,
            transform=ccrs.PlateCarree(),
            cmap="plasma",
            shading="flat",
            vmin=1,
        )
        cb = fig.colorbar(mesh, ax=ax, orientation="horizontal", pad=0.035, shrink=0.82)
        cb.set_label(
            f"flash centroids per ~{args.resolution:.2f}° grid cell / {args.minutes} min"
        )
        ax.set_title("GOES-16 GLM Flash Density", loc="left", fontweight="bold")
        ax.set_title(local_time_label(valid, args.timezone), loc="right")
        destination = args.output / f"glm_flash_density_{timestamp_token(valid)}.png"
        fig.savefig(destination, dpi=130, bbox_inches="tight")
        plt.close(fig)
        print(destination)

    print("Note: this product is flash-centroid density, not true GLM Flash Extent Density.")


if __name__ == "__main__":
    main()
