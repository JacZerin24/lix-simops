from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo


def remap_timestamp_to_simulation_date(
    timestamp: datetime,
    *,
    source_base_date: date,
    simulation_base_date: date,
    timezone_name: str,
    local_time_offset_minutes: int = 0,
) -> datetime:
    """Move historical data to a simulation date with an optional local-time shift.

    The source timestamp is first converted to the scenario timezone, then the
    configured local-time offset is applied. The shifted local clock time and day
    offset are mapped onto the simulation date. The returned timestamp is UTC-aware.
    """
    zone = ZoneInfo(timezone_name)
    source_local = timestamp.astimezone(zone) + timedelta(minutes=local_time_offset_minutes)
    day_offset = (source_local.date() - source_base_date).days
    target_date = simulation_base_date + timedelta(days=day_offset)
    target_local = datetime.combine(
        target_date,
        source_local.timetz().replace(tzinfo=None),
        tzinfo=zone,
    )
    return target_local.astimezone(ZoneInfo("UTC"))
