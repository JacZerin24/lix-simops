from __future__ import annotations

from datetime import datetime
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


def local_time_label(timestamp: datetime, timezone_name: str = "America/Chicago") -> str:
    local = timestamp.astimezone(ZoneInfo(timezone_name))
    return local.strftime("%I:%M %p %Z").lstrip("0")


def timestamp_token(timestamp: datetime) -> str:
    return timestamp.strftime("%Y%m%dT%H%M%SZ")


def add_base_map(ax, *, domain) -> None:
    import cartopy.feature as cfeature
    import cartopy.crs as ccrs

    west, east, south, north = domain
    ax.set_extent([west, east, south, north], crs=ccrs.PlateCarree())
    ax.add_feature(cfeature.COASTLINE.with_scale("50m"), linewidth=0.7)
    ax.add_feature(cfeature.BORDERS.with_scale("50m"), linewidth=0.5)
    ax.add_feature(cfeature.STATES.with_scale("50m"), linewidth=0.5)
    ax.add_feature(cfeature.LAKES.with_scale("50m"), facecolor="none", edgecolor="0.5", linewidth=0.4)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
