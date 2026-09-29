from __future__ import annotations

import argparse
import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path
import math

from render_common import add_base_map, local_time_label, parse_domain, timestamp_token


def parse_valid(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.strip())
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def number(value: str | None) -> float | None:
    if value is None or value in {"", "M", "T"}:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render historical surface observations.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--start", required=True, help="UTC ISO time, e.g. 2022-12-14T20:30Z")
    parser.add_argument("--end", required=True, help="UTC ISO time")
    parser.add_argument("--interval-minutes", type=int, default=10)
    parser.add_argument("--max-age-minutes", type=int, default=45)
    parser.add_argument("--domain", nargs=4, type=float)
    parser.add_argument("--timezone", default="America/Chicago")
    parser.add_argument("--simulation-date")
    parser.add_argument("--local-time-offset-minutes", type=int, default=0)
    return parser.parse_args()


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def main() -> None:
    args = parse_args()
    import cartopy.crs as ccrs
    import matplotlib.pyplot as plt

    domain = parse_domain(args.domain)
    with args.input.open("r", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    observations = []
    for row in rows:
        valid = parse_valid(row.get("valid", ""))
        lat = number(row.get("lat"))
        lon = number(row.get("lon"))
        if valid is None or lat is None or lon is None:
            continue
        observations.append((valid, row, lat, lon))

    if not observations:
        raise SystemExit("No plottable observations found.")

    start = parse_iso(args.start)
    end = parse_iso(args.end)
    step = timedelta(minutes=args.interval_minutes)
    max_age = timedelta(minutes=args.max_age_minutes)
    args.output.mkdir(parents=True, exist_ok=True)

    valid_time = start
    while valid_time <= end:
        latest = {}
        for timestamp, row, lat, lon in observations:
            if timestamp > valid_time or valid_time - timestamp > max_age:
                continue
            station = (row.get("station") or "").upper()
            if not station:
                continue
            current = latest.get(station)
            if current is None or timestamp > current[0]:
                latest[station] = (timestamp, row, lat, lon)

        fig = plt.figure(figsize=(10, 8), constrained_layout=True)
        ax = plt.axes(projection=ccrs.PlateCarree())
        add_base_map(ax, domain=domain)

        for station, (_, row, lat, lon) in latest.items():
            tmpf = number(row.get("tmpf"))
            dwpf = number(row.get("dwpf"))
            drct = number(row.get("drct"))
            sknt = number(row.get("sknt"))

            ax.scatter(
                lon,
                lat,
                s=20,
                facecolor="white",
                edgecolor="black",
                linewidth=0.5,
                transform=ccrs.PlateCarree(),
                zorder=5,
            )
            ax.text(
                lon + 0.05,
                lat + 0.05,
                station,
                fontsize=8,
                fontweight="bold",
                transform=ccrs.PlateCarree(),
                zorder=6,
            )
            if tmpf is not None:
                ax.text(
                    lon - 0.16,
                    lat + 0.08,
                    f"{tmpf:.0f}",
                    fontsize=8,
                    ha="right",
                    transform=ccrs.PlateCarree(),
                    zorder=6,
                )
            if dwpf is not None:
                ax.text(
                    lon - 0.16,
                    lat - 0.08,
                    f"{dwpf:.0f}",
                    fontsize=8,
                    ha="right",
                    transform=ccrs.PlateCarree(),
                    zorder=6,
                )
            if drct is not None and sknt is not None and sknt >= 1:
                radians = math.radians(drct)
                u = -sknt * math.sin(radians)
                v = -sknt * math.cos(radians)
                ax.barbs(
                    [lon],
                    [lat],
                    [u],
                    [v],
                    length=5,
                    transform=ccrs.PlateCarree(),
                    zorder=5,
                )

        ax.set_title("Surface Observations — Temp / Dewpoint (°F)", loc="left", fontweight="bold")
        ax.set_title(local_time_label(valid_time, args.timezone, args.simulation_date, args.local_time_offset_minutes), loc="right")
        destination = args.output / f"surface_obs_{timestamp_token(valid_time)}.png"
        fig.savefig(destination, dpi=130, bbox_inches="tight")
        plt.close(fig)
        print(destination)
        valid_time += step


if __name__ == "__main__":
    main()
