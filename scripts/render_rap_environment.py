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


def message_matches(
    message,
    *,
    short_name: str,
    level_type: str,
    top_level: int,
    bottom_level: int,
) -> bool:
    """Match RAP GRIB fields using stable GRIB metadata rather than display strings."""
    try:
        return (
            str(message.shortName) == short_name
            and str(message.typeOfLevel) == level_type
            and int(message.topLevel) == top_level
            and int(message.bottomLevel) == bottom_level
        )
    except (AttributeError, TypeError, ValueError):
        return False


def find_message(
    grbs,
    *,
    short_name: str,
    level_type: str,
    top_level: int,
    bottom_level: int,
):
    for index in range(1, grbs.messages + 1):
        message = grbs.message(index)
        if message_matches(
            message,
            short_name=short_name,
            level_type=level_type,
            top_level=top_level,
            bottom_level=bottom_level,
        ):
            return message
    raise KeyError(
        f"{short_name} {level_type} top={top_level} bottom={bottom_level}"
    )


def subset_to_domain(values, lats, lons, domain):
    import numpy as np

    west, east, south, north = domain
    in_domain = (
        (lons >= west)
        & (lons <= east)
        & (lats >= south)
        & (lats <= north)
    )
    rows, cols = np.where(in_domain)
    if rows.size == 0:
        raise ValueError("Requested LIX domain does not intersect the RAP grid.")
    r0, r1 = rows.min(), rows.max() + 1
    c0, c1 = cols.min(), cols.max() + 1
    return (
        values[r0:r1, c0:c1],
        lats[r0:r1, c0:c1],
        lons[r0:r1, c0:c1],
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render RAP environmental fields for the Endymion case."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--domain", nargs=4, type=float)
    parser.add_argument("--timezone", default="America/Chicago")
    parser.add_argument("--simulation-date")
    parser.add_argument("--local-time-offset-minutes", type=int, default=0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    from datetime import timezone

    import cartopy.crs as ccrs
    import matplotlib.pyplot as plt
    import numpy as np
    import pygrib

    domain = parse_domain(args.domain)
    files = sorted(args.input.glob("*.grib2"))
    if not files:
        raise SystemExit(f"No RAP GRIB2 files found in {args.input}")

    for source in files:
        grbs = pygrib.open(str(source))
        try:
            # Actual RAP GRIB2 metadata was verified against the 20Z 14 Dec 2022
            # analysis in CI. 90-mb MLCAPE is encoded as the 9000–0 Pa
            # pressure-from-ground layer.
            cape = find_message(
                grbs,
                short_name="cape",
                level_type="pressureFromGroundLayer",
                top_level=9000,
                bottom_level=0,
            )
            srh = find_message(
                grbs,
                short_name="hlcy",
                level_type="heightAboveGroundLayer",
                top_level=1000,
                bottom_level=0,
            )
            # RAP stores 0–6 km vertical shear components with top/bottom
            # orientation 0/6000 in these GRIB messages.
            ushear = find_message(
                grbs,
                short_name="vucsh",
                level_type="heightAboveGroundLayer",
                top_level=0,
                bottom_level=6000,
            )
            vshear = find_message(
                grbs,
                short_name="vvcsh",
                level_type="heightAboveGroundLayer",
                top_level=0,
                bottom_level=6000,
            )

            timestamp = cape.validDate.replace(tzinfo=timezone.utc)
            lats, lons = cape.latlons()
            lons = np.where(lons > 180, lons - 360, lons)

            fields = {
                "mlcape": np.asarray(cape.values, dtype=float),
                "srh_0_1km": np.asarray(srh.values, dtype=float),
                # vucsh/vvcsh are s^-1 layer shear components. Multiplying
                # by 6000 m yields vector wind difference in m/s, then kt.
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

                subset_values, subset_lats, subset_lons = subset_to_domain(
                    values,
                    lats,
                    lons,
                    domain,
                )

                fig = plt.figure(figsize=(10, 8), constrained_layout=True)
                ax = plt.axes(projection=ccrs.PlateCarree())
                add_base_map(ax, domain=domain)
                mesh = ax.pcolormesh(
                    subset_lons,
                    subset_lats,
                    np.ma.masked_invalid(subset_values),
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
                destination = output_dir / f"{product_id}_{timestamp_token(timestamp)}.png"
                fig.savefig(destination, dpi=130, bbox_inches="tight")
                plt.close(fig)
                print(destination)
        finally:
            grbs.close()


if __name__ == "__main__":
    main()
