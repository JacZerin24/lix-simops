"""Test SAILS preservation and participant-safe sweep-completion times."""

from datetime import datetime, timezone
from types import SimpleNamespace

from simulator.radar.preprocessing import (
    _sweep_completion_time_utc,
    _sweeps_for_elevation,
)
from simulator.time_mapping import remap_timestamp_to_simulation_date


class FakeField:
    def __init__(self, valid):
        self.valid = valid

    def __getitem__(self, index):
        return SimpleNamespace(count=lambda: sum(self.valid[index]))


def make_radar():
    # Four sweeps with two 0.5 degree visits in one Level II volume.
    return SimpleNamespace(
        fixed_angle={"data": [0.5, 0.9, 0.5, 1.3]},
        sweep_start_ray_index={"data": [0, 2, 4, 6]},
        sweep_end_ray_index={"data": [1, 3, 5, 7]},
        fields={"reflectivity": {"data": FakeField([1, 1, 0, 0, 1, 1, 1, 1])}},
        time={
            "units": "seconds since 2021-05-12T05:59:35Z",
            "data": [0, 23, 34, 55, 70, 80, 101, 120],
        },
    )


def test_0p5_supplemental_looks_at_every_usable_low_tilt():
    r = make_radar()
    all_cuts = _sweeps_for_elevation(
        r, 0.5, "reflectivity", include_low_level_revisits=True
    )
    assert all_cuts == [(0, 0.5), (2, 0.5)]
    original = _sweeps_for_elevation(
        r, 0.5, "reflectivity", include_low_level_revisits=False
    )
    assert len(original) == 1
    assert original[0][0] in [0, 2]


def test_standard_tilts_still_have_one_sweep():
    r = make_radar()
    assert len(_sweeps_for_elevation(
        r, 1.3, "reflectivity", include_low_level_revisits=True
    )) == 1


def test_sweep_is_visible_only_after_final_ray():
    r = make_radar()
    assert _sweep_completion_time_utc(r, 0) == datetime(
        2021, 5, 12, 5, 59, 58, tzinfo=timezone.utc
    )
    second = _sweep_completion_time_utc(r, 2)
    assert second == datetime(2021, 5, 12, 6, 0, 55, tzinfo=timezone.utc)

    # Displaced 05:59:58 UTC sweep is a genuine 2:44:58 PM
    # scan, available in the exercise's paused 2:45 PM start.
    mapped = remap_timestamp_to_simulation_date(
        _sweep_completion_time_utc(r, 0),
        source_base_date=datetime(2021, 5, 12).date(),
        simulation_base_date=datetime(2027, 2, 6).date(),
        timezone_name="America/Chicago",
        local_time_offset_minutes=825,
    )
    assert mapped == datetime(2027, 2, 6, 20, 44, 58, tzinfo=timezone.utc)
