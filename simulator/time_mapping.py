from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo


def remap_timestamp_to_simulation_date(
    timestamp: datetime,
    *,
    source_base_date: date,
    simulation_base_date: date,
    timezone_name: str,
) -> datetime:
    """Preserve local clock time while moving historical data to a simulation date.

    The day offset from the source case's first local date is retained, which also
    handles cases that cross local midnight. The returned timestamp is UTC-aware.
    """
    zone = ZoneInfo(timezone_name)
    source_local = timestamp.astimezone(zone)
    day_offset = (source_local.date() - source_base_date).days
    target_date = simulation_base_date + timedelta(days=day_offset)
    target_local = datetime.combine(
        target_date,
        source_local.timetz().replace(tzinfo=None),
        tzinfo=zone,
    )
    return target_local.astimezone(ZoneInfo("UTC"))
