from __future__ import annotations

import argparse
from pathlib import Path

from render_common import add_base_map, local_time_label, parse_domain, timestamp_token


PRODUCTS = {
    "mlcape": {
        "label": "RAP 90-mb Mixed-Layer CAPE",
        "units": "J/kg",
        "cmap": "YlOrRd",
        "vmin": 0.0,
        "vmax": 3000.0,
    },
    "bulk_shear_0_6km": {
        "label": "RAP 0–6 km Bulk Shear",
        "units": "kt",
        "cmap": "viridis",
        "vmin": 0.0,
        "vmax": 80.0,
    },
    "srh_0_1km": {
        "label": "RAP 0–1 km Storm-Relative Helicity",
        "units": "m²/s²",
        "cmap": "plasma",
        "vmin": 0.0,
        "vmax": 500.0,
    },
}


def find_message(grbs, *needles: str):
    wanted = [needle.lower() for needle in needles]
    for index in range(1, grbs.messages + 1):
        message = grbs.message(index)
        text = str(message).lower()
        if all(needle in text for needle in wanted):
            return message
    raise KeyError(" / ".join(needles))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render RAP environmental fields for the Endymion case."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--domain", nargs=4, type=float)
    parser.add_argument("--timezone", default="America/Chicago")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    import cartopy.crs as ccrs
    import matplotlib.pyplot as plt
    import numpy as np
    import pygrib
    from datetime import timezone

    domain = parse_domain(args.domain)
    files = sorted(args.input.glob("*.grib2"))
    if not files:
        raise SystemExit(f"No RAP GRIB2 files found in {args.input}")

    for source in files:
        grbs = pygrib.open(str(source))
        try:
            cape = find_message(
                grbs,
                "convective available potential energy",
                "90-0 mb above ground",
            )
            srh = find_message(
                grbs,
                "storm relative helicity",
                "1000-0 m above ground",
            )
            ushear = find_message(
                grbs,
                "vertical u-component shear",
                "0-6000 m above ground",
            )
            vshear = find_message(
                grbs,
                "vertical v-component shear",
                "0-6000 m above ground",
            )

            timestamp = cape.validDate.replace(tzinfo=timezone.utc)
            lats, lons = cape.latlons()
            lons = np.where(lons > 180, lons - 360, lons)

            fields = {
                "mlcape": np.asarray(cape.values, dtype=float),
                "srh_0_1km": np.asarray(srh.values, dtype=float),
                "bulk_shear_0_6km": (
                    np.hypot(
                        np.asarray(ushear.values, dtype=float),
                        np.asarray(vshear.values, dtype=float),
                    )
                    * 6000.0
                    * 1.94384449
                ),
            }

            for product_id, values in fields.items():
                config = PRODUCTS[product_id]
                output_dir = args.output_root / product_id
                output_dir.mkdir(parents=True, exist_ok=True)

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
                ax.set_title(local_time_label(timestamp, args.timezone), loc="right")
                destination = output_dir / f"{product_id}_{timestamp_token(timestamp)}.png"
                fig.savefig(destination, dpi=130, bbox_inches="tight")
                plt.close(fig)
                print(destination)
        finally:
            grbs.close()


if __name__ == "__main__":
    main()
