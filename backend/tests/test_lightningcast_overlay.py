"""Unit-level QA for real LightningCast/MRMS source matching and feature validation."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from render_lightningcast_mrms_overlay import (
    lightningcast_file_time, mrms_before, parse_contours,
)


def when(minute: int) -> datetime:
    return datetime(2021, 5, 12, 6, minute, tzinfo=timezone.utc)


def test_lightningcast_source_timestamp_patterns() -> None:
    assert lightningcast_file_time(
        Path("lightningcast_20210512T063115Z.geojson")
    ) == datetime(2021, 5, 12, 6, 31, 15, tzinfo=timezone.utc)
    assert lightningcast_file_time(
        Path("LC_GOES-16_CONUS_20210512-0631.geojson")
    ) == when(31)
    assert lightningcast_file_time(
        Path("LtgCast-RadC_v1r0_g16_s202105120631157_e202105120633541_c202610161620223.json")
    ) == datetime(2021, 5, 12, 6, 31, 15, tzinfo=timezone.utc)


def test_mrms_pairing_never_uses_future_frames() -> None:
    times = [when(30), when(32), when(34)]
    assert mrms_before(times, when(31), timedelta(minutes=4)) == 0
    assert mrms_before(times, when(29), timedelta(minutes=4)) is None
    assert mrms_before(times, when(39), timedelta(minutes=4)) is None
    assert mrms_before(times, when(34), timedelta(minutes=4)) == 2


def test_probability_contour_schema_is_explicit(tmp_path: Path) -> None:
    file = tmp_path / "lightningcast_20210512T063100Z.geojson"
    features = [{
        "type": "Feature",
        "properties": {"PROBABILITY": "50"},
        "geometry": {
            "type": "LineString",
            "coordinates": [[-90.2, 29.9], [-90.1, 30.0]],
        }
    }]
    file.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    result = parse_contours(file, "PROBABILITY")
    assert len(result) == 1 and result[0][0] == 50
    with pytest.raises(ValueError, match="probability property"):
        parse_contours(file, "native_field_not_yet_known")


def test_out_of_range_probabilities_rejected(tmp_path: Path) -> None:
    file = tmp_path / "bad.geojson"
    file.write_text(json.dumps({
        "type": "FeatureCollection", "features": [{
            "properties": {"PROBABILITY": "105"},
            "geometry": {"type": "Point", "coordinates": [-90, 30]},
        }]
    }))
    with pytest.raises(ValueError, match="0..100"):
        parse_contours(file, "PROBABILITY")
