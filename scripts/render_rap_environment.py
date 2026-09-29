from __future__ import annotations

import argparse
from pathlib import Path

from render_common import add_base_map, local_time_label, parse_domain, timestamp_token


KNOTS_PER_MS = 1.94384449

PRODUCTS = {
    "mlcape": {
        "label": "RAP 90-mb Mixed-Layer CAPE",
        "units": "J/kg",
        "cmap": "YlOrRd",
        "vmin": 0.0,
        "vmax": 3000.0,
    },
    "srh_0_1km": {
        "label": "RAP 0–1 km Storm-Relative Helicity",
        "units": "m²/s²",
        "cmap": "plasma",
        "vmin": 0.0,
        "vmax": 500.0,
    },
    "srh_0_3km": {
        "label": "RAP 0–3 km Storm-Relative Helicity",
        "units": "m²/s²",
        "cmap": "plasma",
        "vmin": 0.0,
        "vmax": 750.0,
    },
    "bulk_shear_0_3km": {
        "label": "RAP 0–3 km Bulk Shear + Vectors",
        "units": "kt",
        "cmap": "turbo",
        "vmin": 0.0,
        "vmax": 60.0,
        "vectors": True,
    },
    "bulk_shear_0_6km": {
        "label": "RAP 0–6 km Bulk Shear",
        "units": "kt",
        "cmap": "turbo",
        "vmin": 0.0,
        "vmax": 80.0,
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


def as_array(message):
    import numpy as np

    return np.asarray(np.ma.filled(message.values, np.nan), dtype=float)


def message_kind(message) -> str | None:
    short = str(getattr(message, "shortName", "")).lower()
    name = str(getattr(message, "name", "")).lower()
    parameter = str(getattr(message, "parameterName", "")).lower()
    text = f"{name} {parameter}"

    if short in {"gh", "hgt"} or "geopotential height" in text:
        return "hgt"
    if short in {"u", "ugrd", "10u"} or "u-component of wind" in text or "u component of wind" in text or "u wind" in text:
        return "u"
    if short in {"v", "vgrd", "10v"} or "v-component of wind" in text or "v component of wind" in text or "v wind" in text:
        return "v"
    return None


def find_point_field(grbs, *, kind: str, level_type: str, level: int):
    for index in range(1, grbs.messages + 1):
        message = grbs.message(index)
        try:
            if str(message.typeOfLevel) != level_type or int(message.level) != level:
                continue
        except (AttributeError, TypeError, ValueError):
            continue
        if message_kind(message) == kind:
            return message
    raise KeyError(f"{kind} {level_type} level={level}")


def find_surface_height(grbs):
    for index in range(1, grbs.messages + 1):
        message = grbs.message(index)
        if str(getattr(message, "typeOfLevel", "")) != "surface":
            continue
        if message_kind(message) == "hgt":
            return message
    return None


def pressure_wind_levels(grbs) -> dict[int, dict[str, object]]:
    levels: dict[int, dict[str, object]] = {}
    for index in range(1, grbs.messages + 1):
        message = grbs.message(index)
        level_type = str(getattr(message, "typeOfLevel", ""))
        if not level_type.startswith("isobaric"):
            continue
        kind = message_kind(message)
        if kind not in {"hgt", "u", "v"}:
            continue
        try:
            level = int(message.level)
        except (AttributeError, TypeError, ValueError):
            continue
        levels.setdefault(level, {})[kind] = message

    return {
        level: fields
        for level, fields in levels.items()
        if {"hgt", "u", "v"} <= set(fields)
    }


def interpolate_wind_to_agl(grbs, target_m: float):
    import numpy as np

    u10 = find_point_field(grbs, kind="u", level_type="heightAboveGround", level=10)
    v10 = find_point_field(grbs, kind="v", level_type="heightAboveGround", level=10)
    base_u = as_array(u10)
    base_v = as_array(v10)

    surface_hgt_message = find_surface_height(grbs)
    surface_hgt = (
        as_array(surface_hgt_message)
        if surface_hgt_message is not None
        else np.zeros_like(base_u)
    )

    pressure_levels = pressure_wind_levels(grbs)
    if len(pressure_levels) < 3:
        raise KeyError("Not enough pressure-level HGT/U/V fields to derive bulk shear")

    # Highest pressure first gives a generally increasing height stack.
    ordered = sorted(pressure_levels, reverse=True)
    heights = [np.full_like(base_u, 10.0)]
    u_fields = [base_u]
    v_fields = [base_v]

    for level in ordered:
        fields = pressure_levels[level]
        heights.append(as_array(fields["hgt"]) - surface_hgt)
        u_fields.append(as_array(fields["u"]))
        v_fields.append(as_array(fields["v"]))

    h = np.stack(heights)
    u = np.stack(u_fields)
    v = np.stack(v_fields)
    valid = np.isfinite(h) & np.isfinite(u) & np.isfinite(v)

    above = valid & (h >= target_m)
    below = valid & (h <= target_m)
    has_above = above.any(axis=0)
    has_below = below.any(axis=0)

    upper = np.argmax(above, axis=0)
    lower = h.shape[0] - 1 - np.argmax(below[::-1], axis=0)

    upper = np.where(has_above, upper, h.shape[0] - 1)
    lower = np.where(has_below, lower, 0)

    h0 = np.take_along_axis(h, lower[None, ...], axis=0)[0]
    h1 = np.take_along_axis(h, upper[None, ...], axis=0)[0]
    u0 = np.take_along_axis(u, lower[None, ...], axis=0)[0]
    u1 = np.take_along_axis(u, upper[None, ...], axis=0)[0]
    v0 = np.take_along_axis(v, lower[None, ...], axis=0)[0]
    v1 = np.take_along_axis(v, upper[None, ...], axis=0)[0]

    denom = h1 - h0
    fraction = np.where(np.abs(denom) > 1.0, (target_m - h0) / denom, 0.0)
    fraction = np.clip(fraction, 0.0, 1.0)

    top_u = u0 + fraction * (u1 - u0)
    top_v = v0 + fraction * (v1 - v0)
    top_u = np.where(has_above & has_below, top_u, np.nan)
    top_v = np.where(has_above & has_below, top_v, np.nan)

    du = (top_u - base_u) * KNOTS_PER_MS
    dv = (top_v - base_v) * KNOTS_PER_MS
    magnitude = np.hypot(du, dv)
    return magnitude, du, dv


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
    parser.add_argument(
        "--vector-stride",
        type=int,
        default=5,
        help="Grid stride for 0–3 km bulk-shear vectors; larger values reduce density.",
    )
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
            cape = find_message(
                grbs,
                short_name="cape",
                level_type="pressureFromGroundLayer",
                top_level=9000,
                bottom_level=0,
            )
            srh1 = find_message(
                grbs,
                short_name="hlcy",
                level_type="heightAboveGroundLayer",
                top_level=1000,
                bottom_level=0,
            )
            srh3 = find_message(
                grbs,
                short_name="hlcy",
                level_type="heightAboveGroundLayer",
                top_level=3000,
                bottom_level=0,
            )

            timestamp = cape.validDate.replace(tzinfo=timezone.utc)
            lats, lons = cape.latlons()
            lons = np.where(lons > 180, lons - 360, lons)

            shear3, shear3_u, shear3_v = interpolate_wind_to_agl(grbs, 3000.0)
            shear6, _, _ = interpolate_wind_to_agl(grbs, 6000.0)

            fields = {
                "mlcape": (as_array(cape), None, None),
                "srh_0_1km": (as_array(srh1), None, None),
                "srh_0_3km": (as_array(srh3), None, None),
                "bulk_shear_0_3km": (shear3, shear3_u, shear3_v),
                "bulk_shear_0_6km": (shear6, None, None),
            }

            for product_id, (values, vector_u, vector_v) in fields.items():
                config = PRODUCTS[product_id]
                output_dir = args.output_root / product_id
                output_dir.mkdir(parents=True, exist_ok=True)

                subset_values, subset_lats, subset_lons = subset_to_domain(
                    values,
                    lats,
                    lons,
                    domain,
                )

                finite = subset_values[np.isfinite(subset_values)]
                if finite.size:
                    p05, p50, p95 = np.percentile(finite, [5, 50, 95])
                    print(
                        f"{source.name} {product_id}: "
                        f"p05={p05:.1f} median={p50:.1f} p95={p95:.1f} max={np.nanmax(finite):.1f}"
                    )

                fig = plt.figure(figsize=(10, 8), constrained_layout=True)
                ax = plt.axes(projection=ccrs.PlateCarree())
                add_base_map(ax, domain=domain)

                masked = np.ma.masked_invalid(subset_values)
                mesh = ax.pcolormesh(
                    subset_lons,
                    subset_lats,
                    masked,
                    transform=ccrs.PlateCarree(),
                    shading="auto",
                    cmap=config["cmap"],
                    vmin=config["vmin"],
                    vmax=config["vmax"],
                    zorder=2,
                )

                if product_id.startswith("bulk_shear"):
                    contour_levels = np.arange(10, config["vmax"] + 1, 10)
                    contours = ax.contour(
                        subset_lons,
                        subset_lats,
                        masked,
                        levels=contour_levels,
                        colors="#333333",
                        linewidths=0.55,
                        alpha=0.55,
                        transform=ccrs.PlateCarree(),
                        zorder=3,
                    )
                    ax.clabel(contours, inline=True, fontsize=7, fmt="%d")

                if config.get("vectors") and vector_u is not None and vector_v is not None:
                    sub_u, _, _ = subset_to_domain(vector_u, lats, lons, domain)
                    sub_v, _, _ = subset_to_domain(vector_v, lats, lons, domain)
                    stride = max(1, args.vector_stride)
                    q = ax.quiver(
                        subset_lons[::stride, ::stride],
                        subset_lats[::stride, ::stride],
                        sub_u[::stride, ::stride],
                        sub_v[::stride, ::stride],
                        transform=ccrs.PlateCarree(),
                        color="#161616",
                        scale=280,
                        width=0.0022,
                        headwidth=3.5,
                        headlength=4.2,
                        zorder=5,
                    )
                    ax.quiverkey(
                        q,
                        0.90,
                        1.035,
                        20,
                        "20 kt vector",
                        coordinates="axes",
                        labelpos="E",
                        fontproperties={"size": 8},
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
                ax.set_title(
                    local_time_label(
                        timestamp,
                        args.timezone,
                        args.simulation_date,
                        args.local_time_offset_minutes,
                    ),
                    loc="right",
                )
                destination = output_dir / f"{product_id}_{timestamp_token(timestamp)}.png"
                fig.savefig(destination, dpi=130, bbox_inches="tight", facecolor="white")
                plt.close(fig)
                print(destination)
        finally:
            grbs.close()


if __name__ == "__main__":
    main()
