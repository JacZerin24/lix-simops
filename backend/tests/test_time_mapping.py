from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from simulator.time_mapping import remap_timestamp_to_simulation_date


def test_historical_case_preserves_local_clock_time() -> None:
    source = datetime(2022, 12, 14, 21, 49, tzinfo=timezone.utc)

    mapped = remap_timestamp_to_simulation_date(
        source,
        source_base_date=date(2022, 12, 14),
        simulation_base_date=date(2027, 2, 6),
        timezone_name="America/Chicago",
    )

    local = mapped.astimezone(ZoneInfo("America/Chicago"))
    assert local.date() == date(2027, 2, 6)
    assert local.hour == 15
    assert local.minute == 49


def test_mapping_preserves_case_day_offset() -> None:
    source = datetime(2022, 12, 15, 7, 15, tzinfo=timezone.utc)

    mapped = remap_timestamp_to_simulation_date(
        source,
        source_base_date=date(2022, 12, 14),
        simulation_base_date=date(2027, 2, 6),
        timezone_name="America/Chicago",
    )

    local = mapped.astimezone(ZoneInfo("America/Chicago"))
    assert local.date() == date(2027, 2, 7)
    assert local.hour == 1
    assert local.minute == 15
