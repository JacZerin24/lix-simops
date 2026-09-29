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


def test_may_2021_case_maps_tornado_to_endymion_decision_window() -> None:
    source = datetime(2021, 5, 12, 7, 5, tzinfo=timezone.utc)

    mapped = remap_timestamp_to_simulation_date(
        source,
        source_base_date=date(2021, 5, 12),
        simulation_base_date=date(2027, 2, 6),
        timezone_name="America/Chicago",
        local_time_offset_minutes=825,
    )

    local = mapped.astimezone(ZoneInfo("America/Chicago"))
    assert local.date() == date(2027, 2, 6)
    assert local.hour == 15
    assert local.minute == 50


def test_rendered_title_uses_exercise_clock() -> None:
    from scripts.render_common import local_time_label

    source = datetime(2021, 5, 12, 7, 5, tzinfo=timezone.utc)
    label = local_time_label(
        source,
        "America/Chicago",
        "2027-02-06",
        825,
    )
    assert label == "3:50 PM CST"
