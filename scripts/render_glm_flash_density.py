from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re


THRESHOLD_RING_IDS = ("lightning-suspend", "lightning-impending", "lightning-monitor")

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


def ring_config_from_event(path: Path) -> tuple[float, float, list[int]]:
    """Use exercise-owned 8/12/15-mile thresholds, not generic rings."""
    import yaml

    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    marker = data["event"]["radar_marker"]
    by_id = {
        entry["id"]: entry["threshold"]
        for entry in data["operations"]["decision_thresholds"]
    }
    miles = []
    for threshold_id in THRESHOLD_RING_IDS:
        value = by_id[threshold_id]
        match = re.search(r"\b(\d+)\s+miles?\b", value)
        if match is None:
            raise ValueError(f"No numerical mile threshold for {threshold_id}: {value}")
        miles.append(int(match.group(1)))
    if sorted(miles) != miles or len(set(miles)) != 3:
        raise ValueError("Expected ordered, distinct suspension/impending/monitor miles")
    lat, lon = float(marker["lat"]), float(marker["lon"])
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("Invalid Endymion start coordinates")
    return lat, lon, miles


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
    parser.add_argument("--simulation-date")
    parser.add_argument("--local-time-offset-minutes", type=int, default=0)
    parser.add_argument("--event-lat", type=float)
    parser.add_argument("--event-lon", type=float)
    parser.add_argument("--range-rings-mi", nargs="*", type=float, default=[])
    parser.add_argument("--event-config", type=Path,
                        help="Scenario event.yaml: authoritative lightning ring thresholds and start marker")
    parser.add_argument("--ring-output", type=Path,
                        help="Also render a separately selectable GLM product with range rings")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    import cartopy.crs as ccrs
    import matplotlib.pyplot as plt
    import numpy as np
    import xarray as xr

    domain = parse_domain(args.domain)
    west, east, south, north = domain
    if args.event_config is not None:
        args.event_lat, args.event_lon, args.range_rings_mi = ring_config_from_event(
            args.event_config
        )
    if args.ring_output is not None:
        if args.event_lat is None or args.event_lon is None or not args.range_rings_mi:
            raise ValueError("--ring-output requires an event center and mile thresholds")
        args.ring_output.mkdir(parents=True, exist_ok=True)
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
        ax.set_title(
            local_time_label(
                valid, args.timezone, args.simulation_date, args.local_time_offset_minutes
            ),
            loc="right",
        )
        destination = args.output / f"glm_flash_density_{timestamp_token(valid)}.png"
        # First save unadorned observed GLM. The new Meso layer toggle
        # selects a separate rendered frame with identical geographic extent.
        if args.ring_output is not None:
            fig.savefig(destination, dpi=130, bbox_inches="tight")
            print(destination)

        if args.event_lat is not None and args.event_lon is not None and args.range_rings_mi:
            from cartopy.geodesic import Geodesic
            import matplotlib.patheffects as effects

            geod = Geodesic()
            ring_colors = {
                min(args.range_rings_mi): "#e03131",
                max(args.range_rings_mi): "#167f99",
            }
            if len(args.range_rings_mi) >= 3:
                ring_colors[sorted(args.range_rings_mi)[1]] = "#f08c00"
            ax.plot(
                args.event_lon,
                args.event_lat,
                marker="*",
                markersize=11,
                markerfacecolor="#ffffff",
                markeredgecolor="#111111",
                transform=ccrs.PlateCarree(),
                zorder=10,
            )
            ax.text(
                args.event_lon + 0.035,
                args.event_lat - 0.04,
                "Endymion start",
                fontsize=8,
                weight="bold",
                color="#151515",
                path_effects=[effects.withStroke(linewidth=2.4, foreground="white")],
                transform=ccrs.PlateCarree(),
                zorder=11,
            )
            for miles in sorted(args.range_rings_mi):
                ring = geod.circle(
                    lon=args.event_lon,
                    lat=args.event_lat,
                    radius=miles * 1609.344,
                    n_samples=240,
                    endpoint=False,
                )
                color = ring_colors.get(miles, "#167f99")
                ax.plot(
                    ring[:, 0], ring[:, 1],
                    color="white", linewidth=3.8, alpha=0.95,
                    transform=ccrs.PlateCarree(), zorder=8,
                )
                ax.plot(
                    ring[:, 0], ring[:, 1],
                    color=color, linewidth=2.0,
                    transform=ccrs.PlateCarree(), zorder=9,
                )
                # Geodesic circle coordinates provide a true-mile label
                # location. Vary label bearing to avoid stacking all labels.
                label_index = {min(args.range_rings_mi): 30,
                               max(args.range_rings_mi): 60}.get(miles, 45)
                label_lon, label_lat = ring[label_index]
                ax.text(
                    label_lon, label_lat,
                    f"{miles:g} mi",
                    fontsize=8,
                    weight="bold",
                    color=color,
                    ha="center", va="center",
                    bbox={"facecolor": "white", "edgecolor": color,
                          "alpha": 0.95, "boxstyle": "round,pad=0.16"},
                    transform=ccrs.PlateCarree(),
                    zorder=11,
                )
            ax.text(
                0.01, 0.015,
                "Rings reference Endymion start only. Evaluate the active route/staging areas separately.",
                transform=ax.transAxes,
                fontsize=7, color="#1c2932", va="bottom", ha="left",
                bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.90},
                zorder=11,
            )
            ax.set_title("GLM Flash Density · 8 / 12 / 15 mi reference rings",
                         loc="left", fontweight="bold")
        if args.ring_output is not None:
            destination = args.ring_output / f"glm_flash_density_rings_{timestamp_token(valid)}.png"
        fig.savefig(destination, dpi=130, bbox_inches="tight")
        plt.close(fig)
        print(destination)

    print("Note: this product is flash-centroid density, not true GLM Flash Extent Density.")


if __name__ == "__main__":
    main()
