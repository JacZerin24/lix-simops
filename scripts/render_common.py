from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

DEFAULT_DOMAIN = (-93.0, -87.0, 27.5, 32.5)


def parse_domain(values):
    if not values:
        return DEFAULT_DOMAIN
    if len(values) != 4:
        raise ValueError("Domain must be west east south north.")
    west, east, south, north = (float(value) for value in values)
    if west >= east or south >= north:
        raise ValueError("Invalid map domain.")
    return west, east, south, north


def display_timestamp(
    timestamp: datetime,
    timezone_name: str = "America/Chicago",
    simulation_date: str | None = None,
    local_time_offset_minutes: int = 0,
) -> datetime:
    zone = ZoneInfo(timezone_name)
    local = timestamp.astimezone(zone) + timedelta(minutes=local_time_offset_minutes)
    if simulation_date:
        target_date = date.fromisoformat(simulation_date)
        local = datetime.combine(
            target_date,
            local.timetz().replace(tzinfo=None),
            tzinfo=zone,
        )
    return local


def local_time_label(
    timestamp: datetime,
    timezone_name: str = "America/Chicago",
    simulation_date: str | None = None,
    local_time_offset_minutes: int = 0,
) -> str:
    local = display_timestamp(
        timestamp,
        timezone_name,
        simulation_date,
        local_time_offset_minutes,
    )
    return local.strftime("%I:%M %p %Z").lstrip("0")


def timestamp_token(timestamp: datetime) -> str:
    return timestamp.strftime("%Y%m%dT%H%M%SZ")


def add_base_map(ax, *, domain) -> None:
    import cartopy.feature as cfeature
    import cartopy.crs as ccrs

    west, east, south, north = domain
    ax.set_extent([west, east, south, north], crs=ccrs.PlateCarree())
    ax.set_facecolor("#eef3f6")
    ax.add_feature(cfeature.LAND.with_scale("50m"), facecolor="#f7f7f4", zorder=0)
    ax.add_feature(cfeature.OCEAN.with_scale("50m"), facecolor="#e8f1f5", zorder=0)
    ax.add_feature(cfeature.LAKES.with_scale("50m"), facecolor="#e8f1f5", edgecolor="#777777", linewidth=0.35, zorder=1)
    ax.add_feature(cfeature.COASTLINE.with_scale("50m"), linewidth=0.75, edgecolor="#222222", zorder=4)
    ax.add_feature(cfeature.BORDERS.with_scale("50m"), linewidth=0.45, edgecolor="#555555", zorder=4)
    ax.add_feature(cfeature.STATES.with_scale("50m"), linewidth=0.65, edgecolor="#333333", zorder=4)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
